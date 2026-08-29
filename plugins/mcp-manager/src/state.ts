/**
 * dsh-mcp-manager Host state (DSH-026 / DSH-028).
 *
 * The web profile's cordis.patch.yml remains the runtime truth. This manager
 * owns exactly one marked block and records its lossless, secret-free model in
 * YAML comments beside the generated @deepseek-ai/dsh-mcp-client rows. Values
 * for environment variables and HTTP headers are never accepted; only names
 * of Host environment variables are persisted.
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { MARKETPLACE, findMarketplaceEntry, normalizeRegistryMarketplaceEntry, type MarketplaceEntry } from './marketplace.js';

export const API_VERSION = 1;
export const SERVERS_START = '# mcp-manager:servers:start';
export const SERVERS_END = '# mcp-manager:servers:end';
export const SERVER_META = '# mcp-manager:server ';

const MCP_PACKAGE = '@deepseek-ai/dsh-mcp-client';
const SERVER_NAME_RE = /^[A-Za-z0-9_-]{1,32}$/;
const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const HEADER_NAME_RE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,80}$/;
const ROW_ID_RE = /^[A-Za-z0-9_.-]{1,96}$/;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const ALLOWED_ICON_MIMES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
const ICON_TRUSTED_HOSTS = new Set([
	'avatars.githubusercontent.com',
	'github.com',
	'raw.githubusercontent.com',
	'user-images.githubusercontent.com',
]);

type UnknownRecord = Record<string, unknown>;
type Environment = Readonly<Record<string, string | undefined>>;
type ReferenceMap = Record<string, string>;

interface ServerBase {
	id: string;
	serverName: string;
	description: string;
	enabled: boolean;
	toolCallTimeoutMs: number;
	failOnStartupError: boolean;
	requiredEnv: string[];
	source: 'market' | 'manual';
	marketId: string | null;
	repository: string | null;
	iconUrl: string | null;
	revision: number;
	updatedAt: string;
}

export interface StdioServer extends ServerBase {
	transport: 'stdio';
	command: string;
	args: string[];
	env: ReferenceMap;
	cwd: string;
}

export interface HttpServer extends ServerBase {
	transport: 'streamable-http';
	url: string;
	headers: ReferenceMap;
}

export type McpServer = StdioServer | HttpServer;

interface ProfileOptions {
	profileDir?: string;
	dshHome?: string;
	profileName?: string;
}

interface RuntimeEntry {
	entryId: string;
	moduleName: string;
	enabled: boolean;
	fiberPhase: string | null;
}

interface ToolSchema {
	name: string;
	description: string;
}

interface RuntimeFacts {
	entries: RuntimeEntry[];
	schemas: ToolSchema[];
	inventoryError: string | null;
	toolsError: string | null;
}

interface McpDependencies {
	writeText?(path: string, text: string): Promise<void> | void;
	inventory?: { list(): unknown };
	tools?: { schemas(): unknown };
	env?: Environment;
	fetch?: typeof globalThis.fetch;
}

export interface McpManagerOptions extends ProfileOptions {
	deps?: McpDependencies;
	env?: Environment;
	cacheTtlMs?: number;
	registryUrl?: string;
	logger?: { warn?(...values: unknown[]): void };
}

interface CacheEntry {
	value: unknown;
	expiresAt: number;
}

function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorCode(error: unknown): string | undefined {
	return isRecord(error) && typeof error.code === 'string' ? error.code : undefined;
}

export class ApiError extends Error {
	readonly status: number;
	readonly code: string;

	constructor(status: number, message: string, code = 'MCP_MANAGER_ERROR') {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.code = code;
	}
}

export function resolveProfileDir(options: ProfileOptions = {}): string {
	if (options.profileDir) return resolve(options.profileDir);
	const dshHome = options.dshHome || process.env.DSH_HOME || join(homedir(), '.dsh');
	return resolve(dshHome, 'profiles', options.profileName || 'web');
}

async function readText(path: string, fallback = ''): Promise<string> {
	try {
		return await readFile(path, 'utf8');
	} catch (error) {
		if (errorCode(error) === 'ENOENT') return fallback;
		throw error;
	}
}

async function atomicWriteText(path: string, text: string, deps: McpDependencies = {}): Promise<void> {
	if (typeof deps.writeText === 'function') {
		await deps.writeText(path, text);
		return;
	}
	await mkdir(dirname(path), { recursive: true });
	const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
	try {
		await writeFile(tmp, text, 'utf8');
		await rename(tmp, path);
	} finally {
		await rm(tmp, { force: true }).catch(() => {});
	}
}

function normalizeNewline(text: string): string {
	return String(text).includes('\r\n') ? '\r\n' : '\n';
}

function markerOffsets(text: string, marker: string): number[] {
	const offsets: number[] = [];
	const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const pattern = new RegExp(`(^|\\n)${escaped}(?=\\r?(?:\\n|$))`, 'g');
	for (const match of text.matchAll(pattern)) {
		offsets.push((match.index ?? 0) + (match[1]?.length ?? 0));
	}
	return offsets;
}

function managedBlockBounds(text: string, start: string, end: string): { startAt: number; endAt: number } | null {
	const starts = markerOffsets(text, start);
	const ends = markerOffsets(text, end);
	if (starts.length === 0 && ends.length === 0) return null;
	if (starts.length !== 1 || ends.length !== 1 || starts[0] === undefined || ends[0] === undefined || starts[0] >= ends[0]) {
		throw new ApiError(500, 'MCP 受管配置块标记必须是唯一且有序的一对，请先修复 cordis.patch.yml', 'MANAGED_BLOCK_CORRUPT');
	}
	return { startAt: starts[0], endAt: ends[0] };
}

export function extractManagedBlock(text: string, start = SERVERS_START, end = SERVERS_END): string {
	const bounds = managedBlockBounds(text, start, end);
	if (bounds === null) return '';
	return text.slice(bounds.startAt + start.length, bounds.endAt);
}

export function replaceManagedBlock(text: string, body: string, start = SERVERS_START, end = SERVERS_END): string {
	const source = String(text || '');
	const nl = normalizeNewline(source);
	const cleanBody = String(body || '').trim();
	const block = cleanBody === '' ? '' : `${start}${nl}${cleanBody.replace(/\r?\n/g, nl)}${nl}${end}`;
	const bounds = managedBlockBounds(source, start, end);
	if (bounds !== null) {
		let after = bounds.endAt + end.length;
		if (source.slice(after, after + 2) === '\r\n') after += 2;
		else if (source[after] === '\n') after += 1;
		const beforeText = source.slice(0, bounds.startAt).replace(/[\t ]+$/gm, '').replace(/[\r\n]+$/, '');
		const afterText = source.slice(after).replace(/^[\r\n]+/, '');
		return [beforeText, block, afterText].filter(Boolean).join(nl + nl) + nl;
	}
	if (block === '') return source;
	return source.replace(/[\r\n]+$/, '') + nl + nl + block + nl;
}

function plainObject(value: unknown, field: string): UnknownRecord {
	if (value === undefined || value === null) return {};
	if (!isRecord(value)) throw new ApiError(400, `${field} 必须是对象`, 'CONFIG_INVALID');
	return value;
}

function cleanText(value: unknown, field: string, max: number, required = false): string {
	const text = String(value ?? '').trim();
	if (required && text === '') throw new ApiError(400, `${field} 不能为空`, 'CONFIG_INVALID');
	if (text.length > max) throw new ApiError(400, `${field} 不能超过 ${max} 个字符`, 'CONFIG_INVALID');
	return text;
}

function cleanStringArray(value: unknown, field: string, maxItems = 64, maxLength = 512): string[] {
	if (value === undefined || value === null) return [];
	if (!Array.isArray(value) || value.length > maxItems) throw new ApiError(400, `${field} 必须是最多 ${maxItems} 项的数组`, 'CONFIG_INVALID');
	return value.map((item) => cleanText(item, field, maxLength));
}

function cleanReferenceMap(value: unknown, field: string, keyPattern: RegExp): ReferenceMap {
	const input = plainObject(value, field);
	const result: ReferenceMap = {};
	const entries = Object.entries(input);
	if (entries.length > 64) throw new ApiError(400, `${field} 不能超过 64 项`, 'CONFIG_INVALID');
	for (const [rawKey, rawValue] of entries) {
		const key = cleanText(rawKey, `${field} 键`, 80, true);
		const source = cleanText(rawValue, `${field}.${key}`, 80, true);
		if (!keyPattern.test(key)) throw new ApiError(400, `${field} 包含非法名称：${key}`, 'CONFIG_INVALID');
		if (!ENV_NAME_RE.test(source)) throw new ApiError(400, `${field}.${key} 必须引用合法的环境变量名`, 'CONFIG_INVALID');
		result[key] = source;
	}
	return result;
}

function cleanUrl(value: unknown, field: string): string {
	const text = cleanText(value, field, 2048, true);
	let parsed;
	try { parsed = new URL(text); } catch { throw new ApiError(400, `${field} 不是合法 URL`, 'CONFIG_INVALID'); }
	if (parsed.protocol === 'https:') return parsed.toString();
	const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]' || parsed.hostname === '::1';
	if (parsed.protocol === 'http:' && local) return parsed.toString();
	throw new ApiError(400, `${field} 必须使用 HTTPS；仅本机地址允许 HTTP`, 'CONFIG_INVALID');
}

function safeOptionalIconUrl(value: unknown): string | null {
	if (!value) return null;
	try {
		const parsed = new URL(String(value));
		return parsed.protocol === 'https:' ? parsed.toString() : null;
	} catch { return null; }
}

function rowIdFor(serverName: string): string {
	return `mcp-manager-${serverName.toLowerCase().replace(/_/g, '-')}`;
}

export function normalizeServer(input: unknown, options: { id?: string } = {}): McpServer {
	if (!isRecord(input)) throw new ApiError(400, '服务器配置必须是对象', 'CONFIG_INVALID');
	const serverName = cleanText(input.serverName ?? input.name, '服务器名称', 32, true);
	if (!SERVER_NAME_RE.test(serverName)) throw new ApiError(400, '服务器名称只允许字母、数字、下划线和连字符，长度 1–32', 'CONFIG_INVALID');
	const transport = input.transport;
	if (transport !== 'stdio' && transport !== 'streamable-http') throw new ApiError(400, '传输方式必须是 stdio 或 streamable-http', 'CONFIG_INVALID');
	const id = cleanText(options.id || input.id || rowIdFor(serverName), '配置 ID', 96, true);
	if (!ROW_ID_RE.test(id)) throw new ApiError(400, '配置 ID 不合法', 'CONFIG_INVALID');
	const timeout = input.toolCallTimeoutMs === undefined ? 60_000 : Number(input.toolCallTimeoutMs);
	if (!Number.isInteger(timeout) || timeout < 1_000 || timeout > 600_000) throw new ApiError(400, '工具超时必须是 1000–600000 毫秒的整数', 'CONFIG_INVALID');
	const repository = input.repository === null || input.repository === undefined
		? null
		: cleanText(input.repository, '仓库', 200, true);
	if (repository !== null && !REPOSITORY_RE.test(repository)) throw new ApiError(400, '仓库必须是 owner/repository', 'CONFIG_INVALID');
	const declaredRequiredEnv = cleanStringArray(input.requiredEnv, '必需环境变量', 64, 80);
	for (const name of declaredRequiredEnv) if (!ENV_NAME_RE.test(name)) throw new ApiError(400, `非法环境变量名：${name}`, 'CONFIG_INVALID');
	const base: Omit<ServerBase, 'requiredEnv'> = {
		id,
		serverName,
		description: cleanText(input.description, '描述', 240),
		enabled: input.enabled === undefined ? true : input.enabled === true,
		toolCallTimeoutMs: timeout,
		failOnStartupError: input.failOnStartupError === true,
		source: input.source === 'market' ? 'market' : 'manual',
		marketId: input.marketId === null || input.marketId === undefined
			? null
			: cleanText(input.marketId, '市场 ID', 200, true),
		repository,
		iconUrl: safeOptionalIconUrl(input.iconUrl),
		revision: typeof input.revision === 'number' && Number.isInteger(input.revision) && input.revision >= 0 ? input.revision : 0,
		updatedAt: typeof input.updatedAt === 'string' && !Number.isNaN(Date.parse(input.updatedAt)) ? input.updatedAt : new Date().toISOString(),
	};
	if (transport === 'stdio') {
		const cwd = cleanText(input.cwd, '工作目录', 1024);
		if (cwd !== '' && !isAbsolute(cwd)) throw new ApiError(400, 'stdio 工作目录必须是绝对路径', 'CONFIG_INVALID');
		const env = cleanReferenceMap(input.env, '环境变量映射', ENV_NAME_RE);
		return {
			...base,
			transport,
			requiredEnv: [...new Set([...declaredRequiredEnv, ...Object.values(env)])],
			command: cleanText(input.command, '启动命令', 1024, true),
			args: cleanStringArray(input.args, '启动参数'),
			env,
			cwd,
		};
	}
	const headers = cleanReferenceMap(input.headers, '请求头映射', HEADER_NAME_RE);
	return {
		...base,
		transport,
		requiredEnv: [...new Set([...declaredRequiredEnv, ...Object.values(headers)])],
		url: cleanUrl(input.url, 'MCP 端点'),
		headers,
	};
}

function quoteYaml(value: unknown): string {
	return `'${String(value).replace(/'/g, "''")}'`;
}

function envExpression(name: string): string {
	return `!!js process.env.${name}`;
}

export function serializeServers(servers: readonly McpServer[]): string {
	if (servers.length === 0) return '';
	const lines = ['- insert:'];
	for (const server of servers) {
		lines.push(`  ${SERVER_META}${JSON.stringify(server)}`);
		lines.push(`  - id: ${quoteYaml(server.id)}`);
		lines.push(`    name: ${quoteYaml(MCP_PACKAGE)}`);
		lines.push(`    disabled: ${server.enabled ? 'false' : 'true'}`);
		lines.push('    config:');
		lines.push(`      serverName: ${quoteYaml(server.serverName)}`);
		lines.push(`      transport: ${quoteYaml(server.transport)}`);
		if (server.transport === 'stdio') {
			lines.push(`      command: ${quoteYaml(server.command)}`);
			lines.push('      args:');
			for (const arg of server.args) lines.push(`        - ${quoteYaml(arg)}`);
			if (server.args.length === 0) lines[lines.length - 1] = '      args: []';
			if (Object.keys(server.env).length === 0) lines.push('      env: {}');
			else {
				lines.push('      env:');
				for (const [name, source] of Object.entries(server.env).sort(([a], [b]) => a.localeCompare(b))) {
					lines.push(`        ${quoteYaml(name)}: ${envExpression(source)}`);
				}
			}
			lines.push(`      cwd: ${quoteYaml(server.cwd)}`);
		} else {
			lines.push(`      url: ${quoteYaml(server.url)}`);
			if (Object.keys(server.headers).length === 0) lines.push('      headers: {}');
			else {
				lines.push('      headers:');
				for (const [name, source] of Object.entries(server.headers).sort(([a], [b]) => a.localeCompare(b))) {
					lines.push(`        ${quoteYaml(name)}: ${envExpression(source)}`);
				}
			}
		}
		lines.push(`      toolCallTimeoutMs: ${server.toolCallTimeoutMs}`);
		lines.push(`      failOnStartupError: ${server.failOnStartupError ? 'true' : 'false'}`);
	}
	return lines.join('\n');
}

export function parseServers(text: string): McpServer[] {
	const block = extractManagedBlock(String(text || ''));
	if (block === '') return [];
	const servers: McpServer[] = [];
	for (const line of block.split(/\r?\n/)) {
		const at = line.indexOf(SERVER_META);
		if (at < 0) continue;
		let raw: unknown;
		try { raw = JSON.parse(line.slice(at + SERVER_META.length)); }
		catch { throw new ApiError(500, 'MCP 受管配置元数据损坏，请先修复 cordis.patch.yml', 'MANAGED_BLOCK_CORRUPT'); }
		try { servers.push(normalizeServer(raw, { ...(isRecord(raw) && typeof raw.id === 'string' ? { id: raw.id } : {}) })); }
		catch (error) {
			throw new ApiError(500, `MCP 受管配置无效：${error instanceof Error ? error.message : String(error)}`, 'MANAGED_BLOCK_CORRUPT');
		}
	}
	const ids = new Set<string>();
	const names = new Set<string>();
	for (const server of servers) {
		if (ids.has(server.id) || names.has(server.serverName.toLowerCase())) throw new ApiError(500, 'MCP 受管配置包含重复服务器', 'MANAGED_BLOCK_CORRUPT');
		ids.add(server.id);
		names.add(server.serverName.toLowerCase());
	}
	return servers;
}

function touched(server: McpServer): McpServer {
	return { ...server, revision: server.revision + 1, updatedAt: new Date().toISOString() };
}

function runtimeFacts(deps: McpDependencies): RuntimeFacts {
	let entries: RuntimeEntry[] = [];
	let inventoryError: string | null = null;
	try {
		const answer = deps.inventory && typeof deps.inventory.list === 'function' ? deps.inventory.list() : null;
		const rawEntries = isRecord(answer) && Array.isArray(answer.entries) ? answer.entries : [];
		entries = rawEntries.map((value): RuntimeEntry => {
			const entry = isRecord(value) ? value : {};
			return {
			entryId: typeof entry.entryId === 'string' ? entry.entryId : '',
			moduleName: typeof entry.moduleName === 'string' ? entry.moduleName : '',
			enabled: entry.enabled === true,
			fiberPhase: typeof entry.fiberPhase === 'string' ? entry.fiberPhase : null,
			};
		});
	} catch (error) { inventoryError = error instanceof Error ? error.message : String(error); }
	let schemas: ToolSchema[] = [];
	let toolsError: string | null = null;
	try {
		const answer = deps.tools && typeof deps.tools.schemas === 'function' ? deps.tools.schemas() : [];
		schemas = Array.isArray(answer) ? answer.map((value): ToolSchema => {
			const schema = isRecord(value) ? value : {};
			return {
				name: typeof schema.name === 'string' ? schema.name : '',
				description: typeof schema.description === 'string' ? schema.description : '',
			};
		}).filter((schema) => schema.name !== '') : [];
	} catch (error) { toolsError = error instanceof Error ? error.message : String(error); }
	return { entries, schemas, inventoryError, toolsError };
}

function statusOf(server: McpServer, row: RuntimeEntry | undefined, toolCount: number, missingEnvironment: readonly string[]): string {
	if (!server.enabled) return 'disabled';
	if (missingEnvironment.length > 0) return 'needs-environment';
	if (!row) return 'not-loaded';
	if (!row.enabled) return 'disabled';
	if (row.fiberPhase === 'loading' || row.fiberPhase === 'pending') return 'connecting';
	if (row.fiberPhase === 'failed') return 'failed';
	if (row.fiberPhase === 'unloading') return 'disconnecting';
	if (row.fiberPhase === 'active') return toolCount > 0 ? 'connected' : 'connected-empty';
	return 'not-loaded';
}

function projectServer(server: McpServer, facts: RuntimeFacts, env: Environment) {
	const row = facts.entries.find((entry) => entry.entryId === server.id && entry.moduleName === MCP_PACKAGE)
		|| facts.entries.find((entry) => entry.entryId === server.id);
	const prefix = `mcp__${server.serverName}__`;
	const tools = facts.schemas.filter((schema) => schema.name.startsWith(prefix)).map((schema) => ({
		name: schema.name.slice(prefix.length),
		publicName: schema.name,
		description: schema.description,
	}));
	const missingEnvironment = server.requiredEnv.filter((name) => !env[name]);
	return {
		...server,
		status: statusOf(server, row, tools.length, missingEnvironment),
		fiberPhase: row?.fiberPhase ?? null,
		toolCount: tools.length,
		tools,
		missingEnvironment,
		endpoint: server.transport === 'stdio' ? [server.command, ...server.args].join(' ') : server.url,
	};
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function safeRepositoryUrl(repository: string): string {
	return `https://github.com/${repository}`;
}

function registryIcon(server: unknown, repositoryUrl: string): string | null {
	const record = isRecord(server) ? server : {};
	const icons = Array.isArray(record.icons) ? record.icons : [];
	const trusted = new Set(ICON_TRUSTED_HOSTS);
	try { trusted.add(new URL(repositoryUrl).hostname); } catch {}
	for (const value of Array.isArray(record.remotes) ? record.remotes : []) {
		const remote = isRecord(value) ? value : {};
		try { if (typeof remote.url === 'string') trusted.add(new URL(remote.url).hostname); } catch {}
	}
	for (const value of icons) {
		const icon = isRecord(value) ? value : {};
		if (typeof icon.src !== 'string') continue;
		if (typeof icon.mimeType === 'string' && !ALLOWED_ICON_MIMES.has(icon.mimeType)) continue;
		try {
			const parsed = new URL(icon.src);
			if (parsed.protocol === 'https:' && trusted.has(parsed.hostname)) return parsed.toString();
		} catch {}
	}
	return null;
}

export function createMcpManager(options: McpManagerOptions = {}) {
	const profileDir = resolveProfileDir(options);
	const profileName = options.profileName || 'web';
	const patchPath = join(profileDir, 'cordis.patch.yml');
	const deps = options.deps || {};
	const env = options.env || deps.env || process.env;
	const fetchImpl = deps.fetch || globalThis.fetch;
	const cache = new Map<string, CacheEntry>();
	const cacheTtlMs = options.cacheTtlMs || 10 * 60_000;
	const registryBaseUrl = String(options.registryUrl || 'https://registry.modelcontextprotocol.io').replace(/\/$/, '');
	const discoveredEntries = new Map<string, MarketplaceEntry>();
	const discoveredRecords = new Map<string, unknown>();
	let mutation: Promise<unknown> = Promise.resolve();

	async function readState(): Promise<{ patch: string; servers: McpServer[] }> {
		const patch = await readText(patchPath, '');
		return { patch, servers: parseServers(patch) };
	}

	async function writeState(patch: string, servers: readonly McpServer[]): Promise<string> {
		const next = replaceManagedBlock(patch, serializeServers(servers));
		await atomicWriteText(patchPath, next, deps);
		return next;
	}

	function serialized<T>(work: () => Promise<T>): Promise<T> {
		const run = mutation.then(work, work);
		mutation = run.catch(() => {});
		return run;
	}

	function ensureUnique(servers: readonly McpServer[], candidate: McpServer, exceptId: string | null = null): void {
		if (servers.some((server) => server.id !== exceptId && server.serverName.toLowerCase() === candidate.serverName.toLowerCase())) {
			throw new ApiError(409, `服务器名称已存在：${candidate.serverName}`, 'SERVER_EXISTS');
		}
		if (servers.some((server) => server.id !== exceptId && server.id === candidate.id)) {
			throw new ApiError(409, `配置 ID 已存在：${candidate.id}`, 'SERVER_EXISTS');
		}
	}

	async function snapshot() {
		const { servers } = await readState();
		const facts = runtimeFacts(deps);
		const projected = servers.map((server) => projectServer(server, facts, env));
		return {
			apiVersion: API_VERSION,
			profile: profileName,
			hotReload: true,
			observedAt: new Date().toISOString(),
			connected: projected.filter((server) => server.status === 'connected' || server.status === 'connected-empty').length,
			servers: projected,
			diagnostics: {
				inventory: facts.inventoryError,
				tools: facts.toolsError,
			},
		};
	}

	async function requestJson(url: string, optional = false): Promise<unknown> {
		if (typeof fetchImpl !== 'function') throw new Error('Host 未提供 fetch，无法读取远程元数据');
		const timeout = globalThis.AbortSignal && typeof globalThis.AbortSignal.timeout === 'function'
			? globalThis.AbortSignal.timeout(8_000)
			: undefined;
		const headers: Record<string, string> = {
				accept: 'application/vnd.github+json, application/json',
				'user-agent': 'dsh-mcp-manager/0.2.0',
		};
		const githubToken = env.GITHUB_TOKEN || env.GH_TOKEN;
		if (githubToken && url.startsWith('https://api.github.com/')) headers.authorization = `Bearer ${githubToken}`;
		const response = await fetchImpl(url, {
			headers,
			...(timeout ? { signal: timeout } : {}),
		});
		if (optional && response.status === 404) return null;
		if (!response.ok) {
			const remaining = response.headers?.get?.('x-ratelimit-remaining');
			throw new Error(`远程元数据请求失败（HTTP ${response.status}${remaining === '0' ? '，GitHub API 已限流' : ''}）`);
		}
		const length = Number(response.headers?.get?.('content-length') || 0);
		if (Number.isFinite(length) && length > 5 * 1024 * 1024) throw new Error('远程元数据响应超过 5 MiB 上限');
		const value = await response.json();
		if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 5 * 1024 * 1024) throw new Error('远程元数据响应超过 5 MiB 上限');
		return value;
	}

	async function cached<T>(key: string, force: boolean, load: () => Promise<T>): Promise<{ value: T; stale: boolean; error?: string }> {
		const hit = cache.get(key);
		if (!force && hit && hit.expiresAt > Date.now()) return { value: hit.value as T, stale: false };
		try {
			const value = await load();
			cache.set(key, { value, expiresAt: Date.now() + cacheTtlMs });
			return { value, stale: false };
		} catch (error) {
			if (hit) return { value: hit.value as T, stale: true, error: errorMessage(error) };
			throw error;
		}
	}

	async function githubRepository(entry: MarketplaceEntry, force: boolean) {
		if (entry.repository === null) throw new Error('该 Registry 条目没有 GitHub 仓库');
		const url = `https://api.github.com/repos/${entry.repository}`;
		return cached(`github:${entry.id}`, force, async () => {
			const repo = plainObject(await requestJson(url), 'GitHub repository response');
			const owner = isRecord(repo.owner) ? repo.owner : {};
			const license = isRecord(repo.license) ? repo.license : {};
			return {
				url: typeof repo.html_url === 'string' ? repo.html_url : safeRepositoryUrl(entry.repository!),
				description: typeof repo.description === 'string' && repo.description.trim() ? repo.description.trim() : entry.description,
				author: typeof owner.login === 'string' ? owner.login : entry.repository?.split('/')[0] ?? null,
				iconUrl: safeOptionalIconUrl(owner.avatar_url),
				stars: Number.isFinite(repo.stargazers_count) ? repo.stargazers_count : null,
				forks: Number.isFinite(repo.forks_count) ? repo.forks_count : null,
				language: typeof repo.language === 'string' ? repo.language : null,
				license: typeof license.spdx_id === 'string' && license.spdx_id !== 'NOASSERTION' ? license.spdx_id : null,
				lastPushedAt: typeof repo.pushed_at === 'string' ? repo.pushed_at : null,
				topics: Array.isArray(repo.topics) ? repo.topics.filter((item) => typeof item === 'string').slice(0, 12) : [],
			};
		});
	}

	async function registryDetail(entry: MarketplaceEntry, force: boolean) {
		if (!entry.registryName) return { value: null, stale: false };
		const encoded = encodeURIComponent(entry.registryName);
		return cached(`registry:${entry.id}`, force, async () => {
			const answer = await requestJson(`${registryBaseUrl}/v0.1/servers/${encoded}/versions/latest`, true);
			if (!isRecord(answer)) return null;
			return isRecord(answer.server) ? answer.server : answer;
		});
	}

	async function githubRelease(entry: MarketplaceEntry, force: boolean) {
		if (entry.repository === null) return { value: null, stale: false };
		return cached(`release:${entry.id}`, force, async () => {
			const release = await requestJson(`https://api.github.com/repos/${entry.repository}/releases/latest`, true);
			if (!isRecord(release)) return null;
			return {
				version: typeof release.tag_name === 'string' ? release.tag_name : null,
				publishedAt: typeof release.published_at === 'string' ? release.published_at : null,
				url: typeof release.html_url === 'string' ? release.html_url : null,
			};
		});
	}

	async function marketSummary(entry: MarketplaceEntry, force = false) {
		const repositoryUrl = entry.repositoryUrl || (entry.repository ? safeRepositoryUrl(entry.repository) : registryBaseUrl);
		const [githubResult, registryResult] = await Promise.allSettled([
			entry.repository ? githubRepository(entry, force) : Promise.resolve({ value: null, stale: false }),
			registryDetail(entry, force),
		]);
		const github = githubResult.status === 'fulfilled' ? githubResult.value.value : null;
		const registry = registryResult.status === 'fulfilled' ? registryResult.value.value : null;
		const registryRecord = isRecord(registry) ? registry : {};
		const iconUrl = registryIcon(registry, github?.url || repositoryUrl) || entry.iconUrl || github?.iconUrl || null;
		const errors: string[] = [];
		if (githubResult.status === 'rejected') errors.push(errorMessage(githubResult.reason));
		if (registryResult.status === 'rejected') errors.push(errorMessage(registryResult.reason));
		return {
			id: entry.id,
			name: entry.name,
			repository: entry.repository,
			repositoryUrl: github?.url || repositoryUrl,
			description: github?.description || (typeof registryRecord.description === 'string' ? registryRecord.description : null) || entry.description,
			iconUrl,
			iconSource: registryIcon(registry, github?.url || repositoryUrl) ? 'registry' : github?.iconUrl ? 'github' : 'generic',
			installable: entry.install !== null,
			installReason: entry.installReason,
			source: entry.source,
			registryName: entry.registryName,
			registryVersion: typeof registryRecord.version === 'string' ? registryRecord.version : entry.version,
			stale: Boolean(githubResult.status === 'fulfilled' && githubResult.value.stale) || Boolean(registryResult.status === 'fulfilled' && registryResult.value.stale),
			metadataError: errors.length > 0 ? errors.join('；') : null,
			github,
			registry,
		};
	}

	async function officialRegistryPage(query: string, cursor: string, limit: number, force: boolean) {
		const params = new URLSearchParams({ limit: String(limit), version: 'latest' });
		if (query !== '') params.set('search', query);
		if (cursor !== '') params.set('cursor', cursor);
		return cached(`official-list:${query}:${cursor}:${limit}`, force, async () => {
			const value = await requestJson(`${registryBaseUrl}/v0.1/servers?${params.toString()}`);
			if (!isRecord(value) || !Array.isArray(value.servers)) throw new Error('MCP Registry 列表格式无效');
			const entries: MarketplaceEntry[] = [];
			for (const record of value.servers) {
				const entry = normalizeRegistryMarketplaceEntry(record);
				if (entry === null) continue;
				discoveredEntries.set(entry.id, entry);
				discoveredRecords.set(entry.id, record);
				entries.push(entry);
			}
			const metadata = isRecord(value.metadata) ? value.metadata : {};
			return { entries, nextCursor: typeof metadata.nextCursor === 'string' ? metadata.nextCursor : null };
		});
	}

	function matchesMarket(entry: MarketplaceEntry, query: string): boolean {
		if (query === '') return true;
		const needle = query.toLowerCase();
		return entry.name.toLowerCase().includes(needle)
			|| entry.description.toLowerCase().includes(needle)
			|| String(entry.repository || '').toLowerCase().includes(needle)
			|| String(entry.registryName || '').toLowerCase().includes(needle);
	}

	async function resolveMarketplaceEntry(id: string, force = false): Promise<MarketplaceEntry> {
		const featured = findMarketplaceEntry(id);
		if (featured) return featured;
		const discovered = discoveredEntries.get(id);
		if (discovered && !force) return discovered;
		if (!id.startsWith('registry:')) throw new ApiError(404, '市场条目不存在', 'MARKET_NOT_FOUND');
		const registryName = id.slice('registry:'.length);
		const value = await requestJson(`${registryBaseUrl}/v0.1/servers/${encodeURIComponent(registryName)}/versions/latest`);
		const entry = normalizeRegistryMarketplaceEntry(value);
		if (entry === null || entry.id !== id) throw new ApiError(404, '市场条目不存在', 'MARKET_NOT_FOUND');
		discoveredEntries.set(entry.id, entry);
		discoveredRecords.set(entry.id, value);
		return entry;
	}

	async function marketplace(input: UnknownRecord = {}) {
		const query = cleanText(input.query, '搜索词', 120).trim();
		const cursor = cleanText(input.cursor, '分页游标', 1000).trim();
		const requestedLimit = Number(input.limit);
		const limit = Number.isInteger(requestedLimit) ? Math.min(50, Math.max(5, requestedLimit)) : 24;
		const force = input.force === true;
		const { servers } = await readState();
		let registryResult: Awaited<ReturnType<typeof officialRegistryPage>> | null = null;
		let registryWarning: string | null = null;
		try {
			registryResult = await officialRegistryPage(query, cursor, limit, force);
			registryWarning = registryResult.error || null;
		} catch (error) {
			registryWarning = errorMessage(error);
		}
		const base = cursor === '' ? MARKETPLACE.filter((entry) => matchesMarket(entry, query)) : [];
		const merged: MarketplaceEntry[] = [];
		const seen = new Set<string>();
		for (const entry of [...base, ...(registryResult?.value.entries || [])]) {
			const key = (entry.registryName || entry.repository || entry.id).toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			merged.push(entry);
		}
		const summaries = await Promise.all(merged.map((entry) => entry.source === 'featured'
			? marketSummary(entry, force)
			: Promise.resolve({
				id: entry.id,
				name: entry.name,
				repository: entry.repository,
				repositoryUrl: entry.repositoryUrl || registryBaseUrl,
				description: entry.description,
				iconUrl: registryIcon(discoveredRecords.get(entry.id), entry.repositoryUrl || registryBaseUrl) || entry.iconUrl,
				iconSource: entry.iconUrl ? 'registry' : 'generic',
				installable: entry.install !== null,
				installReason: entry.installReason,
				source: entry.source,
				registryName: entry.registryName,
				registryVersion: entry.version,
				stale: registryResult?.stale === true,
				metadataError: null,
				github: null,
				registry: discoveredRecords.get(entry.id),
			})));
		return {
			apiVersion: API_VERSION,
			source: 'featured+mcp-registry',
			query,
			warning: registryWarning,
			page: {
				limit,
				nextCursor: registryResult?.value.nextCursor || null,
				hasMore: Boolean(registryResult?.value.nextCursor),
			},
			items: summaries.map((item) => {
				const installed = servers.find((server) => server.marketId === item.id || (item.repository !== null && server.repository === item.repository));
				return {
					id: item.id,
					name: item.name,
					repository: item.repository,
					repositoryUrl: item.repositoryUrl,
					registryName: item.registryName,
					version: item.registryVersion,
					description: item.description,
					iconUrl: item.iconUrl,
					iconSource: item.iconSource,
					source: item.source,
					installable: item.installable,
					installReason: item.installReason,
					status: installed ? 'installed' : 'not-installed',
					serverId: installed?.id ?? null,
					stale: item.stale,
					metadataError: item.metadataError,
				};
			}),
		};
	}

	async function marketplaceDetail(id: string, force = false) {
		const entry = await resolveMarketplaceEntry(id, force);
		const [{ servers }, summary, releaseResult] = await Promise.all([
			readState(),
			marketSummary(entry, force),
			githubRelease(entry, force).catch((error) => ({ value: null, stale: false, error: errorMessage(error) })),
		]);
		const installed = servers.find((server) => server.marketId === entry.id || (entry.repository !== null && server.repository === entry.repository));
		const github = summary.github;
		const release = releaseResult.value;
		return {
			id: entry.id,
			name: entry.name,
			repository: entry.repository,
			url: summary.repositoryUrl,
			description: summary.description,
			iconUrl: summary.iconUrl,
			iconSource: summary.iconSource,
			author: github?.author ?? null,
			stars: github?.stars ?? null,
			forks: github?.forks ?? null,
			language: github?.language ?? null,
			license: github?.license ?? null,
			lastPushedAt: github?.lastPushedAt ?? null,
			topics: github?.topics ?? [],
			latestVersion: release?.version || summary.registryVersion || null,
			releasePublishedAt: release?.publishedAt || null,
			releaseUrl: release?.url || null,
			registryName: summary.registryName,
			source: summary.source,
			installReason: summary.installReason,
			installable: summary.installable,
			status: installed ? 'installed' : 'not-installed',
			serverId: installed?.id ?? null,
			stale: summary.stale || releaseResult.stale === true,
			metadataError: summary.metadataError || releaseResult.error || null,
		};
	}

	async function createServer(input: unknown) {
		return serialized(async () => {
			const state = await readState();
			const server = touched(normalizeServer(input));
			const missing = server.requiredEnv.filter((name) => !env[name]);
			if (server.enabled && missing.length > 0) throw new ApiError(409, `缺少必需环境变量：${missing.join('、')}`, 'ENV_REQUIRED');
			ensureUnique(state.servers, server);
			await writeState(state.patch, [...state.servers, server]);
			return { changed: true, hotReload: true, server: projectServer(server, runtimeFacts(deps), env) };
		});
	}

	async function updateServer(id: string, input: unknown) {
		return serialized(async () => {
			const state = await readState();
			const index = state.servers.findIndex((server) => server.id === id);
			if (index < 0) throw new ApiError(404, '服务器不存在', 'SERVER_NOT_FOUND');
			const current = state.servers[index];
			if (current === undefined) throw new ApiError(404, '服务器不存在', 'SERVER_NOT_FOUND');
			const patch = plainObject(input, '服务器配置');
			const server = touched(normalizeServer({ ...patch, id, source: current.source, marketId: current.marketId, repository: current.repository, iconUrl: current.iconUrl }, { id }));
			const missing = server.requiredEnv.filter((name) => !env[name]);
			if (server.enabled && missing.length > 0) throw new ApiError(409, `缺少必需环境变量：${missing.join('、')}`, 'ENV_REQUIRED');
			ensureUnique(state.servers, server, id);
			const next = state.servers.slice();
			next[index] = server;
			await writeState(state.patch, next);
			return { changed: true, hotReload: true, server: projectServer(server, runtimeFacts(deps), env) };
		});
	}

	async function setEnabled(id: string, enabled: unknown) {
		if (typeof enabled !== 'boolean') throw new ApiError(400, 'enabled 必须是布尔值', 'CONFIG_INVALID');
		return serialized(async () => {
			const state = await readState();
			const index = state.servers.findIndex((server) => server.id === id);
			if (index < 0) throw new ApiError(404, '服务器不存在', 'SERVER_NOT_FOUND');
			const current = state.servers[index];
			if (current === undefined) throw new ApiError(404, '服务器不存在', 'SERVER_NOT_FOUND');
			const missing = current.requiredEnv.filter((name) => !env[name]);
			if (enabled && missing.length > 0) throw new ApiError(409, `缺少必需环境变量：${missing.join('、')}`, 'ENV_REQUIRED');
			if (current.enabled === enabled) return { changed: false, hotReload: false, server: projectServer(current, runtimeFacts(deps), env) };
			const server = touched({ ...current, enabled });
			const next = state.servers.slice();
			next[index] = server;
			await writeState(state.patch, next);
			return { changed: true, hotReload: true, server: projectServer(server, runtimeFacts(deps), env) };
		});
	}

	async function reconnect(id: string) {
		return serialized(async () => {
			const state = await readState();
			const index = state.servers.findIndex((server) => server.id === id);
			if (index < 0) throw new ApiError(404, '服务器不存在', 'SERVER_NOT_FOUND');
			const current = state.servers[index];
			if (current === undefined) throw new ApiError(404, '服务器不存在', 'SERVER_NOT_FOUND');
			if (!current.enabled) throw new ApiError(409, '请先启用服务器再重新连接', 'SERVER_DISABLED');
			const server = touched(current);
			const next = state.servers.slice();
			next[index] = server;
			await writeState(state.patch, next);
			return { changed: true, hotReload: true };
		});
	}

	async function removeServer(id: string) {
		return serialized(async () => {
			const state = await readState();
			if (!state.servers.some((server) => server.id === id)) throw new ApiError(404, '服务器不存在', 'SERVER_NOT_FOUND');
			await writeState(state.patch, state.servers.filter((server) => server.id !== id));
			return { changed: true, hotReload: true };
		});
	}

	async function installMarket(id: string) {
		const entry = await resolveMarketplaceEntry(id, true);
		if (!entry.install) throw new ApiError(409, entry.installReason || 'Registry 元数据无法安全推导安装配置', 'MARKET_NOT_INSTALLABLE');
		return serialized(async () => {
			const state = await readState();
			const existing = state.servers.find((server) => server.marketId === entry.id || (entry.repository !== null && server.repository === entry.repository));
			if (existing) return { changed: false, hotReload: false, server: projectServer(existing, runtimeFacts(deps), env) };
			const summary = await marketSummary(entry).catch(() => null);
			const server = touched(normalizeServer({
				...entry.install,
				enabled: false,
				source: 'market',
				marketId: entry.id,
				repository: entry.repository,
				iconUrl: summary?.iconUrl || null,
			}));
			ensureUnique(state.servers, server);
			await writeState(state.patch, [...state.servers, server]);
			return { changed: true, hotReload: true, installedDisabled: true, server: projectServer(server, runtimeFacts(deps), env) };
		});
	}

	return {
		profileDir,
		patchPath,
		// Dynamic operation dispatch intentionally exposes heterogeneous JSON shapes.
		async call(op: unknown, body: UnknownRecord = {}): Promise<any> {
			switch (op) {
				case 'capabilities': return { apiVersion: API_VERSION, features: ['server-list', 'server-mutate', 'hot-reload', 'tool-projection', 'marketplace', 'official-registry', 'remote-search', 'cursor-pagination', 'safe-install-projection', 'registry-icons', 'github-avatar-fallback'] };
				case 'list': return snapshot();
				case 'create': return createServer(body.server);
				case 'update': return updateServer(cleanText(body.id, '服务器 ID', 96, true), body.server);
				case 'setEnabled': return setEnabled(cleanText(body.id, '服务器 ID', 96, true), body.enabled);
				case 'reconnect': return reconnect(cleanText(body.id, '服务器 ID', 96, true));
				case 'delete': return removeServer(cleanText(body.id, '服务器 ID', 96, true));
				case 'marketplace': return marketplace(body);
				case 'marketplace.detail': return marketplaceDetail(cleanText(body.id, '市场 ID', 512, true), body.force === true);
				case 'marketplace.install': return installMarket(cleanText(body.id, '市场 ID', 512, true));
				default: throw new ApiError(400, `不支持的操作：${String(op || '')}`, 'OP_NOT_SUPPORTED');
			}
		},
	};
}
