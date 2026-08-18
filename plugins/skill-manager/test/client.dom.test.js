/**
 * DSH-008 client bundle DOM integration tests.
 *
 * These tests execute the real classic-script client bundle in JSDOM and
 * mount the registered sidebar component with React 18. The DSH source tree
 * supplies the workspace's existing React/JSDOM dev dependencies; set
 * DSH_SOURCE_DIR when it is not the sibling `deepseek-harness` checkout.
 */
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
		if (parent === current) throw new Error('cannot locate dsharness repository root');
		current = parent;
	}
}

const dshSource = process.env.DSH_SOURCE_DIR || join(dirname(repositoryRoot()), 'deepseek-harness');
const dependencyAnchor = join(dshSource, 'packages', 'client', 'web', 'package.json');
if (!existsSync(dependencyAnchor)) {
	throw new Error(`DSH client test dependencies unavailable: ${dependencyAnchor}; set DSH_SOURCE_DIR`);
}
const dshRequire = createRequire(dependencyAnchor);
const React = dshRequire('react');
const { createRoot } = dshRequire('react-dom/client');
const { Simulate } = dshRequire('react-dom/test-utils');
const { JSDOM } = dshRequire('jsdom');
const { act } = React;

function deferred() {
	let resolvePromise;
	let rejectPromise;
	const promise = new Promise((resolveValue, rejectValue) => {
		resolvePromise = resolveValue;
		rejectPromise = rejectValue;
	});
	return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function source(key, label, description) {
	return {
		key,
		label,
		scope: key.startsWith('global-') ? 'global' : 'user',
		rank: key.startsWith('global-') ? 300 : 400,
		format: 'flat',
		path: `/skills/${key}.md`,
		modelInvocable: true,
		mtimeMs: 1,
		files: [],
		generated: false,
		modified: false,
		stale: false,
		description,
	};
}

function row(name, description, overrides = {}) {
	return Object.assign({
		name,
		description,
		tags: [],
		sources: [source('user-dsh', 'DSH 用户来源', description)],
		defaultSourceKey: 'user-dsh',
		sourceKey: null,
		effectiveSourceKey: 'user-dsh',
		specialized: false,
		enabled: false,
		modelInvocable: false,
		updateInfo: null,
	}, overrides);
}

function view(cwd, rows, extra = {}) {
	return Object.assign({
		apiVersion: 6,
		projectRoot: cwd,
		identities: rows,
		allTags: [],
		configExisted: true,
		configCorrupt: false,
		configFuture: false,
	}, extra);
}

function jsonResponse(value, status = 200) {
	const ok = status >= 200 && status < 300;
	return {
		ok,
		status,
		headers: { get: () => null },
		json: async () => ok ? { ok: true, value } : { ok: false, error: { message: String(value) } },
	};
}

async function makeHarness(router, { current = '/project-a', workspaces = [] } = {}) {
	const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', { url: 'http://127.0.0.1:3080/' });
	const previous = {};
	for (const key of ['window', 'document', 'HTMLElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'MutationObserver', 'localStorage', 'fetch', 'IS_REACT_ACT_ENVIRONMENT']) {
		previous[key] = globalThis[key];
	}
	globalThis.window = dom.window;
	globalThis.document = dom.window.document;
	globalThis.HTMLElement = dom.window.HTMLElement;
	globalThis.Node = dom.window.Node;
	globalThis.Event = dom.window.Event;
	globalThis.MouseEvent = dom.window.MouseEvent;
	globalThis.KeyboardEvent = dom.window.KeyboardEvent;
	globalThis.MutationObserver = dom.window.MutationObserver;
	globalThis.localStorage = dom.window.localStorage;
	globalThis.IS_REACT_ACT_ENVIRONMENT = true;
	globalThis.fetch = async (_url, init) => {
		const body = JSON.parse(init.body);
		try {
			return jsonResponse(await router(body));
		} catch (error) {
			return jsonResponse(error instanceof Error ? error.message : String(error), error && error.status ? error.status : 500);
		}
	};
	dom.window.fetch = globalThis.fetch;

	let registration = null;
	const sessions = {
		list: {
			getSnapshot: () => ({ current: 'session-a', byId: { 'session-a': { cwd: current } } }),
		},
	};
	const workspaceService = {
		list: { getSnapshot: () => ({ items: workspaces }) },
	};
	const slots = {
		inject: (_name, callback) => callback(),
		register: (definition, component) => {
			registration = { definition, component };
			return registration;
		},
	};
	const ctx = {
		get(name) {
			if (name === 'slots') return slots;
			if (name === 'sessions') return sessions;
			if (name === 'workspaces') return workspaceService;
			return undefined;
		},
	};

	const icon = (props) => React.createElement('span', Object.assign({ 'data-icon': '1' }, props));
	function Button(props) {
		const next = Object.assign({}, props);
		delete next.variant;
		return React.createElement('button', next, props.children);
	}
	function Modal(props) {
		if (!props.open) return null;
		return React.createElement('div', { role: 'dialog', 'aria-label': props.title || 'modal', className: 'test-modal' },
			React.createElement('h2', null, props.title),
			props.description ? React.createElement('p', null, props.description) : null,
			props.children,
			React.createElement('footer', null, props.footer));
	}
	const primitives = new Proxy({ Button, Modal }, { get: (target, key) => target[key] || icon });
	let loadedDefinition = null;
	dom.window.__ModuleLoader__ = { load: (definition) => { loadedDefinition = definition; } };
	const bundle = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8');
	new Function(bundle)();
	assert.ok(loadedDefinition, 'client bundle registered with the module loader');
	const plugin = loadedDefinition.factory((id) => {
		if (id === 'react') return React;
		if (id === '@deepseek-ai/dsh-client-ui-primitives') return primitives;
		throw new Error(`unexpected client require: ${id}`);
	});
	plugin.apply(ctx);
	assert.ok(registration, 'sidebar registration captured');
	const rootNode = dom.window.document.getElementById('root');
	const reactRoot = createRoot(rootNode);
	await act(async () => {
		reactRoot.render(React.createElement(registration.component, Object.assign({ wide: true }, registration.definition.inject())));
	});

	async function click(element) {
		assert.ok(element, 'click target exists');
		await act(async () => { element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
	}
	async function flush() {
		await act(async () => { await new Promise((resolveValue) => setTimeout(resolveValue, 0)); });
	}
	function button(text) {
		return [...dom.window.document.querySelectorAll('button')].find((item) => item.textContent.trim() === text);
	}
	async function open() {
		await click(dom.window.document.querySelector('.ext-trigger'));
		await flush();
		await flush();
	}
	async function cleanup() {
		await act(async () => { reactRoot.unmount(); });
		dom.window.close();
		for (const [key, value] of Object.entries(previous)) {
			if (value === undefined) delete globalThis[key];
			else globalThis[key] = value;
		}
	}
	return { dom, click, flush, button, open, cleanup };
}

test('real client bundle renders both pages, full descriptions, guarded update badge, drawer and actions', async (t) => {
	const calls = [];
	let currentRow = row('alpha-skill', '完整 description：这一整段内容必须原样展示，不能省略。', {
		sources: [
			source('user-dsh', 'DSH 用户来源', 'user'),
			source('global-claude', 'Claude 来源', 'claude'),
		],
		updateInfo: { version: '2.0.0' },
	});
	const router = async (body) => {
		calls.push(body);
		if (body.op === 'catalog') return view('/project-a', [currentRow]);
		if (body.op === 'presets.list') return { presets: [{ name: '日常预设', description: 'preset', defaultSlim: false, skillCount: 1 }] };
		if (body.op === 'setSource') {
			currentRow = Object.assign({}, currentRow, { sourceKey: body.source, effectiveSourceKey: body.source });
			return { view: currentRow, partial: false, report: { failed: [], conflicts: [] } };
		}
		if (body.op === 'setTags') {
			currentRow = Object.assign({}, currentRow, { tags: body.tags });
			return { view: currentRow };
		}
		if (body.op === 'presets.preview') return { diff: { toEnable: ['alpha-skill'], toDisable: [], sourceChanges: [], finalEnabled: ['alpha-skill'] } };
		if (body.op === 'presets.apply') return { partial: false, report: { failed: [], conflicts: [] } };
		throw new Error(`unexpected op ${body.op}`);
	};
	const h = await makeHarness(router);
	t.after(h.cleanup);
	await h.open();
	assert.ok(h.button('项目管理'));
	assert.ok(h.button('统一资源库'));
	assert.equal(h.dom.window.document.querySelector('.sk-rowDesc').textContent, currentRow.description);
	assert.equal([...h.dom.window.document.querySelectorAll('.sk-badgeUpdate')].length, 1);

	await h.click(h.dom.window.document.querySelector('.sk-row'));
	assert.equal(h.dom.window.document.querySelector('.sk-descFull').textContent, currentRow.description);
	await h.click([...h.dom.window.document.querySelectorAll('.sk-src')].find((item) => item.textContent.includes('Claude 来源')));
	await h.flush();
	assert.ok(calls.some((call) => call.op === 'setSource' && call.cwd === '/project-a' && call.source === 'global-claude'));

	const tagInput = h.dom.window.document.querySelector('input[placeholder="＋ 添加标签"]');
	await act(async () => {
		Simulate.change(tagInput, { target: { value: '测试' } });
	});
	await h.click(h.button('添加'));
	await h.flush();
	assert.ok(calls.some((call) => call.op === 'setTags' && call.tags.includes('测试')));

	await act(async () => { h.dom.window.document.dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
	assert.equal(h.dom.window.document.querySelector('.sk-drawer'), null, 'first Esc closes only the drawer');
	assert.ok(h.dom.window.document.querySelector('.ext-page'), 'Extensions page remains open');

	await h.click(h.button('统一资源库'));
	assert.equal(h.dom.window.document.querySelector('[role="tab"][aria-selected="true"]').textContent, '统一资源库');
	assert.ok(h.dom.window.document.body.textContent.includes('来源 ×2'));
	await h.click(h.button('项目管理'));
	await h.click([...h.dom.window.document.querySelectorAll('button')].find((item) => item.textContent.includes('日常预设')));
	await h.flush();
	assert.ok(h.dom.window.document.querySelector('.test-modal'));
	await h.click([...h.dom.window.document.querySelectorAll('button')].find((item) => item.textContent.startsWith('应用（')));
	await h.flush();
	assert.ok(calls.some((call) => call.op === 'presets.apply' && call.cwd === '/project-a'));
});

test('project switch drops stale catalog, mutation and preset-preview responses', async (t) => {
	const staleCatalog = deferred();
	const staleMutation = deferred();
	const stalePreview = deferred();
	let aCatalogCalls = 0;
	const router = async (body) => {
		if (body.op === 'presets.list') return { presets: [{ name: '竞态预设', skillCount: 1 }] };
		if (body.op === 'catalog' && body.cwd === '/project-a') {
			aCatalogCalls += 1;
			if (aCatalogCalls <= 3) return view('/project-a', [row('shared-skill', 'A 项目内容')]);
			return staleCatalog.promise;
		}
		if (body.op === 'catalog' && body.cwd === '/project-b') return view('/project-b', [row('shared-skill', 'B 项目内容')]);
		if (body.op === 'setEnabled') return staleMutation.promise;
		if (body.op === 'presets.preview') return stalePreview.promise;
		throw new Error(`unexpected op ${body.op}`);
	};
	const h = await makeHarness(router, { workspaces: [{ path: '/project-b', title: 'project-b', updatedAt: '2' }] });
	t.after(h.cleanup);
	await h.open();
	assert.equal(h.dom.window.document.querySelector('.sk-rowDesc').textContent, 'A 项目内容');

	// Start an A mutation, then switch to B before it resolves.
	await h.click(h.dom.window.document.querySelector('.smgr-switch'));
	await h.click(h.dom.window.document.querySelector('.sk-projBtn'));
	await h.click(h.button('project-b'));
	await h.flush();
	assert.equal(h.dom.window.document.querySelector('.sk-rowDesc').textContent, 'B 项目内容');
	staleMutation.resolve({ view: row('shared-skill', 'STALE A MUTATION', { enabled: true }), partial: false, report: { failed: [], conflicts: [] } });
	await h.flush();
	assert.equal(h.dom.window.document.querySelector('.sk-rowDesc').textContent, 'B 项目内容');

	// Start a slow A catalog, switch back to B, then resolve A out of order.
	await h.click(h.dom.window.document.querySelector('.sk-projBtn'));
	await h.click([...h.dom.window.document.querySelectorAll('button')].find((item) => item.textContent.includes('project-a')));
	await h.flush();
	await h.click(h.dom.window.document.querySelector('.sk-projBtn'));
	await h.click(h.button('project-b'));
	await h.flush();
	staleCatalog.resolve(view('/project-a', [row('shared-skill', 'STALE A CATALOG')]));
	await h.flush();
	assert.equal(h.dom.window.document.querySelector('.sk-rowDesc').textContent, 'B 项目内容');

	// A preview that resolves after switching projects must not open a modal.
	await h.click(h.dom.window.document.querySelector('.sk-projBtn'));
	await h.click([...h.dom.window.document.querySelectorAll('button')].find((item) => item.textContent.includes('project-a')));
	staleCatalog.resolve(view('/project-a', [row('shared-skill', 'A again')]));
	await h.flush();
	const preset = [...h.dom.window.document.querySelectorAll('button')].find((item) => item.textContent.includes('竞态预设'));
	if (preset) {
		await h.click(preset);
		await h.click(h.dom.window.document.querySelector('.sk-projBtn'));
		await h.click(h.button('project-b'));
		stalePreview.resolve({ diff: { toEnable: [], toDisable: [], sourceChanges: [], finalEnabled: [] } });
		await h.flush();
		assert.equal(h.dom.window.document.querySelector('.test-modal'), null);
	}
});

test('unknown catalog op safely falls back to the legacy Skill Manager UI', async (t) => {
	const error = new Error('未知操作：catalog');
	error.status = 400;
	const router = async (body) => {
		if (body.op === 'catalog') throw error;
		if (body.op === 'list') return { apiVersion: 5, cwd: '/project-a', roots: [], bundled: [], policy: { globalDefaultOff: false } };
		throw new Error(`unexpected op ${body.op}`);
	};
	const h = await makeHarness(router);
	t.after(h.cleanup);
	await h.open();
	assert.ok(h.dom.window.document.body.textContent.includes('现在显示旧版界面'));
});
