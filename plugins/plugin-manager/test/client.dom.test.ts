import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function repositoryRoot() {
	let current = here;
	for (;;) {
		const marker = join(current, '.git');
		if (existsSync(marker)) {
			if (statSync(marker).isFile() && readFileSync(marker, 'utf8').startsWith('gitdir:')) {
				const gitdir = readFileSync(marker, 'utf8').trim().slice('gitdir:'.length).trim();
				return dirname(dirname(dirname(resolve(current, gitdir))));
			}
			return current;
		}
		const parent = dirname(current);
		if (parent === current) throw new Error('cannot locate repository root');
		current = parent;
	}
}

const dshSource = process.env.DSH_SOURCE_DIR || join(dirname(repositoryRoot()), 'deepseek-harness');
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
		json: async () => status >= 200 && status < 300 ? { ok: true, value } : { ok: false, error: { message: String(value) } },
	};
}

function deferred() {
	let resolveValue;
	let rejectValue;
	const promise = new Promise((resolve, reject) => {
		resolveValue = resolve;
		rejectValue = reject;
	});
	return { promise, resolve: resolveValue, reject: rejectValue };
}

function localPlugin(name, overrides = {}) {
	return Object.assign({
		name,
		rowId: name.replace(/^dsh-/, ''),
		version: '0.1.0',
		description: `${name} 的第一句话。`,
		source: '本地',
		spec: `link:C:/plugins/${name}`,
		enabled: true,
		managed: true,
		protected: false,
		repository: null,
		license: 'MIT',
		manifest: { hostEntry: './lib/index.js', clientEntry: './lib/client.js', bundlePatch: null },
	}, overrides);
}

