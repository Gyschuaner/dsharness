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
import { MARKETPLACE, findMarketplaceEntry } from './marketplace.js';

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

export class ApiError extends Error {
	constructor(status, message, code = 'MCP_MANAGER_ERROR') {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.code = code;
	}
}

export function resolveProfileDir(options = {}) {
	if (options.profileDir) return resolve(options.profileDir);
	const dshHome = options.dshHome || process.env.DSH_HOME || join(homedir(), '.dsh');
	return resolve(dshHome, 'profiles', options.profileName || 'web');
}

async function readText(path, fallback = '') {
	try {
		return await readFile(path, 'utf8');
	} catch (error) {
		if (error && error.code === 'ENOENT') return fallback;
		throw error;
	}
}

async function atomicWriteText(path, text, deps = {}) {
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

function normalizeNewline(text) {
	return String(text).includes('\r\n') ? '\r\n' : '\n';
}

export function extractManagedBlock(text, start = SERVERS_START, end = SERVERS_END) {
	const startAt = text.indexOf(start);
	if (startAt < 0) return '';
	const endAt = text.indexOf(end, startAt + start.length);
	if (endAt < 0) throw new ApiError(500, 'MCP 受管配置块不完整，请先修复 cordis.patch.yml', 'MANAGED_BLOCK_CORRUPT');
	return text.slice(startAt + start.length, endAt);
}

export function replaceManagedBlock(text, body, start = SERVERS_START, end = SERVERS_END) {
	const source = String(text || '');
	const nl = normalizeNewline(source);
	const cleanBody = String(body || '').trim();
	const block = cleanBody === '' ? '' : `${start}${nl}${cleanBody.replace(/\r?\n/g, nl)}${nl}${end}`;
	const startAt = source.indexOf(start);
	if (startAt >= 0) {
		const endAt = source.indexOf(end, startAt + start.length);
		if (endAt < 0) throw new ApiError(500, 'MCP 受管配置块不完整，请先修复 cordis.patch.yml', 'MANAGED_BLOCK_CORRUPT');
		let after = endAt + end.length;
		if (source.slice(after, after + 2) === '\r\n') after += 2;
		else if (source[after] === '\n') after += 1;
		const beforeText = source.slice(0, startAt).replace(/[\t ]+$/gm, '').replace(/[\r\n]+$/, '');
		const afterText = source.slice(after).replace(/^[\r\n]+/, '');
		return [beforeText, block, afterText].filter(Boolean).join(nl + nl) + nl;
	}
	if (block === '') return source;
	return source.replace(/[\r\n]+$/, '') + nl + nl + block + nl;
}

function plainObject(value, field) {
	if (value === undefined || value === null) return {};
	if (typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, `${field} 必须是对象`, 'CONFIG_INVALID');
	return value;
}

function cleanText(value, field, max, required = false) {
	const text = String(value ?? '').trim();
	if (required && text === '') throw new ApiError(400, `${field} 不能为空`, 'CONFIG_INVALID');
	if (text.length > max) throw new ApiError(400, `${field} 不能超过 ${max} 个字符`, 'CONFIG_INVALID');
	return text;
}

function cleanStringArray(value, field, maxItems = 64, maxLength = 512) {
	if (value === undefined || value === null) return [];
	if (!Array.isArray(value) || value.length > maxItems) throw new ApiError(400, `${field} 必须是最多 ${maxItems} 项的数组`, 'CONFIG_INVALID');
	return value.map((item) => cleanText(item, field, maxLength));
}

function cleanReferenceMap(value, field, keyPattern) {
	const input = plainObject(value, field);
	const result = {};
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

function cleanUrl(value, field) {
	const text = cleanText(value, field, 2048, true);
	let parsed;
	try { parsed = new URL(text); } catch { throw new ApiError(400, `${field} 不是合法 URL`, 'CONFIG_INVALID'); }
	if (parsed.protocol === 'https:') return parsed.toString();
	const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]' || parsed.hostname === '::1';
	if (parsed.protocol === 'http:' && local) return parsed.toString();
	throw new ApiError(400, `${field} 必须使用 HTTPS；仅本机地址允许 HTTP`, 'CONFIG_INVALID');
}

function safeOptionalIconUrl(value) {
	if (!value) return null;
	try {
		const parsed = new URL(String(value));
		return parsed.protocol === 'https:' ? parsed.toString() : null;
	} catch { return null; }
}

function rowIdFor(serverName) {
	return `mcp-manager-${serverName.toLowerCase().replace(/_/g, '-')}`;
}

export function normalizeServer(input, options = {}) {
	if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400, '服务器配置必须是对象', 'CONFIG_INVALID');
	const serverName = cleanText(input.serverName ?? input.name, '服务器名称', 32, true);
	if (!SERVER_NAME_RE.test(serverName)) throw new ApiError(400, '服务器名称只允许字母、数字、下划线和连字符，长度 1–32', 'CONFIG_INVALID');
	const transport = input.transport;
	if (transport !== 'stdio' && transport !== 'streamable-http') throw new ApiError(400, '传输方式必须是 stdio 或 streamable-http', 'CONFIG_INVALID');
	const id = cleanText(options.id || input.id || rowIdFor(serverName), '配置 ID', 96, true);
	if (!ROW_ID_RE.test(id)) throw new ApiError(400, '配置 ID 不合法', 'CONFIG_INVALID');
	const timeout = input.toolCallTimeoutMs === undefined ? 60_000 : Number(input.toolCallTimeoutMs);
	if (!Number.isInteger(timeout) || timeout < 1_000 || timeout > 600_000) throw new ApiError(400, '工具超时必须是 1000–600000 毫秒的整数', 'CONFIG_INVALID');
	const repository = input.repository == null ? null : cleanText(input.repository, '仓库', 200, true);
	if (repository !== null && !REPOSITORY_RE.test(repository)) throw new ApiError(400, '仓库必须是 owner/repository', 'CONFIG_INVALID');
	const requiredEnv = [...new Set(cleanStringArray(input.requiredEnv, '必需环境变量', 64, 80))];
	for (const name of requiredEnv) if (!ENV_NAME_RE.test(name)) throw new ApiError(400, `非法环境变量名：${name}`, 'CONFIG_INVALID');
	const base = {
		id,
		serverName,
		description: cleanText(input.description, '描述', 240),
		transport,
		enabled: input.enabled === undefined ? true : input.enabled === true,
		toolCallTimeoutMs: timeout,
		failOnStartupError: input.failOnStartupError === true,
		requiredEnv,
		source: input.source === 'market' ? 'market' : 'manual',
		marketId: input.marketId == null ? null : cleanText(input.marketId, '市场 ID', 200, true),
		repository,
		iconUrl: safeOptionalIconUrl(input.iconUrl),
		revision: Number.isInteger(input.revision) && input.revision >= 0 ? input.revision : 0,
		updatedAt: typeof input.updatedAt === 'string' && !Number.isNaN(Date.parse(input.updatedAt)) ? input.updatedAt : new Date().toISOString(),
	};
	if (transport === 'stdio') {
		const cwd = cleanText(input.cwd, '工作目录', 1024);
		if (cwd !== '' && !isAbsolute(cwd)) throw new ApiError(400, 'stdio 工作目录必须是绝对路径', 'CONFIG_INVALID');
		return {
			...base,
			command: cleanText(input.command, '启动命令', 1024, true),
			args: cleanStringArray(input.args, '启动参数'),
			env: cleanReferenceMap(input.env, '环境变量映射', ENV_NAME_RE),
			cwd,
		};
	}
	return {
		...base,
		url: cleanUrl(input.url, 'MCP 端点'),
		headers: cleanReferenceMap(input.headers, '请求头映射', HEADER_NAME_RE),
	};
}

