/**
 * dsh-skill-manager — client half (browser bundle).
 * build: 11
 *
 * Served verbatim at /plugins/dsh-skill-manager/client.js by the client
 * module system; a classic script that registers its lazy-CJS factory on
 * window.__ModuleLoader__. The factory requires only shell seed words
 * (react, @deepseek-ai/dsh-client-ui-primitives) and registers a
 * `sidebar.footer.action` entry: the 「扩展」 sidebar-foot row that opens
 * the frame-wide Extensions page (SKILL / MCP / Plugin).
 *
 * build 3: skill packages — skills sharing a prefix (first hyphen part)
 * with 3+ members collapse into one package row (default folded, per-root
 * state in localStorage), with editable display label, batch delete, and
 * batch export to a single ZIP (host op `exportZip`).
 * build 5: per-project enable/disable — a small switch on every skill row.
 * Toggling writes either the skill's own frontmatter flag (project-local
 * skills) or a project-level shadow switch file (user/bundled skills), so
 * only this project's sessions are affected (host op `setStatus`, needs a
 * dsh web restart until the running host loads apiVersion 4; switches are
 * greyed out with an explanation until then).
 * build 6: global default-off policy (host apiVersion 5) — a page-level
 * master switch that flags every user-root skill (bundled built-ins and
 * external global roots untouched); while on, enabling a user skill in a
 * project creates a project-local copy. Marker switch-file rows are hidden
 * by default, counted in the project section header, and revealed by
 * search. Toggling switches no longer flashes a toast.
 * build 7: state clarity — disabled rows are dimmed with a solid amber
 * 「已禁用」 badge; a 全部/已启用/已禁用 filter sits in the toolbar
 * (the 已禁用 filter also reveals marker switch files, which stay hidden
 * by default); marker switch files no longer leak into package groups.
 * build 8: in-place editing removed (detail view is read-only now; the
 * host `save` op stays available but has no UI entry) and the 只读 /
 * 被 … 遮蔽 badges are dropped — the dimmed state already tells the
 * story.
 * build 9: packages stand out — brand-tinted background (color-mix,
 * fallback for old engines), 3px brand accent bar on the left, a small
 * crate icon; and within each root section package rows are sorted to
 * the top (standalone rows follow, both keeping relative order).
 * build 10: the brand token in this theme is a near-black bluish gray,
 * so the tint read as plain gray — switch to the theme's real blue
 * scale (--dsw-static-blue-500), raise the tint to 10%, and redraw the
 * icon as an outlined box with a lid line.
 *
 * Plain JavaScript only — no JSX, no TypeScript, no imports.
 */
