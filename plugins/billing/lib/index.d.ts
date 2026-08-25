import type { IncomingMessage, ServerResponse } from 'node:http';
import { BillingStore } from './store.js';
import type { BillingSummary } from './types.js';
declare const name = "billing";
declare const inject: string[];
type RequestHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;
interface BillingBackend {
    summary(request?: {
        from?: number;
        to?: number;
        sessionId?: string;
    }): Promise<BillingSummary>;
}
interface Logger {
    warn?(...values: unknown[]): void;
}
interface HostContext {
    webServer: {
        register(route: {
            kind: 'exact';
            path: string;
            handler: RequestHandler;
        }): () => void;
    };
    logger?: Logger;
    effect(effect: () => () => void, description: string): void;
}
interface HandlerOptions {
    store?: BillingBackend;
    logger?: Logger;
}
declare class BillingApiError extends Error {
    readonly status: number;
    readonly code: string;
    constructor(status: number, code: string, message: string);
}
export declare function makeHandler(options?: HandlerOptions): RequestHandler;
declare function apply(ctx: HostContext): void;
export { BillingApiError, BillingStore, apply, inject, name };
//# sourceMappingURL=index.d.ts.map