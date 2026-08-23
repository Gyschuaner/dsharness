/**
 * dsh-mcp-manager — Host half (DSH-026 / DSH-028).
 *
 * Owns one exact JSON route. Profile writes and remote metadata requests live
 * in the state engine, while this Cordis entry only binds real optional Host
 * services and owns the route disposer.
 */
import { ApiError, createMcpManager, type McpManagerOptions } from './state.js';

const name = 'mcp-manager';
const inject = ['webServer'];

interface McpManager {
	// Operation names select different JSON response shapes at this Host boundary.
	call(op: unknown, body?: Record<string, unknown>): Promise<any>;
}

interface Logger {
	warn?(...values: unknown[]): void;
}

interface HandlerOptions extends McpManagerOptions {
	manager?: McpManager;
}

interface RequestLike extends AsyncIterable<Uint8Array> { method?: string }
interface ResponseLike {
	writeHead(status: number, headers: Record<string, string>): unknown;
	end(value?: string | Uint8Array): unknown;
}
type RequestHandler = (req: RequestLike, res: ResponseLike) => Promise<void>;

interface WebServer {
	register(route: { kind: 'exact'; path: string; handler: RequestHandler }): () => void;
}

interface HostContext {
	get(name: string): unknown;
	logger: Logger;
	effect(effect: () => () => void, description: string): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function makeHandler(options: HandlerOptions = {}): RequestHandler {
	const { manager: providedManager, ...managerOptions } = options;
	const manager = providedManager ?? createMcpManager(managerOptions);
	const logger = options.logger;
	return async (req, res): Promise<void> => {
		const send = (status: number, value: unknown): void => {
			res.writeHead(status, {
				'content-type': 'application/json; charset=utf-8',
				'cache-control': 'no-store',
				'x-content-type-options': 'nosniff',
			});
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
				if (bytes > 128 * 1024) throw new ApiError(413, '请求体过大', 'BODY_TOO_LARGE');
				chunks.push(Buffer.from(chunk));
			}
			let body: unknown;
			try {
				body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
			} catch {
				throw new ApiError(400, '请求体不是合法 JSON', 'BODY_INVALID');
			}
			if (!isRecord(body)) {
				throw new ApiError(400, '请求体必须是对象', 'BODY_INVALID');
			}
			const value = await manager.call(body.op, body);
			send(200, { ok: true, value });
		} catch (error) {
			const status = error instanceof ApiError ? error.status : 500;
			const code = error instanceof ApiError ? error.code : 'INTERNAL_ERROR';
			const message = error instanceof Error ? error.message : String(error);
			if (status >= 500) logger?.warn?.(`mcp-manager: ${error instanceof Error ? error.stack : message}`);
			send(status, { ok: false, error: { code, message } });
		}
	};
}

function apply(ctx: HostContext): void {
	const webServer = ctx.get('webServer') as WebServer | undefined;
	if (webServer === undefined) return;
	const inventory = ctx.get('pluginInventory');
	const tools = ctx.get('tools');
	const manager = createMcpManager({
		logger: ctx.logger,
		deps: {
			...(inventory !== undefined ? { inventory: inventory as { list(): unknown } } : {}),
			...(tools !== undefined ? { tools: tools as { schemas(): unknown } } : {}),
		},
	});
	const handler = makeHandler({ manager, logger: ctx.logger });
	ctx.effect(
		() => webServer.register({ kind: 'exact', path: '/api/mcp-manager', handler }),
		'mcp-manager: web route',
	);
}

export { name, inject, apply };
