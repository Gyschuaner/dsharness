/**
 * dsh-shadow-billing — SQLite 存储（DSH-032）。
 *
 * node:sqlite（Node 22+ 内置）三张表：
 * - usage_requests：单次调用事实（record_id 幂等去重）；
 * - usage_daily_rollups：按 (day, model) 预聚合，页面查询秒开；
 * - fold_watermarks：会话日志折叠水位（字节 + seq + mtime）。
 * 成本以整数纳元（cost_nano）存储，避免浮点误差。
 */

import { createRequire } from 'node:module';

// node:sqlite 首次 require 会打 ExperimentalWarning，这里过滤掉（DSH 自身也这么做）。
let cachedDatabaseSync: typeof import('node:sqlite').DatabaseSync | null = null;
function databaseSync(): typeof import('node:sqlite').DatabaseSync {
	if (cachedDatabaseSync !== null) return cachedDatabaseSync;
	const require = createRequire(import.meta.url);
	const original = process.emitWarning;
	process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
		const message = typeof warning === 'string' ? warning : warning.message;
		if (message.includes('SQLite is an experimental feature')) return;
		return (original as (...args: unknown[]) => void).call(process, warning, ...rest);
	}) as typeof process.emitWarning;
	try {
		cachedDatabaseSync = require('node:sqlite').DatabaseSync as typeof import('node:sqlite').DatabaseSync;
	} finally {
		process.emitWarning = original;
	}
	return cachedDatabaseSync;
}

export interface UsageRecord {
	recordId: string;
	sessionId: string;
	model: string;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	costNano: number;
	day: string;
	createdAt: number;
}

