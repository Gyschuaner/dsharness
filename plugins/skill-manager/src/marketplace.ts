// The transport and GitHub response shapes are intentionally runtime-validated
// at the Host boundary; the generated Host bundle is covered by the focused
// marketplace tests below.
// @ts-nocheck
/**
 * dsh-skill-manager — trusted Registry and GitHub Skill marketplace (DSH-008 / DSH-036).
 *
 * The browser only talks to this Host-owned service. The catalog merges a
 * reviewed fallback with trusted remote indexes; repository metadata and
 * files are read from GitHub at request time. Installation copies Markdown
 * and resource files only.  It never runs third-party scripts or package
 * lifecycle hooks.
 */
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { gunzipSync } from 'node:zlib';

import { parseSkill, patchInvocationFlag } from './catalog.js';
import {
	ApiError,
	NAME_RE,
	findProjectRoot,
	readProjectConfig,
	writeProjectConfig,
} from './state.js';

export const MARKET_API_VERSION = 1;

const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const MAX_FILES = 512;
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_SINGLE_FILE_BYTES = 10 * 1024 * 1024;
const DEFAULT_CACHE_TTL_MS = 10 * 60_000;
const MAX_ARCHIVE_BYTES = 60 * 1024 * 1024;
const MAX_ARCHIVE_EXPANDED_BYTES = 120 * 1024 * 1024;

/**
 * Curated public sources.  `path` points to one canonical Skill directory,
 * not a whole repository, so a market install cannot accidentally copy an
 * unrelated project tree.
 */
export const MARKETPLACE = Object.freeze([
	Object.freeze({
		id: 'anthropics/skills#skills/xlsx',
		name: 'xlsx',
		repository: 'anthropics/skills',
		path: 'skills/xlsx',
		ref: 'main',
		description: 'Create, edit, analyze, and verify spreadsheet workbooks.',
		tags: Object.freeze(['Anthropic', 'Documents']),
		marketSource: 'featured',
	}),
	Object.freeze({
		id: 'anthropics/skills#skills/docx',
		name: 'docx',
		repository: 'anthropics/skills',
		path: 'skills/docx',
		ref: 'main',
		description: 'Create, edit, and review Word documents.',
		tags: Object.freeze(['Anthropic', 'Documents']),
		marketSource: 'featured',
	}),
	Object.freeze({
		id: 'anthropics/skills#skills/skill-creator',
		name: 'skill-creator',
		repository: 'anthropics/skills',
		path: 'skills/skill-creator',
		ref: 'main',
		description: 'Create and improve reusable Agent Skills.',
		tags: Object.freeze(['Anthropic', 'Developer Tools']),
		marketSource: 'featured',
	}),
	Object.freeze({
		id: 'SmileTao/dsh-plugin-dev-skill#skills/dsh-plugin-dev',
		name: 'dsh-plugin-dev',
		repository: 'SmileTao/dsh-plugin-dev-skill',
		path: 'skills/dsh-plugin-dev',
		ref: 'main',
		description: 'DeepSeek Harness 插件开发指南，覆盖 Cordis、工具、事件与发布流程。',
		tags: Object.freeze(['DSH', 'Cordis']),
		marketSource: 'featured',
	}),
	Object.freeze({
		id: 'w2112515/dsh-plugin-development#skills/dsh-plugin-development',
		name: 'dsh-plugin-development',
		repository: 'w2112515/dsh-plugin-development',
		path: 'skills/dsh-plugin-development',
		ref: 'main',
		description: 'Portable DeepSeek Harness plugin design, implementation and diagnostics workflow.',
		tags: Object.freeze(['DSH', 'Cordis']),
		marketSource: 'featured',
	}),
]);

const TRUSTED_SKILL_INDEXES = Object.freeze([
	Object.freeze({
		id: 'anthropic-agent-skills',
		url: 'https://raw.githubusercontent.com/anthropics/skills/main/.claude-plugin/marketplace.json',
		repository: 'anthropics/skills',
		ref: 'main',
		label: 'Anthropic 官方',
	}),
]);

function isRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}

function digest(data) {
	return createHash('sha256').update(data).digest('hex');
}

function bundleHash(files) {
	const lines = files
		.slice()
		.sort((a, b) => a.path.localeCompare(b.path))
		.map((file) => `${file.path}=${digest(file.data)}`);
	return `sha256:${digest(Buffer.from(lines.join('\n'), 'utf8'))}`;
}

function safeRelativePath(value) {
	if (typeof value !== 'string' || value === '' || value.startsWith('/') || value.includes('\\') || value.includes('\0')) return false;
	const parts = value.split('/');
	return parts.every((part) => part !== '' && part !== '.' && part !== '..' && !part.startsWith('.git'));
}

function safeRepositoryUrl(repository) {
	return `https://github.com/${repository}`;
}

/** Parse a public GitHub repository or directory URL without accepting an
 * arbitrary download host. Directory URLs use GitHub's /tree/<ref>/<path>
 * shape; refs containing slashes can be supplied by using a repository URL
 * and choosing a discovered Skill path in the preview UI. */
export function parseGitHubSkillUrl(value) {
	let parsed;
	try { parsed = new URL(String(value).trim()); } catch { throw new ApiError(400, '请输入有效的 GitHub URL', 'GITHUB_URL_INVALID'); }
	if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'github.com') throw new ApiError(400, '仅支持 https://github.com 上的公开仓库', 'GITHUB_URL_UNSUPPORTED');
	const parts = parsed.pathname.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
	if (parts.length < 2) throw new ApiError(400, 'GitHub URL 必须包含 owner/repository', 'GITHUB_URL_INVALID');
	const repository = `${parts[0]}/${String(parts[1]).replace(/\.git$/i, '')}`;
	if (!REPOSITORY_RE.test(repository)) throw new ApiError(400, 'GitHub 仓库名称不合法', 'GITHUB_REPOSITORY_INVALID');
	let ref = 'main';
	let path = null;
	let explicitRef = false;
	if (parts.length > 2) {
		if (parts[2] !== 'tree' || parts.length < 4) throw new ApiError(400, '请使用仓库主页或 /tree/<ref>/<Skill目录> URL', 'GITHUB_URL_INVALID');
		ref = parts[3];
		explicitRef = true;
		path = parts.slice(4).join('/') || null;
		if (path !== null && !safeRelativePath(path)) throw new ApiError(400, 'GitHub Skill 路径不安全', 'GITHUB_PATH_UNSAFE');
	}
	if (ref.trim() === '' || ref.includes('..')) throw new ApiError(400, 'GitHub ref 不合法', 'GITHUB_REF_INVALID');
	return { repository, ref, explicitRef, path, repositoryUrl: safeRepositoryUrl(repository) };
}

