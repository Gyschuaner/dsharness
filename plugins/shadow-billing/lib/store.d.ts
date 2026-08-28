/**
 * dsh-shadow-billing — SQLite 存储（DSH-032）。
 *
 * node:sqlite（Node 22+ 内置）三张表：
 * - usage_requests：单次调用事实（record_id 幂等去重）；
 * - usage_daily_rollups：按 (day, model) 预聚合，页面查询秒开；
 * - fold_watermarks：会话日志折叠水位（字节 + seq + mtime）。
 * 成本以整数纳元（cost_nano）存储，避免浮点误差。
 */
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
export interface Store {
    db: import('node:sqlite').DatabaseSync;
    insertUsage(record: UsageRecord): boolean;
    putWatermark(watermark: Watermark): void;
    getWatermark(sessionId: string): Watermark | null;
    summarySince(dayFloor: string): {
        requests: number;
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens: number;
        costNano: number;
    };
    byModelSince(dayFloor: string): Array<{
        model: string;
        requests: number;
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens: number;
        costNano: number;
    }>;
    dailySince(dayFloor: string): Array<{
        day: string;
        requests: number;
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens: number;
        costNano: number;
    }>;
    requestsPage(dayFloor: string, offset: number, limit: number): {
        rows: Array<Record<string, unknown>>;
        total: number;
    };
    sessionSummary(sessionId: string): {
        requests: number;
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens: number;
        costNano: number;
        firstAt: number | null;
        lastAt: number | null;
    };
    close(): void;
}
/** 打开（或创建）数据库并初始化 schema。 */
export declare function openStore(dbPath: string): Store;
/** 本地日期键（YYYY-MM-DD，按本地时区）。 */
export declare function dayOf(ts: number): string;
/** N 天前的日期键（含今天，即 dayFloor = 今天往前 N-1 天）。 */
export declare function dayFloor(days: number): string;
//# sourceMappingURL=store.d.ts.map