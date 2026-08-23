/**
 * dsh-plugin-manager — Host state and mutation engine (DSH-027).
 *
 * The profile package.json is the installation truth. cordis.patch.yml is the
 * mount truth. Plugin Manager owns only two marked blocks in the patch file;
 * user-authored rows outside those blocks are never rewritten.
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { MARKETPLACE, findMarketplaceEntry } from './marketplace.js';

export const API_VERSION = 1;
export const OVERRIDE_START = '# plugin-manager:overrides:start';
export const OVERRIDE_END = '# plugin-manager:overrides:end';
export const MOUNT_START = '# plugin-manager:mounts:start';
export const MOUNT_END = '# plugin-manager:mounts:end';
export const PROTECTED_PACKAGES = new Set(['dsh-extension-manager', 'dsh-plugin-manager']);

const PACKAGE_NAME_RE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;
const PACKAGE_SPEC_RE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*(?:@(?:latest|next|beta|alpha|\d[^\s]*))?$/i;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export class ApiError extends Error {
	constructor(status, message, code = 'PLUGIN_MANAGER_ERROR') {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.code = code;
	}
}

function withoutTrailingSlash(value) {
	return String(value || '').replace(/[\\/]+$/, '');
}

export function resolveProfileDir(options = {}) {
	if (options.profileDir) return resolve(options.profileDir);
	const dshHome = options.dshHome || process.env.DSH_HOME || join(homedir(), '.dsh');
	const profileName = options.profileName || 'web';
	return resolve(dshHome, 'profiles', profileName);
}

async function readText(path, fallback = '') {
	try {
		return await readFile(path, 'utf8');
	} catch (error) {
		if (error && error.code === 'ENOENT') return fallback;
		throw error;
	}
}

async function readJson(path) {
	let text;
	try {
		text = await readFile(path, 'utf8');
	} catch (error) {
		if (error && error.code === 'ENOENT') throw new ApiError(404, `文件不存在：${path}`, 'PROFILE_NOT_FOUND');
		throw error;
	}
	try {
		return JSON.parse(text);
	} catch {
		throw new ApiError(500, `JSON 文件损坏：${path}`, 'PROFILE_JSON_INVALID');
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
	return text.includes('\r\n') ? '\r\n' : '\n';
}

export function extractManagedBlock(text, start, end) {
	const startAt = text.indexOf(start);
	if (startAt < 0) return '';
	const endAt = text.indexOf(end, startAt + start.length);
	if (endAt < 0) throw new ApiError(500, `受管配置块不完整：${start}`, 'MANAGED_BLOCK_CORRUPT');
	return text.slice(startAt + start.length, endAt);
}

export function replaceManagedBlock(text, start, end, body) {
	const nl = normalizeNewline(text);
	const cleanBody = String(body || '').trim();
	const block = cleanBody === '' ? '' : `${start}${nl}${cleanBody}${nl}${end}`;
	const startAt = text.indexOf(start);
	if (startAt >= 0) {
		const endAt = text.indexOf(end, startAt + start.length);
		if (endAt < 0) throw new ApiError(500, `受管配置块不完整：${start}`, 'MANAGED_BLOCK_CORRUPT');
		let after = endAt + end.length;
		if (text.slice(after, after + 2) === '\r\n') after += 2;
		else if (text[after] === '\n') after += 1;
		const beforeText = text.slice(0, startAt).replace(/[\t ]+$/gm, '').replace(/[\r\n]+$/, '');
		const afterText = text.slice(after).replace(/^[\r\n]+/, '');
		return [beforeText, block, afterText].filter(Boolean).join(nl + nl) + nl;
	}
	if (block === '') return text;
	return text.replace(/[\r\n]+$/, '') + nl + nl + block + nl;
}

function unquote(value) {
	const trimmed = String(value || '').trim();
	if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

/** Parse just the row leaves used by DSH patches; this is not a YAML parser. */
export function parsePatchRows(text) {
	const rows = [];
	let current = null;
	for (const raw of String(text || '').split(/\r?\n/)) {
		const idMatch = /^(\s*)-\s+id:\s*(.+?)\s*$/.exec(raw);
		if (idMatch) {
			if (current) rows.push(current);
			current = { id: unquote(idMatch[2]), indent: idMatch[1].length, name: null, disabled: undefined };
			continue;
		}
		if (!current) continue;
		const indent = /^(\s*)/.exec(raw)[1].length;
		if (raw.trim() !== '' && !raw.trim().startsWith('#') && indent <= current.indent && /^\s*-/.test(raw)) {
			rows.push(current);
			current = null;
			continue;
		}
		const name = /^\s*name:\s*(.+?)\s*$/.exec(raw);
		if (name && indent > current.indent) current.name = unquote(name[1]);
		const disabled = /^\s*disabled:\s*(true|false)\s*$/i.exec(raw);
		if (disabled && indent > current.indent) current.disabled = disabled[1].toLowerCase() === 'true';
	}
	if (current) rows.push(current);
	return rows;
}

