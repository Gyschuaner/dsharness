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
 *   - atomic writes (tmp + rename), JSON only, no live Host objects;
 *   - paths are canonicalized and containment-checked; read-only or
 *     non-writable targets are rejected with explicit errors;
 *   - corrupt config degrades to defaults (project: empty enabled set) and
 *     is re-written on the next successful mutation;
 *   - unknown fields survive round-trips (forward compatibility);
 *   - zero bare dependencies (node: builtins only).
 */
import { createHash } from 'node:crypto';
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

export class ApiError extends Error {
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
		if (st !== undefined) return current; // .git as directory or worktree file
		const parent = dirname(current);
		if (parent === current) return start; // filesystem root: DSH falls back to cwd
		current = parent;
	}
}

/** Validate a cwd argument; undefined/null/'' stays undefined. */
export async function assertCwd(cwd) {
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
 * Read the project config.
 * @returns { config, path, existed, corrupt } — corrupt files degrade to an
 *   empty config (fresh project default: nothing enabled) so listing keeps
 *   working; the next successful mutation overwrites them.
 */
export async function readProjectConfig(projectRoot, opts) {
	const path = projectConfigPath(projectRoot);
	try {
		const raw = await readFile(path, 'utf8');
		const parsed = JSON.parse(raw);
		const config = normalizeProjectConfig(parsed, resolve(projectRoot));
		return { config, path, existed: true, corrupt: false };
	} catch (error) {
		if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
			return { config: emptyProjectConfig(resolve(projectRoot)), path, existed: false, corrupt: false };
		}
		// Unreadable or invalid JSON: degrade, never crash the list path.
		return { config: emptyProjectConfig(resolve(projectRoot)), path, existed: true, corrupt: error instanceof Error && error.name !== 'ENOENT' };
	}
}

/** Write the project config (atomic). Rejects when the root is not writable. */
export async function writeProjectConfig(projectRoot, config, opts) {
	const root = resolve(projectRoot);
	const st = await stat(root).catch(() => undefined);
	if (st === undefined || !st.isDirectory()) throw new ApiError(400, `项目目录不存在：${root}`);
	try {
		await access(root, constants.W_OK);
	} catch {
		throw new ApiError(409, `项目目录不可写（只读根），无法保存配置：${root}`);
	}
	const next = {
		schema: PROJECT_SCHEMA,
		apiVersion: PROJECT_API_VERSION,
		projectRoot: root,
		enabled: Array.isArray(config.enabled) ? config.enabled.filter((n) => typeof n === 'string' && NAME_RE.test(n)) : [],
		sources: config.sources && typeof config.sources === 'object' && !Array.isArray(config.sources) ? config.sources : {},
		appliedPreset: typeof config.appliedPreset === 'string' && config.appliedPreset.length > 0 ? config.appliedPreset : null,
		updatedAt: typeof config.updatedAt === 'string' ? config.updatedAt : new Date().toISOString(),
	};
	const path = projectConfigPath(root);
	await atomicWriteFile(path, JSON.stringify(next, null, 2) + '\n');
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
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return base;
	base.enabled = Array.isArray(parsed.enabled)
		? parsed.enabled.filter((n) => typeof n === 'string' && NAME_RE.test(n))
		: [];
	if (parsed.sources && typeof parsed.sources === 'object' && !Array.isArray(parsed.sources)) {
		for (const [name, sel] of Object.entries(parsed.sources)) {
			if (typeof name !== 'string' || !NAME_RE.test(name)) continue;
			if (sel === null || typeof sel !== 'object') continue;
			const entry = {};
			if (typeof sel.source === 'string' && sel.source.length > 0) entry.source = sel.source;
			if (typeof sel.contentHash === 'string' && sel.contentHash.length > 0) entry.contentHash = sel.contentHash;
			if (typeof sel.originHash === 'string' && sel.originHash.length > 0) entry.originHash = sel.originHash;
			if (typeof sel.copyHash === 'string' && sel.copyHash.length > 0) entry.copyHash = sel.copyHash;
			if (sel.generated === true) entry.generated = true;
			// Marketplace provenance is project-local metadata.  Preserve it
			// through the existing V1 config normalizer so a restart does not
			// make a managed remote Skill look like an unrelated local file.
			if (sel.marketManaged === true) entry.marketManaged = true;
			for (const key of ['marketId', 'marketRepository', 'marketPath', 'marketRef', 'marketRevision', 'marketHash']) {
				if (typeof sel[key] === 'string' && sel[key].length > 0) entry[key] = sel[key];
			}
			if (Object.keys(entry).length > 0) base.sources[name] = entry;
		}
	}
	if (typeof parsed.appliedPreset === 'string' && parsed.appliedPreset.length > 0) base.appliedPreset = parsed.appliedPreset;
	if (typeof parsed.updatedAt === 'string') base.updatedAt = parsed.updatedAt;
	return base;
}

/** Tolerant coercion of a parsed global-config JSON object. */
function normalizeGlobalConfig(parsed, empty) {
	const base = {
		schema: GLOBAL_SCHEMA,
		apiVersion: PROJECT_API_VERSION,
		globalDefaultOff: parsed && parsed.globalDefaultOff === true,
		tags: {},
		presets: {},
	};
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return base;
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
		const config = normalizeGlobalConfig(rawObj, empty);
		const raw = rawObj && typeof rawObj === 'object' && !Array.isArray(rawObj) ? rawObj : {};
		return { config, path, existed: true, raw };
	} catch (error) {
		if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
			return { config: empty, path, existed: false, raw: {} };
		}
		return { config: empty, path, existed: true, raw: {} };
	}
}

