import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import {
	ApiError,
	SERVERS_END,
	SERVERS_START,
	createMcpManager,
	extractManagedBlock,
	parseServers,
} from '../lib/state.js';

async function fixture(t, options = {}) {
	const profileDir = await mkdtemp(join(tmpdir(), 'dsh-mcp-manager-'));
	t.after(() => rm(profileDir, { recursive: true, force: true }));
	const patchPath = join(profileDir, 'cordis.patch.yml');
	await writeFile(patchPath, options.patch ?? "- insert:\n  - id: 'keep-me'\n    name: 'existing-plugin'\n", 'utf8');
	const manager = createMcpManager({
		profileDir,
		env: options.env ?? {},
		cacheTtlMs: options.cacheTtlMs,
		deps: {
			inventory: options.inventory,
			tools: options.tools,
			fetch: options.fetch,
			writeText: options.writeText,
		},
	});
	return { manager, patchPath };
}

function stdio(overrides = {}) {
	return {
		serverName: 'filesystem',
		description: 'Local files',
		transport: 'stdio',
		command: 'npx',
		args: ['-y', '@modelcontextprotocol/server-filesystem'],
		env: { ROOT_PATH: 'MCP_ROOT_PATH' },
		requiredEnv: ['MCP_ROOT_PATH'],
		enabled: false,
		...overrides,
	};
}

function response(value, status = 200) {
	return {
		ok: status >= 200 && status < 300,
		status,
		async json() { return value; },
	};
}

