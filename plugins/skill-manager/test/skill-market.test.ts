// @ts-nocheck
/**
 * dsh-skill-manager — curated marketplace tests (DSH-008 V1.1).
 *
 * The fake GitHub transport exercises the same Host operations used by the
 * browser without allowing a test to touch the real network.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { internals } from '../lib/index.js';

function responseJson(value, status = 200) {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => value,
	};
}

function responseRaw(value, status = 200) {
	const data = Buffer.from(value, 'utf8');
	return {
		ok: status >= 200 && status < 300,
		status,
		body: true,
		arrayBuffer: async () => data,
	};
}

function makeRemote() {
	let revision = 'revision-1';
	let skillBody = 'Original remote instructions.';
	const entry = {
		id: 'acme/demo#skills/demo',
		name: 'demo',
		repository: 'acme/demo',
		path: 'skills/demo',
		ref: 'main',
		description: 'A demo remote skill.',
		tags: ['Demo'],
	};
	const skill = () => `---\nname: demo\ndescription: A demo remote skill.\n---\n\n${skillBody}\n`;
	const fetch = async (url) => {
		if (url === 'https://api.github.com/repos/acme/demo') {
			return responseJson({
				html_url: 'https://github.com/acme/demo',
				description: 'A demo remote skill.',
				owner: { login: 'acme', avatar_url: 'https://avatars.githubusercontent.com/u/1' },
				stargazers_count: 7,
				forks_count: 2,
				language: 'Markdown',
				license: { spdx_id: 'MIT' },
				topics: ['demo'],
				pushed_at: '2026-08-24T00:00:00.000Z',
			});
		}
		if (url.startsWith('https://api.github.com/repos/acme/demo/commits?')) {
			return responseJson([{ sha: revision }]);
		}
		if (url === 'https://api.github.com/repos/acme/demo/git/trees/main?recursive=1') {
			return responseJson({
				truncated: false,
				tree: [
					{ path: 'skills/demo/SKILL.md', type: 'blob', size: Buffer.byteLength(skill()) },
					{ path: 'skills/demo/references/guide.md', type: 'blob', size: 18 },
					{ path: 'skills/demo/../escape.txt', type: 'blob', size: 4 },
					{ path: 'skills/demo/scripts', type: 'tree' },
				],
			});
		}
		if (url === 'https://raw.githubusercontent.com/acme/demo/main/skills/demo/SKILL.md') return responseRaw(skill());
		if (url === 'https://raw.githubusercontent.com/acme/demo/main/skills/demo/references/guide.md') return responseRaw('Remote guide file.\n');
		throw new Error(`unexpected GitHub URL: ${url}`);
	};
	return {
		entry,
		fetch,
		setRevision(value) { revision = value; },
		setBody(value) { skillBody = value; },
	};
}

async function makeEnv(remote) {
	const root = await mkdtemp(join(tmpdir(), 'smgr-market-'));
	const home = join(root, 'home');
	const project = join(root, 'project');
	await mkdir(join(home, '.dsh', 'skills'), { recursive: true });
	await mkdir(join(project, '.git'), { recursive: true });
	await mkdir(join(project, '.dsh', 'skills'), { recursive: true });
	const handler = internals.makeHandler({
		home,
		fetch: remote.fetch,
		marketplace: [remote.entry],
		agentPresets: { list: async () => [] },
		logger: { warn: () => {} },
	});
	const api = async (op, payload = {}) => {
		let status = 0;
		let data;
		const req = {
			method: 'POST',
			[Symbol.asyncIterator]: async function* () {
				yield Buffer.from(JSON.stringify({ op, ...payload }), 'utf8');
			},
		};
		const res = {
			writeHead(value) { status = value; },
			end(value) { data = value; },
		};
		await handler(req, res);
		const parsed = typeof data === 'string' ? JSON.parse(data) : data;
		return { status, value: parsed?.ok === true ? parsed.value : parsed };
	};
	return { root, home, project, api, cleanup: () => rm(root, { recursive: true, force: true }) };
}

test('marketplace: lists real repository metadata and previews a safe install', async (t) => {
	const remote = makeRemote();
	const env = await makeEnv(remote);
	t.after(env.cleanup);
	const listed = await env.api('marketplace', { cwd: env.project });
	assert.equal(listed.status, 200);
	assert.equal(listed.value.source, 'featured+trusted-registries');
	assert.equal(listed.value.items[0].repositoryUrl, 'https://github.com/acme/demo');
	assert.equal(listed.value.items[0].status, 'not-installed');

	const detail = await env.api('marketplace.detail', { cwd: env.project, id: remote.entry.id });
	assert.equal(detail.status, 200);
	assert.equal(detail.value.fileCount, 2);
	assert.equal(detail.value.security.thirdPartyCodeExecuted, false);

	const preview = await env.api('marketplace.preview', { cwd: env.project, id: remote.entry.id });
	assert.equal(preview.status, 200);
	assert.equal(preview.value.action, 'install');
	assert.equal(preview.value.canInstall, true);
	assert.deepEqual(preview.value.incoming.files, ['references/guide.md', 'SKILL.md']);
	assert.equal(preview.value.checks.thirdPartyCodeExecuted, false);
});

test('marketplace: synchronizes trusted remote Skill indexes and deduplicates featured entries', async () => {
	const remote = makeRemote();
	const fetch = async (url) => {
		if (url.includes('/anthropics/skills/main/.claude-plugin/marketplace.json')) return responseJson({
			plugins: [{ name: 'examples', description: 'Official examples.', skills: ['./skills/xlsx', './skills/new-example'] }],
		});
		return remote.fetch(url);
	};
	const market = internals.createMarketplace({ entries: [
		remote.entry,
		{ id: 'anthropics/skills#skills/xlsx', name: 'xlsx', repository: 'anthropics/skills', path: 'skills/xlsx', ref: 'main', description: 'Featured xlsx.', tags: ['Featured'], marketSource: 'featured' },
	], fetch, logger: { warn() {} } });
	const listed = await market.list(undefined, false);
	assert.equal(listed.items.filter((item) => item.id === 'anthropics/skills#skills/xlsx').length, 1);
	const discovered = listed.items.find((item) => item.id === 'anthropics/skills#skills/new-example');
	assert.equal(discovered.marketSource, 'trusted-registry');
	assert.equal(discovered.status, 'project-required');
});

test('marketplace: sorts trusted repositories by GitHub popularity and recency', async () => {
	const entries = [
		{ id: 'acme/old#skills/old', name: 'old', repository: 'acme/old', path: 'skills/old', ref: 'main', description: 'Old popular skill.', tags: [], marketSource: 'trusted-registry' },
		{ id: 'acme/new#skills/new', name: 'new', repository: 'acme/new', path: 'skills/new', ref: 'main', description: 'New skill.', tags: [], marketSource: 'trusted-registry' },
	];
	const fetch = async (url) => {
		if (url.includes('/anthropics/skills/main/.claude-plugin/marketplace.json')) return responseJson({ plugins: [] });
		if (url === 'https://api.github.com/repos/acme/old') return responseJson({ html_url: 'https://github.com/acme/old', owner: { login: 'acme' }, stargazers_count: 100, forks_count: 20, pushed_at: '2026-01-01T00:00:00Z' });
		if (url === 'https://api.github.com/repos/acme/new') return responseJson({ html_url: 'https://github.com/acme/new', owner: { login: 'acme' }, stargazers_count: 5, forks_count: 1, pushed_at: '2026-08-29T00:00:00Z' });
		throw new Error(`unexpected GitHub URL: ${url}`);
	};
	const market = internals.createMarketplace({ entries, fetch, logger: { warn() {} } });
	const popular = await market.list(undefined, false, 'popular');
	assert.deepEqual(popular.items.map((item) => item.name), ['old', 'new']);
	const recent = await market.list(undefined, false, 'recent');
	assert.deepEqual(recent.items.map((item) => item.name), ['new', 'old']);
	await assert.rejects(market.list(undefined, false, 'unknown'), /Skill 市场排序无效/);
});

test('marketplace: uses owner avatars without API metadata and opens a rate-limit circuit', async () => {
	let apiCalls = 0;
	const entry = { id: 'acme/demo#skills/demo', name: 'demo', repository: 'acme/demo', path: 'skills/demo', ref: 'main', description: 'Fallback metadata.', tags: [], marketSource: 'featured' };
	const fetch = async (url) => {
		if (url.includes('/anthropics/skills/main/.claude-plugin/marketplace.json')) return responseJson({ plugins: [] });
		if (url === 'https://api.github.com/repos/acme/demo') {
			apiCalls += 1;
			return { ok: false, status: 403, headers: { get(name) { return name.toLowerCase() === 'x-ratelimit-remaining' ? '0' : name.toLowerCase() === 'x-ratelimit-reset' ? String(Math.floor(Date.now() / 1000) + 3600) : null; } } };
		}
		throw new Error(`unexpected GitHub URL: ${url}`);
	};
	const market = internals.createMarketplace({ entries: [entry], fetch, logger: { warn() {} } });
	const relevance = await market.list(undefined, false, 'relevance');
	assert.equal(relevance.items[0].iconUrl, 'https://github.com/acme.png?size=80');
	assert.equal(apiCalls, 0, 'default listing does not spend GitHub REST quota');

	const popular = await market.list(undefined, false, 'popular');
	assert.match(popular.items[0].iconUrl, /^https:\/\/github\.com\/acme\.png/);
	assert.equal(apiCalls, 1);
	await market.list(undefined, true, 'popular');
	assert.equal(apiCalls, 1, 'rate-limit circuit prevents repeated API requests before reset');
});

test('marketplace: installs disabled, records provenance, and detects updates', async (t) => {
	const remote = makeRemote();
	const env = await makeEnv(remote);
	t.after(env.cleanup);
	const installed = await env.api('marketplace.install', { cwd: env.project, id: remote.entry.id });
	assert.equal(installed.status, 200);
	assert.equal(installed.value.installedDisabled, true);
	const installedSkill = await readFile(join(env.project, '.dsh', 'skills', 'demo', 'SKILL.md'), 'utf8');
	assert.match(installedSkill, /disable-model-invocation: true/);
	assert.equal(await readFile(join(env.project, '.dsh', 'skills', 'demo', 'references', 'guide.md'), 'utf8'), 'Remote guide file.\n');

	const listed = await env.api('marketplace', { cwd: env.project });
	assert.equal(listed.value.items[0].status, 'installed');
	assert.equal(listed.value.items[0].installedRevision, 'revision-1');

	remote.setRevision('revision-2');
	const updated = await env.api('marketplace', { cwd: env.project, force: true });
	assert.equal(updated.value.items[0].status, 'update-available');
	const updatePreview = await env.api('marketplace.preview', { cwd: env.project, id: remote.entry.id });
	assert.equal(updatePreview.value.action, 'update');
	assert.equal(updatePreview.value.canInstall, true);
	const updatedInstall = await env.api('marketplace.install', { cwd: env.project, id: remote.entry.id });
	assert.equal(updatedInstall.value.updated, true);
});

test('marketplace: never overwrites a modified or unrelated project Skill', async (t) => {
	const remote = makeRemote();
	const env = await makeEnv(remote);
	t.after(env.cleanup);
	await mkdir(join(env.project, '.dsh', 'skills', 'demo'), { recursive: true });
	await writeFile(join(env.project, '.dsh', 'skills', 'demo', 'SKILL.md'), '---\nname: demo\ndescription: Local copy\n---\n\nLocal instructions.\n', 'utf8');
	const preview = await env.api('marketplace.preview', { cwd: env.project, id: remote.entry.id });
	assert.equal(preview.status, 200);
	assert.equal(preview.value.action, 'conflict');
	assert.equal(preview.value.canInstall, false);
	const install = await env.api('marketplace.install', { cwd: env.project, id: remote.entry.id });
	assert.equal(install.status, 409);
	assert.equal((await readFile(join(env.project, '.dsh', 'skills', 'demo', 'SKILL.md'), 'utf8')).includes('Local instructions.'), true);
});

test('github install: discovers an arbitrary repository Skill, previews it, and records first-class provenance', async (t) => {
	const remote = makeRemote();
	const env = await makeEnv(remote);
	t.after(env.cleanup);
	const url = 'https://github.com/acme/demo';
	const inspected = await env.api('github.inspect', { url });
	assert.equal(inspected.status, 200);
	assert.deepEqual(inspected.value.candidates, [{ path: 'skills/demo', suggestedName: 'demo' }]);

	const preview = await env.api('github.preview', { cwd: env.project, url, path: 'skills/demo' });
	assert.equal(preview.status, 200);
	assert.equal(preview.value.name, 'demo');
	assert.equal(preview.value.checks.trustedSource, false);
	assert.equal(preview.value.checks.thirdPartyCodeExecuted, false);

	const installed = await env.api('github.install', { cwd: env.project, url, path: 'skills/demo' });
	assert.equal(installed.status, 200);
	const config = JSON.parse(await readFile(join(env.project, '.dsh', 'skill-manager.json'), 'utf8'));
	assert.equal(config.sources.demo.source, undefined, 'remote provenance is not stored in the catalog source-selection field');
	assert.equal(config.sources.demo.marketManaged, undefined);
	assert.equal(config.sources.demo.originType, 'github');
	assert.equal(config.sources.demo.originRepository, 'acme/demo');
	assert.equal(config.sources.demo.originPath, 'skills/demo');
	assert.equal(config.sources.demo.originRef, 'main');
	assert.match(config.sources.demo.originBundleHash, /^sha256:/);
	assert.equal(config.sources.demo.originHash, undefined);
});

test('github install: rejects non-GitHub hosts and requires a selected path for multi-Skill repositories', async (t) => {
	const remote = makeRemote();
	const originalFetch = remote.fetch;
	remote.fetch = async (url) => {
		if (url === 'https://api.github.com/repos/acme/demo/git/trees/main?recursive=1') {
			return responseJson({ truncated: false, tree: [
				{ path: 'SKILL.md', type: 'blob', size: 100 },
				{ path: 'skills/demo/SKILL.md', type: 'blob', size: 100 },
				{ path: 'skills/second/SKILL.md', type: 'blob', size: 100 },
			] });
		}
		return originalFetch(url);
	};
	const env = await makeEnv(remote);
	t.after(env.cleanup);
	const rejected = await env.api('github.inspect', { url: 'https://example.com/acme/demo' });
	assert.equal(rejected.status, 400);
	const inspected = await env.api('github.inspect', { url: 'https://github.com/acme/demo' });
	assert.ok(inspected.value.candidates.some((candidate) => candidate.path === '.'), 'repository-root SKILL.md is discoverable');
	const missingPath = await env.api('github.preview', { cwd: env.project, url: 'https://github.com/acme/demo' });
	assert.equal(missingPath.status, 409);
});