async function makeHarness(router) {
	const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', { url: 'http://127.0.0.1:3080/' });
	const previous = {};
	for (const key of ['window', 'document', 'HTMLElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'localStorage', 'fetch', 'IS_REACT_ACT_ENVIRONMENT']) {
		previous[key] = globalThis[key];
	}
	globalThis.window = dom.window;
	globalThis.document = dom.window.document;
	globalThis.HTMLElement = dom.window.HTMLElement;
	globalThis.Node = dom.window.Node;
	globalThis.Event = dom.window.Event;
	globalThis.MouseEvent = dom.window.MouseEvent;
	globalThis.KeyboardEvent = dom.window.KeyboardEvent;
	globalThis.localStorage = dom.window.localStorage;
	globalThis.IS_REACT_ACT_ENVIRONMENT = true;
	// React 18's legacy input polyfill probes old IE hooks in JSDOM when an
	// auto-focused field mounts.
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
			const pending = waiters.get(name) || [];
			waiters.delete(name);
			for (const callback of pending) invoke(callback);
		}
	}
	const slots = {
		inject(name, callback) {
			if (specs.has(name)) return invoke(callback);
			const pending = waiters.get(name) || [];
			pending.push(callback);
			waiters.set(name, pending);
			return () => {};
		},
		register(definition, component) {
			assert.ok(specs.has(definition.name), `slot ${definition.name} must be declared`);
			const entry = { definition, options: definition, component };
			const list = registrations.get(definition.name) || [];
			list.push(entry);
			registrations.set(definition.name, list);
			declare(definition.children);
			notify(definition.name);
			return () => { registrations.set(definition.name, (registrations.get(definition.name) || []).filter((candidate) => candidate !== entry)); notify(definition.name); };
		},
		entries(name) { return [...(registrations.get(name) || [])]; },
		getVersion(name) { return versions.get(name) || 0; },
		subscribe(name, listener) {
			const set = listeners.get(name) || new Set();
			set.add(listener);
			listeners.set(name, set);
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

	load(join(here, '..', '..', 'extension-manager', 'lib', 'client.js'));
	// A small real Slot contribution keeps SKILL first without loading its very
	// large business bundle; Plugin Manager remains the production bundle.
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
	async function openPlugin(waitForReady = true) {
		await click(dom.window.document.querySelector('.ext-trigger'));
		await flush();
		await click(button('Plugin'));
		await flush(); await flush();
		if (waitForReady) { await pause(700); await flush(); }
	}
	async function cleanup() {
		await act(async () => reactRoot.unmount());
		dom.window.close();
		for (const [key, value] of Object.entries(previous)) {
			if (value === undefined) delete globalThis[key];
			else globalThis[key] = value;
		}
	}
	return { dom, click, flush, pause, button, openPlugin, cleanup, registrations };
}

test('initial Plugin load uses the branded module assembly state and reduced-motion fallback', async (t) => {
	const local = deferred();
	const market = deferred();
	const router = async (body) => {
		if (body.op === 'list') return local.promise;
		if (body.op === 'marketplace') return market.promise;
		throw new Error(`unexpected op ${body.op}`);
	};
	const h = await makeHarness(router);
	t.after(h.cleanup);
	await h.openPlugin(false);

	const loading = h.dom.window.document.querySelector('.pm-loadingState');
	assert.ok(loading, 'initial request renders a dedicated Plugin loading state');
	assert.equal(loading.getAttribute('role'), 'status');
	assert.equal(loading.getAttribute('aria-live'), 'polite');
	assert.equal(loading.getAttribute('aria-atomic'), 'true');
	assert.equal(h.dom.window.document.querySelector('.pm-loadingVisual').getAttribute('aria-hidden'), 'true');
	assert.equal(h.dom.window.document.querySelectorAll('.pm-loadingModule').length, 4);
	assert.equal(h.dom.window.document.querySelectorAll('.pm-loadingModuleAccent').length, 1);
	assert.ok(h.dom.window.document.querySelector('.pm-loadingCore [data-icon="1"]'), 'loading state uses the official Cordis Plugin icon');
	assert.equal(h.dom.window.document.querySelector('.pm-loadingLabel').textContent, 'Plugin Loading');
	assert.equal(h.dom.window.document.querySelector('.pm-loadingLabel').getAttribute('data-text'), 'Plugin Loading');
	assert.ok(h.dom.window.document.querySelector('.pm-head'), 'stable page chrome stays visible like Skill Finding');

	const css = h.dom.window.document.querySelector('style[data-plugin="dsh-plugin-manager"]').textContent;
	assert.ok(css.includes('@keyframes pm-loadingNorthWest'));
	assert.ok(css.includes('@keyframes pm-loadingCore'));
	assert.ok(css.includes('@keyframes pm-loadingTextFocus'));
	assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'));

	local.resolve({ apiVersion: 1, plugins: [localPlugin('dsh-plugin-manager', { protected: true })] });
	market.resolve({ apiVersion: 1, items: [] });
	await h.pause(700);
	await h.flush();
	assert.equal(h.dom.window.document.querySelector('.pm-loadingState'), null);
	assert.equal(h.dom.window.document.querySelectorAll('[data-testid="local-list"] .pm-row').length, 1);
});

test('Plugin loading exits to a retryable error and retry restores the real list', async (t) => {
	let listAttempts = 0;
	const router = async (body) => {
		if (body.op === 'list') {
			listAttempts += 1;
			if (listAttempts === 1) throw new Error('profile unavailable');
			return { apiVersion: 1, plugins: [localPlugin('dsh-plugin-manager', { protected: true })] };
		}
		if (body.op === 'marketplace') return { apiVersion: 1, items: [] };
		throw new Error(`unexpected op ${body.op}`);
	};
	const h = await makeHarness(router);
	t.after(h.cleanup);
	await h.openPlugin();
	assert.equal(h.dom.window.document.querySelector('.pm-loadingState'), null);
	assert.ok(h.dom.window.document.querySelector('[role="alert"]').textContent.includes('profile unavailable'));
	assert.ok(h.button('重试'));
	await h.click(h.button('重试'));
	assert.ok(h.dom.window.document.querySelector('.pm-loadingState'));
	await h.pause(700);
	await h.flush();
	assert.equal(h.dom.window.document.querySelector('.pm-loadingState'), null);
	assert.equal(h.dom.window.document.querySelectorAll('[data-testid="local-list"] .pm-row').length, 1);
});

test('real Plugin contribution renders without shell business placeholders and shows the denoised local page', async (t) => {
	let plugins = [
		localPlugin('@deepseek-ai/dsh-vision-bridge', { rowId: 'vision-bridge', source: '系统 Bundle', spec: '@deepseek-ai/dsh-base', enabled: false, managed: false, runtimeEnabled: false, runtimePhase: null }),
		localPlugin('dsh-extension-manager', { protected: true }),
		localPlugin('dsh-plugin-manager', { protected: true }),
		localPlugin('dsh-skill-manager'),
	];
	const calls = [];
	const router = async (body) => {
		calls.push(body);
		if (body.op === 'list') return { apiVersion: 1, plugins };
		if (body.op === 'marketplace') return { apiVersion: 1, items: [] };
		if (body.op === 'setEnabled') {
			plugins = plugins.map((item) => item.name === body.name ? Object.assign({}, item, { enabled: body.enabled }) : item);
			return { changed: true, restartRequired: true, plugin: plugins.find((item) => item.name === body.name) };
		}
		throw new Error(`unexpected op ${body.op}`);
	};
	const h = await makeHarness(router);
	t.after(h.cleanup);
	assert.deepEqual(h.registrations.get('extension.manager.section').map((entry) => entry.definition.id).sort(), ['plugin', 'skill']);
	await h.openPlugin();
	assert.ok(h.dom.window.document.querySelector('.pm-root'));
	assert.equal(h.dom.window.document.querySelector('.pm-head h2').textContent, 'Plugin');
	assert.equal(h.dom.window.document.querySelector('.pm-context'), null);
	assert.ok(!h.dom.window.document.body.textContent.includes('Web 配置'));
	assert.ok(!h.dom.window.document.body.textContent.includes('插件管理（建设中）'));
	assert.equal(h.dom.window.document.querySelectorAll('[data-testid="local-list"] .pm-row').length, 4);
	assert.equal(h.dom.window.document.querySelectorAll('.pm-switch').length, 4);
	assert.equal(h.dom.window.document.querySelectorAll('.pm-switch:disabled').length, 3);
	const visionRow = [...h.dom.window.document.querySelectorAll('.pm-row')].find((item) => item.textContent.includes('@deepseek-ai/dsh-vision-bridge'));
	assert.ok(visionRow.textContent.includes('系统 Bundle'));
	assert.ok(visionRow.textContent.includes('只读'));
	assert.equal(visionRow.querySelector('[role="switch"]').getAttribute('aria-checked'), 'false');
	assert.equal(visionRow.querySelector('[role="switch"]').disabled, true);
	assert.deepEqual([...h.dom.window.document.querySelectorAll('.ext-navBtn')].map((item) => item.textContent.trim()), ['SKILL', 'Plugin']);

	const listNode = h.dom.window.document.querySelector('[data-testid="local-list"]');
	await h.click([...h.dom.window.document.querySelectorAll('.pm-row')].find((item) => item.textContent.includes('dsh-skill-manager')));
	assert.ok(h.dom.window.document.querySelector('.pm-drawer'));
	assert.equal(h.dom.window.document.querySelector('[data-testid="local-list"]'), listNode, 'overlay drawer leaves the list node in place');
	const css = h.dom.window.document.querySelector('style[data-plugin="dsh-plugin-manager"]').textContent;
	assert.ok(css.includes('.pm-drawer{position:fixed'));
	assert.ok(css.includes('width:400px'));

	const toggle = h.dom.window.document.querySelector('.pm-drawer .pm-btnPrimary');
	await h.click(toggle);
	await h.flush();
	assert.ok(calls.some((call) => call.op === 'setEnabled' && call.name === 'dsh-skill-manager' && call.enabled === false));
	assert.deepEqual([...h.dom.window.document.querySelectorAll('[data-testid="local-list"] .pm-rowTitle')].map((item) => item.textContent), ['@deepseek-ai/dsh-vision-bridge', 'dsh-extension-manager', 'dsh-plugin-manager', 'dsh-skill-manager'], 'toggle does not reorder rows');

	await h.click(h.dom.window.document.querySelector('.pm-drawer .pm-close'));
	await h.click(h.button('导入插件'));
	assert.ok(h.dom.window.document.querySelector('[role="dialog"][aria-label="导入插件"]'));
});

test('marketplace home stays flat and drawer reveals GitHub data on demand', async (t) => {
	const market = [
		{ id: 'omdsh-dev/DSH-better-sidebar', repository: 'omdsh-dev/DSH-better-sidebar', description: '更好的侧边栏体验。', iconUrl: 'https://github.com/omdsh-dev.png?size=64', iconSource: 'github-avatar', status: 'installed', installedVersion: '0.12.3' },
		{ id: 'huiliyi37/dsh-tianshu-tui', repository: 'huiliyi37/dsh-tianshu-tui', description: '天枢推理助手。', iconUrl: null, iconSource: 'generic', status: 'not-installed', installedVersion: null },
		{ id: 'cccch1mneyyy/dsh-TUI', repository: 'cccch1mneyyy/dsh-TUI', description: 'DSH 命令行增强。', iconUrl: 'https://avatars.githubusercontent.com/u/123', iconSource: 'github', status: 'not-installed', installedVersion: null },
	];
	const calls = [];
	const router = async (body) => {
		calls.push(body);
		if (body.op === 'list') return { apiVersion: 1, plugins: [localPlugin('dsh-plugin-manager', { protected: true })] };
		if (body.op === 'marketplace') return { apiVersion: 1, items: market };
		if (body.op === 'marketplace.detail') return {
			id: body.id, repository: body.id, url: 'https://github.com/' + body.id, iconUrl: 'https://avatars.githubusercontent.com/u/9919', iconSource: 'github', description: '更好的侧边栏体验。', author: 'omdsh-dev', stars: 2710, forks: 215, language: 'TypeScript', license: 'MIT', lastPushedAt: new Date().toISOString(), topics: ['deepseek-harness'], latestVersion: 'v0.15.2', installedVersion: '0.12.3', status: 'update-available', manifest: { valid: true, dshRequirement: '>=0.0.1', hostEntry: './lib/index.js', clientEntry: './lib/client.js' },
		};
		throw new Error(`unexpected op ${body.op}`);
	};
	const h = await makeHarness(router);
	t.after(h.cleanup);
	await h.openPlugin();
	await h.click(h.button('插件市场'));
	await h.flush();
	assert.equal(h.dom.window.document.querySelectorAll('[data-testid="market-list"] .pm-row').length, 3);
	assert.equal(h.dom.window.document.querySelectorAll('[data-testid="market-list"] .pm-marketIcon').length, 2);
	assert.equal(h.dom.window.document.querySelectorAll('[data-testid="market-list"] .pm-marketFallback').length, 1);
	assert.match(h.dom.window.document.querySelector('[data-testid="market-list"] .pm-marketIcon').getAttribute('src') || '', /^https:\/\//);
	assert.ok(h.dom.window.document.body.textContent.includes('自动搜索 npm 与 DSH Registry'));
	assert.equal(h.dom.window.document.querySelectorAll('[data-testid="market-list"] .pm-rowMeta').length, 3, 'market home identifies each discovery source');

	const remoteImages = h.dom.window.document.querySelectorAll('[data-testid="market-list"] .pm-marketIcon');
	await act(async () => { remoteImages[1].dispatchEvent(new h.dom.window.Event('error', { bubbles: false })); });
	await h.flush();
	assert.equal(h.dom.window.document.querySelectorAll('[data-testid="market-list"] .pm-marketIcon').length, 1);
	assert.equal(h.dom.window.document.querySelectorAll('[data-testid="market-list"] .pm-marketFallback').length, 2);

	const listNode = h.dom.window.document.querySelector('[data-testid="market-list"]');
	await h.click([...h.dom.window.document.querySelectorAll('[data-testid="market-list"] .pm-row')][0]);
	await h.flush(); await h.flush();
	assert.ok(calls.some((call) => call.op === 'marketplace.detail'));
	assert.equal(h.dom.window.document.querySelector('[data-testid="market-list"]'), listNode);
	assert.ok(h.dom.window.document.querySelector('.pm-drawer .pm-marketIcon'));
	assert.ok(h.dom.window.document.querySelector('.pm-versionDecision').textContent.includes('0.12.3'));
	assert.equal(h.dom.window.document.querySelectorAll('.pm-disclosure').length, 2);
	assert.ok(!h.dom.window.document.body.textContent.includes('./lib/index.js'), 'technical rows stay collapsed by default');
	assert.equal(h.dom.window.document.querySelector('.pm-drawerFoot .pm-btnPrimary').textContent, '更新到 v0.15.2');
	await h.click(h.button('兼容与技术信息'));
	assert.ok(h.dom.window.document.body.textContent.includes('./lib/index.js'));

	await act(async () => { h.dom.window.document.dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
	assert.equal(h.dom.window.document.querySelector('.pm-drawer'), null);
	assert.ok(h.dom.window.document.querySelector('.ext-page'), 'Esc closes only the inner drawer');
});

test('marketplace unifies featured, DSH Registry, and npm discovery sources', async (t) => {
	const market = [
		{ id: 'omdsh-dev/DSH-better-sidebar', repository: 'omdsh-dev/DSH-better-sidebar', description: '精选插件。', iconUrl: 'https://github.com/omdsh-dev.png?size=64', iconSource: 'github-avatar', marketSource: 'featured', installable: true, status: 'not-installed', installedVersion: null },
		{ id: 'SiriLee/dsh-rewind', repository: 'SiriLee/dsh-rewind', description: '会话回退插件。', iconUrl: 'https://github.com/SiriLee.png?size=64', iconSource: 'github-avatar', marketSource: 'registry', installable: false, status: 'not-installed', installedVersion: null },
	];
	const calls = [];
	const router = async (body) => {
		calls.push(body);
		if (body.op === 'list') return { apiVersion: 1, plugins: [localPlugin('dsh-plugin-manager', { protected: true })] };
		if (body.op === 'marketplace') return { apiVersion: 1, items: market, registry: { status: 'fresh', generatedAt: '2026-08-24T03:00:00Z', warning: null } };
		if (body.op === 'marketplace.detail') return {
			id: body.id, repository: body.id, url: 'https://github.com/' + body.id, iconUrl: 'https://github.com/SiriLee.png?size=64', iconSource: 'github-avatar', marketSource: 'registry', installable: false, description: '会话回退插件。', author: 'SiriLee', stars: 10, forks: 1, language: 'TypeScript', license: 'MIT', lastPushedAt: new Date().toISOString(), topics: ['dsh-plugin'], latestVersion: 'v0.3.2', installedVersion: null, status: 'not-installed', manifest: { valid: true, dshRequirement: '>=0.0.1', hostEntry: './lib/index.js', clientEntry: './lib/client.js' },
		};
		throw new Error(`unexpected op ${body.op}`);
	};
	const h = await makeHarness(router);
	t.after(h.cleanup);
	await h.openPlugin();
	await h.click(h.button('插件市场'));
	await h.flush();
	assert.equal(h.dom.window.document.querySelectorAll('[data-testid="market-list"] .pm-row').length, 2);
	assert.equal(h.dom.window.document.querySelector('[data-testid="market-list"] .pm-rowTitle').textContent, 'omdsh-dev/DSH-better-sidebar');
	assert.ok(h.dom.window.document.body.textContent.includes('Registry 已更新'));

	const rows = h.dom.window.document.querySelectorAll('[data-testid="market-list"] .pm-row');
	assert.equal(rows[1].querySelector('.pm-rowTitle').textContent, 'SiriLee/dsh-rewind');
	assert.equal(rows[1].querySelector('.pm-status').textContent, '仅查看');
	await h.click(rows[1]);
	await h.flush(); await h.flush();
	assert.ok(calls.some((call) => call.op === 'marketplace.detail' && call.id === 'SiriLee/dsh-rewind'));
	const installButton = h.dom.window.document.querySelector('.pm-drawerFoot button[disabled]');
	assert.equal(installButton.textContent, '仅查看');
	assert.equal(installButton.disabled, true);
});
