/**
 * dsh-shadow-billing — 影子计价格价（DSH-032）。
 *
 * 纯函数模块：按 DeepSeek Flash 官方峰谷价 × 真实 token 用量折算估算费用。
 * 口径（与 luxueliu-usage-command 同源）：
 * - 低谷价 ¥/1M tokens：缓存命中 0.05 / 未命中 1.5 / 输出 4.5（ds-flash）；
 * - 高峰（北京时区 9:00-12:00 / 14:00-18:00，即本地小时 9,10,11,14,15,16,17）×2；
 * - 2026-08-23 起周末（周六+周日）全天按低谷价，不区分峰谷；
 * - DSH TokenUsage 语义：inputTokens=未命中输入、cacheReadTokens=缓存命中、outputTokens=输出，三桶不相交。
 * 价目表与别名可经 cordis config 扩展；无价目模型只列 token 不计价（priced=false）。
 */
/** 单模型价目（¥ / 1M tokens）。 */
export interface PriceEntry {
    /** 缓存命中单价。 */
    hit: number;
    /** 未命中单价。 */
    miss: number;
    /** 输出单价。 */
    out: number;
}
/** 计价格价配置（resolvePricing 输出）。 */
export interface PricingConfig {
    /** 归一模型名 → 价目。 */
    models: Record<string, PriceEntry>;
    /** 日志原始模型名 → 归一模型名。 */
    aliases: Record<string, string>;
    /** 周末低谷生效时间戳（ms）；此前周末也按峰谷计。 */
    weekendOffpeakSince: number;
}
/** 单次调用的计价结果。 */
export interface CostBreakdown {
    /** 总估算费用（元）。 */
    cost: number;
    /** 命中部分费用（元）。 */
    hitCost: number;
    /** 未命中部分费用（元）。 */
    missCost: number;
    /** 输出部分费用（元）。 */
    outCost: number;
    /** 本次调用是否落在高峰时段。 */
    peak: boolean;
    /** 模型是否有价目；false 时 cost 恒为 0（只计 token）。 */
    priced: boolean;
}
/** DeepSeek Flash 官方低谷价（¥ / 1M tokens）。 */
export declare const DS_FLASH_PRICE: PriceEntry;
/** 内置别名：本机本地模型（DP Relay / llama.cpp）→ ds-flash。 */
export declare const DEFAULT_ALIASES: Record<string, string>;
/** 周末低谷默认生效时间：2026-08-23 00:00 北京时间。 */
export declare const DEFAULT_WEEKEND_OFFPEAK_SINCE: number;
/** 高峰小时集合（北京时区本地小时）。 */
export declare const PEAK_HOURS: Set<number>;
/** 北京时区（UTC+8）本地小时。 */
export declare function beijingHour(ts: number): number;
/** 北京时区星期几（0=周日 … 6=周六，与 Date#getDay 同语义）。 */
export declare function beijingWeekday(ts: number): number;
/** 该时间戳是否落在高峰（北京时区）；周末低谷生效后周六/周日恒为低谷。 */
export declare function isPeakHour(ts: number, weekendOffpeakSince: number): boolean;
/** 归一模型名：别名映射（大小写不敏感回退）。 */
export declare function resolveModel(raw: string, config: PricingConfig): string;
/** 构造默认计价配置；models/aliases 可被用户配置覆盖。 */
export declare function resolvePricing(userModels?: Record<string, Partial<PriceEntry>>, userAliases?: Record<string, string>, weekendOffpeakSince?: number): PricingConfig;
/**
 * 计价一次调用。
 * @param inputTokens 未命中输入 token（DSH TokenUsage.inputTokens）。
 * @param outputTokens 输出 token。
 * @param cacheReadTokens 缓存命中 token。
 * @param ts 调用时间戳（ms）。
 * @param rawModel 日志中的原始模型名。
 * @param config 计价配置。
 */
export declare function priceTokens(inputTokens: number, outputTokens: number, cacheReadTokens: number, ts: number, rawModel: string, config: PricingConfig): CostBreakdown;
/** 元 → 分（两位小数，用于显示）。 */
export declare function formatCost(cost: number): string;
//# sourceMappingURL=pricing.d.ts.map