/** Merge-patch the global config (atomic; preserves unknown fields). */
export async function writeGlobalConfig(patch, opts) {
	const { config, raw, path } = await readGlobalConfig(opts);
	const next = Object.assign({}, raw, config);
	for (const [key, value] of Object.entries(patch)) {
		if (value === undefined) delete next[key];
		else next[key] = value;
	}
	next.schema = GLOBAL_SCHEMA;
	next.apiVersion = PROJECT_API_VERSION;
	if (next.tags !== undefined) next.tags = normalizeTagsMap(next.tags);
	if (next.presets !== undefined) next.presets = normalizePresetsMap(next.presets);
	next.globalDefaultOff = next.globalDefaultOff === true;
	await atomicWriteFile(path, JSON.stringify(next, null, 2) + '\n');
	return next;
}

/** { skillName: string[] } with per-tag validation (invalid entries dropped). */
export function normalizeTagsMap(input) {
	const out = {};
	if (input === null || typeof input !== 'object' || Array.isArray(input)) return out;
	for (const [name, tags] of Object.entries(input)) {
		if (typeof name !== 'string' || !NAME_RE.test(name)) continue;
		const clean = validateTagList(tags);
		if (clean.length > 0) out[name] = clean;
	}
	return out;
}

/**
 * Validate a tag list: strings, trimmed, non-empty, ≤32 chars, de-duplicated
 * case-insensitively, ≤20 total. Invalid entries are dropped, not fatal.
 */
export function validateTagList(tags) {
	if (!Array.isArray(tags)) return [];
	const seen = new Set();
	const out = [];
	for (const tag of tags) {
		if (typeof tag !== 'string') continue;
		const clean = tag.trim();
		if (clean.length === 0 || clean.length > TAG_MAX_LENGTH) continue;
		const key = clean.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(clean);
		if (out.length >= TAGS_PER_SKILL_MAX) break;
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
	if (input === null || typeof input !== 'object' || Array.isArray(input)) return out;
	for (const [name, preset] of Object.entries(input)) {
		if (typeof name !== 'string' || name.trim().length === 0 || name.length > 64) continue;
		if (preset === null || typeof preset !== 'object' || Array.isArray(preset)) continue;
		const skills = {};
		const src = preset.skills && typeof preset.skills === 'object' && !Array.isArray(preset.skills) ? preset.skills : {};
		for (const [skillName, sel] of Object.entries(src)) {
			if (typeof skillName !== 'string' || !NAME_RE.test(skillName)) continue;
			const entry = {};
			if (sel && typeof sel === 'object' && typeof sel.source === 'string' && sel.source.length > 0) entry.source = sel.source;
			skills[skillName] = entry;
		}
		out[name] = {
			name,
			description: typeof preset.description === 'string' ? preset.description.slice(0, 200) : undefined,
			defaultSlim: preset.defaultSlim === true,
			skills,
			updatedAt: typeof preset.updatedAt === 'string' ? preset.updatedAt : undefined,
		};
		if (out[name].description === undefined) delete out[name].description;
		if (out[name].updatedAt === undefined) delete out[name].updatedAt;
	}
	return out;
}

/** Preset name validation (shared by read/write ops). */
export function assertPresetName(name) {
	if (typeof name !== 'string') throw new ApiError(400, '预设名必须是字符串');
	const clean = name.trim();
	if (clean.length === 0 || clean.length > 64) throw new ApiError(400, '预设名长度需在 1–64 之间');
	return clean;
}

/** sha256 hex of a string. */
export function sha256Hex(text) {
	return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Content hash of one skill source: flat files hash their own text;
 * directory bundles hash every file (stable sorted walk, `rel=hex` lines).
 * This is the "content unchanged" marker half for generated copies.
 * @param path - SKILL.md path (dir bundle) or flat .md path.
 * @param format - 'dir' | 'flat'.
 */
export async function hashSkillSource(path, format) {
	if (format === 'flat') {
		const raw = await readFile(path, 'utf8');
		return `sha256:${sha256Hex(raw)}`;
	}
	const root = dirname(path);
	const rootReal = await realpath(root).catch(() => resolve(root));
	const lines = [];
	const seen = new Set();
	async function rec(d, depth) {
		if (depth > 8) return;
		const entries = await readdir(d, { withFileTypes: true }).catch(() => []);
		for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
			if (entry.name.startsWith('.') || /\.tmp-\d+-\d+$/.test(entry.name)) continue;
			const p = join(d, entry.name);
			const real = await realpath(p).catch(() => undefined);
			if (real === undefined || seen.has(real)) continue;
			seen.add(real);
			if (real !== rootReal && !real.startsWith(rootReal + sep)) continue; // symlink escape
			if (entry.isDirectory()) await rec(p, depth + 1);
			else if (entry.isFile()) {
				const data = await readFile(p);
				lines.push(`${relative(root, p).split(sep).join('/')}=${sha256Hex(data.toString('utf8'))}`);
			}
		}
	}
	await rec(root, 0);
	return `sha256:${sha256Hex(lines.join('\n'))}`;
}
