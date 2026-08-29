/**
 * dsh-shadow-billing — Host half（DSH-032）。
 *
 * 定时折叠 DSH 会话日志（zstd）到 SQLite，按模型官方价目影子计费，
 * 通过 /api/shadow-billing/* 只读 JSON 路由暴露聚合查询。Client 无凭证、无跨域，
 * 全部数据留在本机。
 */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { foldAllSessions } from './fold.js';
import { openStore, dayFloor, dayOf, type Store } from './store.js';
import { priceTokens, pricingSignature, resolveModel, resolvePricing, type PricingConfig, type PriceEntry } from './pricing.js';

const name = 'shadow-billing';
const inject = ['webServer', 'timer'];

const DEFAULT_FOLD_INTERVAL_MS = 300_000; // 5 分钟
const DEFAULT_RETENTION_DAYS = 60;

interface HostContext {
	webServer: {
		register(route: { kind: 'prefix'; path: string; handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> }): () => void;
	};
	timer: {
		interval(callback: () => void, delay: number): () => void;
	};
	logger: { warn?(...values: unknown[]): void; info?(...values: unknown[]): void };
	effect(effect: () => () => void, description: string): void;
	config?: ShadowBillingConfig;
}

export interface ShadowBillingConfig {
	/** 会话日志根目录；默认 ~/.dsh/sessions。 */
	sessionsRoot?: string;
	/** 折叠周期 ms；默认 300000。 */
	foldIntervalMs?: number;
	/** 明细保留天数；默认 60（聚合永久保留）。 */
	retentionDays?: number;
	/** 额外价目：归一模型名 → { hit, miss, out, peakMultiplier? }（¥/1M tokens）。 */
	models?: Record<string, Partial<PriceEntry>>;
	/** 额外别名：日志模型名 → 归一模型名。 */
	aliases?: Record<string, string>;
	/** 周末低谷生效时间戳（ms）；默认 2026-08-23T00:00:00+08:00。 */
	weekendOffpeakSince?: number;
}

interface JsonSend {
	(status: number, value: unknown): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseQuery(url: string | undefined): Record<string, string> {
	const out: Record<string, string> = {};
	if (!url) return out;
	const qIndex = url.indexOf('?');
	if (qIndex < 0) return out;
	for (const pair of url.slice(qIndex + 1).split('&')) {
		if (!pair) continue;
		const eq = pair.indexOf('=');
		if (eq < 0) {
			out[decodeURIComponent(pair)] = '';
		} else {
			out[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1));
		}
	}
	return out;
}

function numberOr(value: string | undefined, fallback: number): number {
	if (value === undefined || value === '') return fallback;
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
}

function resolveSessionsRoot(config: ShadowBillingConfig | undefined): string {
	if (config?.sessionsRoot && config.sessionsRoot !== '') return config.sessionsRoot;
	return path.join(os.homedir(), '.dsh', 'sessions');
}

function resolveDbPath(): string {
	return path.join(os.homedir(), '.dsh', 'storages', 'shadow-billing', 'billing.db');
}

