/**
 * dsh-skill-manager — host half.
 *
 * A web-profile plugin exposing a JSON HTTP API (`/api/skill-manager`) over
 * skill files on disk: list / read / save / delete / import / export across
 * the four project+user skill roots, with read-only access to skills bundled
 * in agent presets. The browser half (`./client`) renders the Settings
 * section that talks to this API.
 *
 * Zero bare dependencies: node: builtins only. Skill frontmatter is parsed
 * with a minimal built-in parser (name/description/whenToUse scalars, block
 * scalars supported) so the plugin never needs a YAML dependency.
 *
 * Roots (mirroring @deepseek-ai/dsh-skill-filesystem):
 *   project: <projectRoot>/.dsh/skills      <projectRoot>/.agents/skills
 *   user:    ~/.dsh/skills          ~/.agents/skills
 * Each root holds directory bundles `<name>/SKILL.md` and flat `<name>.md`
 * files. Preset-bundled skills live in `<preset dir>/skills/` and are
 * read-only here (a deployment upgrade overwrites them).
 *
 * Per-project enable/disable (apiVersion 4):
 *   - projectRoot mirrors DSH's findProjectRoot (walk up for .git, else cwd).
 *   - A project's own skill: its frontmatter flag `disable-model-invocation`
 *     is toggled in place (atomic rewrite, byte-preserving otherwise).
 *   - A user/bundled skill: a project-level shadow file
 *     `<projectRoot>/.dsh/skills/<name>.md` (rank 100 outranks user 400/500
 *     and bundled 600; visible only to sessions rooted in this project)
 *     carries `disable-model-invocation: true` — the native DSH invocation
 *     policy that removes the skill from the model catalog (tool-skill
 *     filters on modelInvocable). Deleting the shadow re-enables.
 *
 * Global default-off policy (apiVersion 5):
 *   - State file `~/.dsh/skill-manager.json` { globalDefaultOff }.
 *   - ON: every USER-root skill file carries the disable flag (bundled
 *     preset skills and external global roots are never touched — e.g. the
 *     cordis built-ins stay enabled). list() re-enforces on every load, so
 *     newly added user skills default to off as well.
 *   - Enabling a user skill inside a project then means a project-local
 *     copy (rank 100, flag removed) — DSH resolution is file-based, so a
 *     project can only see what physically exists in its roots. Disabling
 *     it again re-flags the copy in place (content is never deleted).
 *   - Turning the policy OFF never rewrites previously flagged files;
 *     individual switches (or package bulk toggles) restore them.
 *   - Bundled and external-global skills keep the marker-shadow mechanism
 *     (their files cannot be modified here). Legacy markers whose original
 *     is a now-globally-off user skill are removed during enforcement.
 */