function rawUrl(entry, path) {
	const encodedPath = path.split('/').map((part) => encodeURIComponent(part)).join('/');
	return `https://raw.githubusercontent.com/${entry.repository}/${encodeURIComponent(entry.ref)}/${encodedPath}`;
}

function entryBasePath(entry) {
	return entry.path === '.' ? '' : String(entry.path || '').replace(/\/$/, '');
}

function tarText(buffer, start, length) {
	const zero = buffer.indexOf(0, start);
	return buffer.subarray(start, zero >= start && zero < start + length ? zero : start + length).toString('utf8');
}

/** Minimal read-only tar.gz parser for GitHub codeload fallback. */
function parseRepositoryArchive(data) {
	let tar;
	try { tar = gunzipSync(data, { maxOutputLength: MAX_ARCHIVE_EXPANDED_BYTES }); } catch { throw new ApiError(502, 'GitHub 仓库归档无法解压或超过 120MB 上限', 'GITHUB_ARCHIVE_INVALID'); }
	const entries = [];
	for (let offset = 0; offset + 512 <= tar.length; ) {
		const header = tar.subarray(offset, offset + 512);
		if (header.every((byte) => byte === 0)) break;
		const name = tarText(header, 0, 100);
		const prefix = tarText(header, 345, 155);
		const fullName = prefix ? `${prefix}/${name}` : name;
		const rawSize = tarText(header, 124, 12).trim().replace(/\0.*$/, '');
		const size = rawSize === '' ? 0 : Number.parseInt(rawSize, 8);
		if (!Number.isFinite(size) || size < 0 || size > MAX_ARCHIVE_EXPANDED_BYTES) throw new ApiError(502, 'GitHub 仓库归档包含无效文件大小', 'GITHUB_ARCHIVE_INVALID');
		const type = String.fromCharCode(header[156] || 48);
		const bodyStart = offset + 512;
		const bodyEnd = bodyStart + size;
		if (bodyEnd > tar.length) throw new ApiError(502, 'GitHub 仓库归档已截断', 'GITHUB_ARCHIVE_INVALID');
		const slash = fullName.indexOf('/');
		const path = slash === -1 ? '' : fullName.slice(slash + 1).replace(/\/$/, '');
		if (path !== '') entries.push({ path, type, data: type === '0' || type === '\0' ? Buffer.from(tar.subarray(bodyStart, bodyEnd)) : null });
		if (entries.length > 20_000) throw new ApiError(413, 'GitHub 仓库归档条目过多', 'GITHUB_ARCHIVE_TOO_MANY_ENTRIES');
		offset = bodyStart + Math.ceil(size / 512) * 512;
	}
	return entries;
}

function checkedEntry(entry) {
	if (!isRecord(entry)) throw new ApiError(500, '市场目录包含无效条目');
	if (typeof entry.id !== 'string' || typeof entry.name !== 'string' || !NAME_RE.test(entry.name)) throw new ApiError(500, '市场条目名称不合法');
	if (typeof entry.repository !== 'string' || !REPOSITORY_RE.test(entry.repository)) throw new ApiError(500, `市场仓库不合法：${String(entry.repository)}`);
	if (typeof entry.path !== 'string' || !safeRelativePath(entry.path)) throw new ApiError(500, `市场路径不安全：${String(entry.path)}`);
	if (typeof entry.ref !== 'string' || entry.ref.trim() === '' || entry.ref.includes('..')) throw new ApiError(500, '市场引用不合法');
	return entry;
}

function normalizeEntries(entries) {
	const source = Array.isArray(entries) && entries.length > 0 ? entries : MARKETPLACE;
	return Object.freeze(source.map(checkedEntry));
}

async function responseBytes(response, limit) {
	if (response && response.body && typeof response.arrayBuffer === 'function') {
		const data = Buffer.from(await response.arrayBuffer());
		if (data.length > limit) throw new ApiError(413, '远程 Skill 文件超过大小上限', 'MARKET_FILE_TOO_LARGE');
		return data;
	}
	if (response && typeof response.text === 'function') {
		const text = await response.text();
		const data = Buffer.from(text, 'utf8');
		if (data.length > limit) throw new ApiError(413, '远程 Skill 文件超过大小上限', 'MARKET_FILE_TOO_LARGE');
		return data;
	}
	throw new Error('Host fetch 返回了无法读取的响应');
}

function safeAvatar(value) {
	try {
		const parsed = new URL(String(value));
		return parsed.protocol === 'https:' && parsed.hostname === 'avatars.githubusercontent.com' ? parsed.toString() : null;
	} catch {
		return null;
	}
}

function githubAvatarUrl(repository) {
	const owner = String(repository || '').split('/')[0] || '';
	if (!/^[A-Za-z0-9_.-]+$/.test(owner)) return null;
	return `https://github.com/${owner}.png?size=80`;
}

function cleanTopics(value) {
	return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim() !== '').slice(0, 12) : [];
}

