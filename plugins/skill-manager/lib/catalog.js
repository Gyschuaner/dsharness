/**
 * dsh-skill-manager — V1 catalog & reconcile engine (DSH-008).
 *
 * Scans every supported skill root, merges same-name skills into single
 * identities (one row, all real sources listed), resolves the default
 * source by product priority (project > DSH user > other global >
 * bundled), and materializes the project config's derived artifacts:
 *
 *   enabled / disabled (model auto-candidate) is the project config's
 *   `enabled` set — the single source of truth. File state is rebuildable:
 *     1. project-native skill   → its own frontmatter flag (in place);
 *     2. managed source copy    → the copy's own frontmatter flag;
 *     3. everything else        → a marker switch stub in
 *        <projectRoot>/.dsh/skills (rank 100, disable-model-invocation).
 *
 * Safety (handoff §10): only marker-verified derived artifacts are ever
 * created or removed; ordinary skill files and user-modified copies are
 * never deleted or overwritten; a managed copy is recognized by its config
 * registration plus an exact content hash (`copyHash`), never by path or
 * name alone. `user-invocable` is never touched, so `/skill-name` manual
 * invocation keeps working for disabled skills. Hot reload: writes are
 * observed by DSH's skill watcher, so changes apply on the next model turn
 * without restarting DSH.
 */
import { mkdir, readFile, readdir, realpath, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { ApiError, NAME_RE, createLedger, findProjectRoot, atomicWriteFile, readProjectConfig, writeProjectConfig, readGlobalConfig, emptyProjectConfig, hashSkillSource, sha256Hex, } from './state.js';
function errorCode(error) {
    return error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
}
/** Current copy marker, with the V1 design's legacy field as a safe fallback. */
function managedCopyMarker(entry) {
    return entry?.copyHash ?? entry?.contentHash;
}
/** Precedence ranks mirroring dsh-skill-filesystem (lower wins). */
export const RANKS = { 'project-dsh': 100, 'project-agents': 200, global: 300, 'user-dsh': 400, 'user-agents': 500, bundled: 600 };
/** Description prefix marking switch stubs we generated; never delete files without it. */
export const SHADOW_DESC_PREFIX = '[skill-manager] 本项目禁用开关';
/** Product source-selection priority (handoff §4.3), per scope. */
/** Copy size cap (bytes), same as the legacy copy mechanism. */
const MAX_COPY_BYTES = 50 * 1024 * 1024;
const TRANSIENT_RENAME_CODES = new Set(['EACCES', 'EBUSY', 'EPERM']);
/** DSH's actual skill-resolution order (review P1-2): rank ascending, ties
 * broken by root registration order in computeRoots. Modeled separately from
 * the product display/selection order below so an explicit selection is
 * reported against what DSH actually resolves. */
const DSH_RESOLVER_ORDER = ['project-dsh', 'project-agents', 'global-codex', 'global-claude', 'user-dsh', 'user-agents'];
/** Product priority order (handoff \u00a74.3, review P1-2): an explicit, stable
 * table, never derived from scope plus alphabetical sort (that derivation put
 * global-claude ahead of global-codex and the like). */
const PRODUCT_SOURCE_ORDER = ['project-dsh', 'project-agents', 'user-dsh', 'user-agents', 'global-codex', 'global-claude'];
function dshResolverIndex(key) {
    const i = DSH_RESOLVER_ORDER.indexOf(key);
    return i === -1 ? DSH_RESOLVER_ORDER.length : i;
}
function productOrderIndex(key) {
    const i = PRODUCT_SOURCE_ORDER.indexOf(key);
    return i === -1 ? PRODUCT_SOURCE_ORDER.length : i;
}
function optsOf(opts) {
    const o = opts && typeof opts === 'object' ? { ...opts } : {};
    o.home = typeof o.home === 'string' && o.home.length > 0 ? resolve(o.home) : homedir();
    return o;
}
/** Bounded retry for Windows watcher/antivirus rename races. */
async function renameWithRetry(from, to) {
    let lastError;
    for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
            await rename(from, to);
            return;
        }
        catch (error) {
            lastError = error;
            const code = errorCode(error);
            if (code === undefined || !TRANSIENT_RENAME_CODES.has(code) || attempt === 5)
                throw error;
            await new Promise((resolveDelay) => setTimeout(resolveDelay, 50 * (attempt + 1)));
        }
    }
    throw lastError;
}
/**
 * Validate and parse one skill file's raw content.
 * @param raw - full file text (frontmatter + body).
 * @returns { name, description, whenToUse, disableModelInvocation, body }
 * @throws ApiError(400) with a user-facing reason.
 */
export function parseSkill(raw) {
    if (typeof raw !== 'string' || raw.length === 0)
        throw new ApiError(400, '内容为空');
    const lines = raw.split(/\r?\n/);
    if (lines[0] !== '---')
        throw new ApiError(400, '缺少 frontmatter：文件第一行必须是 ---');
    let end = -1;
    for (let i = 1; i < lines.length; i += 1) {
        if (lines[i] === '---' || lines[i] === '...') {
            end = i;
            break;
        }
    }
    if (end < 0)
        throw new ApiError(400, 'frontmatter 未闭合：缺少结束的 --- 行');
    const fm = lines.slice(1, end);
    const data = {};
    for (let i = 0; i < fm.length; i += 1) {
        const m = /^([A-Za-z_][A-Za-z0-9_-]*):(.*)$/.exec(fm[i]);
        if (m === null)
            continue; // indented continuation: belongs to the previous key
        const key = m[1];
        let value = m[2].trim();
        if (value === '' || value === '|' || value === '>' || value === '|-' || value === '|+' || value === '>-') {
            const collected = [];
            let j = i + 1;
            while (j < fm.length && (fm[j].trim() === '' || /^\s/.test(fm[j]))) {
                collected.push(fm[j].trim());
                j += 1;
            }
            i = j - 1;
            if (value === '')
                continue; // nested mapping: not needed for validation
            const nonEmpty = collected.filter((line) => line !== '');
            data[key] = value.startsWith('>') ? nonEmpty.join(' ') : nonEmpty.join('\n');
        }
        else {
            if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))))
                value = value.slice(1, -1);
            data[key] = value;
        }
    }
    const skillName = data.name;
    const description = data.description;
    if (typeof skillName !== 'string' || skillName.length === 0)
        throw new ApiError(400, 'frontmatter 缺少 name');
    if (!NAME_RE.test(skillName))
        throw new ApiError(400, `skill 名 “${skillName}” 不合法：需要 kebab-case（小写字母、数字、连字符）`);
    if (typeof description !== 'string' || description.length === 0)
        throw new ApiError(400, 'frontmatter 缺少 description');
    // DSH's native invocation flag (true/yes/on and false/no/off, case-insensitive).
    let disableModelInvocation;
    const rawFlag = data['disable-model-invocation'];
    if (typeof rawFlag === 'string') {
        const v = rawFlag.trim().toLowerCase();
        if (v === 'true' || v === 'yes' || v === 'on')
            disableModelInvocation = true;
        else if (v === 'false' || v === 'no' || v === 'off')
            disableModelInvocation = false;
    }
    return {
        name: skillName,
        description,
        ...(typeof data.whenToUse === 'string' ? { whenToUse: data.whenToUse } : {}),
        ...(disableModelInvocation === undefined ? {} : { disableModelInvocation }),
        body: lines.slice(end + 1).join('\n'),
    };
}
/**
 * Toggle the `disable-model-invocation` frontmatter flag of one skill file
 * without touching any other byte (EOL style preserved).
 * @returns { content, changed }
 */
