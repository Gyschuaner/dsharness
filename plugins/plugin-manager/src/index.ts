/**
 * dsh-plugin-manager — Host half (DSH-027).
 *
 * Exposes one exact JSON route. Filesystem/profile mutations are delegated to
 * the state engine and remain serialized for the lifetime of this Cordis
 * plugin fiber.
 */
import { ApiError, createPluginManager, type PluginManagerOptions } from './state.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

const name = 'plugin-manager';
// Both are Web host-plane services. The manager must wait for them instead of
// observing an early undefined value and entering an active no-op Fiber.
const inject = ['webServer', 'pluginInventory'];

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
	webServer: { register(route: { kind: 'exact'; path: string; handler: RequestHandler }): () => void };
	pluginInventory: { list(): unknown | Promise<unknown> };
	logger: Logger;
	effect(effect: () => () => void, description: string): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function makeHandler(options: HandlerOptions = {}): RequestHandler {
	const { manager: providedManager, logger, ...managerOptions } = options;
	const manager = providedManager ?? createPluginManager(managerOptions);
	return async (req, res): Promise<void> => {
		const send = (status: number, value: unknown): void => {
			res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
			res.end(JSON.stringify(value));
		};
		try {
			if (req.method !== 'POST') {
				send(405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'method not allowed' } });
				return;
			}
			const chunks: Buffer[] = [];
			let bytes = 0;
			for await (const chunk of req) {
				bytes += chunk.length;
				if (bytes > 64 * 1024) throw new ApiError(413, '请求体过大', 'BODY_TOO_LARGE');
				chunks.push(chunk);
			}
			let body: unknown;
			try {
				body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
			} catch {
				throw new ApiError(400, '请求体不是合法 JSON', 'BODY_INVALID');
			}
			if (!isRecord(body)) throw new ApiError(400, '请求体必须是对象', 'BODY_INVALID');
			const value = await manager.call(body.op, body);
			send(200, { ok: true, value });
		} catch (error) {
			const status = error instanceof ApiError ? error.status : 500;
			const message = error instanceof Error ? error.message : String(error);
			const code = error instanceof ApiError ? error.code : 'INTERNAL_ERROR';
			if (status >= 500) logger?.warn?.(`plugin-manager: ${error instanceof Error ? error.stack : message}`);
			send(status, { ok: false, error: { code, message } });
		}
	};
}

function apply(ctx: HostContext): void {
	const webServer = ctx.webServer;
	const inventory = ctx.pluginInventory;
	const handler = makeHandler({ logger: ctx.logger, deps: { inventory } });
	ctx.effect(() => webServer.register({ kind: 'exact', path: '/api/plugin-manager', handler }), 'plugin-manager: web route');
}

export { name, inject, apply };