import { mkdir, readFile, readdir, realpath, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';

/** Stable Cordis plugin name (host half). */
const name = 'skill-manager';
/** Wait for both host services before applying on a cold web-profile boot. */
const inject = ['webServer', 'agentPresets'];
/** DSH skill-name grammar: kebab-case. */
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Precedence ranks mirroring dsh-skill-filesystem (lower wins). */
const RANKS = { 'project-dsh': 100, 'project-agents': 200, global: 300, 'user-dsh': 400, 'user-agents': 500, bundled: 600 };
/** External agent user-level skill roots, listed read-only (see cordis.patch.yml). */
const GLOBAL_ROOTS = [
	{ id: 'global-codex', label: '全局 · ~/.codex/skills', dir: join(homedir(), '.codex', 'skills') },
	{ id: 'global-claude', label: '全局 · ~/.claude/skills', dir: join(homedir(), '.claude', 'skills') },
];
/** Description prefix marking switch files we generated; never delete files without it. */
const SHADOW_DESC_PREFIX = '[skill-manager] 本项目禁用开关';

class ApiError extends Error {
	constructor(status, message) {
		super(message);
		this.status = status;
	}
}

/**
 * Mirror of dsh-skill-filesystem's findProjectRoot: walk up from cwd looking
 * for a `.git` marker; when none exists, DSH falls back to cwd itself.
 * @param cwd - absolute workspace directory.
 * @returns the project root DSH actually scans for project-level skills.
 */
async function findProjectRoot(cwd) {
	const start = resolve(cwd);
	let current = start;
	for (;;) {
		const st = await stat(join(current, '.git')).catch(() => undefined);
		if (st !== undefined) return current; // .git as directory or worktree file
		const parent = dirname(current);
		if (parent === current) return start; // filesystem root: DSH falls back to cwd
		current = parent;
	}
}

/**
 * Build the managed skill roots for one workspace. Project roots anchor on
 * the git project root (so they match what DSH scans), not the raw cwd.
 * @param cwd - validated workspace directory, or undefined.
 * @returns { roots, projectRoot } — root descriptors with id, scope, label,
 *   dir, rank; projectRoot is null without a cwd.
 */
async function computeRoots(cwd) {
	const roots = [];
	let projectRoot = null;
	if (typeof cwd === 'string' && cwd.length > 0) {
		projectRoot = await findProjectRoot(cwd);
		roots.push({ id: 'project-dsh', scope: 'project', label: '项目 · .dsh/skills', dir: join(projectRoot, '.dsh', 'skills'), rank: RANKS['project-dsh'] });
		roots.push({ id: 'project-agents', scope: 'project', label: '项目 · .agents/skills', dir: join(projectRoot, '.agents', 'skills'), rank: RANKS['project-agents'] });
	}
	// External agent user-level skill roots (Codex / Claude Code). DSH scans
	// them natively via the host-level skill-filesystem row in this profile's
	// cordis.patch.yml (customSkillDirs, rank 300); this UI lists them
	// read-only so they stay visible and per-project toggleable. Inserted
	// before the user roots so the client's import default
	// (roots[length-2] === user-dsh) is unchanged.
	for (const g of GLOBAL_ROOTS) roots.push({ id: g.id, scope: 'global', label: g.label, dir: g.dir, rank: RANKS.global });
	const home = homedir();
	roots.push({ id: 'user-dsh', scope: 'user', label: '用户 · ~/.dsh/skills', dir: join(home, '.dsh', 'skills'), rank: RANKS['user-dsh'] });
	roots.push({ id: 'user-agents', scope: 'user', label: '用户 · ~/.agents/skills', dir: join(home, '.agents', 'skills'), rank: RANKS['user-agents'] });
	return { roots, projectRoot };
}

/**
 * Validate and parse one skill file's raw content.
 * @param raw - full file text (frontmatter + body).
 * @returns { name, description, whenToUse, body }
 * @throws ApiError(400) with a user-facing reason.
 */
function parseSkill(raw) {
	if (typeof raw !== 'string' || raw.length === 0) throw new ApiError(400, '内容为空');
	const lines = raw.split(/\r?\n/);
	if (lines[0] !== '---') throw new ApiError(400, '缺少 frontmatter：文件第一行必须是 ---');
	let end = -1;
	for (let i = 1; i < lines.length; i += 1) {
		if (lines[i] === '---' || lines[i] === '...') {
			end = i;
			break;
		}
	}
	if (end < 0) throw new ApiError(400, 'frontmatter 未闭合：缺少结束的 --- 行');
	const fm = lines.slice(1, end);
	const data = {};
	for (let i = 0; i < fm.length; i += 1) {
		const m = /^([A-Za-z_][A-Za-z0-9_-]*):(.*)$/.exec(fm[i]);
		if (m === null) continue; // indented continuation: belongs to the previous key
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
			if (value === '') continue; // nested mapping: not needed for validation
			const nonEmpty = collected.filter((line) => line !== '');
			data[key] = value.startsWith('>') ? nonEmpty.join(' ') : nonEmpty.join('\n');
		} else {
			if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) value = value.slice(1, -1);
			data[key] = value;
		}
	}
	const skillName = data.name;
	const description = data.description;
	if (typeof skillName !== 'string' || skillName.length === 0) throw new ApiError(400, 'frontmatter 缺少 name');
	if (!NAME_RE.test(skillName)) throw new ApiError(400, `skill 名 “${skillName}” 不合法：需要 kebab-case（小写字母、数字、连字符）`);
	if (typeof description !== 'string' || description.length === 0) throw new ApiError(400, 'frontmatter 缺少 description');
	// DSH's native invocation flag (dsh-skill-filesystem's frontmatterBoolean
	// accepts true/yes/on and false/no/off, case-insensitive).
	let disableModelInvocation;
	const rawFlag = data['disable-model-invocation'];
	if (typeof rawFlag === 'string') {
		const v = rawFlag.trim().toLowerCase();
		if (v === 'true' || v === 'yes' || v === 'on') disableModelInvocation = true;
		else if (v === 'false' || v === 'no' || v === 'off') disableModelInvocation = false;
	}
	return {
		name: skillName,
		description,
		whenToUse: typeof data.whenToUse === 'string' ? data.whenToUse : undefined,
		disableModelInvocation,
		body: lines.slice(end + 1).join('\n'),
	};
}

/**
 * Toggle the `disable-model-invocation` frontmatter flag of one skill file
 * without touching any other byte (EOL style preserved).
 * @param raw - full current file text.
 * @param setTrue - true adds/forces the flag, false removes it.
 * @returns { content, changed }
 */
function patchInvocationFlag(raw, setTrue) {
	if (typeof raw !== 'string' || raw.length === 0) throw new ApiError(400, '内容为空');
	const eol = raw.includes('\r\n') ? '\r\n' : '\n';
	const lines = raw.split(/\r?\n/);
	if (lines[0] !== '---') throw new ApiError(400, '缺少 frontmatter：文件第一行必须是 ---');
	let end = -1;
	for (let i = 1; i < lines.length; i += 1) {
		if (lines[i] === '---' || lines[i] === '...') { end = i; break; }
	}
	if (end < 0) throw new ApiError(400, 'frontmatter 未闭合：缺少结束的 --- 行');
	let found = -1;
	for (let i = 1; i < end; i += 1) {
		if (/^disable-model-invocation:/.test(lines[i])) { found = i; break; }
	}
	let changed = false;
	if (setTrue) {
		if (found === -1) {
			lines.splice(end, 0, 'disable-model-invocation: true');
			changed = true;
		} else if (!/^(true|yes|on)$/i.test(lines[found].split(':').slice(1).join(':').trim())) {
			lines[found] = 'disable-model-invocation: true';
			changed = true;
		}
	} else if (found !== -1) {
		lines.splice(found, 1);
		changed = true;
	}
	const content = changed ? lines.join(eol) : raw;
	if (changed) parseSkill(content); // re-validate before returning
	return { content, changed };
}