export function patchInvocationFlag(raw, setTrue) {
    if (typeof raw !== 'string' || raw.length === 0)
        throw new ApiError(400, '内容为空');
    const eol = raw.includes('\r\n') ? '\r\n' : '\n';
    const lines = raw.split(/\r?\n/);
    if (lines[0] !== '---')
        throw new ApiError(400, '缺少 frontmatter：文件第一行必须是 ---');
    let end = -1;
    for (let i = 1; i < lines.length; i += 1) {
        if (lines[i] === '---' || lines[i] === '...') {
            end = i;
            break;
        }
    }
    if (end < 0)
        throw new ApiError(400, 'frontmatter 未闭合：缺少结束的 --- 行');
    let found = -1;
    for (let i = 1; i < end; i += 1) {
        if (/^disable-model-invocation:/.test(lines[i])) {
            found = i;
            break;
        }
    }
    let changed = false;
    if (setTrue) {
        if (found === -1) {
            lines.splice(end, 0, 'disable-model-invocation: true');
            changed = true;
        }
        else if (!/^(true|yes|on)$/i.test(lines[found].split(':').slice(1).join(':').trim())) {
            lines[found] = 'disable-model-invocation: true';
            changed = true;
        }
    }
    else if (found !== -1) {
        lines.splice(found, 1);
        changed = true;
    }
    const content = changed ? lines.join(eol) : raw;
    if (changed)
        parseSkill(content); // re-validate before returning
    return { content, changed };
}
/** Whether a file is a switch stub we generated (marker in its description). */
export async function isShadowFile(path) {
    try {
        const parsed = parseSkill(await readFile(path, 'utf8'));
        return typeof parsed.description === 'string' && parsed.description.startsWith(SHADOW_DESC_PREFIX);
    }
    catch {
        return false;
    }
}
/** Body of a generated marker switch stub. */
export function markerContent(name, projectRoot) {
    return [
        '---',
        `name: ${name}`,
        `description: "${SHADOW_DESC_PREFIX}：在本项目中禁用 ${name}（由 Skills 技能管理生成，请勿手改）"`,
        'disable-model-invocation: true',
        '---',
        '',
        `由 dsh-skill-manager 生成的项目级禁用开关：使 ${name} 在本项目的会话中不再被模型自动调用。`,
        `仅对本项目（${projectRoot}）生效；在技能管理里把对应 skill 的开关拨回，或删除本文件即可恢复。`,
    ].join('\n');
}
/**
 * Reserved flat-filename prefix for generated marker switch stubs
 * (review P2-4): DSH resolves flat skills by their frontmatter name, so the
 * file name itself is free to reserve. This distinguishes the rebuildable,
 * gitignored generated stub from a hand-written project skill that a
 * `.dsh/skills/<name>.md` alone cannot, and is the precise ignore pattern
 * in .gitignore. The frontmatter name stays the shadowed skill name.
 */
export const SHADOW_STUB_PREFIX = '__smgr-shadow-';
/** Marker switch stub location (reserved prefix, review P2-4). */
export function shadowStubPath(projectRoot, name) {
    return join(projectRoot, '.dsh', 'skills', `${SHADOW_STUB_PREFIX}${name}.md`);
}
/** Legacy stub location, migrated away by reconcileProject when marker-verified. */
function legacyStubPath(projectRoot, name) {
    return join(projectRoot, '.dsh', 'skills', `${name}.md`);
}
/** Atomic text rewrite with an optional transaction undo. */
async function writeTextWithLedger(path, content, ledger) {
    let previous = null;
    let existed = false;
    try {
        previous = await readFile(path, 'utf8');
        existed = true;
    }
    catch (error) {
        if (errorCode(error) !== 'ENOENT' && errorCode(error) !== 'ENOTDIR')
            throw error;
    }
    await atomicWriteFile(path, content);
    if (ledger !== undefined) {
        ledger.record(existed
            ? () => atomicWriteFile(path, previous)
            : () => rm(path, { force: true }));
    }
}
/**
 * Move a file or directory to an invisible sibling backup. The backup is
 * deleted on commit and renamed back on rollback, so Windows never needs to
 * rename over a non-empty destination.
 */
async function removePathWithLedger(path, ledger) {
    const st = await stat(path).catch((error) => {
        if (errorCode(error) === 'ENOENT' || errorCode(error) === 'ENOTDIR')
            return undefined;
        throw error;
    });
    if (st === undefined)
        return false;
    if (ledger === undefined) {
        await rm(path, { recursive: st.isDirectory(), force: true });
        return true;
    }
    const backup = join(dirname(path), `.${relative(dirname(path), path)}.bak-${randomUUID()}`);
    await renameWithRetry(path, backup);
    ledger.record(() => renameWithRetry(backup, path), () => rm(backup, { recursive: true, force: true }));
    return true;
}
/** External agent user-level skill roots, listed read-only. */
function globalRoots(o) {
    return [
        { id: 'global-codex', label: '全局 · ~/.codex/skills', dir: join(o.home, '.codex', 'skills') },
        { id: 'global-claude', label: '全局 · ~/.claude/skills', dir: join(o.home, '.claude', 'skills') },
    ];
}
/**
 * Build the managed skill roots for one workspace.
 * @returns { roots, projectRoot }
 */
export async function computeRoots(cwd, opts) {
    const o = optsOf(opts);
    const roots = [];
    let projectRoot = null;
    if (typeof cwd === 'string' && cwd.length > 0) {
        projectRoot = await findProjectRoot(cwd);
        roots.push({ id: 'project-dsh', scope: 'project', label: '项目 · .dsh/skills', dir: join(projectRoot, '.dsh', 'skills'), rank: RANKS['project-dsh'] });
        roots.push({ id: 'project-agents', scope: 'project', label: '项目 · .agents/skills', dir: join(projectRoot, '.agents', 'skills'), rank: RANKS['project-agents'] });
    }
    for (const g of globalRoots(o))
        roots.push({ id: g.id, scope: 'global', label: g.label, dir: g.dir, rank: RANKS.global });
    roots.push({ id: 'user-dsh', scope: 'user', label: '用户 · ~/.dsh/skills', dir: join(o.home, '.dsh', 'skills'), rank: RANKS['user-dsh'] });
    roots.push({ id: 'user-agents', scope: 'user', label: '用户 · ~/.agents/skills', dir: join(o.home, '.agents', 'skills'), rank: RANKS['user-agents'] });
    return { roots, projectRoot };
}
/**
 * Discover skills in one root directory (directory bundles + flat .md).
 * @returns { exists, skills }
 */
export async function discoverInRoot(dir) {
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    }
    catch (error) {
        if (errorCode(error) === 'ENOENT' || errorCode(error) === 'ENOTDIR')
            return { exists: false, skills: [] };
        throw error;
    }
    const skills = [];
    const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of sorted) {
        if (entry.name.startsWith('.') || entry.name === '.system')
            continue;
        let path;
        let format;
        // Windows directory junctions surface as symlink dirents; follow them.
        let isDir = entry.isDirectory();
        if (!isDir && entry.isSymbolicLink()) {
            const st = await stat(join(dir, entry.name)).catch(() => undefined);
            isDir = st !== undefined && st.isDirectory();
        }
        if (isDir) {
            const candidate = join(dir, entry.name, 'SKILL.md');
            const st = await stat(candidate).catch(() => undefined);
            if (st === undefined || !st.isFile())
                continue;
            path = candidate;
            format = 'dir';
        }
        else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
            path = join(dir, entry.name);
            format = 'flat';
        }
        else {
            continue;
        }
        const identity = format === 'flat' ? entry.name.slice(0, entry.name.length - 3) : entry.name;
        const skill = { name: identity, title: identity, path, format, mtimeMs: 0, description: '', readOnly: false };
        try {
            const raw = await readFile(path, 'utf8');
            const parsed = parseSkill(raw);
            // DSH resolves a skill by its frontmatter name (skill-filesystem),
            // not the file or directory name; the reserved stub filename
            // (SHADOW_STUB_PREFIX) resolves the same, and renamed project
            // bundles match the runtime identity (review P2-4).
            skill.name = parsed.name;
            skill.title = parsed.name;
            skill.description = parsed.description;
            if (parsed.whenToUse !== undefined)
                skill.whenToUse = parsed.whenToUse;
            skill.modelInvocable = parsed.disableModelInvocation !== true;
            skill.isShadow = parsed.description.startsWith(SHADOW_DESC_PREFIX);
            const st = await stat(path);
            skill.mtimeMs = st.mtimeMs;
        }
        catch (error) {
            skill.broken = error instanceof Error ? error.message : '读取失败';
        }
        skills.push(skill);
    }
    return { exists: true, skills };
}
/**
 * Discover read-only skills bundled in every known agent preset.
 * @returns [{ presetId, label, skills }]
 */
