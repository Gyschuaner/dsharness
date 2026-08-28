/**
 * dsh-shadow-billing — 会话日志折叠器（DSH-032）。
 *
 * 把 DSH 会话日志（多帧 zstd JSONL）折叠成 usage_requests 行：
 * - zstd 分帧按帧头精确切分，尾部残缺帧（活跃写入中）整体跳过；
 * - 字节级增量：从水位 last_offset 续读，另以 seq 过滤兜底防重复；
 * - usage 数据源：本机实测 usage 上报在 `assistant/chunk` 的 usage 类型块
 *   （inputTokens / outputTokens / cacheReadTokens），按 (turn, step) 聚合、
 *   取该 step 最后一次上报（流式可能多次累计上报）；
 * - 模型名从 request/header（data.header.config.model）或
 *   request/context（data.model）恢复。
 */
import { type Store } from './store.js';
import { type PricingConfig } from './pricing.js';
/** 按帧头精确切分 zstd 多帧文件；尾部不完整帧被丢弃。 */
export declare function splitZstdFrames(buf: Buffer): Buffer[];
interface SessionEvent {
    type: string;
    seq?: unknown;
    time?: unknown;
    data?: Record<string, unknown>;
    [key: string]: unknown;
}
interface FoldedHeader {
    id: string;
    title: string | undefined;
}
/** 逐行解析一个会话日志文件（从 startOffset 字节处续读）。 */
export declare function readSessionLog(filePath: string, startOffset?: number): {
    header: FoldedHeader | null;
    events: SessionEvent[];
    nextOffset: number;
};
interface FoldResult {
    imported: number;
    skipped: number;
    sessionId: string | null;
    skippedUnchanged: boolean;
    error?: string;
}
interface Logger {
    warn?(...values: unknown[]): void;
}
/** 折叠一个会话日志文件。 */
export declare function foldSessionFile(store: Store, pricing: PricingConfig, filePath: string, _logger?: Logger): FoldResult;
/** 扫描全部会话日志并折叠。返回聚合结果。 */
export declare function foldAllSessions(store: Store, pricing: PricingConfig, sessionsRoot: string, logger?: Logger): {
    scanned: number;
    imported: number;
    skipped: number;
    errors: string[];
};
export {};
//# sourceMappingURL=fold.d.ts.map