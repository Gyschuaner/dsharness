/**
 * dsh-skill-manager — V1 host tests (DSH-008).
 *
 * Node built-in test runner (node:test) against a fully isolated fixture:
 * fake HOME (injected via opts.home), fake agent presets, scratch project
 * roots. Nothing in the real ~/.dsh or the user's projects is touched.
 *
 * Run: node --test plugins/skill-manager/test/
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { access, chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { internals } from '../lib/index.js';
import {
	ApiError,
	assertCwd,
	findProjectRoot,
	hashSkillSource,
	readGlobalConfig,
	readProjectConfig,
	writeProjectConfig,
	validateTagList,
	globalConfigPath,
	projectConfigPath,
} from '../lib/state.js';

// ── fixtures ────────────────────────────────────────────────────────────────
function skillMd(name, description, { flag = false, userInvocable = null } = {}) {
	const lines = ['---', `name: ${name}`, `description: ${description}`];
	if (flag) lines.push('disable-model-invocation: true');
	if (userInvocable !== null) lines.push(`user-invocable: ${userInvocable}`);
	lines.push('---', '', `body of ${name}`, '');
	return lines.join('\n');
}

/** Write one skill (flat or dir bundle) under a root directory. */
async function putSkill(rootDir, name, description, { format = 'flat', flag = false, files = {} } = {}) {
	if (format === 'dir') {
		const dir = join(rootDir, name);
		await mkdir(join(dir, 'references'), { recursive: true });
		await writeFile(join(dir, 'SKILL.md'), skillMd(name, description, { flag }), 'utf8');
		for (const [rel, content] of Object.entries(files)) {
			const p = join(dir, rel);
			await mkdir(join(p, '..'), { recursive: true });
			await writeFile(p, content, 'utf8');
		}
		return join(dir, 'SKILL.md');
	}
	await mkdir(rootDir, { recursive: true });
	await writeFile(join(rootDir, `${name}.md`), skillMd(name, description, { flag }), 'utf8');
	return join(rootDir, `${name}.md`);
}

async function makeEnv() {
	const root = await mkdtemp(join(tmpdir(), 'smgr-v1-'));
	const home = join(root, 'home');
	await mkdir(join(home, '.dsh', 'skills'), { recursive: true });
	await mkdir(join(home, '.agents', 'skills'), { recursive: true });
	await mkdir(join(home, '.codex', 'skills'), { recursive: true });
	await mkdir(join(home, '.claude', 'skills'), { recursive: true });
	for (const p of ['alpha', 'beta']) {
		await mkdir(join(root, p, '.git'), { recursive: true });
		await mkdir(join(root, p, '.dsh', 'skills'), { recursive: true });
	}
	await mkdir(join(root, 'preset', 'skills'), { recursive: true });
	const agentPresets = {
		list: async () => [{ id: 'preset-a', path: join(root, 'preset', 'cordis.yml') }],
	};
	const opts = { home, agentPresets, logger: { warn: () => {} } };
	return {
		root,
		home,
		cwd: join(root, 'alpha'),
		betaCwd: join(root, 'beta'),
		opts,
		projectRoot: join(root, 'alpha'),
		betaRoot: join(root, 'beta'),
		presetSkills: join(root, 'preset', 'skills'),
		userDsh: join(home, '.dsh', 'skills'),
		userAgents: join(home, '.agents', 'skills'),
		globalCodex: join(home, '.codex', 'skills'),
		globalClaude: join(home, '.claude', 'skills'),
		projDsh: join(root, 'alpha', '.dsh', 'skills'),
		betaProjDsh: join(root, 'beta', '.dsh', 'skills'),
		cleanup: () => rm(root, { recursive: true, force: true }),
	};
}

/** Drive makeHandler like HTTP. */
function makeApi(opts) {
	const handler = internals.makeHandler({ agentPresets: opts.agentPresets, logger: opts.logger, home: opts.home });
	return async (op, payload = {}) => {
		let status;
		let headers;
		let data;
		const res = {
			writeHead: (s, h) => { status = s; headers = h || {}; },
			end: (d) => { data = d; },
		};
		const body = JSON.stringify({ op, ...payload });
		const req = {
			method: 'POST',
			[Symbol.asyncIterator]: async function* () { yield Buffer.from(body, 'utf8'); },
		};
		await handler(req, res);
		const parsed = data && data.length > 0 && typeof data === 'string' ? JSON.parse(data) : data;
		// Unwrap the { ok, value } envelope; error responses keep the full body.
		const value = parsed && parsed.ok === true ? parsed.value : parsed;
		return { status, headers, value };
	};
}

const identity = (view, name) => view.identities.find((i) => i.name === name);
const hasStub = async (projDsh, name) => stat(join(projDsh, `${name}.md`)).then(() => true, () => false);

// ── S1: state model & persistence ───────────────────────────────────────────
test('project config: fresh root defaults to empty enabled set', async (t) => {
	const env = await makeEnv();
	t.after(env.cleanup);
	const { config, existed, corrupt } = await readProjectConfig(env.projectRoot, env.opts);
	assert.equal(existed, false);
	assert.equal(corrupt, false);
	assert.deepEqual(config.enabled, []);
	assert.deepEqual(config.sources, {});
	assert.equal(projectConfigPath(env.projectRoot), join(env.projectRoot, '.dsh', 'skill-manager.json'));
});

test('project config: write/read round-trip keeps schema fields', async (t) => {
	const env = await makeEnv();
	t.after(env.cleanup);
	const cfg = {
		enabled: ['skill-b', 'skill-a'],
		sources: { 'skill-a': { source: 'user-dsh', generated: false } },
		appliedPreset: '精简集',
		updatedAt: '2026-08-17T00:00:00.000Z',
	};
	await writeProjectConfig(env.projectRoot, cfg, env.opts);
	const { config } = await readProjectConfig(env.projectRoot, env.opts);
	assert.deepEqual([...config.enabled].sort(), ['skill-a', 'skill-b']);
	assert.equal(config.sources['skill-a'].source, 'user-dsh');
	assert.equal(config.appliedPreset, '精简集');
});

