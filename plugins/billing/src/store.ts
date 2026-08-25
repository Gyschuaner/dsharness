import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { parseSessionFile } from './parser.js'
import { estimatePrice, PRICE_NOTE } from './pricing.js'
import type {
	BillingCall,
	BillingDaily,
	BillingIssue,
	BillingModel,
	BillingSummary,
	BillingTotals,
} from './types.js'

const DAY_MS = 24 * 60 * 60 * 1000
const DETAIL_LIMIT = 2_000

export interface BillingStoreOptions {
	homeDir?: string
	sessionRoot?: string
	dbPath?: string
	now?: () => number
}

interface Watermark {
	size: number
	mtimeMs: number
}

interface DbCallRow {
	call_key: string
	session_id: string
	session_title: string
	model: string
	timestamp_ms: number
	turn: number
	step: number
	input_tokens: number
	output_tokens: number
	cache_read_tokens: number
	cache_write_tokens: number
	estimated_cost: number | null
	price_mode: BillingCall['priceMode']
	price_reason: string
}

interface AggregateRow {
	model?: string
	date?: string
	calls: number | null
	priced_calls: number | null
	input_tokens: number | null
	output_tokens: number | null
	cache_read_tokens: number | null
	cache_write_tokens: number | null
	estimated_cost: number | null
}

