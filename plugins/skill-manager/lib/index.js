/**
 * dsh-skill-manager — host half (V1, apiVersion 6, DSH-008).
 *
 * A web-profile plugin exposing a JSON HTTP API (`/api/skill-manager`) over
 * skill files on disk. V1 (DSH-008) restructures the SKILL center around
 * two truths:
 *   - the project config `<projectRoot>/.dsh/skill-manager.json` (the single
 *     source of truth for a project's enabled set + source selections);
 *   - the global config `~/.dsh/skill-manager.json` (legacy globalDefaultOff
 *     kept; global tags and cross-project presets).
 *
 * Legacy ops (list / read / save / delete / import / exportZip / setStatus /
 * getPolicy / setPolicy) are unchanged in behavior so older clients keep
 * working against this host. New V1 ops: catalog / projectState / setEnabled
 * / setMany / setSource / setTags / presets.* / slim.*.
 *
 * Zero bare dependencies: node: builtins only.
 */
import { mkdir, readdir, readFile, realpath, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { NAME_RE, ApiError, PROJECT_API_VERSION, findProjectRoot, assertCwd, projectConfigPath, globalConfigPath, atomicWriteFile, readProjectConfig, writeProjectConfig, readGlobalConfig, writeGlobalConfig, validateTagList, normalizeTagsMap, normalizePresetsMap, assertPresetName, withConfigLock, projectLockKey, globalLockKey, createLedger, } from './state.js';
import { RANKS, SHADOW_DESC_PREFIX, SHADOW_STUB_PREFIX, shadowStubPath, parseSkill, patchInvocationFlag, isShadowFile, markerContent, computeRoots, discoverInRoot, discoverBundled, walkSkillFiles, copySkillToProject, reconcileProject, applySourceSelection, buildProjectView, buildIdentityCatalog, } from './catalog.js';
import { createMarketplace } from './marketplace.js';
function errorCode(error) {
    return error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
}
/** Stable Cordis plugin name (host half). */
const name = 'skill-manager';
/** Wait for both host services before applying on a cold web-profile boot. */
const inject = ['webServer', 'agentPresets'];
// ── legacy policy state (globalDefaultOff) — now lives in the global config ─
const STATE_PATH = join(homedir(), '.dsh', 'skill-manager.json');
async function readPolicyState(opts) {
    const { config } = await readGlobalConfig(opts);
    return { globalDefaultOff: config.globalDefaultOff === true };
}
async function writePolicyState(state, opts) {
    await writeGlobalConfig({ globalDefaultOff: state.globalDefaultOff === true }, opts);
}
/**
 * Policy enforcement write with a bounded retry: on Windows a file that was
 * just created/changed can be briefly held by a watcher, so a single rename
 * failure is transient. Still throws after the last attempt so callers can
 * report it instead of silently skipping the file.
 */
async function policyWrite(path, content) {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            await atomicWriteFile(path, content);
            return;
        }
        catch (error) {
            lastError = error;
            await new Promise((r) => setTimeout(r, 60));
        }
    }
    throw lastError;
}
/** Find a user-root skill by name (either user root, dir bundle or flat). */
async function findUserSkill(cwd, skillName, opts) {
    const { roots } = await computeRoots(cwd, opts);
    for (const root of roots) {
        if (root.scope !== 'user')
            continue;
        const plan = await resolveTarget(undefined, cwd, root.id, skillName, false, opts).catch(() => undefined);
        if (plan !== undefined && plan.existing !== undefined)
            return plan;
    }
    return undefined;
}
/** Find a project-root skill by name; { plan, marker } or undefined. */
async function findProjectSkill(cwd, skillName, opts) {
    const { roots } = await computeRoots(cwd, opts);
    for (const root of roots) {
        if (root.scope !== 'project')
            continue;
        const plan = await resolveTarget(undefined, cwd, root.id, skillName, false, opts).catch(() => undefined);
        if (plan === undefined || plan.existing === undefined)
            continue;
        const marker = plan.existing === 'flat' && (await isShadowFile(plan.path));
        return { plan, marker };
    }
    return undefined;
}
/**
 * Enforce the legacy global default-off policy for this workspace: add the
 * disable flag to every healthy user-root skill that lacks it, and drop
 * legacy marker switches in this project whose original is a user skill
 * (now globally off, so the marker is redundant). Idempotent; safe to run
 * from the legacy list(). Never touches project-original, global or bundled
 * files. (V1 project-level state lives in the project config; the two are
 * coordinated in reconcileProject.)
 */
async function enforceGlobalPolicy(cwd, opts) {
    const state = await readPolicyState(opts);
    if (!state.globalDefaultOff)
        return { changed: 0, markersRemoved: 0, failed: [] };
    const { roots } = await computeRoots(cwd, opts);
    let changed = 0;
    const failed = [];
    for (const root of roots) {
        if (root.scope !== 'user')
            continue;
        const result = await discoverInRoot(root.dir);
        if (!result.exists)
            continue;
        for (const skill of result.skills) {
            if (skill.broken)
                continue;
            const raw = await readFile(skill.path, 'utf8').catch(() => undefined);
            if (raw === undefined)
                continue;
            const { content, changed: ch } = patchInvocationFlag(raw, true);
            if (!ch)
                continue;
            try {
                await policyWrite(skill.path, content);
                changed += 1;
            }
            catch (error) {
                failed.push({ name: skill.name, path: skill.path, error: error instanceof Error ? error.message : String(error) });
            }
        }
    }
    let markersRemoved = 0;
    for (const root of roots) {
        if (root.scope !== 'project')
            continue;
        const entries = await readdirSafe(root.dir);
        for (const entry of entries) {
            if (!entry.isFile() || entry.name.startsWith('.') || !entry.name.toLowerCase().endsWith('.md'))
                continue;
            const skillName = entry.name.slice(0, entry.name.length - 3);
            if (!NAME_RE.test(skillName))
                continue;
            const p = join(root.dir, entry.name);
            if (!(await isShadowFile(p)))
                continue;
            if ((await findUserSkill(cwd, skillName, opts)) !== undefined) {
                await unlink(p).catch(() => { });
                markersRemoved += 1;
            }
        }
    }
    return { changed, markersRemoved, failed };
}
async function readdirSafe(dir) {
    try {
        return await readdir(dir, { withFileTypes: true });
    }
    catch {
        return [];
    }
}
/**
 * Resolve one {root, name} target to a concrete file plan.
 * @returns { rootId, readOnly, dir, path, existing } where existing is
 *   'dir' | 'flat' | undefined.
 */