test('project config: corrupt file degrades to empty and is rewritten', async (t) => {
	const env = await makeEnv();
	t.after(env.cleanup);
	await writeFile(join(env.projectRoot, '.dsh', 'skill-manager.json'), '{ not json !!!', 'utf8');
	const first = await readProjectConfig(env.projectRoot, env.opts);
	assert.equal(first.existed, true);
	assert.deepEqual(first.config.enabled, []);
	await writeProjectConfig(env.projectRoot, { enabled: ['x'], sources: {} }, env.opts);
	const second = await readProjectConfig(env.projectRoot, env.opts);
	assert.equal(second.corrupt, false);
	assert.deepEqual(second.config.enabled, ['x']);
});

test('project config: missing root is rejected with 400', async (t) => {
	const env = await makeEnv();
	t.after(env.cleanup);
	await assert.rejects(
		() => writeProjectConfig(join(env.root, 'nope'), { enabled: [], sources: {} }, env.opts),
		(error) => error instanceof ApiError && error.status === 400,
	);
});

test('assertCwd: rejects missing and non-directory paths, resolves relative', async (t) => {
	const env = await makeEnv();
	t.after(env.cleanup);
	await assert.rejects(() => assertCwd(join(env.root, 'ghost')), (e) => e.status === 400);
	await assert.rejects(() => assertCwd(join(env.userDsh, 'a.md')), (e) => e.status === 400);
	const resolved = await assertCwd(join(env.cwd, '..', 'beta'));
	assert.equal(resolved, env.betaRoot);
	assert.equal(await assertCwd(undefined), undefined);
});

test('findProjectRoot: walks up to .git, falls back to cwd', async (t) => {
	const env = await makeEnv();
	t.after(env.cleanup);
	assert.equal(await findProjectRoot(env.cwd), env.projectRoot);
	const deep = join(env.projectRoot, 'src', 'x');
	await mkdir(deep, { recursive: true });
	assert.equal(await findProjectRoot(deep), env.projectRoot);
	const loose = join(env.home, 'loose');
	await mkdir(loose, { recursive: true });
	assert.equal(await findProjectRoot(loose), loose);
});

test('validateTagList: trims, dedupes, drops invalid, caps at 20', () => {
	const tags = validateTagList([' a ', 'A', '', 'b', 'c'.padEnd(40), ...Array.from({ length: 30 }, (_, i) => `t${i}`)]);
	assert.equal(tags[0], 'a');
	assert.ok(!tags.includes('A')); // case-insensitive dedupe
	assert.ok(!tags.includes(''));
	assert.ok(tags.includes('b'));
	assert.ok(!tags.some((tag) => tag.length > 32));
	assert.equal(tags.length, 20);
	assert.deepEqual(validateTagList('nope'), []);
});

test('global config: preserves legacy globalDefaultOff and unknown fields', async (t) => {
	const env = await makeEnv();
	t.after(env.cleanup);
	const { writeGlobalConfig } = internals;
	await writeGlobalConfig({ globalDefaultOff: true, someFutureField: 42 }, env.opts);
	const { config, raw } = await readGlobalConfig(env.opts);
	assert.equal(config.globalDefaultOff, true);
	assert.equal(raw.someFutureField, 42);
	assert.ok(globalConfigPath(env.opts).endsWith('skill-manager.json'));
});

// ── S2: scanning & same-name merge ──────────────────────────────────────────
test('catalog: same-name skills merge into one identity with priority-ordered sources', async (t) => {
	const env = await makeEnv();
	t.after(env.cleanup);
	await putSkill(env.userDsh, 'dup-skill', 'user version', { format: 'flat' });
	await putSkill(env.globalCodex, 'dup-skill', 'global version', { format: 'dir', files: { 'references/g.md': 'g' } });
	await putSkill(env.presetSkills, 'dup-skill', 'bundled version', { format: 'flat' });
	const api = makeApi(env.opts);
	const { status, value } = await api('catalog', { cwd: env.cwd });
	assert.equal(status, 200);
	const row = identity(value, 'dup-skill');
	assert.ok(row, 'identity exists');
	// The product default (user-dsh, rank 400) loses DSH rank to
	// global-codex (rank 300): reconcile materializes a managed copy of the
	// user source (rank 100), which appears as the first source.
	assert.deepEqual(row.sources.map((s) => s.key), ['project-dsh', 'user-dsh', 'global-codex', 'bundled:preset-a']);
	assert.equal(row.defaultSourceKey, 'user-dsh');
	// Product default (user-dsh, rank 400) loses DSH rank to global-codex
	// (rank 300): reconcile materializes a managed copy of the user source.
	assert.equal(row.sources.find((s) => s.key === 'project-dsh').generated, true);
	assert.equal(row.effectiveSourceKey, 'project-dsh');
	assert.equal(row.description, 'user version');
	// Fresh project: disabled by default.
	assert.equal(row.enabled, false);
	assert.equal(row.modelInvocable, false);
	// Ancillary files listed for dir bundles.
	assert.deepEqual(row.sources.find((s) => s.key === 'global-codex').files, ['references/g.md']);
});

test('catalog: broken source is flagged, others still resolve', async (t) => {
	const env = await makeEnv();
	t.after(env.cleanup);
	await putSkill(env.userDsh, 'half-broken', 'good user', { format: 'flat' });
	await writeFile(join(env.globalCodex, 'half-broken.md'), 'no frontmatter here', 'utf8');
	const api = makeApi(env.opts);
	const { value } = await api('catalog', { cwd: env.cwd });
	const row = identity(value, 'half-broken');
	assert.ok(row.sources.find((s) => s.key === 'global-codex').broken);
	assert.equal(row.defaultSourceKey, 'user-dsh');
	assert.equal(row.description, 'good user');
});

