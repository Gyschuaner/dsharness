/**
 * dsh-billing — client half.
 *
 * This is a classic browser bundle loaded by DSH's ModuleLoader. It contributes
 * additive Cordis slots only: an Extensions Billing section and a settings
 * section.
 */
interface BillingSlotEntry {
    name: string;
    id: string;
    order?: number;
    label?: string | (() => string);
}
interface BillingSlots {
    inject(name: string, effect: () => unknown): unknown;
    register(definition: BillingSlotEntry, component: React.ComponentType<Record<string, unknown>>): unknown;
}
interface BillingProps extends Record<string, unknown> {
}
interface TokenTotals {
    calls: number;
    pricedCalls: number;
    unpricedCalls: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    totalTokens: number;
    estimatedCost: number;
}
interface BillingDaily extends TokenTotals {
    date: string;
}
interface BillingModel extends TokenTotals {
    model: string;
    share: number;
}
interface BillingCall {
    callKey: string;
    sessionId: string;
    sessionTitle: string;
    model: string;
    timestamp: number;
    turn: number;
    step: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    estimatedCost: number | null;
    priceMode: string;
    priceReason: string;
}
interface BillingSummary {
    apiVersion: 1;
    generatedAt: number;
    range: {
        from: number;
        to: number;
    };
    totals: TokenTotals;
    daily: BillingDaily[];
    models: BillingModel[];
    calls: BillingCall[];
    issues: Array<{
        path: string;
        code: string;
        message: string;
    }>;
    truncated: boolean;
    priceNote: string;
}
interface BillingState {
    loading: boolean;
    error: string;
    data?: BillingSummary;
}
//# sourceMappingURL=client.d.ts.map