function repoFallback(entry) {
	return {
		url: safeRepositoryUrl(entry.repository),
		description: entry.description,
		author: entry.repository.split('/')[0] ?? null,
		iconUrl: githubAvatarUrl(entry.repository),
		iconSource: 'github-avatar',
		stars: null,
		forks: null,
		language: null,
		license: null,
		lastPushedAt: null,
		topics: entry.tags || [],
		revision: null,
		stale: false,
		metadataError: null,
	};
}

/**
 * Create an isolated marketplace service.  `entries` and `fetch` are
 * injectable so Host tests never touch the network or a user's filesystem.
 */
export function createMarketplace(options = {}) {
	const entries = normalizeEntries(options.entries);
	const fetchImpl = options.fetch || globalThis.fetch;
	const logger = options.logger;
	const environment = options.env || process.env;
	const cacheTtlMs = Number.isFinite(options.cacheTtlMs) && options.cacheTtlMs > 0 ? options.cacheTtlMs : DEFAULT_CACHE_TTL_MS;
	const cache = new Map();
	const requests = new Map();
	const discoveredEntries = new Map();
	let githubBlockedUntil = 0;
	let githubBlockMessage = null;

	function findEntry(id) {
		return entries.find((entry) => entry.id === id) || discoveredEntries.get(id) || null;
	}

	async function request(url, { optional = false, limit = 2 * 1024 * 1024 } = {}) {
		if (typeof fetchImpl !== 'function') throw new Error('Host 未提供 fetch，无法读取 GitHub 市场');
		const githubApi = String(url).startsWith('https://api.github.com/');
		if (githubApi && githubBlockedUntil > Date.now()) {
			throw new Error(githubBlockMessage || 'GitHub API 暂时限流，当前使用缓存或仓库信息兜底');
		}
		const signal = globalThis.AbortSignal && typeof globalThis.AbortSignal.timeout === 'function'
			? globalThis.AbortSignal.timeout(8_000)
			: undefined;
		const token = environment.GITHUB_TOKEN || environment.GH_TOKEN;
		const response = await fetchImpl(url, {
			headers: {
				accept: 'application/vnd.github+json, application/json, text/plain',
				'user-agent': 'dsh-skill-manager/0.2.0',
				...(token ? { authorization: `Bearer ${token}` } : {}),
			},
			...(signal ? { signal } : {}),
		});
		if (optional && response.status === 404) return null;
		if (!response.ok) {
			const header = (name) => response.headers && typeof response.headers.get === 'function' ? response.headers.get(name) : null;
			const remaining = header('x-ratelimit-remaining');
			if (githubApi && (response.status === 429 || (response.status === 403 && remaining === '0'))) {
				const resetSeconds = Number(header('x-ratelimit-reset'));
				githubBlockedUntil = Number.isFinite(resetSeconds) && resetSeconds * 1000 > Date.now() ? resetSeconds * 1000 : Date.now() + 60_000;
				const resetLabel = new Date(githubBlockedUntil).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
				githubBlockMessage = `GitHub API ${token ? '认证' : '匿名'}额度已用尽，将于 ${resetLabel} 后恢复；当前使用缓存或仓库信息兜底`;
				throw new Error(githubBlockMessage);
			}
			throw new Error(`GitHub 请求失败（HTTP ${response.status}）`);
		}
		return response;
	}

	async function requestJson(url, options = {}) {
		const response = await request(url, options);
		if (response === null) return null;
		if (typeof response.json !== 'function') throw new Error('GitHub 响应不是 JSON');
		return response.json();
	}

	async function cached(key, force, load) {
		const hit = cache.get(key);
		if (!force && hit && hit.expiresAt > Date.now()) return { value: hit.value, stale: false };
		const active = requests.get(key);
		if (active) return active;
		const pending = (async () => {
		try {
			const value = await load();
			cache.set(key, { value, expiresAt: Date.now() + cacheTtlMs });
			return { value, stale: false };
		} catch (error) {
			if (hit) return { value: hit.value, stale: true, error: errorMessage(error) };
			throw error;
		}
		})();
		requests.set(key, pending);
		try { return await pending; } finally { if (requests.get(key) === pending) requests.delete(key); }
	}

	function trustedIndexEntries(index, value) {
		const document = isRecord(value) ? value : {};
		const plugins = Array.isArray(document.plugins) ? document.plugins : [];
		const output = [];
		for (const pluginValue of plugins) {
			if (!isRecord(pluginValue)) continue;
			const pluginName = typeof pluginValue.name === 'string' ? pluginValue.name.trim() : '';
			const pluginDescription = typeof pluginValue.description === 'string' ? pluginValue.description.trim() : '';
			for (const skillValue of Array.isArray(pluginValue.skills) ? pluginValue.skills : []) {
				const path = typeof skillValue === 'string' ? skillValue.replace(/^\.\//, '').replace(/\/$/, '') : '';
				const name = path.split('/').pop() || '';
				if (!safeRelativePath(path) || !NAME_RE.test(name)) continue;
				try {
					output.push(checkedEntry({
						id: `${index.repository}#${path}`,
						name,
						repository: index.repository,
						path,
						ref: index.ref,
						description: pluginDescription || `来自 ${index.label} 的 ${name} Skill。`,
						tags: [index.label, pluginName].filter(Boolean),
						marketSource: 'trusted-registry',
						registryId: index.id,
					}));
				} catch (error) {
					logger?.warn?.(`skill-manager: 忽略无效远程市场条目 ${index.id}/${path}: ${errorMessage(error)}`);
				}
			}
		}
		return output;
	}

	async function discoverEntries(force = false) {
		const warnings = [];
		for (const index of TRUSTED_SKILL_INDEXES) {
			try {
				const result = await cached(`skill-index:${index.id}`, force, async () => requestJson(index.url));
				for (const entry of trustedIndexEntries(index, result.value)) discoveredEntries.set(entry.id, entry);
				if (result.error) warnings.push(`${index.label}：${result.error}`);
			} catch (error) {
				warnings.push(`${index.label}：${errorMessage(error)}`);
			}
		}
		const merged = [];
		const seen = new Set();
		for (const entry of [...entries, ...discoveredEntries.values()]) {
			if (seen.has(entry.id)) continue;
			seen.add(entry.id);
			merged.push(entry);
		}
		return { entries: merged, warning: warnings.join('；') || null };
	}

	async function resolveEntry(id, force = false) {
		const current = findEntry(id);
		if (current !== null && !force) return current;
		await discoverEntries(force);
		return findEntry(id);
	}

	async function repositoryArchive(entry) {
		const result = await cached(`archive:${entry.repository}@${entry.ref}`, false, async () => {
			const response = await request(`https://codeload.github.com/${entry.repository}/tar.gz/${encodeURIComponent(entry.ref)}`, { limit: MAX_ARCHIVE_BYTES });
			return parseRepositoryArchive(await responseBytes(response, MAX_ARCHIVE_BYTES));
		});
		return result.value;
	}

	async function repositorySummary(entry, force = false) {
		return cached(`repo-summary:${entry.repository}`, force, async () => {
			const value = await requestJson(`https://api.github.com/repos/${entry.repository}`);
			const repo = isRecord(value) ? value : {};
			const owner = isRecord(repo.owner) ? repo.owner : {};
			const license = isRecord(repo.license) ? repo.license : {};
			return {
				url: typeof repo.html_url === 'string' ? repo.html_url : safeRepositoryUrl(entry.repository),
				description: typeof repo.description === 'string' && repo.description.trim() !== '' ? repo.description.trim() : entry.description,
				author: typeof owner.login === 'string' ? owner.login : entry.repository.split('/')[0] ?? null,
				iconUrl: safeAvatar(owner.avatar_url) || githubAvatarUrl(entry.repository),
				iconSource: safeAvatar(owner.avatar_url) ? 'github' : 'github-avatar',
				stars: Number.isFinite(repo.stargazers_count) ? repo.stargazers_count : null,
				forks: Number.isFinite(repo.forks_count) ? repo.forks_count : null,
				language: typeof repo.language === 'string' ? repo.language : null,
				license: typeof license.spdx_id === 'string' && license.spdx_id !== 'NOASSERTION' ? license.spdx_id : null,
				lastPushedAt: typeof repo.pushed_at === 'string' ? repo.pushed_at : null,
				topics: cleanTopics(repo.topics),
			};
		});
	}

	async function repository(entry, force = false) {
		return cached(`repo:${entry.id}`, force, async () => {
			const summary = await repositorySummary(entry, force);
			let revision = null;
			try {
				const basePath = entryBasePath(entry);
				const commitValue = await requestJson(`https://api.github.com/repos/${entry.repository}/commits?path=${encodeURIComponent(basePath === '' ? 'SKILL.md' : `${basePath}/SKILL.md`)}&sha=${encodeURIComponent(entry.ref)}&per_page=1`, { optional: true });
				if (Array.isArray(commitValue) && isRecord(commitValue[0]) && typeof commitValue[0].sha === 'string') revision = commitValue[0].sha;
			} catch (error) {
				logger?.warn?.(`skill-manager: GitHub commit metadata unavailable for ${entry.id}: ${errorMessage(error)}`);
			}
			return { ...summary.value, revision };
		});
	}

	async function metadata(entry, force = false) {
		try {
			const result = await repository(entry, force);
			return { ...repoFallback(entry), ...result.value, stale: result.stale, metadataError: result.error || null };
		} catch (error) {
			return { ...repoFallback(entry), metadataError: errorMessage(error) };
		}
	}

	function treePath(entry) {
		return `https://api.github.com/repos/${entry.repository}/git/trees/${encodeURIComponent(entry.ref)}?recursive=1`;
	}

	async function loadBundle(entry, enforceName = true) {
		const basePath = entryBasePath(entry);
		const prefix = basePath === '' ? '' : `${basePath}/`;
		let output;
		try {
			const treeValue = await requestJson(treePath(entry));
			const tree = isRecord(treeValue) && Array.isArray(treeValue.tree) ? treeValue.tree : [];
			if (isRecord(treeValue) && treeValue.truncated === true) throw new ApiError(502, 'GitHub 返回的 Skill 文件树被截断，暂不允许安装', 'MARKET_TREE_TRUNCATED');
			const selected = tree.filter((item) => isRecord(item) && typeof item.path === 'string' && (item.path === `${prefix}SKILL.md` || item.path.startsWith(prefix)));
			if (selected.some((item) => item.mode === '120000')) throw new ApiError(409, '远程 Skill 包含符号链接，拒绝安装', 'MARKET_SYMLINK_REJECTED');
			const files = selected
				.filter((item) => item.type === 'blob')
				.map((item) => ({ path: item.path.slice(prefix.length), size: Number.isFinite(item.size) ? item.size : null }))
				.filter((item) => safeRelativePath(item.path));
			if (files.length === 0 || !files.some((file) => file.path === 'SKILL.md')) throw new ApiError(404, '市场条目缺少 SKILL.md', 'MARKET_SKILL_NOT_FOUND');
			if (files.length > MAX_FILES) throw new ApiError(413, 'Skill 文件数超过上限', 'MARKET_TOO_MANY_FILES');
			output = [];
			let total = 0;
			for (const file of files.sort((a, b) => a.path.localeCompare(b.path))) {
				if (file.size !== null && file.size > MAX_SINGLE_FILE_BYTES) throw new ApiError(413, `远程文件过大：${file.path}`, 'MARKET_FILE_TOO_LARGE');
				const response = await request(rawUrl(entry, basePath === '' ? file.path : `${basePath}/${file.path}`), { limit: MAX_SINGLE_FILE_BYTES });
				const data = await responseBytes(response, MAX_SINGLE_FILE_BYTES);
				total += data.length;
				if (total > MAX_BYTES) throw new ApiError(413, 'Skill 总大小超过 50MB 上限', 'MARKET_TOO_LARGE');
				output.push({ path: file.path, data });
			}
		} catch (treeError) {
			logger?.warn?.(`skill-manager: GitHub tree/raw unavailable for ${entry.repository}@${entry.ref}; using codeload archive (${errorMessage(treeError)})`);
			const archive = await repositoryArchive(entry);
			const selected = archive.filter((item) => item.path === `${prefix}SKILL.md` || item.path.startsWith(prefix));
			if (selected.some((item) => item.type === '1' || item.type === '2')) throw new ApiError(409, '远程 Skill 包含符号链接，拒绝安装', 'MARKET_SYMLINK_REJECTED');
			output = selected
				.filter((item) => item.data !== null)
				.map((item) => ({ path: item.path.slice(prefix.length), data: item.data }))
				.filter((item) => safeRelativePath(item.path))
				.sort((a, b) => a.path.localeCompare(b.path));
			if (output.length === 0 || !output.some((file) => file.path === 'SKILL.md')) throw new ApiError(404, '市场条目缺少 SKILL.md', 'MARKET_SKILL_NOT_FOUND');
			if (output.length > MAX_FILES) throw new ApiError(413, 'Skill 文件数超过上限', 'MARKET_TOO_MANY_FILES');
			let total = 0;
			for (const file of output) {
				if (file.data.length > MAX_SINGLE_FILE_BYTES) throw new ApiError(413, `远程文件过大：${file.path}`, 'MARKET_FILE_TOO_LARGE');
				total += file.data.length;
			}
			if (total > MAX_BYTES) throw new ApiError(413, 'Skill 总大小超过 50MB 上限', 'MARKET_TOO_LARGE');
		}
		const manifestFile = output.find((file) => file.path === 'SKILL.md');
		if (!manifestFile) throw new ApiError(404, '市场条目缺少 SKILL.md', 'MARKET_SKILL_NOT_FOUND');
		const manifest = parseSkill(manifestFile.data.toString('utf8'));
		if (enforceName && manifest.name !== entry.name) throw new ApiError(409, `远程 Skill 名称与市场条目不一致：${manifest.name}`, 'MARKET_NAME_MISMATCH');
		return {
			files: output,
			hash: bundleHash(output),
			manifest,
			fileNames: output.map((file) => file.path),
		};
	}

	async function inspectGithub(url) {
		const parsed = parseGitHubSkillUrl(url);
		let ref = parsed.ref;
		if (!parsed.explicitRef) {
			try {
				const repoValue = await requestJson(`https://api.github.com/repos/${parsed.repository}`);
				if (isRecord(repoValue) && typeof repoValue.default_branch === 'string' && repoValue.default_branch.trim() !== '') ref = repoValue.default_branch;
			} catch { /* tree request below returns the actionable GitHub error */ }
		}
		const entry = { repository: parsed.repository, ref };
		const requested = parsed.path === null ? null : parsed.path.replace(/\/$/, '');
		let manifestPaths;
		let discoverySource = 'github-tree';
		try {
			const treeValue = await requestJson(treePath(entry));
			if (isRecord(treeValue) && treeValue.truncated === true) throw new ApiError(502, 'GitHub 返回的仓库文件树被截断，暂不允许安装', 'MARKET_TREE_TRUNCATED');
			const tree = isRecord(treeValue) && Array.isArray(treeValue.tree) ? treeValue.tree : [];
			manifestPaths = tree
				.filter((item) => isRecord(item) && item.type === 'blob' && item.mode !== '120000' && typeof item.path === 'string')
				.map((item) => item.path);
		} catch (treeError) {
			logger?.warn?.(`skill-manager: GitHub tree discovery unavailable for ${entry.repository}@${entry.ref}; using codeload archive (${errorMessage(treeError)})`);
			manifestPaths = (await repositoryArchive(entry)).filter((item) => item.data !== null).map((item) => item.path);
			discoverySource = 'github-codeload';
		}
		const candidates = manifestPaths
			.filter((path) => path === 'SKILL.md' || path.endsWith('/SKILL.md'))
			.map((path) => path === 'SKILL.md' ? '.' : path.slice(0, -'/SKILL.md'.length))
			.filter((path) => (path === '.' || safeRelativePath(path)) && (requested === null || path === requested))
			.sort((a, b) => a.localeCompare(b));
		if (candidates.length === 0) throw new ApiError(404, requested === null ? '仓库中没有找到目录型 SKILL.md' : `指定目录缺少 SKILL.md：${requested}`, 'MARKET_SKILL_NOT_FOUND');
		if (candidates.length > 100) throw new ApiError(413, '仓库中的 Skill 候选超过 100 个，请输入具体目录 URL', 'MARKET_TOO_MANY_CANDIDATES');
		return {
			apiVersion: MARKET_API_VERSION,
			repository: parsed.repository,
			ref,
			discoverySource,
			repositoryUrl: parsed.repositoryUrl,
			requestedPath: requested,
			candidates: candidates.map((path) => ({ path, suggestedName: path.split('/').pop() })),
		};
	}

	async function githubEntry(url, requestedPath) {
		const inspected = await inspectGithub(url);
		const explicitPath = typeof requestedPath === 'string' && requestedPath !== '' ? requestedPath : inspected.requestedPath;
		const path = explicitPath || (inspected.candidates.length === 1 ? inspected.candidates[0].path : null);
		if (path === null) throw new ApiError(409, '仓库包含多个 Skill，请先选择要安装的目录', 'GITHUB_PATH_REQUIRED');
		if (!inspected.candidates.some((candidate) => candidate.path === path)) throw new ApiError(400, '所选目录不在已校验的 Skill 候选中', 'GITHUB_PATH_INVALID');
		const base = {
			id: `github:${inspected.repository}#${path}@${inspected.ref}`,
			name: path === '.' ? 'repository-skill' : path.split('/').pop(),
			repository: inspected.repository,
			path,
			ref: inspected.ref,
			description: '',
			tags: [],
		};
		const bundle = await loadBundle(base, false);
		return { entry: { ...base, name: bundle.manifest.name, description: bundle.manifest.description || '' }, bundle, inspected };
	}

	async function localFiles(root) {
		const out = [];
		const rootResolved = resolve(root);
		const rootReal = await stat(rootResolved).then(() => resolve(rootResolved)).catch(() => rootResolved);
		const seen = new Set();
		async function walk(dir, depth) {
			if (depth > 8) throw new ApiError(409, '本地 Skill 目录层级过深', 'MARKET_LOCAL_UNSAFE');
			const entriesInDir = await readdir(dir, { withFileTypes: true });
			for (const entry of entriesInDir.sort((a, b) => a.name.localeCompare(b.name))) {
				if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
				const path = join(dir, entry.name);
				const link = await lstat(path);
				if (link.isSymbolicLink()) throw new ApiError(409, `本地 Skill 包含符号链接：${relative(rootResolved, path)}`, 'MARKET_LOCAL_UNSAFE');
				if (link.isDirectory()) {
					await walk(path, depth + 1);
				} else if (link.isFile()) {
					const real = resolve(path);
					if (seen.has(real) || (real !== rootReal && !real.startsWith(`${rootReal}${sep}`))) throw new ApiError(409, '本地 Skill 路径越界', 'MARKET_LOCAL_UNSAFE');
					seen.add(real);
					out.push({ path: relative(rootResolved, path).split(sep).join('/'), data: await readFile(path) });
				}
			}
		}
		await walk(rootResolved, 0);
		return out;
	}

	async function normalizedLocalHash(path, format) {
		if (format === 'flat') {
			const raw = await readFile(path);
			const normalized = path.endsWith('.md') ? Buffer.from(patchInvocationFlag(raw.toString('utf8'), false).content, 'utf8') : raw;
			return bundleHash([{ path: 'SKILL.md', data: normalized }]);
		}
		const files = await localFiles(dirname(path));
		return bundleHash(files.map((file) => file.path === 'SKILL.md'
			? { path: file.path, data: Buffer.from(patchInvocationFlag(file.data.toString('utf8'), false).content, 'utf8') }
			: file));
	}

	async function targetFor(projectRoot, name) {
		const skillsRoot = resolve(projectRoot, '.dsh', 'skills');
		const dirPath = resolve(skillsRoot, name);
		const flatPath = resolve(skillsRoot, `${name}.md`);
		if (!dirPath.startsWith(`${skillsRoot}${sep}`) || !flatPath.startsWith(`${skillsRoot}${sep}`)) throw new ApiError(400, 'Skill 安装路径越界', 'MARKET_PATH_UNSAFE');
		return { skillsRoot, dirPath, flatPath };
	}

	async function inspectExisting(target) {
		const dirStat = await lstat(target.dirPath).catch(() => null);
		if (dirStat !== null) {
			if (dirStat.isSymbolicLink()) throw new ApiError(409, '目标 Skill 目录是符号链接，拒绝覆盖', 'MARKET_TARGET_UNSAFE');
			if (!dirStat.isDirectory()) return { format: 'other', path: target.dirPath, hash: null };
			const manifestPath = join(target.dirPath, 'SKILL.md');
			const manifestStat = await lstat(manifestPath).catch(() => null);
			if (manifestStat === null || !manifestStat.isFile() || manifestStat.isSymbolicLink()) return { format: 'other', path: target.dirPath, hash: null };
			return { format: 'dir', path: manifestPath, hash: await normalizedLocalHash(manifestPath, 'dir') };
		}
		const flatStat = await lstat(target.flatPath).catch(() => null);
		if (flatStat !== null) {
			if (flatStat.isSymbolicLink() || !flatStat.isFile()) throw new ApiError(409, '目标 Skill 文件不安全，拒绝覆盖', 'MARKET_TARGET_UNSAFE');
			return { format: 'flat', path: target.flatPath, hash: await normalizedLocalHash(target.flatPath, 'flat') };
		}
		return null;
	}

	function marketSelection(state, entry) {
		const selection = state.config.sources && state.config.sources[entry.name];
		if (!selection) return null;
		if (selection.originType === 'github'
			&& selection.originRepository === entry.repository
			&& selection.originPath === entry.path
			&& selection.originRef === entry.ref) return selection;
		return selection.marketManaged === true && selection.marketId === entry.id ? selection : null;
	}

	async function projectItemState(projectRoot, state, entry, meta) {
		const target = await targetFor(projectRoot, entry.name);
		const existing = await inspectExisting(target);
		const selection = marketSelection(state, entry);
		if (existing === null) return { status: 'not-installed', existing: null, selection };
		if (selection === null) return { status: 'conflict', existing, selection };
		if (existing.hash !== (selection.originBundleHash || selection.marketHash)) return { status: 'modified', existing, selection };
		if (meta.revision && (selection.originRevision || selection.marketRevision) && meta.revision !== (selection.originRevision || selection.marketRevision)) {
			return { status: 'update-available', existing, selection };
		}
		return { status: 'installed', existing, selection };
	}

	function marketplaceSort(value) {
		const sort = String(value || 'relevance').trim();
		if (sort !== 'relevance' && sort !== 'popular' && sort !== 'recent') throw new ApiError(400, 'Skill 市场排序无效', 'MARKET_SORT_INVALID');
		return sort;
	}

	async function list(cwd, force = false, requestedSort = 'relevance') {
		const sort = marketplaceSort(requestedSort);
		const discovery = await discoverEntries(force);
		const sortedRepositoryMeta = new Map();
		if (sort !== 'relevance') {
			const representatives = new Map();
			for (const entry of discovery.entries) if (!representatives.has(entry.repository)) representatives.set(entry.repository, entry);
			for (const entry of representatives.values()) {
				try { sortedRepositoryMeta.set(entry.repository, await repositorySummary(entry, force)); } catch { sortedRepositoryMeta.set(entry.repository, null); }
			}
		}
		let projectRoot = null;
		let state = null;
		if (typeof cwd === 'string' && cwd !== '') {
			projectRoot = await findProjectRoot(cwd);
			state = await readProjectConfig(projectRoot, options);
		}
		const items = await Promise.all(discovery.entries.map(async (entry, relevanceIndex) => {
			const sortedMeta = sortedRepositoryMeta.get(entry.repository);
			const meta = sortedMeta && sortedMeta.value
				? { ...repoFallback(entry), ...sortedMeta.value, stale: sortedMeta.stale === true, metadataError: sortedMeta.error || null }
				: state && marketSelection(state, entry) !== null
					? await metadata(entry, force)
					: repoFallback(entry);
			const local = projectRoot && state ? await projectItemState(projectRoot, state, entry, meta).catch((error) => ({ status: 'error', existing: null, selection: null, metadataError: errorMessage(error) })) : { status: 'project-required', existing: null, selection: null };
			return {
				id: entry.id,
				name: entry.name,
				repository: entry.repository,
				path: entry.path,
				ref: entry.ref,
				description: meta.description || entry.description,
				iconUrl: meta.iconUrl,
				iconSource: meta.iconSource || (meta.iconUrl ? 'github' : 'generic'),
				repositoryUrl: meta.url,
				author: meta.author,
				license: meta.license,
				stars: meta.stars,
				forks: meta.forks,
				tags: entry.tags || [],
				marketSource: entry.marketSource || 'featured',
				latestRevision: meta.revision,
				lastPushedAt: meta.lastPushedAt,
				status: local.status,
				installedRevision: local.selection?.marketRevision || null,
				stale: meta.stale === true,
				metadataError: [meta.metadataError, local.metadataError].filter(Boolean).join('；') || null,
				relevanceIndex,
			};
		}));
		const ranked = sort === 'relevance' ? items : [...items].sort((left, right) => {
			if (sort === 'popular') {
				const delta = Number(right.stars || 0) - Number(left.stars || 0) || Number(right.forks || 0) - Number(left.forks || 0);
				if (delta !== 0) return delta;
			}
			if (sort === 'recent') {
				const delta = Date.parse(right.lastPushedAt || '') - Date.parse(left.lastPushedAt || '');
				if (Number.isFinite(delta) && delta !== 0) return delta;
			}
			return left.relevanceIndex - right.relevanceIndex;
		});
		return { apiVersion: MARKET_API_VERSION, source: 'featured+trusted-registries', sort, registries: TRUSTED_SKILL_INDEXES.map((index) => ({ id: index.id, label: index.label })), warning: discovery.warning, items: ranked.map(({ relevanceIndex: _relevanceIndex, ...item }) => item) };
	}

	async function detail(id, cwd, force = false) {
		const entry = await resolveEntry(id, force);
		if (entry === null) throw new ApiError(404, '市场条目不存在', 'MARKET_NOT_FOUND');
		const meta = await metadata(entry, force);
		let bundle = null;
		let contentError = null;
		try { bundle = await loadBundle(entry); } catch (error) { contentError = errorMessage(error); }
		let local = { status: 'project-required', existing: null, selection: null };
		if (typeof cwd === 'string' && cwd !== '') {
			const projectRoot = await findProjectRoot(cwd);
			const state = await readProjectConfig(projectRoot, options);
			local = await projectItemState(projectRoot, state, entry, meta).catch((error) => ({ status: 'error', existing: null, selection: null, metadataError: errorMessage(error) }));
		}
		return {
			apiVersion: MARKET_API_VERSION,
			id: entry.id,
			name: entry.name,
			repository: entry.repository,
			path: entry.path,
			ref: entry.ref,
			marketSource: entry.marketSource || 'featured',
			url: meta.url,
			description: meta.description || entry.description,
			iconUrl: meta.iconUrl,
			author: meta.author,
			stars: meta.stars,
			forks: meta.forks,
			language: meta.language,
			license: meta.license,
			lastPushedAt: meta.lastPushedAt,
			topics: meta.topics.length > 0 ? meta.topics : (entry.tags || []),
			latestRevision: meta.revision,
			status: local.status,
			metadataError: [meta.metadataError, contentError, local.metadataError].filter(Boolean).join('；') || null,
			stale: meta.stale === true,
			manifest: bundle ? { name: bundle.manifest.name, description: bundle.manifest.description, whenToUse: bundle.manifest.whenToUse } : null,
			fileCount: bundle ? bundle.files.length : null,
			files: bundle ? bundle.fileNames : [],
			contentHash: bundle ? bundle.hash : null,
			security: {
				trustedSource: true,
				frontmatterValidated: bundle !== null,
				pathsValidated: bundle !== null,
				symlinksRejected: true,
				thirdPartyCodeExecuted: false,
			},
		};
	}

	async function previewEntry(entry, bundle, cwd, curated) {
		if (typeof cwd !== 'string' || cwd === '') throw new ApiError(400, '安装 Skill 前请先选择当前项目');
		const projectRoot = await findProjectRoot(cwd);
		const state = await readProjectConfig(projectRoot, options);
		if (state.corrupt) throw new ApiError(409, `项目配置已损坏：${projectRoot}/.dsh/skill-manager.json`, 'PROJECT_CONFIG_CORRUPT');
		const target = await targetFor(projectRoot, entry.name);
		const existing = await inspectExisting(target);
		const selection = marketSelection(state, entry);
		const managed = existing !== null && selection !== null && existing.hash === (selection.originBundleHash || selection.marketHash);
		const action = existing === null ? 'install' : managed ? 'update' : 'conflict';
		const canInstall = action !== 'conflict';
		return {
			apiVersion: MARKET_API_VERSION,
			id: entry.id,
			name: entry.name,
			projectRoot,
			targetPath: target.dirPath,
			action,
			canInstall,
			message: canInstall
				? (action === 'update' ? '目标是未修改的受管 Skill，将安全更新并保留当前启用状态。' : '将安装到当前项目并默认停用，确认后可在本地 Skill 页启用。')
				: '目标路径已有本地 Skill 或已被修改，出于安全考虑不会覆盖。',
			existing: existing ? { format: existing.format, path: existing.path, hash: existing.hash, managed } : null,
			incoming: { hash: bundle.hash, fileCount: bundle.files.length, files: bundle.fileNames, manifest: bundle.manifest },
			checks: {
				remoteRepository: safeRepositoryUrl(entry.repository),
				trustedSource: curated === true,
				frontmatterValidated: true,
				pathsValidated: true,
				symlinksRejected: true,
				thirdPartyCodeExecuted: false,
			},
		};
	}

	async function preview(id, cwd) {
		const entry = await resolveEntry(id);
		if (entry === null) throw new ApiError(404, '市场条目不存在', 'MARKET_NOT_FOUND');
		return previewEntry(entry, await loadBundle(entry), cwd, true);
	}

	async function installEntry(entry, bundle, cwd, curated) {
		const plan = await previewEntry(entry, bundle, cwd, curated);
		if (!plan.canInstall) throw new ApiError(409, plan.message, 'MARKET_CONFLICT');
		const projectRoot = plan.projectRoot;
		const target = await targetFor(projectRoot, entry.name);
		const state = await readProjectConfig(projectRoot, options);
		const existing = await inspectExisting(target);
		const enabled = Array.isArray(state.config.enabled) && state.config.enabled.includes(entry.name);
		const files = bundle.files.map((file) => file.path === 'SKILL.md'
			? { path: file.path, data: Buffer.from(patchInvocationFlag(file.data.toString('utf8'), !enabled).content, 'utf8') }
			: file);
		const skillsRoot = target.skillsRoot;
		const swapRoot = join(dirname(skillsRoot), '.skill-manager-market-swap');
		const stagingDir = join(swapRoot, `${entry.name}.${randomUUID()}.staging`);
		const backupDir = join(swapRoot, `${entry.name}.${randomUUID()}.backup`);
		let movedBackup = false;
		await mkdir(stagingDir, { recursive: true });
		try {
			for (const file of files) {
				const path = join(stagingDir, file.path);
				if (!path.startsWith(`${stagingDir}${sep}`)) throw new ApiError(400, '远程 Skill 路径越界', 'MARKET_PATH_UNSAFE');
				await mkdir(dirname(path), { recursive: true });
				await writeFile(path, file.data);
			}
			if (existing !== null) {
				if (existing.format !== 'dir') throw new ApiError(409, '目标不是目录型 Skill，拒绝覆盖', 'MARKET_CONFLICT');
				await rename(target.dirPath, backupDir);
				movedBackup = true;
			}
			await mkdir(dirname(target.dirPath), { recursive: true });
			await rename(stagingDir, target.dirPath);
			const nextSources = { ...(state.config.sources || {}) };
			const revision = (await metadata(entry, false)).revision || null;
			const previous = nextSources[entry.name] || {};
			// `source` is reserved for catalog source keys such as project-dsh or
			// user-dsh. Remote provenance lives in origin* fields and must never
			// masquerade as a selectable source key.
			const { source: _previousSource, ...previousWithoutSelection } = previous;
			nextSources[entry.name] = {
				...previousWithoutSelection,
				...(curated ? {
					marketManaged: true,
					marketId: entry.id,
					marketRepository: entry.repository,
					marketPath: entry.path,
					marketRef: entry.ref,
					marketRevision: revision,
					marketHash: bundle.hash,
				} : { marketManaged: false }),
				originType: 'github',
				originRepository: entry.repository,
				originPath: entry.path,
				originRef: entry.ref,
				originRevision: revision,
				originBundleHash: bundle.hash,
				originUrl: `${safeRepositoryUrl(entry.repository)}/tree/${encodeURIComponent(entry.ref)}/${entry.path}`,
			};
			state.config.sources = nextSources;
			await writeProjectConfig(projectRoot, state.config, options);
			await rm(backupDir, { recursive: true, force: true }).catch(() => {});
			movedBackup = false;
			return {
				apiVersion: MARKET_API_VERSION,
				changed: true,
				updated: plan.action === 'update',
				installedDisabled: !enabled,
				id: entry.id,
				name: entry.name,
				projectRoot,
				path: target.dirPath,
				contentHash: bundle.hash,
			};
		} catch (error) {
			await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
			await rm(target.dirPath, { recursive: true, force: true }).catch(() => {});
			if (movedBackup) await rename(backupDir, target.dirPath).catch((restoreError) => logger?.warn?.(`skill-manager: 市场 Skill 回滚失败：${errorMessage(restoreError)}`));
			throw error;
		} finally {
			await rm(stagingDir, { recursive: true, force: true }).catch(() => {});
			await rm(backupDir, { recursive: true, force: true }).catch(() => {});
			await rm(swapRoot, { recursive: false, force: true }).catch(() => {});
		}
	}

	async function install(id, cwd) {
		const entry = await resolveEntry(id, true);
		if (entry === null) throw new ApiError(404, '市场条目不存在', 'MARKET_NOT_FOUND');
		return installEntry(entry, await loadBundle(entry), cwd, true);
	}

	async function githubPreview(url, path, cwd) {
		const resolved = await githubEntry(url, path);
		const plan = await previewEntry(resolved.entry, resolved.bundle, cwd, false);
		return { ...plan, source: 'github', repository: resolved.entry.repository, path: resolved.entry.path, ref: resolved.entry.ref };
	}

	async function githubInstall(url, path, cwd) {
		const resolved = await githubEntry(url, path);
		return installEntry(resolved.entry, resolved.bundle, cwd, false);
	}

	return {
		entries,
		list,
		detail,
		preview,
		install,
		inspectGithub,
		githubPreview,
		githubInstall,
		findEntry,
	};
}