export async function discoverBundled(agentPresets, _opts) {
    if (agentPresets === undefined || agentPresets === null) {
        // Bundled roots can also be declared per preset directory; without the
        // service there is no preset list to scan.
        return [];
    }
    let presets;
    try {
        presets = await agentPresets.list();
    }
    catch {
        return [];
    }
    const groups = [];
    for (const preset of presets) {
        if (preset === null || typeof preset !== 'object' || !('path' in preset) || !('id' in preset) || typeof preset.path !== 'string' || typeof preset.id !== 'string')
            continue;
        const validPreset = preset;
        const skillsDir = join(dirname(validPreset.path), 'skills');
        const result = await discoverInRoot(skillsDir).catch(() => ({ exists: false, skills: [] }));
        if (!result.exists || result.skills.length === 0)
            continue;
        groups.push({
            presetId: validPreset.id,
            label: `${validPreset.id}（内置）`,
            skills: result.skills.map((skill) => ({ ...skill, readOnly: true })),
        });
    }
    return groups;
}
/** Recursively list the regular files under one skill directory (safe walk). */
export async function walkSkillFiles(dir) {
    const rootReal = await realpath(dir).catch(() => resolve(dir));
    const out = [];
    const seen = new Set();
    async function rec(d, depth) {
        if (depth > 8)
            return;
        let entries;
        try {
            entries = await readdir(d, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
            if (entry.name.startsWith('.') || /\.tmp-[^/]+$/.test(entry.name))
                continue;
            const p = join(d, entry.name);
            let real;
            try {
                real = await realpath(p);
            }
            catch {
                continue; // broken symlink etc.
            }
            if (seen.has(real))
                continue;
            seen.add(real);
            if (real !== rootReal && !real.startsWith(rootReal + sep))
                continue; // symlink escape
            if (entry.isDirectory())
                await rec(p, depth + 1);
            else if (entry.isFile())
                out.push(p);
        }
    }
    await rec(dir, 0);
    return out;
}
/** Product-priority ordering of source keys: project > user > global > bundled. */
function sourceRank(key) {
    if (typeof key !== 'string')
        return RANKS.bundled;
    if (key.startsWith('bundled:'))
        return RANKS.bundled;
    return key in RANKS ? RANKS[key] : RANKS.bundled;
}
/** Stable product-priority sort for source keys. */
function sourceKeysByPriority(keys) {
    return [...keys].sort((a, b) => productOrderIndex(a) - productOrderIndex(b) || sourceRank(a) - sourceRank(b) || a.localeCompare(b));
}
/**
 * Reproduces the pre-raw-byte digest exactly (review P1-3): sha256 over the
 * utf8 text, no file length, `rel=<utf8hex>` lines, so a registration written
 * before that upgrade verifies as unmodified instead of reading as modified.
 */
export async function hashSkillSourceLegacy(path, format) {
    if (format === 'flat') {
        const raw = await readFile(path, 'utf8');
        return `sha256:${sha256Hex(raw)}`;
    }
    const root = dirname(path);
    const rootReal = await realpath(root).catch(() => resolve(root));
    const lines = [];
    const seen = new Set();
    async function rec(d, depth) {
        if (depth > 8)
            return;
        const entries = await readdir(d, { withFileTypes: true }).catch(() => []);
        for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
            if (entry.name.startsWith('.') || /^\.tmp-\d+-\d+$/.test(entry.name))
                continue;
            const p = join(d, entry.name);
            const real = await realpath(p).catch(() => undefined);
            if (real === undefined || seen.has(real))
                continue;
            seen.add(real);
            if (real !== rootReal && !real.startsWith(rootReal + sep))
                continue;
            if (entry.isDirectory())
                await rec(p, depth + 1);
            else if (entry.isFile()) {
                const data = await readFile(p);
                lines.push(`${relative(root, p).split(sep).join('/')}=${sha256Hex(data.toString('utf8'))}`);
            }
        }
    }
    await rec(root, 0);
    return `sha256:${sha256Hex(lines.join('\n'))}`;
}
/**
 * Whether the stored digest (new raw-byte form or legacy utf8-text form, review
 * P1-3) matches `current`.
 */
export async function hashMatches(stored, path, format, current) {
    if (current === stored)
        return true;
    const isLegacy = typeof stored === 'string' && /^sha256:[a-f0-9]{64}$/.test(stored);
    if (!isLegacy)
        return false;
    const legacy = await hashSkillSourceLegacy(path, format).catch(() => null);
    return legacy === stored;
}
/** The standard location of a generated copy for one skill name. */
function copyLocation(projectRoot, name, format) {
    return format === 'dir' ? join(projectRoot, '.dsh', 'skills', name, 'SKILL.md') : join(projectRoot, '.dsh', 'skills', `${name}.md`);
}
/**
 * Copy one source skill into <projectRoot>/.dsh/skills (flat file or full
 * directory bundle), with the invocation flag set to the project's desired
 * state. Bounded at 50MB. Returns the destination SKILL.md path.
 */
