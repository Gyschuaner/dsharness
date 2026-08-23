import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
	ApiError,
	MOUNT_START,
	OVERRIDE_START,
	compareVersions,
	createPluginManager,
	extractManagedBlock,
	parsePatchRows,
	replaceManagedBlock,
	validateImportSource,
} from '../lib/state.js';

async function json(path, value) {
	await mkdir(join(path, '..'), { recursive: true });
	await writeFile(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'dsh-plugin-manager-'));
	const profile = join(root, 'profiles', 'web');
	await mkdir(profile, { recursive: true });
	const deps = {
		'dsh-extension-manager': 'link:C:/plugins/extension-manager',
		'dsh-plugin-manager': 'link:C:/plugins/plugin-manager',
		'dsh-skill-manager': 'link:C:/plugins/skill-manager',
		'dsh-better-sidebar': '^0.12.3',
		'ordinary-library': '^1.0.0',
	};
	await json(join(profile, 'package.json'), { name: 'fixture', private: true, dependencies: deps, dsh: { profile: { bundles: ['dsh-better-sidebar'] } } });
	for (const name of Object.keys(deps)) {
		const dir = join(profile, 'node_modules', name);
		await mkdir(dir, { recursive: true });
		const isPlugin = name !== 'ordinary-library';
		await json(join(dir, 'package.json'), {
			name,
			version: name === 'dsh-better-sidebar' ? '0.12.3' : '0.1.0',
			description: `${name} description. More detail.`,
			main: './lib/index.js',
			exports: { './client': './lib/client.js' },
			repository: name === 'dsh-better-sidebar' ? 'https://github.com/omdsh-dev/DSH-better-sidebar.git' : undefined,
			dsh: isPlugin ? (name === 'dsh-better-sidebar' ? { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' } } : { client: { platform: 'web' } }) : undefined,
		});
		if (name === 'dsh-better-sidebar') await writeFile(join(dir, 'cordis.patch.yml'), "- insert:\n  - id: better-sidebar\n    name: 'dsh-better-sidebar'\n", 'utf8');
	}
	const patch = [
		'# user rows stay byte-for-byte stable',
		'- insert:',
		"  - id: extension-manager",
		"    name: 'dsh-extension-manager'",
		'- insert:',
		"  - id: skill-manager",
		"    name: 'dsh-skill-manager'",
		'- insert:',
		"  - id: plugin-manager",
		"    name: 'dsh-plugin-manager'",
		'',
	].join('\n');
	await writeFile(join(profile, 'cordis.patch.yml'), patch, 'utf8');
	return { root, profile, patch };
}

function response(value, status = 200, headers = {}) {
	return {
		ok: status >= 200 && status < 300,
		status,
		headers: { get: (name) => headers[name.toLowerCase()] ?? null },
		json: async () => value,
		text: async () => typeof value === 'string' ? value : JSON.stringify(value),
	};
}

test('lists only DSH plugins with source, row identity, protected and live runtime state', async () => {
	const f = await fixture();
	const manager = createPluginManager({ profileDir: f.profile, deps: { inventory: { list: () => ({ entries: [{ entryId: 'better-sidebar', moduleName: 'dsh-better-sidebar', enabled: true, fiberPhase: 'active' }] }) } } });
	const value = await manager.call('list');
	assert.equal(value.apiVersion, 1);
	assert.deepEqual(value.plugins.map((item) => item.name), [
		'dsh-better-sidebar',
		'dsh-extension-manager',
		'dsh-plugin-manager',
		'dsh-skill-manager',
	]);
	const better = value.plugins[0];
	assert.equal(better.rowId, 'better-sidebar');
	assert.equal(better.source, 'npm');
	assert.equal(better.repository, 'omdsh-dev/DSH-better-sidebar');
	assert.equal(better.enabled, true);
	assert.equal(better.runtimePhase, 'active');
	assert.equal(better.runtimeEnabled, true);
	assert.equal(better.description, 'dsh-better-sidebar description.');
	assert.equal(value.plugins.find((item) => item.name === 'dsh-extension-manager').protected, true);
	assert.equal(value.plugins.find((item) => item.name === 'dsh-skill-manager').protected, false);
});

test('disable and enable write only the managed override block', async () => {
	const f = await fixture();
	const manager = createPluginManager({ profileDir: f.profile });
	const disabled = await manager.call('setEnabled', { name: 'dsh-skill-manager', enabled: false });
	assert.equal(disabled.restartRequired, true);
	const afterDisable = await readFile(join(f.profile, 'cordis.patch.yml'), 'utf8');
	assert.ok(afterDisable.startsWith(f.patch.trim()));
	assert.match(extractManagedBlock(afterDisable, OVERRIDE_START, '# plugin-manager:overrides:end'), /id: 'skill-manager'/);
	assert.match(afterDisable, /disabled: true/);
	assert.equal((await manager.call('list')).plugins.find((item) => item.name === 'dsh-skill-manager').enabled, false);

	await manager.call('setEnabled', { name: 'dsh-skill-manager', enabled: true });
	const afterEnable = await readFile(join(f.profile, 'cordis.patch.yml'), 'utf8');
	assert.equal(afterEnable, f.patch);
});

test('protected plugins cannot be disabled and no profile bytes change', async () => {
	const f = await fixture();
	const manager = createPluginManager({ profileDir: f.profile });
	await assert.rejects(manager.call('setEnabled', { name: 'dsh-plugin-manager', enabled: false }), (error) => error instanceof ApiError && error.status === 409 && error.code === 'PLUGIN_PROTECTED');
	assert.equal(await readFile(join(f.profile, 'cordis.patch.yml'), 'utf8'), f.patch);
});

test('atomic write failure leaves original patch intact', async () => {
	const f = await fixture();
	const manager = createPluginManager({ profileDir: f.profile, deps: { writeText: async () => { throw new Error('disk full'); } } });
	await assert.rejects(manager.call('setEnabled', { name: 'dsh-skill-manager', enabled: false }), /disk full/);
	assert.equal(await readFile(join(f.profile, 'cordis.patch.yml'), 'utf8'), f.patch);
});

test('import source validation accepts supported forms and rejects command-shaped input', () => {
	assert.equal(validateImportSource('dsh-demo@latest'), 'dsh-demo@latest');
	assert.equal(validateImportSource('github:owner/repo'), 'github:owner/repo');
	assert.equal(validateImportSource('C:\\plugins\\demo'), 'C:\\plugins\\demo');
	assert.throws(() => validateImportSource(''), /请输入插件/);
	assert.throws(() => validateImportSource('--workspace-root'), /格式不合法/);
	assert.throws(() => validateImportSource('relative/path'), /仅支持/);
});

test('valid imported plugin is mounted in an isolated managed block', async () => {
	const f = await fixture();
	const runDsh = async (args) => {
		assert.equal(args[0], 'plugin');
		assert.equal(args[3], 'add');
		const profileJson = JSON.parse(await readFile(join(f.profile, 'package.json'), 'utf8'));
		profileJson.dependencies['dsh-demo'] = 'link:C:/plugins/demo';
		await json(join(f.profile, 'package.json'), profileJson);
		const dir = join(f.profile, 'node_modules', 'dsh-demo');
		await mkdir(dir, { recursive: true });
		await json(join(dir, 'package.json'), { name: 'dsh-demo', version: '1.0.0', description: 'Demo.', main: './lib/index.js', dsh: { client: { platform: 'web' } } });
		return { stdout: 'ok', stderr: '' };
	};
	const manager = createPluginManager({ profileDir: f.profile, deps: { runDsh } });
	const result = await manager.call('import', { source: 'C:\\plugins\\demo' });
	assert.equal(result.plugin.name, 'dsh-demo');
	assert.equal(result.restartRequired, true);
	const patch = await readFile(join(f.profile, 'cordis.patch.yml'), 'utf8');
	assert.match(extractManagedBlock(patch, MOUNT_START, '# plugin-manager:mounts:end'), /name: 'dsh-demo'/);
	assert.equal(parsePatchRows(patch).filter((row) => row.name === 'dsh-demo').length, 1);
});

test('non-DSH import is rolled back through the official command', async () => {
	const f = await fixture();
	const calls = [];
	const runDsh = async (args) => {
		calls.push(args);
		const profileJson = JSON.parse(await readFile(join(f.profile, 'package.json'), 'utf8'));
		if (args[3] === 'add') {
			profileJson.dependencies['plain-package'] = '^1.0.0';
			await json(join(f.profile, 'package.json'), profileJson);
			const dir = join(f.profile, 'node_modules', 'plain-package');
			await mkdir(dir, { recursive: true });
			await json(join(dir, 'package.json'), { name: 'plain-package', version: '1.0.0' });
		} else if (args[3] === 'remove') {
			delete profileJson.dependencies['plain-package'];
			await json(join(f.profile, 'package.json'), profileJson);
		}
		return { stdout: 'ok', stderr: '' };
	};
	const manager = createPluginManager({ profileDir: f.profile, deps: { runDsh } });
	await assert.rejects(manager.call('import', { source: 'plain-package@1.0.0' }), (error) => error.code === 'PLUGIN_MANIFEST_REQUIRED');
	assert.equal(calls.length, 2);
	assert.equal(calls[1][3], 'remove');
	assert.equal(JSON.parse(await readFile(join(f.profile, 'package.json'), 'utf8')).dependencies['plain-package'], undefined);
});

test('marketplace does not fetch until detail opens, then caches the GitHub result', async () => {
	const f = await fixture();
	let calls = 0;
	const fetch = async (url) => {
		calls += 1;
		if (url.endsWith('/releases/latest')) return response({ tag_name: 'v0.15.2', html_url: 'https://github.com/release' });
		if (url.includes('raw.githubusercontent.com')) return response({ name: 'dsh-better-sidebar', version: '0.15.2', main: './lib/index.js', exports: { './client': './lib/client.js' }, engines: { dsh: '>=0.0.1' }, dsh: { client: { platform: 'web' } } });
		return response({ html_url: 'https://github.com/omdsh-dev/DSH-better-sidebar', description: 'Better sidebar.', owner: { login: 'omdsh-dev' }, stargazers_count: 2710, forks_count: 215, language: 'TypeScript', license: { spdx_id: 'MIT' }, pushed_at: '2026-08-24T00:00:00Z', topics: ['deepseek-harness'], default_branch: 'main' });
	};
	const manager = createPluginManager({ profileDir: f.profile, deps: { fetch } });
	const market = await manager.call('marketplace');
	assert.equal(calls, 0);
	assert.equal(market.items.length, 3);
	assert.equal(market.items[0].status, 'update-available');
	const detail = await manager.call('marketplace.detail', { id: 'omdsh-dev/DSH-better-sidebar' });
	assert.equal(calls, 3);
	assert.equal(detail.status, 'update-available');
	assert.equal(detail.latestVersion, 'v0.15.2');
	assert.equal(detail.manifest.valid, true);
	const cached = await manager.call('marketplace.detail', { id: 'omdsh-dev/DSH-better-sidebar' });
	assert.equal(calls, 3);
	assert.equal(cached.cached, true);
});

test('forced GitHub failure falls back to stale cached detail', async () => {
	const f = await fixture();
	let fail = false;
	const fetch = async (url) => {
		if (fail) throw new Error('offline');
		if (url.endsWith('/releases/latest')) return response({}, 404);
		if (url.includes('raw.githubusercontent.com')) return response({}, 404);
		return response({ html_url: 'https://github.com/omdsh-dev/DSH-better-sidebar', owner: { login: 'omdsh-dev' }, default_branch: 'main' });
	};
	const manager = createPluginManager({ profileDir: f.profile, deps: { fetch } });
	await manager.call('marketplace.detail', { id: 'omdsh-dev/DSH-better-sidebar' });
	fail = true;
	const stale = await manager.call('marketplace.detail', { id: 'omdsh-dev/DSH-better-sidebar', force: true });
	assert.equal(stale.stale, true);
	assert.match(stale.warning, /GitHub 请求失败/);
});

test('managed block helpers are deterministic and semver comparison is conservative', () => {
	const text = 'alpha\n';
	const next = replaceManagedBlock(text, '# start', '# end', "- id: 'x'\n  disabled: true");
	assert.equal(extractManagedBlock(next, '# start', '# end').trim(), "- id: 'x'\n  disabled: true");
	assert.equal(compareVersions('0.12.3', 'v0.15.2'), -1);
	assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
	assert.equal(compareVersions('dev', '1.0.0'), 0);
});
