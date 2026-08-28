import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { splitZstdFrames, readSessionLog, foldSessionFile } from '../src/fold'
import { openStore } from '../src/store'
import { resolvePricing } from '../src/pricing'

/** 把 JSONL 文本压缩成独立 zstd 帧。 */
function frame(text: string): Buffer {
  return zlib.zstdCompressSync(Buffer.from(text, 'utf8'))
}

test('splitZstdFrames 切分多帧并容忍尾部残缺', () => {
  const f1 = frame('{"type":"session","id":"s1"}\n')
  const f2 = frame('{"type":"assistant/message","seq":1}\n')
  const joined = Buffer.concat([f1, f2])
  const frames = splitZstdFrames(joined)
  assert.equal(frames.length, 2)
  // 尾部残缺：附加半个帧头
  const torn = Buffer.concat([joined, f1.subarray(0, 6)])
  assert.equal(splitZstdFrames(torn).length, 2)
})

test('readSessionLog 解析 header 与事件', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-fold-'))
  const logPath = path.join(dir, 'session.jsonl.zstd')
  const text = [
    '{"type":"session","id":"sess-1","title":"t"}',
    '{"type":"request/header","seq":10,"time":1000,"data":{"header":{"config":{"provider":"dpgateway","model":"DeepSeek-V4-Flash-0731-Q8_K_XL"}}}}',
    '{"type":"assistant/chunk","seq":20,"time":2000,"data":{"turn":1,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":100,"outputTokens":50,"cacheReadTokens":200}}}}',
  ].join('\n') + '\n'
  fs.writeFileSync(logPath, frame(text))

  const { header, events, nextOffset } = readSessionLog(logPath)
  assert.equal(header?.id, 'sess-1')
  assert.equal(events.length, 2)
  assert.equal(nextOffset, fs.statSync(logPath).size)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('foldSessionFile 折叠 usage 块入库并计费', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-fold-'))
  const logPath = path.join(dir, 'session.jsonl.zstd')
  const ts = Date.parse('2026-08-20T08:00:00+08:00') // 周四低谷
  const text = [
    '{"type":"session","id":"sess-2","title":"t2"}',
    `{"type":"request/header","seq":1,"time":${ts},"data":{"header":{"config":{"provider":"dpgateway","model":"DeepSeek-V4-Flash-0731-Q8_K_XL"}}}}`,
    `{"type":"assistant/chunk","seq":2,"time":${ts},"data":{"turn":1,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":1000,"outputTokens":500,"cacheReadTokens":2000}}}}`,
  ].join('\n') + '\n'
  fs.writeFileSync(logPath, frame(text))

  const dbPath = path.join(dir, 'test.db')
  const store = openStore(dbPath)
  const pricing = resolvePricing()

  const r1 = foldSessionFile(store, pricing, logPath)
  assert.equal(r1.imported, 1)
  assert.equal(r1.skippedUnchanged, false)

  const row = store.db.prepare('SELECT * FROM usage_requests').get() as Record<string, unknown>
  assert.equal(row.session_id, 'sess-2')
  assert.equal(row.model, 'ds-flash')
  assert.equal(row.input_tokens, 1000)
  assert.equal(row.cache_read_tokens, 2000)
  // 低谷价：(1000*1.5 + 2000*0.05 + 500*4.5) / 1e6 元
  const expectedNano = Math.round((1000 * 1.5 + 2000 * 0.05 + 500 * 4.5) * 1000)
  assert.equal(row.cost_nano, expectedNano)

  // 幂等：mtime 不变时重复折叠跳过
  const r2 = foldSessionFile(store, pricing, logPath)
  assert.equal(r2.imported, 0)
  assert.equal(r2.skippedUnchanged, true)
  assert.equal((store.db.prepare('SELECT COUNT(*) AS n FROM usage_requests').get() as { n: number }).n, 1)

  // 追加新帧后增量折叠
  const append = `{"type":"assistant/chunk","seq":5,"time":${ts},"data":{"turn":2,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":10,"outputTokens":20,"cacheReadTokens":0}}}}\n`
  fs.appendFileSync(logPath, frame(append))
  const r3 = foldSessionFile(store, pricing, logPath)
  assert.equal(r3.imported, 1)
  assert.equal((store.db.prepare('SELECT COUNT(*) AS n FROM usage_requests').get() as { n: number }).n, 2)

  // 会话聚合查询
  const s = store.sessionSummary('sess-2')
  assert.equal(s.requests, 2)
  assert.equal(s.inputTokens, 1010)

  store.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

test('foldSessionFile 跳过全零 usage 与未知模型不计价', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-fold-'))
  const logPath = path.join(dir, 'session.jsonl.zstd')
  const ts = Date.parse('2026-08-20T08:00:00+08:00')
  const text = [
    '{"type":"session","id":"sess-3"}',
    `{"type":"request/header","seq":1,"time":${ts},"data":{"header":{"config":{"provider":"p","model":"unknown-xyz"}}}}`,
    `{"type":"assistant/chunk","seq":2,"time":${ts},"data":{"turn":1,"step":1,"chunk":{"type":"usage","usage":{"inputTokens":0,"outputTokens":0}}}}`,
    `{"type":"assistant/chunk","seq":3,"time":${ts},"data":{"turn":1,"step":2,"chunk":{"type":"usage","usage":{"inputTokens":100,"outputTokens":0,"cacheReadTokens":0}}}}`,
  ].join('\n') + '\n'
  fs.writeFileSync(logPath, frame(text))

  const store = openStore(path.join(dir, 'test.db'))
  const pricing = resolvePricing()
  const r = foldSessionFile(store, pricing, logPath)
  assert.equal(r.imported, 1) // 只有 step2 入库，step1 全零跳过
  const row = store.db.prepare('SELECT * FROM usage_requests').get() as Record<string, unknown>
  assert.equal(row.cost_nano, 0) // 未知模型不计价
  store.close()
  fs.rmSync(dir, { recursive: true, force: true })
})
