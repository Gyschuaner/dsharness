import type { BillingSummary } from './types.js';
export interface BillingStoreOptions {
    homeDir?: string;
    sessionRoot?: string;
    dbPath?: string;
    now?: () => number;
}
export declare class BillingStore {
    readonly sessionRoot: string;
    readonly dbPath: string;
    private readonly db;
    private readonly now;
    private readonly issuesByPath;
    private syncing;
    constructor(options?: BillingStoreOptions);
    sync(): Promise<void>;
    private syncNow;
    private repriceStoredCalls;
    summary(request?: {
        from?: number;
        to?: number;
        sessionId?: string;
    }): Promise<BillingSummary>;
    close(): void;
}
//# sourceMappingURL=store.d.ts.map