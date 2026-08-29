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
let cachedDatabaseSync = null;
function databaseSync() {
    if (cachedDatabaseSync !== null)
        return cachedDatabaseSync;
    const require = createRequire(import.meta.url);
    const original = process.emitWarning;
    process.emitWarning = ((warning, ...rest) => {
        const message = typeof warning === 'string' ? warning : warning.message;
        if (message.includes('SQLite is an experimental feature'))
            return;
        return original.call(process, warning, ...rest);
    });
    try {
        cachedDatabaseSync = require('node:sqlite').DatabaseSync;
    }
    finally {
        process.emitWarning = original;
    }
    return cachedDatabaseSync;
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
  route_provider TEXT,
  route_model    TEXT,
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
/** 打开（或创建）数据库并初始化 schema。 */
export function openStore(dbPath) {
    const DatabaseSync = databaseSync();
    const db = new DatabaseSync(dbPath);
    db.exec(SCHEMA);
    const watermarkColumns = new Set(db.prepare('PRAGMA table_info(fold_watermarks)').all().map(row => row.name));
    if (!watermarkColumns.has('route_provider'))
        db.exec('ALTER TABLE fold_watermarks ADD COLUMN route_provider TEXT');
    if (!watermarkColumns.has('route_model'))
        db.exec('ALTER TABLE fold_watermarks ADD COLUMN route_model TEXT');
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
    const usageByIdStmt = db.prepare('SELECT * FROM usage_requests WHERE record_id = ?');
    const updateUsageModelStmt = db.prepare('UPDATE usage_requests SET model = ?, cost_nano = ? WHERE record_id = ? AND model = ?');
    const subtractRollupStmt = db.prepare(`
		UPDATE usage_daily_rollups SET
		  requests = requests - 1,
		  input_tokens = input_tokens - ?,
		  output_tokens = output_tokens - ?,
		  cache_read_tokens = cache_read_tokens - ?,
		  cache_write_tokens = cache_write_tokens - ?,
		  cost_nano = cost_nano - ?
		WHERE day = ? AND model = ?
	`);
    const deleteEmptyRollupStmt = db.prepare('DELETE FROM usage_daily_rollups WHERE day = ? AND model = ? AND requests <= 0');
    const store = {
        db,
        insertUsage(record) {
            const result = insertUsageStmt.run(record.recordId, record.sessionId, record.model, record.inputTokens, record.outputTokens, record.cacheReadTokens, record.cacheWriteTokens, record.costNano, record.day, record.createdAt);
            if (result.changes !== 1)
                return false;
            upsertRollupStmt.run(record.day, record.model, record.inputTokens, record.outputTokens, record.cacheReadTokens, record.cacheWriteTokens, record.costNano);
            return true;
        },
        hasUnknownUsage(sessionId) {
            return db.prepare("SELECT 1 AS found FROM usage_requests WHERE session_id = ? AND model = 'unknown' LIMIT 1")
                .get(sessionId) !== undefined;
        },
        repairUnknownUsage(recordId, model, costNano) {
            if (model === 'unknown')
                return false;
            const row = usageByIdStmt.get(recordId);
            if (row === undefined || row.model !== 'unknown')
                return false;
            db.exec('BEGIN IMMEDIATE');
            try {
                const changed = updateUsageModelStmt.run(model, costNano, recordId, 'unknown');
                if (changed.changes !== 1) {
                    db.exec('ROLLBACK');
                    return false;
                }
                subtractRollupStmt.run(Number(row.input_tokens), Number(row.output_tokens), Number(row.cache_read_tokens), Number(row.cache_write_tokens), Number(row.cost_nano), String(row.day), 'unknown');
                deleteEmptyRollupStmt.run(String(row.day), 'unknown');
                upsertRollupStmt.run(String(row.day), model, Number(row.input_tokens), Number(row.output_tokens), Number(row.cache_read_tokens), Number(row.cache_write_tokens), costNano);
                db.exec('COMMIT');
                return true;
            }
            catch (error) {
                db.exec('ROLLBACK');
                throw error;
            }
        },
        putWatermark(watermark) {
            db.prepare(`
				INSERT INTO fold_watermarks (session_id, log_path, last_seq, file_mtime_ms, title, last_offset, route_provider, route_model, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(session_id) DO UPDATE SET
				  log_path = excluded.log_path,
				  last_seq = excluded.last_seq,
				  file_mtime_ms = excluded.file_mtime_ms,
				  title = excluded.title,
				  last_offset = excluded.last_offset,
				  route_provider = excluded.route_provider,
				  route_model = excluded.route_model,
				  updated_at = excluded.updated_at
			`).run(watermark.sessionId, watermark.logPath, watermark.lastSeq, watermark.fileMtimeMs, watermark.title, watermark.lastOffset, watermark.routeProvider, watermark.routeModel, watermark.updatedAt);
        },
        getWatermark(sessionId) {
            const row = db.prepare('SELECT * FROM fold_watermarks WHERE session_id = ?').get(sessionId);
            if (row === undefined)
                return null;
            const r = row;
            return {
                sessionId: String(r.session_id),
                logPath: String(r.log_path),
                lastSeq: Number(r.last_seq),
                fileMtimeMs: Number(r.file_mtime_ms),
                title: r.title === null ? null : String(r.title),
                lastOffset: Number(r.last_offset),
                routeProvider: r.route_provider === null || r.route_provider === undefined ? null : String(r.route_provider),
                routeModel: r.route_model === null || r.route_model === undefined ? null : String(r.route_model),
                updatedAt: Number(r.updated_at),
            };
        },
        summarySince(dayFloor) {
            const row = db.prepare(`
				SELECT
				  COALESCE(SUM(requests), 0) AS requests,
				  COALESCE(SUM(input_tokens), 0) AS input_tokens,
				  COALESCE(SUM(output_tokens), 0) AS output_tokens,
				  COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
				  COALESCE(SUM(cost_nano), 0) AS cost_nano
				FROM usage_daily_rollups WHERE day >= ?
			`).get(dayFloor);
            return {
                requests: Number(row.requests),
                inputTokens: Number(row.input_tokens),
                outputTokens: Number(row.output_tokens),
                cacheReadTokens: Number(row.cache_read_tokens),
                costNano: Number(row.cost_nano),
            };
        },
        byModelSince(dayFloor) {
            const rows = db.prepare(`
				SELECT model,
				  SUM(requests) AS requests,
				  SUM(input_tokens) AS input_tokens,
				  SUM(output_tokens) AS output_tokens,
				  SUM(cache_read_tokens) AS cache_read_tokens,
				  SUM(cost_nano) AS cost_nano
				FROM usage_daily_rollups WHERE day >= ?
				GROUP BY model ORDER BY cost_nano DESC
			`).all(dayFloor);
            return rows.map((r) => ({
                model: String(r.model),
                requests: Number(r.requests),
                inputTokens: Number(r.input_tokens),
                outputTokens: Number(r.output_tokens),
                cacheReadTokens: Number(r.cache_read_tokens),
                costNano: Number(r.cost_nano),
            }));
        },
        dailySince(dayFloor) {
            const rows = db.prepare(`
				SELECT day,
				  SUM(requests) AS requests,
				  SUM(input_tokens) AS input_tokens,
				  SUM(output_tokens) AS output_tokens,
				  SUM(cache_read_tokens) AS cache_read_tokens,
				  SUM(cost_nano) AS cost_nano
				FROM usage_daily_rollups WHERE day >= ?
				GROUP BY day ORDER BY day ASC
			`).all(dayFloor);
            return rows.map((r) => ({
                day: String(r.day),
                requests: Number(r.requests),
                inputTokens: Number(r.input_tokens),
                outputTokens: Number(r.output_tokens),
                cacheReadTokens: Number(r.cache_read_tokens),
                costNano: Number(r.cost_nano),
            }));
        },
        requestsPage(dayFloor, offset, limit) {
            const totalRow = db.prepare('SELECT COUNT(*) AS n FROM usage_requests WHERE day >= ?').get(dayFloor);
            const rows = db.prepare(`
				SELECT record_id, session_id, model,
				  input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
				  cost_nano, day, created_at
				FROM usage_requests WHERE day >= ?
				ORDER BY created_at DESC LIMIT ? OFFSET ?
			`).all(dayFloor, limit, offset);
            return { rows, total: Number(totalRow.n) };
        },
        sessionSummary(sessionId) {
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
			`).get(sessionId);
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
        close() {
            db.close();
        },
    };
    return store;
}
/** 本地日期键（YYYY-MM-DD，按本地时区）。 */
export function dayOf(ts) {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
/** N 天前的日期键（含今天，即 dayFloor = 今天往前 N-1 天）。 */
export function dayFloor(days) {
    if (days <= 0)
        return '0000-00-00';
    return dayOf(Date.now() - (days - 1) * 86_400_000);
}
//# sourceMappingURL=store.js.map