test('writes stdio and HTTP rows inside one owned block without persisting secret values', async (t) => {
	const { manager, patchPath } = await fixture(t, { env: { MCP_ROOT_PATH: 'C:/private' } });
	await manager.call('create', { server: stdio({ enabled: true }) });
	await manager.call('create', {
		server: {
			serverName: 'github',
			transport: 'streamable-http',
			url: 'https://api.githubcopilot.com/mcp/',
			headers: { Authorization: 'GITHUB_MCP_AUTHORIZATION' },
			requiredEnv: ['GITHUB_MCP_AUTHORIZATION'],
			enabled: false,
		},
	});
	const text = await readFile(patchPath, 'utf8');
	assert.match(text, /id: 'keep-me'/);
	assert.equal(text.split(SERVERS_START).length - 1, 1);
	assert.equal(text.split(SERVERS_END).length - 1, 1);
	assert.match(text, /ROOT_PATH': !!js process\.env\.MCP_ROOT_PATH/);
	assert.match(text, /Authorization': !!js process\.env\.GITHUB_MCP_AUTHORIZATION/);
	assert.doesNotMatch(text, /C:\/private/);
	const parsed = parseServers(text);
	assert.equal(parsed.length, 2);
	assert.equal(parsed[0].serverName, 'filesystem');
	assert.equal(parsed[1].transport, 'streamable-http');
});

test('rejects unsafe or duplicate configuration without changing the patch', async (t) => {
	const { manager, patchPath } = await fixture(t);
	await manager.call('create', { server: stdio() });
	const before = await readFile(patchPath, 'utf8');
	await assert.rejects(
		manager.call('create', { server: stdio({ command: 'node' }) }),
		(error) => error instanceof ApiError && error.status === 409,
	);
	await assert.rejects(
		manager.call('create', { server: stdio({ serverName: 'bad name' }) }),
		(error) => error instanceof ApiError && error.status === 400,
	);
	await assert.rejects(
		manager.call('create', { server: stdio({ serverName: 'cwd', cwd: 'relative/path' }) }),
		(error) => error instanceof ApiError && error.status === 400,
	);
	await assert.rejects(
		manager.call('create', { server: { serverName: 'remote', transport: 'streamable-http', url: 'http://example.com/mcp' } }),
		(error) => error instanceof ApiError && error.status === 400,
	);
	await assert.rejects(
		manager.call('create', { server: stdio({ serverName: 'secret', env: { TOKEN: 'not a valid env name!' } }) }),
		(error) => error instanceof ApiError && error.status === 400,
	);
	assert.equal(await readFile(patchPath, 'utf8'), before);
});

test('reports corrupt blocks and failed writes without damaging the original file', async (t) => {
	const corrupt = `outside\n${SERVERS_START}\nmissing end\n`;
	const first = await fixture(t, { patch: corrupt });
	await assert.rejects(first.manager.call('list'), (error) => error.code === 'MANAGED_BLOCK_CORRUPT');
	assert.equal(await readFile(first.patchPath, 'utf8'), corrupt);

	const original = "- insert:\n  - id: 'safe'\n";
	const second = await fixture(t, {
		patch: original,
		writeText: async () => { throw new Error('disk full'); },
	});
	await assert.rejects(second.manager.call('create', { server: stdio() }), /disk full/);
	assert.equal(await readFile(second.patchPath, 'utf8'), original);
});

test('projects runtime phases and exact MCP tool schemas without inventing retry data', async (t) => {
	const inventory = {
		list() {
			return { entries: [
				{ entryId: 'mcp-manager-codegraph', moduleName: '@deepseek-ai/dsh-mcp-client', enabled: true, fiberPhase: 'active' },
				{ entryId: 'mcp-manager-broken', moduleName: '@deepseek-ai/dsh-mcp-client', enabled: true, fiberPhase: 'failed' },
			] };
		},
	};
	const tools = {
		schemas() {
			return [
				{ name: 'mcp__codegraph__search', description: 'Search symbols' },
				{ name: 'mcp__codegraph__references', description: 'Find references' },
				{ name: 'unrelated', description: 'ignore' },
			];
		},
	};
	const { manager } = await fixture(t, { inventory, tools });
	await manager.call('create', { server: stdio({ serverName: 'codegraph', env: {}, requiredEnv: [], enabled: true }) });
	await manager.call('create', { server: stdio({ serverName: 'broken', env: {}, requiredEnv: [], enabled: true }) });
	const state = await manager.call('list');
	assert.equal(state.connected, 1);
	assert.deepEqual(state.servers[0].tools.map((tool) => tool.name), ['search', 'references']);
	assert.equal(state.servers[0].status, 'connected');
	assert.equal(state.servers[1].status, 'failed');
	assert.equal('retryCount' in state.servers[1], false);
	await manager.call('setEnabled', { id: state.servers[0].id, enabled: false });
	assert.equal((await manager.call('list')).servers[0].status, 'disabled');
});

test('blocks enabling a server whose required environment is absent', async (t) => {
	const { manager } = await fixture(t);
	const created = await manager.call('create', { server: stdio() });
	assert.equal(created.server.status, 'disabled');
	await assert.rejects(
		manager.call('setEnabled', { id: created.server.id, enabled: true }),
		(error) => error.code === 'ENV_REQUIRED',
	);
});

test('market uses Registry icon first, GitHub avatar fallback, cache, and disabled installs', async (t) => {
	const calls = new Map();
	const fetch = async (url) => {
		calls.set(url, (calls.get(url) || 0) + 1);
		if (url.includes('/repos/github/github-mcp-server/releases/latest')) return response({ tag_name: 'v1.2.3', published_at: '2026-08-20T00:00:00Z', html_url: 'https://github.com/github/github-mcp-server/releases/tag/v1.2.3' });
		if (url.includes('/repos/')) {
			const repository = url.split('/repos/')[1];
			const owner = repository.split('/')[0];
			return response({
				html_url: `https://github.com/${repository}`,
				description: `${repository} description`,
				owner: { login: owner, avatar_url: `https://avatars.githubusercontent.com/u/${owner.length}` },
				stargazers_count: 100,
				forks_count: 20,
				language: 'TypeScript',
				license: { spdx_id: 'MIT' },
				pushed_at: '2026-08-21T00:00:00Z',
				topics: ['mcp', 'server'],
			});
		}
		if (url.includes('github-mcp-server')) return response({ server: { version: '1.2.3', icons: [{ src: 'https://raw.githubusercontent.com/github/github-mcp-server/main/icon.png', mimeType: 'image/png' }] } });
		if (url.includes('playwright-mcp')) return response({ server: { version: '0.0.1', icons: [{ src: 'https://evil.invalid/icon.svg', mimeType: 'image/svg+xml' }] } });
		if (url.includes('context7')) return response({ server: { version: '2.0.0' } });
		return response({}, 404);
	};
	const { manager } = await fixture(t, { fetch });
	const market = await manager.call('marketplace');
	assert.equal(market.items.length, 5);
	assert.equal(market.items[0].iconSource, 'registry');
	assert.equal(market.items[1].iconSource, 'github');
	await manager.call('marketplace');
	assert.equal([...calls.values()].every((count) => count === 1), true);

	const detail = await manager.call('marketplace.detail', { id: 'github/github-mcp-server' });
	assert.equal(detail.latestVersion, 'v1.2.3');
	assert.equal(detail.stars, 100);
	const installed = await manager.call('marketplace.install', { id: 'microsoft/playwright-mcp' });
	assert.equal(installed.installedDisabled, true);
	assert.equal(installed.server.enabled, false);
	assert.equal(installed.server.command, 'npx');
	const repeated = await manager.call('marketplace.install', { id: 'microsoft/playwright-mcp' });
	assert.equal(repeated.changed, false);
	await assert.rejects(
		manager.call('marketplace.install', { id: 'awslabs/mcp' }),
		(error) => error.code === 'MARKET_NOT_INSTALLABLE',
	);
});

test('empty args serialize as an explicit empty list', async (t) => {
	const { manager, patchPath } = await fixture(t);
	await manager.call('create', { server: stdio({ args: [], env: {}, requiredEnv: [] }) });
	const block = extractManagedBlock(await readFile(patchPath, 'utf8'));
	assert.match(block, /args: \[\]/);
});
