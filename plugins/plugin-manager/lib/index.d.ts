/**
 * dsh-plugin-manager — Host half (DSH-027).
 *
 * Exposes one exact JSON route. Filesystem/profile mutations are delegated to
 * the state engine and remain serialized for the lifetime of this Cordis
 * plugin fiber.
 */
import { createPluginManager, type PluginManagerOptions } from './state.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
declare const name = "plugin-manager";
declare const inject: string[];
type PluginManager = ReturnType<typeof createPluginManager>;
type RequestHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;
interface Logger {
    warn?(...values: unknown[]): void;
}
interface HandlerOptions extends PluginManagerOptions {
    manager?: PluginManager;
    logger?: Logger;
}
interface HostContext {
    webServer: {
        register(route: {
            kind: 'exact';
            path: string;
            handler: RequestHandler;
        }): () => void;
    };
    pluginInventory: {
        list(): unknown | Promise<unknown>;
    };
    logger: Logger;
    effect(effect: () => () => void, description: string): void;
}
export declare function makeHandler(options?: HandlerOptions): RequestHandler;
declare function apply(ctx: HostContext): void;
export { name, inject, apply };
//# sourceMappingURL=index.d.ts.map