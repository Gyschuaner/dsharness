import type { PriceMode, TokenBuckets } from './types.js';
export declare const USD_TO_CNY = 7.2;
export declare const OFFICIAL_USD_RATES: Readonly<{
    input: 0.14;
    cacheRead: 0.0028;
    output: 0.28;
}>;
export declare const PRICE_NOTE = "\u4F30\u7B97\u4EF7\uFF0C\u975E\u771F\u5B9E\u8D26\u5355\uFF1B\u6309 DeepSeek-V4-Flash \u5B98\u65B9\u7F8E\u5143\u4EF7\u6298\u7B97\u4EBA\u6C11\u5E01\uFF08\u6C47\u7387\u6309 \u00A57.2/USD \u4F30\u7B97\uFF09\uFF0C\u5E76\u6309\u5317\u4EAC\u65F6\u95F4\u5CF0\u8C37\u4EF7\u8BA1\u7B97\u3002";
export declare const LOW_RATES: Readonly<{
    input: number;
    cacheRead: number;
    cacheWrite: number;
    output: number;
}>;
export declare const PEAK_MULTIPLIER = 2;
export interface PriceResult {
    estimatedCost: number | null;
    mode: PriceMode;
    reason: string;
    rates: {
        input: number;
        cacheRead: number;
        cacheWrite: number;
        output: number;
    };
}
export declare function beijingDate(timestamp: number): string;
export declare function isPeakBeijing(timestamp: number): boolean;
export declare function hasBillingPrice(model: string): boolean;
export declare function estimatePrice(model: string, timestamp: number, usage: TokenBuckets): PriceResult;
//# sourceMappingURL=pricing.d.ts.map