test('catalog: junction-like symlinked dirs are followed', async (t) => {
	const env = await makeEnv();
	t.after(env.cleanup);
	const realDir = join(env.root, 'real-skills');
	await mkdir(realDir, { recursive: true });
	await putSkill(realDir, 'linked-skill', 'via link', { format: 'dir' });
	try {
		const { symlink } = await import('node:fs/promises');
		await symlink(realDir, join(env.home, '.codex', 'skills', 'link-root'), 'dir');
	} catch {
		t.skip('symlinks unavailable in this environment');
		return;
	}
	// discoverInRoot must follow the symlinked entry.
	const { discoverInRoot } = internals;
	const result = await discoverInRoot(join(env.home, '.codex', 'skills', 'link-root'));
	assert.ok(result.skills.some((s) => s.name === 'linked-skill'));
});

// ── S3: enable/disable & derived switches ───────────────────────────────────
test('fresh project: default-off materializes marker stubs for non-project skills only', async (t) => {
	const env = await makeEnv();
	t.after(env.cleanup);
	await putSkill(env.userDsh, 'user-skill', 'a user skill');
	await putSkill(env.userDsh, 'dir-user', 'a dir user skill', { format: 'dir', files: { 'references/r.md': 'r' } });
	await putSkill(env.projDsh, 'proj-skill', 'a project skill', { format: 'dir' });
	await putSkill(env.presetSkills, 'bundled-skill', 'a bundled skill');
	const api = makeApi(env.opts);
	const { status, value } = await api('catalog', { cwd: env.cwd });
	assert.equal(status, 200);
	// Non-project identities get stubs; dir-bundle stubs are flat marker files.
	assert.equal(await hasStub(env.projDsh, 'user-skill'), true);
	assert.equal(await hasStub(env.projDsh, 'dir-user'), true);
	assert.equal(await hasStub(env.projDsh, 'bundled-skill'), true);
	assert.equal(await hasStub(env.projDsh, 'proj-skill'), false);
	// Stubs carry the marker.
	const stub = await readFile(join(env.projDsh, 'user-skill.md'), 'utf8');
	assert.ok(stub.includes(internals.SHADOW_DESC_PREFIX));
	assert.ok(stub.includes('disable-model-invocation: true'));
	// Project skill is disabled via its own flag (no stub), and user-invocable
	// manual invocation stays untouched (no user-invocable key added).
	const projRaw = await readFile(join(env.projDsh, 'proj-skill', 'SKILL.md'), 'utf8');
	assert.ok(projRaw.includes('disable-model-invocation: true'));
	assert.ok(!projRaw.includes('user-invocable'));
	// All rows disabled in a fresh project.
	for (const row of value.identities) assert.equal(row.enabled, false);
});

test('setEnabled: toggling a user skill creates/removes the stub and flips model state', async (t) => {
	const env = await makeEnv();
	t.after(env.cleanup);
	await putSkill(env.userDsh, 'user-skill', 'a user skill');
	const api = makeApi(env.opts);
	await api('catalog', { cwd: env.cwd });
	assert.equal(await hasStub(env.projDsh, 'user-skill'), true);

	const on = await api('setEnabled', { cwd: env.cwd, name: 'user-skill', enabled: true });
	assert.equal(on.status, 200);
	assert.equal(await hasStub(env.projDsh, 'user-skill'), false);
	assert.equal(on.value.view.enabled, true);
	const { value: v1 } = await api('catalog', { cwd: env.cwd });
	assert.equal(identity(v1, 'user-skill').modelInvocable, true);
	// The user original is never modified (no flag added).
	const raw = await readFile(join(env.userDsh, 'user-skill.md'), 'utf8');
	assert.ok(!raw.includes('disable-model-invocation'));

	const off = await api('setEnabled', { cwd: env.cwd, name: 'user-skill', enabled: false });
	assert.equal(off.status, 200);
	assert.equal(await hasStub(env.projDsh, 'user-skill'), true);
	const { value: v2 } = await api('catalog', { cwd: env.cwd });
	assert.equal(identity(v2, 'user-skill').modelInvocable, false);
});

test('setEnabled: project skill toggles its own frontmatter flag byte-safely', async (t) => {
	const env = await makeEnv();
	t.after(env.cleanup);
	const original = skillMd('proj-skill', 'a project skill', {});
	await putSkill(env.projDsh, 'proj-skill', 'a project skill', { format: 'dir' });
	const api = makeApi(env.opts);
	await api('catalog', { cwd: env.cwd }); // default-off flags it
	const disabledRaw = await readFile(join(env.projDsh, 'proj-skill', 'SKILL.md'), 'utf8');
	assert.ok(disabledRaw.includes('disable-model-invocation: true'));

	const { value } = await api('setEnabled', { cwd: env.cwd, name: 'proj-skill', enabled: true });
	assert.equal(value.view.enabled, true);
	const enabledRaw = await readFile(join(env.projDsh, 'proj-skill', 'SKILL.md'), 'utf8');
	assert.equal(enabledRaw, original); // flag removed, nothing else changed
});

test('setMany: bulk enable/disable updates the enabled set atomically', async (t) => {
	const env = await makeEnv();
	t.after(env.cleanup);
	await putSkill(env.userDsh, 'bulk-a', 'a');
	await putSkill(env.userDsh, 'bulk-b', 'b');
	const api = makeApi(env.opts);
	await api('catalog', { cwd: env.cwd });
	const { status } = await api('setMany', { cwd: env.cwd, names: ['bulk-a', 'bulk-b'], enabled: true });
	assert.equal(status, 200);
	assert.equal(await hasStub(env.projDsh, 'bulk-a'), false);
	assert.equal(await hasStub(env.projDsh, 'bulk-b'), false);
	const { value } = await api('catalog', { cwd: env.cwd });
	assert.equal(identity(value, 'bulk-a').enabled, true);
	assert.equal(identity(value, 'bulk-b').enabled, true);
	await api('setMany', { cwd: env.cwd, names: ['bulk-a', 'bulk-b'], enabled: false });
	const { value: v2 } = await api('catalog', { cwd: env.cwd });
	assert.equal(identity(v2, 'bulk-a').enabled, false);
	assert.equal(await hasStub(env.projDsh, 'bulk-a'), true);
});

