import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolvePricing,
  priceTokens,
  isPeakHour,
  resolveModel,
  pricingSignature,
  DEFAULT_WEEKEND_OFFPEAK_SINCE,
} from '../src/pricing'

// 北京时间 2026-08-20（周四）各小时的时间戳
const THU = Date.parse('2026-08-20T00:00:00+08:00')
const HOUR = 3_600_000

test('低谷时段按基础价计费', () => {
  const cfg = resolvePricing()
  // 周四 08:00 北京时间 = 低谷
  const ts = THU + 8 * HOUR
  const r = priceTokens(1000, 500, 2000, ts, 'DeepSeek-V4-Flash-0731-Q8_K_XL', cfg)
  assert.equal(r.priced, true)
  assert.equal(r.peak, false)
  // miss 1000 * 1.5/1M + hit 2000 * 0.05/1M + out 500 * 4.5/1M
  const expected = (1000 * 1.5 + 2000 * 0.05 + 500 * 4.5) / 1e6
  assert.ok(Math.abs(r.cost - expected) < 1e-9)
})

test('高峰时段价格翻倍', () => {
  const cfg = resolvePricing()
  // 周四 10:00 北京时间 = 高峰
  const ts = THU + 10 * HOUR
  const r = priceTokens(1000, 500, 2000, ts, 'ds-flash', cfg)
  assert.equal(r.peak, true)
  const expected = (1000 * 1.5 + 2000 * 0.05 + 500 * 4.5) * 2 / 1e6
  assert.ok(Math.abs(r.cost - expected) < 1e-9)
})

test('高峰边界：12:00 是低谷、13:59 是低谷、14:00 是高峰、18:00 是低谷', () => {
  const cfg = resolvePricing()
  assert.equal(isPeakHour(THU + 11 * HOUR + 59 * 60_000, cfg.weekendOffpeakSince), true)
  assert.equal(isPeakHour(THU + 12 * HOUR, cfg.weekendOffpeakSince), false)
  assert.equal(isPeakHour(THU + 13 * HOUR + 59 * 60_000, cfg.weekendOffpeakSince), false)
  assert.equal(isPeakHour(THU + 14 * HOUR, cfg.weekendOffpeakSince), true)
  assert.equal(isPeakHour(THU + 17 * HOUR + 59 * 60_000, cfg.weekendOffpeakSince), true)
  assert.equal(isPeakHour(THU + 18 * HOUR, cfg.weekendOffpeakSince), false)
})

test('周末全天低谷（2026-08-23 起）', () => {
  const cfg = resolvePricing()
  // 2026-08-22 是周六，但周末低谷 08-23 才生效，周六 10:00 仍是高峰
  const sat = Date.parse('2026-08-22T10:00:00+08:00')
  assert.equal(isPeakHour(sat, cfg.weekendOffpeakSince), true)
  // 2026-08-23 周日 10:00 全天低谷
  const sun = Date.parse('2026-08-23T10:00:00+08:00')
  assert.equal(isPeakHour(sun, cfg.weekendOffpeakSince), false)
  const r = priceTokens(1000, 0, 0, sun, 'ds-flash', cfg)
  assert.equal(r.peak, false)
})

test('别名归一：大小写不敏感回退', () => {
  const cfg = resolvePricing()
  assert.equal(resolveModel('DeepSeek-V4-Flash-0731-Q8_K_XL', cfg), 'ds-flash')
  assert.equal(resolveModel('deepseek-v4-flash-0731-q8_k_xl', cfg), 'ds-flash')
  assert.equal(resolveModel('deepseek-v4-flash', cfg), 'ds-flash')
  assert.equal(resolveModel('Qwen3.8-Flash-Next-FP8', cfg), 'qwen3.8-flash')
  assert.equal(resolveModel('qwen3.8-flash-next-fp8', cfg), 'qwen3.8-flash')
})

test('Qwen3.8 Flash Next 使用百炼华北 2 固定原价且不套用 DeepSeek 高峰倍率', () => {
  const cfg = resolvePricing()
  const r = priceTokens(1_000_000, 1_000_000, 1_000_000, THU + 10 * HOUR, 'Qwen3.8-Flash-Next-FP8', cfg)
  assert.equal(r.priced, true)
  assert.equal(r.peak, false)
  assert.equal(r.hitCost, 0.1)
  assert.equal(r.missCost, 1)
  assert.equal(r.outCost, 3)
  assert.equal(r.cost, 4.1)
})

test('未知模型只计 token 不计价', () => {
  const cfg = resolvePricing()
  const r = priceTokens(1000, 500, 0, THU + 10 * HOUR, 'unknown-model', cfg)
  assert.equal(r.priced, false)
  assert.equal(r.cost, 0)
})

test('用户配置可扩展价目与别名', () => {
  const cfg = resolvePricing(
    { 'my-model': { hit: 1, miss: 2, out: 3 } },
    { 'my-alias': 'my-model' },
  )
  const r = priceTokens(1_000_000, 0, 0, THU + 10 * HOUR, 'my-alias', cfg)
  assert.equal(r.priced, true)
  assert.equal(r.missCost, 2)
  assert.equal(r.peak, false, 'custom models default to fixed pricing unless peakMultiplier is explicit')
})

test('价目签名与对象插入顺序无关', () => {
  const a = resolvePricing({ z: { hit: 1 }, a: { miss: 2 } }, { zed: 'z', alpha: 'a' })
  const b = resolvePricing({ a: { miss: 2 }, z: { hit: 1 } }, { alpha: 'a', zed: 'z' })
  assert.equal(pricingSignature(a), pricingSignature(b))
})

test('自定义 weekendOffpeakSince', () => {
  const cfg = resolvePricing(undefined, undefined, Date.parse('2026-08-01T00:00:00+08:00'))
  const sat = Date.parse('2026-08-01T10:00:00+08:00') // 周六
  assert.equal(isPeakHour(sat, cfg.weekendOffpeakSince), false)
})

test('默认周末生效时间存在', () => {
  assert.ok(DEFAULT_WEEKEND_OFFPEAK_SINCE > 0)
})
