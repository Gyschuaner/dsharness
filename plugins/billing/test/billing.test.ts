import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { zstdCompressSync } from 'node:zlib'
import test from 'node:test'
import { BillingStore } from '../lib/store.js'
import { parseSessionFile } from '../lib/parser.js'
import { estimatePrice, isPeakBeijing } from '../lib/pricing.js'
import { makeHandler } from '../lib/index.js'

function timestamp(value: string): number {
	return Date.parse(value)
}

function sessionLines(turn: number, inputTokens: number, outputTokens: number, cacheReadTokens: number, model = 'DeepSeek-V4-Flash-0731-Q8_K_XL'): string[] {
	const base = timestamp('2026-08-25T10:00:00+08:00') + turn * 1000
	return [
		JSON.stringify({ type: 'session', version: 0, id: 'session-fixture', createdAt: base, cwd: '/tmp/billing-fixture' }),
		JSON.stringify({ type: 'request/context', seq: turn * 4, time: base, data: { provider: 'fixture', model } }),
		JSON.stringify({ type: 'assistant/chunk', seq: turn * 4 + 1, time: base + 1, data: { turn, step: 1, chunk: { type: 'usage', usage: { inputTokens, outputTokens, cacheReadTokens } } } }),
		JSON.stringify({ type: 'assistant/message', seq: turn * 4 + 2, time: base + 2, data: { turn, step: 1, message: { role: 'assistant', source: { kind: 'model', model } }, usage: { inputTokens: inputTokens + 1, outputTokens: outputTokens + 1, cacheReadTokens: cacheReadTokens + 1 } } }),
	]
}

function compressed(lines: string[]): Buffer {
	return zstdCompressSync(Buffer.from(`${lines.join('\n')}\n`, 'utf8'))
}

function request(method: string, body?: unknown) {
	return {
		method,
		async *[Symbol.asyncIterator]() {
			if (body !== undefined) yield Buffer.from(JSON.stringify(body), 'utf8')
		},
	}
}

async function invoke(handler: ReturnType<typeof makeHandler>, method: string, body?: unknown) {
	let status = 0
	let payload = ''
	const response = {
		writeHead(value: number) { status = value },
		end(value: string) { payload = value },
	}
	await handler(request(method, body) as never, response as never)
	return { status, body: JSON.parse(payload) as Record<string, unknown> }
}

test('DeepSeek Flash pricing follows Beijing peak and weekend rules', () => {
	const usage = { inputTokens: 10, outputTokens: 2, cacheReadTokens: 4, cacheWriteTokens: 0 }
	const peakAt = timestamp('2026-08-25T10:00:00+08:00')
	const offpeakAt = timestamp('2026-08-25T13:00:00+08:00')
	const weekendAt = timestamp('2026-08-23T10:00:00+08:00')
	assert.equal(isPeakBeijing(peakAt), true)
	assert.equal(isPeakBeijing(offpeakAt), false)
	assert.equal(isPeakBeijing(weekendAt), false)
	assert.equal(estimatePrice('DeepSeek-V4-Flash-0731-Q8', peakAt, usage).mode, 'peak')
	assert.equal(estimatePrice('DeepSeek-V4-Flash-0731-Q8', offpeakAt, usage).mode, 'offpeak')
	const offpeakPrice = estimatePrice('DeepSeek-V4-Flash-0731-Q8', offpeakAt, usage)
	assert.ok(Math.abs(offpeakPrice.rates.input - 1.008) < 1e-12)
	assert.ok(Math.abs(offpeakPrice.rates.cacheRead - 0.02016) < 1e-12)
	assert.ok(offpeakPrice.rates.cacheRead < offpeakPrice.rates.input)
	assert.equal(estimatePrice('local-unknown', offpeakAt, usage).estimatedCost, null)
})