test('orphaned stubs are cleaned; foreign same-name files are never touched', async (t) => {
	const env = await makeEnv();
	t.after(env.cleanup);
	await putSkill(env.userDsh, 'lives', 'stays');
	// Orphan: stub for a skill that exists nowhere.
	await writeFile(join(env.projDsh, 'ghost.md'), internals.markerContent('ghost', env.projectRoot), 'utf8');
	// Foreign same-name file (no marker): the skill is "foreign" in the project root.
	await putSkill(env.projDsh, 'foreign-name', 'not ours');
	const api = makeApi(env.opts);
	const { value, } = await api('catalog', { cwd: env.cwd });
	assert.equal(await hasStub(env.projDsh, 'ghost'), false);
	// foreign-name is a real project skill: disabled via its own flag, no stub.
	const row = identity(value, 'foreign-name');
	assert.equal(row.enabled, false);
	assert.equal(row.specialized, true);
	const raw = await readFile(join(env.projDsh, 'foreign-name.md'), 'utf8');
	assert.ok(raw.includes('disable-model-invocation: true'));
});

test('setEnabled: unknown skill is 404; bad name is 400', async (t) => {
	const env = await makeEnv();
	t.after(env.cleanup);
	const api = makeApi(env.opts);
	await api('catalog', { cwd: env.cwd });
	const missing = await api('setEnabled', { cwd: env.cwd, name: 'nope-skill', enabled: true });
	assert.equal(missing.status, 404);
	const bad = await api('setEnabled', { cwd: env.cwd, name: 'Bad_Name', enabled: true });
	assert.equal(bad.status, 400);
});

// ── S3/S6: source selection & managed copies ────────────────────────────────
test('setSource: selecting a rank-losing source materializes a managed copy', async (t) => {
	const env = await makeEnv();
	t.after(env.cleanup);
	await putSkill(env.userDsh, 'src-skill', 'from user root');
	await putSkill(env.userAgents, 'src-skill', 'from agents root');
	const api = makeApi(env.opts);
	await api('catalog', { cwd: env.cwd });
	// user-dsh (400) is the product default and the DSH winner over
	// user-agents (500): selecting it is a pure selection (no copy).
	const pure = await api('setSource', { cwd: env.cwd, name: 'src-skill', source: 'user-dsh' });
	assert.equal(pure.status, 200);
	assert.equal(pure.value.view.sourceKey, 'user-dsh');
	assert.equal(pure.value.view.sources.find((s) => s.key === 'project-dsh'), undefined);

	// Add global-codex (rank 300): it now outranks user-dsh (400), so
	// keeping the user-dsh selection requires a managed copy.
	await putSkill(env.globalCodex, 'src-skill', 'from global codex');
	const withCopy = await api('setSource', { cwd: env.cwd, name: 'src-skill', source: 'user-dsh' });
	assert.equal(withCopy.status, 200);
	const row = withCopy.value.view; // response carries the updated identity row
	assert.equal(row.sourceKey, 'user-dsh');
	assert.equal(row.effectiveSourceKey, 'project-dsh');
	assert.equal(row.sources.find((s) => s.key === 'project-dsh').generated, true);
	assert.equal(row.description, 'from user root');
	// Config registration carries generated + hashes.
	const { config } = await internals.buildProjectView(env.cwd, env.opts);
	const entry = config.sources['src-skill'];
	assert.equal(entry.generated, true);
	assert.equal(entry.source, 'user-dsh');
	assert.match(entry.copyHash, /^sha256:/);
	assert.match(entry.originHash, /^sha256:/);
});

test('setSource: default materializes a copy when rank loses; pure selection removes it', async (t) => {
	const env = await makeEnv();
	t.after(env.cleanup);
	await putSkill(env.userDsh, 'reset-skill', 'user origin');
	await putSkill(env.globalCodex, 'reset-skill', 'global origin');
	const api = makeApi(env.opts);
	await api('catalog', { cwd: env.cwd });
	// Fresh project: product default is user-dsh (400) but DSH rank wins
	// with global-codex (300) → reconcile materialized a managed copy of the
	// user source.
	let row = identity((await api('catalog', { cwd: env.cwd })).value, 'reset-skill');
	assert.ok(row.sources.some((s) => s.key === 'project-dsh' && s.generated), 'default copy exists');
	// Selecting the rank-winning global source is a pure selection: the now
	// redundant managed copy is removed (marker-verified).
	await api('setSource', { cwd: env.cwd, name: 'reset-skill', source: 'global-codex' });
	row = identity((await api('catalog', { cwd: env.cwd })).value, 'reset-skill');
	assert.equal(row.sourceKey, 'global-codex');
	assert.equal(row.sources.find((s) => s.key === 'project-dsh'), undefined);
	// Restoring the default re-materializes the user-source copy.
	const restored = await api('setSource', { cwd: env.cwd, name: 'reset-skill', source: null });
	assert.equal(restored.status, 200);
	row = restored.value.view;
	assert.equal(row.sourceKey, null);
	assert.ok(row.sources.some((s) => s.key === 'project-dsh' && s.generated), 'default copy back');
});

