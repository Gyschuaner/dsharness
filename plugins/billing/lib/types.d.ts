export type PriceMode = 'peak' | 'offpeak' | 'unknown';
export interface TokenBuckets {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
}
export interface BillingCall extends TokenBuckets {
    callKey: string;
    sessionId: string;
    sessionTitle: string;
    model: string;
    timestamp: number;
    turn: number;
    step: number;
    estimatedCost: number | null;
    priceMode: PriceMode;
    priceReason: string;
}
export interface BillingIssue {
    path: string;
    code: string;
    message: string;
}
export interface BillingTotals extends TokenBuckets {
    calls: number;
    pricedCalls: number;
    unpricedCalls: number;
    totalTokens: number;
    estimatedCost: number;
}
export interface BillingDaily extends BillingTotals {
    date: string;
}
export interface BillingModel extends BillingTotals {
    model: string;
    share: number;
}
export interface BillingSummary {
    apiVersion: 1;
    generatedAt: number;
    range: {
        from: number;
        to: number;
    };
    totals: BillingTotals;
    daily: BillingDaily[];
    models: BillingModel[];
    calls: BillingCall[];
    issues: BillingIssue[];
    truncated: boolean;
    priceNote: string;
}
//# sourceMappingURL=types.d.ts.map