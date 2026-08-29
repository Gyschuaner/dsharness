/**
 * dsh-plugin-manager — Host state and mutation engine (DSH-027).
 *
 * The profile package.json is the installation truth. cordis.patch.yml is the
 * mount truth. Plugin Manager owns only two marked blocks in the patch file;
 * user-authored rows outside those blocks are never rewritten.
 */
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { MARKETPLACE, findMarketplaceEntry, type MarketplaceEntry } from './marketplace.js';
import { DEFAULT_REGISTRY_URL, normalizeRegistry, type PluginRegistry, type RegistryItem } from './registry.js';

export const API_VERSION = 2;
export const OVERRIDE_START = '# plugin-manager:overrides:start';
export const OVERRIDE_END = '# plugin-manager:overrides:end';
export const MOUNT_START = '# plugin-manager:mounts:start';
export const MOUNT_END = '# plugin-manager:mounts:end';
export const PROTECTED_PACKAGES = new Set(['dsh-extension-manager', 'dsh-plugin-manager']);

const SYSTEM_VISIBLE_PACKAGES: ReadonlyMap<string, { source: string; spec: string; description: string }> = new Map([
	['@deepseek-ai/dsh-vision-bridge', {
		source: '系统 Bundle',
		spec: '@deepseek-ai/dsh-base',
		description: '为纯文本主模型提供按需图片理解的可选视觉桥。',
	}],
]);

const PACKAGE_NAME_RE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;
const PACKAGE_SPEC_RE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*(?:@(?:latest|next|beta|alpha|\d[^\s]*))?$/i;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function isAbsolutePluginPath(value: string): boolean {
	return isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value) || /^\\\\[^\\/]+[\\/]/.test(value);
}

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
	managed: boolean;
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
	npmRegistryUrl?: string;
	npmSearchUrl?: string;
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
	marketSource: 'featured' | 'registry' | 'npm';
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

async function readRuntimeManifest(profileDir: string, name: string): Promise<PluginManifest | null> {
	if (!PACKAGE_NAME_RE.test(name)) return null;
	try {
		const profileRequire = createRequire(join(profileDir, 'package.json'));
		const manifestPath = profileRequire.resolve(`${name}/package.json`);
		const parsed: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));
		return isDshPluginManifest(parsed) && parsed.name === name ? parsed : null;
	} catch {
		return null;
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
			managed: true,
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
	const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
	return {
		accept: 'application/vnd.github+json',
		'user-agent': 'dsh-plugin-manager/0.3',
		'x-github-api-version': '2022-11-28',
		...(token ? { authorization: `Bearer ${token}` } : {}),
	};
}