test('setSource: conflicts are rejected without touching files', async (t) => {
	const env = await makeEnv();
	t.after(env.cleanup);
	await putSkill(env.userDsh, 'conflict-a', 'user origin');
	await putSkill(env.projDsh, 'conflict-a', 'project owns this');
	const api = makeApi(env.opts);
	await api('catalog', { cwd: env.cwd });
	const blocked = await api('setSource', { cwd: env.cwd, name: 'conflict-a', source: 'user-dsh' });
	assert.equal(blocked.status, 409);
	assert.match(blocked.value.error.message, /同名/);

	await writeFile(join(env.globalCodex, 'conflict-b.md'), 'broken frontmatter', 'utf8');
	await putSkill(env.userDsh, 'conflict-b', 'user origin b');
	const brokenSel = await api('setSource', { cwd: env.cwd, name: 'conflict-b', source: 'global-codex' });
	assert.equal(brokenSel.status, 409);
});

test('setSource: user-modified copy is protected (409, file kept)', async (t) => {
	const env = await makeEnv();
	t.after(env.cleanup);
	await putSkill(env.userDsh, 'keepme', 'origin version');
	await putSkill(env.globalCodex, 'keepme', 'global version');
	const api = makeApi(env.opts);
	await api('catalog', { cwd: env.cwd });
	// Fresh project: the default (user-dsh) copy is already materialized
	// because global-codex (rank 300) outranks user-dsh (rank 400).
	const copyPath = join(env.projDsh, 'keepme.md'); // flat origin → flat copy
	// User edits the managed copy → it becomes a project file.
	await writeFile(copyPath, (await readFile(copyPath, 'utf8')).replace('origin version', 'user-edited version'), 'utf8');
	const row = identity((await api('catalog', { cwd: env.cwd })).value, 'keepme');
	assert.equal(row.sources.find((s) => s.key === 'project-dsh').modified, true);
	assert.equal(row.specialized, true);
	assert.equal(row.effectiveSourceKey, 'project-dsh');
	const reset = await api('setSource', { cwd: env.cwd, name: 'keepme', source: null });
	assert.equal(reset.status, 409);
	assert.equal(await readFile(copyPath, 'utf8').then((c) => c.includes('user-edited version')), true);
	// Selecting a rank-losing origin is also blocked while the copy diverges.
	const swap = await api('setSource', { cwd: env.cwd, name: 'keepme', source: 'user-dsh' });
	assert.equal(swap.status, 409);
	assert.equal(await readFile(copyPath, 'utf8').then((c) => c.includes('user-edited version')), true);
});

test('source selection copy honors the enabled state (flag synced)', async (t) => {
	const env = await makeEnv();
	t.after(env.cleanup);
	await putSkill(env.userDsh, 'flagged-copy', 'origin');
	await putSkill(env.globalCodex, 'flagged-copy', 'global');
	const api = makeApi(env.opts);
	await api('catalog', { cwd: env.cwd });
	// Enable first: the default (user-dsh) copy is created flagged-off by the
	// default materialization... it is disabled by default, so enable it.
	await api('setEnabled', { cwd: env.cwd, name: 'flagged-copy', enabled: true });
	// Switch the explicit selection to the rank-winning global source: the
	// managed copy is removed, no flag involved.
	await api('setSource', { cwd: env.cwd, name: 'flagged-copy', source: 'global-codex' });
	// Then back to user-dsh: a copy is materialized while enabled → flag off.
	const { value } = await api('setSource', { cwd: env.cwd, name: 'flagged-copy', source: 'user-dsh' });
	const row = value.view;
	assert.equal(row.enabled, true);
	assert.equal(row.modelInvocable, true);
	const copyRaw = await readFile(join(env.projDsh, 'flagged-copy.md'), 'utf8');
	assert.ok(!copyRaw.includes('disable-model-invocation'));
	// Disable again: the copy keeps existing, its flag flips on.
	await api('setEnabled', { cwd: env.cwd, name: 'flagged-copy', enabled: false });
	const { value: v2 } = await api('catalog', { cwd: env.cwd });
	assert.equal(identity(v2, 'flagged-copy').modelInvocable, false);
	const copyRaw2 = await readFile(join(env.projDsh, 'flagged-copy.md'), 'utf8');
	assert.ok(copyRaw2.includes('disable-model-invocation: true'));
});

// ── S4: global tags ─────────────────────────────────────────────────────────
test('setTags: persists globally, shows in catalog, syncs across pages', async (t) => {
	const env = await makeEnv();
	t.after(env.cleanup);
	await putSkill(env.userDsh, 'tagged', 'to be tagged');
	const api = makeApi(env.opts);
	await api('catalog', { cwd: env.cwd });
	const set = await api('setTags', { cwd: env.cwd, name: 'tagged', tags: ['测试', '流程', '测试'] });
	assert.equal(set.status, 200);
	assert.deepEqual(set.value.tags, ['测试', '流程']);
	// Project page shows tags.
	const proj = await api('catalog', { cwd: env.cwd });
	assert.deepEqual(identity(proj.value, 'tagged').tags, ['测试', '流程']);
	assert.ok(proj.value.allTags.includes('测试'));
	// Library page (no cwd) shows the same global tags.
	const lib = await api('catalog', {});
	assert.deepEqual(identity(lib.value, 'tagged').tags, ['测试', '流程']);
	// Clearing removes the tag entry.
	await api('setTags', { cwd: env.cwd, name: 'tagged', tags: [] });
	const { config } = await readGlobalConfig(env.opts);
	assert.equal(config.tags['tagged'], undefined);
});

test('setTags: unknown skill is 404; invalid tags are dropped', async (t) => {
	const env = await makeEnv();
	t.after(env.cleanup);
	const api = makeApi(env.opts);
	await api('catalog', { cwd: env.cwd });
	const missing = await api('setTags', { cwd: env.cwd, name: 'ghost-tag', tags: ['x'] });
	assert.equal(missing.status, 404);
	await putSkill(env.userDsh, 'tag2', 'two');
	await api('setTags', { cwd: env.cwd, name: 'tag2', tags: ['ok', '', 'way-too-long-tag-that-exceeds-the-thirty-two-character-limit', 'ok'] });
	const { config } = await readGlobalConfig(env.opts);
	assert.deepEqual(config.tags['tag2'], ['ok']);
});

