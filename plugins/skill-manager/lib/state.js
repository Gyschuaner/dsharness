/**
 * dsh-skill-manager — V1 state model (DSH-008).
 *
 * Persistence for the two V1 truth files:
 *   project: <projectRoot>/.dsh/skill-manager.json   (single source of truth
 *             for one project's enabled set + explicit source selections)
 *   global:  ~/.dsh/skill-manager.json               (legacy globalDefaultOff
 *             kept for compatibility; extended with global tags and presets)
 *
 * Rules (handoff §9/§10):
 *   - project config is the only truth; file-level switches are rebuildable
 *     derived artifacts, never truth;
 *   - atomic writes (tmp with a unique uuid suffix + rename), JSON only,
 *     no live Host objects; two same-path writers never share one tmp
 *     name (review P1-1);
 *   - paths are canonicalized and containment-checked; read-only or
 *     non-writable targets are rejected with explicit errors;
 *   - a corrupt (unparseable) project config degrades to a VISIBLE
 *     empty enabled set and no reconcile rewrites disk from it; permission /
 *     I/O read errors are actionable errors, never a silent "empty config"
 *     (review P2-2);
 *   - unknown top-level fields and unknown per-source fields survive
 *     round-trips (forward compatibility, review P2-1); a stored
 *     apiVersion higher than PROJECT_API_VERSION makes the config read-only:
 *     reads report it, writes refuse instead of silently downgrading a
 *     future version; lower versions migrate explicitly through
 *     migrateProjectConfig;
 *   - the persisted config never stores the project's absolute root: the
 *     path is derived from the config file's own location, so a checked-in
 *     config file stays portable across machines (review P2-4);
 *   - access to one canonical config path is serialized
 *     (withProjectConfigLock / withGlobalConfigLock): a read -> compute ->
 *     write -> reconcile transaction never interleaves with another
 *     mutation of the same config (review P1-1);
 *   - zero bare dependencies (node: builtins only).
 */
