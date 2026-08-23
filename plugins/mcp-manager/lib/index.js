/**
 * dsh-mcp-manager — Host half (DSH-026 / DSH-028).
 *
 * Owns one exact JSON route. Profile writes and remote metadata requests live
 * in the state engine, while this Cordis entry only binds real optional Host
 * services and owns the route disposer.
 */
import { ApiError, createMcpManager } from './state.js';

const name = 'mcp-manager';
const inject = ['webServer'];

export function makeHandler(options = {}) {
	const manager = options.manager || createMcpManager(options);
	const logger = options.logger;
	return async (req, res) => {
		const send = (status, value) => {
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
			const chunks = [];
			let bytes = 0;
			for await (const chunk of req) {
				bytes += chunk.length;
				if (bytes > 128 * 1024) throw new ApiError(413, '请求体过大', 'BODY_TOO_LARGE');
				chunks.push(chunk);
			}
			let body;
			try {
				body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
			} catch {
				throw new ApiError(400, '请求体不是合法 JSON', 'BODY_INVALID');
			}
			if (!body || typeof body !== 'object' || Array.isArray(body)) {
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

function apply(ctx) {
	const webServer = ctx.get('webServer');
	if (webServer === undefined) return;
	const inventory = ctx.get('pluginInventory');
	const tools = ctx.get('tools');
	const manager = createMcpManager({
		logger: ctx.logger,
		deps: { inventory, tools },
	});
	const handler = makeHandler({ manager, logger: ctx.logger });
	ctx.effect(
		() => webServer.register({ kind: 'exact', path: '/api/mcp-manager', handler }),
		'mcp-manager: web route',
	);
}

export { name, inject, apply };