/** Whether a file is a switch shadow we generated (marker in its description). */
async function isShadowFile(path) {
	try {
		const parsed = parseSkill(await readFile(path, 'utf8'));
		return typeof parsed.description === 'string' && parsed.description.startsWith(SHADOW_DESC_PREFIX);
	} catch {
		return false;
	}
}

// ── global default-off policy state (apiVersion 5) ──────────────────────────
const STATE_PATH = join(homedir(), '.dsh', 'skill-manager.json');
async function readPolicyState() {
	try {
		const raw = JSON.parse(await readFile(STATE_PATH, 'utf8'));
		return { globalDefaultOff: raw !== null && typeof raw === 'object' && raw.globalDefaultOff === true };
	} catch {
		return { globalDefaultOff: false };
	}
}
async function writePolicyState(state) {
	await atomicWriteFile(STATE_PATH, JSON.stringify(state, null, 2) + '\n');
}
/** Atomic write: tmp file in the same directory, then rename over the target. */
async function atomicWriteFile(path, content) {
	const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
	await mkdir(dirname(path), { recursive: true });
	try {
		await writeFile(tmp, content, 'utf8');
		await rename(tmp, path);
	} finally {
		await rm(tmp, { force: true }).catch(() => {});
	}
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
		} catch (error) {
			lastError = error;
			await new Promise((r) => setTimeout(r, 60));
		}
	}
	throw lastError;
}
/** Find a user-root skill by name (either user root, dir bundle or flat). */
async function findUserSkill(cwd, skillName) {
	const { roots } = await computeRoots(cwd);
	for (const root of roots) {
		if (root.scope !== 'user') continue;
		const plan = await resolveTarget(undefined, cwd, root.id, skillName, false).catch(() => undefined);
		if (plan !== undefined && plan.existing !== undefined) return plan;
	}
	return undefined;
}
/** Find a project-root skill by name; { plan, marker } or undefined. */
async function findProjectSkill(cwd, skillName) {
	const { roots } = await computeRoots(cwd);
	for (const root of roots) {
		if (root.scope !== 'project') continue;
		const plan = await resolveTarget(undefined, cwd, root.id, skillName, false).catch(() => undefined);
		if (plan === undefined || plan.existing === undefined) continue;
		const marker = plan.existing === 'flat' && (await isShadowFile(plan.path));
		return { plan, marker };
	}
	return undefined;
}
/** Body of a generated marker switch file. */
function markerContent(name, projectRoot) {
	return [
		'---',
		`name: ${name}`,
		`description: "${SHADOW_DESC_PREFIX}：在本项目中禁用 ${name}（由 Skills 技能管理生成，请勿手改）"`,
		'disable-model-invocation: true',
		'---',
		'',
		`由 dsh-skill-manager 生成的项目级禁用开关：使 ${name} 在本项目的会话中不再被模型自动调用。`,
		`仅对本项目（${projectRoot}）生效；在设置里把对应 skill 的开关拨回，或删除本文件即可恢复。`,
	].join('\n');
}
/**
 * Copy one user-root skill into <projectRoot>/.dsh/skills (flat file or full
 * directory bundle), with the disable flag removed so the project-local copy
 * is invocable. Bounded at 50MB total.
 */
async function copySkillToProject(cwd, skillName, sourcePlan) {
	const { roots } = await computeRoots(cwd);
	const targetRoot = roots.find((r) => r.id === 'project-dsh');
	const MAX_BYTES = 50 * 1024 * 1024;
	if (sourcePlan.existing === 'flat') {
		const raw = await readFile(sourcePlan.path, 'utf8');
		const { content } = patchInvocationFlag(raw, false);
		const dest = join(targetRoot.dir, `${skillName}.md`);
		await atomicWriteFile(dest, content);
		return dest;
	}
	const srcDir = dirname(sourcePlan.path);
	const destDir = join(targetRoot.dir, skillName);
	const files = await walkSkillFiles(srcDir);
	let totalBytes = 0;
	await mkdir(destDir, { recursive: true });
	for (const file of files) {
		const data = await readFile(file);
		totalBytes += data.length;
		if (totalBytes > MAX_BYTES) throw new ApiError(413, 'skill 副本超过 50MB 上限');
		const rel = relative(srcDir, file).split(sep).join('/');
		const dest = join(destDir, rel);
		await mkdir(dirname(dest), { recursive: true });
		if (rel === 'SKILL.md') {
			const { content } = patchInvocationFlag(data.toString('utf8'), false);
			await writeFile(dest, content, 'utf8');
		} else {
			await writeFile(dest, data);
		}
	}
	return destDir;
}
/**
 * Enforce the global default-off policy for this workspace: add the disable
 * flag to every healthy user-root skill that lacks it, and drop legacy
 * marker switches in this project whose original is a user skill (now
 * globally off, so the marker is redundant). Idempotent; safe to run from
 * list(). Never touches project-original, global or bundled files.
 */
