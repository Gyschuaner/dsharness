/**
 * dsh-plugin-manager — Host state and mutation engine (DSH-027).
 *
 * The profile package.json is the installation truth. cordis.patch.yml is the
 * mount truth. Plugin Manager owns only two marked blocks in the patch file;
 * user-authored rows outside those blocks are never rewritten.
 */
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { MARKETPLACE, findMarketplaceEntry, type MarketplaceEntry } from './marketplace.js';
import { DEFAULT_REGISTRY_URL, normalizeRegistry, type PluginRegistry, type RegistryItem } from './registry.js';

export const API_VERSION = 1;
export const OVERRIDE_START = '# plugin-manager:overrides:start';
export const OVERRIDE_END = '# plugin-manager:overrides:end';
export const MOUNT_START = '# plugin-manager:mounts:start';
export const MOUNT_END = '# plugin-manager:mounts:end';
export const PROTECTED_PACKAGES = new Set(['dsh-extension-manager', 'dsh-plugin-manager']);

const PACKAGE_NAME_RE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;
const PACKAGE_SPEC_RE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*(?:@(?:latest|next|beta|alpha|\d[^\s]*))?$/i;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function safeOptionalIconUrl(value: unknown): string | null {
	if (!value) return null;
	try {
		const parsed = new URL(String(value));
		return parsed.protocol === 'https:' ? parsed.toString() : null;
	} catch { return null; }
}

function githubAvatarUrl(repository: string): string | null {
	const owner = repository.split('/')[0] || '';
	if (!/^[A-Za-z0-9_.-]+$/.test(owner)) return null;
	return safeOptionalIconUrl(`https://github.com/${owner}.png?size=64`);
}

type UnknownRecord = Record<string, unknown>;
type DependencyMap = Record<string, string>;

interface PluginManifest extends UnknownRecord {
	name: string;
	version?: string;
	description?: string;
	repository?: string | { url?: string };
	license?: string;
	main?: string;
	exports?: Record<string, unknown>;
	dsh: {
		client?: unknown;
		bundle?: { patch?: string };
		plugin?: unknown;
	};
	engines?: Record<string, string>;
	peerDependencies?: Record<string, string>;
}

interface PatchRow {
	id: string;
	indent: number;
	name: string | null;
	disabled: boolean | undefined;
}

export interface LocalPlugin {
	name: string;
	rowId: string;
	version: string;
	description: string;
	source: string;
	spec: string;
	enabled: boolean;
	protected: boolean;
	repository: string | null;
	license: string | null;
	runtimeEnabled: boolean | null;
	runtimePhase: string | null;
	manifest: {
		hostEntry: string | null;
		clientEntry: string | null;
		bundlePatch: string | null;
	};
}

interface RunResult {
	stdout: string;
	stderr: string;
}

type RunDsh = (args: string[], options?: { timeoutMs?: number }) => Promise<RunResult>;

interface PluginDependencies {
	writeText?(path: string, text: string): Promise<void> | void;
	runDsh?: RunDsh;
	installTimeoutMs?: number;
	githubTimeoutMs?: number;
	fetch?: typeof globalThis.fetch;
	inventory?: { list(): unknown | Promise<unknown> };
}

interface ProfileOptions {
	profileDir?: string;
	dshHome?: string;
	profileName?: string;
}

export interface PluginManagerOptions extends ProfileOptions {
	deps?: PluginDependencies;
	githubCacheMs?: number;
	registryCacheMs?: number;
	registryUrl?: string;
}

interface InstallContext {
	profileDir: string;
	profileName: string;
	deps: PluginDependencies;
}

interface GithubDetail extends UnknownRecord {
	id: string;
	repository: string;
	iconUrl: string | null;
	iconSource: 'github' | 'github-avatar' | 'generic';
	latestVersion: string | null;
}

type RegistryStatus = 'fresh' | 'stale' | 'unavailable';

interface RegistryRead {
	document: PluginRegistry | null;
	status: RegistryStatus;
	warning: string | null;
	generatedAt: string | null;
}

interface ResolvedMarketplaceEntry {
	entry: MarketplaceEntry;
	marketSource: 'featured' | 'registry';
}

function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorCode(error: unknown): string | undefined {
	return isRecord(error) && typeof error.code === 'string' ? error.code : undefined;
}

function stringDependencies(value: unknown): DependencyMap {
	if (!isRecord(value)) return {};
	const result: DependencyMap = {};
	for (const [name, spec] of Object.entries(value)) {
		if (typeof spec === 'string') result[name] = spec;
	}
	return result;
}

export class ApiError extends Error {
	readonly status: number;
	readonly code: string;

	constructor(status: number, message: string, code = 'PLUGIN_MANAGER_ERROR') {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.code = code;
	}
}

function withoutTrailingSlash(value: unknown): string {
	return String(value || '').replace(/[\\/]+$/, '');
}

export function resolveProfileDir(options: ProfileOptions = {}): string {
	if (options.profileDir) return resolve(options.profileDir);
	const dshHome = options.dshHome || process.env.DSH_HOME || join(homedir(), '.dsh');
	const profileName = options.profileName || 'web';
	return resolve(dshHome, 'profiles', profileName);
}

async function readText(path: string, fallback = ''): Promise<string> {
	try {
		return await readFile(path, 'utf8');
	} catch (error) {
		if (errorCode(error) === 'ENOENT') return fallback;
		throw error;
	}
}