function parseOverrideMap(text) {
	const map = new Map();
	for (const row of parsePatchRows(extractManagedBlock(text, OVERRIDE_START, OVERRIDE_END))) {
		if (row.id && typeof row.disabled === 'boolean') map.set(row.id, row.disabled);
	}
	return map;
}

function serializeOverrideMap(map) {
	return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, disabled]) => (
		`- id: '${id.replace(/'/g, "''")}'\n  disabled: ${disabled ? 'true' : 'false'}`
	)).join('\n');
}

function parseMountMap(text) {
	const map = new Map();
	for (const row of parsePatchRows(extractManagedBlock(text, MOUNT_START, MOUNT_END))) {
		if (row.id && row.name) map.set(row.name, row.id);
	}
	return map;
}

function serializeMountMap(map) {
	if (map.size === 0) return '';
	const lines = ['- insert:'];
	for (const [name, id] of [...map.entries()].sort(([a], [b]) => a.localeCompare(b))) {
		lines.push(`  - id: '${id.replace(/'/g, "''")}'`);
		lines.push(`    name: '${name.replace(/'/g, "''")}'`);
	}
	return lines.join('\n');
}

function stripManagedBlocks(text) {
	let next = replaceManagedBlock(text, OVERRIDE_START, OVERRIDE_END, '');
	next = replaceManagedBlock(next, MOUNT_START, MOUNT_END, '');
	return next;
}