export async function copySkillToProject(projectRoot, name, sourcePlan, flagSetTrue, opts, ledger) {
    const o = optsOf(opts);
    const dest = copyLocation(projectRoot, name, sourcePlan.format);
    if (sourcePlan.format === 'flat') {
        const sourceData = await readFile(sourcePlan.path);
        if (sourceData.length > MAX_COPY_BYTES)
            throw new ApiError(413, 'skill 副本超过 50MB 上限');
        const raw = sourceData.toString('utf8');
        const { content } = patchInvocationFlag(raw, flagSetTrue);
        if (o.faults && typeof o.faults.beforeCopySwap === 'function') {
            await o.faults.beforeCopySwap({ name, source: sourcePlan.path, destination: dest, format: 'flat' });
        }
        // The flat destination is a single atomic rename; on failure the prior
        // content (real project skill is guarded by the caller, 409) survives.
        const existed = (await stat(dest).catch(() => undefined)) !== undefined;
        let backupContent = null;
        if (existed) {
            backupContent = await readFile(dest, 'utf8').catch(() => null);
            if (ledger !== undefined && backupContent === null) {
                throw new ApiError(409, `无法读取既有 ${dest} 内容，中止以避免覆盖：请检查权限`);
            }
        }
        await atomicWriteFile(dest, content);
        // On success register the undo for a failed later config commit: restore
        // the replaced file and keep the ledger consistent.
        if (ledger !== undefined) {
            ledger.record(backupContent !== null
                ? () => atomicWriteFile(dest, backupContent)
                : () => rm(dest, { force: true }));
        }
        return dest;
    }
    const srcDir = dirname(sourcePlan.path);
    const destDir = dirname(dest);
    const skillsDir = dirname(destDir);
    const uuid = randomUUID();
    // Stage beside (not inside) the watched skill root. Chokidar can observe a
    // large staging bundle before its swap and hold a Windows handle that makes
    // rename fail with EPERM. The sibling swap root keeps incomplete content out
    // of the provider; publication below makes SKILL.md visible only at the end.
    const swapRoot = join(dirname(skillsDir), '.skill-manager-swap');
    const stagingDir = join(swapRoot, `${name}.${uuid}.staging`);
    const backupDir = join(swapRoot, `${name}.${uuid}.backup`);
    // Pre-check (no file damage): source files readable + total size bounded.
    const sourceHashBefore = await hashSkillSource(sourcePlan.path, 'dir').catch((error) => {
        throw new ApiError(404, `来源目录无法完整读取：${error instanceof Error ? error.message : String(error)}`);
    });
    if (o.faults && typeof o.faults.afterSourcePrecheck === 'function') {
        await o.faults.afterSourcePrecheck({ name, source: sourcePlan.path, format: 'dir' });
    }
    const files = await walkSkillFiles(srcDir);
    if (files.length === 0 || !files.some((file) => relative(srcDir, file).split(sep).join('/') === 'SKILL.md')) {
        throw new ApiError(404, '来源目录缺少可读取的 SKILL.md');
    }
    const entries = [];
    let totalBytes = 0;
    for (const file of files) {
        const data = await readFile(file).catch((error) => {
            throw new ApiError(404, `来源文件缺失：${relative(srcDir, file).split(sep).join('/') || file}：${error instanceof Error ? error.message : String(error)}`);
        });
        totalBytes += data.length;
        if (totalBytes > MAX_COPY_BYTES)
            throw new ApiError(413, 'skill 副本超过 50MB 上限');
        entries.push([file, data]);
    }
    // Write the full staging copy in the same project .dsh directory; nothing
    // of the existing destination is touched yet (review P1-4: a failed copy
    // must not delete the old copy before the new one is verified in place).
    await mkdir(stagingDir, { recursive: true });
    try {
        for (const [file, data] of entries) {
            const rel = relative(srcDir, file).split(sep).join('/');
            const target = join(stagingDir, rel);
            await mkdir(dirname(target), { recursive: true });
            const content = rel === 'SKILL.md'
                ? Buffer.from(patchInvocationFlag(data.toString('utf8'), flagSetTrue).content, 'utf8')
                : data;
            await writeFile(target, content);
        }
    }
    catch (error) {
        await rm(stagingDir, { recursive: true, force: true }).catch(() => { });
        await rmdir(swapRoot).catch(() => { });
        throw error;
    }
    // Verify the staged bundle (file set + content) matches what was read; a
    // source that changed mid-copy is rejected before anything is swapped.
    const stagedHash = await hashSkillSource(join(stagingDir, 'SKILL.md'), 'dir');
    const expectedLines = [];
    for (const [file, data] of entries) {
        const rel = relative(srcDir, file).split(sep).join('/');
        const content = rel === 'SKILL.md'
            ? Buffer.from(patchInvocationFlag(data.toString('utf8'), flagSetTrue).content, 'utf8')
            : data;
        expectedLines.push(`${rel}:${content.length}:${sha256Hex(content)}`);
    }
    const expectedManifest = Buffer.from(expectedLines.join('\n'), 'utf8');
    const expectedHash = `sha256:${expectedManifest.length}:${sha256Hex(expectedManifest)}`;
    const sourceHashAfter = await hashSkillSource(sourcePlan.path, 'dir').catch(() => null);
    if (stagedHash !== expectedHash || sourceHashAfter === null || sourceHashAfter !== sourceHashBefore) {
        await rm(stagingDir, { recursive: true, force: true }).catch(() => { });
        await rmdir(swapRoot).catch(() => { });
        throw new ApiError(500, '副本暂存校验失败：来源内容在复制期间发生变化');
    }
    if (o.faults && typeof o.faults.beforeCopySwap === 'function') {
        try {
            await o.faults.beforeCopySwap({ name, source: sourcePlan.path, destination: dest, format: 'dir' });
        }
        catch (error) {
            await rm(stagingDir, { recursive: true, force: true }).catch(() => { });
            await rmdir(swapRoot).catch(() => { });
            throw error;
        }
    }
    // Publish the verified snapshot with SKILL.md written last. Windows can keep
    // a directory tree busy long enough that renaming a large staging directory
    // into the watched skill root repeatedly fails with EPERM. Writing ancillary
    // files first keeps the destination undiscoverable until the final manifest
    // appears, while the ledger still removes or restores the whole directory if
    // a later config write fails.
    const hadDest = (await stat(destDir).catch(() => undefined)) !== undefined;
    if (hadDest)
        await renameWithRetry(destDir, backupDir);
    try {
        await mkdir(skillsDir, { recursive: true });
        await mkdir(destDir);
        let skillContent;
        for (const [file, data] of entries) {
            const rel = relative(srcDir, file).split(sep).join('/');
            const content = rel === 'SKILL.md'
                ? Buffer.from(patchInvocationFlag(data.toString('utf8'), flagSetTrue).content, 'utf8')
                : data;
            if (rel === 'SKILL.md') {
                skillContent = content;
                continue;
            }
            const target = join(destDir, rel);
            await mkdir(dirname(target), { recursive: true });
            await writeFile(target, content);
        }
        if (skillContent === undefined)
            throw new ApiError(404, '来源目录缺少可读取的 SKILL.md');
        await writeFile(join(destDir, 'SKILL.md'), skillContent);
        const publishedHash = await hashSkillSource(join(destDir, 'SKILL.md'), 'dir');
        if (publishedHash !== expectedHash)
            throw new ApiError(500, '副本发布校验失败：目标内容与暂存快照不一致');
    }
    catch (error) {
        await rm(destDir, { recursive: true, force: true }).catch(() => { });
        let restoreError;
        if (hadDest) {
            try {
                await renameWithRetry(backupDir, destDir);
            }
            catch (caught) {
                restoreError = caught;
            }
        }
        await rm(stagingDir, { recursive: true, force: true }).catch(() => { });
        await rmdir(swapRoot).catch(() => { });
        if (restoreError !== undefined) {
            throw new ApiError(500, `副本发布失败且旧副本恢复失败：${restoreError instanceof Error ? restoreError.message : String(restoreError)}`);
        }
        throw error;
    }
    await rm(stagingDir, { recursive: true, force: true });
    await rmdir(swapRoot).catch(() => { });
    if (hadDest) {
        // The backup stays until the mutation commits (ledger cleanup) or a failed
        // config commit rolls the swap back to the old copy (ledger undo). The
        // sibling swap root stays outside the watched skill root. Without a ledger
        // (reconcile) the swap is already committed, so the backup is cleaned now.
        // undo/cleanup surface their failures: a restore or cleanup that fails is
        // reported, not swallowed (review P1-4/P2-3).
        const cleanup = async () => {
            await rm(backupDir, { recursive: true, force: true });
            await rmdir(swapRoot).catch(() => { });
        };
        const undo = async () => {
            await rm(destDir, { recursive: true, force: true });
            await renameWithRetry(backupDir, destDir);
            await rmdir(swapRoot).catch(() => { });
        };
        if (ledger !== undefined)
            ledger.record(undo, cleanup);
        else
            await cleanup();
    }
    else if (ledger !== undefined) {
        ledger.record(() => rm(destDir, { recursive: true, force: true }));
    }
    return dest;
}
/**
 * Build the merged identity catalog for one project context.
 * @param cwd - resolved workspace cwd, or undefined (no project roots).
 * @param opts - { agentPresets, home }.
 * @param config - optional project config; registers generated copies so
 *   project-scope sources are flagged `generated` during the scan (the
 *   reconcile pass classifies mechanisms from this flag).
 * @returns { identities: Map<name, identity>, projectRoot, roots, bundled }
 */
export async function buildIdentityCatalog(cwd, opts, config) {
    const o = optsOf(opts);
    const { roots, projectRoot } = await computeRoots(cwd, o);
    const generatedNames = new Set(Object.entries((config && config.sources) || {})
        .filter(([, e]) => e !== null && typeof e === 'object' && e.generated === true)
        .map(([n]) => n));
    const byName = new Map();
    const pushSource = (name, key, label, scope, rank, skill, extra) => {
        // Marker switch stubs are derived artifacts, not skill sources:
        // they must not create identities (orphan cleanup relies on this).
        if (skill.isShadow === true)
            return;
        let identity = byName.get(name);
        if (identity === undefined) {
            identity = { name, sources: [] };
            byName.set(name, identity);
        }
        const source = Object.assign({
            key, label, scope, rank,
            format: skill.format,
            path: skill.path,
            description: skill.description,
            whenToUse: skill.whenToUse,
            modelInvocable: skill.modelInvocable === true,
            mtimeMs: skill.mtimeMs,
            broken: skill.broken,
            files: [],
            generated: false,
            modified: false,
            stale: false,
            shadow: false,
        }, extra);
        // A root may hold both <name>.md and <name>/SKILL.md; keep one source
        // per (name, root): the directory bundle is the richer form.
        const existing = identity.sources.find((s) => s.key === key);
        if (existing !== undefined) {
            if (skill.format === 'dir') {
                identity.sources.splice(identity.sources.indexOf(existing), 1, source);
            }
            return;
        }
        identity.sources.push(source);
    };
    for (const root of roots) {
        const result = await discoverInRoot(root.dir);
        for (const skill of result.skills) {
            pushSource(skill.name, root.id, root.label, root.scope, root.rank, skill, root.scope === 'global' ? { readOnly: true } : {});
        }
    }
    const bundled = await discoverBundled(o.agentPresets, o);
    for (const group of bundled) {
        for (const skill of group.skills) {
            pushSource(skill.name, `bundled:${group.presetId}`, group.label, 'bundled', RANKS.bundled, skill, { readOnly: true });
        }
    }
    // Ancillary file lists (dir bundles only; flat skills have none), and
    // generated-copy flags (managed copies always live in project-dsh).
    for (const identity of byName.values()) {
        for (const source of identity.sources) {
            if (source.key === 'project-dsh' && !source.shadow && generatedNames.has(identity.name))
                source.generated = true;
            if (source.broken)
                continue;
            if (source.format === 'dir') {
                const files = await walkSkillFiles(dirname(source.path)).catch(() => []);
                source.files = files
                    .map((f) => relative(dirname(source.path), f).split(sep).join('/'))
                    .filter((rel) => rel !== 'SKILL.md');
            }
        }
        identity.sources = sourceKeysByPriority(identity.sources.map((s) => s.key))
            .map((k) => identity.sources.find((s) => s.key === k))
            .filter((source) => source !== undefined);
    }
    return { identities: byName, projectRoot, roots, bundled };
}
/**
 * Classify one identity's mechanism and compute its V1 fields.
 * @returns { mechanism, defaultSourceKey, effectiveSource, specialized, winner }
 *   mechanism: 'self' (project-native incl. modified copies), 'copy' (managed
 *   unmodified generated copy), 'original' (user/global/bundled default
 *   resolution — disabled via stub).
 */
