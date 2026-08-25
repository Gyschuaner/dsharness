/**
 * dsh-extension-manager — client half (browser bundle).
 * build: 3 (DSH-006 / DSH-026 / DSH-027)
 *
 * Owns the frame-level 「扩展」 entry and full-page navigation. Business
 * plugins contribute sections through `extension.manager.section`; this
 * package does not synthesize business placeholders.
 *
 * TypeScript source compiled to a classic browser script — no JSX or imports.
 */
interface ExtensionSectionRow {
	id: string;
	label: string;
	order: number;
	soon: boolean;
}

interface ExtensionSectionLedger {
	snapshot(): ExtensionSectionRow[];
	subscribe(listener: () => void): () => void;
}

interface ExtensionSlots {
	getVersion?(name: string): number;
	entries(name: string): Array<{ options?: { id?: string; label?: unknown; order?: number } }>;
	subscribe?(name: string, listener: () => void): () => void;
	register(config: Record<string, unknown>, component: React.ComponentType<ExtensionEntryProps>): unknown;
	inject(name: string, effect: () => unknown): void;
}

interface ExtensionsPageProps {
	onClose(): void;
	renderSlot(name: string, props: Record<string, unknown>, options: { only: string }): React.ReactNode;
	rows: ExtensionSectionRow[];
}

interface ExtensionEntryProps {
	wide: boolean;
	renderSlot: ExtensionsPageProps['renderSlot'];
	sectionLedger: ExtensionSectionLedger;
}