test('parser folds chunk usage into the final assistant message without double counting', () => {
	const path = '/tmp/billing-fixture/session-fixture/session.jsonl.zstd'
	const first = compressed(sessionLines(1, 10, 2, 4))
	const second = compressed([JSON.stringify({ type: 'assistant/chunk', seq: 20, time: timestamp('2026-08-25T10:05:00+08:00'), data: { turn: 2, step: 1, chunk: { type: 'usage', usage: { inputTokens: 3, outputTokens: 1, cacheReadTokens: 1 } } } })])
	const parsed = parseSessionFile(Buffer.concat([first, second]), path, true)
	assert.equal(parsed.issues.length, 0)
	assert.equal(parsed.calls.length, 2)
	const firstCall = parsed.calls[0]
	assert.ok(firstCall)
	assert.deepEqual({ ...firstCall, estimatedCost: 0 }, {
		callKey: 'session-fixture:1:1',
		sessionId: 'session-fixture',
		sessionTitle: 'billing-fixture',
		model: 'DeepSeek-V4-Flash-0731-Q8_K_XL',
		timestamp: timestamp('2026-08-25T10:00:00+08:00') + 1002,
		turn: 1,
		step: 1,
		inputTokens: 11,
		outputTokens: 3,
		cacheReadTokens: 5,
		cacheWriteTokens: 0,
		estimatedCost: 0,
		priceMode: 'peak',
		priceReason: '北京时间工作日高峰 09:00–12:00 / 14:00–18:00',
	})
	assert.ok(Math.abs(firstCall.estimatedCost! - 0.0000344736) < 1e-12)
})

test('store persists calls and repeated scans do not create duplicates', async (t) => {
	const root = mkdtempSync(join(tmpdir(), 'dsh-billing-'))
	t.after(() => rmSync(root, { recursive: true, force: true }))
	const sessionDir = join(root, 'sessions', 'session-fixture')
	mkdirSync(sessionDir, { recursive: true })
	const logPath = join(sessionDir, 'session.jsonl.zstd')
	writeFileSync(logPath, compressed(sessionLines(1, 10, 2, 4)))
	const store = new BillingStore({
		sessionRoot: join(root, 'sessions'),
		dbPath: join(root, 'billing.sqlite'),
		now: () => timestamp('2026-08-25T20:00:00+08:00'),
	})
	t.after(() => store.close())
	const first = await store.summary({ from: 0, to: timestamp('2026-08-26T00:00:00+08:00') })
	const second = await store.summary({ from: 0, to: timestamp('2026-08-26T00:00:00+08:00') })
	assert.equal(first.totals.calls, 1)
	assert.equal(first.totals.totalTokens, 19)
	assert.equal(first.totals.cacheReadTokens, 5)
	assert.equal(second.totals.calls, 1)
	assert.equal(second.totals.estimatedCost, first.totals.estimatedCost)

	const staleDb = new DatabaseSync(join(root, 'billing.sqlite'))
	staleDb.prepare('UPDATE billing_calls SET estimated_cost = 999').run()
	staleDb.close()
	const repriced = await store.summary({ from: 0, to: timestamp('2026-08-26T00:00:00+08:00') })
	assert.ok(repriced.totals.estimatedCost < 1)
	assert.equal(repriced.totals.estimatedCost, first.totals.estimatedCost)

	writeFileSync(logPath, Buffer.concat([readFileSync(logPath), compressed(sessionLines(2, 4, 1, 2).slice(1))]))
	const afterAppend = await store.summary({ from: 0, to: timestamp('2026-08-26T00:00:00+08:00') })
	assert.equal(afterAppend.totals.calls, 2)
})

test('route returns capability envelope and preserves an unavailable log as a visible error', async () => {
	const store = { async summary() { throw new Error('fixture log unavailable') } }
	const handler = makeHandler({ store })
	const capabilities = await invoke(handler, 'POST', { op: 'capabilities' })
	assert.equal(capabilities.status, 200)
	assert.deepEqual(capabilities.body.value, {
		apiVersion: 1,
		features: ['session-badge', 'conversation-view', 'settings-section', 'sqlite', 'incremental-watermark'],
	})
	const failed = await invoke(handler, 'POST', { op: 'summary' })
	assert.equal(failed.status, 500)
	assert.equal((failed.body.error as Record<string, unknown>).code, 'INTERNAL_ERROR')
	assert.equal((await invoke(handler, 'GET')).status, 405)
})