function classifyIdentity(identity, projectConfig, _projectRoot) {
    const sources = identity.sources;
    const nonShadow = sources.filter((s) => !s.shadow);
    const healthy = nonShadow.filter((s) => !s.broken);
    // The product default source is the first REAL (non-derived) source in
    // product-priority order; a managed copy never is the "default".
    const realHealthy = healthy.filter((s) => !s.generated);
    const defaultSourceKey = realHealthy.length > 0 ? realHealthy[0].key
        : (healthy.length > 0 ? healthy[0].key : (nonShadow.length > 0 ? nonShadow[0].key : null));
    // DSH effective winner: lowest-rank healthy non-shadow source, ties broken by
    // root registration order (review P1-2: model DSH's real winner order,
    // not the product display order and not alphabetical sort).
    let winner = null;
    for (const s of healthy) {
        if (winner === null || s.rank < winner.rank || (s.rank === winner.rank && dshResolverIndex(s.key) < dshResolverIndex(winner.key)))
            winner = s;
    }
    const explicit = projectConfig.sources[identity.name];
    let sourceKey = null;
    if (explicit && typeof explicit.source === 'string' && sources.some((s) => s.key === explicit.source)) {
        sourceKey = explicit.source;
    }
    // What the project actually uses: a project-dsh copy (managed or
    // user-modified) always wins rank 100; then a real project skill; then
    // DSH's actual resolution winner (never the recorded selection intent, so
    // a pure selection that DSH does not actually resolve to is reported as the
    // winner it really is, review P1-2).
    const copySource = healthy.find((s) => s.scope === 'project' && s.generated === true);
    const projectSkill = healthy.find((s) => s.scope === 'project' && !s.generated);
    const explicitBroken = sourceKey !== null && (sources.find((s) => s.key === sourceKey)?.broken !== undefined);
    const effectiveKey = copySource
        ? copySource.key
        : projectSkill
            ? projectSkill.key
            : (explicitBroken ? defaultSourceKey : (winner ? winner.key : defaultSourceKey));
    const effectiveSource = sources.find((s) => s.key === effectiveKey) || healthy[0] || null;
    // Mechanism classification. A user-modified generated copy has become a
    // project file: its own flag is the mechanism ('self'), never a stub.
    const mechanism = copySource !== undefined
        ? (copySource.modified ? 'self' : 'copy')
        : projectSkill !== undefined
            ? 'self'
            : 'original';
    const specialized = effectiveSource !== null
        && effectiveSource.scope === 'project'
        && !effectiveSource.shadow
        && !(effectiveSource.generated && !effectiveSource.modified);
    return { mechanism, defaultSourceKey, sourceKey, effectiveSource, specialized, winner };
}
/**
 * Reconcile one project: materialize/clean derived artifacts so the on-disk
 * state matches the project config. Idempotent; per-file failures are
 * collected, never fatal.
 *
 * @returns report { created: [path], removed: [path], rewritten: [path],
 *   conflicts: [{name, message}], failed: [{name, error}] }
 */