async function readJson(path: string): Promise<UnknownRecord> {
	let text: string;
	try {
		text = await readFile(path, 'utf8');
	} catch (error) {
		if (errorCode(error) === 'ENOENT') throw new ApiError(404, `文件不存在：${path}`, 'PROFILE_NOT_FOUND');
		throw error;
	}
	try {
		const parsed: unknown = JSON.parse(text);
		if (!isRecord(parsed)) throw new ApiError(500, `JSON 根节点不是对象：${path}`, 'PROFILE_JSON_INVALID');
		return parsed;
	} catch {
		throw new ApiError(500, `JSON 文件损坏：${path}`, 'PROFILE_JSON_INVALID');
	}
}

async function atomicWriteText(path: string, text: string, deps: PluginDependencies = {}): Promise<void> {
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
	return text.includes('\r\n') ? '\r\n' : '\n';
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
		throw new ApiError(500, `受管配置块标记必须是唯一且有序的一对：${start}`, 'MANAGED_BLOCK_CORRUPT');
	}
	return { startAt: starts[0], endAt: ends[0] };
}

export function extractManagedBlock(text: string, start: string, end: string): string {
	const bounds = managedBlockBounds(text, start, end);
	if (bounds === null) return '';
	return text.slice(bounds.startAt + start.length, bounds.endAt);
}

export function replaceManagedBlock(text: string, start: string, end: string, body: string): string {
	const nl = normalizeNewline(text);
	const cleanBody = String(body || '').trim();
	const block = cleanBody === '' ? '' : `${start}${nl}${cleanBody}${nl}${end}`;
	const bounds = managedBlockBounds(text, start, end);
	if (bounds !== null) {
		let after = bounds.endAt + end.length;
		if (text.slice(after, after + 2) === '\r\n') after += 2;
		else if (text[after] === '\n') after += 1;
		const beforeText = text.slice(0, bounds.startAt).replace(/[\t ]+$/gm, '').replace(/[\r\n]+$/, '');
		const afterText = text.slice(after).replace(/^[\r\n]+/, '');
		return [beforeText, block, afterText].filter(Boolean).join(nl + nl) + nl;
	}
	if (block === '') return text;
	return text.replace(/[\r\n]+$/, '') + nl + nl + block + nl;
}

function unquote(value: unknown): string {
	const trimmed = String(value || '').trim();
	if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

/** Parse just the row leaves used by DSH patches; this is not a YAML parser. */
export function parsePatchRows(text: string): PatchRow[] {
	const rows: PatchRow[] = [];
	let current: PatchRow | null = null;
	for (const raw of String(text || '').split(/\r?\n/)) {
		const idMatch = /^(\s*)-\s+id:\s*(.+?)\s*$/.exec(raw);
		if (idMatch) {
			if (current) rows.push(current);
			current = { id: unquote(idMatch[2]), indent: (idMatch[1] ?? '').length, name: null, disabled: undefined };
			continue;
		}
		if (!current) continue;
		const indent = (/^(\s*)/.exec(raw)?.[1] ?? '').length;
		if (raw.trim() !== '' && !raw.trim().startsWith('#') && indent <= current.indent && /^\s*-/.test(raw)) {
			rows.push(current);
			current = null;
			continue;
		}
		const name = /^\s*name:\s*(.+?)\s*$/.exec(raw);
		if (name && indent === current.indent + 2) current.name = unquote(name[1]);
		const disabled = /^\s*disabled:\s*(true|false)\s*$/i.exec(raw);
		if (disabled && indent === current.indent + 2) current.disabled = (disabled[1] ?? '').toLowerCase() === 'true';
	}
	if (current) rows.push(current);
	return rows;
}

function parseOverrideMap(text: string): Map<string, boolean> {
	const map = new Map<string, boolean>();
	for (const row of parsePatchRows(extractManagedBlock(text, OVERRIDE_START, OVERRIDE_END))) {
		if (row.id && typeof row.disabled === 'boolean') map.set(row.id, row.disabled);
	}
	return map;
}

function serializeOverrideMap(map: ReadonlyMap<string, boolean>): string {
	return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, disabled]) => (
		`- id: '${id.replace(/'/g, "''")}'\n  disabled: ${disabled ? 'true' : 'false'}`
	)).join('\n');
}

function parseMountMap(text: string): Map<string, string> {
	const map = new Map<string, string>();
	for (const row of parsePatchRows(extractManagedBlock(text, MOUNT_START, MOUNT_END))) {
		if (row.id && row.name) map.set(row.name, row.id);
	}
	return map;
}

function serializeMountMap(map: ReadonlyMap<string, string>): string {
	if (map.size === 0) return '';
	const lines = ['- insert:'];
	for (const [name, id] of [...map.entries()].sort(([a], [b]) => a.localeCompare(b))) {
		lines.push(`  - id: '${id.replace(/'/g, "''")}'`);
		lines.push(`    name: '${name.replace(/'/g, "''")}'`);
	}
	return lines.join('\n');
}

function stripManagedBlocks(text: string): string {
	let next = replaceManagedBlock(text, OVERRIDE_START, OVERRIDE_END, '');
	next = replaceManagedBlock(next, MOUNT_START, MOUNT_END, '');
	return next;
}

