import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(here, '..', '..', '..');
const dshSource = process.env.DSH_SOURCE_DIR || join(dirname(repositoryRoot), 'deepseek-harness');
const dependencyAnchor = join(dshSource, 'packages', 'client', 'web', 'package.json');
if (!existsSync(dependencyAnchor)) throw new Error(`DSH client dependencies unavailable: ${dependencyAnchor}`);
const dshRequire = createRequire(dependencyAnchor);
const React = dshRequire('react');
const { createRoot } = dshRequire('react-dom/client');
const { JSDOM } = dshRequire('jsdom');
const { act } = React;

function jsonResponse(value, status = 200) {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => status >= 200 && status < 300
			? { ok: true, value }
			: { ok: false, error: { message: String(value) } },
	};
}

function deferred() {
	let resolve;
	let reject;
	const promise = new Promise((resolveValue, rejectValue) => { resolve = resolveValue; reject = rejectValue; });
	return { promise, resolve, reject };
}

function server(overrides = {}) {
	return {
		id: 'mcp-manager-codegraph', serverName: 'codegraph', description: '代码库语义检索与关系图谱服务',
		transport: 'stdio', command: 'codegraph', args: ['mcp'], endpoint: 'codegraph mcp', enabled: true,
		status: 'connected', fiberPhase: 'active', toolCount: 2, toolCallTimeoutMs: 60000,
		updatedAt: '2026-08-24T00:00:00Z', missingEnvironment: [],
		tools: [
			{ name: 'search', publicName: 'mcp__codegraph__search', description: '搜索符号' },
			{ name: 'references', publicName: 'mcp__codegraph__references', description: '查找引用' },
		],
		...overrides,
	};
}