async function resolveTarget(agentPresets, cwd, rootId, skillName, forCreate, opts) {
    if (typeof skillName !== 'string' || !NAME_RE.test(skillName))
        throw new ApiError(400, `skill 名不合法：${String(skillName)}`);
    if (typeof rootId === 'string' && rootId.startsWith('bundled:')) {
        const presetId = rootId.slice('bundled:'.length);
        let preset;
        try {
            preset = await agentPresets?.list().then((list) => list.find((p) => p !== null && typeof p === 'object' && 'id' in p && p.id === presetId));
        }
        catch {
            preset = undefined;
        }
        if (preset === undefined || typeof preset.path !== 'string')
            throw new ApiError(404, `内置分组不存在：${presetId}`);
        const dir = join(dirname(preset.path), 'skills');
        const plan = { rootId, readOnly: true, readOnlyReason: 'bundled', dir, path: '' };
        const dirPath = join(dir, skillName, 'SKILL.md');
        const flatPath = join(dir, `${skillName}.md`);
        const dirStat = await stat(dirPath).catch(() => undefined);
        const flatStat = await stat(flatPath).catch(() => undefined);
        if (dirStat !== undefined && dirStat.isFile())
            plan.existing = 'dir';
        else if (flatStat !== undefined && flatStat.isFile())
            plan.existing = 'flat';
        plan.path = plan.existing === 'dir' ? dirPath : flatPath;
        if (plan.existing === undefined && !forCreate)
            throw new ApiError(404, `skill 不存在：${skillName}`);
        return plan;
    }
    const { roots } = await computeRoots(cwd, opts);
    const root = roots.find((r) => r.id === rootId);
    if (root === undefined)
        throw new ApiError(404, `根目录不存在：${String(rootId)}`);
    const plan = {
        rootId: root.id,
        readOnly: root.scope === 'global',
        readOnlyReason: root.scope === 'global' ? 'external' : 'bundled',
        dir: root.dir,
        path: '',
    };
    const dirPath = join(root.dir, skillName, 'SKILL.md');
    const flatPath = join(root.dir, `${skillName}.md`);
    const dirStat = await stat(dirPath).catch(() => undefined);
    const flatStat = await stat(flatPath).catch(() => undefined);
    if (dirStat !== undefined && dirStat.isFile())
        plan.existing = 'dir';
    else if (flatStat !== undefined && flatStat.isFile())
        plan.existing = 'flat';
    if (plan.existing === undefined) {
        if (!forCreate)
            throw new ApiError(404, `skill 不存在：${skillName}`);
        plan.path = dirPath; // new skills use the directory-bundle form
        return plan;
    }
    plan.path = plan.existing === 'dir' ? dirPath : flatPath;
    return plan;
}
async function canonicalPathAllowMissing(path) {
    let cursor = resolve(path);
    const tail = [];
    for (;;) {
        try {
            const canonical = await realpath(cursor);
            return resolve(canonical, ...tail);
        }
        catch (error) {
            const code = errorCode(error);
            if (code !== 'ENOENT' && code !== 'ENOTDIR')
                throw error;
            const parent = dirname(cursor);
            if (parent === cursor)
                throw new ApiError(400, '无法解析目标路径');
            tail.unshift(basename(cursor));
            cursor = parent;
        }
    }
}
/** Ensure lexical paths and any child junction/symlink stay inside the canonical root. */
async function assertContained(plan) {
    const rootResolved = await realpath(resolve(plan.dir));
    const targetResolved = await canonicalPathAllowMissing(plan.path);
    const rel = relative(rootResolved, targetResolved);
    if (rel === '' || isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`))
        throw new ApiError(400, '非法路径');
}
// ── minimal ZIP writer (store method, UTF-8 names, no dependencies) ─────────
const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1)
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();
function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i += 1)
        c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}
function dosDateTime(d = new Date()) {
    return {
        time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
        date: ((((d.getFullYear() - 1980) & 0x7f) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()),
    };
}
/** Build a store-only ZIP archive. @param entries - [{ name, data }] */
function buildZip(entries) {
    const enc = new TextEncoder();
    const { time, date } = dosDateTime();
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    for (const entry of entries) {
        const nameBuf = enc.encode(entry.name);
        const data = entry.data;
        const crc = crc32(data);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6); // UTF-8 name flag
        local.writeUInt16LE(0, 8); // method: store
        local.writeUInt16LE(time, 10);
        local.writeUInt16LE(date, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(data.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(nameBuf.length, 26);
        local.writeUInt16LE(0, 28);
        localParts.push(local, nameBuf, data);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(0, 10);
        central.writeUInt16LE(time, 12);
        central.writeUInt16LE(date, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(data.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(nameBuf.length, 28);
        central.writeUInt16LE(0, 30);
        central.writeUInt16LE(0, 32);
        central.writeUInt16LE(0, 34);
        central.writeUInt16LE(0, 36);
        central.writeUInt32LE(0, 38);
        central.writeUInt32LE(offset, 42);
        centralParts.push(central, nameBuf);
        offset += 30 + nameBuf.length + data.length;
    }
    const centralBuf = Buffer.concat(centralParts);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(entries.length, 8);
    eocd.writeUInt16LE(entries.length, 10);
    eocd.writeUInt32LE(centralBuf.length, 12);
    eocd.writeUInt32LE(offset, 16);
    eocd.writeUInt16LE(0, 20);
    return Buffer.concat([...localParts, centralBuf, eocd]);
}
// ── V1 preset helpers (DSH-008) ─────────────────────────────────────────────
/**
 * Diff a preset against the current project config.
 * @param mode - 'replace' | 'merge'.
 * @returns { toEnable: [name], toDisable: [name], sourceChanges: [{name, from, to}], finalEnabled: [name] }
 */
function presetDiff(currentConfig, preset, _identities, mode) {
    const currentEnabled = new Set(currentConfig.enabled);
    const presetNames = Object.keys(preset.skills || {});
    const sourceOf = (name) => {
        const entry = currentConfig.sources[name];
        return entry && typeof entry.source === 'string' ? entry.source : null;
    };
    const sourceChanges = [];
    for (const name of presetNames) {
        const to = preset.skills[name] && typeof preset.skills[name].source === 'string' ? preset.skills[name].source : null;
        const from = sourceOf(name);
        if (from !== to)
            sourceChanges.push({ name, from, to });
    }
    const toEnable = presetNames.filter((n) => !currentEnabled.has(n));
    const toDisable = mode === 'replace' ? [...currentEnabled].filter((n) => !presetNames.includes(n)) : [];
    const finalEnabled = mode === 'replace'
        ? [...presetNames]
        : [...new Set([...currentEnabled, ...presetNames])];
    void _identities; // identity existence is validated at apply time
    return { toEnable, toDisable, sourceChanges, finalEnabled };
}
/** Serialize read/reconcile views for the same project config path. */
async function buildProjectViewLocked(cwd, opts) {
    if (typeof cwd !== 'string' || cwd.length === 0)
        return buildProjectView(cwd, opts);
    const projectRoot = await findProjectRoot(cwd);
    return withConfigLock(projectLockKey(projectRoot), () => buildProjectView(cwd, opts));
}
/** Cheap invalidation key for a warmed per-project identity snapshot. */
async function projectRootSignature(cwd, opts) {
    const { roots } = await computeRoots(cwd, opts);
    const facts = await Promise.all(roots.map(async (root) => {
        const st = await stat(root.dir).catch(() => undefined);
        return [root.id, st === undefined ? null : st.mtimeMs];
    }));
    return JSON.stringify(facts);
}
function sameTargetSourceConfig(left, right, skillName) {
    const fingerprint = (entry) => JSON.stringify(entry === null || typeof entry !== 'object'
        ? entry
        : Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))));
    return fingerprint((left.sources && left.sources[skillName]) || null)
        === fingerprint((right.sources && right.sources[skillName]) || null);
}
/**
 * The target-only path covers stable ordinary sources plus project-owned
 * sources (native or managed copies). It still rejects source graphs whose
 * metadata or selection changed since the warmed catalog snapshot.
 */
function canUseTargetToggle(identity, config, skillName) {
    if (identity === undefined || identity.v1 === undefined)
        return false;
    if (identity.v1.mechanism === 'copy' || identity.v1.mechanism === 'self') {
        return identity.sources.some((source) => source.scope === 'project' && !source.broken && !source.shadow);
    }
    if (identity.v1.mechanism !== 'original')
        return false;
    const selected = config.sources && config.sources[skillName] && typeof config.sources[skillName].source === 'string'
        ? config.sources[skillName].source
        : identity.v1.defaultSourceKey;
    const source = identity.sources.find((candidate) => candidate.key === selected && !candidate.broken && !candidate.generated && !candidate.shadow);
    return source !== undefined && source.scope !== 'bundled' && source.modelInvocable === true;
}
async function cachedIdentityStillCurrent(snapshot, cwd, opts, identity) {
    if (await projectRootSignature(cwd, opts) !== snapshot.rootSignature)
        return false;
    const checks = await Promise.all(identity.sources
        .filter((source) => !source.broken && !source.shadow)
        .map(async (source) => {
        const st = await stat(source.path).catch(() => undefined);
        return st !== undefined && st.isFile() && Math.abs(st.mtimeMs - source.mtimeMs) < 1;
    }));
    return checks.every(Boolean);
}
/**
 * Mutate one project atomically: read view + config, apply the mutator,
 * persist the config, re-reconcile derived artifacts.
 * @param fn - (ctx: { projectRoot, config, identities }) => void|Promise.
 *   May throw ApiError; the config is only persisted after fn succeeds.
 */
async function mutateProject(cwd, opts, fn) {
    const projectRoot = await findProjectRoot(cwd);
    return withConfigLock(projectLockKey(projectRoot), async () => {
        // The whole read -> compute -> persist -> reconcile -> view is one
        // transaction under the project config lock (review P1-1), and the
        // derived-artifact file ops are ledgered so a failed persist rolls
        // them back instead of leaving unregistered copies or losing old
        // verified copies (review P1-4).
        const ledger = createLedger();
        try {
            // Re-read the truth file under the lock: a concurrent mutation
            // committed while this one waited for the lock must be visible
            // before this one computes its changes (review P1-1).
            const locked = await buildProjectView(cwd, opts);
            const config = locked.config;
            const raw = locked.raw;
            const report = locked.report;
            const identities = locked.identities;
            const view = locked.view;
            if (view.projectRoot === null)
                throw new ApiError(400, '当前页没有会话工作区：按项目操作需要项目上下文');
            if (view.configCorrupt === true)
                throw new ApiError(409, `项目配置已损坏（JSON 无法解析）：为避免覆盖无法读取的真相文件，本次未修改任何文件；请修复或删除 ${view.projectRoot}/.dsh/skill-manager.json 后重试`);
            if (view.configFuture === true)
                throw new ApiError(409, `项目配置 apiVersion 高于当前 host 支持的 ${PROJECT_API_VERSION}：为保护未来版本数据，本次未修改任何文件；升级 host 后重试`);
            await fn({ projectRoot: view.projectRoot, config, identities, view, ledger });
            config.updatedAt = new Date().toISOString();
            // Source mutations can create, move or remove the rank-100 copy. Re-scan
            // before reconcile so it never acts on paths from the pre-mutation view.
            const refreshed = await buildIdentityCatalog(cwd, opts, config);
            const report2 = await reconcileProject(view.projectRoot, config, refreshed.identities, opts, opts.logger, ledger);
            const reportAll = {
                created: [...report.created, ...report2.created],
                removed: [...report.removed, ...report2.removed],
                rewritten: [...report.rewritten, ...report2.rewritten],
                conflicts: [...report.conflicts, ...report2.conflicts],
                failed: [...report.failed, ...report2.failed],
            };
            // Persist once, after every planned file side effect and source marker is
            // ready. A failure falls into the catch below and rolls the entire ledger
            // back, so no unregistered copy or mismatched invocation flag survives.
            await writeProjectConfig(view.projectRoot, config, opts, raw);
            const commitFailures = await ledger.commit();
            commitFailures.forEach((f) => reportAll.failed.push({ name: '*', error: `副本备份清理失败：${f}` }));
            const after = await buildProjectView(cwd, opts);
            reportAll.created.push(...after.report.created);
            reportAll.removed.push(...after.report.removed);
            reportAll.rewritten.push(...after.report.rewritten);
            reportAll.conflicts.push(...after.report.conflicts);
            reportAll.failed.push(...after.report.failed);
            const viewAfter = after.view;
            return { view: viewAfter, report: reportAll, config: after.config, identities: after.identities };
        }
        catch (error) {
            const rollbackFailures = await ledger.rollback();
            rollbackFailures.forEach((f) => opts.logger?.warn?.(`skill-manager: 回滚副本失败：${f}`));
            throw error;
        }
    });
}
/**
 * Review P2-3: a reconcile failure is visible, not hidden behind a 200. When
 * the target skill's own file side effect failed (or hit a conflict), the op
 * returns non-2xx so the client stops and shows the real state; other
 * failures/conflicts in the report mark the response partial:true.
 * @returns true when the op response carries partial:true.
 */
function targetReport(skillNames, report) {
    const problems = [...report.failed, ...report.conflicts];
    const nameSet = new Set((Array.isArray(skillNames) ? skillNames : [skillNames]));
    const targetProblems = problems.filter((p) => nameSet.has(p.name));
    if (targetProblems.length > 0) {
        const detail = targetProblems.map((p) => p.error ?? p.message ?? '未知错误').join('；');
        throw new ApiError(500, `未完全生效：${targetProblems.map((p) => p.name).join('、')} 的文件副作用失败（${detail}）；请刷新查看真实状态`);
    }
    return problems.length > 0;
}
/** Serialize the current project config for the API response. */
function configPayload(view, config) {
    return {
        apiVersion: PROJECT_API_VERSION,
        projectRoot: view.projectRoot,
        configExisted: view.configExisted,
        configCorrupt: view.configCorrupt,
        configFuture: view.configFuture === true,
        enabled: config.enabled,
        sources: config.sources,
        appliedPreset: config.appliedPreset,
    };
}
/**
 * Build the request handler for the /api/skill-manager route.
 * @param deps - { agentPresets, logger, home? } — home is an optional test
 *   injection; when absent the real user home is used.
 * @returns (req, res) => Promise<void>
 */
function makeHandler(deps) {
    const opts = {
        agentPresets: deps.agentPresets,
        ...(deps.logger === undefined ? {} : { logger: deps.logger }),
        ...(deps.home === undefined ? {} : { home: deps.home }),
        ...(deps.faults === undefined ? {} : { faults: deps.faults }),
    };
    const marketplace = createMarketplace({
        ...(opts.home === undefined ? {} : { home: opts.home }),
        ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
        ...(deps.marketplace === undefined ? {} : { entries: deps.marketplace }),
        ...(deps.logger === undefined ? {} : { logger: deps.logger }),
    });
    const projectSnapshots = new Map();
    async function rememberProjectSnapshot(cwd, built) {
        if (!built || !built.view || built.view.projectRoot === null || !built.identities || !built.config)
            return;
        if (cwd === undefined)
            return;
        projectSnapshots.set(built.view.projectRoot, {
            view: built.view,
            config: built.config,
            identities: built.identities,
            rootSignature: await projectRootSignature(cwd, opts),
        });
    }
    async function tryTargetToggle(cwd, skillName, enabled) {
        const projectRoot = await findProjectRoot(cwd);
        return withConfigLock(projectLockKey(projectRoot), async () => {
            const snapshot = projectSnapshots.get(projectRoot);
            if (snapshot === undefined)
                return { value: null, reason: 'snapshot-missing' };
            const read = await readProjectConfig(projectRoot, opts);
            if (read.corrupt === true)
                throw new ApiError(409, `项目配置已损坏（JSON 无法解析）：为避免覆盖无法读取的真相文件，本次未修改任何文件；请修复或删除 ${projectRoot}/.dsh/skill-manager.json 后重试`);
            if (read.future === true)
                throw new ApiError(409, `项目配置 apiVersion 高于当前 host 支持的 ${PROJECT_API_VERSION}：为保护未来版本数据，本次未修改任何文件；升级 host 后重试`);
            const identity = snapshot.identities.get(skillName);
            if (!canUseTargetToggle(identity, read.config, skillName))
                return { value: null, reason: 'target-ineligible' };
            if (!sameTargetSourceConfig(snapshot.config, read.config, skillName))
                return { value: null, reason: 'source-selection-changed' };
            if (identity === undefined || !(await cachedIdentityStillCurrent(snapshot, cwd, opts, identity)))
                return { value: null, reason: 'source-tree-changed' };
            const currentRow = snapshot.view.identities.find((row) => row.name === skillName);
            if (currentRow === undefined)
                return { value: null, reason: 'row-missing' };
            const ledger = createLedger();
            try {
                const config = read.config;
                const enabledSet = new Set(config.enabled);
                if (enabled)
                    enabledSet.add(skillName);
                else
                    enabledSet.delete(skillName);
                config.enabled = [...enabledSet].sort((a, b) => a.localeCompare(b));
                config.updatedAt = new Date().toISOString();
                const report = await reconcileProject(projectRoot, config, new Map([[skillName, identity]]), opts, opts.logger, ledger, { sweepOrphans: false });
                // A target failure aborts before the truth file is persisted, allowing
                // the ledger to restore the exact pre-click state.
                targetReport(skillName, report);
                await writeProjectConfig(projectRoot, config, opts, read.raw);
                const commitFailures = await ledger.commit();
                commitFailures.forEach((failure) => report.failed.push({ name: '*', error: `副本备份清理失败：${failure}` }));
                let rowSources = currentRow.sources;
                if (identity.v1 !== undefined && (identity.v1.mechanism === 'copy' || identity.v1.mechanism === 'self')) {
                    const effective = identity.sources.find((source) => source.key === identity.v1.effectiveSourceKey && source.scope === 'project' && !source.broken && !source.shadow);
                    if (effective !== undefined) {
                        const effectiveStat = await stat(effective.path).catch(() => undefined);
                        effective.modelInvocable = enabled;
                        if (effectiveStat !== undefined)
                            effective.mtimeMs = effectiveStat.mtimeMs;
                        rowSources = currentRow.sources.map((source) => source.key === effective.key
                            ? Object.assign({}, source, { modelInvocable: enabled, mtimeMs: effective.mtimeMs })
                            : source);
                    }
                }
                const row = Object.assign({}, currentRow, { sources: rowSources, enabled, modelInvocable: enabled });
                if (identity.v1 !== undefined) {
                    identity.v1.enabled = enabled;
                    identity.v1.modelInvocable = enabled;
                }
                snapshot.view = Object.assign({}, snapshot.view, {
                    identities: snapshot.view.identities.map((candidate) => candidate.name === skillName ? row : candidate),
                });
                snapshot.config = config;
                snapshot.rootSignature = await projectRootSignature(cwd, opts);
                return { value: { name: skillName, enabled, partial: report.failed.length > 0 || report.conflicts.length > 0, view: row, report, fastPath: true }, reason: null };
            }
            catch (error) {
                projectSnapshots.delete(projectRoot);
                const rollbackFailures = await ledger.rollback();
                rollbackFailures.forEach((failure) => opts.logger?.warn?.(`skill-manager: 快速开关回滚失败：${failure}`));
                throw error;
            }
        });
    }
    const ops = {
        async capabilities() {
            return {
                apiVersion: PROJECT_API_VERSION,
                features: ['project-enable', 'unified-catalog', 'tags', 'presets', 'slim', 'marketplace'],
            };
        },
        async marketplace(body) {
            return marketplace.list(body.cwd, body.force === true);
        },
        async ['marketplace.detail'](body) {
            if (typeof body.id !== 'string' || body.id === '')
                throw new ApiError(400, '缺少市场条目 id');
            return marketplace.detail(body.id, body.cwd, body.force === true);
        },
        async ['marketplace.preview'](body) {
            if (typeof body.id !== 'string' || body.id === '')
                throw new ApiError(400, '缺少市场条目 id');
            return marketplace.preview(body.id, body.cwd);
        },
        async ['marketplace.install'](body) {
            if (typeof body.id !== 'string' || body.id === '')
                throw new ApiError(400, '缺少市场条目 id');
            return marketplace.install(body.id, body.cwd);
        },
        async list(body) {
            const cwd = await assertCwd(body.cwd);
            const { roots, projectRoot } = await computeRoots(cwd, opts);
            // Legacy policy enforcement (idempotent, no-op unless the policy
            // is on). V1 project state is reconciled by the new ops.
            const enforcement = await withConfigLock(globalLockKey(opts), () => enforceGlobalPolicy(cwd, opts)).catch((e) => ({ changed: 0, markersRemoved: 0, failed: [{ error: e instanceof Error ? e.message : String(e) }] }));
            if (enforcement.failed !== undefined && enforcement.failed.length > 0) {
                deps.logger?.warn?.(`skill-manager: policy enforcement skipped ${enforcement.failed.length} file(s): ${enforcement.failed.map((f) => `${'name' in f ? f.name : '*'} (${f.error})`).join('; ')}`);
            }
            const policy = await readPolicyState(opts);
            const out = [];
            for (const root of roots) {
                const result = await discoverInRoot(root.dir);
                const skills = root.scope === 'global'
                    ? result.skills.map((skill) => ({ ...skill, readOnly: true }))
                    : result.skills;
                out.push({ id: root.id, scope: root.scope, label: root.label, dir: root.dir, rank: root.rank, exists: result.exists, skills });
            }
            const bundled = await discoverBundled(deps.agentPresets, opts);
            const byName = new Map();
            for (const root of out)
                for (const skill of root.skills) {
                    if (skill.broken)
                        continue;
                    const list = byName.get(skill.name) ?? [];
                    list.push({ rank: root.rank, ...(skill.modelInvocable === undefined ? {} : { modelInvocable: skill.modelInvocable }), label: root.label });
                    byName.set(skill.name, list);
                }
            for (const group of bundled)
                for (const skill of group.skills) {
                    if (skill.broken)
                        continue;
                    const list = byName.get(skill.name) ?? [];
                    list.push({ rank: RANKS.bundled, ...(skill.modelInvocable === undefined ? {} : { modelInvocable: skill.modelInvocable }), label: group.label });
                    byName.set(skill.name, list);
                }
            const winnerFor = (skill) => {
                const list = byName.get(skill.name);
                if (list === undefined)
                    return undefined;
                let best = list[0];
                for (const cand of list)
                    if (best === undefined || cand.rank < best.rank)
                        best = cand;
                return best;
            };
            const mark = (skills, ownRank) => {
                for (const skill of skills) {
                    const winner = winnerFor(skill);
                    if (winner === undefined)
                        continue;
                    Object.assign(skill, {
                        ...(winner.rank < ownRank ? { shadowedBy: winner.label } : {}),
                        disabled: winner.modelInvocable === false,
                    });
                }
            };
            for (const root of out)
                mark(root.skills, root.rank);
            for (const group of bundled)
                mark(group.skills, RANKS.bundled);
            // apiVersion 6 = V1 project config, unified catalog, tags,
            // presets (DSH-008). Legacy fields are unchanged for old clients.
            return { apiVersion: PROJECT_API_VERSION, cwd: cwd ?? null, projectRoot, policy, roots: out, bundled };
        },
        async read(body) {
            const cwd = await assertCwd(body.cwd);
            const plan = await resolveTarget(opts.agentPresets, cwd, body.root, body.name, false, opts);
            await assertContained(plan);
            const content = await readFile(plan.path, 'utf8');
            return { name: body.name, root: plan.rootId, readOnly: plan.readOnly, path: plan.path, format: plan.existing, content };
        },
        async save(body) {
            const cwd = await assertCwd(body.cwd);
            const plan = await resolveTarget(opts.agentPresets, cwd, body.root, body.name, true, opts);
            await assertContained(plan);
            if (plan.readOnly) {
                throw new ApiError(403, plan.readOnlyReason === 'external'
                    ? '外部全局 skill 只读（属于 Codex / Claude Code 等工具）：在此修改会直接影响该工具自身，请改在其原目录操作'
                    : '内置 skill 只读：部署升级会覆盖它，请改用导入创建自己的版本');
            }
            parseSkill(typeof body.content === 'string' ? body.content : '');
            const tmp = `${plan.path}.tmp-${randomUUID()}`;
            await mkdir(dirname(plan.path), { recursive: true });
            try {
                await writeFile(tmp, body.content, 'utf8');
                await rename(tmp, plan.path);
            }
            finally {
                await rm(tmp, { force: true }).catch(() => { });
            }
            return { path: plan.path };
        },
        async delete(body) {
            const cwd = await assertCwd(body.cwd);
            const plan = await resolveTarget(opts.agentPresets, cwd, body.root, body.name, false, opts);
            await assertContained(plan);
            if (plan.readOnly) {
                throw new ApiError(403, plan.readOnlyReason === 'external' ? '外部全局 skill 只读，不能从此处删除' : '内置 skill 只读，不能删除');
            }
            if (plan.existing === 'dir') {
                await rm(join(plan.dir, String(body.name)), { recursive: true, force: false });
            }
            else if (plan.existing === 'flat') {
                await unlink(plan.path);
            }
            else {
                throw new ApiError(404, `skill 不存在：${body.name}`);
            }
            return { deleted: body.name };
        },
        /**
         * Legacy per-project enable/disable (file-mechanism direct ops).
         * Kept unchanged for old clients; the V1 UI uses setEnabled.
         */
        async setStatus(body) {
            const cwd = await assertCwd(body.cwd);
            if (cwd === undefined)
                throw new ApiError(400, '当前页没有会话工作区：按项目开关需要项目上下文');
            const name0 = typeof body.name === 'string' ? body.name : '';
            if (!NAME_RE.test(name0))
                throw new ApiError(400, `skill 名不合法：${String(body.name)}`);
            const wantDisabled = body.disabled === true;
            const { roots, projectRoot } = await computeRoots(cwd, opts);
            if (projectRoot === null)
                throw new ApiError(400, '当前页没有会话工作区：按项目开关需要项目上下文');
            const plan = await resolveTarget(opts.agentPresets, cwd, body.root, name0, false, opts);
            await assertContained(plan);
            const isProjectScope = plan.rootId === 'project-dsh' || plan.rootId === 'project-agents';
            if (isProjectScope) {
                if (plan.existing === 'flat' && (await isShadowFile(plan.path))) {
                    if (wantDisabled)
                        return { name: name0, disabled: true, changed: false, where: 'shadow', path: plan.path };
                    await unlink(plan.path);
                    return { name: name0, disabled: false, changed: true, where: 'shadow', path: plan.path };
                }
                const raw = await readFile(plan.path, 'utf8');
                const { content, changed } = patchInvocationFlag(raw, wantDisabled);
                if (changed) {
                    const tmp = `${plan.path}.tmp-${randomUUID()}`;
                    try {
                        await writeFile(tmp, content, 'utf8');
                        await rename(tmp, plan.path);
                    }
                    finally {
                        await rm(tmp, { force: true }).catch(() => { });
                    }
                }
                return { name: name0, disabled: wantDisabled, changed, where: 'self', path: plan.path };
            }
            const state = await readPolicyState(opts);
            const isUserScope = plan.rootId === 'user-dsh' || plan.rootId === 'user-agents';
            if (isUserScope && state.globalDefaultOff) {
                const proj = await findProjectSkill(cwd, name0, opts);
                if (proj !== undefined && proj.marker)
                    await unlink(proj.plan.path).catch(() => { });
                const copyPlan = proj !== undefined && proj.marker === false ? proj.plan : undefined;
                if (wantDisabled) {
                    const raw = await readFile(plan.path, 'utf8');
                    const { content, changed: ch0 } = patchInvocationFlag(raw, true);
                    let changed = ch0;
                    if (ch0)
                        await atomicWriteFile(plan.path, content);
                    if (copyPlan !== undefined) {
                        const cRaw = await readFile(copyPlan.path, 'utf8').catch(() => undefined);
                        if (cRaw !== undefined) {
                            const c = patchInvocationFlag(cRaw, true);
                            if (c.changed) {
                                await atomicWriteFile(copyPlan.path, c.content);
                                changed = true;
                            }
                        }
                    }
                    return { name: name0, disabled: true, where: copyPlan !== undefined ? 'copy' : 'policy', changed, path: copyPlan !== undefined ? copyPlan.path : plan.path };
                }
                if (copyPlan !== undefined) {
                    const cRaw = await readFile(copyPlan.path, 'utf8').catch(() => undefined);
                    if (cRaw !== undefined) {
                        const c = patchInvocationFlag(cRaw, false);
                        if (c.changed)
                            await atomicWriteFile(copyPlan.path, c.content);
                        return { name: name0, disabled: false, where: 'copy', changed: c.changed, path: copyPlan.path };
                    }
                }
                if (plan.existing === undefined)
                    throw new ApiError(404, `skill 不存在：${name0}`);
                const dest = await copySkillToProject(projectRoot, name0, { path: plan.path, format: plan.existing }, false);
                return { name: name0, disabled: false, where: 'copy', created: true, changed: true, path: dest };
            }
            const shadowDir = join(projectRoot, '.dsh', 'skills');
            const shadowPath = join(shadowDir, `${name0}.md`);
            for (const root of roots) {
                if (root.scope !== 'project')
                    continue;
                const probe = await resolveTarget(opts.agentPresets, cwd, root.id, name0, false, opts).catch(() => undefined);
                if (probe === undefined)
                    continue;
                if (probe.existing === 'flat' && probe.path === shadowPath && (await isShadowFile(shadowPath)))
                    continue; // our own switch
                throw new ApiError(409, `本项目已有同名 skill「${name0}」（${root.label}）：它的优先级更高，请在那一行上直接开关`);
            }
            const existingShadow = await readFile(shadowPath, 'utf8').catch(() => undefined);
            const ownShadow = existingShadow !== undefined && (await isShadowFile(shadowPath));
            if (wantDisabled) {
                if (ownShadow)
                    return { name: name0, disabled: true, changed: false, where: 'shadow', path: shadowPath };
                const content = markerContent(name0, projectRoot);
                const tmp = `${shadowPath}.tmp-${randomUUID()}`;
                await mkdir(shadowDir, { recursive: true });
                try {
                    await writeFile(tmp, content, 'utf8');
                    await rename(tmp, shadowPath);
                }
                finally {
                    await rm(tmp, { force: true }).catch(() => { });
                }
                return { name: name0, disabled: true, changed: true, where: 'shadow', path: shadowPath };
            }
            if (!ownShadow)
                return { name: name0, disabled: false, changed: false, where: 'shadow', path: shadowPath };
            await unlink(shadowPath);
            return { name: name0, disabled: false, changed: true, where: 'shadow', path: shadowPath };
        },
        /** Read the legacy global default-off policy state. */
        async getPolicy() {
            return await readPolicyState(opts);
        },
        /** Toggle the legacy global default-off policy. */
        async setPolicy(body) {
            const cwd = await assertCwd(body.cwd);
            const want = body.globalDefaultOff === true;
            return withConfigLock(globalLockKey(opts), async () => {
                const state = await readPolicyState(opts);
                if (state.globalDefaultOff === want)
                    return { ...state, changed: 0, markersRemoved: 0 };
                await writePolicyState({ globalDefaultOff: want }, opts);
                const report = want
                    ? await enforceGlobalPolicy(cwd, opts).catch((e) => ({ changed: 0, markersRemoved: 0, failed: [{ error: e instanceof Error ? e.message : String(e) }] }))
                    : { changed: 0, markersRemoved: 0, failed: [] };
                return { globalDefaultOff: want, changed: report.changed, markersRemoved: report.markersRemoved, failed: report.failed };
            });
        },
        /* `import` is a reserved word; the API op name stays "import". */
        async ['import'](body) {
            const cwd = await assertCwd(body.cwd);
            if (typeof body.content !== 'string')
                throw new ApiError(400, '缺少 content');
            const parsed = parseSkill(body.content);
            if (typeof body.root !== 'string' || body.root.startsWith('bundled:'))
                throw new ApiError(400, '导入目标必须是项目级或用户级根目录');
            const plan = await resolveTarget(opts.agentPresets, cwd, body.root, parsed.name, true, opts);
            await assertContained(plan);
            if (plan.existing !== undefined)
                throw new ApiError(409, `skill 已存在：${parsed.name}`);
            const path = join(plan.dir, parsed.name, 'SKILL.md');
            await assertContained({ dir: plan.dir, path });
            const tmp = `${path}.tmp-${randomUUID()}`;
            await mkdir(dirname(path), { recursive: true });
            try {
                await writeFile(tmp, body.content, 'utf8');
                await rename(tmp, path);
            }
            finally {
                await rm(tmp, { force: true }).catch(() => { });
            }
            return { name: parsed.name, path };
        },
        /** Export one or more skills as a single ZIP (binary response). */
        async exportZip(body) {
            const cwd = await assertCwd(body.cwd);
            if (typeof body.root !== 'string')
                throw new ApiError(400, '缺少 root');
            const names = Array.isArray(body.names)
                ? [...new Set(body.names.filter((n) => typeof n === 'string' && NAME_RE.test(n)))]
                : [];
            if (names.length === 0)
                throw new ApiError(400, 'names 不能为空');
            const MAX_BYTES = 50 * 1024 * 1024;
            const MAX_FILES = 2000;
            const entries = [];
            let totalBytes = 0;
            for (const skillName of names) {
                const plan = await resolveTarget(opts.agentPresets, cwd, body.root, skillName, false, opts);
                await assertContained(plan);
                let files;
                let base;
                if (plan.existing === 'flat') {
                    files = [plan.path];
                    base = '';
                }
                else if (plan.existing === 'dir') {
                    base = `${skillName}/`;
                    files = await walkSkillFiles(dirname(plan.path));
                    if (files.length === 0)
                        files = [plan.path]; // SKILL.md vanished mid-walk
                }
                else {
                    throw new ApiError(404, `skill 不存在：${skillName}`);
                }
                for (const file of files) {
                    const data = await readFile(file);
                    totalBytes += data.length;
                    if (totalBytes > MAX_BYTES)
                        throw new ApiError(413, '导出内容超过 50MB 上限');
                    if (entries.length >= MAX_FILES)
                        throw new ApiError(413, '导出文件数超过上限');
                    const inner = base === ''
                        ? `${skillName}.md`
                        : `${base}${relative(dirname(plan.path), file).split(sep).join('/')}`;
                    entries.push({ name: inner, data });
                }
            }
            const slug = names.length === 1 ? names[0] : `${names[0].split('-')[0]}-${names.length}-skills`;
            return { __zip: buildZip(entries), filename: `${slug}.zip` };
        },
        // ── V1 ops (DSH-008) ──────────────────────────────────────────────────
        /** Merged identity catalog for one project context (runs reconcile). */
        async catalog(body) {
            const cwd = await assertCwd(body.cwd);
            const built = await buildProjectViewLocked(cwd, opts);
            const { config: globalConfig } = await readGlobalConfig(opts);
            const allTags = [...new Set(Object.values(globalConfig.tags || {}).flat())].sort((a, b) => a.localeCompare(b));
            const view = Object.assign({}, built.view, { allTags });
            await rememberProjectSnapshot(cwd, Object.assign({}, built, { view }));
            return view;
        },
        /** Project config + last reconcile report. */
        async projectState(body) {
            const cwd = await assertCwd(body.cwd);
            const { view, config, report } = await buildProjectViewLocked(cwd, opts);
            return Object.assign(configPayload(view, config), { report });
        },
        /** Enable or disable one skill for this project. */
        async setEnabled(body) {
            const cwd = await assertCwd(body.cwd);
            if (cwd === undefined)
                throw new ApiError(400, '当前页没有会话工作区：按项目开关需要项目上下文');
            const skillName = typeof body.name === 'string' ? body.name : '';
            if (!NAME_RE.test(skillName))
                throw new ApiError(400, `skill 名不合法：${String(body.name)}`);
            const enabled = body.enabled === true;
            const fast = await tryTargetToggle(cwd, skillName, enabled);
            if (fast.value !== null)
                return fast.value;
            const built = await mutateProject(cwd, opts, async (ctx) => {
                if (!ctx.identities.has(skillName))
                    throw new ApiError(404, `skill 不存在：${skillName}`);
                const set = new Set(ctx.config.enabled);
                if (enabled)
                    set.add(skillName);
                else
                    set.delete(skillName);
                ctx.config.enabled = [...set].sort((a, b) => a.localeCompare(b));
            });
            const { view, report } = built;
            await rememberProjectSnapshot(cwd, built);
            const partial = targetReport(skillName, report);
            return { name: skillName, enabled, partial, view: summarizeIdentity(view, skillName), report, fastPath: false, fastPathReason: fast.reason };
        },
        /** Bulk enable/disable for this project. */
        async setMany(body) {
            const cwd = await assertCwd(body.cwd);
            if (cwd === undefined)
                throw new ApiError(400, '当前页没有会话工作区：按项目开关需要项目上下文');
            const names = Array.isArray(body.names)
                ? [...new Set(body.names.filter((n) => typeof n === 'string' && NAME_RE.test(n)))]
                : [];
            if (names.length === 0)
                throw new ApiError(400, 'names 不能为空');
            const enabled = body.enabled === true;
            const { report } = await mutateProject(cwd, opts, async (ctx) => {
                const missing = names.filter((n) => !ctx.identities.has(n));
                if (missing.length > 0)
                    throw new ApiError(404, `skill 不存在：${missing.join('、')}`);
                const set = new Set(ctx.config.enabled);
                for (const n of names) {
                    if (enabled)
                        set.add(n);
                    else
                        set.delete(n);
                }
                ctx.config.enabled = [...set].sort((a, b) => a.localeCompare(b));
            });
            const partial = targetReport(names, report);
            return { names, enabled, partial, report };
        },
        /** Explicitly select (or reset) the source used by this project. */
        async setSource(body) {
            const cwd = await assertCwd(body.cwd);
            if (cwd === undefined)
                throw new ApiError(400, '当前页没有会话工作区：来源选择需要项目上下文');
            const skillName = typeof body.name === 'string' ? body.name : '';
            if (!NAME_RE.test(skillName))
                throw new ApiError(400, `skill 名不合法：${String(body.name)}`);
            const sourceKey = body.source === null || body.source === undefined || body.source === '' ? null : String(body.source);
            const { view, report } = await mutateProject(cwd, opts, async (ctx) => {
                const identity = ctx.identities.get(skillName);
                if (identity === undefined)
                    throw new ApiError(404, `skill 不存在：${skillName}`);
                await applySourceSelection(ctx.projectRoot, ctx.config, identity, sourceKey, deps, deps.logger, ctx.ledger);
            });
            const partial = targetReport(skillName, report);
            return { name: skillName, source: sourceKey, partial, view: summarizeIdentity(view, skillName), report };
        },
        /** Global tags for one skill identity (validates identity exists). */
        async setTags(body) {
            const cwd = await assertCwd(body.cwd);
            const skillName = typeof body.name === 'string' ? body.name : '';
            if (!NAME_RE.test(skillName))
                throw new ApiError(400, `skill 名不合法：${String(body.name)}`);
            const tags = validateTagList(body.tags);
            const { view } = await buildProjectViewLocked(cwd, opts);
            if (!view.identities.some((i) => i.name === skillName))
                throw new ApiError(404, `skill 不存在：${skillName}`);
            await withConfigLock(globalLockKey(opts), async () => {
                const { config } = await readGlobalConfig(opts);
                const next = normalizeTagsMap(config.tags);
                if (tags.length > 0)
                    next[skillName] = tags;
                else
                    delete next[skillName];
                await writeGlobalConfig({ tags: next }, opts);
            });
            const { view: viewAfter } = await buildProjectViewLocked(cwd, opts);
            return { name: skillName, tags, view: summarizeIdentity(viewAfter, skillName) };
        },
        /** List presets (global, cross-project). */
        async ['presets.list']() {
            const { config } = await readGlobalConfig(opts);
            const presets = Object.values(config.presets || {}).map((p) => ({
                name: p.name,
                description: p.description,
                defaultSlim: p.defaultSlim === true,
                skillCount: Object.keys(p.skills || {}).length,
                updatedAt: p.updatedAt,
            }));
            return { presets };
        },
        /** Save the current project's enabled set + source selections as a preset. */
        async ['presets.save'](body) {
            const cwd = await assertCwd(body.cwd);
            const presetName = assertPresetName(body.name);
            const { view, config } = await buildProjectViewLocked(cwd, opts);
            const skills = {};
            for (const n of config.enabled) {
                if (!view.identities.some((i) => i.name === n))
                    continue;
                const sel = config.sources[n];
                skills[n] = sel && typeof sel.source === 'string' ? { source: sel.source } : {};
            }
            return withConfigLock(globalLockKey(opts), async () => {
                const { config: g } = await readGlobalConfig(opts);
                const presets = normalizePresetsMap(g.presets);
                const existed = presets[presetName] !== undefined;
                presets[presetName] = {
                    name: presetName,
                    ...(typeof body.description === 'string' && body.description.trim().length > 0 ? { description: body.description.trim().slice(0, 200) } : {}),
                    defaultSlim: presets[presetName]?.defaultSlim === true,
                    skills,
                    updatedAt: new Date().toISOString(),
                };
                await writeGlobalConfig({ presets }, opts);
                return { name: presetName, existed, skillCount: Object.keys(skills).length };
            });
        },
        /** Delete a preset. */
        async ['presets.delete'](body) {
            const presetName = assertPresetName(body.name);
            return withConfigLock(globalLockKey(opts), async () => {
                const { config } = await readGlobalConfig(opts);
                const presets = normalizePresetsMap(config.presets);
                if (presets[presetName] === undefined)
                    throw new ApiError(404, `预设不存在：${presetName}`);
                delete presets[presetName];
                await writeGlobalConfig({ presets }, opts);
                return { name: presetName };
            });
        },
        /** Mark (or clear) the default slim preset (at most one). */
        async ['presets.setDefault'](body) {
            return withConfigLock(globalLockKey(opts), async () => {
                const { config } = await readGlobalConfig(opts);
                const presets = normalizePresetsMap(config.presets);
                for (const p of Object.values(presets))
                    p.defaultSlim = false;
                if (body.name !== null && body.name !== undefined && body.name !== '') {
                    const presetName = assertPresetName(body.name);
                    if (presets[presetName] === undefined)
                        throw new ApiError(404, `预设不存在：${presetName}`);
                    presets[presetName].defaultSlim = true;
                }
                await writeGlobalConfig({ presets }, opts);
                return { defaultSlim: body.name === null || body.name === undefined || body.name === '' ? null : assertPresetName(body.name) };
            });
        },
        /** Preview applying a preset (accurate diff; nothing is written). */
        async ['presets.preview'](body) {
            const cwd = await assertCwd(body.cwd);
            const presetName = assertPresetName(body.name);
            const mode = body.mode === 'merge' ? 'merge' : 'replace';
            const { view, config } = await buildProjectViewLocked(cwd, opts);
            const { config: g } = await readGlobalConfig(opts);
            const preset = normalizePresetsMap(g.presets)[presetName];
            if (preset === undefined)
                throw new ApiError(404, `预设不存在：${presetName}`);
            const diff = presetDiff(config, preset, view.identities, mode);
            return { preset: presetName, mode, diff };
        },
        /** Apply a preset after preview (replace or merge). */
        async ['presets.apply'](body) {
            const cwd = await assertCwd(body.cwd);
            if (cwd === undefined)
                throw new ApiError(400, '当前页没有会话工作区：应用预设需要项目上下文');
            const presetName = assertPresetName(body.name);
            const mode = body.mode === 'merge' ? 'merge' : 'replace';
            const { config: g } = await readGlobalConfig(opts);
            const preset = normalizePresetsMap(g.presets)[presetName];
            if (preset === undefined)
                throw new ApiError(404, `预设不存在：${presetName}`);
            const { view, report } = await mutateProject(cwd, opts, async (ctx) => {
                const missing = Object.keys(preset.skills).filter((n) => !ctx.identities.has(n));
                if (missing.length > 0)
                    throw new ApiError(404, `预设中的 skill 不存在：${missing.join('、')}`);
                const set = new Set(ctx.config.enabled);
                if (mode === 'replace')
                    set.clear();
                for (const n of Object.keys(preset.skills))
                    set.add(n);
                ctx.config.enabled = [...set].sort((a, b) => a.localeCompare(b));
                ctx.config.appliedPreset = presetName;
                // Source selections from the preset (null = keep current/default).
                for (const [n, sel] of Object.entries(preset.skills)) {
                    const sourceKey = sel && typeof sel.source === 'string' ? sel.source : null;
                    const current = ctx.config.sources[n];
                    if (current && current.source === sourceKey)
                        continue;
                    if (sourceKey === null && current === undefined)
                        continue;
                    const identity = ctx.identities.get(n);
                    if (identity === undefined)
                        throw new ApiError(404, `skill 不存在：${n}`);
                    await applySourceSelection(ctx.projectRoot, ctx.config, identity, sourceKey, deps, deps.logger, ctx.ledger);
                }
            });
            const partial = targetReport(Object.keys(preset.skills), report);
            return { preset: presetName, mode, partial, view, report };
        },
        /** 一键精简 preview: default slim preset, or "disable all" when none. */
        async ['slim.preview'](body) {
            const cwd = await assertCwd(body.cwd);
            const { view, config } = await buildProjectViewLocked(cwd, opts);
            const { config: g } = await readGlobalConfig(opts);
            const presets = normalizePresetsMap(g.presets);
            const def = Object.values(presets).find((p) => p.defaultSlim === true) || null;
            if (def !== null) {
                const diff = presetDiff(config, def, view.identities, 'replace');
                return { kind: 'preset', preset: def.name, mode: 'replace', diff };
            }
            return {
                kind: 'all',
                preset: null,
                mode: 'replace',
                diff: {
                    toEnable: [],
                    toDisable: [...config.enabled],
                    sourceChanges: [],
                    finalEnabled: [],
                },
            };
        },
        /** 一键精简 apply: apply the default slim preset, or disable all. */
        async ['slim.apply'](body) {
            const cwd = await assertCwd(body.cwd);
            if (cwd === undefined)
                throw new ApiError(400, '当前页没有会话工作区：一键精简需要项目上下文');
            const { config: g } = await readGlobalConfig(opts);
            const presets = normalizePresetsMap(g.presets);
            const def = Object.values(presets).find((p) => p.defaultSlim === true) || null;
            if (def !== null) {
                return ops['presets.apply']({ cwd, name: def.name, mode: 'replace' });
            }
            const { view, report } = await mutateProject(cwd, opts, async (ctx) => {
                ctx.config.enabled = [];
                ctx.config.appliedPreset = null;
            });
            const partial = targetReport([], report);
            return { preset: null, mode: 'all', partial, view, report };
        },
    };
    return async (req, res) => {
        const send = (status, obj) => {
            res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
            res.end(JSON.stringify(obj));
        };
        try {
            if (req.method !== 'POST') {
                send(405, { ok: false, error: { message: 'method not allowed' } });
                return;
            }
            const chunks = [];
            let bytes = 0;
            for await (const chunk of req) {
                bytes += chunk.length;
                if (bytes > 8 * 1024 * 1024)
                    throw new ApiError(413, '请求体过大');
                chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            let body;
            try {
                const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                body = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
            }
            catch {
                send(400, { ok: false, error: { message: '请求体不是合法 JSON' } });
                return;
            }
            const op = body.op;
            const fn = typeof op === 'string' && Object.prototype.hasOwnProperty.call(ops, op) ? ops[op] : undefined;
            if (typeof fn !== 'function') {
                send(400, { ok: false, error: { message: `未知操作：${String(op)}` } });
                return;
            }
            const value = await fn(body);
            if (value !== null && typeof value === 'object' && '__zip' in value && Buffer.isBuffer(value.__zip) && 'filename' in value && typeof value.filename === 'string') {
                const zipValue = value;
                res.writeHead(200, {
                    'content-type': 'application/zip',
                    'content-disposition': `attachment; filename="${zipValue.filename}"`,
                    'content-length': zipValue.__zip.length,
                    'cache-control': 'no-store',
                });
                res.end(zipValue.__zip);
                return;
            }
            send(200, { ok: true, value });
        }
        catch (error) {
            const status = error instanceof ApiError ? error.status : 500;
            const message = error instanceof Error ? error.message : String(error);
            if (status === 500)
                deps.logger?.warn?.(`skill-manager: ${error instanceof Error ? error.stack : message}`);
            send(status, { ok: false, error: { message } });
        }
    };
}
/** Pull one identity out of a view for compact responses. */
function summarizeIdentity(view, skillName) {
    return view.identities.find((i) => i.name === skillName) ?? null;
}
/**
 * Register the skill-manager HTTP route on the web server.
 * @param ctx - the plugin context.
 */
function apply(ctx) {
    const webServer = ctx.get('webServer');
    if (webServer === undefined)
        return; // non-web surface: nothing to serve
    const agentPresets = ctx.get('agentPresets');
    const handler = makeHandler({ agentPresets, ...(ctx.logger === undefined ? {} : { logger: ctx.logger }) });
    ctx.effect(() => webServer.register({ kind: 'exact', path: '/api/skill-manager', handler }), 'skill-manager: web route');
}
export { name, inject, apply };
export const internals = {
    // legacy surface (kept for compatibility & tests)
    parseSkill,
    patchInvocationFlag,
    isShadowFile,
    findProjectRoot,
    computeRoots,
    readPolicyState,
    writePolicyState,
    atomicWriteFile,
    policyWrite,
    findUserSkill,
    findProjectSkill,
    markerContent,
    copySkillToProject,
    enforceGlobalPolicy,
    discoverInRoot,
    discoverBundled,
    makeHandler,
    resolveTarget,
    RANKS,
    SHADOW_DESC_PREFIX,
    SHADOW_STUB_PREFIX,
    shadowStubPath,
    STATE_PATH,
    buildZip,
    createMarketplace,
    // V1 surface (DSH-008)
    ApiError,
    NAME_RE,
    PROJECT_API_VERSION,
    projectConfigPath,
    globalConfigPath,
    readProjectConfig,
    writeProjectConfig,
    readGlobalConfig,
    writeGlobalConfig,
    validateTagList,
    normalizeTagsMap,
    normalizePresetsMap,
    assertPresetName,
    walkSkillFiles,
    reconcileProject,
    applySourceSelection,
    buildProjectView,
    buildIdentityCatalog,
};
//# sourceMappingURL=index.js.map