function packageSlug(name) {
	return name.replace(/^@/, '').replace(/\//g, '-').replace(/^dsh-/, '').replace(/[^A-Za-z0-9_-]+/g, '-').toLowerCase();
}

function repositorySlug(repository) {
	const raw = typeof repository === 'string' ? repository : repository && repository.url;
	if (!raw) return null;
	const value = String(raw).replace(/^git\+/, '').replace(/\.git$/, '').replace(/^github:/, '');
	const match = /github\.com[/:]([^/]+\/[^/#]+)$/i.exec(value);
	if (match) return match[1];
	return REPOSITORY_RE.test(value) ? value : null;
}

function dependencySource(spec) {
	const value = String(spec || '');
	if (/^(?:link|file):/i.test(value) || isAbsolute(value)) return '本地';
	if (/github|git\+|^git:/i.test(value)) return 'GitHub';
	return 'npm';
}

function firstSentence(value) {
	const text = String(value || '').replace(/\s+/g, ' ').trim();
	if (text === '') return '';
	for (let i = 0; i < text.length; i += 1) {
		const ch = text[i];
		let boundary = ch === '。' || ch === '！' || ch === '？' || ch === '!' || ch === '?';
		if (ch === '.') {
			const before = text[i - 1] || '';
			const after = text[i + 1] || '';
			const token = text.slice(0, i + 1).split(' ').pop().toLowerCase();
			const abbreviation = /^(?:e\.g\.|i\.e\.|etc\.|vs\.|mr\.|mrs\.|ms\.|dr\.)$/.test(token);
			boundary = !abbreviation && !(/[0-9]/.test(before) && /[0-9]/.test(after)) && (after === '' || /\s|["'”’）\]]/.test(after));
		}
		if (!boundary) continue;
		let end = i + 1;
		while (end < text.length && /["'”’）\]]/.test(text[end])) end += 1;
		return text.slice(0, end);
	}
	return text;
}

function exportClientEntry(pkg) {
	const value = pkg && pkg.exports && pkg.exports['./client'];
	if (typeof value === 'string') return value;
	if (value && typeof value === 'object') return value.default || null;
	return null;
}

export function isDshPluginManifest(pkg) {
	return Boolean(pkg && typeof pkg === 'object' && pkg.name && pkg.dsh && (
		pkg.dsh.client || pkg.dsh.bundle || pkg.dsh.plugin
	));
}

async function readInstalledManifest(profileDir, name) {
	const path = join(profileDir, 'node_modules', ...name.split('/'), 'package.json');
	try {
		return { path, manifest: JSON.parse(await readFile(path, 'utf8')) };
	} catch (error) {
		if (error && error.code === 'ENOENT') return { path, manifest: null };
		if (error instanceof SyntaxError) throw new ApiError(500, `插件清单损坏：${name}`, 'PLUGIN_MANIFEST_INVALID');
		throw error;
	}
}

async function readBundleRowId(profileDir, pkg) {
	const patch = pkg && pkg.dsh && pkg.dsh.bundle && pkg.dsh.bundle.patch;
	if (typeof patch !== 'string' || patch.trim() === '') return null;
	const packageDir = dirname(join(profileDir, 'node_modules', ...pkg.name.split('/'), 'package.json'));
	const text = await readText(resolve(packageDir, patch), '');
	return parsePatchRows(text)[0]?.id || null;
}

function baseEnabledFor(rowId, basePatch) {
	let enabled = true;
	for (const row of parsePatchRows(basePatch)) {
		if (row.id === rowId && typeof row.disabled === 'boolean') enabled = !row.disabled;
	}
	return enabled;
}

function effectiveEnabledFor(rowId, patch) {
	const overrides = parseOverrideMap(patch);
	if (overrides.has(rowId)) return !overrides.get(rowId);
	return baseEnabledFor(rowId, stripManagedBlocks(patch));
}

function semverParts(version) {
	const match = /^(?:v)?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(String(version || '').trim());
	return match ? match.slice(1).map(Number) : null;
}

export function compareVersions(a, b) {
	const av = semverParts(a);
	const bv = semverParts(b);
	if (!av || !bv) return 0;
	for (let i = 0; i < 3; i += 1) {
		if (av[i] !== bv[i]) return av[i] < bv[i] ? -1 : 1;
	}
	return 0;
}

async function listLocalPlugins(profileDir) {
	const packageJson = await readJson(join(profileDir, 'package.json'));
	const dependencies = packageJson.dependencies && typeof packageJson.dependencies === 'object' ? packageJson.dependencies : {};
	const patch = await readText(join(profileDir, 'cordis.patch.yml'), '');
	const patchRows = parsePatchRows(patch);
	const results = [];
	for (const [name, spec] of Object.entries(dependencies)) {
		if (!PACKAGE_NAME_RE.test(name)) continue;
		const { manifest } = await readInstalledManifest(profileDir, name);
		if (!manifest || !isDshPluginManifest(manifest)) continue;
		const directRow = [...patchRows].reverse().find((row) => row.name === name);
		const rowId = await readBundleRowId(profileDir, manifest) || directRow?.id || packageSlug(name);
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
			license: manifest.license || null,
			runtimeEnabled: null,
			runtimePhase: null,
			manifest: {
				hostEntry: typeof manifest.main === 'string' ? manifest.main : null,
				clientEntry: exportClientEntry(manifest),
				bundlePatch: manifest.dsh?.bundle?.patch || null,
			},
		});
	}
	return results.sort((a, b) => a.name.localeCompare(b.name));
}

function marketplaceStatus(entry, local) {
	const match = local.find((plugin) => (
		(entry.packageName && plugin.name === entry.packageName) ||
		(plugin.repository && plugin.repository.toLowerCase() === entry.repository.toLowerCase())
	));
	if (!match) return { status: 'not-installed', installedVersion: null, packageName: entry.packageName };
	const status = entry.latestHint && compareVersions(match.version, entry.latestHint) < 0 ? 'update-available' : 'installed';
	return { status, installedVersion: match.version, packageName: match.name };
}

function validateRepository(value) {
	if (!REPOSITORY_RE.test(String(value || ''))) throw new ApiError(400, 'GitHub 仓库名不合法', 'REPOSITORY_INVALID');
	return value;
}

function githubHeaders() {
	return {
		accept: 'application/vnd.github+json',
		'user-agent': 'dsh-plugin-manager/0.1',
		'x-github-api-version': '2022-11-28',
	};
}

async function fetchJson(url, deps, optional = false) {
	const fetchImpl = deps.fetch || globalThis.fetch;
	if (typeof fetchImpl !== 'function') throw new ApiError(503, '当前运行时不支持网络请求', 'FETCH_UNAVAILABLE');
	let response;
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

async function fetchText(url, deps, optional = false) {
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

async function fetchGithubDetail(entry, deps) {
	validateRepository(entry.repository);
	const repo = await fetchJson(`https://api.github.com/repos/${entry.repository}`, deps, false);
	const branch = encodeURIComponent(repo.default_branch || 'main');
	const [release, packageText] = await Promise.all([
		fetchJson(`https://api.github.com/repos/${entry.repository}/releases/latest`, deps, true),
		fetchText(`https://raw.githubusercontent.com/${entry.repository}/${branch}/package.json`, deps, true),
	]);
	let pkg = null;
	if (packageText) {
		try { pkg = JSON.parse(packageText); } catch { pkg = null; }
	}
	return {
		id: entry.id,
		repository: entry.repository,
		url: repo.html_url || `https://github.com/${entry.repository}`,
		description: firstSentence(repo.description || entry.description),
		author: repo.owner?.login || entry.repository.split('/')[0],
		stars: Number(repo.stargazers_count || 0),
		forks: Number(repo.forks_count || 0),
		language: repo.language || null,
		license: repo.license?.spdx_id || null,
		lastPushedAt: repo.pushed_at || null,
		topics: Array.isArray(repo.topics) ? repo.topics.slice(0, 8) : [],
		latestVersion: release?.tag_name || pkg?.version || null,
		releaseUrl: release?.html_url || null,
		manifest: pkg && isDshPluginManifest(pkg) ? {
			valid: true,
			packageName: pkg.name || entry.packageName,
			version: pkg.version || null,
			dshRequirement: pkg.engines?.dsh || pkg.peerDependencies?.['@deepseek-ai/dsh-agent'] || null,
			hostEntry: typeof pkg.main === 'string' ? pkg.main : null,
			clientEntry: exportClientEntry(pkg),
			bundlePatch: pkg.dsh?.bundle?.patch || null,
		} : { valid: false },
	};
}

export function validateImportSource(source) {
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

function defaultRunDsh(args, options = {}) {
	return new Promise((resolvePromise, rejectPromise) => {
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

async function installSource(source, context) {
	const { profileDir, profileName, deps } = context;
	const beforeProfile = await readJson(join(profileDir, 'package.json'));
	const beforeDeps = { ...(beforeProfile.dependencies || {}) };
	const runDsh = deps.runDsh || defaultRunDsh;
	await runDsh(['plugin', '--profile', profileName, 'add', source, '--ignore-scripts', '--reporter=append-only'], { timeoutMs: deps.installTimeoutMs || 120000 });
	const afterProfile = await readJson(join(profileDir, 'package.json'));
	const afterDeps = { ...(afterProfile.dependencies || {}) };
	const changed = Object.keys(afterDeps).filter((name) => beforeDeps[name] !== afterDeps[name]);
	if (changed.length === 0) throw new ApiError(500, '安装命令完成，但 profile 中没有检测到插件变化', 'INSTALL_NO_CHANGE');
	const candidates = [];
	for (const name of changed) {
		const { manifest } = await readInstalledManifest(profileDir, name);
		if (manifest && isDshPluginManifest(manifest)) candidates.push({ name, manifest });
	}
	if (candidates.length !== 1) {
		for (const name of changed) {
			await runDsh(['plugin', '--profile', profileName, 'remove', name, '--reporter=append-only'], { timeoutMs: deps.installTimeoutMs || 120000 }).catch(() => {});
		}
		throw new ApiError(400, candidates.length === 0 ? '来源不是可识别的 DSH 插件，已回滚安装' : '一次只能导入一个 DSH 插件，已回滚安装', 'PLUGIN_MANIFEST_REQUIRED');
	}
	const installed = candidates[0];
	const bundleRowId = await readBundleRowId(profileDir, installed.manifest);
	if (!bundleRowId) {
		const patchPath = join(profileDir, 'cordis.patch.yml');
		const patch = await readText(patchPath, '');
		const mounts = parseMountMap(patch);
		mounts.set(installed.name, packageSlug(installed.name));
		await atomicWriteText(patchPath, replaceManagedBlock(patch, MOUNT_START, MOUNT_END, serializeMountMap(mounts)), deps);
	}
	return installed.name;
}

export function createPluginManager(options = {}) {
	const profileDir = resolveProfileDir(options);
	const profileName = options.profileName || 'web';
	const deps = options.deps || {};
	const detailCache = new Map();
	let mutationTail = Promise.resolve();

	function enqueueMutation(work) {
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
				const entries = Array.isArray(live?.entries) ? live.entries : [];
				plugins = plugins.map((plugin) => {
					const entry = entries.find((item) => item && (item.entryId === plugin.rowId || item.moduleName === plugin.name));
					return entry ? Object.assign({}, plugin, { runtimeEnabled: entry.enabled === true, runtimePhase: entry.fiberPhase ?? null }) : plugin;
				});
			} catch {
				// Runtime inventory is supplementary. Profile management remains
				// available when the optional read-only service is absent or failed.
			}
		}
		return { apiVersion: API_VERSION, profile: profileName, profileDir, restartRequired: false, plugins };
	}

	async function marketplace() {
		const local = await listLocalPlugins(profileDir);
		return {
			apiVersion: API_VERSION,
			items: MARKETPLACE.map((entry) => Object.assign({
				id: entry.id,
				repository: entry.repository,
				description: entry.description,
			}, marketplaceStatus(entry, local))),
		};
	}

	async function detail(id, force = false) {
		const entry = findMarketplaceEntry(id);
		if (!entry) throw new ApiError(404, '市场中不存在这个插件', 'MARKET_ENTRY_NOT_FOUND');
		const cached = detailCache.get(id);
		const maxAge = options.githubCacheMs || 5 * 60 * 1000;
		if (!force && cached && Date.now() - cached.at < maxAge) return Object.assign({ cached: true }, cached.value);
		let value;
		try {
			value = await fetchGithubDetail(entry, deps);
			detailCache.set(id, { at: Date.now(), value });
		} catch (error) {
			if (cached) return Object.assign({ cached: true, stale: true, warning: error.message }, cached.value);
			throw error;
		}
		const local = await listLocalPlugins(profileDir);
		const state = marketplaceStatus(entry, local);
		if (state.status === 'installed' && value.latestVersion && compareVersions(state.installedVersion, value.latestVersion) < 0) state.status = 'update-available';
		return Object.assign({ cached: false }, value, state);
	}

	async function setEnabled(name, enabled) {
		if (!PACKAGE_NAME_RE.test(String(name || ''))) throw new ApiError(400, '插件名不合法', 'PLUGIN_NAME_INVALID');
		if (enabled !== true && enabled !== false) throw new ApiError(400, 'enabled 必须是布尔值', 'ENABLED_INVALID');
		if (!enabled && PROTECTED_PACKAGES.has(name)) throw new ApiError(409, '此插件维持扩展页与 Plugin Manager 运行，不能在当前页面停用', 'PLUGIN_PROTECTED');
		return enqueueMutation(async () => {
			const local = await listLocalPlugins(profileDir);
			const plugin = local.find((item) => item.name === name);
			if (!plugin) throw new ApiError(404, `未安装插件：${name}`, 'PLUGIN_NOT_FOUND');
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

	async function importPlugin(source) {
		const validated = validateImportSource(source);
		return enqueueMutation(async () => {
			const name = await installSource(validated, { profileDir, profileName, deps });
			const local = await listLocalPlugins(profileDir);
			return { changed: true, restartRequired: true, plugin: local.find((item) => item.name === name) || null };
		});
	}

	async function installMarket(id) {
		const entry = findMarketplaceEntry(id);
		if (!entry) throw new ApiError(404, '市场中不存在这个插件', 'MARKET_ENTRY_NOT_FOUND');
		return importPlugin(entry.installSource);
	}

	return {
		profileDir,
		profileName,
		async call(op, body = {}) {
			switch (op) {
				case 'capabilities': return { apiVersion: API_VERSION, features: ['local-list', 'toggle', 'import', 'marketplace', 'github-detail'] };
				case 'list': return snapshot();
				case 'setEnabled': return setEnabled(body.name, body.enabled);
				case 'import': return importPlugin(body.source);
				case 'marketplace': return marketplace();
				case 'marketplace.detail': return detail(body.id, body.force === true);
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