(function () {
	window.__ModuleLoader__.load({
		id: 'dsh-skill-manager',
		factory: function (require) {
			var React = require('react');
			var h = React.createElement;
			var P = require('@deepseek-ai/dsh-client-ui-primitives');
			var Button = P.Button;
			var Modal = P.Modal;

			// ── styles (claimed for this plugin by the module system) ─────────
			var style = document.createElement('style');
			style.setAttribute('data-plugin', 'dsh-skill-manager');
			style.textContent = [
				'.smgr{display:flex;flex-direction:column;gap:12px;max-width:780px;color:var(--dsw-alias-label-primary)}',
				'.smgr h2{margin:0;font-size:18px;font-weight:600}',
				'.smgr-intro{margin:0;font-size:13px;color:var(--dsw-alias-label-tertiary);line-height:1.6}',
				'.smgr-cwd{margin:0;font-size:12px;color:var(--dsw-alias-label-caption)}',
				'.smgr-cwd code{overflow-wrap:anywhere}',
				'.smgr-toolbar{display:flex;gap:8px;align-items:center}',
				'.smgr-search{flex:1;min-width:120px;background:var(--dsw-alias-bg-module-platform);color:inherit;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:6px 10px;font:inherit;font-size:13px}',
				'.smgr-search:focus{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}',
				'.smgr-group{display:flex;flex-direction:column;gap:6px}',
				'.smgr-group h3{margin:10px 0 0;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary);display:flex;gap:6px;align-items:center}',
				'.smgr-count{white-space:nowrap;border-radius:999px;background:var(--dsw-alias-fill-tsp-secondary);color:var(--dsw-alias-label-secondary);padding:1px 8px;font-size:11px;font-weight:500}',
				'.smgr-row{display:flex;align-items:center;gap:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:10px;padding:8px 12px;cursor:pointer}',
				'.smgr-row:hover{border-color:var(--dsw-alias-label-dimmed)}',
				'.smgr-rowActive,.smgr-rowActive:hover{border-color:var(--dsw-alias-label-primary)}',
				'.smgr-rowMain{flex:1;display:flex;flex-direction:column;gap:2px;min-width:0}',
				'.smgr-name{font-size:13px;font-weight:600;display:flex;gap:6px;align-items:center;flex-wrap:wrap}',
				'.smgr-desc{font-size:12px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
				'.smgr-badge{white-space:nowrap;border-radius:999px;background:var(--dsw-alias-fill-tsp-secondary);color:var(--dsw-alias-label-secondary);padding:1px 8px;font-size:11px;font-weight:500}',
				'.smgr-badgeShadow{background:transparent;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary)}',
				'.smgr-badgeBad{background:var(--dsw-alias-state-error-primary);color:#fff}',
				'.smgr-badgeOff{background:var(--dsw-alias-state-warn-primary);color:#fff}',
				'.smgr-rowOff .smgr-title,.smgr-rowOff .smgr-desc{opacity:.55}',
				'.smgr-pkgRowOff .smgr-title,.smgr-pkgRowOff .smgr-desc{opacity:.55}',
				'.smgr-filter{display:inline-flex;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;overflow:hidden;flex:none}',
				'.smgr-filterBtn{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:12px;padding:6px 10px;line-height:1;white-space:nowrap}',
				'.smgr-filterBtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
				'.smgr-filterBtnActive{background:var(--dsw-alias-fill-tsp-secondary);color:var(--dsw-alias-label-primary);font-weight:600}',
				'.smgr-rowActions{display:flex;gap:2px;flex:none;align-items:center}',
				'.smgr-iconBtn{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;border-radius:6px;padding:4px 7px;font-size:13px;line-height:1}',
				'.smgr-iconBtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
				'.smgr-iconBtnDanger:hover{color:var(--dsw-alias-state-error-primary)}',
				'.smgr-empty{margin:0;font-size:12px;color:var(--dsw-alias-label-quaternary)}',
				'.smgr-error{margin:0;font-size:13px;color:var(--dsw-alias-state-error-primary)}',
				'.smgr-toast{font-size:12px;color:var(--dsw-alias-label-tertiary)}',
				'.smgr-pkgRow{display:flex;align-items:center;gap:8px;border:1px solid var(--dsw-alias-border-l2);border-left:3px solid var(--dsw-static-blue-500);background:var(--dsw-alias-bg-layer-3);background:color-mix(in srgb,var(--dsw-static-blue-500) 10%,var(--dsw-alias-bg-layer-3));border-radius:10px;padding:8px 12px;cursor:pointer}',
				'.smgr-pkgIcon{flex:none;position:relative;width:13px;height:13px;border:1.5px solid var(--dsw-static-blue-500);border-radius:3px}',
				'.smgr-pkgIcon:after{content:"";position:absolute;left:2px;right:2px;top:4px;height:1.5px;background:var(--dsw-static-blue-500)}',
				'.smgr-pkgRow:hover{border-color:var(--dsw-alias-label-dimmed)}',
				'.smgr-caret{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;font-size:11px;line-height:1;padding:4px 5px;border-radius:6px;flex:none}',
				'.smgr-caret:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
				'.smgr-pkgLabel{cursor:default}',
				'.smgr-pkgMembers{display:flex;flex-direction:column;gap:4px;margin:4px 0 2px 14px;padding-left:10px;border-left:1px solid var(--dsw-alias-border-l2)}',
				'.smgr-labelInput{font:inherit;font-size:13px;font-weight:600;background:var(--dsw-alias-bg-module-platform);color:inherit;border:1px solid var(--dsw-alias-brand-primary);border-radius:6px;padding:2px 6px;width:160px}',
				'.smgr-pkgList{font-size:11px;color:var(--dsw-alias-label-quaternary);line-height:1.6;max-height:72px;overflow:auto;white-space:pre-wrap}',
				'.smgr-switch{position:relative;width:30px;height:17px;flex:none;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-fill-tsp-secondary);cursor:pointer;padding:0;transition:background .12s,border-color .12s}',
				'.smgr-switchOn{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}',
				'.smgr-switchKnob{position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:var(--dsw-alias-label-secondary);transition:transform .12s,background .12s;pointer-events:none}',
				'.smgr-switchOn .smgr-switchKnob{transform:translateX(13px);background:#fff}',
				'.smgr-switchDim{opacity:.5;cursor:not-allowed}',
				'.smgr-bulkBtn{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;border-radius:6px;padding:4px 7px;font-size:11px;line-height:1;white-space:nowrap}',
				'.smgr-bulkBtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
				'.smgr-policy{display:flex;align-items:center;gap:10px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:10px;padding:8px 12px}',
				'.smgr-policyMain{flex:1;min-width:0}',
				'.smgr-policyDesc{display:block;font-size:12px;color:var(--dsw-alias-label-tertiary);line-height:1.5}',
				// ── DSH-006: sidebar-foot 「扩展」 entry + full page ────────────
				'.ext-layer{flex:none;align-items:center;width:100%;height:49px;margin:8px 0 0;display:flex;position:relative}',
				'.ext-layerRail{width:36px;height:36px;margin:0}',
				'.ext-trigger{width:100%;height:49px;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border:none;border-radius:12px;align-items:center;gap:8px;padding:0 8px 0 6px;font-family:inherit;font-size:14px;display:inline-flex;overflow:hidden}',
				'.ext-trigger:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}',
				'.ext-triggerActive,.ext-triggerActive:hover{background:var(--dsw-alias-interactive-bg-hover)}',
				'.ext-triggerLabel{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}',
				'.ext-layerRail .ext-trigger{border-radius:50%;justify-content:center;gap:0;width:36px;height:36px;padding:0}',
				'.ext-icon{flex:none;color:var(--dsw-alias-label-secondary);display:inline-flex;align-items:center;justify-content:center}',
				'.ext-layerRail .ext-icon{color:var(--dsw-alias-label-primary)}',
				'.ext-page{position:fixed;top:0;right:0;bottom:0;left:0;z-index:200;background:var(--dsw-alias-bg-base);display:flex;flex-direction:column;color:var(--dsw-alias-label-primary)}',
				'.ext-top{flex:none;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--dsw-alias-border-l2);padding:14px 20px}',
				'.ext-topTitle{display:flex;align-items:center;gap:10px;font-size:18px;font-weight:600}',
				'.ext-topTitle .ext-icon{color:var(--dsw-alias-label-primary)}',
				'.ext-topSub{font-size:12px;color:var(--dsw-alias-label-tertiary)}',
				'.ext-close{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;border-radius:8px;padding:6px 9px;font-size:15px;line-height:1;margin-left:auto}',
				'.ext-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
				'.ext-body{flex:1;min-height:0;display:flex}',
				'.ext-nav{flex:none;width:190px;border-right:1px solid var(--dsw-alias-border-l2);padding:12px;display:flex;flex-direction:column;gap:6px;overflow-y:auto}',
				'.ext-navBtn{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;border-radius:10px;padding:9px 12px;text-align:left;font:inherit;display:flex;flex-direction:column;gap:2px;align-items:flex-start}',
				'.ext-navBtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
				'.ext-navBtnActive{background:var(--dsw-alias-fill-tsp-secondary);color:var(--dsw-alias-label-primary)}',
				'.ext-navBtnActive:hover{background:var(--dsw-alias-fill-tsp-secondary)}',
				'.ext-navLabel{font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px}',
				'.ext-navDesc{font-size:11px;color:var(--dsw-alias-label-tertiary)}',
				'.ext-soon{border-radius:999px;background:var(--dsw-alias-fill-tsp-secondary);color:var(--dsw-alias-label-tertiary);padding:0 6px;font-size:10px;font-weight:500;line-height:16px;white-space:nowrap}',
				'.ext-main{flex:1;min-width:0;overflow-y:auto;padding:20px 24px}',
				'.ext-placeholder{max-width:520px;display:flex;flex-direction:column;gap:10px;padding:48px 0}',
				'.ext-phIcon{color:var(--dsw-alias-label-quaternary)}',
				'.ext-placeholder h3{margin:0;font-size:16px;font-weight:600}',
				'.ext-placeholder p{margin:0;font-size:13px;color:var(--dsw-alias-label-tertiary);line-height:1.7}',
				'.ext-phSoon{color:var(--dsw-alias-label-quaternary);font-size:12px}'
			].join('');
			document.head.appendChild(style);

			// ── host API ──────────────────────────────────────────────────────
			function apiCall(op, payload, ctx) {
				var body = Object.assign({ op: op }, payload || {});
				body.cwd = currentCwd(ctx);
				return fetch('/api/skill-manager', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(body)
				}).then(function (res) {
					return res.json().then(function (data) {
						if (!res.ok || !data || data.ok !== true) {
							throw new Error((data && data.error && data.error.message) || ('HTTP ' + res.status));
						}
						return data.value;
					});
				});
			}
			/** Batch export: returns the downloaded file name. */
			function zipDownload(rootId, names, ctx) {
				var body = { op: 'exportZip', root: rootId, names: names };
				body.cwd = currentCwd(ctx);
				return fetch('/api/skill-manager', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(body)
				}).then(function (res) {
					if (!res.ok) {
						return res.json().then(function (data) {
							var msg = data && data.error && data.error.message;
							if (msg && msg.indexOf('exportZip') !== -1) throw new Error('zip 导出需要重启 dsh web 后生效（host 端尚未加载新操作）');
							throw new Error(msg || ('HTTP ' + res.status));
						});
					}
					var cd = res.headers.get('content-disposition') || '';
					var m = /filename="([^"]+)"/.exec(cd);
					var fallback = (names.length === 1 ? names[0] : names[0].split('-')[0] + '-' + names.length + '-skills') + '.zip';
					return res.blob().then(function (blob) {
						downloadBlob(m ? m[1] : fallback, blob);
						return m ? m[1] : fallback;
					});
				});
			}
			/** The cwd of the session this page is showing, or undefined. */
			function currentCwd(ctx) {
				try {
					var sessions = ctx.get('sessions');
					if (!sessions || !sessions.list || typeof sessions.list.getSnapshot !== 'function') return undefined;
					var snap = sessions.list.getSnapshot();
					var id = snap && snap.current;
					if (id === undefined || id === null) return undefined;
					var summary = snap.byId ? snap.byId[id] : undefined;
					return summary && summary.cwd ? summary.cwd : undefined;
				} catch (error) {
					return undefined;
				}
			}

			// ── small helpers ─────────────────────────────────────────────────
			function matches(skill, q) {
				if (q === '') return true;
				const needle = q.toLowerCase();
				return (
					(skill.name || '').toLowerCase().includes(needle) ||
					(skill.title || '').toLowerCase().includes(needle) ||
					(skill.description || '').toLowerCase().includes(needle)
				);
			}
			function downloadBlob(filename, blob) {
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = filename;
				document.body.appendChild(a);
				a.click();
				a.remove();
				setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
			}
			/**
			 * Skill packages: skills whose name prefix (text before the first
			 * hyphen) groups 3+ members collapse into one package, emitted at
			 * the position of the first member. 1-2 member prefixes stay
			 * standalone so small name collisions never look packaged.
			 */
			function groupSkills(skills) {
				const byPrefix = Object.create(null);
				const order = [];
				for (let i = 0; i < skills.length; i += 1) {
					// Marker switch files are bookkeeping, never package members:
					// they stay standalone (and hidden unless searched).
					if (skills[i].isShadow) continue;
					const dash = skills[i].name.indexOf('-');
					const prefix = dash > 0 ? skills[i].name.slice(0, dash) : null;
					if (prefix === null) continue;
					if (byPrefix[prefix] === undefined) { byPrefix[prefix] = []; order.push(prefix); }
					byPrefix[prefix].push(skills[i]);
				}
				const items = [];
				const emitted = Object.create(null);
				for (let i = 0; i < skills.length; i += 1) {
					const skill = skills[i];
					const dash = skill.name.indexOf('-');
					const prefix = dash > 0 ? skill.name.slice(0, dash) : null;
					if (prefix === null || skill.isShadow) { items.push({ kind: 'skill', skill: skill }); continue; }
					if (emitted[prefix]) continue;
					emitted[prefix] = true;
					const members = byPrefix[prefix];
					if (members.length >= 3) items.push({ kind: 'package', prefix: prefix, skills: members });
					else for (let k = 0; k < members.length; k += 1) items.push({ kind: 'skill', skill: members[k] });
				}
				return items;
			}
			// Per-(root, prefix) package display state, browser-local only.
			function readPkgMeta(rootId, prefix) {
				try {
					const raw = window.localStorage.getItem('smgr.pkg.' + rootId + '.' + prefix);
					return raw ? JSON.parse(raw) : {};
				} catch (error) {
					return {};
				}
			}
			function writePkgMeta(rootId, prefix, patch) {
				const cur = readPkgMeta(rootId, prefix);
				const next = Object.assign({}, cur, patch);
				try { window.localStorage.setItem('smgr.pkg.' + rootId + '.' + prefix, JSON.stringify(next)); } catch (error) {}
				return next;
			}

			// ── the section component ─────────────────────────────────────────
			function SkillManagerSection(props) {
				const api = props.api;
				const [data, setData] = React.useState(null);
				const [error, setError] = React.useState(null);
				const [busy, setBusy] = React.useState(false);
				const [toggling, setToggling] = React.useState(null); // "root:name"
				const [bulkBusy, setBulkBusy] = React.useState(false);
				const [policyBusy, setPolicyBusy] = React.useState(false);
				const [q, setQ] = React.useState('');
				const [filter, setFilter] = React.useState('all'); // 'all' | 'off' | 'on'
				const [sel, setSel] = React.useState(null); // {root, name}
				const [detail, setDetail] = React.useState(null);
				const [confirmDelete, setConfirmDelete] = React.useState(false);
				const [confirmPkg, setConfirmPkg] = React.useState(null); // {rootId, prefix, label, names}
				const [editingPkg, setEditingPkg] = React.useState(null); // {rootId, prefix}
				const [labelDraft, setLabelDraft] = React.useState('');
				const [importOpen, setImportOpen] = React.useState(false);
				const [importText, setImportText] = React.useState('');
				const [importRoot, setImportRoot] = React.useState('user-dsh');
				const [notice, setNotice] = React.useState(null);
				const [, setUiTick] = React.useState(0);
				function bump() { setUiTick((t) => t + 1); }

				function flash(message) {
					setNotice(message);
					setTimeout(function () { setNotice(null); }, 4000);
				}

				const load = React.useCallback(function () {
					setBusy(true);
					setError(null);
					return api.call('list', {}).then(
						function (value) { setData(value); setBusy(false); },
						function (e) { setError(String((e && e.message) || e)); setBusy(false); }
					);
				}, [api]);

				React.useEffect(function () {
					void load();
				}, [load]);

				// Per-project switch availability: host op (apiVersion >= 4)
				// plus a project root to scope it to.
				const switchReady = data !== null && typeof data.apiVersion === 'number' && data.apiVersion >= 4;
				const projectReady = data !== null && typeof data.projectRoot === 'string' && data.projectRoot.length > 0;
				// Package-zip needs the host's exportZip op (apiVersion >= 3);
				// the running process only has it after a dsh web restart.
				const zipReady = data !== null && typeof data.apiVersion === 'number' && data.apiVersion >= 3;
				// Global default-off policy needs host apiVersion >= 5.
				const policyReady = data !== null && typeof data.apiVersion === 'number' && data.apiVersion >= 5;
				const policyOn = policyReady && data.policy !== undefined && data.policy.globalDefaultOff === true;

				function openDetail(root, name) {
					setSel({ root: root, name: name });
					setDetail(null);
					api.call('read', { root: root, name: name }).then(
						function (value) { setDetail(value); },
						function (e) { setError(String((e && e.message) || e)); setDetail(null); }
					);
				}
				function doDelete() {
					if (!sel) return;
					setBusy(true);
					setError(null);
					api.call('delete', { root: sel.root, name: sel.name }).then(
						function () {
							setBusy(false);
							setConfirmDelete(false);
							setSel(null);
							setDetail(null);
							flash('已删除 ' + sel.name);
							void load();
						},
						function (e) { setBusy(false); setConfirmDelete(false); setError(String((e && e.message) || e)); }
					);
				}
				function exportSkill(skill, content) {
					if (content === undefined) return;
					const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
					downloadBlob(skill.name + '.md', blob);
				}
				function doImport() {
					setBusy(true);
					setError(null);
					api.call('import', { root: importRoot, content: importText }).then(
						function (value) {
							setBusy(false);
							setImportOpen(false);
							setImportText('');
							flash('已导入 ' + value.name);
							void load();
						},
						function (e) { setBusy(false); setError(String((e && e.message) || e)); }
					);
				}
				function onImportFile(event) {
					const file = event.target.files && event.target.files[0];
					if (!file) return;
					const reader = new FileReader();
					reader.onload = function () { setImportText(String(reader.result)); };
					reader.onerror = function () { setError('文件读取失败'); };
					reader.readAsText(file, 'utf8');
					event.target.value = '';
				}

				// ── global default-off policy ─────────────────────────────────
				function togglePolicy() {
					if (!policyReady || policyBusy) return;
					setPolicyBusy(true);
					setError(null);
					api.call('setPolicy', { globalDefaultOff: !policyOn }).then(
						function () {
							setPolicyBusy(false);
							void load();
						},
						function (e) { setPolicyBusy(false); setError(String((e && e.message) || e)); }
					);
				}

				// ── per-project switch ────────────────────────────────────────
				function toggleSkill(root, skill) {
					const key = root.id + ':' + skill.name;
					if (!switchReady || !projectReady || toggling !== null) return;
					setToggling(key);
					setError(null);
					const wantDisabled = skill.disabled !== true;
					api.call('setStatus', { root: root.id, name: skill.name, disabled: wantDisabled }).then(
						function () {
							setToggling(null);
							// The switch position itself is the feedback; no toast.
							void load();
						},
						function (e) { setToggling(null); setError(String((e && e.message) || e)); }
					);
				}
				function bulkToggle(root, skills) {
					if (!switchReady || !projectReady || bulkBusy) return;
					const offCount = skills.filter(function (s) { return s.disabled === true; }).length;
					const wantDisabled = offCount !== skills.length; // all off → enable all; else disable the rest
					const targets = skills.filter(function (s) { return (s.disabled === true) !== wantDisabled; });
					if (targets.length === 0) return;
					setBulkBusy(true);
					setError(null);
					const failed = [];
					let chain = Promise.resolve();
					targets.forEach(function (s) {
						chain = chain.then(function () {
							return api.call('setStatus', { root: root.id, name: s.name, disabled: wantDisabled }).catch(function (e) {
								failed.push(s.name + '：' + String((e && e.message) || e));
							});
						});
					});
					chain.then(function () {
						setBulkBusy(false);
						if (failed.length > 0) setError('批量开关有 ' + failed.length + ' 个失败：' + failed.slice(0, 3).join('；') + (failed.length > 3 ? ' …' : ''));
						void load();
					});
				}

				// ── package-level actions ─────────────────────────────────────
				function togglePkg(rootId, prefix, expanded) {
					writePkgMeta(rootId, prefix, { expanded: !expanded });
					bump();
				}
				function startLabelEdit(rootId, prefix, currentLabel) {
					setEditingPkg({ rootId: rootId, prefix: prefix });
					setLabelDraft(currentLabel);
				}
				function commitLabelEdit() {
					if (editingPkg === null) return;
					const v = labelDraft.trim();
					writePkgMeta(editingPkg.rootId, editingPkg.prefix, { label: v === '' ? null : v });
					setEditingPkg(null);
					setLabelDraft('');
					bump();
				}
				function doExportPkgZip(rootId, skills) {
					if (!zipReady) {
						setError('整包 zip 导出需要重启 dsh web 后生效（运行中的 host 尚未加载 exportZip 操作）；单件导出与批量删除不受影响');
						return;
					}
					setBusy(true);
					setError(null);
					api.zip(rootId, skills.map(function (s) { return s.name; })).then(
						function (filename) { setBusy(false); flash('已导出 ' + filename); },
						function (e) { setBusy(false); setError(String((e && e.message) || e)); }
					);
				}
				function doPkgDelete() {
					if (confirmPkg === null) return;
					setBusy(true);
					setError(null);
					const target = confirmPkg;
					const failed = [];
					let chain = Promise.resolve();
					target.names.forEach(function (n) {
						chain = chain.then(function () {
							return api.call('delete', { root: target.rootId, name: n }).catch(function (e) {
								failed.push(n + '：' + String((e && e.message) || e));
							});
						});
					});
					chain.then(function () {
						setBusy(false);
						setConfirmPkg(null);
						if (failed.length > 0) setError('批量删除有 ' + failed.length + ' 个失败：' + failed.slice(0, 3).join('；') + (failed.length > 3 ? ' …' : ''));
						else flash('已删除技能包「' + target.label + '」（' + target.names.length + ' 个）');
						void load();
					});
				}

				// ── rendering ─────────────────────────────────────────────────
				function switchEl(root, skill) {
					const key = root.id + ':' + skill.name;
					const on = skill.disabled !== true;
					const dim = !switchReady || !projectReady || toggling !== null;
					const isUserRoot = root.id === 'user-dsh' || root.id === 'user-agents';
					const title = !switchReady
						? '开关需要重启 dsh web 加载新版 host 后启用'
						: !projectReady
							? '按项目开关需要项目工作区（当前页没有会话工作区）'
							: skill.isShadow
								? '这一行是项目级禁用开关文件：拨回即删除开关、恢复该 skill'
								: (policyOn && isUserRoot && !on)
									? '全局默认关闭中：在本项目启用（生成项目本地副本，其他项目仍关闭）'
									: on
										? '在本项目禁用（模型不再自动使用，仍可手动调用）'
										: '在本项目恢复启用';
					return h('button', {
						type: 'button',
						className: 'smgr-switch' + (on ? ' smgr-switchOn' : '') + (dim ? ' smgr-switchDim' : ''),
						disabled: dim,
						title: title,
						onClick: function (event) { event.stopPropagation(); toggleSkill(root, skill); }
					}, h('span', { className: 'smgr-switchKnob' }));
				}

				function skillRow(skill, root) {
					const active = sel !== null && sel.root === root.id && sel.name === skill.name;
					return h(
						'div',
						{ key: skill.name, className: 'smgr-row' + (active ? ' smgr-rowActive' : '') + (skill.disabled === true ? ' smgr-rowOff' : ''), onClick: function () { openDetail(root.id, skill.name); } },
						h(
							'div',
							{ className: 'smgr-rowMain' },
							h(
								'span',
								{ className: 'smgr-name' },
								skill.title || skill.name,
								skill.broken
									? h('span', { className: 'smgr-badge smgr-badgeBad', title: skill.broken }, '格式损坏')
									: null,
								skill.isShadow ? h('span', { className: 'smgr-badge smgr-badgeShadow', title: '项目级禁用开关文件（由开关生成）' }, '禁用开关') : null,
								skill.disabled === true && !skill.isShadow ? h('span', { className: 'smgr-badge smgr-badgeOff' }, '已禁用') : null
							),
							skill.description ? h('span', { className: 'smgr-desc' }, skill.description) : null
						),
						switchEl(root, skill),
						h(
							'div',
							{
								className: 'smgr-rowActions',
								onClick: function (event) { event.stopPropagation(); }
							},
							!skill.readOnly
								? h('button', { className: 'smgr-iconBtn smgr-iconBtnDanger', title: skill.isShadow ? '删除开关文件（恢复 skill）' : '删除', onClick: function () { setSel({ root: root.id, name: skill.name }); setConfirmDelete(true); } }, '✕')
								: null,
							h('button', {
								className: 'smgr-iconBtn',
								title: '导出 .md',
								onClick: function () {
									api.call('read', { root: root.id, name: skill.name }).then(
										function (value) { exportSkill(skill, value.content); },
										function (e) { setError(String((e && e.message) || e)); }
									);
								}
							}, '⇩')
						)
					);
				}

				function packageRow(root, item, expanded, meta) {
					const all = item.skills;
					const isEditing = editingPkg !== null && editingPkg.rootId === root.id && editingPkg.prefix === item.prefix;
					const label = (typeof meta.label === 'string' && meta.label.trim() !== '') ? meta.label.trim() : item.prefix;
					const hasReadOnly = all.some(function (s) { return s.readOnly; });
					const offCount = all.filter(function (s) { return s.disabled === true; }).length;
					const sample = q === ''
						? (all.slice(0, 3).map(function (s) { return s.name; }).join('、') + (all.length > 3 ? ' 等' : ''))
						: '匹配 ' + all.filter(function (s) { return matches(s, q); }).length + ' / ' + all.length + ' 个';
					return h(
						'div',
						{ className: 'smgr-pkgRow' + (offCount === all.length ? ' smgr-pkgRowOff' : '') },
						h('button', {
							className: 'smgr-caret',
							title: expanded ? '折叠' : '展开',
							onClick: function (event) { event.stopPropagation(); togglePkg(root.id, item.prefix, expanded); }
						}, expanded ? '▾' : '▸'),
						h('span', { className: 'smgr-pkgIcon', 'aria-hidden': true }),
						h(
							'div',
							{ className: 'smgr-rowMain', onClick: function () { togglePkg(root.id, item.prefix, expanded); } },
							h(
								'span',
								{ className: 'smgr-name' },
								isEditing
									? h('input', {
										className: 'smgr-labelInput',
										value: labelDraft,
										autoFocus: true,
										onClick: function (event) { event.stopPropagation(); },
										onChange: function (event) { setLabelDraft(event.target.value); },
										onBlur: commitLabelEdit,
										onKeyDown: function (event) {
											if (event.key === 'Enter') commitLabelEdit();
											else if (event.key === 'Escape') { setEditingPkg(null); setLabelDraft(''); bump(); }
										}
									})
									: h('span', { className: 'smgr-pkgLabel' }, label),
								h('span', { className: 'smgr-badge' }, '技能包 ×' + all.length),
								offCount > 0 ? h('span', { className: 'smgr-badge smgr-badgeOff' }, offCount + ' 已禁用') : null,
								h('button', {
									className: 'smgr-iconBtn',
									title: '修改显示名（仅保存在本机浏览器）',
									onClick: function (event) { event.stopPropagation(); startLabelEdit(root.id, item.prefix, label); }
								}, '✎')
							),
							h('span', { className: 'smgr-desc' }, '前缀 ' + item.prefix + '- · ' + sample)
						),
						h(
							'div',
							{ className: 'smgr-rowActions', onClick: function (event) { event.stopPropagation(); } },
							(switchReady && projectReady)
								? h('button', {
									className: 'smgr-bulkBtn',
									disabled: bulkBusy,
									title: offCount === all.length ? '把整包恢复启用（仅本项目）' : '把整包在本项目禁用（模型不再自动使用）',
									onClick: function () { bulkToggle(root, all); }
								}, bulkBusy ? '处理中…' : (offCount === all.length ? '全部启用' : '全部禁用'))
								: null,
							h('button', {
								className: 'smgr-iconBtn',
								disabled: !zipReady,
								title: zipReady
									? '整包导出为 zip（含 references 等全部附属文件）'
									: '整包导出为 zip（需重启 dsh web 加载新版 host 后启用）',
								onClick: zipReady ? function () { doExportPkgZip(root.id, all); } : undefined
							}, '⤓'),
							!hasReadOnly
								? h('button', {
									className: 'smgr-iconBtn smgr-iconBtnDanger',
									title: '整包删除',
									onClick: function () { setConfirmPkg({ rootId: root.id, prefix: item.prefix, label: label, names: all.map(function (s) { return s.name; }) }); }
								}, '✕')
								: null
						)
					);
				}

				// The state filter counts real skills only: a disabled skill's
				// marker switch file would double-count the same name.
				function passesFilter(s) {
					if (s.isShadow) return false;
					if (filter === 'off') return s.disabled === true;
					if (filter === 'on') return s.disabled === false;
					return true;
				}
				function renderItems(root, skills) {
					const items = groupSkills(skills);
					// Within a root, package rows sit on top; standalone
					// rows follow. Both groups keep original relative order.
					const pkgOut = [];
					const rowOut = [];
					for (const item of items) {
						if (item.kind === 'skill') {
							const skill = item.skill;
							if (skill.isShadow) {
								// Marker switch files: hidden by default, revealed by search only.
								if (q === '' || !matches(skill, q)) continue;
							} else {
								if (!matches(skill, q) || !passesFilter(skill)) continue;
							}
							rowOut.push(h('div', { key: 's:' + skill.name }, skillRow(skill, root)));
							continue;
						}
						const visible = item.skills.filter(function (s) { return matches(s, q) && passesFilter(s); });
						if (visible.length === 0) continue;
						const meta = readPkgMeta(root.id, item.prefix);
						const expanded = q !== '' || filter !== 'all' ? true : meta.expanded === true;
						pkgOut.push(
							h(
								React.Fragment,
								{ key: 'p:' + item.prefix },
								packageRow(root, item, expanded, meta),
								expanded
									? h('div', { className: 'smgr-pkgMembers' }, visible.map(function (s) { return h('div', { key: 'm:' + s.name }, skillRow(s, root)); }))
									: null
							)
						);
					}
					return pkgOut.concat(rowOut);
				}

				const editableRoots = data ? data.roots : [];
				const cwd = data ? data.cwd : null;
				const projectRoot = data ? data.projectRoot : null;
				// How many real skills are currently off in this project (marker
				// switch files excluded — they are the mechanism, not the state).
				const disabledTotal = data === null
					? 0
					: data.roots.reduce(function (n, r) {
						return n + r.skills.filter(function (s) { return !s.isShadow && s.disabled === true; }).length;
					}, 0)
					+ (data.bundled || []).reduce(function (n, g) {
						return n + g.skills.filter(function (s) { return !s.isShadow && s.disabled === true; }).length;
					}, 0);

				return h(
					'div',
					{ className: 'smgr' },
					h('h2', null, 'Skills 技能管理'),
					h('p', { className: 'smgr-intro' }, '浏览、导入导出 skill。项目级只影响本项目，用户级影响所有项目，内置只读。每行的小滑块按项目启用/禁用：关掉后模型在本项目不再自动调用它（手动调用不受影响）。导入/删除后自动热加载，无需重启。'),
					h(
						'div',
						{ className: 'smgr-policy' },
						h(
							'div',
							{ className: 'smgr-policyMain' },
							h(
								'span',
								{ className: 'smgr-name' },
								'全局默认关闭',
								h('span', { className: 'smgr-badge' }, policyOn ? '已开启' : '已关闭')
							),
							h('span', { className: 'smgr-policyDesc' }, '开启后用户级 skill 默认禁用（内置不受影响）；某项目要用某个 skill，打开它的滑块即可（生成项目本地副本）。')
						),
						h('button', {
							type: 'button',
							className: 'smgr-switch' + (policyOn ? ' smgr-switchOn' : '') + (!policyReady || policyBusy ? ' smgr-switchDim' : ''),
							disabled: !policyReady || policyBusy,
							title: policyReady
								? (policyOn
									? '关闭全局默认关闭策略（不会移除已加的标志）'
									: '开启全局默认关闭策略：用户级 skill 全部默认禁用')
								: '需要重启 dsh web 加载新版 host 后启用',
							onClick: function (event) { event.stopPropagation(); togglePolicy(); }
						}, h('span', { className: 'smgr-switchKnob' }))
					),
					cwd !== null && cwd !== undefined
						? h('p', { className: 'smgr-cwd' }, '当前工作区：', h('code', null, cwd),
							projectRoot !== null && projectRoot !== undefined
								? h('span', null, '　开关生效的项目根：', h('code', null, projectRoot))
								: null)
						: h('p', { className: 'smgr-cwd' }, '当前页没有会话工作区：仅显示用户级与内置 skill，按项目开关不可用。'),
					h(
						'div',
						{ className: 'smgr-toolbar' },
						h('input', {
							className: 'smgr-search',
							placeholder: '搜索名称或描述…',
							value: q,
							onChange: function (event) { setQ(event.target.value); }
						}),
						h(
							'div',
							{ className: 'smgr-filter' },
							[
								['all', '全部'],
								['off', disabledTotal > 0 ? '已禁用 ' + disabledTotal : '已禁用'],
								['on', '已启用']
							].map(function (f) {
								return h('button', {
									key: f[0],
									type: 'button',
									className: 'smgr-filterBtn' + (filter === f[0] ? ' smgr-filterBtnActive' : ''),
									onClick: function () { setFilter(f[0]); }
								}, f[1]);
							})
						),
						h(Button, { variant: 'outline', disabled: busy, onClick: function () { void load(); } }, busy ? '加载中…' : '刷新'),
						h(Button, {
							variant: 'outline',
							onClick: function () {
								setImportText('');
								setImportRoot((data && data.roots.length >= 2 && data.roots[data.roots.length - 2].id) || 'user-dsh');
								setImportOpen(true);
							}
						}, '导入 Skill')
					),
					notice !== null ? h('p', { className: 'smgr-toast', role: 'status' }, notice) : null,
					error !== null ? h('p', { className: 'smgr-error', role: 'alert' }, error) : null,
					data === null && !error ? h('p', { className: 'smgr-empty' }, '正在加载…') : null,
					data
						? data.roots.map(function (root) {
							const shadowCount = root.skills.filter(function (s) { return s.isShadow; }).length;
							const items = renderItems(root, root.skills);
							return h(
								'section',
								{ key: root.id, className: 'smgr-group' },
								h(
									'h3',
									null,
									root.label,
									h('span', { className: 'smgr-count' }, String(root.skills.length)),
									shadowCount > 0
										? h('span', { className: 'smgr-badge smgr-badgeShadow', title: '项目级禁用开关文件：默认隐藏，搜索可列出' }, '禁用开关 ×' + shadowCount)
										: null,
									!root.exists ? '（目录尚不存在，导入/编辑时自动创建）' : ''
								),
								items.length === 0 ? h('p', { className: 'smgr-empty' }, root.exists ? (q === '' && shadowCount > 0 ? '' : '（空）') : '') : null,
								items
							);
						})
						: null,
					data
						? (data.bundled || []).map(function (group) {
							const rootObj = { id: 'bundled:' + group.presetId, label: group.label };
							const items = renderItems(rootObj, group.skills);
							return h(
								'section',
								{ key: 'bundled:' + group.presetId, className: 'smgr-group' },
								h('h3', null, group.label, h('span', { className: 'smgr-count' }, String(group.skills.length))),
								items.length === 0 ? h('p', { className: 'smgr-empty' }, '（空）') : null,
								items
							);
						})
						: null,
					sel !== null
						? detail === null
							? h('section', { className: 'smgr-detail' }, h('p', { className: 'smgr-empty' }, '正在读取…'))
							: h(
								'section',
								{ className: 'smgr-detail' },
								h(
									'div',
									{ className: 'smgr-detailHead' },
									h('h3', null, detail.name),
									h('code', { className: 'smgr-path' }, detail.path),
									h(
										'div',
										{ className: 'smgr-detailActions' },
										h(Button, { variant: 'outline', onClick: function () { exportSkill({ name: detail.name }, detail.content); } }, '导出'),
										!detail.readOnly
											? h(Button, { variant: 'outline', className: 'smgr-iconBtnDanger', onClick: function () { setConfirmDelete(true); } }, '删除')
											: null
									)
								),
								h('pre', { className: 'smgr-code' }, detail.content)
							)
						: null,
					h(Modal, {
						open: importOpen,
						onClose: function () { setImportOpen(false); },
						title: '导入 Skill',
						closeLabel: '关闭',
						description: '粘贴一个 skill 文件的全部内容（含 frontmatter），或选择一个 .md 文件。目标位置在 frontmatter 的 name 确定后写入所选根目录。',
						footer: h(
							React.Fragment,
							null,
							h(Button, { variant: 'outline', onClick: function () { setImportOpen(false); } }, '取消'),
							h(Button, { disabled: busy || importText.trim() === '', onClick: doImport }, busy ? '导入中…' : '导入')
						)
					},
						h(
							'div',
							{ className: 'smgr-modalBody' },
							h(
								'label',
								{ className: 'smgr-file' },
								'目标根目录：',
								h(
									'select',
									{ className: 'smgr-select', value: importRoot, onChange: function (event) { setImportRoot(event.target.value); } },
									editableRoots.map(function (root) {
										return h('option', { key: root.id, value: root.id }, root.label);
									})
								)
							),
							h('input', { type: 'file', accept: '.md,.markdown', className: 'smgr-file', onChange: onImportFile }),
							h('textarea', { className: 'smgr-editor', value: importText, spellCheck: false, placeholder: '---\nname: my-skill\ndescription: 一句话说明这个 skill 做什么\n---\n\n正文指令…', onChange: function (event) { setImportText(event.target.value); } })
						)
					),
					h(Modal, {
						open: confirmDelete,
						onClose: function () { setConfirmDelete(false); },
						title: '删除 skill？',
						closeLabel: '关闭',
						description: '将从磁盘删除该 skill 文件（目录型 skill 连同整个目录），此操作不可撤销。',
						footer: h(
							React.Fragment,
							null,
							h(Button, { variant: 'outline', onClick: function () { setConfirmDelete(false); } }, '取消'),
							h(Button, { className: 'smgr-iconBtnDanger', disabled: busy, onClick: doDelete }, busy ? '删除中…' : '确认删除')
						)
					},
						sel !== null ? h('p', { style: { margin: 0, fontSize: 13 } }, '删除 ', h('strong', null, sel.name), '？') : null
					),
					h(Modal, {
						open: confirmPkg !== null,
						onClose: function () { setConfirmPkg(null); },
						title: '删除整个技能包？',
						closeLabel: '关闭',
						description: '将逐个删除该技能包的全部成员（目录型 skill 连同整个目录），此操作不可撤销。',
						footer: h(
							React.Fragment,
							null,
							h(Button, { variant: 'outline', onClick: function () { setConfirmPkg(null); } }, '取消'),
							h(Button, { className: 'smgr-iconBtnDanger', disabled: busy, onClick: doPkgDelete }, busy ? '删除中…' : '确认删除全部')
						)
					},
						confirmPkg !== null
							? h(
								'div',
								null,
								h('p', { style: { margin: '0 0 6px', fontSize: 13 } }, '删除「', h('strong', null, confirmPkg.label), '」的全部 ', String(confirmPkg.names.length), ' 个 skill：'),
								h('div', { className: 'smgr-pkgList' }, confirmPkg.names.join('\n'))
							)
							: null
					)
				);
			}

			// ── DSH-006: 扩展 entry icon + full page ─────────────────────────
			/** Extensions grid glyph: three filled tiles + one dashed "future" slot. */
			function ExtIcon(props) {
				var size = (props && props.size) || 16;
				return h(
					'svg',
					{ width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
					h('rect', { x: 1.5, y: 1.5, width: 5.5, height: 5.5, rx: 1.5, fill: 'currentColor' }),
					h('rect', { x: 9, y: 1.5, width: 5.5, height: 5.5, rx: 1.5, fill: 'currentColor', opacity: 0.55 }),
					h('rect', { x: 1.5, y: 9, width: 5.5, height: 5.5, rx: 1.5, fill: 'currentColor', opacity: 0.55 }),
					h('rect', { x: 9, y: 9, width: 5.5, height: 5.5, rx: 1.5, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeDasharray: '2 1.8' })
				);
			}

			var EXT_TABS = [
				{ id: 'skill', label: 'SKILL', desc: 'Skills 技能管理' },
				{ id: 'mcp', label: 'MCP', desc: 'Model Context Protocol 服务器', soon: true },
				{ id: 'plugin', label: 'Plugin', desc: '已安装插件', soon: true }
			];

			function ExtPlaceholder(props) {
				return h(
					'div',
					{ className: 'ext-placeholder' },
					h('div', { className: 'ext-phIcon' }, h(ExtIcon, { size: 28 })),
					h('h3', null, props.title),
					h('p', null, props.body),
					h('p', { className: 'ext-phSoon' }, '预计能力：' + props.planned)
				);
			}

			/** The frame-wide Extensions page (SKILL / MCP / Plugin). */
			function ExtensionsPage(props) {
				var api = props.api;
				var onClose = props.onClose;
				var [tab, setTab] = React.useState('skill');
				React.useEffect(function () {
					function onKey(event) {
						if (event.key !== 'Escape') return;
						// An inner dialog (import/delete confirm) owns Esc first.
						if (document.querySelector('[role="dialog"]') !== null) return;
						onClose();
					}
					document.addEventListener('keydown', onKey);
					return function () { document.removeEventListener('keydown', onKey); };
				}, [onClose]);
				return h(
					'div',
					{ className: 'ext-page', role: 'region', 'aria-label': '扩展管理' },
					h(
						'header',
						{ className: 'ext-top' },
						h('div', { className: 'ext-topTitle' }, h(ExtIcon, { size: 20 }), '扩展'),
						h('span', { className: 'ext-topSub' }, '统一管理 DSH 的扩展能力：SKILL / MCP / Plugin'),
						h('button', { type: 'button', className: 'ext-close', 'aria-label': '关闭扩展页', title: '关闭（Esc）', onClick: onClose }, '✕')
					),
					h(
						'div',
						{ className: 'ext-body' },
						h(
							'nav',
							{ className: 'ext-nav', 'aria-label': '扩展类型' },
							EXT_TABS.map(function (t) {
								return h(
									'button',
									{
										key: t.id,
										type: 'button',
										className: 'ext-navBtn' + (tab === t.id ? ' ext-navBtnActive' : ''),
										onClick: function () { setTab(t.id); }
									},
									h(
										'span',
										{ className: 'ext-navLabel' },
										t.label,
										t.soon ? h('span', { className: 'ext-soon' }, '建设中') : null
									),
									h('span', { className: 'ext-navDesc' }, t.desc)
								);
							})
						),
						h(
							'main',
							{ className: 'ext-main' },
							tab === 'skill'
								? h(SkillManagerSection, { api: api })
								: tab === 'mcp'
									? h(ExtPlaceholder, {
										key: 'mcp',
										title: 'MCP 管理（建设中）',
										body: 'MCP（Model Context Protocol）服务器把外部工具接入 DSH，模型会以原生工具形式调用它们。当前 MCP 服务器在 web profile 的 cordis 配置中以 dsh-mcp-client 插件行声明。',
										planned: '服务器列表与连接状态、工具清单、新增/编辑/删除配置、保存后热加载（无需重启 dsh web）。'
									})
									: h(ExtPlaceholder, {
										key: 'plugin',
										title: '插件管理（建设中）',
										body: '展示已安装到 web profile 的 DSH 插件（如 skill-manager、image-context-guard）：名称、版本、来源与启用状态。',
										planned: '已安装插件列表、启用/停用（从组合树摘除/挂回）、安装来源与版本信息。'
									})
						)
					)
				);
			}

			/** Sidebar-foot 「扩展」 row: icon + label (wide) or round icon (rail). */
			function ExtensionsEntry(props) {
				var wide = props.wide;
				var api = props.api;
				var [open, setOpen] = React.useState(false);
				return h(
					React.Fragment,
					null,
					h(
						'div',
						{ className: 'ext-layer' + (wide ? '' : ' ext-layerRail') },
						h(
							'button',
							{
								type: 'button',
								className: 'ext-trigger' + (open ? ' ext-triggerActive' : ''),
								'aria-label': '扩展',
								'aria-expanded': open,
								title: wide ? '扩展' : undefined,
								onClick: function () { setOpen(true); }
							},
							h(ExtIcon, { size: wide ? 16 : 18 }),
							wide ? h('span', { className: 'ext-triggerLabel' }, '扩展') : null
						)
					),
					open ? h(ExtensionsPage, { api: api, onClose: function () { setOpen(false); } }) : null
				);
			}

			// ── plugin module (the client half of dsh-skill-manager) ──────────
			var module = { exports: {} };
			module.exports.name = 'skill-manager-ui';
			module.exports.inject = ['slots'];
			module.exports.apply = function (ctx) {
				var slots = ctx.get('slots');
				if (slots === undefined || typeof slots.register !== 'function') return;
				// DSH-006: the Skills management page moved out of Settings into
				// the frame-wide Extensions page; the only entry is the
				// sidebar-foot 「扩展」 row (additive seat, no shell change).
				slots.inject('sidebar.footer.action', function () {
					return slots.register(
						{
							name: 'sidebar.footer.action',
							id: 'extensions-page',
							order: 100,
							label: function () { return '扩展'; },
							inject: function () {
								return {
									api: {
										call: function (op, payload) { return apiCall(op, payload, ctx); },
										zip: function (rootId, names) { return zipDownload(rootId, names, ctx); }
									}
								};
							}
						},
						ExtensionsEntry
					);
				});
			};
			return module.exports;
		}
	});
})();
