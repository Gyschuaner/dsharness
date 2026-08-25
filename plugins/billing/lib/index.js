import { BillingStore } from './store.js';
const name = 'billing';
const inject = ['webServer'];
class BillingApiError extends Error {
    status;
    code;
    constructor(status, code, message) {
        super(message);
        this.name = 'BillingApiError';
        this.status = status;
        this.code = code;
    }
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function optionalNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : undefined;
}
export function makeHandler(options = {}) {
    const store = options.store ?? new BillingStore();
    const logger = options.logger;
    return async (req, res) => {
        const send = (status, value) => {
            res.writeHead(status, {
                'content-type': 'application/json; charset=utf-8',
                'cache-control': 'no-store',
            });
            res.end(JSON.stringify(value));
        };
        try {
            if (req.method !== 'POST')
                throw new BillingApiError(405, 'METHOD_NOT_ALLOWED', 'method not allowed');
            const chunks = [];
            let bytes = 0;
            for await (const chunk of req) {
                const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                bytes += buffer.length;
                if (bytes > 64 * 1024)
                    throw new BillingApiError(413, 'BODY_TOO_LARGE', '请求体过大');
                chunks.push(buffer);
            }
            let body;
            try {
                body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
            }
            catch {
                throw new BillingApiError(400, 'BODY_INVALID', '请求体不是合法 JSON');
            }
            if (!isRecord(body))
                throw new BillingApiError(400, 'BODY_INVALID', '请求体必须是对象');
            const op = typeof body.op === 'string' ? body.op : 'summary';
            if (op === 'capabilities') {
                send(200, {
                    ok: true,
                    value: {
                        apiVersion: 1,
                        features: ['session-badge', 'conversation-view', 'settings-section', 'sqlite', 'incremental-watermark'],
                    },
                });
                return;
            }
            if (op !== 'summary' && op !== 'session' && op !== 'sync') {
                throw new BillingApiError(400, 'OP_UNSUPPORTED', `不支持的 Billing 操作：${op}`);
            }
            const request = {};
            const from = optionalNumber(body.from);
            const to = optionalNumber(body.to);
            if (from !== undefined)
                request.from = from;
            if (to !== undefined)
                request.to = to;
            if (typeof body.sessionId === 'string')
                request.sessionId = body.sessionId;
            const value = await store.summary(request);
            send(200, { ok: true, value });
        }
        catch (error) {
            const status = error instanceof BillingApiError ? error.status : 500;
            const code = error instanceof BillingApiError ? error.code : 'INTERNAL_ERROR';
            const message = error instanceof Error ? error.message : String(error);
            if (status >= 500)
                logger?.warn?.(`billing: ${error instanceof Error ? error.stack : message}`);
            send(status, { ok: false, error: { code, message } });
        }
    };
}
function apply(ctx) {
    const store = new BillingStore();
    ctx.effect(() => {
        const disposeRoute = ctx.webServer.register({ kind: 'exact', path: '/api/billing', handler: makeHandler(ctx.logger === undefined ? { store } : { store, logger: ctx.logger }) });
        return () => {
            disposeRoute();
            if (store instanceof BillingStore)
                store.close();
        };
    }, 'billing: web route');
}
export { BillingApiError, BillingStore, apply, inject, name };
//# sourceMappingURL=index.js.map