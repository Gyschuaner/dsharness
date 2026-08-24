// The transport and GitHub response shapes are intentionally runtime-validated
// at the Host boundary; the generated Host bundle is covered by the focused
// marketplace tests below.
// @ts-nocheck
/**
 * dsh-skill-manager — curated Skill marketplace (DSH-008 / V1.1).
 *
 * The browser only talks to this Host-owned service.  The catalog is a small
 * reviewed set of public GitHub Skill directories; repository metadata and
 * files are read from GitHub at request time.  Installation copies Markdown
 * and resource files only.  It never runs third-party scripts or package
 * lifecycle hooks.
 */
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { parseSkill, patchInvocationFlag } from './catalog.js';
import { ApiError, NAME_RE, findProjectRoot, readProjectConfig, writeProjectConfig, } from './state.js';
export const MARKET_API_VERSION = 1;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const MAX_FILES = 512;
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_SINGLE_FILE_BYTES = 10 * 1024 * 1024;
const DEFAULT_CACHE_TTL_MS = 10 * 60_000;
/**
 * Curated public sources.  `path` points to one canonical Skill directory,
 * not a whole repository, so a market install cannot accidentally copy an
 * unrelated project tree.
 */
export const MARKETPLACE = Object.freeze([
    Object.freeze({
        id: 'openai/skills#skills/.curated/cli-creator',
        name: 'cli-creator',
        repository: 'openai/skills',
        path: 'skills/.curated/cli-creator',
        ref: 'main',
        description: 'Create or improve command-line tools with a focused, testable workflow.',
        tags: Object.freeze(['OpenAI', 'CLI']),
    }),
    Object.freeze({
        id: 'openai/skills#skills/.curated/security-best-practices',
        name: 'security-best-practices',
        repository: 'openai/skills',
        path: 'skills/.curated/security-best-practices',
        ref: 'main',
        description: 'Perform language- and framework-specific security best-practice reviews.',
        tags: Object.freeze(['OpenAI', 'Security']),
    }),
    Object.freeze({
        id: 'openai/skills#skills/.curated/security-threat-model',
        name: 'security-threat-model',
        repository: 'openai/skills',
        path: 'skills/.curated/security-threat-model',
        ref: 'main',
        description: 'Create a repository-grounded threat model with actionable mitigations.',
        tags: Object.freeze(['OpenAI', 'Security']),
    }),
    Object.freeze({
        id: 'SmileTao/dsh-plugin-dev-skill#skills/dsh-plugin-dev',
        name: 'dsh-plugin-dev',
        repository: 'SmileTao/dsh-plugin-dev-skill',
        path: 'skills/dsh-plugin-dev',
        ref: 'main',
        description: 'DeepSeek Harness 插件开发指南，覆盖 Cordis、工具、事件与发布流程。',
        tags: Object.freeze(['DSH', 'Cordis']),
    }),
    Object.freeze({
        id: 'w2112515/dsh-plugin-development#skills/dsh-plugin-development',
        name: 'dsh-plugin-development',
        repository: 'w2112515/dsh-plugin-development',
        path: 'skills/dsh-plugin-development',
        ref: 'main',
        description: 'Portable DeepSeek Harness plugin design, implementation and diagnostics workflow.',
        tags: Object.freeze(['DSH', 'Cordis']),
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
    if (typeof value !== 'string' || value === '' || value.startsWith('/') || value.includes('\\') || value.includes('\0'))
        return false;
    const parts = value.split('/');
    return parts.every((part) => part !== '' && part !== '.' && part !== '..' && !part.startsWith('.git'));
}
function safeRepositoryUrl(repository) {
    return `https://github.com/${repository}`;
}
function rawUrl(entry, path) {
    const encodedPath = path.split('/').map((part) => encodeURIComponent(part)).join('/');
    return `https://raw.githubusercontent.com/${entry.repository}/${encodeURIComponent(entry.ref)}/${encodedPath}`;
}
function checkedEntry(entry) {
    if (!isRecord(entry))
        throw new ApiError(500, '市场目录包含无效条目');
    if (typeof entry.id !== 'string' || typeof entry.name !== 'string' || !NAME_RE.test(entry.name))
        throw new ApiError(500, '市场条目名称不合法');
    if (typeof entry.repository !== 'string' || !REPOSITORY_RE.test(entry.repository))
        throw new ApiError(500, `市场仓库不合法：${String(entry.repository)}`);
    if (typeof entry.path !== 'string' || !safeRelativePath(entry.path))
        throw new ApiError(500, `市场路径不安全：${String(entry.path)}`);
    if (typeof entry.ref !== 'string' || entry.ref.trim() === '' || entry.ref.includes('..'))
        throw new ApiError(500, '市场引用不合法');
    return entry;
}
function normalizeEntries(entries) {
    const source = Array.isArray(entries) && entries.length > 0 ? entries : MARKETPLACE;
    return Object.freeze(source.map(checkedEntry));
}
async function responseBytes(response, limit) {
    if (response && response.body && typeof response.arrayBuffer === 'function') {
        const data = Buffer.from(await response.arrayBuffer());
        if (data.length > limit)
            throw new ApiError(413, '远程 Skill 文件超过大小上限', 'MARKET_FILE_TOO_LARGE');
        return data;
    }
    if (response && typeof response.text === 'function') {
        const text = await response.text();
        const data = Buffer.from(text, 'utf8');
        if (data.length > limit)
            throw new ApiError(413, '远程 Skill 文件超过大小上限', 'MARKET_FILE_TOO_LARGE');
        return data;
    }
    throw new Error('Host fetch 返回了无法读取的响应');
}
function safeAvatar(value) {
    try {
        const parsed = new URL(String(value));
        return parsed.protocol === 'https:' && parsed.hostname === 'avatars.githubusercontent.com' ? parsed.toString() : null;
    }
    catch {
        return null;
    }
}
function cleanTopics(value) {
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim() !== '').slice(0, 12) : [];
}
function repoFallback(entry) {
    return {
        url: safeRepositoryUrl(entry.repository),
        description: entry.description,
        author: entry.repository.split('/')[0] ?? null,
        iconUrl: null,
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
    const cacheTtlMs = Number.isFinite(options.cacheTtlMs) && options.cacheTtlMs > 0 ? options.cacheTtlMs : DEFAULT_CACHE_TTL_MS;
    const cache = new Map();
    function findEntry(id) {
        return entries.find((entry) => entry.id === id) || null;
    }
    async function request(url, { optional = false, limit = 2 * 1024 * 1024 } = {}) {
        if (typeof fetchImpl !== 'function')
            throw new Error('Host 未提供 fetch，无法读取 GitHub 市场');
        const signal = globalThis.AbortSignal && typeof globalThis.AbortSignal.timeout === 'function'
            ? globalThis.AbortSignal.timeout(8_000)
            : undefined;
        const response = await fetchImpl(url, {
            headers: {
                accept: 'application/vnd.github+json, application/json, text/plain',
                'user-agent': 'dsh-skill-manager/0.2.0',
            },
            ...(signal ? { signal } : {}),
        });
        if (optional && response.status === 404)
            return null;
        if (!response.ok)
            throw new Error(`GitHub 请求失败（HTTP ${response.status}）`);
        return response;
    }
    async function requestJson(url, options = {}) {
        const response = await request(url, options);
        if (response === null)
            return null;
        if (typeof response.json !== 'function')
            throw new Error('GitHub 响应不是 JSON');
        return response.json();
    }
    async function cached(key, force, load) {
        const hit = cache.get(key);
        if (!force && hit && hit.expiresAt > Date.now())
            return { value: hit.value, stale: false };
        try {
            const value = await load();
            cache.set(key, { value, expiresAt: Date.now() + cacheTtlMs });
            return { value, stale: false };
        }
        catch (error) {
            if (hit)
                return { value: hit.value, stale: true, error: errorMessage(error) };
            throw error;
        }
    }
    async function repository(entry, force = false) {
        return cached(`repo:${entry.id}`, force, async () => {
            const value = await requestJson(`https://api.github.com/repos/${entry.repository}`);
            const repo = isRecord(value) ? value : {};
            const owner = isRecord(repo.owner) ? repo.owner : {};
            const license = isRecord(repo.license) ? repo.license : {};
            let revision = null;
            try {
                const commitValue = await requestJson(`https://api.github.com/repos/${entry.repository}/commits?path=${encodeURIComponent(`${entry.path}/SKILL.md`)}&sha=${encodeURIComponent(entry.ref)}&per_page=1`, { optional: true });
                if (Array.isArray(commitValue) && isRecord(commitValue[0]) && typeof commitValue[0].sha === 'string')
                    revision = commitValue[0].sha;
            }
            catch (error) {
                logger?.warn?.(`skill-manager: GitHub commit metadata unavailable for ${entry.id}: ${errorMessage(error)}`);
            }
            return {
                url: typeof repo.html_url === 'string' ? repo.html_url : safeRepositoryUrl(entry.repository),
                description: typeof repo.description === 'string' && repo.description.trim() !== '' ? repo.description.trim() : entry.description,
                author: typeof owner.login === 'string' ? owner.login : entry.repository.split('/')[0] ?? null,
                iconUrl: safeAvatar(owner.avatar_url),
                stars: Number.isFinite(repo.stargazers_count) ? repo.stargazers_count : null,
                forks: Number.isFinite(repo.forks_count) ? repo.forks_count : null,
                language: typeof repo.language === 'string' ? repo.language : null,
                license: typeof license.spdx_id === 'string' && license.spdx_id !== 'NOASSERTION' ? license.spdx_id : null,
                lastPushedAt: typeof repo.pushed_at === 'string' ? repo.pushed_at : null,
                topics: cleanTopics(repo.topics),
                revision,
            };
        });
    }
    async function metadata(entry, force = false) {
        try {
            const result = await repository(entry, force);
            return { ...repoFallback(entry), ...result.value, stale: result.stale, metadataError: result.error || null };
        }
        catch (error) {
            return { ...repoFallback(entry), metadataError: errorMessage(error) };
        }
    }
    function treePath(entry) {
        return `https://api.github.com/repos/${entry.repository}/git/trees/${encodeURIComponent(entry.ref)}?recursive=1`;
    }
    async function loadBundle(entry) {
        const treeValue = await requestJson(treePath(entry));
        const tree = isRecord(treeValue) && Array.isArray(treeValue.tree) ? treeValue.tree : [];
        if (isRecord(treeValue) && treeValue.truncated === true)
            throw new ApiError(502, 'GitHub 返回的 Skill 文件树被截断，暂不允许安装', 'MARKET_TREE_TRUNCATED');
        const prefix = `${entry.path.replace(/\/$/, '')}/`;
        const files = tree
            .filter((item) => isRecord(item) && item.type === 'blob' && typeof item.path === 'string')
            .map((item) => ({ path: item.path, size: Number.isFinite(item.size) ? item.size : null }))
            .filter((item) => item.path === `${prefix}SKILL.md` || item.path.startsWith(prefix))
            .map((item) => ({ ...item, path: item.path.slice(prefix.length) }))
            .filter((item) => safeRelativePath(item.path));
        if (files.length === 0 || !files.some((file) => file.path === 'SKILL.md'))
            throw new ApiError(404, '市场条目缺少 SKILL.md', 'MARKET_SKILL_NOT_FOUND');
        if (files.length > MAX_FILES)
            throw new ApiError(413, 'Skill 文件数超过上限', 'MARKET_TOO_MANY_FILES');
        const output = [];
        let total = 0;
        for (const file of files.sort((a, b) => a.path.localeCompare(b.path))) {
            if (file.size !== null && file.size > MAX_SINGLE_FILE_BYTES)
                throw new ApiError(413, `远程文件过大：${file.path}`, 'MARKET_FILE_TOO_LARGE');
            const response = await request(rawUrl(entry, `${entry.path}/${file.path}`), { limit: MAX_SINGLE_FILE_BYTES });
            const data = await responseBytes(response, MAX_SINGLE_FILE_BYTES);
            total += data.length;
            if (total > MAX_BYTES)
                throw new ApiError(413, 'Skill 总大小超过 50MB 上限', 'MARKET_TOO_LARGE');
            output.push({ path: file.path, data });
        }
        const manifestFile = output.find((file) => file.path === 'SKILL.md');
        if (!manifestFile)
            throw new ApiError(404, '市场条目缺少 SKILL.md', 'MARKET_SKILL_NOT_FOUND');
        const manifest = parseSkill(manifestFile.data.toString('utf8'));
        if (manifest.name !== entry.name)
            throw new ApiError(409, `远程 Skill 名称与市场条目不一致：${manifest.name}`, 'MARKET_NAME_MISMATCH');
        return {
            files: output,
            hash: bundleHash(output),
            manifest,
            fileNames: output.map((file) => file.path),
        };
    }
    async function localFiles(root) {
        const out = [];
        const rootResolved = resolve(root);
        const rootReal = await stat(rootResolved).then(() => resolve(rootResolved)).catch(() => rootResolved);
        const seen = new Set();
        async function walk(dir, depth) {
            if (depth > 8)
                throw new ApiError(409, '本地 Skill 目录层级过深', 'MARKET_LOCAL_UNSAFE');
            const entriesInDir = await readdir(dir, { withFileTypes: true });
            for (const entry of entriesInDir.sort((a, b) => a.name.localeCompare(b.name))) {
                if (entry.name.startsWith('.') || entry.name === 'node_modules')
                    continue;
                const path = join(dir, entry.name);
                const link = await lstat(path);
                if (link.isSymbolicLink())
                    throw new ApiError(409, `本地 Skill 包含符号链接：${relative(rootResolved, path)}`, 'MARKET_LOCAL_UNSAFE');
                if (link.isDirectory()) {
                    await walk(path, depth + 1);
                }
                else if (link.isFile()) {
                    const real = resolve(path);
                    if (seen.has(real) || (real !== rootReal && !real.startsWith(`${rootReal}${sep}`)))
                        throw new ApiError(409, '本地 Skill 路径越界', 'MARKET_LOCAL_UNSAFE');
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
        if (!dirPath.startsWith(`${skillsRoot}${sep}`) || !flatPath.startsWith(`${skillsRoot}${sep}`))
            throw new ApiError(400, 'Skill 安装路径越界', 'MARKET_PATH_UNSAFE');
        return { skillsRoot, dirPath, flatPath };
    }
    async function inspectExisting(target) {
        const dirStat = await lstat(target.dirPath).catch(() => null);
        if (dirStat !== null) {
            if (dirStat.isSymbolicLink())
                throw new ApiError(409, '目标 Skill 目录是符号链接，拒绝覆盖', 'MARKET_TARGET_UNSAFE');
            if (!dirStat.isDirectory())
                return { format: 'other', path: target.dirPath, hash: null };
            const manifestPath = join(target.dirPath, 'SKILL.md');
            const manifestStat = await lstat(manifestPath).catch(() => null);
            if (manifestStat === null || !manifestStat.isFile() || manifestStat.isSymbolicLink())
                return { format: 'other', path: target.dirPath, hash: null };
            return { format: 'dir', path: manifestPath, hash: await normalizedLocalHash(manifestPath, 'dir') };
        }
        const flatStat = await lstat(target.flatPath).catch(() => null);
        if (flatStat !== null) {
            if (flatStat.isSymbolicLink() || !flatStat.isFile())
                throw new ApiError(409, '目标 Skill 文件不安全，拒绝覆盖', 'MARKET_TARGET_UNSAFE');
            return { format: 'flat', path: target.flatPath, hash: await normalizedLocalHash(target.flatPath, 'flat') };
        }
        return null;
    }
    function marketSelection(state, entry) {
        const selection = state.config.sources && state.config.sources[entry.name];
        return selection && selection.marketManaged === true && selection.marketId === entry.id ? selection : null;
    }
    async function projectItemState(projectRoot, state, entry, meta) {
        const target = await targetFor(projectRoot, entry.name);
        const existing = await inspectExisting(target);
        const selection = marketSelection(state, entry);
        if (existing === null)
            return { status: 'not-installed', existing: null, selection };
        if (selection === null)
            return { status: 'conflict', existing, selection };
        if (existing.hash !== selection.marketHash)
            return { status: 'modified', existing, selection };
        if (meta.revision && selection.marketRevision && meta.revision !== selection.marketRevision) {
            return { status: 'update-available', existing, selection };
        }
        return { status: 'installed', existing, selection };
    }
    async function list(cwd, force = false) {
        let projectRoot = null;
        let state = null;
        if (typeof cwd === 'string' && cwd !== '') {
            projectRoot = await findProjectRoot(cwd);
            state = await readProjectConfig(projectRoot, options);
        }
        const items = await Promise.all(entries.map(async (entry) => {
            const meta = await metadata(entry, force);
            const local = projectRoot && state ? await projectItemState(projectRoot, state, entry, meta).catch((error) => ({ status: 'error', existing: null, selection: null, metadataError: errorMessage(error) })) : { status: 'project-required', existing: null, selection: null };
            return {
                id: entry.id,
                name: entry.name,
                repository: entry.repository,
                path: entry.path,
                ref: entry.ref,
                description: meta.description || entry.description,
                iconUrl: meta.iconUrl,
                iconSource: meta.iconUrl ? 'github' : 'generic',
                repositoryUrl: meta.url,
                author: meta.author,
                license: meta.license,
                tags: entry.tags || [],
                latestRevision: meta.revision,
                lastPushedAt: meta.lastPushedAt,
                status: local.status,
                installedRevision: local.selection?.marketRevision || null,
                stale: meta.stale === true,
                metadataError: [meta.metadataError, local.metadataError].filter(Boolean).join('；') || null,
            };
        }));
        return { apiVersion: MARKET_API_VERSION, source: 'curated-github', items };
    }
    async function detail(id, cwd, force = false) {
        const entry = findEntry(id);
        if (entry === null)
            throw new ApiError(404, '市场条目不存在', 'MARKET_NOT_FOUND');
        const meta = await metadata(entry, force);
        let bundle = null;
        let contentError = null;
        try {
            bundle = await loadBundle(entry);
        }
        catch (error) {
            contentError = errorMessage(error);
        }
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
    async function preview(id, cwd) {
        const entry = findEntry(id);
        if (entry === null)
            throw new ApiError(404, '市场条目不存在', 'MARKET_NOT_FOUND');
        if (typeof cwd !== 'string' || cwd === '')
            throw new ApiError(400, '安装 Skill 前请先选择当前项目');
        const projectRoot = await findProjectRoot(cwd);
        const state = await readProjectConfig(projectRoot, options);
        if (state.corrupt)
            throw new ApiError(409, `项目配置已损坏：${projectRoot}/.dsh/skill-manager.json`, 'PROJECT_CONFIG_CORRUPT');
        const target = await targetFor(projectRoot, entry.name);
        const existing = await inspectExisting(target);
        const selection = marketSelection(state, entry);
        const bundle = await loadBundle(entry);
        const managed = existing !== null && selection !== null && existing.hash === selection.marketHash;
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
                ? (action === 'update' ? '目标是未修改的市场 Skill，将安全更新并保留当前启用状态。' : '将安装到当前项目并默认停用，确认后可在本地 Skill 页启用。')
                : '目标路径已有本地 Skill 或已被修改，出于安全考虑不会覆盖。',
            existing: existing ? { format: existing.format, path: existing.path, hash: existing.hash, managed } : null,
            incoming: { hash: bundle.hash, fileCount: bundle.files.length, files: bundle.fileNames, manifest: bundle.manifest },
            checks: {
                remoteRepository: safeRepositoryUrl(entry.repository),
                trustedSource: true,
                frontmatterValidated: true,
                pathsValidated: true,
                symlinksRejected: true,
                thirdPartyCodeExecuted: false,
            },
        };
    }
    async function install(id, cwd) {
        const entry = findEntry(id);
        if (entry === null)
            throw new ApiError(404, '市场条目不存在', 'MARKET_NOT_FOUND');
        const plan = await preview(id, cwd);
        if (!plan.canInstall)
            throw new ApiError(409, plan.message, 'MARKET_CONFLICT');
        const projectRoot = plan.projectRoot;
        const target = await targetFor(projectRoot, entry.name);
        const state = await readProjectConfig(projectRoot, options);
        const existing = await inspectExisting(target);
        const bundle = await loadBundle(entry);
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
                if (!path.startsWith(`${stagingDir}${sep}`))
                    throw new ApiError(400, '远程 Skill 路径越界', 'MARKET_PATH_UNSAFE');
                await mkdir(dirname(path), { recursive: true });
                await writeFile(path, file.data);
            }
            if (existing !== null) {
                if (existing.format !== 'dir')
                    throw new ApiError(409, '目标不是目录型 Skill，拒绝覆盖', 'MARKET_CONFLICT');
                await rename(target.dirPath, backupDir);
                movedBackup = true;
            }
            await mkdir(dirname(target.dirPath), { recursive: true });
            await rename(stagingDir, target.dirPath);
            const nextSources = { ...(state.config.sources || {}) };
            nextSources[entry.name] = {
                ...(nextSources[entry.name] || {}),
                marketManaged: true,
                marketId: entry.id,
                marketRepository: entry.repository,
                marketPath: entry.path,
                marketRef: entry.ref,
                marketRevision: (await metadata(entry, false)).revision || null,
                marketHash: bundle.hash,
                source: 'market',
            };
            state.config.sources = nextSources;
            await writeProjectConfig(projectRoot, state.config, options);
            await rm(backupDir, { recursive: true, force: true }).catch(() => { });
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
        }
        catch (error) {
            await rm(stagingDir, { recursive: true, force: true }).catch(() => { });
            await rm(target.dirPath, { recursive: true, force: true }).catch(() => { });
            if (movedBackup)
                await rename(backupDir, target.dirPath).catch((restoreError) => logger?.warn?.(`skill-manager: 市场 Skill 回滚失败：${errorMessage(restoreError)}`));
            throw error;
        }
        finally {
            await rm(stagingDir, { recursive: true, force: true }).catch(() => { });
            await rm(backupDir, { recursive: true, force: true }).catch(() => { });
            await rm(swapRoot, { recursive: false, force: true }).catch(() => { });
        }
    }
    return {
        entries,
        list,
        detail,
        preview,
        install,
        findEntry,
    };
}
//# sourceMappingURL=marketplace.js.map