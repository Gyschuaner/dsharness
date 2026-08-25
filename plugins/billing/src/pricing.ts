import type { PriceMode, TokenBuckets } from './types.js'

export const PRICE_NOTE = '估算价，非真实账单；按北京时间峰谷价计算。'

export const LOW_RATES = Object.freeze({
	input: 0.05,
	cacheRead: 1.5,
	cacheWrite: 0.05,
	output: 4.5,
})

export const PEAK_MULTIPLIER = 2

export interface PriceResult {
	estimatedCost: number | null
	mode: PriceMode
	reason: string
	rates: {
		input: number
		cacheRead: number
		cacheWrite: number
		output: number
	}
}

interface BeijingDateParts {
	year: number
	month: number
	day: number
	hour: number
	weekday: number
}

const BEIJING_DATE = new Intl.DateTimeFormat('en-US', {
	timeZone: 'Asia/Shanghai',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	hourCycle: 'h23',
	weekday: 'short',
})

function beijingDateParts(timestamp: number): BeijingDateParts {
	const fields = new Map(BEIJING_DATE.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]))
	const weekday = fields.get('weekday')
	return {
		year: Number(fields.get('year')),
		month: Number(fields.get('month')),
		day: Number(fields.get('day')),
		hour: Number(fields.get('hour')),
		weekday: weekday === 'Sun' ? 0 : weekday === 'Sat' ? 6 : 1,
	}
}

export function beijingDate(timestamp: number): string {
	const parts = beijingDateParts(timestamp)
	return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

export function isPeakBeijing(timestamp: number): boolean {
	const parts = beijingDateParts(timestamp)
	if (parts.weekday === 0 || parts.weekday === 6) return false
	return (parts.hour >= 9 && parts.hour < 12) || (parts.hour >= 14 && parts.hour < 18)
}

function normalizedModel(model: string): string {
	return model.trim().toLowerCase().replaceAll('_', '-').replaceAll(' ', '-')
}

export function hasBillingPrice(model: string): boolean {
	const value = normalizedModel(model)
	return value.startsWith('deepseek-v4-flash') || value.startsWith('deepseek-flash')
}

export function estimatePrice(model: string, timestamp: number, usage: TokenBuckets): PriceResult {
	if (!hasBillingPrice(model)) {
		return {
			estimatedCost: null,
			mode: 'unknown',
			reason: '未知模型：仅展示 Token，不计入估算费用。',
			rates: LOW_RATES,
		}
	}

	const peak = isPeakBeijing(timestamp)
	const multiplier = peak ? PEAK_MULTIPLIER : 1
	const rates = {
		input: LOW_RATES.input * multiplier,
		cacheRead: LOW_RATES.cacheRead * multiplier,
		cacheWrite: LOW_RATES.cacheWrite * multiplier,
		output: LOW_RATES.output * multiplier,
	}
	const estimatedCost = (
		usage.inputTokens * rates.input
		+ usage.cacheReadTokens * rates.cacheRead
		+ usage.cacheWriteTokens * rates.cacheWrite
		+ usage.outputTokens * rates.output
	) / 1_000_000

	return {
		estimatedCost,
		mode: peak ? 'peak' : 'offpeak',
		reason: peak ? '北京时间工作日高峰 09:00–12:00 / 14:00–18:00' : '北京时间低谷（含周末）',
		rates,
	}
}