export async function reconcileProject(projectRoot, projectConfig, identities, opts, logger, ledger, reconcileOptions) {
    const report = { created: [], removed: [], rewritten: [], conflicts: [], failed: [] };
    const sweepOrphans = !reconcileOptions || reconcileOptions.sweepOrphans !== false;
    const fail = (name, error) => {
        report.failed.push({ name, error: error instanceof Error ? error.message : String(error) });
    };
    const stubDir = join(projectRoot, '.dsh', 'skills');
    // Reserved-prefix stub (P2-4) plus the legacy <name>.md location: the
    // legacy stub migrates to the reserved name on reconcile.
    const stubPath = (name) => shadowStubPath(projectRoot, name);
    const legacyStub = (name) => legacyStubPath(projectRoot, name);
    const isStub = async (p) => {
        try {
            const st = await stat(p);
            return st.isFile() && (await isShadowFile(p));
        }
        catch {
            return false;
        }
    };
    const enabledSet = new Set(projectConfig.enabled);
    for (const identity of identities.values()) {
        const name = identity.name;
        try {
            const wantEnabled = enabledSet.has(name);
            const removeStub = async () => {
                for (const p of [stubPath(name), legacyStub(name)]) {
                    if (await isStub(p)) {
                        await removePathWithLedger(p, ledger);
                        report.removed.push(p);
                    }
                }
            };
            // A user-modified managed copy has become a project file: its own
            // flag is the mechanism, and the unmodified marker (copyHash) is
            // NEVER refreshed (refreshing it would hide the modification).
            const genEntry = projectConfig.sources[name];
            const genCopySrc = identity.sources.find((s) => s.scope === 'project' && s.generated === true && !s.shadow && !s.broken);
            let copyModified = false;
            if (genEntry && genEntry.generated === true && genCopySrc !== undefined) {
                const marker = managedCopyMarker(genEntry);
                if (marker === undefined) {
                    genCopySrc.modified = true;
                    report.conflicts.push({ name, message: '项目副本缺少可验证内容哈希，已按项目文件保留；请手动确认后处理' });
                    continue;
                }
                const h = await hashSkillSource(genCopySrc.path, genCopySrc.format).catch(() => null);
                if (h === null) {
                    genCopySrc.modified = true;
                    report.conflicts.push({ name, message: '项目副本内容暂时无法校验，已保留且未做任何自动修改' });
                    continue;
                }
                // hashMatches also verifies legacy utf8-text registrations written
                // before the raw-byte upgrade (review P1-3).
                copyModified = !(await hashMatches(marker, genCopySrc.path, genCopySrc.format, h));
                genCopySrc.modified = copyModified;
            }
            const { mechanism, defaultSourceKey, winner } = classifyIdentity(identity, projectConfig, projectRoot);
            if (copyModified && genCopySrc !== undefined) {
                await removeStub();
                const raw = await readFile(genCopySrc.path, 'utf8');
                const { content, changed } = patchInvocationFlag(raw, !wantEnabled);
                if (changed) {
                    await writeTextWithLedger(genCopySrc.path, content, ledger);
                    report.rewritten.push(genCopySrc.path);
                }
                continue;
            }
            if (mechanism === 'self') {
                // A project-native skill (or a user-modified copy): its own
                // frontmatter flag is the mechanism; any stub is redundant.
                const target = identity.sources.find((s) => s.scope === 'project' && !s.shadow && !s.broken && !s.generated)
                    || identity.sources.find((s) => s.scope === 'project' && !s.shadow && !s.broken && s.generated && s.modified);
                await removeStub();
                if (target === undefined)
                    continue;
                const raw = await readFile(target.path, 'utf8');
                const { content, changed } = patchInvocationFlag(raw, !wantEnabled);
                if (changed) {
                    await writeTextWithLedger(target.path, content, ledger);
                    report.rewritten.push(target.path);
                }
                continue;
            }
            if (mechanism === 'copy') {
                // Managed generated copy: keep its flag in sync with the project.
                const copySource = identity.sources.find((s) => s.scope === 'project' && s.generated && !s.modified && !s.broken);
                if (copySource !== undefined) {
                    await removeStub();
                    const raw = await readFile(copySource.path, 'utf8');
                    const { content, changed } = patchInvocationFlag(raw, !wantEnabled);
                    if (changed) {
                        await writeTextWithLedger(copySource.path, content, ledger);
                        // Refresh the managed-copy content marker.
                        const entry = projectConfig.sources[name];
                        if (entry && entry.generated === true) {
                            entry.copyHash = await hashSkillSource(copySource.path, copySource.format);
                        }
                        report.rewritten.push(copySource.path);
                    }
                    continue;
                }
                // Recorded copy vanished or drifted to user-modified: the
                // classification above already picked 'self' for the latter;
                // fall through to the original mechanism for the former.
            }
            // mechanism === 'original' (or degraded): the default-resolution
            // winner is a user/global/bundled source.
            // An enabled identity must also be model-invocable in the project.
            // Removing a project shadow is insufficient when the desired source
            // already carries disable-model-invocation (for example a user skill
            // disabled by the legacy global policy). Bundled sources are likewise
            // preset-local: a source discovered from another preset does not exist
            // in this session's filesystem provider. Materialize either case as a
            // rank-100 managed project copy with the invocation flag removed.
            const configuredSource = projectConfig.sources[name];
            const configuredSourceKey = configuredSource && typeof configuredSource.source === 'string'
                ? configuredSource.source
                : null;
            const desiredSourceKey = configuredSourceKey ?? defaultSourceKey;
            const desiredSource = identity.sources.find((s) => s.key === desiredSourceKey && !s.broken && !s.shadow && !s.generated);
            const needsInvocableCopy = wantEnabled && desiredSource !== undefined
                && (desiredSource.modelInvocable !== true || desiredSource.scope === 'bundled');
            if (needsInvocableCopy) {
                await ensureManagedCopy(projectRoot, projectConfig, identity, desiredSource.key, false, opts, report, configuredSourceKey !== null, ledger);
                await removeMarkerStub(projectRoot, name, report, ledger);
                continue;
            }
            // The product default source (no explicit selection) can lose DSH
            // rank resolution — e.g. a skill present in both a user root and
            // an external global root. Materialize the default source as a
            // managed copy so the project actually uses it (handoff §4.3).
            if (projectConfig.sources[name] === undefined) {
                const defSource = identity.sources.find((s) => s.key === defaultSourceKey && !s.broken && !s.shadow && !s.generated);
                if (defSource !== undefined) {
                    // DSH's actual winner among all real (non-shadow, non-broken,
                    // non-generated) sources — including the product default itself —
                    // rank ascending, same-rank ties by the DSH resolver order
                    // (review P1-2). A managed copy of the product default is
                    // materialized exactly when that winner is a different source,
                    // i.e. DSH would otherwise resolve past the default.
                    let dshWinner = null;
                    for (const s of identity.sources) {
                        if (s.shadow || s.broken || s.generated)
                            continue;
                        if (dshWinner === null || s.rank < dshWinner.rank || (s.rank === dshWinner.rank && dshResolverIndex(s.key) < dshResolverIndex(dshWinner.key)))
                            dshWinner = s;
                    }
                    if (dshWinner !== null && dshWinner.key !== defSource.key) {
                        // Default materialization: NOT an explicit selection,
                        // so register the copy without a `source` field.
                        await ensureManagedCopy(projectRoot, projectConfig, identity, defSource.key, !wantEnabled, opts, report, false, ledger);
                        await removeMarkerStub(projectRoot, name, report, ledger);
                        continue;
                    }
                }
            }
            const winnerHealthy = winner !== null && !winner.broken;
            const alreadyOff = winnerHealthy && winner.modelInvocable === false;
            if (wantEnabled) {
                // Enabled: make sure no stub shadows the original.
                await removeStub();
            }
            else if (!alreadyOff) {
                // Disabled and the original is invocable: materialize the stub.
                // (A policy-flagged user original already excludes the skill —
                // no redundant stub, matching the legacy enforcement cleanup.)
                const existing = await stat(stubPath(name)).catch(() => undefined);
                if (existing === undefined || !existing.isFile()) {
                    await writeTextWithLedger(stubPath(name), markerContent(name, projectRoot), ledger);
                    report.created.push(stubPath(name));
                }
                else if (!(await isShadowFile(stubPath(name)))) {
                    // Same-name file we did not generate: never clobber.
                    report.conflicts.push({ name, message: `本项目已有同名文件 ${stubPath(name)}，未生成禁用开关` });
                }
            }
        }
        catch (error) {
            fail(name, error);
        }
    }
    // Orphaned stubs: marker-verified switch files whose skill no longer
    // exists anywhere.
    if (sweepOrphans)
        try {
            const entries = await readdir(stubDir, { withFileTypes: true }).catch(() => []);
            for (const entry of entries) {
                if (!entry.isFile() || entry.name.startsWith('.') || !entry.name.toLowerCase().endsWith('.md'))
                    continue;
                const p = join(stubDir, entry.name);
                // never touch foreign files: marker-verified only.
                if (!(await isShadowFile(p)))
                    continue;
                // the stub's skill name is the frontmatter name (runtime
                // resolution), its file name is the reserved stub prefix (P2-4) or
                // legacy; fall back to the file name for legacy stubs.
                const frontName = await readFile(p, 'utf8').then((raw) => (parseSkill(raw).name ?? undefined)).catch(() => undefined);
                const name = frontName ?? entry.name.slice(0, entry.name.length - 3);
                if (!NAME_RE.test(name))
                    continue;
                if (!identities.has(name)) {
                    try {
                        await removePathWithLedger(p, ledger);
                        report.removed.push(p);
                    }
                    catch (error) {
                        fail(name, error);
                    }
                }
            }
        }
        catch (error) {
            fail('*', error);
        }
    // Orphaned managed copies: config-registered copies whose origin source
    // no longer exists. Only exact-marker copies (copyHash match) are removed;
    // user-modified copies are kept and reported. A source-less registration
    // is a default-materialized copy whose origin is the identity's current
    // product-priority real source.
    if (projectRoot !== null && sweepOrphans) {
        for (const [name, entry] of Object.entries(projectConfig.sources)) {
            if (!entry || entry.generated !== true)
                continue;
            const identity = identities.get(name);
            const defaultKey = identity === undefined ? undefined
                : identity.sources.find((s) => !s.generated && !s.broken)?.key;
            const originKey = typeof entry.source === 'string' ? entry.source : defaultKey;
            const origin = identity === undefined || originKey === undefined
                ? undefined
                : identity.sources.find((s) => s.key === originKey && !s.broken && !s.generated);
            if (origin !== undefined)
                continue; // origin still exists
            let copySrc = identity === undefined ? undefined : identity.sources.find((s) => s.scope === 'project' && s.generated === true && !s.broken);
            if (copySrc === undefined) {
                // The catalog may have deduped a flat copy out (a same-name
                // dir bundle exists): probe the standard locations directly.
                const flatP = join(stubDir, `${name}.md`);
                const dirP = join(stubDir, name, 'SKILL.md');
                const flatSt = await stat(flatP).catch(() => undefined);
                const dirSt = await stat(dirP).catch(() => undefined);
                const flatFile = flatSt !== undefined && flatSt.isFile();
                const dirFile = dirSt !== undefined && dirSt.isFile();
                if (flatFile && dirFile) {
                    report.conflicts.push({ name, message: `来源 ${originKey ?? '默认来源'} 已不存在，且项目内存在同名目录型 skill：请手动处理 ${flatP}` });
                    delete projectConfig.sources[name];
                    continue;
                }
                if (flatFile)
                    copySrc = { path: flatP, format: 'flat' };
                else if (dirFile)
                    copySrc = { path: dirP, format: 'dir' };
            }
            if (copySrc === undefined) {
                // No copy on disk (or undetectable): drop the stale registration.
                delete projectConfig.sources[name];
                continue;
            }
            const copyPath = copySrc.path;
            const copyHash = await hashSkillSource(copyPath, copySrc.format).catch(() => null);
            // legacy utf8-text registrations verify as unmodified (P1-3).
            const marker = managedCopyMarker(entry);
            if (marker !== undefined && copyHash !== null && (await hashMatches(marker, copyPath, copySrc.format, copyHash))) {
                try {
                    await removePathWithLedger(copySrc.format === 'dir' ? dirname(copyPath) : copyPath, ledger);
                    report.removed.push(copyPath);
                }
                catch (error) {
                    fail(name, error);
                    continue;
                }
            }
            else {
                report.conflicts.push({ name, message: `来源 ${originKey ?? '默认来源'} 已不存在，但项目副本已被修改，保留为项目文件，请手动处理` });
            }
            delete projectConfig.sources[name];
        }
    }
    if (report.failed.length > 0 && logger && typeof logger.warn === 'function') {
        logger.warn(`skill-manager: reconcile failed for ${report.failed.length} skill(s): ${report.failed.map((f) => `${f.name} (${f.error})`).join('; ')}`);
    }
    return report;
}
/**
 * Remove the marker-verified flat switch stub for one skill, when a managed
 * copy takes over its role. Foreign same-name files are never touched.
 */
async function removeMarkerStub(projectRoot, name, report, ledger) {
    // Reserved-prefix stub (P2-4) first, then the legacy <name>.md stub;
    // marker-verified only, never a foreign same-name file.
    for (const stub of [shadowStubPath(projectRoot, name), legacyStubPath(projectRoot, name)]) {
        try {
            const st = await stat(stub);
            if (!st.isFile())
                continue;
            if (!(await isShadowFile(stub)))
                continue;
            // keep the content for the mutation ledger (P1-4): undo
            // restores the stub if the config write then fails.
            await removePathWithLedger(stub, ledger);
            report.removed.push(stub);
        }
        catch (error) {
            if (errorCode(error) !== 'ENOENT' && errorCode(error) !== 'ENOTDIR')
                throw error;
        }
    }
}
/**
 * Ensure a managed copy of `sourceKey` exists in the project, applying the
 * safety rules: never clobber a real project skill, never overwrite a
 * user-modified copy, verify content hashes before removing/replacing an
 * existing managed copy.
 * @param recordSource - false for default materialization: the copy is a
 *   derivative of the product default and must NOT be recorded as an
 *   explicit source selection (sourceKey stays null in the UI).
 * @returns { copyCreated, copyPath }
 * @throws ApiError(409/404) on conflicts.
 */