async function makeHarness(router) {
	const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', { url: 'http://127.0.0.1:3080/' });
	const previous = {};
	for (const key of ['window', 'document', 'HTMLElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'localStorage', 'fetch', 'IS_REACT_ACT_ENVIRONMENT']) previous[key] = globalThis[key];
	globalThis.window = dom.window;
	globalThis.document = dom.window.document;
	globalThis.HTMLElement = dom.window.HTMLElement;
	globalThis.Node = dom.window.Node;
	globalThis.Event = dom.window.Event;
	globalThis.MouseEvent = dom.window.MouseEvent;
	globalThis.KeyboardEvent = dom.window.KeyboardEvent;
	globalThis.localStorage = dom.window.localStorage;
	globalThis.IS_REACT_ACT_ENVIRONMENT = true;
	dom.window.HTMLElement.prototype.attachEvent = function () {};
	dom.window.HTMLElement.prototype.detachEvent = function () {};
	(globalThis as any).fetch = async (_url: any, init: any) => {
		const body = JSON.parse(init.body);
		try { return jsonResponse(await router(body)); }
		catch (error) { return jsonResponse(error instanceof Error ? error.message : String(error), 500); }
	};
	dom.window.fetch = globalThis.fetch;

	const specs = new Map<string, any>([['sidebar.footer.action', { kind: 'list', scope: 'root' }]]);
	const registrations = new Map();
	const waiters = new Map();
	const listeners = new Map();
	const versions = new Map();
	function notify(name) {
		versions.set(name, (versions.get(name) || 0) + 1);
		for (const listener of listeners.get(name) || []) listener();
	}
	function invoke(callback) {
		const result = callback();
		if (result && typeof result.next === 'function') for (let step = result.next(); !step.done; step = result.next()) {}
		return result;
	}
	function declare(children: any) {
		for (const [name, spec] of Object.entries(children || {})) {
			specs.set(name, spec);
			for (const callback of waiters.get(name) || []) invoke(callback);
			waiters.delete(name);
		}
	}
	const slots = {
		inject(name, callback) {
			if (specs.has(name)) return invoke(callback);
			const pending = waiters.get(name) || [];
			pending.push(callback); waiters.set(name, pending); return () => {};
		},
		register(definition, component) {
			assert.ok(specs.has(definition.name), `slot ${definition.name} must be declared`);
			const entry = { definition, options: definition, component };
			const list = registrations.get(definition.name) || [];
			list.push(entry); registrations.set(definition.name, list); declare(definition.children); notify(definition.name);
			return () => {};
		},
		entries(name) { return [...(registrations.get(name) || [])]; },
		getVersion(name) { return versions.get(name) || 0; },
		subscribe(name, listener) {
			const set = listeners.get(name) || new Set(); set.add(listener); listeners.set(name, set);
			return () => set.delete(listener);
		},
	};
	const ctx = { get(name) { return name === 'slots' ? slots : undefined; } };
	const icon = (props) => React.createElement('span', Object.assign({ 'data-icon': '1' }, props));
	const primitives = new Proxy({}, { get: () => icon });
	function load(path) {
		let definition = null;
		dom.window.__ModuleLoader__ = { load(value) { definition = value; } };
		new Function(readFileSync(path, 'utf8'))();
		assert.ok(definition);
		const plugin = definition.factory((id) => {
			if (id === 'react') return React;
			if (id === '@deepseek-ai/dsh-client-ui-primitives') return primitives;
			throw new Error(`unexpected require ${id}`);
		});
		plugin.apply(ctx);
	}
	load(join(repositoryRoot, 'plugins', 'extension-manager', 'lib', 'client.js'));
	slots.register({ name: 'extension.manager.section', id: 'skill', order: 10, label: () => 'SKILL' }, () => React.createElement('div', null, 'skill fixture'));
	load(join(here, '..', 'lib', 'client.js'));

	const sidebar = slots.entries('sidebar.footer.action')[0];
	function renderSlot(name, owner: any = {}, options: any = {}) {
		const selected = slots.entries(name).filter((entry) => options.only === undefined || entry.definition.id === options.only);
		return React.createElement(React.Fragment, null, selected.map((entry) => React.createElement(entry.component, Object.assign({ key: entry.definition.id }, owner, entry.definition.inject ? entry.definition.inject() : {}, entry.definition.children ? { renderSlot } : {}))));
	}
	const reactRoot = createRoot(dom.window.document.getElementById('root'));
	await act(async () => { reactRoot.render(React.createElement(sidebar.component, Object.assign({ wide: true, renderSlot }, sidebar.definition.inject()))); });
	async function click(element) {
		assert.ok(element, 'click target exists');
		await act(async () => { element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
	}
	async function flush() { await act(async () => { await new Promise((resolveValue) => setTimeout(resolveValue, 0)); }); }
	async function pause(ms) { await act(async () => { await new Promise((resolveValue) => setTimeout(resolveValue, ms)); }); }
	function button(text) { return [...dom.window.document.querySelectorAll('button')].find((item) => item.textContent.trim() === text); }
	async function openMcp(waitForReady = true) {
		await click(dom.window.document.querySelector('.ext-trigger')); await flush();
		await click(button('MCP')); await flush(); await flush();
		if (waitForReady) { await pause(700); await flush(); }
	}
	async function cleanup() {
		await act(async () => reactRoot.unmount()); dom.window.close();
		for (const [key, value] of Object.entries(previous)) value === undefined ? delete globalThis[key] : globalThis[key] = value;
	}
	return { dom, click, flush, pause, button, openMcp, cleanup, registrations };
}

test('initial MCP load uses the endpoint handshake state and reduced-motion fallback', async (t) => {
	const list = deferred();
	const router = async (body) => {
		if (body.op === 'list') return list.promise;
		throw new Error(`unexpected op ${body.op}`);
	};
	const h = await makeHarness(router); t.after(h.cleanup);
	await h.openMcp(false);

	const loading = h.dom.window.document.querySelector('.mm-connectingState');
	assert.ok(loading, 'initial request renders a dedicated MCP connecting state');
	assert.equal(loading.getAttribute('role'), 'status');
	assert.equal(loading.getAttribute('aria-live'), 'polite');
	assert.equal(loading.getAttribute('aria-atomic'), 'true');
	assert.equal(h.dom.window.document.querySelector('.mm-connectingVisual').getAttribute('aria-hidden'), 'true');
	assert.equal(h.dom.window.document.querySelectorAll('.mm-connectingEndpoint').length, 2);
	assert.ok(h.dom.window.document.querySelector('.mm-connectingEndpointLocal [data-icon="1"]'), 'local process endpoint uses an official icon');
	assert.ok(h.dom.window.document.querySelector('.mm-connectingEndpointRemote [data-icon="1"]'), 'remote API endpoint uses an official icon');
	assert.ok(h.dom.window.document.querySelector('.mm-connectingCore [data-icon="1"]'), 'connection core uses the official Link icon');
	assert.equal(h.dom.window.document.querySelector('.mm-connectingLabel').textContent, 'MCP Connecting');
	assert.equal(h.dom.window.document.querySelector('.mm-connectingLabel').getAttribute('data-text'), 'MCP Connecting');
	assert.ok(h.dom.window.document.querySelector('.mm-head'), 'stable MCP page chrome stays visible while connecting');

	const css = h.dom.window.document.querySelector('style[data-plugin="dsh-mcp-manager"]').textContent;
	assert.ok(css.includes('@keyframes mm-connectingLocal'));
	assert.ok(css.includes('@keyframes mm-connectingRemote'));
	assert.ok(css.includes('@keyframes mm-connectingCore'));
	assert.ok(css.includes('@keyframes mm-connectingTextFocus'));
	assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'));

	list.resolve({ apiVersion: 1, profile: 'web', connected: 1, servers: [server()] });
	await h.pause(700); await h.flush();
	assert.equal(h.dom.window.document.querySelector('.mm-connectingState'), null);
	assert.equal(h.dom.window.document.querySelectorAll('[data-testid="server-list"] .mm-serverRow').length, 1);
});

test('MCP connecting exits to a retryable error and retry restores the list', async (t) => {
	let attempts = 0;
	const router = async (body) => {
		if (body.op !== 'list') throw new Error(`unexpected op ${body.op}`);
		attempts += 1;
		if (attempts === 1) throw new Error('profile unavailable');
		return { apiVersion: 1, profile: 'web', connected: 1, servers: [server()] };
	};
	const h = await makeHarness(router); t.after(h.cleanup);
	await h.openMcp();
	assert.equal(h.dom.window.document.querySelector('.mm-connectingState'), null);
	assert.ok(h.dom.window.document.querySelector('[role="alert"]').textContent.includes('profile unavailable'));
	assert.ok(h.button('重试'));
	await h.click(h.button('重试'));
	assert.ok(h.dom.window.document.querySelector('.mm-connectingState'));
	await h.pause(700); await h.flush();
	assert.equal(h.dom.window.document.querySelector('.mm-connectingState'), null);
	assert.equal(h.dom.window.document.querySelectorAll('[data-testid="server-list"] .mm-serverRow').length, 1);
});

test('real MCP contribution renders without shell business placeholders and exposes honest runtime tools', async (t) => {
	let servers = [server(), server({ id: 'mcp-manager-context7', serverName: 'context7', description: '当前文档', status: 'needs-environment', fiberPhase: null, toolCount: 0, tools: [], enabled: false, missingEnvironment: ['CONTEXT7_API_KEY'] })];
	const calls = [];
	const router = async (body) => {
		calls.push(body);
		if (body.op === 'list') return { apiVersion: 1, profile: 'web', connected: servers.filter((item) => item.status === 'connected').length, servers };
		if (body.op === 'setEnabled') {
			servers = servers.map((item) => item.id === body.id ? { ...item, enabled: body.enabled, status: body.enabled ? 'connected' : 'disabled' } : item);
			return { changed: true };
		}
		if (body.op === 'reconnect') return { changed: true };
		throw new Error(`unexpected op ${body.op}`);
	};
	const h = await makeHarness(router); t.after(h.cleanup);
	assert.deepEqual(h.registrations.get('extension.manager.section').map((entry) => entry.definition.id).sort(), ['mcp', 'skill']);
	await h.openMcp();
	assert.ok(h.dom.window.document.querySelector('.mm-root'));
	assert.equal(h.dom.window.document.querySelector('.mm-head h2').textContent, 'MCP');
	assert.equal(h.dom.window.document.querySelector('.mm-context'), null);
	assert.equal(h.dom.window.document.querySelector('.mm-summary'), null);
	assert.ok(!h.dom.window.document.body.textContent.includes('当前配置 web'));
	assert.ok(h.dom.window.document.querySelector('.mm-toolbar'));
	assert.ok(!h.dom.window.document.body.textContent.includes('MCP 管理（建设中）'));
	assert.deepEqual([...h.dom.window.document.querySelectorAll('.ext-navBtn')].map((item) => item.textContent.trim()), ['SKILL', 'MCP']);
	assert.equal(h.dom.window.document.querySelectorAll('[data-testid="server-list"] .mm-serverRow').length, 2);
	assert.equal(h.dom.window.document.querySelectorAll('[data-testid="server-list"] .mm-row').length, 2);
	assert.ok(h.dom.window.document.body.textContent.includes('已连接 1'));
	assert.ok(!h.dom.window.document.body.textContent.includes('已连接 1 / 2'));

	await h.click(h.dom.window.document.querySelector('.mm-serverOpen'));
	assert.ok(h.dom.window.document.querySelector('.mm-drawer'));
	assert.equal(h.dom.window.document.querySelectorAll('.mm-tool').length, 2);
	assert.ok(h.dom.window.document.body.textContent.includes('状态来源active'));
	await h.click(h.button('重新连接')); await h.flush();
	assert.ok(calls.some((call) => call.op === 'reconnect' && call.id === 'mcp-manager-codegraph'));
	await act(async () => { h.dom.window.document.dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
	assert.equal(h.dom.window.document.querySelector('.mm-drawer'), null);
	assert.ok(h.dom.window.document.querySelector('.ext-page'));
});

test('market stays flat, uses received icons, opens metadata drawer, and installs disabled', async (t) => {
	const calls = [];
	let installed = false;
	const items = [
		{ id: 'github/github-mcp-server', name: 'GitHub MCP Server', repository: 'github/github-mcp-server', repositoryUrl: 'https://github.com/github/github-mcp-server', registryName: 'io.github.github/github-mcp-server', version: '1.2.3', source: 'featured', description: "GitHub's official MCP Server", iconUrl: 'https://avatars.githubusercontent.com/u/9919', iconSource: 'github', installable: true, installReason: null, status: 'not-installed' },
		{ id: 'awslabs/mcp', name: 'AWS Labs MCP', repository: 'awslabs/mcp', repositoryUrl: 'https://github.com/awslabs/mcp', registryName: null, version: null, source: 'featured', description: 'Open source MCP Servers for AWS', iconUrl: null, iconSource: 'generic', installable: false, installReason: '包含多个 Server', status: 'not-installed' },
	];
	const router = async (body) => {
		calls.push(body);
		if (body.op === 'list') return { apiVersion: 1, profile: 'web', connected: 0, servers: installed ? [server({ id: 'mcp-manager-github', serverName: 'github', enabled: false, status: 'disabled' })] : [] };
		if (body.op === 'marketplace') return { apiVersion: 1, items: items.map((item) => item.id === 'github/github-mcp-server' && installed ? { ...item, status: 'installed' } : item), page: { limit: 24, nextCursor: null, hasMore: false } };
		if (body.op === 'marketplace.detail') return { id: body.id, repository: body.id, url: 'https://github.com/' + body.id, description: "GitHub's official MCP Server", iconUrl: items[0].iconUrl, author: 'github', stars: 32445, forks: 4840, language: 'Go', license: 'MIT', lastPushedAt: '2026-08-21T00:00:00Z', topics: ['github', 'mcp', 'mcp-server'], latestVersion: 'v1.10.1', releasePublishedAt: '2026-08-20T00:00:00Z', releaseUrl: 'https://github.com/github/github-mcp-server/releases/tag/v1.10.1', installable: true, status: installed ? 'installed' : 'not-installed' };
		if (body.op === 'marketplace.install') { installed = true; return { changed: true, installedDisabled: true, server: server({ enabled: false, status: 'disabled' }) }; }
		throw new Error(`unexpected op ${body.op}`);
	};
	const h = await makeHarness(router); t.after(h.cleanup);
	await h.openMcp();
	await h.click(h.button('市场')); await h.flush(); await h.flush();
	const sort = h.dom.window.document.querySelector('.mm-sort');
	assert.ok(sort);
	await act(async () => { sort.value = 'popular'; sort.dispatchEvent(new h.dom.window.Event('change', { bubbles: true })); });
	await h.flush(); await h.flush();
	assert.ok(calls.some((call) => call.op === 'marketplace' && call.sort === 'popular'));
	assert.equal(h.dom.window.document.querySelectorAll('[data-testid="market-list"] .mm-marketRow').length, 2);
	assert.equal(h.dom.window.document.querySelectorAll('[data-testid="market-list"] img').length, 1);
	assert.ok(!h.dom.window.document.body.textContent.includes('可靠来源'));
	await h.click(h.dom.window.document.querySelector('.mm-marketRow')); await h.flush(); await h.flush();
	assert.ok(calls.some((call) => call.op === 'marketplace.detail'));
	assert.ok(h.dom.window.document.body.textContent.includes('32,445 Stars · 4,840 Forks'));
	assert.ok(h.dom.window.document.body.textContent.includes('v1.10.1'));
	await h.click(h.button('安装为停用配置')); await h.flush(); await h.flush();
	assert.ok(calls.some((call) => call.op === 'marketplace.install'));
	assert.ok(h.dom.window.document.body.textContent.includes('已安装为停用配置'));
});