async function fetchRemoteJson(url: string, deps: PluginDependencies, label: string): Promise<unknown> {
	const fetchImpl = deps.fetch || globalThis.fetch;
	if (typeof fetchImpl !== 'function') throw new ApiError(503, '当前运行时不支持网络请求', 'FETCH_UNAVAILABLE');
	let response: Response;
	try {
		response = await fetchImpl(url, {
			headers: { accept: 'application/json', 'user-agent': 'dsh-plugin-manager/0.3' },
			signal: AbortSignal.timeout(deps.githubTimeoutMs || 8000),
		});
	} catch (error) {
		throw new ApiError(503, `${label} 请求失败：${error instanceof Error ? error.message : String(error)}`, 'REMOTE_UNAVAILABLE');
	}
	if (!response.ok) throw new ApiError(503, `${label} 返回 ${response.status}`, 'REMOTE_RESPONSE_ERROR');
	const length = Number(response.headers?.get?.('content-length') || 0);
	if (Number.isFinite(length) && length > 5 * 1024 * 1024) throw new ApiError(413, `${label} 响应过大`, 'REMOTE_RESPONSE_TOO_LARGE');
	return response.json();
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
	const dshManifest = isDshPluginManifest(pkg) && (!entry.packageName || pkg.name === entry.packageName) ? pkg : null;
	const manifest = dshManifest ? {
		valid: true as const,
		packageName: dshManifest.name || entry.packageName,
		version: dshManifest.version || null,
		dshRequirement: dshManifest.engines?.dsh || dshManifest.peerDependencies?.['@deepseek-ai/dsh-agent'] || null,
		hostEntry: typeof dshManifest.main === 'string' ? dshManifest.main : null,
		clientEntry: exportClientEntry(dshManifest),
		bundlePatch: dshManifest.dsh.bundle?.patch || null,
	} : entry.verifiedManifest || { valid: false as const };
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
		latestVersion: entry.verifiedManifest?.version || (release && typeof release.tag_name === 'string' ? release.tag_name : typeof pkg?.version === 'string' ? pkg.version : null),
		releaseUrl: release && typeof release.html_url === 'string' ? release.html_url : null,
		manifest,
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
		if (!isAbsolutePluginPath(path)) throw new ApiError(400, '本地插件目录必须使用绝对路径', 'SOURCE_PATH_RELATIVE');
		return value;
	}
	if (isAbsolutePluginPath(value)) return value;
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
	const npmRegistryUrl = validateRegistryUrl(options.npmRegistryUrl || process.env.DSH_PLUGIN_NPM_REGISTRY_URL || 'https://registry.npmjs.org/').replace(/\/$/, '');
	const npmSearchUrl = validateRegistryUrl(options.npmSearchUrl || process.env.DSH_PLUGIN_NPM_SEARCH_URL || 'https://registry.npmjs.org/-/v1/search');
	const registryCacheMs = options.registryCacheMs ?? 10 * 60 * 1000;
	let registryCache: { at: number; document: PluginRegistry } | null = null;
	let registryRequest: Promise<RegistryRead> | null = null;
	const npmEntryCache = new Map<string, { at: number; entry: MarketplaceEntry }>();
	const npmDiscoveredEntries = new Map<string, MarketplaceEntry>();
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
				const knownNames = new Set(plugins.map((plugin) => plugin.name));
				for (const entryValue of entries) {
					if (!isRecord(entryValue) || typeof entryValue.moduleName !== 'string' || typeof entryValue.entryId !== 'string') continue;
					const catalog = SYSTEM_VISIBLE_PACKAGES.get(entryValue.moduleName);
					if (!catalog || knownNames.has(entryValue.moduleName)) continue;
					const manifest = await readRuntimeManifest(profileDir, entryValue.moduleName);
					const runtimeEnabled = entryValue.enabled === true;
					plugins.push({
						name: entryValue.moduleName,
						rowId: entryValue.entryId,
						version: String(manifest?.version || '未知'),
						description: firstSentence(manifest?.description) || catalog.description,
						source: catalog.source,
						spec: catalog.spec,
						enabled: runtimeEnabled,
						managed: false,
						protected: false,
						repository: repositorySlug(manifest?.repository),
						license: typeof manifest?.license === 'string' ? manifest.license : null,
						runtimeEnabled,
						runtimePhase: typeof entryValue.fiberPhase === 'string' ? entryValue.fiberPhase : null,
						manifest: {
							hostEntry: typeof manifest?.main === 'string' ? manifest.main : null,
							clientEntry: manifest ? exportClientEntry(manifest) : null,
							bundlePatch: manifest?.dsh.bundle?.patch || null,
						},
					});
					knownNames.add(entryValue.moduleName);
				}
				plugins.sort((a, b) => a.name.localeCompare(b.name));
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

	async function npmEntry(packageName: string, id = `npm:${packageName}`, force = false): Promise<MarketplaceEntry | null> {
		if (!PACKAGE_NAME_RE.test(packageName)) return null;
		const hit = npmEntryCache.get(packageName);
		if (!force && hit && Date.now() - hit.at < registryCacheMs) {
			const entry = { ...hit.entry, id };
			npmDiscoveredEntries.set(id, entry);
			return entry;
		}
		const value = await fetchRemoteJson(`${npmRegistryUrl}/${encodeURIComponent(packageName)}/latest`, deps, 'npm Registry');
		if (!isDshPluginManifest(value) || value.name !== packageName || typeof value.version !== 'string' || value.version.trim() === '') return null;
		const repository = repositorySlug(value.repository);
		if (repository === null) return null;
		const entry: MarketplaceEntry = {
			id,
			repository,
			packageName,
			installSource: `${packageName}@${value.version}`,
			latestHint: value.version,
			description: firstSentence(value.description) || `${packageName} DSH 插件`,
			verifiedManifest: {
				valid: true,
				packageName,
				version: value.version,
				dshRequirement: value.engines?.dsh || value.peerDependencies?.['@deepseek-ai/dsh-agent'] || null,
				hostEntry: typeof value.main === 'string' ? value.main : null,
				clientEntry: exportClientEntry(value),
				bundlePatch: value.dsh.bundle?.patch || null,
			},
		};
		npmEntryCache.set(packageName, { at: Date.now(), entry: { ...entry, id: `npm:${packageName}` } });
		npmDiscoveredEntries.set(id, entry);
		return entry;
	}

	type MarketplaceSort = 'relevance' | 'popular' | 'recent';

	function marketplaceSort(value: unknown): MarketplaceSort {
		const sort = String(value || 'relevance').trim();
		if (sort !== 'relevance' && sort !== 'popular' && sort !== 'recent') throw new ApiError(400, 'Plugin 市场排序无效', 'MARKET_SORT_INVALID');
		return sort;
	}

	function rowPopularity(row: unknown): number | null {
		const score = isRecord(row) && isRecord(row.score) && isRecord(row.score.detail) ? row.score.detail.popularity : null;
		return Number.isFinite(score) ? Number(score) : null;
	}

	function rowPublishedAt(row: unknown): string | null {
		const pkg = isRecord(row) && isRecord(row.package) ? row.package : {};
		return typeof pkg.date === 'string' && Number.isFinite(Date.parse(pkg.date)) ? pkg.date : null;
	}

	function rankResolved(entries: ResolvedMarketplaceEntry[], sort: MarketplaceSort): ResolvedMarketplaceEntry[] {
		if (sort === 'relevance') return entries;
		return entries.map((resolved, index) => ({ resolved, index })).sort((left, right) => {
			if (sort === 'popular') {
				const delta = Number(right.resolved.entry.popularity || 0) - Number(left.resolved.entry.popularity || 0);
				if (delta !== 0) return delta;
			}
			if (sort === 'recent') {
				const delta = Date.parse(right.resolved.entry.publishedAt || '') - Date.parse(left.resolved.entry.publishedAt || '');
				if (Number.isFinite(delta) && delta !== 0) return delta;
			}
			return left.index - right.index;
		}).map(({ resolved }) => resolved);
	}

	async function npmMarketplacePage(query: string, cursor: string, limit: number, sort: MarketplaceSort, force = false) {
		const offset = cursor === '' ? 0 : Number(cursor);
		if (!Number.isInteger(offset) || offset < 0 || offset > 10_000) throw new ApiError(400, 'Plugin 市场分页游标无效', 'MARKET_CURSOR_INVALID');
		const rankedWindow = sort === 'recent' ? 250 : limit;
		const params = new URLSearchParams({
			text: [query, 'keywords:deepseek-harness'].filter(Boolean).join(' '),
			size: String(rankedWindow),
			from: String(sort === 'recent' ? 0 : offset),
		});
		if (sort === 'popular') {
			params.set('quality', '0');
			params.set('popularity', '1');
			params.set('maintenance', '0');
		}
		const value = await fetchRemoteJson(`${npmSearchUrl}?${params.toString()}`, deps, 'npm 搜索');
		const document = isRecord(value) ? value : {};
		const rows = Array.isArray(document.objects) ? document.objects : [];
		const rankedRows = sort === 'recent'
			? [...rows].sort((left, right) => Date.parse(rowPublishedAt(right) || '') - Date.parse(rowPublishedAt(left) || ''))
			: rows;
		const pageRows = sort === 'recent' ? rankedRows.slice(offset, offset + limit) : rankedRows;
		const resolvedRows = await Promise.all(pageRows.map(async (row) => {
			const pkg = isRecord(row) && isRecord(row.package) ? row.package : {};
			const name = typeof pkg.name === 'string' ? pkg.name : '';
			if (!PACKAGE_NAME_RE.test(name)) return null;
			try {
				const entry = await npmEntry(name, `npm:${name}`, force);
				return entry ? { ...entry, popularity: rowPopularity(row), publishedAt: rowPublishedAt(row) } : null;
			} catch { return null; }
		}));
		const entries: MarketplaceEntry[] = [];
		for (const entry of resolvedRows) if (entry !== null) entries.push(entry);
		const total = Number.isFinite(document.total) ? Number(document.total) : offset + rows.length;
		const available = sort === 'recent' ? Math.min(total, rankedRows.length) : total;
		const next = offset + limit < available ? String(offset + limit) : null;
		return { entries, total, nextCursor: next };
	}

	async function verifiedRegistryEntry(item: RegistryItem, force = false): Promise<MarketplaceEntry> {
		const base = registryEntry(item);
		if (item.packageName === null) return base;
		try {
			const verified = await npmEntry(item.packageName, item.id, force);
			return verified ? { ...verified, description: item.description || verified.description, iconUrl: item.iconUrl } : base;
		} catch {
			return base;
		}
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

	async function resolveMarketplaceEntry(id: string, force = false): Promise<ResolvedMarketplaceEntry> {
		const featured = findMarketplaceEntry(id);
		if (featured) return { entry: featured, marketSource: 'featured' };
		if (id.startsWith('npm:')) {
			const discovered = npmDiscoveredEntries.get(id);
			if (discovered && !force) return { entry: discovered, marketSource: 'npm' };
			const packageName = id.slice('npm:'.length);
			const entry = await npmEntry(packageName, id, force);
			if (!entry) throw new ApiError(404, 'npm 包不是可识别的 DSH 插件', 'MARKET_ENTRY_NOT_FOUND');
			return { entry, marketSource: 'npm' };
		}
		const cachedRegistryItem = !force ? registryCache?.document.items.find((candidate) => candidate.id === id || candidate.repository.toLowerCase() === id.toLowerCase()) : undefined;
		if (cachedRegistryItem) return { entry: await verifiedRegistryEntry(cachedRegistryItem, false), marketSource: 'registry' };
		const registry = await readRegistry(force);
		const item = registry.document?.items.find((candidate) => candidate.id === id || candidate.repository.toLowerCase() === id.toLowerCase());
		if (!item) throw new ApiError(404, '市场中不存在这个插件', 'MARKET_ENTRY_NOT_FOUND');
		return { entry: await verifiedRegistryEntry(item, force), marketSource: 'registry' };
	}

	async function marketplace(input: UnknownRecord = {}) {
		const query = String(input.query || '').trim();
		if (query.length > 120) throw new ApiError(400, '搜索词不能超过 120 个字符', 'MARKET_QUERY_INVALID');
		const cursor = String(input.cursor || '').trim();
		const sort = marketplaceSort(input.sort);
		if (cursor.length > 20) throw new ApiError(400, '分页游标无效', 'MARKET_CURSOR_INVALID');
		const requestedLimit = Number(input.limit);
		const limit = Number.isInteger(requestedLimit) ? Math.min(50, Math.max(5, requestedLimit)) : 24;
		const force = input.force === true;
		const local = await listLocalPlugins(profileDir);
		const registry = await readRegistry(force);
		let npmPage: { entries: MarketplaceEntry[]; total: number; nextCursor: string | null } = { entries: [], total: 0, nextCursor: null };
		let npmWarning: string | null = null;
		try {
			npmPage = await npmMarketplacePage(query, cursor, limit, sort, force);
		} catch (error) {
			npmWarning = error instanceof Error ? error.message : String(error);
		}
		const needle = query.toLowerCase();
		const matches = (entry: MarketplaceEntry) => needle === '' || entry.repository.toLowerCase().includes(needle) || String(entry.packageName || '').toLowerCase().includes(needle) || entry.description.toLowerCase().includes(needle);
		const entries: ResolvedMarketplaceEntry[] = [];
		if (cursor === '') {
			for (const entry of MARKETPLACE.filter(matches)) entries.push({ entry, marketSource: 'featured' });
			const registryEntries = await Promise.all((registry.document?.items || []).map((item) => verifiedRegistryEntry(item, force)));
			for (const entry of registryEntries.filter(matches)) entries.push({ entry, marketSource: 'registry' });
		}
		for (const entry of npmPage.entries) entries.push({ entry, marketSource: 'npm' });
		const unique: ResolvedMarketplaceEntry[] = [];
		const seenRepositories = new Set<string>();
		const seenPackages = new Set<string>();
		for (const resolved of entries) {
			const repositoryKey = resolved.entry.repository.toLowerCase();
			const packageKey = String(resolved.entry.packageName || '').toLowerCase();
			if (seenRepositories.has(repositoryKey) || (packageKey !== '' && seenPackages.has(packageKey))) continue;
			seenRepositories.add(repositoryKey);
			if (packageKey !== '') seenPackages.add(packageKey);
			unique.push(resolved);
		}
		const ranked = rankResolved(unique, sort);
		return {
			apiVersion: API_VERSION,
			source: 'featured+dsh-registry+npm-registry',
			query,
			sort,
			warning: npmWarning,
			registry: {
				status: registry.status,
				generatedAt: registry.generatedAt,
				warning: registry.warning,
			},
			page: { offset: cursor === '' ? 0 : Number(cursor), limit, total: npmPage.total, hasMore: npmPage.nextCursor !== null, nextCursor: npmPage.nextCursor },
			items: ranked.map(({ entry, marketSource }) => {
				const registryIcon = safeOptionalIconUrl((registry.document?.items.find((item) => item.id === entry.id)?.iconUrl) || '');
				const iconUrl = safeOptionalIconUrl(entry.iconUrl) || registryIcon || githubAvatarUrl(entry.repository);
				return Object.assign({
					id: entry.id,
					repository: entry.repository,
					description: entry.description,
					iconUrl,
					iconSource: registryIcon ? 'registry' : iconUrl ? 'github-avatar' : 'generic',
					marketSource,
					installable: Boolean(entry.installSource),
					latestVersion: entry.latestHint || null,
					popularity: entry.popularity || null,
					publishedAt: entry.publishedAt || null,
				}, marketplaceStatus(entry, local));
			}),
		};
	}

	async function detail(id: string, force = false) {
		const resolved = await resolveMarketplaceEntry(id, force);
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
				if (cached) {
					value = cached.value;
					cacheState = { cached: true, stale: true, warning: error instanceof Error ? error.message : String(error) };
				} else if (entry.packageName && entry.installSource) {
					value = {
						id: entry.id,
						repository: entry.repository,
						iconUrl: githubAvatarUrl(entry.repository),
						iconSource: 'github-avatar',
						url: `https://github.com/${entry.repository}`,
						description: entry.description,
						author: entry.repository.split('/')[0] || null,
						stars: null,
						forks: null,
						language: null,
						license: null,
						lastPushedAt: null,
						topics: ['deepseek-harness'],
						latestVersion: entry.latestHint || null,
						releaseUrl: null,
						manifest: { valid: true, packageName: entry.packageName, version: entry.latestHint || null },
					};
					cacheState = { cached: false, stale: true, warning: error instanceof Error ? error.message : String(error) };
				} else throw error;
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
			if (!plugin && SYSTEM_VISIBLE_PACKAGES.has(pluginName)) {
				throw new ApiError(409, '此插件由系统 Bundle 管理，当前页面只读展示', 'PLUGIN_SYSTEM_READ_ONLY');
			}
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
		const resolved = await resolveMarketplaceEntry(String(id || ''), false);
		if (!resolved.entry.installSource) throw new ApiError(409, '远程条目未通过 DSH manifest 校验，请使用手动导入并自行审查', 'MARKET_ENTRY_NOT_INSTALLABLE');
		return importPlugin(resolved.entry.installSource);
	}

	return {
		profileDir,
		profileName,
		// Dynamic operation dispatch intentionally exposes heterogeneous JSON shapes.
		async call(op: unknown, body: UnknownRecord = {}): Promise<any> {
			switch (op) {
				case 'capabilities': return { apiVersion: API_VERSION, features: ['local-list', 'toggle', 'import', 'marketplace', 'github-detail', 'npm-discovery', 'remote-search', 'cursor-pagination', 'market-sort', 'manifest-gated-install'] };
				case 'list': return snapshot();
				case 'setEnabled': return setEnabled(body.name, body.enabled);
				case 'import': return importPlugin(body.source);
				case 'marketplace': return marketplace(body);
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
