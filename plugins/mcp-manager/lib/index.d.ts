/**
 * dsh-mcp-manager — Host half (DSH-026 / DSH-028).
 *
 * Owns one exact JSON route. Profile writes and remote metadata requests live
 * in the state engine, while this Cordis entry only binds real optional Host
 * services and owns the route disposer.
 */
import { type McpManagerOptions } from './state.js';
declare const name = "mcp-manager";
declare const inject: string[];
interface McpManager {
    call(op: unknown, body?: Record<string, unknown>): Promise<any>;
}
interface Logger {
    warn?(...values: unknown[]): void;
}
interface HandlerOptions extends McpManagerOptions {
    manager?: McpManager;
}
interface RequestLike extends AsyncIterable<Uint8Array> {
    method?: string;
}
interface ResponseLike {
    writeHead(status: number, headers: Record<string, string>): unknown;
    end(value?: string | Uint8Array): unknown;
}
type RequestHandler = (req: RequestLike, res: ResponseLike) => Promise<void>;
interface HostContext {
    get(name: string): unknown;
    logger: Logger;
    effect(effect: () => () => void, description: string): void;
}
export declare function makeHandler(options?: HandlerOptions): RequestHandler;
declare function apply(ctx: HostContext): void;
export { name, inject, apply };
//# sourceMappingURL=index.d.ts.map