// ── S5: presets ─────────────────────────────────────────────────────────────
test('presets: save from project captures enabled set + chosen sources only', async (t) => {
	const env = await makeEnv();
	t.after(env.cleanup);
	await putSkill(env.userDsh, 'pre-a', 'a');
	await putSkill(env.userDsh, 'pre-b', 'b');
	await putSkill(env.globalCodex, 'pre-b', 'b global');
	const api = makeApi(env.opts);
	await api('catalog', { cwd: env.cwd });
	await api('setMany', { cwd: env.cwd, names: ['pre-a', 'pre-b'], enabled: true });
	await api('setSource', { cwd: env.cwd, name: 'pre-b', source: 'global-codex' });
	const saved = await api('presets.save', { cwd: env.cwd, name: '测试研发精简集', description: '日常测试用' });
	assert.equal(saved.status, 200);
	assert.equal(saved.value.skillCount, 2);
	const { config } = await readGlobalConfig(env.opts);
	const preset = config.presets['测试研发精简集'];
	assert.deepEqual(Object.keys(preset.skills).sort(), ['pre-a', 'pre-b']);
	assert.equal(preset.skills['pre-b'].source, 'global-codex');
	assert.deepEqual(preset.skills['pre-a'], {}); // no source selection for pre-a
	assert.equal(preset.description, '日常测试用');
	const list = await api('presets.list');
	assert.equal(list.value.presets.length, 1);
	assert.equal(list.value.presets[0].skillCount, 2);
});

test('presets.preview: replace and merge diffs are accurate', async (t) => {
	const env = await makeEnv();
	t.after(env.cleanup);
	await putSkill(env.userDsh, 'pa', 'a');
	await putSkill(env.userDsh, 'pb', 'b');
	await putSkill(env.userDsh, 'pc', 'c');
	const api = makeApi(env.opts);
	await api('catalog', { cwd: env.cwd });
	// Project currently enables a+b.
	await api('setMany', { cwd: env.cwd, names: ['pa', 'pb'], enabled: true });
	// Preset contains b+c.
	await api('setSource', { cwd: env.cwd, name: 'pc', source: 'user-dsh' });
	await api('setMany', { cwd: env.cwd, names: ['pc'], enabled: true });
	await api('setMany', { cwd: env.cwd, names: ['pa'], enabled: false });
	await api('presets.save', { cwd: env.cwd, name: 'pc-only' });
	// Back to a+b for the preview.
	await api('setMany', { cwd: env.cwd, names: ['pa', 'pb'], enabled: true });
	await api('setMany', { cwd: env.cwd, names: ['pc'], enabled: false });

	// Current enabled = {pa, pb}; preset pc-only = {pb, pc}.
	const replace = await api('presets.preview', { cwd: env.cwd, name: 'pc-only', mode: 'replace' });
	assert.deepEqual(replace.value.diff.toEnable, ['pc']);
	assert.deepEqual(replace.value.diff.toDisable, ['pa']);
	assert.deepEqual(replace.value.diff.finalEnabled.sort(), ['pb', 'pc']);

	const merge = await api('presets.preview', { cwd: env.cwd, name: 'pc-only', mode: 'merge' });
	assert.deepEqual(merge.value.diff.toEnable, ['pc']);
	assert.deepEqual(merge.value.diff.toDisable, []);
	assert.deepEqual(merge.value.diff.finalEnabled.sort(), ['pa', 'pb', 'pc']);
	// Preview writes nothing.
	const { config } = await internals.buildProjectView(env.cwd, env.opts);
	assert.deepEqual([...config.enabled].sort(), ['pa', 'pb']);
});

test('presets.apply: replace sets the exact set; merge unions; sources materialize', async (t) => {
	const env = await makeEnv();
	t.after(env.cleanup);
	await putSkill(env.userDsh, 'pa', 'a');
	await putSkill(env.userDsh, 'pb', 'b');
	await putSkill(env.globalCodex, 'pb', 'b global');
	await putSkill(env.userDsh, 'pc', 'c');
	const api = makeApi(env.opts);
	await api('catalog', { cwd: env.cwd });
	await api('setMany', { cwd: env.cwd, names: ['pa', 'pb'], enabled: true });
	// Build a preset whose pb selection is the rank-losing user source: the
	// managed copy of user-dsh is the materialized state.
	await api('setSource', { cwd: env.cwd, name: 'pb', source: 'user-dsh' });
	await api('setMany', { cwd: env.cwd, names: ['pc'], enabled: true });
	await api('setMany', { cwd: env.cwd, names: ['pa'], enabled: false });
	await api('presets.save', { cwd: env.cwd, name: 'preset-x' });

	// Replace on the current project (pa+pb enabled): final = preset (pb, pc).
	const applied = await api('presets.apply', { cwd: env.cwd, name: 'preset-x', mode: 'replace' });
	assert.equal(applied.status, 200);
	let { value } = await api('catalog', { cwd: env.cwd });
	assert.deepEqual(identity(value, 'pa').enabled, false);
	assert.equal(identity(value, 'pb').enabled, true);
	assert.equal(identity(value, 'pc').enabled, true);
	// pb's preset source selection was re-applied (copy present).
	assert.ok(identity(value, 'pb').sources.some((s) => s.key === 'project-dsh' && s.generated));

	// Merge on a fresh project (beta): union with beta's current set (empty).
	const beta = await api('presets.apply', { cwd: env.betaCwd, name: 'preset-x', mode: 'merge' });
	assert.equal(beta.status, 200);
	({ value } = await api('catalog', { cwd: env.betaCwd }));
	assert.equal(identity(value, 'pb').enabled, true);
	assert.equal(identity(value, 'pc').enabled, true);
});

