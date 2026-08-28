/**
 * dsh-shadow-billing — Client half（DSH-032）。
 *
 * 三个 Slot：
 * - conversation.session.header.utilities：会话头部徽标（累计 token + 估算费用，点击弹详情）；
 * - conversation.view：与「对话 / 轨迹」并列的「用量」页签（统计卡 + 趋势 + 排行 + 明细）；
 * - settings.section：设置页（价目表与口径说明）。
 *
 * 动效：数字滚动（300ms ease-out）、趋势面积图路径绘制入场（800ms）、
 * 统计卡淡入上移（200ms）；prefers-reduced-motion 下全部降级为瞬时。
 */
interface SummaryValue {
    days: number;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    costNano: number;
}
interface ModelRow {
    model: string;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    costNano: number;
}
interface DailyRow {
    day: string;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    costNano: number;
}
interface RequestRow {
    record_id: string;
    session_id: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
    cost_nano: number;
    day: string;
    created_at: number;
}
interface RequestsValue {
    days: number;
    page: number;
    size: number;
    total: number;
    rows: RequestRow[];
}
interface SessionValue {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    costNano: number;
    firstAt: number | null;
    lastAt: number | null;
}
interface ApiEnvelope<T> {
    ok: boolean;
    value?: T;
    error?: {
        code: string;
        message: string;
    };
}
interface ShadowBillingSlots {
    register(config: Record<string, unknown>, component: (props: Record<string, unknown>) => unknown): unknown;
    inject(name: string, effect: () => unknown): void;
}
declare function fmtTokens(n: number): string;
declare function fmtCost(costNano: number): string;
declare function fmtTime(ts: number): string;
declare function apiGet<T>(url: string): Promise<T | null>;
/** 尊重 prefers-reduced-motion。 */
declare function prefersReducedMotion(): boolean;
//# sourceMappingURL=client.d.ts.map