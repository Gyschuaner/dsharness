/**
 * dsh-shadow-billing — Client half（DSH-032）。
 *
 * Billing 只出现在扩展管理器与设置页。仪表盘沿用 DSH-032 最终确认的
 * 收据标题、三项总览、Token/费用组合图、模型构成和调用明细布局。
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
interface BillingData {
    summary: SummaryValue;
    models: ModelRow[];
    daily: DailyRow[];
    requests: RequestsValue;
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
declare function fmtTokens(value: number): string;
declare function fmtCost(costNano: number): string;
declare function fmtDay(day: string): string;
declare function fmtTime(timestamp: number): string;
declare function apiGet<T>(url: string): Promise<T>;
//# sourceMappingURL=client.d.ts.map