test('presets: default slim set is unique; slim.preview/apply use it', async (t) => {
	const env = await makeEnv();
	t.after(env.cleanup);
	await putSkill(env.userDsh, 'sa', 'a');
	await putSkill(env.userDsh, 'sb', 'b');
	await putSkill(env.userDsh, 'sc', 'c');
	const api = makeApi(env.opts);
	await api('catalog', { cwd: env.cwd });
	await api('setMany', { cwd: env.cwd, names: ['sa', 'sb', 'sc'], enabled: true });
	await api('presets.save', { cwd: env.cwd, name: 'all-three' });
	await api('setMany', { cwd: env.cwd, names: ['sa'], enabled: true });
	await api('setMany', { cwd: env.cwd, names: ['sb', 'sc'], enabled: false });
	await api('presets.save', { cwd: env.cwd, name: 'slim-a' });
	const setDefault = await api('presets.setDefault', { name: 'slim-a' });
	assert.equal(setDefault.status, 200);
	// Re-enable everything so 一键精简 actually does something.
	await api('setMany', { cwd: env.cwd, names: ['sa', 'sb', 'sc'], enabled: true });
	const preview = await api('slim.preview', { cwd: env.cwd });
	assert.equal(preview.value.kind, 'preset');
	assert.equal(preview.value.preset, 'slim-a');
	// Current enabled = {sa, sb, sc}; preset slim-a = {sa}.
	assert.deepEqual(preview.value.diff.toEnable, []);
	assert.deepEqual(preview.value.diff.toDisable.sort(), ['sb', 'sc']);
	const applied = await api('slim.apply', { cwd: env.cwd });
	assert.equal(applied.status, 200);
	const { value } = await api('catalog', { cwd: env.cwd });
	assert.equal(identity(value, 'sa').enabled, true);
	assert.equal(identity(value, 'sb').enabled, false);
	assert.equal(identity(value, 'sc').enabled, false);
	// Setting another default clears the previous one.
	await api('presets.setDefault', { name: 'all-three' });
	const { config } = await readGlobalConfig(env.opts);
	assert.deepEqual(Object.values(config.presets).filter((p) => p.defaultSlim), [config.presets['all-three']]);
});

test('slim: without a default preset it previews and applies disable-all', async (t) => {
	const env = await makeEnv();
	t.after(env.cleanup);
	await putSkill(env.userDsh, 'x1', 'one');
	await putSkill(env.userDsh, 'x2', 'two');
	const api = makeApi(env.opts);
	await api('catalog', { cwd: env.cwd });
	await api('setMany', { cwd: env.cwd, names: ['x1', 'x2'], enabled: true });
	const preview = await api('slim.preview', { cwd: env.cwd });
	assert.equal(preview.value.kind, 'all');
	assert.deepEqual(preview.value.diff.toDisable.sort(), ['x1', 'x2']);
	await api('slim.apply', { cwd: env.cwd });
	const { value } = await api('catalog', { cwd: env.cwd });
	assert.equal(identity(value, 'x1').enabled, false);
	assert.equal(identity(value, 'x2').enabled, false);
});

test('presets: apply rejects unknown preset and missing skills', async (t) => {
	const env = await makeEnv();
	t.after(env.cleanup);
	const api = makeApi(env.opts);
	await api('catalog', { cwd: env.cwd });
	const missing = await api('presets.apply', { cwd: env.cwd, name: 'nope', mode: 'replace' });
	assert.equal(missing.status, 404);
	await api('presets.save', { cwd: env.cwd, name: 'empty' });
	await api('setTags', { cwd: env.cwd, name: 'ghost-skill', tags: [] }).catch(() => {});
	// Craft a preset referencing a skill that will not exist: save with a name,
	// then delete the skill file out from under it.
	await putSkill(env.userDsh, 'ephemeral', 'gone soon');
	await api('setEnabled', { cwd: env.cwd, name: 'ephemeral', enabled: true });
	await api('presets.save', { cwd: env.cwd, name: 'ghostly' });
	await rm(join(env.userDsh, 'ephemeral.md'));
	const stale = await api('presets.apply', { cwd: env.cwd, name: 'ghostly', mode: 'replace' });
	assert.equal(stale.status, 404);
	const del = await api('presets.delete', { name: 'ghostly' });
	assert.equal(del.status, 200);
	const delMissing = await api('presets.delete', { name: 'ghostly' });
	assert.equal(delMissing.status, 404);
});

// ── S6: legacy compatibility ────────────────────────────────────────────────
test('legacy list: unchanged shape with apiVersion 6', async (t) => {
	const env = await makeEnv();
	t.after(env.cleanup);
	await putSkill(env.userDsh, 'legacy-one', 'one');
	await putSkill(env.presetSkills, 'legacy-one', 'bundled one');
	const api = makeApi(env.opts);
	const { status, value } = await api('list', { cwd: env.cwd });
	assert.equal(status, 200);
	assert.equal(value.apiVersion, 6);
	assert.ok(Array.isArray(value.roots));
	assert.ok(value.roots.some((r) => r.id === 'user-dsh'));
	assert.deepEqual(value.policy, { globalDefaultOff: false });
	const bundledRow = value.bundled.find((b) => b.presetId === 'preset-a');
	assert.ok(bundledRow);
	const userRow = value.roots.find((r) => r.id === 'user-dsh');
	assert.equal(userRow.skills[0].name, 'legacy-one');
	// Legacy shadow/disabled markers still computed: user-dsh (rank 400)
	// outranks bundled (rank 600), so the user skill wins and the bundled one
	// is shadowed.
	assert.equal(userRow.skills[0].shadowedBy, undefined);
	assert.equal(userRow.skills[0].disabled, false);
	assert.equal(bundledRow.skills[0].shadowedBy, userRow.label);
});