export async function ensureManagedCopy(projectRoot, projectConfig, identity, sourceKey, flagSetTrue, opts, report, recordSource = true, ledger) {
    const name = identity.name;
    const source = identity.sources.find((s) => s.key === sourceKey);
    if (source === undefined)
        throw new ApiError(404, `来源不存在：${sourceKey}`);
    if (source.scope === 'project')
        throw new ApiError(409, '项目自身来源无需选择：项目内的 skill 自动优先生效');
    if (source.broken)
        throw new ApiError(409, `来源 ${sourceKey} 的 skill 文件格式损坏，不能选择`);
    const realProject = identity.sources.find((s) => s.scope === 'project' && !s.generated && !s.broken && !s.shadow);
    if (realProject !== undefined) {
        throw new ApiError(409, `本项目已有同名 skill（${realProject.label}），其优先级更高：请直接在那一行启用/禁用`);
    }
    const modifiedCopy = identity.sources.find((s) => s.scope === 'project' && s.generated && s.modified && !s.broken);
    if (modifiedCopy !== undefined) {
        throw new ApiError(409, `「${name}」的当前来源副本已被修改（成为项目文件），不能自动覆盖；请先手动删除项目副本`);
    }
    const existingCopy = identity.sources.find((s) => s.scope === 'project' && s.generated && !s.broken);
    if (existingCopy !== undefined) {
        const entry = projectConfig.sources[name];
        const copyHash = await hashSkillSource(existingCopy.path, existingCopy.format).catch(() => null);
        // legacy utf8-text registrations verify as unmodified (P1-3).
        const marker = managedCopyMarker(entry);
        const copyVerified = entry !== undefined && marker !== undefined && copyHash !== null && (await hashMatches(marker, existingCopy.path, existingCopy.format, copyHash));
        if (copyVerified) {
            // Same-origin check against the registered origin hash, not the
            // source key: a default-materialized registration has no source
            // field, and the key here is always the project-dsh copy key.
            const sourceHash = await hashSkillSource(source.path, source.format).catch(() => null);
            const sameOrigin = sourceHash !== null && (entry.originHash === sourceHash || (await hashMatches(entry.originHash, source.path, source.format, sourceHash)));
            if (sameOrigin) {
                // Already a managed copy of this origin: keep it (flag is synced
                // by the caller afterwards). Promote a source-less (default)
                // registration when the selection is now explicit.
                if (recordSource === true && entry.source !== sourceKey) {
                    projectConfig.sources[name] = {
                        source: sourceKey,
                        generated: true,
                        ...(entry.originHash === undefined ? {} : { originHash: entry.originHash }),
                        ...(entry.copyHash === undefined ? {} : { copyHash: entry.copyHash }),
                    };
                }
                return { copyCreated: false, copyPath: existingCopy.path };
            }
            // Managed copy of a different origin: replace. No pre-deletion —
            // copySkillToProject stages the new copy and moves the old one to
            // a dot backup, restoring it when the config commit rolls back
            // (review P1-4).
            report.rewritten.push(existingCopy.path);
        }
        else {
            throw new ApiError(409, `「${name}」的来源副本内容与登记不一致（可能已被修改），不能自动覆盖`);
        }
    }
    const dest = await copySkillToProject(projectRoot, name, { path: source.path, format: source.format }, flagSetTrue, opts, ledger);
    const copyHash = await hashSkillSource(dest, source.format);
    const originHash = await hashSkillSource(source.path, source.format);
    projectConfig.sources[name] = recordSource
        ? { source: sourceKey, generated: true, originHash, copyHash }
        : { generated: true, originHash, copyHash };
    report.created.push(dest);
    return { copyCreated: true, copyPath: dest };
}
/**
 * Apply an explicit source selection: record it, and materialize (or
 * refresh) the managed copy when the selected source would not win DSH's
 * rank resolution on its own.
 * @returns { changed, copyCreated, report }
 * @throws ApiError(409) on conflicts (real project skill, modified copy,
 *   broken selection).
 */
export async function applySourceSelection(projectRoot, projectConfig, identity, sourceKey, opts, _logger, ledger) {
    const report = { created: [], removed: [], rewritten: [], conflicts: [], failed: [] };
    const name = identity.name;
    const enabledSet = new Set(projectConfig.enabled);
    const wantEnabled = enabledSet.has(name);
    if (sourceKey === null) {
        // Restore default resolution: remove the managed copy if one exists.
        const entry = projectConfig.sources[name];
        if (entry && entry.generated === true) {
            const copySrc = identity.sources.find((s) => s.scope === 'project' && s.generated);
            if (copySrc !== undefined && copySrc.modified) {
                throw new ApiError(409, `「${name}」的来源副本已被修改（成为项目文件），不能自动删除；请先手动删除项目副本再恢复默认来源`);
            }
            if (copySrc !== undefined && !copySrc.modified) {
                const copyHash = await hashSkillSource(copySrc.path, copySrc.format).catch(() => null);
                // legacy utf8-text registrations verify as unmodified (P1-3).
                const marker = managedCopyMarker(entry);
                if (marker !== undefined && copyHash !== null && (await hashMatches(marker, copySrc.path, copySrc.format, copyHash))) {
                    // move the verified copy to a dot backup (invisible to the
                    // skill scanner); undo restores it when the config commit rolls
                    // back, cleanup removes the backup on commit (review P1-4).
                    const target = copySrc.format === 'dir' ? dirname(copySrc.path) : copySrc.path;
                    const parent = dirname(target);
                    const base = relative(parent, target);
                    const backup = join(parent, `.${base}.bak-${randomUUID()}`);
                    await renameWithRetry(target, backup);
                    if (ledger !== undefined) {
                        ledger.record(async () => renameWithRetry(backup, target), () => rm(backup, { recursive: true, force: true }));
                    }
                    report.removed.push(copySrc.path);
                }
                else {
                    throw new ApiError(409, `「${name}」的来源副本内容与登记不一致（可能已被修改），不能自动删除；请先手动删除项目副本再恢复默认来源`);
                }
            }
        }
        delete projectConfig.sources[name];
        return { changed: true, copyCreated: false, report };
    }
    const source = identity.sources.find((s) => s.key === sourceKey);
    if (source === undefined)
        throw new ApiError(404, `来源不存在：${sourceKey}`);
    if (source.broken)
        throw new ApiError(409, `来源 ${sourceKey} 的 skill 文件格式损坏，不能选择`);
    // DSH would resolve (among healthy real sources — not the managed copy, which
    // is itself rank-100 and would otherwise always win): lowest rank, same-rank
    // ties by the DSH resolver order (review P1-2). The selection is a pure
    // selection — and any now-redundant managed copy is removed — only when the
    // selected source IS that winner; otherwise the rank-100 copy of the
    // selected source is materialized so the explicit choice actually takes
    // effect in DSH resolution.
    const realHealthy = identity.sources.filter((s) => !s.shadow && !s.broken && !s.generated);
    let dshWinner = null;
    for (const s of realHealthy) {
        if (dshWinner === null || s.rank < dshWinner.rank || (s.rank === dshWinner.rank && dshResolverIndex(s.key) < dshResolverIndex(dshWinner.key)))
            dshWinner = s;
    }
    const needsCopy = dshWinner === null || dshWinner.key !== sourceKey;
    const prev = projectConfig.sources[name];
    if (needsCopy) {
        const copyResult = await ensureManagedCopy(projectRoot, projectConfig, identity, sourceKey, !wantEnabled, opts, report, true, ledger);
        // The copy is the project's mechanism now; a legacy stub would
        // shadow it (marker-verified removal only).
        await removeMarkerStub(projectRoot, name, report, ledger);
        return { changed: true, copyCreated: copyResult.copyCreated, report };
    }
    // Selected source wins on its own: pure selection (no copy). A modified
    // managed copy is now a real project artifact and must not be silently left
    // at rank 100 while config claims the lower-ranked source is effective.
    if (prev && prev.generated === true) {
        // A copy existed for the previous selection but is no longer needed:
        // remove it (marker-verified by construction: prev.generated).
        const existingCopy = identity.sources.find((s) => s.scope === 'project' && s.generated && !s.broken);
        if (existingCopy !== undefined && existingCopy.modified === true) {
            throw new ApiError(409, `「${name}」的来源副本已被修改，不能切换为纯来源；请先处理项目副本`);
        }
        if (existingCopy !== undefined) {
            const copyHash = await hashSkillSource(existingCopy.path, existingCopy.format).catch(() => null);
            // legacy utf8-text registrations verify as unmodified (P1-3).
            const marker = managedCopyMarker(prev);
            if (marker !== undefined && copyHash !== null && (await hashMatches(marker, existingCopy.path, existingCopy.format, copyHash))) {
                await removePathWithLedger(existingCopy.format === 'dir' ? dirname(existingCopy.path) : existingCopy.path, ledger);
                report.removed.push(existingCopy.path);
            }
            else
                throw new ApiError(409, `「${name}」的来源副本内容与登记不一致，不能切换为纯来源`);
        }
    }
    projectConfig.sources[name] = { source: sourceKey, generated: false };
    return { changed: true, copyCreated: false, report };
}
/**
 * Annotate identities with V1 fields (tags, enabled state, generated/
 * modified/stale source marks, effective-source resolution) and run the
 * idempotent reconcile for the project.
 *
 * @param cwd - resolved workspace cwd (or null when there is none).
 * @param opts - { agentPresets, home, logger }.
 * @returns { view, config, report } — view is a plain-JSON-safe project
 *   catalog; config/report are for persistence and the API response.
 */