import { createHash, randomUUID } from 'node:crypto';
import { access, constants, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
/** Skill-name grammar: kebab-case (same as the legacy plugin). */
export const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Project config schema/apiVersion for V1. */
export const PROJECT_API_VERSION = 6;
/** Global config schema marker. */
export const GLOBAL_SCHEMA = 'dsh-skill-manager/global';
export const PROJECT_SCHEMA = 'dsh-skill-manager/project';
/** Tag constraints (V1): 1–32 chars, max 20 per skill identity. */
export const TAG_MAX_LENGTH = 32;
export const TAGS_PER_SKILL_MAX = 20;
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function errorCode(error) {
    return isRecord(error) && typeof error.code === 'string' ? error.code : undefined;
}
export class ApiError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
/** Optional dependency injection for tests: { home: string }. */
function homeOf(opts) {
    const home = opts && typeof opts.home === 'string' && opts.home.length > 0 ? opts.home : homedir();
    return resolve(home);
}
/**
 * Mirror of dsh-skill-filesystem's findProjectRoot: walk up from cwd looking
 * for a `.git` marker; when none exists, fall back to cwd itself.
 * @param cwd - absolute workspace directory.
 * @returns the project root DSH actually scans for project-level skills.
 */
export async function findProjectRoot(cwd) {
    const start = resolve(cwd);
    let current = start;
    for (;;) {
        const st = await stat(join(current, '.git')).catch(() => undefined);
        if (st !== undefined)
            return current; // .git as directory or worktree file
        const parent = dirname(current);
        if (parent === current)
            return start; // filesystem root: DSH falls back to cwd
        current = parent;
    }
}
/** Validate a cwd argument; undefined/null/'' stays undefined. */
export async function assertCwd(cwd) {
    if (cwd === undefined || cwd === null || cwd === '')
        return undefined;
    if (typeof cwd !== 'string')
        throw new ApiError(400, 'cwd 必须是字符串');
    const resolved = resolve(cwd);
    return stat(resolved).then((st) => {
        if (!st.isDirectory())
            throw new ApiError(400, `cwd 不是目录：${resolved}`);
        return resolved;
    }).catch((error) => {
        if (error instanceof ApiError)
            throw error;
        throw new ApiError(400, `cwd 不存在：${resolved}`);
    });
}
/**
 * Absolute, canonical path for the project config file. Containment: the
 * file must sit exactly one level below the project root's .dsh directory.
 * @param projectRoot - resolved project root.
 */
export function projectConfigPath(projectRoot) {
    return join(resolve(projectRoot), '.dsh', 'skill-manager.json');
}
/** Absolute, canonical path for the global config file. */
export function globalConfigPath(opts) {
    return join(homeOf(opts), '.dsh', 'skill-manager.json');
}
/** Atomic write: tmp file in the same directory, then rename over the target. */
export async function atomicWriteFile(path, content) {
    const tmp = `${path}.tmp-${randomUUID()}`;
    await mkdir(dirname(path), { recursive: true });
    try {
        await writeFile(tmp, content, 'utf8');
        await rename(tmp, path);
    }
    finally {
        await rm(tmp, { force: true }).catch(() => { });
    }
}
/**
 * Per-canonical-config-path serialization (review P1-1): one mutation queue
 * per key, so a read -> compute -> write -> reconcile transaction never
 * interleaves with another mutation of the same config. A rejecting task
 * still releases the queue and its rejection propagates to the caller.
 * @param key - stable lock key (projectLockKey / globalLockKey).
 * @param task - async unit of work.
 * @returns the resolved value of `task`.
 */
export function withConfigLock(key, task) {
    const prev = configLocks.get(key) || Promise.resolve();
    const run = prev.then(() => task());
    // The queue advances regardless of this task's outcome; prune on the tail.
    const tail = run.catch(() => undefined).then(() => { if (configLocks.get(key) === tail)
        configLocks.delete(key); });
    configLocks.set(key, tail);
    return run;
}
/** Per-config-path queues, pruned when the last queued task settles. */
const configLocks = new Map();
/** Lock key for one project config, its canonical file path. */
export function projectLockKey(projectRoot) {
    return `project:${resolve(projectRoot)}`;
}
/** Lock key for the global config, its canonical file path. */
export function globalLockKey(opts) {
    return `global:${globalConfigPath(opts)}`;
}
/**
 * Transaction ledger for derived-artifact file ops (review P1-4): a mutation
 * plans, records undo + cleanup per file change, then commits (config persisted)
 * or rolls back (config write failed), so a failure never leaves an unregistered
 * copy shadowing other sources or loses a verified copy.
 * @param returns { record(undo, cleanup), commit(), rollback() } - undo reverts
 *   one file change, cleanup removes its backup; commit runs the cleanups,
 *   rollback runs the undos (reverse order) then the cleanups of the reverted
 *   changes, returning the rollback failure messages.
 */
export function createLedger() {
    const ops = [];
    return {
        record(undo, cleanup) {
            if (undo || cleanup)
                ops.push({ ...(undo ? { undo } : {}), ...(cleanup ? { cleanup } : {}) });
        },
        async commit() {
            const failures = [];
            for (const op of ops) {
                if (typeof op.cleanup === 'function') {
                    try {
                        await op.cleanup();
                    }
                    catch (error) {
                        failures.push(error instanceof Error ? error.message : String(error));
                    }
                }
            }
            return failures;
        },
        async rollback() {
            const failures = [];
            for (const op of [...ops].reverse()) {
                let reverted = true;
                if (typeof op.undo === 'function') {
                    try {
                        await op.undo();
                    }
                    catch (error) {
                        reverted = false;
                        failures.push(`undo: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
                if (reverted && typeof op.cleanup === 'function') {
                    try {
                        await op.cleanup();
                    }
                    catch (error) {
                        failures.push(`cleanup: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
            }
            return failures;
        },
    };
}
/**
 * Read the project config.
 * @returns { config, path, existed, corrupt, future, raw } — corrupt files
 *   degrade to a VISIBLE empty config (configCorrupt in the view); no mutation
 *   overwrites one (review P2-2). `future` flags a stored apiVersion newer than
 *   PROJECT_API_VERSION: reads still normalize, writes refuse (P2-1). `raw`
 *   is the on-disk object callers pass back to writeProjectConfig so unknown
 *   fields survive the write (P2-1); undefined makes the write re-read.
 */
export async function readProjectConfig(projectRoot, _opts) {
    const path = projectConfigPath(projectRoot);
    try {
        const rawText = await readFile(path, 'utf8');
        const parsed = JSON.parse(rawText);
        const obj = isRecord(parsed) ? parsed : {};
        const future = typeof obj.apiVersion === 'number' && obj.apiVersion > PROJECT_API_VERSION;
        const config = migrateProjectConfig(obj, resolve(projectRoot));
        return { config, path, existed: true, corrupt: false, future, raw: obj };
    }
    catch (error) {
        if (errorCode(error) === 'ENOENT' || errorCode(error) === 'ENOTDIR') {
            return { config: emptyProjectConfig(resolve(projectRoot)), path, existed: false, corrupt: false, future: false, raw: {} };
        }
        if (error instanceof SyntaxError) {
            // Corrupt (unparseable) truth: degrade to a VISIBLE empty config
            // (the view flags configCorrupt); nothing rewrites disk from it
            // (review P2-2).
            // raw: undefined so any write re-reads the truth file and refuses
            // (P2-2): a corrupt config is never overwritten by a mutation.
            return { config: emptyProjectConfig(resolve(projectRoot)), path, existed: true, corrupt: true, future: false, raw: undefined };
        }
        // Permission or I/O failure: a truth file this host cannot read is
        // not a reason to reconcile an empty config over it (review P2-2).
        const reason = errorCode(error) ?? (error instanceof Error ? error.message : 'I/O');
        throw new ApiError(409, `项目配置无法读取（${reason}），权限或 I/O 错误：请修复后重试，本次未做任何 reconcile 或写盘`);
    }
}
/** Write the project config (atomic). Rejects when the root is not writable. */
export async function writeProjectConfig(projectRoot, config, opts, raw) {
    const root = resolve(projectRoot);
    const st = await stat(root).catch(() => undefined);
    if (st === undefined || !st.isDirectory())
        throw new ApiError(400, `项目目录不存在：${root}`);
    try {
        await access(root, constants.W_OK);
    }
    catch {
        throw new ApiError(409, `项目目录不可写（只读根），无法保存配置：${root}`);
    }
    const path = projectConfigPath(root);
    // Never overwrite a truth file this host cannot read or understand
    // (review P2-1 / P2-2 / P2-4):
    //   - corrupt JSON: refusing avoids clobbering unread truth data;
    //   - apiVersion newer than this host: refusing avoids a silent
    //     downgrade of future-version fields;
    //   - permission / I/O errors: no write at all.
    let onDisk = raw;
    if (onDisk === undefined) {
        try {
            onDisk = JSON.parse(await readFile(path, 'utf8'));
        }
        catch (error) {
            if (errorCode(error) === 'ENOENT' || errorCode(error) === 'ENOTDIR')
                onDisk = null;
            else if (error instanceof SyntaxError)
                throw new ApiError(409, '项目配置已损坏（JSON 无法解析）：为避免覆盖无法读取的真相文件，已拒绝写入；可手动删除该文件后重建空配置');
            else {
                const reason = errorCode(error) ?? (error instanceof Error ? error.message : 'I/O');
                throw new ApiError(409, `项目配置无法读取（${reason}），权限或 I/O 错误：已拒绝写入，未做任何改动`);
            }
        }
    }
    if (isRecord(onDisk) && typeof onDisk.apiVersion === 'number' && onDisk.apiVersion > PROJECT_API_VERSION) {
        throw new ApiError(409, `项目配置版本 apiVersion ${onDisk.apiVersion} 高于当前 host 支持的 ${PROJECT_API_VERSION}：为保护未来版本数据已拒绝写入；升级 host 后重试`);
    }
    const next = migrateProjectConfig(config, root);
    // Forward compatibility (review P2-1): unknown top-level fields and
    // unknown per-source fields round-trip.
    if (isRecord(onDisk)) {
        for (const [k, v] of Object.entries(onDisk)) {
            if (!(k in next))
                next[k] = v;
        }
        if (isRecord(onDisk.sources)) {
            const knownSourceFields = new Set([
                'source', 'contentHash', 'originHash', 'copyHash', 'generated',
                'marketManaged', 'marketId', 'marketRepository', 'marketPath', 'marketRef', 'marketRevision', 'marketHash',
                'originType', 'originRepository', 'originPath', 'originRef', 'originRevision', 'originBundleHash', 'originUrl',
            ]);
            for (const [name, onEntry] of Object.entries(onDisk.sources)) {
                if (!isRecord(onEntry))
                    continue;
                // An entry absent from the in-memory config was explicitly
                // removed by this mutation (the config is initialized from
                // disk): a deletion is not re-added from the stale raw.
                const nextEntry = next.sources[name] && typeof next.sources[name] === 'object' ? next.sources[name] : undefined;
                if (nextEntry === undefined)
                    continue;
                for (const [k, v] of Object.entries(onEntry)) {
                    // Known fields are controlled by the current mutation: an absent
                    // `source` or `generated` is an intentional reset, not an unknown
                    // field to resurrect from the stale raw object.
                    if (!knownSourceFields.has(k) && !(k in nextEntry))
                        nextEntry[k] = v;
                }
                if (Object.keys(nextEntry).length > 0)
                    next.sources[name] = nextEntry;
            }
        }
    }
    // The persisted config never carries the project's absolute root; it is
    // derived from the config file's own location (review P2-4). The file is
    // machine-local state, and keeping the absolute path out also avoids stale
    // roots after a workspace is moved on the same machine.
    const serialized = Object.assign({}, next);
    delete serialized.projectRoot;
    if (opts && opts.faults && typeof opts.faults.beforeProjectConfigWrite === 'function') {
        await opts.faults.beforeProjectConfigWrite({ path, config: serialized });
    }
    await atomicWriteFile(path, JSON.stringify(serialized, null, 2) + '\n');
    return next;
}
/** The fresh-project default: no non-required skill enters the model catalog. */
export function emptyProjectConfig(projectRoot) {
    return {
        schema: PROJECT_SCHEMA,
        apiVersion: PROJECT_API_VERSION,
        projectRoot: typeof projectRoot === 'string' ? resolve(projectRoot) : '',
        enabled: [],
        sources: {},
        appliedPreset: null,
        updatedAt: new Date().toISOString(),
    };
}
/** Coerce a parsed JSON value into a well-formed project config (tolerant). */
export function normalizeProjectConfig(parsed, projectRoot) {
    const base = emptyProjectConfig(projectRoot);
    if (!isRecord(parsed))
        return base;
    base.enabled = Array.isArray(parsed.enabled)
        ? parsed.enabled.filter((n) => typeof n === 'string' && NAME_RE.test(n))
        : [];
    if (parsed.sources && typeof parsed.sources === 'object' && !Array.isArray(parsed.sources)) {
        for (const [name, sel] of Object.entries(parsed.sources)) {
            if (typeof name !== 'string' || !NAME_RE.test(name))
                continue;
            if (!isRecord(sel))
                continue;
            const entry = {};
            if (typeof sel.source === 'string' && sel.source.length > 0)
                entry.source = sel.source;
            if (typeof sel.contentHash === 'string' && sel.contentHash.length > 0)
                entry.contentHash = sel.contentHash;
            if (typeof sel.originHash === 'string' && sel.originHash.length > 0)
                entry.originHash = sel.originHash;
            if (typeof sel.copyHash === 'string' && sel.copyHash.length > 0)
                entry.copyHash = sel.copyHash;
            if (sel.generated === true)
                entry.generated = true;
            if (sel.marketManaged === true)
                entry.marketManaged = true;
            for (const key of ['marketId', 'marketRepository', 'marketPath', 'marketRef', 'marketRevision', 'marketHash', 'originType', 'originRepository', 'originPath', 'originRef', 'originRevision', 'originBundleHash', 'originUrl']) {
                if (typeof sel[key] === 'string' && sel[key].length > 0)
                    entry[key] = sel[key];
            }
            // build 25 briefly stored remote bundle hashes in originHash. Migrate
            // that draft shape without confusing it with managed-copy origin hashes.
            if (entry.originType === 'github'
                && entry.generated !== true
                && entry.originBundleHash === undefined
                && typeof entry.originHash === 'string'
                && /^sha256:[a-f0-9]{64}$/i.test(entry.originHash)) {
                entry.originBundleHash = entry.originHash;
                delete entry.originHash;
            }
            // A future schema may carry unknown-only source fields: keep
            // the raw entry so such fields survive the round-trip
            // (review P2-1).
            if (Object.keys(entry).length === 0)
                Object.assign(entry, sel);
            if (Object.keys(entry).length > 0)
                base.sources[name] = entry;
        }
    }
    if (typeof parsed.appliedPreset === 'string' && parsed.appliedPreset.length > 0)
        base.appliedPreset = parsed.appliedPreset;
    if (typeof parsed.updatedAt === 'string')
        base.updatedAt = parsed.updatedAt;
    return base;
}
export function migrateProjectConfig(parsed, projectRoot) {
    // Explicit migration path (review P2-1): a missing apiVersion or a
    // legacy (< PROJECT_API_VERSION) file uses the V1 field mapping, 1:1
    // today; a future major bump changes this function, not the read/write
    // call sites. apiVersion === PROJECT_API_VERSION normalizes as-is; a
    // higher apiVersion still normalizes for a READ-ONLY report (the caller
    // marks it `future` and writeProjectConfig refuses to write it).
    const obj = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    return normalizeProjectConfig(obj, projectRoot);
}
/** Tolerant coercion of a parsed global-config JSON object. */
function normalizeGlobalConfig(parsed) {
    const base = {
        schema: GLOBAL_SCHEMA,
        apiVersion: PROJECT_API_VERSION,
        globalDefaultOff: isRecord(parsed) && parsed.globalDefaultOff === true,
        tags: {},
        presets: {},
    };
    if (!isRecord(parsed))
        return base;
    if (parsed.tags && typeof parsed.tags === 'object' && !Array.isArray(parsed.tags)) {
        base.tags = normalizeTagsMap(parsed.tags);
    }
    if (parsed.presets && typeof parsed.presets === 'object' && !Array.isArray(parsed.presets)) {
        base.presets = normalizePresetsMap(parsed.presets);
    }
    return base;
}
/**
 * Read the global config. Unknown top-level fields (including the legacy
 * globalDefaultOff) are preserved on write for compatibility.
 * @returns { config, path, existed, raw } — raw carries the unknown fields.
 */
export async function readGlobalConfig(opts) {
    const path = globalConfigPath(opts);
    const empty = {
        schema: GLOBAL_SCHEMA,
        apiVersion: PROJECT_API_VERSION,
        globalDefaultOff: false,
        tags: {},
        presets: {},
    };
    try {
        const rawObj = JSON.parse(await readFile(path, 'utf8'));
        if (!isRecord(rawObj)) {
            return { config: empty, path, existed: true, corrupt: true, future: false, raw: {} };
        }
        const future = typeof rawObj.apiVersion === 'number' && rawObj.apiVersion > PROJECT_API_VERSION;
        const config = normalizeGlobalConfig(rawObj);
        return { config, path, existed: true, corrupt: false, future, raw: rawObj };
    }
    catch (error) {
        if (errorCode(error) === 'ENOENT' || errorCode(error) === 'ENOTDIR') {
            return { config: empty, path, existed: false, corrupt: false, future: false, raw: {} };
        }
        if (error instanceof SyntaxError) {
            return { config: empty, path, existed: true, corrupt: true, future: false, raw: {} };
        }
        throw new ApiError(500, `无法读取全局 SKILL 配置：${error instanceof Error ? error.message : String(error)}`);
    }
}
/** Merge-patch the global config (atomic; preserves unknown fields). */
export async function writeGlobalConfig(patch, opts) {
    const { config, raw, path, corrupt, future } = await readGlobalConfig(opts);
    if (corrupt)
        throw new ApiError(409, `全局 SKILL 配置损坏，拒绝覆盖：${path}`);
    if (future)
        throw new ApiError(409, `全局 SKILL 配置版本高于当前支持版本，拒绝降级覆盖：${path}`);
    const next = Object.assign({}, raw, config);
    for (const [key, value] of Object.entries(patch)) {
        if (value === undefined)
            delete next[key];
        else
            next[key] = value;
    }
    next.schema = GLOBAL_SCHEMA;
    next.apiVersion = PROJECT_API_VERSION;
    if (next.tags !== undefined)
        next.tags = normalizeTagsMap(next.tags);
    if (next.presets !== undefined)
        next.presets = normalizePresetsMap(next.presets);
    next.globalDefaultOff = next.globalDefaultOff === true;
    await atomicWriteFile(path, JSON.stringify(next, null, 2) + '\n');
    return normalizeGlobalConfig(next);
}
/** { skillName: string[] } with per-tag validation (invalid entries dropped). */
export function normalizeTagsMap(input) {
    const out = {};
    if (input === null || typeof input !== 'object' || Array.isArray(input))
        return out;
    for (const [name, tags] of Object.entries(input)) {
        if (typeof name !== 'string' || !NAME_RE.test(name))
            continue;
        const clean = validateTagList(tags);
        if (clean.length > 0)
            out[name] = clean;
    }
    return out;
}
/**
 * Validate a tag list: strings, trimmed, non-empty, ≤32 chars, de-duplicated
 * case-insensitively, ≤20 total. Invalid entries are dropped, not fatal.
 */
export function validateTagList(tags) {
    if (!Array.isArray(tags))
        return [];
    const seen = new Set();
    const out = [];
    for (const tag of tags) {
        if (typeof tag !== 'string')
            continue;
        const clean = tag.trim();
        if (clean.length === 0 || clean.length > TAG_MAX_LENGTH)
            continue;
        const key = clean.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(clean);
        if (out.length >= TAGS_PER_SKILL_MAX)
            break;
    }
    return out;
}
/**
 * Normalize the presets map: { name: { name, description?, defaultSlim?,
 * skills: { [skillName]: { source? } }, updatedAt? } }.
 * Only skill identity + chosen generic source are stored — never versions,
 * never project-specialized content (handoff §4.2).
 */
export function normalizePresetsMap(input) {
    const out = {};
    if (input === null || typeof input !== 'object' || Array.isArray(input))
        return out;
    for (const [name, preset] of Object.entries(input)) {
        if (typeof name !== 'string' || name.trim().length === 0 || name.length > 64)
            continue;
        if (!isRecord(preset))
            continue;
        const skills = {};
        const src = isRecord(preset.skills) ? preset.skills : {};
        for (const [skillName, sel] of Object.entries(src)) {
            if (typeof skillName !== 'string' || !NAME_RE.test(skillName))
                continue;
            const entry = {};
            if (isRecord(sel) && typeof sel.source === 'string' && sel.source.length > 0)
                entry.source = sel.source;
            skills[skillName] = entry;
        }
        const description = typeof preset.description === 'string' ? preset.description.slice(0, 200) : undefined;
        const updatedAt = typeof preset.updatedAt === 'string' ? preset.updatedAt : undefined;
        out[name] = {
            name,
            defaultSlim: preset.defaultSlim === true,
            skills,
            ...(description !== undefined ? { description } : {}),
            ...(updatedAt !== undefined ? { updatedAt } : {}),
        };
    }
    return out;
}
/** Preset name validation (shared by read/write ops). */
export function assertPresetName(name) {
    if (typeof name !== 'string')
        throw new ApiError(400, '预设名必须是字符串');
    const clean = name.trim();
    if (clean.length === 0 || clean.length > 64)
        throw new ApiError(400, '预设名长度需在 1–64 之间');
    return clean;
}
/** sha256 hex of a Buffer/Uint8Array (raw bytes) or a string (utf8, legacy digest). */
export function sha256Hex(data) {
    return createHash('sha256').update(data).digest('hex');
}
/**
 * Content hash of one skill source: flat files hash their own text;
 * directory bundles hash every file (stable sorted walk, `rel=hex` lines).
 * This is the "content unchanged" marker half for generated copies.
 * @param path - SKILL.md path (dir bundle) or flat .md path.
 * @param format - 'dir' | 'flat'.
 */
export async function hashSkillSource(path, format) {
    // Raw-byte hashes (review P1-3): invalid UTF-8 sequences, NUL bytes and
    // any real binary content change the digest. A toString('utf8')
    // collapsed them (replacement char) and hid real content changes,
    // breaking the "modified copies are never overwritten" boundary.
    if (format === 'flat') {
        const data = await readFile(path);
        return `sha256:${data.length}:${sha256Hex(data)}`;
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
            if (entry.name.startsWith('.') || /\.tmp-[^/]+$/.test(entry.name))
                continue;
            const p = join(d, entry.name);
            const real = await realpath(p).catch(() => undefined);
            if (real === undefined || seen.has(real))
                continue;
            seen.add(real);
            if (real !== rootReal && !real.startsWith(rootReal + sep))
                continue; // symlink escape
            if (entry.isDirectory())
                await rec(p, depth + 1);
            else if (entry.isFile()) {
                const data = await readFile(p);
                lines.push(`${relative(root, p).split(sep).join('/')}:${data.length}:${sha256Hex(data)}`);
            }
        }
    }
    await rec(root, 0);
    const manifest = Buffer.from(lines.join('\n'), 'utf8');
    return `sha256:${manifest.length}:${sha256Hex(manifest)}`;
}
//# sourceMappingURL=state.js.map