test('legacy setStatus: user skill shadow create/delete round-trip', async (t) => {
	const env = await makeEnv();
	t.after(env.cleanup);
	await putSkill(env.userDsh, 'legacy-toggle', 't');
	const api = makeApi(env.opts);
	await api('list', { cwd: env.cwd });
	const off = await api('setStatus', { cwd: env.cwd, root: 'user-dsh', name: 'legacy-toggle', disabled: true });
	assert.equal(off.status, 200);
	assert.equal(off.value.where, 'shadow');
	assert.equal(await hasStub(env.projDsh, 'legacy-toggle'), true);
	const on = await api('setStatus', { cwd: env.cwd, root: 'user-dsh', name: 'legacy-toggle', disabled: false });
	assert.equal(on.status, 200);
	assert.equal(await hasStub(env.projDsh, 'legacy-toggle'), false);
});

test('legacy policy: globalDefaultOff flags user skills and rejects nothing', async (t) => {
	const env = await makeEnv();
	t.after(env.cleanup);
	await putSkill(env.userDsh, 'policy-skill', 'p');
	const api = makeApi(env.opts);
	const on = await api('setPolicy', { cwd: env.cwd, globalDefaultOff: true });
	assert.equal(on.status, 200);
	assert.equal(on.value.globalDefaultOff, true);
	const raw = await readFile(join(env.userDsh, 'policy-skill.md'), 'utf8');
	assert.ok(raw.includes('disable-model-invocation: true'));
	const state = await api('getPolicy');
	assert.equal(state.value.globalDefaultOff, true);
	await api('setPolicy', { cwd: env.cwd, globalDefaultOff: false });
	const again = await api('getPolicy');
	assert.equal(again.value.globalDefaultOff, false);
});

test('legacy read/save/import/delete/exportZip still work', async (t) => {
	const env = await makeEnv();
	t.after(env.cleanup);
	await putSkill(env.userDsh, 'io-skill', 'io', { format: 'dir', files: { 'references/extra.md': 'extra' } });
	const api = makeApi(env.opts);
	const read = await api('read', { cwd: env.cwd, root: 'user-dsh', name: 'io-skill' });
	assert.equal(read.status, 200);
	assert.ok(read.value.content.includes('io-skill'));
	const imported = await api('import', { cwd: env.cwd, root: 'user-agents', content: skillMd('new-skill', 'brand new') });
	assert.equal(imported.status, 200);
	const saved = await api('save', { cwd: env.cwd, root: 'user-agents', name: 'new-skill', content: skillMd('new-skill', 'edited') });
	assert.equal(saved.status, 200);
	const badSave = await api('save', { cwd: env.cwd, root: 'user-agents', name: 'new-skill', content: 'no frontmatter' });
	assert.equal(badSave.status, 400);
	const zip = await api('exportZip', { cwd: env.cwd, root: 'user-dsh', names: ['io-skill'] });
	assert.equal(zip.status, 200);
	assert.match(zip.headers['content-type'], /application\/zip/);
	assert.match(zip.headers['content-disposition'], /io-skill\.zip/);
	const del = await api('delete', { cwd: env.cwd, root: 'user-agents', name: 'new-skill' });
	assert.equal(del.status, 200);
	const gone = await api('read', { cwd: env.cwd, root: 'user-agents', name: 'new-skill' });
	assert.equal(gone.status, 404);
});

test('read-only roots: bundled save/delete 403, global delete 403', async (t) => {
	const env = await makeEnv();
	t.after(env.cleanup);
	await putSkill(env.presetSkills, 'ro-skill', 'ro');
	await putSkill(env.globalCodex, 'ro-global', 'rg');
	const api = makeApi(env.opts);
	const save = await api('save', { cwd: env.cwd, root: 'bundled:preset-a', name: 'ro-skill', content: skillMd('ro-skill', 'x') });
	assert.equal(save.status, 403);
	const delBundled = await api('delete', { cwd: env.cwd, root: 'bundled:preset-a', name: 'ro-skill' });
	assert.equal(delBundled.status, 403);
	const delGlobal = await api('delete', { cwd: env.cwd, root: 'global-codex', name: 'ro-global' });
	assert.equal(delGlobal.status, 403);
});

test('hashSkillSource: flat and dir bundles are stable and sensitive to edits', async (t) => {
	const env = await makeEnv();
	t.after(env.cleanup);
	const flatP = await putSkill(env.userDsh, 'hash-flat', 'h');
	const dirP = await putSkill(env.userDsh, 'hash-dir', 'h', { format: 'dir', files: { 'references/a.md': 'A' } });
	const h1 = await hashSkillSource(flatP, 'flat');
	const d1 = await hashSkillSource(dirP, 'dir');
	assert.equal(h1, await hashSkillSource(flatP, 'flat'));
	assert.equal(d1, await hashSkillSource(dirP, 'dir'));
	await writeFile(flatP, (await readFile(flatP, 'utf8')) + '\n', 'utf8');
	assert.notEqual(h1, await hashSkillSource(flatP, 'flat'));
	assert.notEqual(d1, await hashSkillSource(flatP, 'flat')); // different format
});

test('project config: read-only project root is rejected with 409', async (t) => {
	const env = await makeEnv();
	// node:test after-hooks run FIFO, so the cleanup must restore the root permissions itself;
	// a separate restore hook registered later would run after the cleanup on POSIX.
	t.after(async () => {
		await chmod(env.projectRoot, 0o755).catch(() => {});
		await env.cleanup();
	});
	try {
		await chmod(env.projectRoot, 0o555);
	} catch {
		t.skip('chmod not effective on this platform');
		return;
	}
	let blocked = false;
	try {
		await access(env.projectRoot, constants.W_OK);
	} catch {
		blocked = true;
	}
	if (!blocked) {
		t.skip('filesystem does not enforce read-only here');
		return;
	}
	await assert.rejects(
		() => writeProjectConfig(env.projectRoot, { enabled: [], sources: {} }, env.opts),
		(error) => error instanceof ApiError && error.status === 409,
	);
});