export async function buildProjectView(cwd, opts) {
    const o = optsOf(opts);
    const projectRoot = typeof cwd === 'string' && cwd.length > 0 ? await findProjectRoot(cwd) : null;
    const { config, existed, corrupt, future, raw } = projectRoot === null
        ? { config: emptyProjectConfig(''), existed: false, corrupt: false, future: false, raw: undefined }
        : await readProjectConfig(projectRoot, o);
    // A corrupt (unreadable) or newer-version config must not be reconciled or
    // written: reconcile from an empty truth would materialize stubs for every
    // identity (all-off state), and a future version is read-only (review
    // P2-1/P2-2). The view reports both; mutations refuse with actionable 409.
    const readOnlyConfig = corrupt === true || future === true;
    // Pass 1: scan + reconcile (materialize/clean derived artifacts).
    const pre = await buildIdentityCatalog(cwd, o, config);
    let report = { created: [], removed: [], rewritten: [], conflicts: [], failed: [] };
    if (projectRoot !== null && !readOnlyConfig) {
        const ledger = createLedger();
        const configBefore = JSON.parse(JSON.stringify(config));
        try {
            report = await reconcileProject(projectRoot, config, pre.identities, o, o.logger, ledger);
            if (JSON.stringify(config) !== JSON.stringify(configBefore)) {
                // Reconcile changed source registrations (managed copies,
                // orphan cleanup, copyHash refresh). File and config changes are one
                // transaction: a failed config write rolls every derived artifact
                // back instead of leaving an unregistered rank-100 copy.
                await writeProjectConfig(projectRoot, config, o, raw);
            }
            const cleanupFailures = await ledger.commit();
            cleanupFailures.forEach((failure) => report.failed.push({ name: '*', error: `副本备份清理失败：${failure}` }));
        }
        catch (error) {
            const rollbackFailures = await ledger.rollback();
            for (const key of Object.keys(config))
                delete config[key];
            Object.assign(config, configBefore);
            report.created = [];
            report.removed = [];
            report.rewritten = [];
            report.failed.push({ name: '*', error: `reconcile 已回滚：${error instanceof Error ? error.message : String(error)}` });
            rollbackFailures.forEach((failure) => report.failed.push({ name: '*', error: `回滚失败：${failure}` }));
        }
    }
    // Pass 2: rescan so the served view reflects the reconciled disk state.
    const { identities } = await buildIdentityCatalog(cwd, o, config);
    const { config: globalConfig } = await readGlobalConfig(o);
    const tags = globalConfig.tags || {};
    for (const identity of identities.values()) {
        const entry = config.sources[identity.name];
        // Mark the managed-copy modified fact FIRST, so classification
        // (mechanism/specialized/effective) sees it.
        if (entry && entry.generated === true) {
            const candidate = identity.sources.find((s) => s.scope === 'project' && s.generated === true && s.shadow === false && !s.broken);
            if (candidate !== undefined) {
                const copyHash = await hashSkillSource(candidate.path, candidate.format).catch(() => null);
                const marker = managedCopyMarker(entry);
                candidate.modified = marker === undefined
                    || copyHash === null
                    || !(await hashMatches(marker, candidate.path, candidate.format, copyHash));
            }
        }
        const { mechanism, defaultSourceKey, sourceKey, effectiveSource, specialized, winner } = classifyIdentity(identity, config, projectRoot);
        // Stale fact (source-less registration = default materialization:
        // judged against the identity's current default real source).
        if (entry && entry.generated === true) {
            const originKey = typeof entry.source === 'string' ? entry.source : defaultSourceKey;
            const origin = originKey !== null
                ? identity.sources.find((s) => s.key === originKey && !s.broken && !s.generated)
                : undefined;
            if (origin !== undefined) {
                const originHash = await hashSkillSource(origin.path, origin.format).catch(() => null);
                origin.stale = entry.originHash !== undefined
                    && originHash !== null
                    && !(await hashMatches(entry.originHash, origin.path, origin.format, originHash));
            }
        }
        const enabled = config.enabled.includes(identity.name);
        const described = effectiveSource && !effectiveSource.broken ? effectiveSource
            : identity.sources.find((s) => !s.broken) || null;
        // Whether the skill really appears in this project's model catalog:
        // the marker stub on disk (rank 100) shadows every original.
        let modelInvocable = winner !== null && winner.modelInvocable === true;
        if (modelInvocable && projectRoot !== null) {
            // reserved-prefix stub or legacy stub on disk (P2-4) shadows the
            // winner.
            let stubPresent = false;
            for (const stubP of [shadowStubPath(projectRoot, identity.name), legacyStubPath(projectRoot, identity.name)]) {
                const stubSt = await stat(stubP).catch(() => undefined);
                if (stubSt !== undefined && stubSt.isFile() && (await isShadowFile(stubP).catch(() => false))) {
                    stubPresent = true;
                    break;
                }
            }
            modelInvocable = !stubPresent;
        }
        identity.v1 = {
            description: described ? described.description : '',
            ...(described?.whenToUse === undefined ? {} : { whenToUse: described.whenToUse }),
            tags: Array.isArray(tags[identity.name]) ? tags[identity.name] : [],
            defaultSourceKey,
            sourceKey,
            effectiveSourceKey: effectiveSource ? effectiveSource.key : null,
            specialized,
            mechanism,
            enabled,
            modelInvocable,
            updateInfo: null, // V1: no remote update detection — never fabricated.
        };
    }
    const list = [...identities.values()].sort((a, b) => a.name.localeCompare(b.name)).map((identity) => {
        const v1 = identity.v1;
        return {
            name: identity.name,
            description: v1.description,
            ...(v1.whenToUse === undefined ? {} : { whenToUse: v1.whenToUse }),
            tags: v1.tags,
            sources: identity.sources.filter((s) => !s.shadow).map((s) => ({
                key: s.key,
                label: s.label,
                scope: s.scope,
                rank: s.rank,
                format: s.format,
                path: s.path,
                modelInvocable: s.modelInvocable,
                mtimeMs: s.mtimeMs,
                ...(s.broken === undefined ? {} : { broken: s.broken }),
                files: s.files,
                ...(s.readOnly === true ? { readOnly: true } : {}),
                generated: s.generated === true,
                modified: s.modified === true,
                stale: s.stale === true,
            })),
            defaultSourceKey: v1.defaultSourceKey,
            sourceKey: v1.sourceKey,
            effectiveSourceKey: v1.effectiveSourceKey,
            specialized: v1.specialized,
            enabled: v1.enabled,
            modelInvocable: v1.modelInvocable,
            updateInfo: v1.updateInfo,
        };
    });
    const view = {
        apiVersion: 6,
        projectRoot,
        identities: list,
        configExisted: existed,
        configCorrupt: corrupt === true,
        configFuture: future === true,
    };
    return { view, config, report, identities, raw };
}
//# sourceMappingURL=catalog.js.map