function quoteYaml(value) {
	return `'${String(value).replace(/'/g, "''")}'`;
}

function envExpression(name) {
	return `!!js process.env.${name}`;
}

export function serializeServers(servers) {
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

export function parseServers(text) {
	const block = extractManagedBlock(String(text || ''));
	if (block === '') return [];
	const servers = [];
	for (const line of block.split(/\r?\n/)) {
		const at = line.indexOf(SERVER_META);
		if (at < 0) continue;
		let raw;
		try { raw = JSON.parse(line.slice(at + SERVER_META.length)); }
		catch { throw new ApiError(500, 'MCP 受管配置元数据损坏，请先修复 cordis.patch.yml', 'MANAGED_BLOCK_CORRUPT'); }
		try { servers.push(normalizeServer(raw, { id: raw && raw.id })); }
		catch (error) {
			throw new ApiError(500, `MCP 受管配置无效：${error instanceof Error ? error.message : String(error)}`, 'MANAGED_BLOCK_CORRUPT');
		}
	}
	const ids = new Set();
	const names = new Set();
	for (const server of servers) {
		if (ids.has(server.id) || names.has(server.serverName.toLowerCase())) throw new ApiError(500, 'MCP 受管配置包含重复服务器', 'MANAGED_BLOCK_CORRUPT');
		ids.add(server.id);
		names.add(server.serverName.toLowerCase());
	}
	return servers;
}

function touched(server) {
	return { ...server, revision: server.revision + 1, updatedAt: new Date().toISOString() };
}

function runtimeFacts(deps) {
	let entries = [];
	let inventoryError = null;
	try {
		const answer = deps.inventory && typeof deps.inventory.list === 'function' ? deps.inventory.list() : null;
		entries = Array.isArray(answer?.entries) ? answer.entries.map((entry) => ({
			entryId: typeof entry.entryId === 'string' ? entry.entryId : '',
			moduleName: typeof entry.moduleName === 'string' ? entry.moduleName : '',
			enabled: entry.enabled === true,
			fiberPhase: typeof entry.fiberPhase === 'string' ? entry.fiberPhase : null,
		})) : [];
	} catch (error) { inventoryError = error instanceof Error ? error.message : String(error); }
	let schemas = [];
	let toolsError = null;
	try {
		const answer = deps.tools && typeof deps.tools.schemas === 'function' ? deps.tools.schemas() : [];
		schemas = Array.isArray(answer) ? answer.map((schema) => ({
			name: typeof schema?.name === 'string' ? schema.name : '',
			description: typeof schema?.description === 'string' ? schema.description : '',
		})).filter((schema) => schema.name !== '') : [];
	} catch (error) { toolsError = error instanceof Error ? error.message : String(error); }
	return { entries, schemas, inventoryError, toolsError };
}

function statusOf(server, row, toolCount, missingEnvironment) {
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

function projectServer(server, facts, env) {
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

function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}

function safeRepositoryUrl(repository) {
	return `https://github.com/${repository}`;
}

function registryIcon(server, repositoryUrl) {
	const icons = Array.isArray(server?.icons) ? server.icons : [];
	const trusted = new Set(ICON_TRUSTED_HOSTS);
	try { trusted.add(new URL(repositoryUrl).hostname); } catch {}
	for (const remote of Array.isArray(server?.remotes) ? server.remotes : []) {
		try { trusted.add(new URL(remote.url).hostname); } catch {}
	}
	for (const icon of icons) {
		if (!icon || typeof icon.src !== 'string') continue;
		if (icon.mimeType && !ALLOWED_ICON_MIMES.has(icon.mimeType)) continue;
		try {
			const parsed = new URL(icon.src);
			if (parsed.protocol === 'https:' && trusted.has(parsed.hostname)) return parsed.toString();
		} catch {}
	}
	return null;
}

export function createMcpManager(options = {}) {
	const profileDir = resolveProfileDir(options);
	const profileName = options.profileName || 'web';
	const patchPath = join(profileDir, 'cordis.patch.yml');
	const deps = options.deps || {};
	const env = options.env || deps.env || process.env;
	const fetchImpl = deps.fetch || globalThis.fetch;
	const cache = new Map();
	const cacheTtlMs = options.cacheTtlMs || 10 * 60_000;
	let mutation = Promise.resolve();

	async function readState() {
		const patch = await readText(patchPath, '');
		return { patch, servers: parseServers(patch) };
	}

	async function writeState(patch, servers) {
		const next = replaceManagedBlock(patch, serializeServers(servers));
		await atomicWriteText(patchPath, next, deps);
		return next;
	}

	function serialized(work) {
		const run = mutation.then(work, work);
		mutation = run.catch(() => {});
		return run;
	}

	function ensureUnique(servers, candidate, exceptId = null) {
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

	async function requestJson(url, optional = false) {
		if (typeof fetchImpl !== 'function') throw new Error('Host 未提供 fetch，无法读取远程元数据');
		const timeout = globalThis.AbortSignal && typeof globalThis.AbortSignal.timeout === 'function'
			? globalThis.AbortSignal.timeout(8_000)
			: undefined;
		const response = await fetchImpl(url, {
			headers: {
				accept: 'application/vnd.github+json, application/json',
				'user-agent': 'dsh-mcp-manager/0.1.0',
			},
			...(timeout ? { signal: timeout } : {}),
		});
		if (optional && response.status === 404) return null;
		if (!response.ok) throw new Error(`远程元数据请求失败（HTTP ${response.status}）`);
		return response.json();
	}

	async function cached(key, force, load) {
		const hit = cache.get(key);
		if (!force && hit && hit.expiresAt > Date.now()) return { value: hit.value, stale: false };
		try {
			const value = await load();
			cache.set(key, { value, expiresAt: Date.now() + cacheTtlMs });
			return { value, stale: false };
		} catch (error) {
			if (hit) return { value: hit.value, stale: true, error: errorMessage(error) };
			throw error;
		}
	}

	async function githubRepository(entry, force) {
		const url = `https://api.github.com/repos/${entry.repository}`;
		return cached(`github:${entry.id}`, force, async () => {
			const repo = await requestJson(url);
			return {
				url: typeof repo.html_url === 'string' ? repo.html_url : safeRepositoryUrl(entry.repository),
				description: typeof repo.description === 'string' && repo.description.trim() ? repo.description.trim() : entry.description,
				author: typeof repo.owner?.login === 'string' ? repo.owner.login : entry.repository.split('/')[0],
				iconUrl: safeOptionalIconUrl(repo.owner?.avatar_url),
				stars: Number.isFinite(repo.stargazers_count) ? repo.stargazers_count : null,
				forks: Number.isFinite(repo.forks_count) ? repo.forks_count : null,
				language: typeof repo.language === 'string' ? repo.language : null,
				license: typeof repo.license?.spdx_id === 'string' && repo.license.spdx_id !== 'NOASSERTION' ? repo.license.spdx_id : null,
				lastPushedAt: typeof repo.pushed_at === 'string' ? repo.pushed_at : null,
				topics: Array.isArray(repo.topics) ? repo.topics.filter((item) => typeof item === 'string').slice(0, 12) : [],
			};
		});
	}

	async function registryDetail(entry, force) {
		if (!entry.registryName) return { value: null, stale: false };
		const encoded = encodeURIComponent(entry.registryName);
		return cached(`registry:${entry.id}`, force, async () => {
			const answer = await requestJson(`https://registry.modelcontextprotocol.io/v0.1/servers/${encoded}/versions/latest`, true);
			return answer && typeof answer === 'object' ? (answer.server || answer) : null;
		});
	}

	async function githubRelease(entry, force) {
		return cached(`release:${entry.id}`, force, async () => {
			const release = await requestJson(`https://api.github.com/repos/${entry.repository}/releases/latest`, true);
			if (!release) return null;
			return {
				version: typeof release.tag_name === 'string' ? release.tag_name : null,
				publishedAt: typeof release.published_at === 'string' ? release.published_at : null,
				url: typeof release.html_url === 'string' ? release.html_url : null,
			};
		});
	}

	async function marketSummary(entry, force = false) {
		const [githubResult, registryResult] = await Promise.allSettled([
			githubRepository(entry, force),
			registryDetail(entry, force),
		]);
		const github = githubResult.status === 'fulfilled' ? githubResult.value.value : null;
		const registry = registryResult.status === 'fulfilled' ? registryResult.value.value : null;
		const iconUrl = registryIcon(registry, github?.url || safeRepositoryUrl(entry.repository)) || github?.iconUrl || null;
		const errors = [];
		if (githubResult.status === 'rejected') errors.push(errorMessage(githubResult.reason));
		if (registryResult.status === 'rejected') errors.push(errorMessage(registryResult.reason));
		return {
			id: entry.id,
			repository: entry.repository,
			repositoryUrl: github?.url || safeRepositoryUrl(entry.repository),
			description: github?.description || registry?.description || entry.description,
			iconUrl,
			iconSource: registryIcon(registry, github?.url || safeRepositoryUrl(entry.repository)) ? 'registry' : github?.iconUrl ? 'github' : 'generic',
			installable: entry.install !== null,
			registryName: entry.registryName,
			registryVersion: typeof registry?.version === 'string' ? registry.version : null,
			stale: Boolean(githubResult.status === 'fulfilled' && githubResult.value.stale) || Boolean(registryResult.status === 'fulfilled' && registryResult.value.stale),
			metadataError: errors.length > 0 ? errors.join('；') : null,
			github,
			registry,
		};
	}

	async function marketplace(force = false) {
		const { servers } = await readState();
		const summaries = await Promise.all(MARKETPLACE.map((entry) => marketSummary(entry, force)));
		return {
			apiVersion: API_VERSION,
			items: summaries.map((item) => {
				const installed = servers.find((server) => server.marketId === item.id || server.repository === item.repository);
				return {
					id: item.id,
					repository: item.repository,
					description: item.description,
					iconUrl: item.iconUrl,
					iconSource: item.iconSource,
					installable: item.installable,
					status: installed ? 'installed' : 'not-installed',
					serverId: installed?.id ?? null,
					stale: item.stale,
					metadataError: item.metadataError,
				};
			}),
		};
	}

	async function marketplaceDetail(id, force = false) {
		const entry = findMarketplaceEntry(id);
		if (!entry) throw new ApiError(404, '市场条目不存在', 'MARKET_NOT_FOUND');
		const [{ servers }, summary, releaseResult] = await Promise.all([
			readState(),
			marketSummary(entry, force),
			githubRelease(entry, force).catch((error) => ({ value: null, stale: false, error: errorMessage(error) })),
		]);
		const installed = servers.find((server) => server.marketId === entry.id || server.repository === entry.repository);
		const github = summary.github;
		const release = releaseResult.value;
		return {
			id: entry.id,
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
			installable: summary.installable,
			status: installed ? 'installed' : 'not-installed',
			serverId: installed?.id ?? null,
			stale: summary.stale || releaseResult.stale === true,
			metadataError: summary.metadataError || releaseResult.error || null,
		};
	}

	async function createServer(input) {
		return serialized(async () => {
			const state = await readState();
			const server = touched(normalizeServer(input));
			ensureUnique(state.servers, server);
			await writeState(state.patch, [...state.servers, server]);
			return { changed: true, hotReload: true, server: projectServer(server, runtimeFacts(deps), env) };
		});
	}

	async function updateServer(id, input) {
		return serialized(async () => {
			const state = await readState();
			const index = state.servers.findIndex((server) => server.id === id);
			if (index < 0) throw new ApiError(404, '服务器不存在', 'SERVER_NOT_FOUND');
			const server = touched(normalizeServer({ ...input, id, source: state.servers[index].source, marketId: state.servers[index].marketId, repository: state.servers[index].repository, iconUrl: state.servers[index].iconUrl }, { id }));
			ensureUnique(state.servers, server, id);
			const next = state.servers.slice();
			next[index] = server;
			await writeState(state.patch, next);
			return { changed: true, hotReload: true, server: projectServer(server, runtimeFacts(deps), env) };
		});
	}

	async function setEnabled(id, enabled) {
		if (typeof enabled !== 'boolean') throw new ApiError(400, 'enabled 必须是布尔值', 'CONFIG_INVALID');
		return serialized(async () => {
			const state = await readState();
			const index = state.servers.findIndex((server) => server.id === id);
			if (index < 0) throw new ApiError(404, '服务器不存在', 'SERVER_NOT_FOUND');
			const current = state.servers[index];
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

	async function reconnect(id) {
		return serialized(async () => {
			const state = await readState();
			const index = state.servers.findIndex((server) => server.id === id);
			if (index < 0) throw new ApiError(404, '服务器不存在', 'SERVER_NOT_FOUND');
			if (!state.servers[index].enabled) throw new ApiError(409, '请先启用服务器再重新连接', 'SERVER_DISABLED');
			const server = touched(state.servers[index]);
			const next = state.servers.slice();
			next[index] = server;
			await writeState(state.patch, next);
			return { changed: true, hotReload: true };
		});
	}

	async function removeServer(id) {
		return serialized(async () => {
			const state = await readState();
			if (!state.servers.some((server) => server.id === id)) throw new ApiError(404, '服务器不存在', 'SERVER_NOT_FOUND');
			await writeState(state.patch, state.servers.filter((server) => server.id !== id));
			return { changed: true, hotReload: true };
		});
	}

	async function installMarket(id) {
		const entry = findMarketplaceEntry(id);
		if (!entry) throw new ApiError(404, '市场条目不存在', 'MARKET_NOT_FOUND');
		if (!entry.install) throw new ApiError(409, '该仓库包含多个 MCP 服务器，无法安全推导单一安装配置；请在 GitHub 查看安装方式', 'MARKET_NOT_INSTALLABLE');
		return serialized(async () => {
			const state = await readState();
			const existing = state.servers.find((server) => server.marketId === entry.id || server.repository === entry.repository);
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
		async call(op, body = {}) {
			switch (op) {
				case 'capabilities': return { apiVersion: API_VERSION, features: ['server-list', 'server-mutate', 'hot-reload', 'tool-projection', 'marketplace', 'registry-icons', 'github-avatar-fallback'] };
				case 'list': return snapshot();
				case 'create': return createServer(body.server);
				case 'update': return updateServer(cleanText(body.id, '服务器 ID', 96, true), body.server);
				case 'setEnabled': return setEnabled(cleanText(body.id, '服务器 ID', 96, true), body.enabled);
				case 'reconnect': return reconnect(cleanText(body.id, '服务器 ID', 96, true));
				case 'delete': return removeServer(cleanText(body.id, '服务器 ID', 96, true));
				case 'marketplace': return marketplace(body.force === true);
				case 'marketplace.detail': return marketplaceDetail(cleanText(body.id, '市场 ID', 200, true), body.force === true);
				case 'marketplace.install': return installMarket(cleanText(body.id, '市场 ID', 200, true));
				default: throw new ApiError(400, `不支持的操作：${String(op || '')}`, 'OP_NOT_SUPPORTED');
			}
		},
	};
}