async function enforceGlobalPolicy(cwd) {
	const state = await readPolicyState();
	if (!state.globalDefaultOff) return { changed: 0, markersRemoved: 0, failed: [] };
	const { roots } = await computeRoots(cwd);
	let changed = 0;
	const failed = [];
	for (const root of roots) {
		if (root.scope !== 'user') continue;
		const result = await discoverInRoot(root.dir);
		if (!result.exists) continue;
		for (const skill of result.skills) {
			if (skill.broken) continue;
			const raw = await readFile(skill.path, 'utf8').catch(() => undefined);
			if (raw === undefined) continue;
			const { content, changed: ch } = patchInvocationFlag(raw, true);
			if (!ch) continue;
			try {
				await policyWrite(skill.path, content);
				changed += 1;
			} catch (error) {
				// Never abort the whole pass for one file; the next list()
				// re-enforces, so a skipped file self-heals.
				failed.push({ name: skill.name, path: skill.path, error: error instanceof Error ? error.message : String(error) });
			}
		}
	}
	let markersRemoved = 0;
	for (const root of roots) {
		if (root.scope !== 'project') continue;
		const entries = await readdir(root.dir, { withFileTypes: true }).catch(() => []);
		for (const entry of entries) {
			if (!entry.isFile() || entry.name.startsWith('.') || !entry.name.toLowerCase().endsWith('.md')) continue;
			const skillName = entry.name.slice(0, entry.name.length - 3);
			if (!NAME_RE.test(skillName)) continue;
			const p = join(root.dir, entry.name);
			if (!(await isShadowFile(p))) continue;
			if ((await findUserSkill(cwd, skillName)) !== undefined) {
				await unlink(p).catch(() => {});
				markersRemoved += 1;
			}
		}
	}
	return { changed, markersRemoved, failed };
}

/**
 * Discover skills in one root directory (directory bundles + flat .md).
 * @param dir - absolute root path.
 * @returns { exists, skills } — a missing directory is not an error.
 */
async function discoverInRoot(dir) {
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch (error) {
		if (error !== null && typeof error === 'object' && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return { exists: false, skills: [] };
		throw error;
	}
	const skills = [];
	const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));
	for (const entry of sorted) {
		if (entry.name.startsWith('.') || entry.name === '.system') continue;
		let path;
		let format;
		// Windows directory junctions surface as symlink dirents (isDirectory()
		// is false); follow them so linked bundles (e.g. ~/.dsh/skills/<name>
		// -> ~/.codex/skills/<name>) list like real directories.
		let isDir = entry.isDirectory();
		if (!isDir && entry.isSymbolicLink()) {
			const st = await stat(join(dir, entry.name)).catch(() => undefined);
			isDir = st !== undefined && st.isDirectory();
		}
		if (isDir) {
			const candidate = join(dir, entry.name, 'SKILL.md');
			const st = await stat(candidate).catch(() => undefined);
			if (st === undefined || !st.isFile()) continue;
			path = candidate;
			format = 'dir';
		} else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
			path = join(dir, entry.name);
			format = 'flat';
		} else {
			continue;
		}
		// Identity is the filename stem for flat files (DSH addresses by
		// frontmatter name, but file ops key on the deterministic filename).
		const identity = format === 'flat' ? entry.name.slice(0, entry.name.length - 3) : entry.name;
		const skill = { name: identity, title: identity, path, format, mtimeMs: 0, description: '', broken: undefined, readOnly: false };
		try {
			const raw = await readFile(path, 'utf8');
			const parsed = parseSkill(raw);
			skill.title = parsed.name;
			skill.description = parsed.description;
			if (parsed.whenToUse !== undefined) skill.whenToUse = parsed.whenToUse;
			skill.modelInvocable = parsed.disableModelInvocation !== true;
			skill.isShadow = parsed.description.startsWith(SHADOW_DESC_PREFIX);
			const st = await stat(path);
			skill.mtimeMs = st.mtimeMs;
		} catch (error) {
			skill.broken = error instanceof Error ? error.message : '读取失败';
		}
		skills.push(skill);
	}
	return { exists: true, skills };
}

/**
 * Discover read-only skills bundled in every known agent preset.
 * @param agentPresets - the agentPresets service, or undefined.
 * @returns [{ presetId, label, skills }]
 */
async function discoverBundled(agentPresets) {
	if (agentPresets === undefined) return [];
	let presets;
	try {
		presets = await agentPresets.list();
	} catch {
		return [];
	}
	const groups = [];
	for (const preset of presets) {
		if (preset === null || typeof preset !== 'object' || typeof preset.path !== 'string' || typeof preset.id !== 'string') continue;
		const skillsDir = join(dirname(preset.path), 'skills');
		const result = await discoverInRoot(skillsDir).catch(() => ({ exists: false, skills: [] }));
		if (!result.exists || result.skills.length === 0) continue;
		groups.push({
			presetId: preset.id,
			label: `${preset.id}（内置）`,
			skills: result.skills.map((skill) => ({ ...skill, readOnly: true })),
		});
	}
	return groups;
}

/** Validate an optional client-supplied workspace directory. */
function assertCwd(cwd) {
	if (cwd === undefined || cwd === null || cwd === '') return undefined;
	if (typeof cwd !== 'string') throw new ApiError(400, 'cwd 必须是字符串');
	const resolved = resolve(cwd);
	return stat(resolved).then((st) => {
		if (!st.isDirectory()) throw new ApiError(400, `cwd 不是目录：${resolved}`);
		return resolved;
	}).catch((error) => {
		if (error instanceof ApiError) throw error;
		throw new ApiError(400, `cwd 不存在：${resolved}`);
	});
}

/**
 * Resolve one {root, name} target to a concrete file plan.
 * @returns { rootId, readOnly, dir, path, existing } where existing is
 *   'dir' | 'flat' | undefined.
 */
