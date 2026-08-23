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
		if (body.op === 'capabilities') return { apiVersion: 6, features: ['project-enable'] };
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
	assert.ok(h.dom.window.document.body.textContent.includes('仅在本机使用且不提交 Git'));
	assert.ok(!h.dom.window.document.body.textContent.includes('可纳入 Git 版本管理'));
	assert.equal(h.dom.window.document.querySelector('.sk-rowDesc').textContent, currentRow.description);
	assert.equal([...h.dom.window.document.querySelectorAll('.sk-badgeUpdate')].length, 1);

	const rowOpen = h.dom.window.document.querySelector('.sk-rowOpen');
	await act(async () => {
		rowOpen.focus();
		rowOpen.dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
	});
	assert.ok(h.dom.window.document.querySelector('.sk-drawer'), 'Enter opens the Skill drawer');
	await h.click(h.dom.window.document.querySelector('.sk-drawer button[aria-label="关闭详情"]'));
	await act(async () => {
		rowOpen.focus();
		rowOpen.dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
	});
	assert.ok(h.dom.window.document.querySelector('.sk-drawer'), 'Space opens the Skill drawer');
	assert.equal(h.dom.window.document.querySelector('.sk-descFull').textContent, currentRow.description);
	assert.equal(h.dom.window.document.querySelector('.smgr-switch').getAttribute('role'), 'switch');
	assert.equal(h.dom.window.document.querySelector('.sk-srcList').getAttribute('role'), 'radiogroup');
	assert.ok([...h.dom.window.document.querySelectorAll('.sk-src')].every((item) => item.getAttribute('role') === 'radio'));
	await h.click([...h.dom.window.document.querySelectorAll('.sk-src')].find((item) => item.textContent.includes('Claude 来源')));
	await h.flush();
	assert.ok(calls.some((call) => call.op === 'setSource' && call.cwd === '/project-a' && call.source === 'global-claude'));

	assert.ok(h.dom.window.document.querySelector('.sk-tagPanel'), 'tag editor is a single grouped control');
	assert.equal(h.dom.window.document.querySelector('.sk-tagScope').textContent, '全局共享');
	assert.equal(h.dom.window.document.querySelector('.sk-tagFoot').textContent, '按 Enter 添加0/20 · 每个最多 32 字符');
	const emptyTagAdd = h.dom.window.document.querySelector('.sk-tagAdd');
	assert.equal(emptyTagAdd.disabled, true, 'empty tag keeps the add action disabled');
	const tagInput = h.dom.window.document.querySelector('input[aria-label="新标签"]');
	assert.equal(tagInput.getAttribute('maxlength'), '32');
	assert.equal(tagInput.getAttribute('placeholder'), '输入标签');
	await act(async () => {
		Simulate.change(tagInput, { target: { value: '测试' } });
	});
	assert.equal(h.dom.window.document.querySelector('.sk-tagAdd').disabled, false);
	await h.click(h.dom.window.document.querySelector('.sk-tagAdd'));
	await h.flush();
	assert.ok(calls.some((call) => call.op === 'setTags' && call.tags.includes('测试')));
	assert.ok(h.dom.window.document.querySelector('[aria-label="已有标签"]'));
	assert.ok(h.dom.window.document.querySelector('button[aria-label="移除标签「测试」"]'));

	const tagWrites = calls.filter((call) => call.op === 'setTags').length;
	const duplicateInput = h.dom.window.document.querySelector('input[aria-label="新标签"]');
	await act(async () => {
		Simulate.change(duplicateInput, { target: { value: '测试' } });
	});
	assert.ok(h.dom.window.document.querySelector('.sk-tagIssue').textContent.includes('已经存在'));
	assert.equal(h.dom.window.document.querySelector('.sk-tagAdd').disabled, true, 'duplicate tags cannot be submitted');
	await act(async () => {
		Simulate.keyDown(duplicateInput, { key: 'Enter' });
	});
	await h.flush();
	assert.equal(calls.filter((call) => call.op === 'setTags').length, tagWrites);
	await h.click([...h.dom.window.document.querySelectorAll('.sk-projBtn')].find((item) => item.textContent.includes('全部标签')));
	assert.ok(h.button('测试'), 'new tag is immediately available in the global tag filter');
	await h.click(h.button('测试'));

	await act(async () => { h.dom.window.document.dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
	assert.equal(h.dom.window.document.querySelector('.sk-drawer'), null, 'first Esc closes only the drawer');
	assert.ok(h.dom.window.document.querySelector('.ext-page'), 'Extensions page remains open');

	await h.click(h.button('统一资源库'));
	assert.equal(h.dom.window.document.querySelector('[role="tab"][aria-selected="true"]').textContent, '统一资源库');
	assert.ok(h.dom.window.document.body.textContent.includes('来源 ×2'));
	await h.click(h.button('项目管理'));
	await h.click(h.button('应用推荐预设'));
	await h.flush();
	assert.ok(h.dom.window.document.querySelector('.test-modal'));
	assert.ok(h.dom.window.document.querySelector('.sk-presetApply'), 'preset preview uses the compact apply layout');
	assert.equal(h.dom.window.document.querySelector('.sk-presetMode').getAttribute('role'), 'radiogroup');
	assert.equal(h.dom.window.document.querySelectorAll('.sk-presetMode [role="radio"]').length, 2);
	assert.ok(h.dom.window.document.querySelector('.sk-presetImpactMain').textContent.includes('将启用 1 个 Skill'));
	assert.deepEqual([...h.dom.window.document.querySelectorAll('.sk-presetFooterLeft button')].map((item) => item.textContent), ['设为默认', '删除预设']);
	assert.equal(h.dom.window.document.querySelectorAll('.sk-diffGroup').length, 1);
	await h.click([...h.dom.window.document.querySelectorAll('button')].find((item) => item.textContent.startsWith('应用（')));
	await h.flush();
	assert.ok(calls.some((call) => call.op === 'presets.apply' && call.cwd === '/project-a'));

	await h.click(h.button('保存为预设'));
	assert.ok(h.dom.window.document.querySelector('.sk-presetSave'), 'save preset uses the compact labeled form');
	assert.equal(h.dom.window.document.querySelectorAll('.sk-presetFieldHead').length, 2);
	assert.equal(h.dom.window.document.querySelector('.sk-presetInput').getAttribute('maxlength'), '64');
	assert.equal(h.dom.window.document.querySelector('.sk-presetTextarea').getAttribute('maxlength'), '200');
	assert.ok(h.dom.window.document.querySelector('.sk-presetSaveSummary').textContent.includes('个已启用 Skill'));
	assert.deepEqual([...h.dom.window.document.querySelectorAll('.sk-presetCounter')].map((item) => item.textContent), ['0/64', '0/200']);
	await h.click(h.button('取消'));
	assert.equal(h.dom.window.document.querySelector('.sk-presetSave'), null);
});

