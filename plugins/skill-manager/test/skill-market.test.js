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
	assert.equal(listed.value.source, 'curated-github');
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