(function () {
	window.__ModuleLoader__.load({
		id: 'dsh-extension-manager',
		factory: function (require) {
			var React = require('react');
			var h = React.createElement;
			var P = require('@deepseek-ai/dsh-client-ui-primitives');

			var existingStyle = document.querySelector<HTMLStyleElement>('style[data-plugin="dsh-extension-manager"]');
			var style = existingStyle || document.createElement('style');
			style.setAttribute('data-plugin', 'dsh-extension-manager');
			style.textContent = [
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
				'.ext-top{flex:none;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--dsw-alias-border-l2);padding:13px 20px}',
				'.ext-topTitle{display:flex;align-items:center;gap:10px;font-size:18px;font-weight:600}',
				'.ext-topTitle .ext-icon{color:var(--dsw-alias-label-primary)}',
				'.ext-topSub{font-size:13px;color:var(--dsw-alias-label-quaternary);font-weight:500}',
				'.ext-close{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;border-radius:8px;padding:6px 9px;line-height:1;margin-left:auto;display:inline-flex}',
				'.ext-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
				'.ext-body{flex:1;min-height:0;display:flex}',
				'.ext-nav{box-sizing:border-box;flex:none;width:188px;border-right:1px solid var(--dsw-alias-border-l2);padding:10px 8px;display:flex;flex-direction:column;gap:6px;overflow-y:auto;transition:width .16s ease,padding .16s ease}',
				'.ext-navCollapsed{width:64px;padding-left:8px;padding-right:8px}',
				'.ext-navHead{display:flex;align-items:center;min-height:32px;padding:0 4px}',
				'.ext-navTitle{font-size:11px;font-weight:600;letter-spacing:.04em;color:var(--dsw-alias-label-quaternary)}',
				'.ext-navToggle{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;border-radius:8px;width:32px;height:32px;padding:0;display:inline-flex;align-items:center;justify-content:center;margin-left:auto;flex:none}',
				'.ext-navToggle:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
				'.ext-navList{display:flex;flex-direction:column;gap:3px}',
				'.ext-navBtn{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;border-radius:9px;padding:8px 9px;text-align:left;font:inherit;display:grid;grid-template-columns:18px minmax(0,1fr);column-gap:8px;align-items:center;min-height:40px}',
				'.ext-navBtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
				'.ext-navBtnActive{background:var(--dsw-alias-fill-tsp-secondary);background:color-mix(in srgb,var(--dsw-static-blue-500) 8%,var(--dsw-alias-bg-module-platform));color:var(--dsw-alias-label-primary)}',
				'.ext-navBtnActive:hover{background:color-mix(in srgb,var(--dsw-static-blue-500) 11%,var(--dsw-alias-bg-module-platform))}',
				'.ext-navIcon{position:relative;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;color:currentColor}',
				'.ext-navCopy{min-width:0;display:flex;align-items:center}',
				'.ext-navLabel{font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px;white-space:nowrap}',
				'.ext-soon{border-radius:999px;background:var(--dsw-alias-fill-tsp-secondary);color:var(--dsw-alias-label-tertiary);padding:0 6px;font-size:10px;font-weight:500;line-height:16px;white-space:nowrap}',
				'.ext-navSoonDot{position:absolute;right:-1px;top:-1px;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-quaternary);border:1px solid var(--dsw-alias-bg-base)}',
				'.ext-navCollapsed .ext-navTitle,.ext-navCollapsed .ext-navCopy{display:none}',
				'.ext-navCollapsed .ext-navHead{justify-content:center;padding:0}',
				'.ext-navCollapsed .ext-navToggle{margin-left:0}',
				'.ext-navCollapsed .ext-navBtn{display:flex;align-items:center;justify-content:center;width:46px;min-height:44px;padding:10px 0}',
				'.ext-navCollapsed .ext-navIcon{width:20px;height:20px}',
				'.ext-main{flex:1;min-width:0;min-height:0;overflow:hidden;padding:16px 8px}',
				'.ext-empty{margin:0;padding:48px 0;color:var(--dsw-alias-label-tertiary);font-size:13px}',
				'@media(max-width:900px){.ext-nav:not(.ext-navCollapsed){width:168px;padding:10px}.ext-main{padding:16px}}',
				'@media(max-width:680px){.ext-nav{display:none}.ext-main{padding:12px}}',
				'@media(max-width:480px){.ext-top{padding:12px}.ext-topTitle{white-space:nowrap}.ext-topSub{display:none}}'
			].join('');
			if (!existingStyle) document.head.appendChild(style);

			function ExtIcon(props: { size?: number }): React.ReactNode {
				var size = (props && props.size) || 16;
				return h(
					'svg',
					{ className: 'ext-icon', width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
					h('rect', { x: 1.5, y: 1.5, width: 5.5, height: 5.5, rx: 1.5, fill: 'currentColor' }),
					h('rect', { x: 9, y: 1.5, width: 5.5, height: 5.5, rx: 1.5, fill: 'currentColor', opacity: 0.55 }),
					h('rect', { x: 1.5, y: 9, width: 5.5, height: 5.5, rx: 1.5, fill: 'currentColor', opacity: 0.55 }),
					h('rect', { x: 9, y: 9, width: 5.5, height: 5.5, rx: 1.5, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeDasharray: '2 1.8' })
				);
			}

			function BillingIcon(props: { size?: number }): React.ReactNode {
				var size = (props && props.size) || 16;
				return h(
					'svg',
					{ className: 'ext-icon', width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
					h('path', { d: 'M3.5 1.75h9v12.5l-2.25-1.35L8 14.25l-2.25-1.35L3.5 14.25V1.75Z', stroke: 'currentColor', strokeWidth: 1.25, strokeLinejoin: 'round' }),
					h('path', { d: 'M5.75 5h4.5M5.75 7.5h4.5M5.75 10h2.8', stroke: 'currentColor', strokeWidth: 1.15, strokeLinecap: 'round' })
				);
			}

			function iconFor(id: string): ClientPrimitive {
				if (id === 'skill') return P.IconSkillOutline16;
				if (id === 'mcp') return P.IconLinkOutline16;
				if (id === 'plugin') return P.IconCordisPluginOutline14;
				if (id === 'billing') return BillingIcon;
				return ExtIcon;
			}

			function resolveLabel(value: unknown, fallback: string): string {
				try {
					var resolved = typeof value === 'function' ? value() : value;
					return typeof resolved === 'string' && resolved !== '' ? resolved : fallback;
				} catch (error) { return fallback; }
			}

			function createSectionLedger(slots: ExtensionSlots): ExtensionSectionLedger {
				var lastVersion = -1;
				var lastRows: ExtensionSectionRow[] = [];
				function snapshot(): ExtensionSectionRow[] {
					var version = typeof slots.getVersion === 'function'
						? slots.getVersion('extension.manager.section')
						: 0;
					if (version === lastVersion) return lastRows;
					lastVersion = version;
					lastRows = slots.entries('extension.manager.section').map(function (entry) {
						var options = entry.options || {};
						var id = options.id || '';
						return {
							id: id,
							label: resolveLabel(options.label, id.toUpperCase()),
							order: typeof options.order === 'number' && Number.isFinite(options.order) ? options.order : 0,
							soon: false
						};
					}).filter(function (row) { return row.id !== ''; }).sort(function (a, b) {
						return a.order - b.order || a.id.localeCompare(b.id);
					});
					return lastRows;
				}
				function subscribe(listener: () => void): () => void {
					return typeof slots.subscribe === 'function'
						? slots.subscribe('extension.manager.section', listener)
						: function () {};
				}
				return { snapshot: snapshot, subscribe: subscribe };
			}

			function readNavCollapsed(): boolean {
				try {
					var value = window.localStorage.getItem('dsh.extensions.navCollapsed');
					if (value === null) value = window.localStorage.getItem('smgr.ext.navCollapsed');
					return value === '1';
				} catch (error) { return false; }
			}

			function ExtensionsPage(props: ExtensionsPageProps): React.ReactNode {
				var onClose = props.onClose;
				var renderSlot = props.renderSlot;
				var rows = props.rows;
				var onCloseRef = React.useRef(onClose);
				onCloseRef.current = onClose;
				var [activeId, setActiveId] = React.useState('skill');
				var [navCollapsed, setNavCollapsed] = React.useState(readNavCollapsed);
				var active = rows.some(function (row) { return row.id === activeId; })
					? activeId
					: rows[0]?.id;
				function toggleNav(): void {
					var next = !navCollapsed;
					setNavCollapsed(next);
					try { window.localStorage.setItem('dsh.extensions.navCollapsed', next ? '1' : '0'); } catch (error) {}
				}
				React.useEffect(function () {
					function onKey(event: KeyboardEvent): void {
						if (event.key !== 'Escape') return;
						if (document.querySelector('[role="dialog"]') !== null) return;
						onCloseRef.current();
					}
					document.addEventListener('keydown', onKey);
					return function () { document.removeEventListener('keydown', onKey); };
				}, []);
				return h(
					'div',
					{ className: 'ext-page', role: 'region', 'aria-label': '扩展管理' },
					h('header', { className: 'ext-top' },
						h('div', { className: 'ext-topTitle' }, h(ExtIcon, { size: 20 }), '扩展'),
						h('span', { className: 'ext-topSub' }, active ? '/ ' + active.toUpperCase() : ''),
						h('button', { type: 'button', className: 'ext-close', 'aria-label': '关闭扩展页', title: '关闭（Esc）', onClick: onClose }, h(P.IconCloseOutline16))
					),
					h('div', { className: 'ext-body' },
						h('nav', { className: 'ext-nav' + (navCollapsed ? ' ext-navCollapsed' : ''), 'aria-label': '扩展类型' },
							h('div', { className: 'ext-navHead' },
								h('span', { className: 'ext-navTitle' }, '扩展类型'),
								h('button', {
									type: 'button', className: 'ext-navToggle',
									'aria-label': navCollapsed ? '展开扩展类型导航' : '收起扩展类型导航',
									'aria-expanded': !navCollapsed,
									title: navCollapsed ? '展开导航' : '收起导航', onClick: toggleNav
								}, h(navCollapsed ? P.IconChevronRightOutline14 : P.IconChevronLeftOutline14))
							),
							h('div', { className: 'ext-navList' }, rows.map(function (row) {
								var Icon = iconFor(row.id);
								return h('button', {
									key: row.id, type: 'button',
									className: 'ext-navBtn' + (active === row.id ? ' ext-navBtnActive' : ''),
									'aria-label': row.label + (row.soon ? '（建设中）' : ''),
									'aria-current': active === row.id ? 'page' : undefined,
									title: navCollapsed ? row.label + (row.soon ? '（建设中）' : '') : undefined,
									onClick: function () { setActiveId(row.id); }
								},
									h('span', { className: 'ext-navIcon' }, h(Icon), navCollapsed && row.soon ? h('span', { className: 'ext-navSoonDot', 'aria-hidden': true }) : null),
									h('span', { className: 'ext-navCopy' }, h('span', { className: 'ext-navLabel' }, row.label, row.soon ? h('span', { className: 'ext-soon' }, '建设中') : null))
								);
							}))
						),
						h('main', { className: 'ext-main' }, active === undefined
							? h('p', { className: 'ext-empty' }, '暂无可用扩展分区。')
							: renderSlot('extension.manager.section', {}, { only: active }))
					)
				);
			}

			function ExtensionsEntry(props: ExtensionEntryProps): React.ReactNode {
				var [open, setOpen] = React.useState(false);
				var rows = React.useSyncExternalStore(props.sectionLedger.subscribe, props.sectionLedger.snapshot, props.sectionLedger.snapshot);
				return h(React.Fragment, null,
					h('div', { className: 'ext-layer' + (props.wide ? '' : ' ext-layerRail') },
						h('button', {
							type: 'button', className: 'ext-trigger' + (open ? ' ext-triggerActive' : ''),
							'aria-label': '扩展', 'aria-expanded': open, title: props.wide ? '扩展' : undefined,
							onClick: function () { setOpen(true); }
						}, h(ExtIcon, { size: props.wide ? 16 : 18 }), props.wide ? h('span', { className: 'ext-triggerLabel' }, '扩展') : null)
					),
					open ? h(ExtensionsPage, { rows: rows, renderSlot: props.renderSlot, onClose: function () { setOpen(false); } }) : null
				);
			}

			var module: ClientModule = { exports: {} };
			module.exports.name = 'extension-manager-ui';
			module.exports.inject = ['slots'];
			module.exports.apply = function (ctx) {
				var slots = ctx.get('slots') as ExtensionSlots | undefined;
				if (slots === undefined || typeof slots.register !== 'function') return;
				var ledger = createSectionLedger(slots);
				var activeSlots = slots;
				activeSlots.inject('sidebar.footer.action', function () {
					return activeSlots.register({
						name: 'sidebar.footer.action', id: 'extensions-page', order: 100,
						label: function () { return '扩展'; },
						inject: function () { return { sectionLedger: ledger }; },
						children: { 'extension.manager.section': { kind: 'list', scope: 'root' } }
					}, ExtensionsEntry);
				});
			};
			return module.exports;
		}
	});
})();