test('current workspace wins persisted project and visible rows support counted bulk selection', async (t) => {
	const calls = [];
	let rows = [
		row('enabled-skill', '已启用描述', { enabled: true, modelInvocable: true }),
		row('disabled-a', '未启用 A'),
		row('disabled-b', '未启用 B'),
	];
	const router = async (body) => {
		calls.push(body);
		if (body.op === 'capabilities') return { apiVersion: 6, features: ['project-enable'] };
		if (body.op === 'catalog') return view(body.cwd || '/project-b', rows);
		if (body.op === 'presets.list') return { presets: [] };
		if (body.op === 'setMany') {
			rows = rows.map((item) => body.names.includes(item.name) ? Object.assign({}, item, { enabled: body.enabled }) : item);
			return { partial: false, report: { failed: [], conflicts: [] } };
		}
		throw new Error(`unexpected op ${body.op}`);
	};
	const h = await makeHarness(router, {
		current: '/project-b',
		workspaces: [{ path: '/project-a', title: 'project-a', updatedAt: '2' }],
	});
	t.after(h.cleanup);
	h.dom.window.localStorage.setItem('smgr.v1.project', '/project-a');
	await h.open();
	assert.equal(h.dom.window.document.querySelector('.sk-projectTitle').textContent, 'project-b');
	assert.ok(h.dom.window.document.querySelector('.sk-projectCard').textContent.includes('1 已启用 / 3 Skills'));
	assert.deepEqual([...h.dom.window.document.querySelectorAll('.sk-groupHead')].map((item) => item.textContent.trim()), ['已启用(1)', '未启用(2)']);
	assert.equal(h.button('全部3').textContent, '全部3');
	assert.equal(h.button('已启用1').textContent, '已启用1');
	assert.equal(h.button('未启用2').textContent, '未启用2');
	assert.equal(h.dom.window.document.querySelectorAll('.sk-check').length, 0, 'default mode hides bulk checkboxes');
	assert.equal(h.dom.window.document.querySelectorAll('.smgr-switch').length, 3, 'default mode shows per-Skill switches');
	assert.equal(h.dom.window.document.querySelector('input[aria-label="全选当前结果"]'), null);

	await h.click(h.button('批量管理'));
	assert.ok(h.dom.window.document.querySelector('.sk-batchHint').textContent.includes('右侧单项开关已暂时隐藏'));
	assert.equal(h.dom.window.document.querySelectorAll('.sk-check').length, 3, 'bulk mode reveals row checkboxes');
	assert.equal(h.dom.window.document.querySelectorAll('.smgr-switch').length, 0, 'bulk mode hides per-Skill switches');

	const selectVisible = h.dom.window.document.querySelector('input[aria-label="全选当前结果"]');
	await act(async () => { Simulate.change(selectVisible, { target: { checked: true } }); });
	assert.ok(h.dom.window.document.querySelector('.sk-bulkbar').textContent.includes('已选择 3 项'));
	await h.click(h.button('在本项目启用（3）'));
	await h.flush();
	assert.ok(calls.some((call) => call.op === 'setMany' && call.cwd === '/project-b' && call.enabled === true && call.names.length === 3));
	assert.equal(h.dom.window.document.querySelectorAll('.sk-check').length, 0, 'successful bulk action exits bulk mode');
	assert.equal(h.dom.window.document.querySelectorAll('.smgr-switch').length, 3);
});

test('project switch drops stale catalog, mutation and preset-preview responses', async (t) => {
	const staleCatalog = deferred();
	const staleMutation = deferred();
	const stalePreview = deferred();
	let aCatalogCalls = 0;
	const router = async (body) => {
		if (body.op === 'capabilities') return { apiVersion: 6, features: ['project-enable'] };
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
		if (body.op === 'capabilities') {
			const capabilityError = new Error('未知操作：capabilities');
			capabilityError.status = 400;
			throw capabilityError;
		}
		if (body.op === 'catalog') throw error;
		if (body.op === 'list') return { apiVersion: 5, cwd: '/project-a', roots: [], bundled: [], policy: { globalDefaultOff: false } };
		throw new Error(`unexpected op ${body.op}`);
	};
	const h = await makeHarness(router);
	t.after(h.cleanup);
	await h.open();
	assert.ok(h.dom.window.document.body.textContent.includes('现在显示旧版界面'));
});
