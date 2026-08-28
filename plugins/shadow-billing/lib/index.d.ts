import type { IncomingMessage, ServerResponse } from 'node:http';
import { type PriceEntry } from './pricing.js';
declare const name = "shadow-billing";
declare const inject: string[];
interface HostContext {
    webServer: {
        register(route: {
            kind: 'prefix';
            path: string;
            handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
        }): () => void;
    };
    timer: {
        interval(callback: () => void, delay: number): () => void;
    };
    logger: {
        warn?(...values: unknown[]): void;
        info?(...values: unknown[]): void;
    };
    effect(effect: () => () => void, description: string): void;
    config?: ShadowBillingConfig;
}
export interface ShadowBillingConfig {
    /** 会话日志根目录；默认 ~/.dsh/sessions。 */
    sessionsRoot?: string;
    /** 折叠周期 ms；默认 300000。 */
    foldIntervalMs?: number;
    /** 明细保留天数；默认 60（聚合永久保留）。 */
    retentionDays?: number;
    /** 额外价目：归一模型名 → { hit, miss, out }（¥/1M tokens）。 */
    models?: Record<string, Partial<PriceEntry>>;
    /** 额外别名：日志模型名 → 归一模型名。 */
    aliases?: Record<string, string>;
    /** 周末低谷生效时间戳（ms）；默认 2026-08-23T00:00:00+08:00。 */
    weekendOffpeakSince?: number;
}
declare function apply(ctx: HostContext, rawConfig?: ShadowBillingConfig): void;
export { name, inject, apply };
//# sourceMappingURL=index.d.ts.map