function apply(ctx: HostContext, rawConfig: ShadowBillingConfig = {}): void {
	const config: ShadowBillingConfig = isRecord(rawConfig) ? rawConfig : {};
	const sessionsRoot = resolveSessionsRoot(config);
	const foldIntervalMs = Number.isFinite(config.foldIntervalMs) && (config.foldIntervalMs ?? 0) > 0
		? config.foldIntervalMs!
		: DEFAULT_FOLD_INTERVAL_MS;
	const retentionDays = Number.isFinite(config.retentionDays) && (config.retentionDays ?? 0) > 0
		? config.retentionDays!
		: DEFAULT_RETENTION_DAYS;
	const pricing: PricingConfig = resolvePricing(
		isRecord(config.models) ? config.models as Record<string, Partial<PriceEntry>> : undefined,
		isRecord(config.aliases) ? config.aliases as Record<string, string> : undefined,
		config.weekendOffpeakSince,
	);

	fs.mkdirSync(path.dirname(resolveDbPath()), { recursive: true });
	const store: Store = openStore(resolveDbPath());
	const repriced = store.repriceUsage(pricingSignature(pricing), (record) => {
		const result = priceTokens(
			record.inputTokens,
			record.outputTokens,
			record.cacheReadTokens,
			record.createdAt,
			record.model,
			pricing,
		);
		return {
			model: resolveModel(record.model, pricing),
			costNano: Math.round(result.cost * 1e9),
		};
	});
	if (repriced > 0) ctx.logger.info?.(`shadow-billing: repriced ${repriced} historical usage records`);

	let folding = false;
	let lastFold: { at: number; imported: number; repaired: number; scanned: number; errors: string[] } | null = null;

	async function runFold(): Promise<void> {
		if (folding) return;
		folding = true;
		try {
			const result = foldAllSessions(store, pricing, sessionsRoot, ctx.logger);
			lastFold = { at: Date.now(), imported: result.imported, repaired: result.repaired, scanned: result.scanned, errors: result.errors };
			if (result.imported > 0 || result.repaired > 0) {
				ctx.logger.info?.(`shadow-billing: folded ${result.scanned} sessions, imported ${result.imported}, repaired ${result.repaired}`);
			}
			// 明细保留清理：只删 usage_requests，聚合永久保留。
			if (retentionDays > 0) {
				const cutoffDay = dayOf(Date.now() - retentionDays * 86_400_000);
				store.db.prepare('DELETE FROM usage_requests WHERE day < ?').run(cutoffDay);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			ctx.logger.warn?.(`shadow-billing: fold failed: ${message}`);
		} finally {
			folding = false;
		}
	}

	// 启动即折叠一次，此后周期折叠。interval 返回的 disposer 随 fiber 清理。
	ctx.effect(() => {
		void runFold();
		return ctx.timer.interval(() => { void runFold(); }, foldIntervalMs);
	}, 'shadow-billing: session fold loop');

	ctx.effect(() => {
		const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
			const send: JsonSend = (status, value) => {
				res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
				res.end(JSON.stringify(value));
			};
			try {
				const query = parseQuery(req.url);
				const days = Math.max(0, Math.trunc(numberOr(query.days, 7)));
				const floor = dayFloor(days);
				if (req.method === 'GET' && req.url?.startsWith('/api/shadow-billing/summary')) {
					send(200, { ok: true, value: { days, ...store.summarySince(floor) } });
					return;
				}
				if (req.method === 'GET' && req.url?.startsWith('/api/shadow-billing/by-model')) {
					send(200, { ok: true, value: { days, models: store.byModelSince(floor) } });
					return;
				}
				if (req.method === 'GET' && req.url?.startsWith('/api/shadow-billing/daily')) {
					send(200, { ok: true, value: { days, daily: store.dailySince(floor) } });
					return;
				}
				if (req.method === 'GET' && req.url?.startsWith('/api/shadow-billing/requests')) {
					const page = Math.max(0, Math.trunc(numberOr(query.page, 0)));
					const size = Math.min(200, Math.max(1, Math.trunc(numberOr(query.size, 20))));
					const { rows, total } = store.requestsPage(floor, page * size, size);
					send(200, { ok: true, value: { days, page, size, total, rows } });
					return;
				}
				if (req.method === 'GET' && req.url?.startsWith('/api/shadow-billing/session')) {
					const sessionId = query.sessionId ?? '';
					if (sessionId === '') {
						send(400, { ok: false, error: { code: 'BAD_REQUEST', message: 'missing sessionId' } });
						return;
					}
					send(200, { ok: true, value: store.sessionSummary(sessionId) });
					return;
				}
				if (req.method === 'POST' && req.url?.startsWith('/api/shadow-billing/fold')) {
					await runFold();
					send(200, { ok: true, value: lastFold });
					return;
				}
				if (req.method === 'GET' && req.url?.startsWith('/api/shadow-billing/status')) {
					send(200, {
						ok: true,
						value: {
							sessionsRoot,
							dbPath: resolveDbPath(),
							foldIntervalMs,
							retentionDays,
							lastFold,
							pricing: { models: pricing.models, aliases: pricing.aliases, weekendOffpeakSince: pricing.weekendOffpeakSince },
						},
					});
					return;
				}
				send(404, { ok: false, error: { code: 'NOT_FOUND', message: 'no such route' } });
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				ctx.logger.warn?.(`shadow-billing: api error: ${message}`);
				send(500, { ok: false, error: { code: 'INTERNAL_ERROR', message } });
			}
		};
		return ctx.webServer.register({ kind: 'prefix', path: '/api/shadow-billing', handler });
	}, 'shadow-billing: api routes');
}

export { name, inject, apply };