function numberValue(value: unknown): number {
	return typeof value === 'bigint' ? Number(value) : typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function totalTokens(row: Pick<BillingTotals, 'inputTokens' | 'outputTokens' | 'cacheReadTokens' | 'cacheWriteTokens'>): number {
	return row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheWriteTokens
}

function aggregate(row: AggregateRow): BillingTotals {
	const result: BillingTotals = {
		calls: numberValue(row.calls),
		pricedCalls: numberValue(row.priced_calls),
		unpricedCalls: Math.max(0, numberValue(row.calls) - numberValue(row.priced_calls)),
		inputTokens: numberValue(row.input_tokens),
		outputTokens: numberValue(row.output_tokens),
		cacheReadTokens: numberValue(row.cache_read_tokens),
		cacheWriteTokens: numberValue(row.cache_write_tokens),
		totalTokens: 0,
		estimatedCost: numberValue(row.estimated_cost),
	}
	result.totalTokens = totalTokens(result)
	return result
}

function listLogFiles(root: string): string[] {
	if (!existsSync(root)) return []
	const files: string[] = []
	const visit = (directory: string): void => {
		let entries
		try {
			entries = readdirSync(directory, { withFileTypes: true })
		} catch {
			return
		}
		for (const entry of entries) {
			const filePath = join(directory, entry.name)
			if (entry.isDirectory()) visit(filePath)
			else if (entry.isFile() && (entry.name === 'session.jsonl.zstd' || entry.name === 'session.jsonl')) files.push(filePath)
		}
	}
	visit(root)
	return files.sort()
}

function toCall(row: DbCallRow): BillingCall {
	return {
		callKey: row.call_key,
		sessionId: row.session_id,
		sessionTitle: row.session_title,
		model: row.model,
		timestamp: numberValue(row.timestamp_ms),
		turn: numberValue(row.turn),
		step: numberValue(row.step),
		inputTokens: numberValue(row.input_tokens),
		outputTokens: numberValue(row.output_tokens),
		cacheReadTokens: numberValue(row.cache_read_tokens),
		cacheWriteTokens: numberValue(row.cache_write_tokens),
		estimatedCost: row.estimated_cost === null ? null : numberValue(row.estimated_cost),
		priceMode: row.price_mode,
		priceReason: row.price_reason,
	}
}

export class BillingStore {
	readonly sessionRoot: string
	readonly dbPath: string

	private readonly db: DatabaseSync
	private readonly now: () => number
	private readonly issuesByPath = new Map<string, BillingIssue[]>()
	private syncing: Promise<void> | undefined

	constructor(options: BillingStoreOptions = {}) {
		const homeDir = options.homeDir ?? homedir()
		this.sessionRoot = options.sessionRoot ?? join(homeDir, '.dsh', 'sessions')
		this.dbPath = options.dbPath ?? join(homeDir, '.dsh', 'billing.sqlite')
		this.now = options.now ?? Date.now
		if (this.dbPath !== ':memory:') {
			const directory = dirname(this.dbPath)
			if (!existsSync(directory)) {
				mkdirSync(directory, { recursive: true, mode: 0o700 })
			}
		}
		this.db = new DatabaseSync(this.dbPath)
		this.db.exec('PRAGMA busy_timeout = 3000; PRAGMA journal_mode = WAL;')
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS billing_calls (
				call_key TEXT PRIMARY KEY,
				source_path TEXT NOT NULL,
				session_id TEXT NOT NULL,
				session_title TEXT NOT NULL,
				model TEXT NOT NULL,
				timestamp_ms INTEGER NOT NULL,
				turn INTEGER NOT NULL,
				step INTEGER NOT NULL,
				input_tokens INTEGER NOT NULL,
				output_tokens INTEGER NOT NULL,
				cache_read_tokens INTEGER NOT NULL,
				cache_write_tokens INTEGER NOT NULL,
				estimated_cost REAL,
				price_mode TEXT NOT NULL,
				price_reason TEXT NOT NULL
			);
			CREATE INDEX IF NOT EXISTS billing_calls_time_idx ON billing_calls(timestamp_ms);
			CREATE INDEX IF NOT EXISTS billing_calls_session_idx ON billing_calls(session_id, timestamp_ms);
			CREATE TABLE IF NOT EXISTS billing_watermarks (
				source_path TEXT PRIMARY KEY,
				size INTEGER NOT NULL,
				mtime_ms REAL NOT NULL
			);
		`)
	}

	async sync(): Promise<void> {
		if (this.syncing !== undefined) return this.syncing
		const work = Promise.resolve().then(() => this.syncNow())
		this.syncing = work
		try {
			await work
		} finally {
			if (this.syncing === work) this.syncing = undefined
		}
	}

	private syncNow(): void {
		const seen = new Set<string>()
		for (const path of listLogFiles(this.sessionRoot)) {
			seen.add(path)
			let metadata: Watermark
			try {
				const stats = statSync(path)
				metadata = { size: stats.size, mtimeMs: stats.mtimeMs }
			} catch (error) {
				this.issuesByPath.set(path, [{ path, code: 'LOG_STAT_FAILED', message: error instanceof Error ? error.message : String(error) }])
				continue
			}
			const previous = this.db.prepare('SELECT size, mtime_ms FROM billing_watermarks WHERE source_path = ?').get(path) as { size?: number; mtime_ms?: number } | undefined
			if (previous?.size === metadata.size && previous.mtime_ms === metadata.mtimeMs) continue

			let parsed
			try {
				const bytes = readFileSync(path)
				parsed = parseSessionFile(bytes, path, path.endsWith('.zstd'), metadata.mtimeMs)
			} catch (error) {
				this.issuesByPath.set(path, [{ path, code: 'LOG_READ_FAILED', message: error instanceof Error ? error.message : String(error) }])
				continue
			}
			this.issuesByPath.set(path, parsed.issues)
			const fatal = parsed.issues.some((item) => item.code === 'ZSTD_CORRUPT' || item.code === 'ZSTD_DECOMPRESS_FAILED')
			if (fatal) continue

			this.db.exec('BEGIN')
			try {
				this.db.prepare('DELETE FROM billing_calls WHERE source_path = ?').run(path)
				const insert = this.db.prepare(`
					INSERT OR REPLACE INTO billing_calls (
						call_key, source_path, session_id, session_title, model, timestamp_ms, turn, step,
						input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
						estimated_cost, price_mode, price_reason
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				`)
				for (const call of parsed.calls) {
					insert.run(
						call.callKey, path, call.sessionId, call.sessionTitle, call.model, call.timestamp,
						call.turn, call.step, call.inputTokens, call.outputTokens, call.cacheReadTokens,
						call.cacheWriteTokens, call.estimatedCost, call.priceMode, call.priceReason,
					)
				}
				this.db.prepare(`
					INSERT INTO billing_watermarks (source_path, size, mtime_ms) VALUES (?, ?, ?)
					ON CONFLICT(source_path) DO UPDATE SET size = excluded.size, mtime_ms = excluded.mtime_ms
				`).run(path, metadata.size, metadata.mtimeMs)
				this.db.exec('COMMIT')
			} catch (error) {
				this.db.exec('ROLLBACK')
				this.issuesByPath.set(path, [{ path, code: 'DB_WRITE_FAILED', message: error instanceof Error ? error.message : String(error) }])
			}
		}
		for (const path of this.issuesByPath.keys()) if (!seen.has(path)) this.issuesByPath.delete(path)
		this.repriceStoredCalls()
	}

	private repriceStoredCalls(): void {
		const rows = this.db.prepare(`
			SELECT call_key, model, timestamp_ms, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens
			FROM billing_calls
		`).all() as unknown as Array<{
			call_key: string
			model: string
			timestamp_ms: number
			input_tokens: number
			output_tokens: number
			cache_read_tokens: number
			cache_write_tokens: number
		}>
		if (rows.length === 0) return

		const update = this.db.prepare(`
			UPDATE billing_calls
			SET estimated_cost = ?, price_mode = ?, price_reason = ?
			WHERE call_key = ?
		`)
		this.db.exec('BEGIN')
		try {
			for (const row of rows) {
				const price = estimatePrice(row.model, numberValue(row.timestamp_ms), {
					inputTokens: numberValue(row.input_tokens),
					outputTokens: numberValue(row.output_tokens),
					cacheReadTokens: numberValue(row.cache_read_tokens),
					cacheWriteTokens: numberValue(row.cache_write_tokens),
				})
				update.run(price.estimatedCost, price.mode, price.reason, row.call_key)
			}
			this.db.exec('COMMIT')
		} catch (error) {
			this.db.exec('ROLLBACK')
			throw error
		}
	}

	async summary(request: { from?: number; to?: number; sessionId?: string } = {}): Promise<BillingSummary> {
		await this.sync()
		const to = typeof request.to === 'number' && Number.isFinite(request.to) ? Math.trunc(request.to) : this.now()
		const from = typeof request.from === 'number' && Number.isFinite(request.from) ? Math.trunc(request.from) : to - 7 * DAY_MS
		const sessionFilter = typeof request.sessionId === 'string' && request.sessionId !== '' ? request.sessionId : undefined
		const condition = sessionFilter === undefined ? 'timestamp_ms >= ? AND timestamp_ms < ?' : 'timestamp_ms >= ? AND timestamp_ms < ? AND session_id = ?'
		const values = sessionFilter === undefined ? [from, to] : [from, to, sessionFilter]
		const totals = aggregate(this.db.prepare(`
			SELECT COUNT(*) AS calls,
			COUNT(estimated_cost) AS priced_calls,
			SUM(input_tokens) AS input_tokens,
			SUM(output_tokens) AS output_tokens,
			SUM(cache_read_tokens) AS cache_read_tokens,
			SUM(cache_write_tokens) AS cache_write_tokens,
			SUM(estimated_cost) AS estimated_cost
			FROM billing_calls WHERE ${condition}
		`).get(...values) as unknown as AggregateRow)
		const dailyRows = this.db.prepare(`
			SELECT strftime('%Y-%m-%d', timestamp_ms / 1000, 'unixepoch', '+8 hours') AS date,
			COUNT(*) AS calls, COUNT(estimated_cost) AS priced_calls,
			SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens,
			SUM(cache_read_tokens) AS cache_read_tokens, SUM(cache_write_tokens) AS cache_write_tokens,
			SUM(estimated_cost) AS estimated_cost
			FROM billing_calls WHERE ${condition} GROUP BY date ORDER BY date
		`).all(...values) as unknown as AggregateRow[]
		const daily: BillingDaily[] = dailyRows.map((row) => ({ date: row.date ?? '', ...aggregate(row) }))
		const modelRows = this.db.prepare(`
			SELECT model, COUNT(*) AS calls, COUNT(estimated_cost) AS priced_calls,
			SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens,
			SUM(cache_read_tokens) AS cache_read_tokens, SUM(cache_write_tokens) AS cache_write_tokens,
			SUM(estimated_cost) AS estimated_cost
			FROM billing_calls WHERE ${condition} GROUP BY model ORDER BY SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) DESC
		`).all(...values) as unknown as AggregateRow[]
		const models: BillingModel[] = modelRows.map((row) => ({
			model: row.model ?? 'unknown',
			share: totals.totalTokens === 0 ? 0 : aggregate(row).totalTokens / totals.totalTokens,
			...aggregate(row),
		}))
		const detailRows = this.db.prepare(`
			SELECT call_key, session_id, session_title, model, timestamp_ms, turn, step,
			input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
			estimated_cost, price_mode, price_reason
			FROM billing_calls WHERE ${condition} ORDER BY timestamp_ms DESC, call_key DESC LIMIT ?
		`).all(...values, DETAIL_LIMIT + 1) as unknown as DbCallRow[]
		const truncated = detailRows.length > DETAIL_LIMIT
		const calls = detailRows.slice(0, DETAIL_LIMIT).map(toCall)

		return {
			apiVersion: 1,
			generatedAt: this.now(),
			range: { from, to },
			totals,
			daily,
			models,
			calls,
			issues: [...this.issuesByPath.values()].flat(),
			truncated,
			priceNote: PRICE_NOTE,
		}
	}

	close(): void {
		this.db.close()
	}
}
