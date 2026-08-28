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
/** DeepSeek Flash 官方低谷价（¥ / 1M tokens）。 */
export const DS_FLASH_PRICE = { hit: 0.05, miss: 1.5, out: 4.5 };
/** 内置别名：本机本地模型（DP Relay / llama.cpp）→ ds-flash。 */
export const DEFAULT_ALIASES = {
    'DeepSeek-V4-Flash-0731-Q8_K_XL': 'ds-flash',
    'DeepSeek-V4-Flash-0731-Q4_K_XL': 'ds-flash',
    'deepseek-v4-flash': 'ds-flash',
    'ds-flash': 'ds-flash',
};
/** 周末低谷默认生效时间：2026-08-23 00:00 北京时间。 */
export const DEFAULT_WEEKEND_OFFPEAK_SINCE = Date.parse('2026-08-23T00:00:00+08:00');
/** 高峰小时集合（北京时区本地小时）。 */
export const PEAK_HOURS = new Set([9, 10, 11, 14, 15, 16, 17]);
/** 北京时区（UTC+8）本地小时。 */
export function beijingHour(ts) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Shanghai',
        hour: 'numeric',
        hourCycle: 'h23',
    }).formatToParts(ts);
    const hour = parts.find((p) => p.type === 'hour')?.value;
    return hour === undefined ? 0 : Number(hour);
}
/** 北京时区星期几（0=周日 … 6=周六，与 Date#getDay 同语义）。 */
export function beijingWeekday(ts) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Shanghai',
        weekday: 'short',
    }).formatToParts(ts);
    const wd = parts.find((p) => p.type === 'weekday')?.value;
    const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return wd === undefined ? 0 : (map[wd] ?? 0);
}
/** 该时间戳是否落在高峰（北京时区）；周末低谷生效后周六/周日恒为低谷。 */
export function isPeakHour(ts, weekendOffpeakSince) {
    const weekday = beijingWeekday(ts);
    if (ts >= weekendOffpeakSince && (weekday === 0 || weekday === 6))
        return false;
    return PEAK_HOURS.has(beijingHour(ts));
}
/** 归一模型名：别名映射（大小写不敏感回退）。 */
export function resolveModel(raw, config) {
    const direct = config.aliases[raw];
    if (direct !== undefined)
        return direct;
    const lower = raw.toLowerCase();
    for (const [key, value] of Object.entries(config.aliases)) {
        if (key.toLowerCase() === lower)
            return value;
    }
    return raw;
}
/** 构造默认计价配置；models/aliases 可被用户配置覆盖。 */
export function resolvePricing(userModels, userAliases, weekendOffpeakSince) {
    const models = { 'ds-flash': { ...DS_FLASH_PRICE } };
    if (userModels !== undefined) {
        for (const [name, entry] of Object.entries(userModels)) {
            models[name] = {
                hit: Number(entry.hit) || 0,
                miss: Number(entry.miss) || 0,
                out: Number(entry.out) || 0,
            };
        }
    }
    const aliases = { ...DEFAULT_ALIASES };
    if (userAliases !== undefined)
        Object.assign(aliases, userAliases);
    return {
        models,
        aliases,
        weekendOffpeakSince: Number.isFinite(weekendOffpeakSince) && (weekendOffpeakSince ?? 0) > 0
            ? weekendOffpeakSince
            : DEFAULT_WEEKEND_OFFPEAK_SINCE,
    };
}
/**
 * 计价一次调用。
 * @param inputTokens 未命中输入 token（DSH TokenUsage.inputTokens）。
 * @param outputTokens 输出 token。
 * @param cacheReadTokens 缓存命中 token。
 * @param ts 调用时间戳（ms）。
 * @param rawModel 日志中的原始模型名。
 * @param config 计价配置。
 */
export function priceTokens(inputTokens, outputTokens, cacheReadTokens, ts, rawModel, config) {
    const model = resolveModel(rawModel, config);
    const entry = config.models[model];
    if (entry === undefined || (entry.hit === 0 && entry.miss === 0 && entry.out === 0)) {
        return { cost: 0, hitCost: 0, missCost: 0, outCost: 0, peak: false, priced: false };
    }
    const peak = isPeakHour(ts, config.weekendOffpeakSince);
    const mult = peak ? 2 : 1;
    const miss = Math.max(0, inputTokens);
    const hit = Math.max(0, cacheReadTokens);
    const out = Math.max(0, outputTokens);
    const hitCost = (hit / 1e6) * entry.hit * mult;
    const missCost = (miss / 1e6) * entry.miss * mult;
    const outCost = (out / 1e6) * entry.out * mult;
    return { cost: hitCost + missCost + outCost, hitCost, missCost, outCost, peak, priced: true };
}
/** 元 → 分（两位小数，用于显示）。 */
export function formatCost(cost) {
    return (Math.round(cost * 100) / 100).toFixed(2);
}
//# sourceMappingURL=pricing.js.map