function packageSlug(name: string): string {
	return name.replace(/^@/, '').replace(/\//g, '-').replace(/^dsh-/, '').replace(/[^A-Za-z0-9_-]+/g, '-').toLowerCase();
}

function repositorySlug(repository: PluginManifest['repository']): string | null {
	const raw = typeof repository === 'string' ? repository : repository?.url;
	if (!raw) return null;
	const value = String(raw).replace(/^git\+/, '').replace(/\.git$/, '').replace(/^github:/, '');
	const match = /github\.com[/:]([^/]+\/[^/#]+)$/i.exec(value);
	if (match?.[1]) return match[1];
	return REPOSITORY_RE.test(value) ? value : null;
}

function dependencySource(spec: unknown): string {
	const value = String(spec || '');
	if (/^(?:link|file):/i.test(value) || isAbsolute(value)) return '本地';
	if (/github|git\+|^git:/i.test(value)) return 'GitHub';
	return 'npm';
}

function firstSentence(value: unknown): string {
	const text = String(value || '').replace(/\s+/g, ' ').trim();
	if (text === '') return '';
	for (let i = 0; i < text.length; i += 1) {
		const ch = text.charAt(i);
		let boundary = ch === '。' || ch === '！' || ch === '？' || ch === '!' || ch === '?';
		if (ch === '.') {
			const before = text[i - 1] || '';
			const after = text[i + 1] || '';
			const token = (text.slice(0, i + 1).split(' ').pop() ?? '').toLowerCase();
			const abbreviation = /^(?:e\.g\.|i\.e\.|etc\.|vs\.|mr\.|mrs\.|ms\.|dr\.)$/.test(token);
			boundary = !abbreviation && !(/[0-9]/.test(before) && /[0-9]/.test(after)) && (after === '' || /\s|["'”’）\]]/.test(after));
		}
		if (!boundary) continue;
		let end = i + 1;
		while (end < text.length && /["'”’）\]]/.test(text.charAt(end))) end += 1;
		return text.slice(0, end);
	}
	return text;
}

function exportClientEntry(pkg: PluginManifest): string | null {
	const value = pkg.exports?.['./client'];
	if (typeof value === 'string') return value;
	if (isRecord(value)) return typeof value.default === 'string' ? value.default : null;
	return null;
}

export function isDshPluginManifest(pkg: unknown): pkg is PluginManifest {
	if (!isRecord(pkg) || typeof pkg.name !== 'string' || !PACKAGE_NAME_RE.test(pkg.name) || !isRecord(pkg.dsh)) return false;
	return Boolean(pkg.dsh.client || pkg.dsh.bundle || pkg.dsh.plugin);
}

async function readInstalledManifest(profileDir: string, name: string): Promise<{ path: string; manifest: PluginManifest | null }> {
	if (!PACKAGE_NAME_RE.test(name)) throw new ApiError(500, `profile 包含非法依赖名：${name}`, 'PLUGIN_MANIFEST_INVALID');
	const path = join(profileDir, 'node_modules', ...name.split('/'), 'package.json');
	try {
		const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
		return { path, manifest: isDshPluginManifest(parsed) && parsed.name === name ? parsed : null };
	} catch (error) {
		if (errorCode(error) === 'ENOENT') return { path, manifest: null };
		if (error instanceof SyntaxError) throw new ApiError(500, `插件清单损坏：${name}`, 'PLUGIN_MANIFEST_INVALID');
		throw error;
	}
}

function isContainedPath(root: string, candidate: string): boolean {
	const rel = relative(root, candidate);
	return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}

async function readBundleRowId(profileDir: string, dependencyName: string, pkg: PluginManifest): Promise<string | null> {
	const patch = pkg.dsh.bundle?.patch;
	if (typeof patch !== 'string' || patch.trim() === '') return null;
	if (!PACKAGE_NAME_RE.test(dependencyName) || pkg.name !== dependencyName) {
		throw new ApiError(500, `插件清单名称与 profile 依赖不一致：${dependencyName}`, 'PLUGIN_MANIFEST_INVALID');
	}
	const packageDir = dirname(join(profileDir, 'node_modules', ...dependencyName.split('/'), 'package.json'));
	const canonicalPackageDir = await realpath(packageDir);
	const requestedPatch = resolve(canonicalPackageDir, patch);
	let canonicalPatch: string;
	try {
		canonicalPatch = await realpath(requestedPatch);
	} catch (error) {
		if (errorCode(error) === 'ENOENT') return null;
		throw error;
	}
	if (!isContainedPath(canonicalPackageDir, canonicalPatch)) {
		throw new ApiError(500, `插件 bundle patch 越出包目录：${dependencyName}`, 'PLUGIN_MANIFEST_INVALID');
	}
	const patchStat = await stat(canonicalPatch);
	if (!patchStat.isFile()) throw new ApiError(500, `插件 bundle patch 不是普通文件：${dependencyName}`, 'PLUGIN_MANIFEST_INVALID');
	const text = await readText(canonicalPatch, '');
	return parsePatchRows(text)[0]?.id || null;
}

function baseEnabledFor(rowId: string, basePatch: string): boolean {
	let enabled = true;
	for (const row of parsePatchRows(basePatch)) {
		if (row.id === rowId && typeof row.disabled === 'boolean') enabled = !row.disabled;
	}
	return enabled;
}

function effectiveEnabledFor(rowId: string, patch: string): boolean {
	const overrides = parseOverrideMap(patch);
	if (overrides.has(rowId)) return !overrides.get(rowId);
	return baseEnabledFor(rowId, stripManagedBlocks(patch));
}

function semverParts(version: unknown): [number, number, number] | null {
	const match = /^(?:v)?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(String(version || '').trim());
	return match && match[1] !== undefined && match[2] !== undefined && match[3] !== undefined
		? [Number(match[1]), Number(match[2]), Number(match[3])]
		: null;
}

export function compareVersions(a: unknown, b: unknown): number {
	const av = semverParts(a);
	const bv = semverParts(b);
	if (!av || !bv) return 0;
	for (const i of [0, 1, 2] as const) {
		const left = av[i];
		const right = bv[i];
		if (left !== right) return left < right ? -1 : 1;
	}
	return 0;
}

async function listLocalPlugins(profileDir: string): Promise<LocalPlugin[]> {
	const packageJson = await readJson(join(profileDir, 'package.json'));
	const dependencies = stringDependencies(packageJson.dependencies);
	const patch = await readText(join(profileDir, 'cordis.patch.yml'), '');
	const patchRows = parsePatchRows(patch);
	const results: LocalPlugin[] = [];
	for (const [name, spec] of Object.entries(dependencies)) {
		if (!PACKAGE_NAME_RE.test(name)) continue;
		const { manifest } = await readInstalledManifest(profileDir, name);
		if (!manifest || !isDshPluginManifest(manifest)) continue;
		const directRow = [...patchRows].reverse().find((row) => row.name === name);
		const rowId = await readBundleRowId(profileDir, name, manifest) || directRow?.id || packageSlug(name);
		results.push({
			name,
			rowId,
			version: String(manifest.version || '未知'),
			description: firstSentence(manifest.description),
			source: dependencySource(spec),
			spec: String(spec),
			enabled: effectiveEnabledFor(rowId, patch),
			protected: PROTECTED_PACKAGES.has(name),
			repository: repositorySlug(manifest.repository),
			license: typeof manifest.license === 'string' ? manifest.license : null,
			runtimeEnabled: null,
			runtimePhase: null,
			manifest: {
				hostEntry: typeof manifest.main === 'string' ? manifest.main : null,
				clientEntry: exportClientEntry(manifest),
				bundlePatch: manifest.dsh.bundle?.patch || null,
			},
		});
	}
	return results.sort((a, b) => a.name.localeCompare(b.name));
}

function marketplaceStatus(entry: MarketplaceEntry, local: readonly LocalPlugin[]): { status: string; installedVersion: string | null; packageName: string | null } {
	const match = local.find((plugin) => (
		(entry.packageName && plugin.name === entry.packageName) ||
		(plugin.repository && plugin.repository.toLowerCase() === entry.repository.toLowerCase())
	));
	if (!match) return { status: 'not-installed', installedVersion: null, packageName: entry.packageName };
	const status = entry.latestHint && compareVersions(match.version, entry.latestHint) < 0 ? 'update-available' : 'installed';
	return { status, installedVersion: match.version, packageName: match.name };
}

function validateRepository(value: unknown): string {
	if (!REPOSITORY_RE.test(String(value || ''))) throw new ApiError(400, 'GitHub 仓库名不合法', 'REPOSITORY_INVALID');
	return String(value);
}

function githubHeaders(): Record<string, string> {
	return {
		accept: 'application/vnd.github+json',
		'user-agent': 'dsh-plugin-manager/0.1',
		'x-github-api-version': '2022-11-28',
	};
}

async function fetchJson(url: string, deps: PluginDependencies, optional = false): Promise<unknown | null> {
	const fetchImpl = deps.fetch || globalThis.fetch;
	if (typeof fetchImpl !== 'function') throw new ApiError(503, '当前运行时不支持网络请求', 'FETCH_UNAVAILABLE');
	let response: Response;
	try {
		response = await fetchImpl(url, { headers: githubHeaders(), signal: AbortSignal.timeout(deps.githubTimeoutMs || 6000) });
	} catch (error) {
		if (optional) return null;
		throw new ApiError(503, `GitHub 请求失败：${error instanceof Error ? error.message : String(error)}`, 'GITHUB_UNAVAILABLE');
	}
	if (response.status === 404 && optional) return null;
	if (!response.ok) {
		if (optional) return null;
		const remaining = response.headers?.get?.('x-ratelimit-remaining');
		const suffix = response.status === 403 && remaining === '0' ? '（API 限流）' : '';
		throw new ApiError(503, `GitHub 返回 ${response.status}${suffix}`, 'GITHUB_RESPONSE_ERROR');
	}
	return response.json();
}

async function fetchText(url: string, deps: PluginDependencies, optional = false): Promise<string | null> {
	const fetchImpl = deps.fetch || globalThis.fetch;
	if (typeof fetchImpl !== 'function') return null;
	try {
		const response = await fetchImpl(url, { headers: githubHeaders(), signal: AbortSignal.timeout(deps.githubTimeoutMs || 6000) });
		if (!response.ok) return optional ? null : Promise.reject(new ApiError(503, `GitHub 返回 ${response.status}`, 'GITHUB_RESPONSE_ERROR'));
		return response.text();
	} catch (error) {
		if (optional) return null;
		throw error;
	}
}

function validateRegistryUrl(value: string): string {
	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		throw new ApiError(500, 'Plugin Registry 地址不合法', 'REGISTRY_URL_INVALID');
	}
	const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]' || parsed.hostname === '::1';
	if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local)) {
		throw new ApiError(500, 'Plugin Registry 必须使用 HTTPS；仅本机地址允许 HTTP', 'REGISTRY_URL_INVALID');
	}
	return parsed.toString();
}

async function fetchRegistryDocument(url: string, deps: PluginDependencies): Promise<PluginRegistry> {
	const fetchImpl = deps.fetch || globalThis.fetch;
	if (typeof fetchImpl !== 'function') throw new ApiError(503, '当前运行时不支持 Plugin Registry 请求', 'FETCH_UNAVAILABLE');
	let response: Response;
	try {
		response = await fetchImpl(url, {
			headers: { accept: 'application/json', 'user-agent': 'dsh-plugin-manager/0.2' },
			signal: AbortSignal.timeout(deps.githubTimeoutMs || 6000),
		});
	} catch (error) {
		throw new ApiError(503, `Plugin Registry 请求失败：${error instanceof Error ? error.message : String(error)}`, 'REGISTRY_UNAVAILABLE');
	}
	if (!response.ok) {
		const remaining = response.headers?.get?.('x-ratelimit-remaining');
		const suffix = response.status === 403 && remaining === '0' ? '（API 限流）' : '';
		throw new ApiError(503, `Plugin Registry 返回 ${response.status}${suffix}`, 'REGISTRY_UNAVAILABLE');
	}
	let value: unknown;
	try {
		value = await response.json();
	} catch (error) {
		throw new ApiError(502, `Plugin Registry JSON 无法解析：${error instanceof Error ? error.message : String(error)}`, 'REGISTRY_INVALID');
	}
	try {
		return normalizeRegistry(value);
	} catch (error) {
		throw new ApiError(502, `Plugin Registry 格式无效：${error instanceof Error ? error.message : String(error)}`, 'REGISTRY_INVALID');
	}
}

async function fetchGithubDetail(entry: MarketplaceEntry, deps: PluginDependencies): Promise<GithubDetail> {
	validateRepository(entry.repository);
	const repoValue = await fetchJson(`https://api.github.com/repos/${entry.repository}`, deps, false);
	const repo = isRecord(repoValue) ? repoValue : null;
	if (!isRecord(repo)) throw new ApiError(503, 'GitHub 仓库响应格式无效', 'GITHUB_RESPONSE_ERROR');
	const branch = encodeURIComponent(typeof repo.default_branch === 'string' ? repo.default_branch : 'main');
	const [releaseValue, packageText] = await Promise.all([
		fetchJson(`https://api.github.com/repos/${entry.repository}/releases/latest`, deps, true),
		fetchText(`https://raw.githubusercontent.com/${entry.repository}/${branch}/package.json`, deps, true),
	]);
	const release = isRecord(releaseValue) ? releaseValue : null;
	let pkg: UnknownRecord | null = null;
	if (packageText) {
		try {
			const parsed: unknown = JSON.parse(packageText);
			pkg = isRecord(parsed) ? parsed : null;
		} catch { pkg = null; }
	}
	const owner = isRecord(repo.owner) ? repo.owner : {};
	const ownerIconUrl = safeOptionalIconUrl(owner.avatar_url);
	const iconUrl = ownerIconUrl || githubAvatarUrl(entry.repository);
	const license = isRecord(repo.license) ? repo.license : {};
	const dshManifest = isDshPluginManifest(pkg) ? pkg : null;
	return {
		id: entry.id,
		repository: entry.repository,
		iconUrl,
		iconSource: ownerIconUrl ? 'github' : iconUrl ? 'github-avatar' : 'generic',
		url: typeof repo.html_url === 'string' ? repo.html_url : `https://github.com/${entry.repository}`,
		description: firstSentence(typeof repo.description === 'string' ? repo.description : entry.description),
		author: typeof owner.login === 'string' ? owner.login : entry.repository.split('/')[0] ?? null,
		stars: Number(repo.stargazers_count || 0),
		forks: Number(repo.forks_count || 0),
		language: typeof repo.language === 'string' ? repo.language : null,
		license: typeof license.spdx_id === 'string' ? license.spdx_id : null,
		lastPushedAt: typeof repo.pushed_at === 'string' ? repo.pushed_at : null,
		topics: Array.isArray(repo.topics) ? repo.topics.filter((topic): topic is string => typeof topic === 'string').slice(0, 8) : [],
		latestVersion: release && typeof release.tag_name === 'string' ? release.tag_name : typeof pkg?.version === 'string' ? pkg.version : null,
		releaseUrl: release && typeof release.html_url === 'string' ? release.html_url : null,
		manifest: dshManifest ? {
			valid: true,
			packageName: dshManifest.name || entry.packageName,
			version: dshManifest.version || null,
			dshRequirement: dshManifest.engines?.dsh || dshManifest.peerDependencies?.['@deepseek-ai/dsh-agent'] || null,
			hostEntry: typeof dshManifest.main === 'string' ? dshManifest.main : null,
			clientEntry: exportClientEntry(dshManifest),
			bundlePatch: dshManifest.dsh.bundle?.patch || null,
		} : { valid: false },
	};
}

export function validateImportSource(source: unknown): string {
	const value = String(source || '').trim();
	if (value === '') throw new ApiError(400, '请输入插件包、GitHub 仓库或本地目录', 'SOURCE_REQUIRED');
	if (value.length > 400 || /[\0\r\n]/.test(value) || value.startsWith('-')) {
		throw new ApiError(400, '插件来源格式不合法', 'SOURCE_INVALID');
	}
	if (PACKAGE_SPEC_RE.test(value)) return value;
	if (/^github:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:#[A-Za-z0-9._/-]+)?$/.test(value)) return value;
	if (/^(?:git\+)?https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?(?:#[A-Za-z0-9._/-]+)?$/.test(value)) return value;
	if (/^(?:link:|file:)/i.test(value)) {
		const path = value.slice(value.indexOf(':') + 1);
		if (!isAbsolute(path)) throw new ApiError(400, '本地插件目录必须使用绝对路径', 'SOURCE_PATH_RELATIVE');
		return value;
	}
	if (isAbsolute(value)) return value;
	throw new ApiError(400, '仅支持 npm 包、GitHub 仓库或本地绝对目录', 'SOURCE_UNSUPPORTED');
}

function defaultRunDsh(args: string[], options: { timeoutMs?: number } = {}): Promise<RunResult> {
	return new Promise<RunResult>((resolvePromise, rejectPromise) => {
		const child = spawn('dsh', args, { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
		let stdout = '';
		let stderr = '';
		const limit = 12000;
		child.stdout?.on('data', (chunk) => { if (stdout.length < limit) stdout += chunk.toString(); });
		child.stderr?.on('data', (chunk) => { if (stderr.length < limit) stderr += chunk.toString(); });
		const timeout = setTimeout(() => child.kill(), options.timeoutMs || 120000);
		child.once('error', (error) => {
			clearTimeout(timeout);
			rejectPromise(error);
		});
		child.once('close', (code) => {
			clearTimeout(timeout);
			if (code === 0) resolvePromise({ stdout, stderr });
			else rejectPromise(new ApiError(500, (stderr || stdout || `dsh plugin 退出码 ${code}`).trim(), 'DSH_PLUGIN_COMMAND_FAILED'));
		});
	});
}

function dependencyDelta(beforeDeps: DependencyMap, afterDeps: DependencyMap): string[] {
	return [...new Set([...Object.keys(beforeDeps), ...Object.keys(afterDeps)])]
		.filter((name) => beforeDeps[name] !== afterDeps[name])
		.sort();
}

async function rollbackInstall(context: InstallContext, beforeDeps: DependencyMap, beforePatch: string): Promise<void> {
	const { profileDir, profileName, deps } = context;
	const runDsh = deps.runDsh || defaultRunDsh;
	const timeoutMs = deps.installTimeoutMs || 120000;
	const failures: string[] = [];
	let currentDeps: DependencyMap = {};
	try {
		const current = await readJson(join(profileDir, 'package.json'));
		currentDeps = stringDependencies(current.dependencies);
	} catch (error) {
		failures.push(`读取回滚前依赖失败：${error instanceof Error ? error.message : String(error)}`);
	}
	const delta = dependencyDelta(beforeDeps, currentDeps);
	for (const name of delta) {
		if (currentDeps[name] === undefined) continue;
		try {
			await runDsh(['plugin', '--profile', profileName, 'remove', name, '--reporter=append-only'], { timeoutMs });
		} catch (error) {
			failures.push(`移除 ${name} 失败：${error instanceof Error ? error.message : String(error)}`);
		}
	}
	for (const name of delta) {
		const spec = beforeDeps[name];
		if (spec === undefined) continue;
		try {
			await runDsh(['plugin', '--profile', profileName, 'add', `${name}@${spec}`, '--ignore-scripts', '--reporter=append-only'], { timeoutMs });
		} catch (error) {
			failures.push(`恢复 ${name} 失败：${error instanceof Error ? error.message : String(error)}`);
		}
	}
	try {
		await atomicWriteText(join(profileDir, 'cordis.patch.yml'), beforePatch, deps);
	} catch (error) {
		failures.push(`恢复 cordis.patch.yml 失败：${error instanceof Error ? error.message : String(error)}`);
	}
	try {
		const verified = await readJson(join(profileDir, 'package.json'));
		const verifiedDeps = stringDependencies(verified.dependencies);
		const remaining = dependencyDelta(beforeDeps, verifiedDeps);
		if (remaining.length > 0) failures.push(`依赖仍有差异：${remaining.join('、')}`);
	} catch (error) {
		failures.push(`验证回滚结果失败：${error instanceof Error ? error.message : String(error)}`);
	}
	if (failures.length > 0) {
		throw new ApiError(500, `插件安装回滚失败：${failures.join('；')}`, 'INSTALL_ROLLBACK_FAILED');
	}
}

async function installSource(source: string, context: InstallContext): Promise<string> {
	const { profileDir, profileName, deps } = context;
	const beforeProfile = await readJson(join(profileDir, 'package.json'));
	const beforeDeps = stringDependencies(beforeProfile.dependencies);
	const patchPath = join(profileDir, 'cordis.patch.yml');
	const beforePatch = await readText(patchPath, '');
	const runDsh = deps.runDsh || defaultRunDsh;
	try {
		await runDsh(['plugin', '--profile', profileName, 'add', source, '--ignore-scripts', '--reporter=append-only'], { timeoutMs: deps.installTimeoutMs || 120000 });
		const afterProfile = await readJson(join(profileDir, 'package.json'));
		const afterDeps = stringDependencies(afterProfile.dependencies);
		const changed = dependencyDelta(beforeDeps, afterDeps);
		if (changed.length === 0) throw new ApiError(500, '安装命令完成，但 profile 中没有检测到插件变化', 'INSTALL_NO_CHANGE');
		if (changed.length !== 1) {
			throw new ApiError(400, `安装来源修改了多个直接依赖（${changed.join('、')}），已拒绝导入`, 'INSTALL_DELTA_UNEXPECTED');
		}
		const name = changed[0];
		if (name === undefined) throw new ApiError(500, '无法确定安装后的插件依赖', 'INSTALL_NO_CHANGE');
		const { manifest } = await readInstalledManifest(profileDir, name);
		if (!manifest || !isDshPluginManifest(manifest)) {
			throw new ApiError(400, '来源不是可识别的 DSH 插件', 'PLUGIN_MANIFEST_REQUIRED');
		}
		const bundleRowId = await readBundleRowId(profileDir, name, manifest);
		if (!bundleRowId) {
			const patch = await readText(patchPath, '');
			const mounts = parseMountMap(patch);
			mounts.set(name, packageSlug(name));
			await atomicWriteText(patchPath, replaceManagedBlock(patch, MOUNT_START, MOUNT_END, serializeMountMap(mounts)), deps);
		}
		return name;
	} catch (error) {
		try {
			await rollbackInstall(context, beforeDeps, beforePatch);
		} catch (rollbackError) {
			throw rollbackError;
		}
		throw error;
	}
}

export function createPluginManager(options: PluginManagerOptions = {}) {
	const profileDir = resolveProfileDir(options);
	const profileName = options.profileName || 'web';
	const deps = options.deps || {};
	const detailCache = new Map<string, { at: number; value: GithubDetail }>();
	const registryUrl = validateRegistryUrl(options.registryUrl || process.env.DSH_PLUGIN_REGISTRY_URL || DEFAULT_REGISTRY_URL);
	const registryCacheMs = options.registryCacheMs ?? 10 * 60 * 1000;
	let registryCache: { at: number; document: PluginRegistry } | null = null;
	let registryRequest: Promise<RegistryRead> | null = null;
	let mutationTail: Promise<unknown> = Promise.resolve();

	function enqueueMutation<T>(work: () => Promise<T>): Promise<T> {
		const run = mutationTail.then(work, work);
		mutationTail = run.catch(() => {});
		return run;
	}

	async function snapshot() {
		let plugins = await listLocalPlugins(profileDir);
		const inventory = deps.inventory;
		if (inventory && typeof inventory.list === 'function') {
			try {
				const live = await inventory.list();
				const entries = isRecord(live) && Array.isArray(live.entries) ? live.entries : [];
				plugins = plugins.map((plugin) => {
					const entryValue = entries.find((item) => isRecord(item) && (item.entryId === plugin.rowId || item.moduleName === plugin.name));
					const entry = isRecord(entryValue) ? entryValue : null;
					return entry ? Object.assign({}, plugin, { runtimeEnabled: entry.enabled === true, runtimePhase: typeof entry.fiberPhase === 'string' ? entry.fiberPhase : null }) : plugin;
				});
			} catch {
				// Runtime inventory is supplementary. Profile management remains
				// available when the optional read-only service is absent or failed.
			}
		}
		return { apiVersion: API_VERSION, profile: profileName, profileDir, restartRequired: false, plugins };
	}

	async function readRegistry(force = false): Promise<RegistryRead> {
		if (!force && registryCache && Date.now() - registryCache.at < registryCacheMs) {
			return { document: registryCache.document, status: 'fresh', warning: null, generatedAt: registryCache.document.generatedAt };
		}
		if (registryRequest) return registryRequest;
		registryRequest = fetchRegistryDocument(registryUrl, deps).then((document) => {
			registryCache = { at: Date.now(), document };
			return { document, status: 'fresh' as const, warning: null, generatedAt: document.generatedAt };
		}).catch((error): RegistryRead => {
			const warning = error instanceof Error ? error.message : String(error);
			if (registryCache) {
				return { document: registryCache.document, status: 'stale', warning, generatedAt: registryCache.document.generatedAt };
			}
			return { document: null, status: 'unavailable', warning, generatedAt: null };
		}).finally(() => {
			registryRequest = null;
		});
		return registryRequest;
	}

	function registryEntry(item: RegistryItem): MarketplaceEntry {
		const entry: MarketplaceEntry = {
			id: item.id,
			repository: item.repository,
			packageName: item.packageName,
			description: item.description,
		};
		if (item.latestHint !== null) return Object.assign(entry, { latestHint: item.latestHint });
		return entry;
	}

	function mergeMarketplaceEntries(document: PluginRegistry | null): ResolvedMarketplaceEntry[] {
		const result: ResolvedMarketplaceEntry[] = MARKETPLACE.map((entry) => ({ entry, marketSource: 'featured' as const }));
		const seen = new Set(result.map(({ entry }) => entry.repository.toLowerCase()));
		for (const item of document?.items || []) {
			const key = item.repository.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			result.push({ entry: registryEntry(item), marketSource: 'registry' });
		}
		return result;
	}

	async function resolveMarketplaceEntry(id: string, cacheOnly = false): Promise<ResolvedMarketplaceEntry> {
		const featured = findMarketplaceEntry(id);
		if (featured) return { entry: featured, marketSource: 'featured' };
		const registry = cacheOnly && registryCache
			? { document: registryCache.document, status: 'fresh' as const, warning: null, generatedAt: registryCache.document.generatedAt }
			: await readRegistry();
		const item = registry.document?.items.find((candidate) => candidate.id === id || candidate.repository.toLowerCase() === id.toLowerCase());
		if (!item) throw new ApiError(404, '市场中不存在这个插件', 'MARKET_ENTRY_NOT_FOUND');
		return { entry: registryEntry(item), marketSource: 'registry' };
	}

	async function marketplace() {
		const local = await listLocalPlugins(profileDir);
		const registry = await readRegistry();
		const entries = mergeMarketplaceEntries(registry.document);
		return {
			apiVersion: API_VERSION,
			registry: {
				status: registry.status,
				generatedAt: registry.generatedAt,
				warning: registry.warning,
			},
			page: { offset: 0, limit: entries.length, total: entries.length, hasMore: false, nextCursor: null },
			items: entries.map(({ entry, marketSource }) => {
				const registryIcon = safeOptionalIconUrl((registry.document?.items.find((item) => item.id === entry.id)?.iconUrl) || '');
				const iconUrl = registryIcon || githubAvatarUrl(entry.repository);
				return Object.assign({
					id: entry.id,
					repository: entry.repository,
					description: entry.description,
					iconUrl,
					iconSource: registryIcon ? 'registry' : iconUrl ? 'github-avatar' : 'generic',
					marketSource,
					installable: Boolean(entry.installSource),
				}, marketplaceStatus(entry, local));
			}),
		};
	}

	async function detail(id: string, force = false) {
		const resolved = await resolveMarketplaceEntry(id);
		const entry = resolved.entry;
		const cached = detailCache.get(id);
		const maxAge = options.githubCacheMs || 5 * 60 * 1000;
		let value;
		let cacheState: { cached: boolean; stale: boolean; warning: string | null } = { cached: false, stale: false, warning: null };
		if (!force && cached && Date.now() - cached.at < maxAge) {
			value = cached.value;
			cacheState = { cached: true, stale: false, warning: null };
		} else {
			try {
				value = await fetchGithubDetail(entry, deps);
				detailCache.set(id, { at: Date.now(), value });
			} catch (error) {
				if (!cached) throw error;
				value = cached.value;
				cacheState = { cached: true, stale: true, warning: error instanceof Error ? error.message : String(error) };
			}
		}
		const local = await listLocalPlugins(profileDir);
		const state = marketplaceStatus(entry, local);
		if (state.status === 'installed' && value.latestVersion && compareVersions(state.installedVersion, value.latestVersion) < 0) state.status = 'update-available';
		return Object.assign({}, cacheState, value, state, { marketSource: resolved.marketSource, installable: Boolean(entry.installSource) });
	}

	async function setEnabled(name: unknown, enabled: unknown) {
		const pluginName = String(name || '');
		if (!PACKAGE_NAME_RE.test(pluginName)) throw new ApiError(400, '插件名不合法', 'PLUGIN_NAME_INVALID');
		if (enabled !== true && enabled !== false) throw new ApiError(400, 'enabled 必须是布尔值', 'ENABLED_INVALID');
		if (!enabled && PROTECTED_PACKAGES.has(pluginName)) throw new ApiError(409, '此插件维持扩展页与 Plugin Manager 运行，不能在当前页面停用', 'PLUGIN_PROTECTED');
		return enqueueMutation(async () => {
			const local = await listLocalPlugins(profileDir);
			const plugin = local.find((item) => item.name === pluginName);
			if (!plugin) throw new ApiError(404, `未安装插件：${pluginName}`, 'PLUGIN_NOT_FOUND');
			if (plugin.enabled === enabled) return { changed: false, restartRequired: false, plugin };
			const patchPath = join(profileDir, 'cordis.patch.yml');
			const patch = await readText(patchPath, '');
			const baseEnabled = baseEnabledFor(plugin.rowId, stripManagedBlocks(patch));
			const overrides = parseOverrideMap(patch);
			if (enabled === baseEnabled) overrides.delete(plugin.rowId);
			else overrides.set(plugin.rowId, !enabled);
			const next = replaceManagedBlock(patch, OVERRIDE_START, OVERRIDE_END, serializeOverrideMap(overrides));
			await atomicWriteText(patchPath, next, deps);
			return { changed: true, restartRequired: true, plugin: Object.assign({}, plugin, { enabled }) };
		});
	}

	async function importPlugin(source: unknown) {
		const validated = validateImportSource(source);
		return enqueueMutation(async () => {
			const name = await installSource(validated, { profileDir, profileName, deps });
			const local = await listLocalPlugins(profileDir);
			return { changed: true, restartRequired: true, plugin: local.find((item) => item.name === name) || null };
		});
	}

	async function installMarket(id: unknown) {
		const resolved = await resolveMarketplaceEntry(String(id || ''), true);
		if (!resolved.entry.installSource) throw new ApiError(409, 'Registry 发现条目当前仅支持查看，请使用手动导入', 'MARKET_REGISTRY_READ_ONLY');
		return importPlugin(resolved.entry.installSource);
	}

	return {
		profileDir,
		profileName,
		// Dynamic operation dispatch intentionally exposes heterogeneous JSON shapes.
		async call(op: unknown, body: UnknownRecord = {}): Promise<any> {
			switch (op) {
				case 'capabilities': return { apiVersion: API_VERSION, features: ['local-list', 'toggle', 'import', 'marketplace', 'github-detail'] };
				case 'list': return snapshot();
				case 'setEnabled': return setEnabled(body.name, body.enabled);
				case 'import': return importPlugin(body.source);
				case 'marketplace': return marketplace();
				case 'marketplace.detail': return detail(String(body.id || ''), body.force === true);
				case 'marketplace.install': return installMarket(body.id);
				default: throw new ApiError(400, `未知操作：${String(op)}`, 'OP_UNKNOWN');
			}
		},
	};
}

export const internals = {
	firstSentence,
	repositorySlug,
	dependencySource,
	packageSlug,
	parseOverrideMap,
	parseMountMap,
	serializeOverrideMap,
	serializeMountMap,
	listLocalPlugins,
	fetchGithubDetail,
	withoutTrailingSlash,
};