async function resolveTarget(agentPresets, cwd, rootId, skillName, forCreate) {
	if (typeof skillName !== 'string' || !NAME_RE.test(skillName)) throw new ApiError(400, `skill 名不合法：${String(skillName)}`);
	if (typeof rootId === 'string' && rootId.startsWith('bundled:')) {
		const presetId = rootId.slice('bundled:'.length);
		let preset;
		try {
			preset = await agentPresets.list().then((list) => list.find((p) => p !== null && typeof p === 'object' && p.id === presetId));
		} catch {
			preset = undefined;
		}
		if (preset === undefined || typeof preset.path !== 'string') throw new ApiError(404, `内置分组不存在：${presetId}`);
		const dir = join(dirname(preset.path), 'skills');
		const plan = { rootId, readOnly: true, dir };
		const dirPath = join(dir, skillName, 'SKILL.md');
		const flatPath = join(dir, `${skillName}.md`);
		const dirStat = await stat(dirPath).catch(() => undefined);
		const flatStat = await stat(flatPath).catch(() => undefined);
		if (dirStat !== undefined && dirStat.isFile()) plan.existing = 'dir';
		else if (flatStat !== undefined && flatStat.isFile()) plan.existing = 'flat';
		plan.path = plan.existing === 'dir' ? dirPath : flatPath;
		if (plan.existing === undefined && !forCreate) throw new ApiError(404, `skill 不存在：${skillName}`);
		return plan;
	}
	const { roots } = await computeRoots(cwd);
	const root = roots.find((r) => r.id === rootId);
	if (root === undefined) throw new ApiError(404, `根目录不存在：${String(rootId)}`);
	const plan = {
		rootId,
		readOnly: root.scope === 'global',
		readOnlyReason: root.scope === 'global' ? 'external' : 'bundled',
		dir: root.dir,
	};
	const dirPath = join(root.dir, skillName, 'SKILL.md');
	const flatPath = join(root.dir, `${skillName}.md`);
	const dirStat = await stat(dirPath).catch(() => undefined);
	const flatStat = await stat(flatPath).catch(() => undefined);
	if (dirStat !== undefined && dirStat.isFile()) plan.existing = 'dir';
	else if (flatStat !== undefined && flatStat.isFile()) plan.existing = 'flat';
	if (plan.existing === undefined) {
		if (!forCreate) throw new ApiError(404, `skill 不存在：${skillName}`);
		plan.path = dirPath; // new skills use the directory-bundle form
		return plan;
	}
	plan.path = plan.existing === 'dir' ? dirPath : flatPath;
	return plan;
}

/** Ensure the resolved target stays inside its root directory. */
function assertContained(plan) {
	const rootResolved = resolve(plan.dir);
	const targetResolved = resolve(plan.path);
	if (targetResolved !== rootResolved && !targetResolved.startsWith(rootResolved + sep)) throw new ApiError(400, '非法路径');
}

/**
 * Recursively list the regular files under one skill directory, skipping
 * hidden entries, our own atomic-write temp files, and anything that
 * resolves outside the directory (symlink-escape guard).
 * @param dir - absolute skill directory.
 * @returns absolute file paths, depth-first, stable order.
 */