export interface Watermark {
	sessionId: string;
	logPath: string;
	lastSeq: number;
	fileMtimeMs: number;
	title: string | null;
	lastOffset: number;
	updatedAt: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS usage_requests (
  record_id           TEXT PRIMARY KEY,
  session_id          TEXT NOT NULL,
  model               TEXT NOT NULL,
  input_tokens        INTEGER NOT NULL DEFAULT 0,
  output_tokens       INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens   INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens  INTEGER NOT NULL DEFAULT 0,
  cost_nano           INTEGER NOT NULL DEFAULT 0,
  day                 TEXT NOT NULL,
  created_at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_day ON usage_requests (day);
CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_requests (created_at);
CREATE INDEX IF NOT EXISTS idx_usage_session ON usage_requests (session_id);
CREATE INDEX IF NOT EXISTS idx_usage_model ON usage_requests (model, day);

CREATE TABLE IF NOT EXISTS fold_watermarks (
  session_id    TEXT PRIMARY KEY,
  log_path      TEXT NOT NULL,
  last_seq      INTEGER NOT NULL,
  file_mtime_ms INTEGER NOT NULL,
  title         TEXT,
  last_offset   INTEGER NOT NULL DEFAULT 0,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_daily_rollups (
  day               TEXT NOT NULL,
  model             TEXT NOT NULL,
  requests          INTEGER NOT NULL DEFAULT 0,
  input_tokens      INTEGER NOT NULL DEFAULT 0,
  output_tokens     INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  cost_nano         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, model)
);
`;

export interface Store {
	db: import('node:sqlite').DatabaseSync;
	insertUsage(record: UsageRecord): boolean;
	putWatermark(watermark: Watermark): void;
	getWatermark(sessionId: string): Watermark | null;
	summarySince(dayFloor: string): { requests: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; costNano: number };
	byModelSince(dayFloor: string): Array<{ model: string; requests: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; costNano: number }>;
	dailySince(dayFloor: string): Array<{ day: string; requests: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; costNano: number }>;
	requestsPage(dayFloor: string, offset: number, limit: number): { rows: Array<Record<string, unknown>>; total: number };
	sessionSummary(sessionId: string): { requests: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; costNano: number; firstAt: number | null; lastAt: number | null };
	close(): void;
}

/** 打开（或创建）数据库并初始化 schema。 */
export function openStore(dbPath: string): Store {
	const DatabaseSync = databaseSync();
	const db = new DatabaseSync(dbPath);
	db.exec(SCHEMA);

	const insertUsageStmt = db.prepare(`
		INSERT OR IGNORE INTO usage_requests
		  (record_id, session_id, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_nano, day, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`);
	const upsertRollupStmt = db.prepare(`
		INSERT INTO usage_daily_rollups
		  (day, model, requests, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_nano)
		VALUES (?, ?, 1, ?, ?, ?, ?, ?)
		ON CONFLICT(day, model) DO UPDATE SET
		  requests = requests + 1,
		  input_tokens = input_tokens + excluded.input_tokens,
		  output_tokens = output_tokens + excluded.output_tokens,
		  cache_read_tokens = cache_read_tokens + excluded.cache_read_tokens,
		  cache_write_tokens = cache_write_tokens + excluded.cache_write_tokens,
		  cost_nano = cost_nano + excluded.cost_nano
	`);

	const store: Store = {
		db,

		insertUsage(record: UsageRecord): boolean {
			const result = insertUsageStmt.run(
				record.recordId,
				record.sessionId,
				record.model,
				record.inputTokens,
				record.outputTokens,
				record.cacheReadTokens,
				record.cacheWriteTokens,
				record.costNano,
				record.day,
				record.createdAt,
			);
			if (result.changes !== 1) return false;
			upsertRollupStmt.run(
				record.day,
				record.model,
				record.inputTokens,
				record.outputTokens,
				record.cacheReadTokens,
				record.cacheWriteTokens,
				record.costNano,
			);
			return true;
		},

		putWatermark(watermark: Watermark): void {
			db.prepare(`
				INSERT INTO fold_watermarks (session_id, log_path, last_seq, file_mtime_ms, title, last_offset, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(session_id) DO UPDATE SET
				  log_path = excluded.log_path,
				  last_seq = excluded.last_seq,
				  file_mtime_ms = excluded.file_mtime_ms,
				  title = excluded.title,
				  last_offset = excluded.last_offset,
				  updated_at = excluded.updated_at
			`).run(
				watermark.sessionId,
				watermark.logPath,
				watermark.lastSeq,
				watermark.fileMtimeMs,
				watermark.title,
				watermark.lastOffset,
				watermark.updatedAt,
			);
		},

		getWatermark(sessionId: string): Watermark | null {
			const row = db.prepare('SELECT * FROM fold_watermarks WHERE session_id = ?').get(sessionId);
			if (row === undefined) return null;
			const r = row as Record<string, unknown>;
			return {
				sessionId: String(r.session_id),
				logPath: String(r.log_path),
				lastSeq: Number(r.last_seq),
				fileMtimeMs: Number(r.file_mtime_ms),
				title: r.title === null ? null : String(r.title),
				lastOffset: Number(r.last_offset),
				updatedAt: Number(r.updated_at),
			};
		},

		summarySince(dayFloor: string) {
			const row = db.prepare(`
				SELECT
				  COALESCE(SUM(requests), 0) AS requests,
				  COALESCE(SUM(input_tokens), 0) AS input_tokens,
				  COALESCE(SUM(output_tokens), 0) AS output_tokens,
				  COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
				  COALESCE(SUM(cost_nano), 0) AS cost_nano
				FROM usage_daily_rollups WHERE day >= ?
			`).get(dayFloor) as Record<string, unknown>;
			return {
				requests: Number(row.requests),
				inputTokens: Number(row.input_tokens),
				outputTokens: Number(row.output_tokens),
				cacheReadTokens: Number(row.cache_read_tokens),
				costNano: Number(row.cost_nano),
			};
		},

		byModelSince(dayFloor: string) {
			const rows = db.prepare(`
				SELECT model,
				  SUM(requests) AS requests,
				  SUM(input_tokens) AS input_tokens,
				  SUM(output_tokens) AS output_tokens,
				  SUM(cache_read_tokens) AS cache_read_tokens,
				  SUM(cost_nano) AS cost_nano
				FROM usage_daily_rollups WHERE day >= ?
				GROUP BY model ORDER BY cost_nano DESC
			`).all(dayFloor) as Array<Record<string, unknown>>;
			return rows.map((r) => ({
				model: String(r.model),
				requests: Number(r.requests),
				inputTokens: Number(r.input_tokens),
				outputTokens: Number(r.output_tokens),
				cacheReadTokens: Number(r.cache_read_tokens),
				costNano: Number(r.cost_nano),
			}));
		},

		dailySince(dayFloor: string) {
			const rows = db.prepare(`
				SELECT day,
				  SUM(requests) AS requests,
				  SUM(input_tokens) AS input_tokens,
				  SUM(output_tokens) AS output_tokens,
				  SUM(cache_read_tokens) AS cache_read_tokens,
				  SUM(cost_nano) AS cost_nano
				FROM usage_daily_rollups WHERE day >= ?
				GROUP BY day ORDER BY day ASC
			`).all(dayFloor) as Array<Record<string, unknown>>;
			return rows.map((r) => ({
				day: String(r.day),
				requests: Number(r.requests),
				inputTokens: Number(r.input_tokens),
				outputTokens: Number(r.output_tokens),
				cacheReadTokens: Number(r.cache_read_tokens),
				costNano: Number(r.cost_nano),
			}));
		},

		requestsPage(dayFloor: string, offset: number, limit: number) {
			const totalRow = db.prepare('SELECT COUNT(*) AS n FROM usage_requests WHERE day >= ?').get(dayFloor) as Record<string, unknown>;
			const rows = db.prepare(`
				SELECT record_id, session_id, model,
				  input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
				  cost_nano, day, created_at
				FROM usage_requests WHERE day >= ?
				ORDER BY created_at DESC LIMIT ? OFFSET ?
			`).all(dayFloor, limit, offset) as Array<Record<string, unknown>>;
			return { rows, total: Number(totalRow.n) };
		},

		sessionSummary(sessionId: string) {
			const row = db.prepare(`
				SELECT
				  COUNT(*) AS requests,
				  COALESCE(SUM(input_tokens), 0) AS input_tokens,
				  COALESCE(SUM(output_tokens), 0) AS output_tokens,
				  COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
				  COALESCE(SUM(cost_nano), 0) AS cost_nano,
				  MIN(created_at) AS first_at,
				  MAX(created_at) AS last_at
				FROM usage_requests WHERE session_id = ?
			`).get(sessionId) as Record<string, unknown>;
			return {
				requests: Number(row.requests),
				inputTokens: Number(row.input_tokens),
				outputTokens: Number(row.output_tokens),
				cacheReadTokens: Number(row.cache_read_tokens),
				costNano: Number(row.cost_nano),
				firstAt: row.first_at === null ? null : Number(row.first_at),
				lastAt: row.last_at === null ? null : Number(row.last_at),
			};
		},

		close(): void {
			db.close();
		},
	};
	return store;
}

/** 本地日期键（YYYY-MM-DD，按本地时区）。 */
export function dayOf(ts: number): string {
	const d = new Date(ts);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

/** N 天前的日期键（含今天，即 dayFloor = 今天往前 N-1 天）。 */
export function dayFloor(days: number): string {
	if (days <= 0) return '0000-00-00';
	return dayOf(Date.now() - (days - 1) * 86_400_000);
}