async function walkSkillFiles(dir) {
	const rootReal = await realpath(dir).catch(() => resolve(dir));
	const out = [];
	const seen = new Set();
	async function rec(d, depth) {
		if (depth > 8) return;
		let entries;
		try {
			entries = await readdir(d, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
			if (entry.name.startsWith('.') || /\.tmp-\d+-\d+$/.test(entry.name)) continue;
			const p = join(d, entry.name);
			let real;
			try {
				real = await realpath(p);
			} catch {
				continue; // broken symlink etc.
			}
			if (seen.has(real)) continue;
			seen.add(real);
			if (real !== rootReal && !real.startsWith(rootReal + sep)) continue; // symlink escape
			if (entry.isDirectory()) await rec(p, depth + 1);
			else if (entry.isFile()) out.push(p);
		}
	}
	await rec(dir, 0);
	return out;
}

// ── minimal ZIP writer (store method, UTF-8 names, no dependencies) ─────────
const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n += 1) {
		let c = n;
		for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();
function crc32(buf) {
	let c = 0xffffffff;
	for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}
function dosDateTime(d = new Date()) {
	return {
		time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
		date: ((((d.getFullYear() - 1980) & 0x7f) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()),
	};
}
/**
 * Build a store-only ZIP archive.
 * @param entries - [{ name: 'a/b.txt', data: Buffer }]
 */
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

/**
 * Build the request handler for the /api/skill-manager route.
 * @param deps - { agentPresets, logger }
 * @returns (req, res) => Promise<void>
 */
function makeHandler(deps) {
	const ops = {
		async list(body) {
			const cwd = await assertCwd(body.cwd);
			const { roots, projectRoot } = await computeRoots(cwd);
			// Global default-off enforcement is idempotent and a no-op unless
			// the policy is on; running it before discovery keeps the listed
			// invocation state current (newly added user skills default off).
			// Per-file failures are retried internally and reported, never
			// fatal: listing must keep working even if a file is locked.
			const enforcement = await enforceGlobalPolicy(cwd).catch((e) => ({ changed: 0, markersRemoved: 0, failed: [{ error: e instanceof Error ? e.message : String(e) }] }));
			if (enforcement.failed !== undefined && enforcement.failed.length > 0) {
				deps.logger?.warn?.(`skill-manager: policy enforcement skipped ${enforcement.failed.length} file(s): ${enforcement.failed.map((f) => f.name + ' (' + f.error + ')').join('; ')}`);
			}
			const policy = await readPolicyState();
			const out = [];
			for (const root of roots) {
				const result = await discoverInRoot(root.dir);
				// External agent roots are shared with the other tool: the UI
				// lists them but never writes through this page.
				const skills = root.scope === 'global'
					? result.skills.map((skill) => ({ ...skill, readOnly: true }))
					: result.skills;
				out.push({ id: root.id, scope: root.scope, label: root.label, dir: root.dir, rank: root.rank, exists: result.exists, skills });
			}
			const bundled = await discoverBundled(deps.agentPresets);
			// Effective catalog per DSH: for each name the lowest-rank healthy
			// candidate wins (broken files are ignored by DSH's parser). The
			// winner's invocation flag decides whether the model catalog
			// (tool-skill filters on modelInvocable) includes it.
			const byName = new Map();
			for (const root of out) for (const skill of root.skills) {
				if (skill.broken) continue;
				const list = byName.get(skill.name) ?? [];
				list.push({ rank: root.rank, modelInvocable: skill.modelInvocable, label: root.label });
				byName.set(skill.name, list);
			}
			for (const group of bundled) for (const skill of group.skills) {
				if (skill.broken) continue;
				const list = byName.get(skill.name) ?? [];
				list.push({ rank: RANKS.bundled, modelInvocable: skill.modelInvocable, label: group.label });
				byName.set(skill.name, list);
			}
			const winnerFor = (skill) => {
				const list = byName.get(skill.name);
				if (list === undefined) return undefined;
				let best = list[0];
				for (const cand of list) if (cand.rank < best.rank) best = cand;
				return best;
			};
			const mark = (skills, ownRank) => {
				for (const skill of skills) {
					const winner = winnerFor(skill);
					if (winner === undefined) continue;
					skill.shadowedBy = winner.rank < ownRank ? winner.label : undefined;
					skill.disabled = winner.modelInvocable === false;
				}
			};
			for (const root of out) mark(root.skills, root.rank);
			for (const group of bundled) mark(group.skills, RANKS.bundled);
			// apiVersion: 2 = HMR experiment, 3 = exportZip op added,
			// 4 = per-project enable/disable (setStatus + effective state),
			// 5 = global default-off policy (policy field, setPolicy/getPolicy,
			// copy-based project enable). The client greys out features
			// needing newer hosts until a dsh web restart loads the handler.
			return { apiVersion: 5, cwd: cwd ?? null, projectRoot, policy, roots: out, bundled };
		},
		async read(body) {
			const cwd = await assertCwd(body.cwd);
			const plan = await resolveTarget(deps.agentPresets, cwd, body.root, body.name, false);
			assertContained(plan);
			const content = await readFile(plan.path, 'utf8');
			return { name: body.name, root: plan.rootId, readOnly: plan.readOnly, path: plan.path, format: plan.existing, content };
		},
		async save(body) {
			const cwd = await assertCwd(body.cwd);
			const plan = await resolveTarget(deps.agentPresets, cwd, body.root, body.name, true);
			assertContained(plan);
			if (plan.readOnly) {
				throw new ApiError(403, plan.readOnlyReason === 'external'
					? '外部全局 skill 只读（属于 Codex / Claude Code 等工具）：在此修改会直接影响该工具自身，请改在其原目录操作'
					: '内置 skill 只读：部署升级会覆盖它，请改用导入创建自己的版本');
			}
			parseSkill(typeof body.content === 'string' ? body.content : '');
			const tmp = `${plan.path}.tmp-${process.pid}-${Date.now()}`;
			await mkdir(dirname(plan.path), { recursive: true });
			try {
				await writeFile(tmp, body.content, 'utf8');
				await rename(tmp, plan.path);
			} finally {
				await rm(tmp, { force: true }).catch(() => {});
			}
			return { path: plan.path };
		},
		async delete(body) {
			const cwd = await assertCwd(body.cwd);
			const plan = await resolveTarget(deps.agentPresets, cwd, body.root, body.name, false);
			assertContained(plan);
			if (plan.readOnly) {
				throw new ApiError(403, plan.readOnlyReason === 'external' ? '外部全局 skill 只读，不能从此处删除' : '内置 skill 只读，不能删除');
			}
			if (plan.existing === 'dir') {
				await rm(join(plan.dir, body.name), { recursive: true, force: false });
			} else if (plan.existing === 'flat') {
				await unlink(plan.path);
			} else {
				throw new ApiError(404, `skill 不存在：${body.name}`);
			}
			return { deleted: body.name };
		},
		/**
		 * Per-project enable/disable. For a skill that lives in this project's
		 * own roots the frontmatter flag is toggled in place; for user/bundled
		 * skills a project-level shadow file (rank 100, disable-model-invocation)
		 * is created or removed under <projectRoot>/.dsh/skills so only this
		 * project's sessions see the change.
		 */
		async setStatus(body) {
			const cwd = await assertCwd(body.cwd);
			if (cwd === undefined) throw new ApiError(400, '当前页没有会话工作区：按项目开关需要项目上下文');
			const name = typeof body.name === 'string' ? body.name : '';
			if (!NAME_RE.test(name)) throw new ApiError(400, `skill 名不合法：${String(body.name)}`);
			const wantDisabled = body.disabled === true;
			const { roots, projectRoot } = await computeRoots(cwd);
			const plan = await resolveTarget(deps.agentPresets, cwd, body.root, name, false);
			assertContained(plan);
			const isProjectScope = plan.rootId === 'project-dsh' || plan.rootId === 'project-agents';

			if (isProjectScope) {
				// A switch file we generated is a flat file in a project root:
				// toggling it ON removes the file (restoring the original
				// skill); toggling OFF is a no-op (already disabled).
				if (plan.existing === 'flat' && (await isShadowFile(plan.path))) {
					if (wantDisabled) return { name, disabled: true, changed: false, where: 'shadow', path: plan.path };
					await unlink(plan.path);
					return { name, disabled: false, changed: true, where: 'shadow', path: plan.path };
				}
				const raw = await readFile(plan.path, 'utf8');
				const { content, changed } = patchInvocationFlag(raw, wantDisabled);
				if (changed) {
					const tmp = `${plan.path}.tmp-${process.pid}-${Date.now()}`;
					try {
						await writeFile(tmp, content, 'utf8');
						await rename(tmp, plan.path);
					} finally {
						await rm(tmp, { force: true }).catch(() => {});
					}
				}
				return { name, disabled: wantDisabled, changed, where: 'self', path: plan.path };
			}

			const state = await readPolicyState();
			const isUserScope = plan.rootId === 'user-dsh' || plan.rootId === 'user-agents';

			if (isUserScope && state.globalDefaultOff) {
				// Global policy on: the original is (or becomes) flagged in
				// every project, so "disabled" is the global state and
				// "enabled here" = a project-local copy with the flag off.
				const proj = await findProjectSkill(cwd, name);
				// A legacy marker is redundant while the original is globally
				// off — drop it so the row stays uncluttered.
				if (proj !== undefined && proj.marker) await unlink(proj.plan.path).catch(() => {});
				const copyPlan = proj !== undefined && proj.marker === false ? proj.plan : undefined;
				if (wantDisabled) {
					// Defensive: ensure the original carries the flag.
					const raw = await readFile(plan.path, 'utf8');
					const { content, changed: ch0 } = patchInvocationFlag(raw, true);
					let changed = ch0;
					if (ch0) await atomicWriteFile(plan.path, content);
					// A copy in this project must be flagged too.
					if (copyPlan !== undefined) {
						const cRaw = await readFile(copyPlan.path, 'utf8').catch(() => undefined);
						if (cRaw !== undefined) {
							const c = patchInvocationFlag(cRaw, true);
							if (c.changed) { await atomicWriteFile(copyPlan.path, c.content); changed = true; }
						}
					}
					return { name, disabled: true, where: copyPlan !== undefined ? 'copy' : 'policy', changed, path: copyPlan !== undefined ? copyPlan.path : plan.path };
				}
				// Enable: unflag an existing copy, or create one.
				if (copyPlan !== undefined) {
					const cRaw = await readFile(copyPlan.path, 'utf8').catch(() => undefined);
					if (cRaw !== undefined) {
						const c = patchInvocationFlag(cRaw, false);
						if (c.changed) await atomicWriteFile(copyPlan.path, c.content);
						return { name, disabled: false, where: 'copy', changed: c.changed, path: copyPlan.path };
					}
				}
				const dest = await copySkillToProject(cwd, name, plan);
				return { name, disabled: false, where: 'copy', created: true, changed: true, path: dest };
			}

			// Policy off, or originals we cannot re-flag (global roots,
			// bundled): the legacy marker shadow mechanism.
			const shadowDir = join(projectRoot, '.dsh', 'skills');
			const shadowPath = join(shadowDir, `${name}.md`);
			// Never clobber a pre-existing same-name skill in the project roots
			// (it already outranks the original; the user must toggle that row).
			for (const root of roots) {
				if (root.scope !== 'project') continue;
				const probe = await resolveTarget(deps.agentPresets, cwd, root.id, name, false).catch(() => undefined);
				if (probe === undefined) continue;
				if (probe.existing === 'flat' && probe.path === shadowPath && (await isShadowFile(shadowPath))) continue; // our own switch
				throw new ApiError(409, `本项目已有同名 skill「${name}」（${root.label}）：它的优先级更高，请在那一行上直接开关`);
			}
			const existingShadow = await readFile(shadowPath, 'utf8').catch(() => undefined);
			const ownShadow = existingShadow !== undefined && (await isShadowFile(shadowPath));
			if (wantDisabled) {
				if (ownShadow) return { name, disabled: true, changed: false, where: 'shadow', path: shadowPath };
				const content = markerContent(name, projectRoot);
				const tmp = `${shadowPath}.tmp-${process.pid}-${Date.now()}`;
				await mkdir(shadowDir, { recursive: true });
				try {
					await writeFile(tmp, content, 'utf8');
					await rename(tmp, shadowPath);
				} finally {
					await rm(tmp, { force: true }).catch(() => {});
				}
				return { name, disabled: true, changed: true, where: 'shadow', path: shadowPath };
			}
			if (!ownShadow) return { name, disabled: false, changed: false, where: 'shadow', path: shadowPath };
			await unlink(shadowPath);
			return { name, disabled: false, changed: true, where: 'shadow', path: shadowPath };
		},
		/** Read the global default-off policy state (no cwd needed). */
		async getPolicy() {
			return await readPolicyState();
		},
		/**
		 * Toggle the global default-off policy. Enabling also enforces it
		 * immediately (flags user-root skills, prunes redundant markers);
		 * disabling never rewrites previously flagged files.
		 */
		async setPolicy(body) {
			const cwd = await assertCwd(body.cwd);
			const want = body.globalDefaultOff === true;
			const state = await readPolicyState();
			if (state.globalDefaultOff === want) return { ...state, changed: 0, markersRemoved: 0 };
			await writePolicyState({ globalDefaultOff: want });
			const report = want
				? await enforceGlobalPolicy(cwd).catch((e) => ({ changed: 0, markersRemoved: 0, failed: [{ error: e instanceof Error ? e.message : String(e) }] }))
				: { changed: 0, markersRemoved: 0, failed: [] };
			return { globalDefaultOff: want, changed: report.changed, markersRemoved: report.markersRemoved, failed: report.failed };
		},
		/* `import` is a reserved word; the API op name stays "import". */
		async ['import'](body) {
			const cwd = await assertCwd(body.cwd);
			if (typeof body.content !== 'string') throw new ApiError(400, '缺少 content');
			const parsed = parseSkill(body.content);
			if (typeof body.root !== 'string' || body.root.startsWith('bundled:')) throw new ApiError(400, '导入目标必须是项目级或用户级根目录');
			const plan = await resolveTarget(deps.agentPresets, cwd, body.root, parsed.name, true);
			assertContained(plan);
			if (plan.existing !== undefined) throw new ApiError(409, `skill 已存在：${parsed.name}`);
			const path = join(plan.dir, parsed.name, 'SKILL.md');
			assertContained({ dir: plan.dir, path });
			const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
			await mkdir(dirname(path), { recursive: true });
			try {
				await writeFile(tmp, body.content, 'utf8');
				await rename(tmp, path);
			} finally {
				await rm(tmp, { force: true }).catch(() => {});
			}
			return { name: parsed.name, path };
		},
		/**
		 * Export one or more skills as a single ZIP (binary response).
		 * Directory bundles are zipped with their full file tree
		 * (SKILL.md + references/ + …); flat skills become `<name>.md`.
		 * Read-only (bundled) skills may be exported, never modified.
		 */
		async exportZip(body) {
			const cwd = await assertCwd(body.cwd);
			if (typeof body.root !== 'string') throw new ApiError(400, '缺少 root');
			const names = Array.isArray(body.names)
				? [...new Set(body.names.filter((n) => typeof n === 'string' && NAME_RE.test(n)))]
				: [];
			if (names.length === 0) throw new ApiError(400, 'names 不能为空');
			const MAX_BYTES = 50 * 1024 * 1024;
			const MAX_FILES = 2000;
			const entries = [];
			let totalBytes = 0;
			for (const skillName of names) {
				const plan = await resolveTarget(deps.agentPresets, cwd, body.root, skillName, false);
				assertContained(plan);
				let files;
				let base;
				if (plan.existing === 'flat') {
					files = [plan.path];
					base = '';
				} else if (plan.existing === 'dir') {
					base = `${skillName}/`;
					files = await walkSkillFiles(dirname(plan.path));
					if (files.length === 0) files = [plan.path]; // SKILL.md vanished mid-walk
				} else {
					throw new ApiError(404, `skill 不存在：${skillName}`);
				}
				for (const file of files) {
					const data = await readFile(file);
					totalBytes += data.length;
					if (totalBytes > MAX_BYTES) throw new ApiError(413, '导出内容超过 50MB 上限');
					if (entries.length >= MAX_FILES) throw new ApiError(413, '导出文件数超过上限');
					const inner = base === ''
						? `${skillName}.md`
						: `${base}${relative(dirname(plan.path), file).split(sep).join('/')}`;
					entries.push({ name: inner, data });
				}
			}
			const slug = names.length === 1 ? names[0] : `${names[0].split('-')[0]}-${names.length}-skills`;
			return { __zip: buildZip(entries), filename: `${slug}.zip` };
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
			for await (const chunk of req) chunks.push(chunk);
			let body;
			try {
				body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
			} catch {
				send(400, { ok: false, error: { message: '请求体不是合法 JSON' } });
				return;
			}
			const op = body && typeof body === 'object' ? body.op : undefined;
			const fn = ops[op];
			if (typeof fn !== 'function') {
				send(400, { ok: false, error: { message: `未知操作：${String(op)}` } });
				return;
			}
			const value = await fn(body);
			if (value !== null && typeof value === 'object' && Buffer.isBuffer(value.__zip)) {
				res.writeHead(200, {
					'content-type': 'application/zip',
					'content-disposition': `attachment; filename="${value.filename}"`,
					'content-length': value.__zip.length,
					'cache-control': 'no-store',
				});
				res.end(value.__zip);
				return;
			}
			send(200, { ok: true, value });
		} catch (error) {
			const status = error instanceof ApiError ? error.status : 500;
			const message = error instanceof Error ? error.message : String(error);
			if (status === 500) deps.logger?.warn?.(`skill-manager: ${error instanceof Error ? error.stack : message}`);
			send(status, { ok: false, error: { message } });
		}
	};
}

/**
 * Register the skill-manager HTTP route on the web server.
 * @param ctx - the plugin context.
 */
function apply(ctx) {
	const webServer = ctx.get('webServer');
	if (webServer === undefined) return; // non-web surface: nothing to serve
	const agentPresets = ctx.get('agentPresets');
	const handler = makeHandler({ agentPresets, logger: ctx.logger });
	ctx.effect(() => webServer.register({ kind: 'exact', path: '/api/skill-manager', handler }), 'skill-manager: web route');
}

export { name, inject, apply };
export const internals = {
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
	RANKS,
	SHADOW_DESC_PREFIX,
	STATE_PATH,
};
