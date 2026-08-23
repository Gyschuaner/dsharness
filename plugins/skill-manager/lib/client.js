/**
 * dsh-skill-manager — client half (browser bundle).
 * build: 19
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
 * build 13 (DSH-008): project-management UI adds a persistent project
 * context card, per-state counts/grouping, select-visible bulk actions,
 * current-workspace-safe defaults, derived drawer/tag state, responsive
 * drawer behavior, and accessible switch/radio/detail controls. The SKILL
 * management view is served by the host's apiVersion 6
 * ops (catalog / setEnabled / setMany / setSource / setTags / presets.* /
 * slim.*): project selector over DSH workspaces, per-project enable
 * state, merged same-name identities with source selection, global tags,
 * presets with replace/merge preview, and 一键精简. When the running host
 * predates apiVersion 6 (unknown `catalog` op), the page degrades to the
 * legacy section above with a notice.
 * build 17: the project list no longer regroups rows by enabled state.
 * Catalog order and scroll context stay stable while a soft blue row tint,
 * the switch, and the optional state filters communicate enabled status.
 * build 18: the redundant unified-library sub-page is removed; merged source
 * selection remains in the project Skill drawer. The drawer now overlays the
 * list at every desktop width without reflowing it, and the SKILL / MCP /
 * Plugin navigation can collapse to an icon rail with browser-local state.
 * build 19: visual-noise reduction compresses project context and navigation,
 * moves presets and infrequent batch actions into menus, shows only the first
 * description sentence in stable catalog rows, and defers source choices and
 * technical metadata inside the overlay drawer until explicitly requested.
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
				'.sk-root .smgr-switchOn{background:var(--dsw-static-blue-500);border-color:var(--dsw-static-blue-500)}',
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
				'.ext-top{flex:none;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--dsw-alias-border-l2);padding:13px 20px}',
				'.ext-topTitle{display:flex;align-items:center;gap:10px;font-size:18px;font-weight:600}',
				'.ext-topTitle .ext-icon{color:var(--dsw-alias-label-primary)}',
				'.ext-topSub{font-size:13px;color:var(--dsw-alias-label-quaternary);font-weight:500}',
				'.ext-close{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;border-radius:8px;padding:6px 9px;font-size:15px;line-height:1;margin-left:auto}',
				'.ext-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
				'.ext-body{flex:1;min-height:0;display:flex}',
				'.ext-nav{box-sizing:border-box;flex:none;width:156px;border-right:1px solid var(--dsw-alias-border-l2);padding:10px 8px;display:flex;flex-direction:column;gap:6px;overflow-y:auto;transition:width .16s ease,padding .16s ease}',
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
				'.ext-main{flex:1;min-width:0;min-height:0;overflow:hidden;padding:16px 20px}',
				'.ext-placeholder{max-width:520px;display:flex;flex-direction:column;gap:10px;padding:48px 0}',
				'.ext-phIcon{color:var(--dsw-alias-label-quaternary)}',
				'.ext-placeholder h3{margin:0;font-size:16px;font-weight:600}',
				'.ext-placeholder p{margin:0;font-size:13px;color:var(--dsw-alias-label-tertiary);line-height:1.7}',
				'.ext-phSoon{color:var(--dsw-alias-label-quaternary);font-size:12px}',
				// ── DSH-008 V1: per-project SKILL management ─────────────────
				'.sk-root{display:flex;flex-direction:column;flex:1;min-height:0;height:100%;width:100%;max-width:1180px;margin:0 auto;color:var(--dsw-alias-label-primary)}',
				'.sk-content{position:relative;isolation:isolate;display:flex;flex:1;min-height:0}',
				'.sk-listcol{flex:1;min-width:0;display:flex;flex-direction:column}',
				'.sk-projectCard{display:flex;align-items:center;gap:14px;margin:6px 0 12px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-3);flex:none}',
				'.sk-projectIdentity{display:flex;align-items:center;gap:8px;min-width:0;flex:1}',
				'.sk-projectMeta{display:flex;align-items:center;gap:8px;min-width:0}',
				'.sk-projectTitleLine{display:flex;align-items:center;gap:7px;flex-wrap:wrap}',
				'.sk-projectTitle{font-size:14px;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
				'.sk-currentBadge{border-radius:999px;background:var(--dsw-alias-fill-tsp-secondary);padding:2px 7px;font-size:10px;color:var(--dsw-alias-label-secondary);white-space:nowrap}',
				'.sk-projectStats{display:flex;align-items:center;gap:6px;padding-left:14px;border-left:1px solid var(--dsw-alias-border-l2);flex:none}',
				'.sk-statValue{font-size:12px;font-weight:600;line-height:1.3;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
				'.sk-projectActions{display:flex;align-items:center;gap:7px;flex:none}',
				'.sk-projLabel{font-size:12px;color:var(--dsw-alias-label-tertiary);flex:none}',
				'.sk-projBtn{appearance:none;display:inline-flex;align-items:center;gap:7px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);cursor:pointer;border-radius:8px;padding:6px 10px;font:inherit;font-size:13px;max-width:340px}',
				'.sk-projBtn:hover:not(:disabled){border-color:var(--dsw-alias-label-dimmed)}',
				'.sk-projBtn:disabled{opacity:.6;cursor:default}',
				'.sk-quietBtn{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;border-radius:8px;padding:6px 8px;font:inherit;font-size:12px;white-space:nowrap}',
				'.sk-quietBtn:hover:not(:disabled),.sk-quietBtnOn{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
				'.sk-quietBtn:disabled{opacity:.5;cursor:default}',
				'.sk-projTitle{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;min-width:0}',
				'.sk-menu{position:absolute;top:calc(100% + 4px);left:0;z-index:60;min-width:260px;max-width:440px;max-height:340px;overflow-y:auto;background:var(--dsw-alias-bg-module-platform);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.2);padding:5px;display:flex;flex-direction:column;gap:1px}',
				'.sk-menuBtn{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;font-size:13px;text-align:left;border-radius:7px;padding:7px 9px;display:flex;align-items:center;gap:8px;min-width:0}',
				'.sk-menuBtn:hover{background:var(--dsw-alias-interactive-bg-hover)}',
				'.sk-menuBtnActive{background:var(--dsw-alias-fill-tsp-secondary)}',
				'.sk-menuSep{height:1px;background:var(--dsw-alias-border-l2);margin:4px 6px}',
				'.sk-menuHint{font-size:11px;color:var(--dsw-alias-label-quaternary);padding:2px 9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}',
				'.sk-chips{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-left:auto}',
				'.sk-chip{appearance:none;display:inline-flex;align-items:center;gap:5px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:999px;padding:3px 10px;font:inherit;font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap}',
				'.sk-chip:hover:not(:disabled){border-color:var(--dsw-alias-label-dimmed);color:var(--dsw-alias-label-primary)}',
				'.sk-chip:disabled{opacity:.55;cursor:default}',
				'.sk-chipDef{border-color:var(--dsw-static-blue-500);color:var(--dsw-static-blue-500);font-weight:600}',
				'.sk-chipAdd{border-style:dashed}',
				'.sk-toolbar{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex:none;flex-wrap:wrap}',
				'.sk-searchWrap{position:relative;flex:1;min-width:170px;display:flex;align-items:center}',
				'.sk-searchWrap>.sk-ic{position:absolute;left:9px;color:var(--dsw-alias-label-quaternary);pointer-events:none}',
				'.sk-search{width:100%;background:var(--dsw-alias-bg-module-platform);color:inherit;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:6px 10px 6px 30px;font:inherit;font-size:13px}',
				'.sk-search:focus{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}',
				'.sk-filters{display:inline-flex;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;overflow:hidden;flex:none}',
				'.sk-filterBtn{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:12px;padding:6px 10px;white-space:nowrap;display:flex;align-items:center;gap:5px}',
				'.sk-filterBtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
				'.sk-filterBtnActive{background:var(--dsw-alias-fill-tsp-secondary);color:var(--dsw-alias-label-primary);font-weight:600}',
				'.sk-filterCount{font-size:10px;color:var(--dsw-alias-label-quaternary);font-variant-numeric:tabular-nums}',
				'.sk-spacer{flex:1}',
				'.sk-selectVisible{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap;cursor:pointer}',
				'.sk-selectVisible input{margin:0}',
				'.sk-batchHint{display:flex;align-items:center;gap:7px;margin:-2px 0 8px;padding:7px 10px;border:1px dashed var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-fill-tsp-secondary);font-size:12px;color:var(--dsw-alias-label-secondary)}',
				'.sk-list{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:3px;padding:2px 0 6px}',
				'.sk-row{display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:8px;cursor:pointer;flex:none}',
				'.sk-row:hover{background:var(--dsw-alias-interactive-bg-hover)}',
				'.sk-rowEnabled{background:var(--dsw-alias-bg-layer-3);background:color-mix(in srgb,var(--dsw-static-blue-500) 8%,var(--dsw-alias-bg-module-platform))}',
				'.sk-rowEnabled:hover{background:color-mix(in srgb,var(--dsw-static-blue-500) 12%,var(--dsw-alias-bg-module-platform))}',
				'.sk-rowActive{background:var(--dsw-alias-interactive-bg-hover-solid)}',
				'.sk-rowEnabled.sk-rowActive{background:color-mix(in srgb,var(--dsw-static-blue-500) 14%,var(--dsw-alias-bg-module-platform))}',
				'.sk-check{appearance:none;width:15px;height:15px;flex:none;margin-top:3px;border:1.5px solid var(--dsw-alias-border-l2);border-radius:4px;background:var(--dsw-alias-bg-module-platform);cursor:pointer;position:relative;padding:0}',
				'.sk-check:hover{border-color:var(--dsw-alias-label-dimmed)}',
				'.sk-check:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
				'.sk-checkOn{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}',
				'.sk-checkOn:after{content:"";position:absolute;left:4px;top:1px;width:4px;height:8px;border:solid #fff;border-width:0 1.5px 1.5px 0;transform:rotate(45deg)}',
				'.sk-ic{flex:none;color:var(--dsw-alias-label-secondary);display:inline-flex;align-items:center;justify-content:center}',
				'.sk-rowOpen{appearance:none;border:0;background:transparent;color:inherit;display:flex;align-items:center;gap:10px;flex:1;min-width:0;padding:0;text-align:left;font:inherit;cursor:pointer;border-radius:6px}',
				'.sk-rowOpen:focus-visible{outline:2px solid var(--dsw-static-blue-500);outline-offset:3px}',
				'.sk-rowMain{flex:1;min-width:0}',
				'.sk-rowTitle{display:flex;align-items:center;gap:6px;min-width:0}',
				'.sk-rowName{font-size:13px;font-weight:600;overflow-wrap:anywhere}',
				'.sk-badge{white-space:nowrap;border-radius:999px;padding:1px 7px;font-size:11px;font-weight:500;background:var(--dsw-alias-fill-tsp-secondary);color:var(--dsw-alias-label-secondary)}',
				'.sk-badgeSpec{background:color-mix(in srgb,var(--dsw-static-blue-500) 14%,transparent);color:var(--dsw-static-blue-500)}',
				'.sk-badgeUpdate{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 14%,transparent);color:var(--dsw-alias-state-error-primary)}',
				'.sk-badgeWarn{background:var(--dsw-alias-state-warn-primary);color:#fff}',
				'.sk-rowDesc{margin-top:2px;font-size:13px;color:var(--dsw-alias-label-tertiary);line-height:1.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
				'.sk-tag{border-radius:999px;background:var(--dsw-alias-fill-tsp-secondary);color:var(--dsw-alias-label-secondary);padding:0 7px;font-size:11px;line-height:16px;display:inline-flex;align-items:center;gap:3px}',
				'.sk-rowSide{flex:none;display:flex;align-items:center;gap:8px;margin-top:2px}',
				'.sk-empty{margin:0;font-size:12px;color:var(--dsw-alias-label-quaternary);padding:24px 4px}',
				'.sk-error{margin:0 0 8px;font-size:13px;color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere}',
				'.sk-bulkbar{flex:none;display:flex;align-items:center;gap:10px;margin-top:8px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-module-platform);box-shadow:0 -4px 18px rgba(0,0,0,.06)}',
				'.sk-bulkbar strong{font-size:12.5px;white-space:nowrap}',
				'.sk-bulkPrimary{appearance:none;border:1px solid var(--dsw-alias-brand-primary);border-radius:8px;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);font:inherit;font-size:12px;font-weight:600;padding:6px 12px;cursor:pointer;white-space:nowrap}',
				'.sk-bulkPrimary:disabled{opacity:.5;cursor:default}',
				'.sk-emptyActions{display:flex;gap:7px;margin-top:10px;flex-wrap:wrap}',
				'.sk-banner{margin:0 0 12px;font-size:12px;color:var(--dsw-alias-label-tertiary);border:1px dashed var(--dsw-alias-border-l2);border-radius:8px;padding:8px 10px;line-height:1.55}',
				'.sk-bannerErr{border-style:solid;border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}',
				'.sk-bannerWarn{border-style:solid;border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-label-secondary)}',
				'.sk-slimNote{margin:0;font-size:11px;color:var(--dsw-alias-label-quaternary);line-height:1.55}',
				// drawer
				'.sk-drawer{position:absolute;z-index:20;inset:0 0 0 auto;width:min(400px,100%);max-width:none;border-left:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);box-shadow:-12px 0 32px rgba(0,0,0,.18);overflow-y:auto;display:flex;flex-direction:column}',
				'.sk-drawerHead{display:flex;align-items:center;gap:9px;padding:14px 16px 10px;position:sticky;top:0;background:var(--dsw-alias-bg-base);z-index:2}',
				'.sk-drawerHead .sk-ic{color:var(--dsw-alias-label-primary)}',
				'.sk-drawerName{font-size:15px;font-weight:600;flex:1;min-width:0;overflow-wrap:anywhere}',
				'.sk-icBtn{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;border-radius:7px;padding:5px;display:inline-flex;flex:none}',
				'.sk-icBtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
				'.sk-drawerBody{padding:2px 16px 22px;display:flex;flex-direction:column;gap:14px}',
				'.sk-drawerRow{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:10px;padding:9px 12px}',
				'.sk-drawerRowLabel{font-size:13px;font-weight:600}',
				'.sk-sourceSummary{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;padding:8px 10px;background:var(--dsw-alias-bg-layer-3)}',
				'.sk-sourceCurrent{display:flex;flex-direction:column;gap:2px;min-width:0}',
				'.sk-sec{display:flex;flex-direction:column;gap:6px}',
				'.sk-secTitle{font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary)}',
				'.sk-descFull{margin:0;font-size:12.5px;line-height:1.6;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere;white-space:pre-wrap}',
				'.sk-srcList{display:flex;flex-direction:column;gap:4px}',
				'.sk-src{appearance:none;display:flex;align-items:flex-start;gap:8px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:7px 10px;cursor:pointer;font:inherit;font-size:12px;min-width:0;background:transparent;color:var(--dsw-alias-label-primary);text-align:left;width:100%}',
				'.sk-src:hover:not(:disabled){border-color:var(--dsw-alias-label-dimmed)}',
				'.sk-src:disabled{opacity:.55;cursor:default}',
				'.sk-srcOn{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-interactive-bg-hover)}',
				'.sk-srcMain{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}',
				'.sk-srcName{font-weight:600;font-size:12.5px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;overflow-wrap:anywhere}',
				'.sk-srcMeta{font-size:11px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
				'.sk-radio{width:13px;height:13px;flex:none;margin-top:2px;border-radius:50%;border:1.5px solid var(--dsw-alias-border-l2);position:relative;background:var(--dsw-alias-bg-module-platform)}',
				'.sk-radioOn{border-color:var(--dsw-alias-brand-primary)}',
				'.sk-radioOn:after{content:"";position:absolute;inset:2.5px;border-radius:50%;background:var(--dsw-alias-brand-primary)}',
				'.sk-tagHeading{display:flex;align-items:center;justify-content:space-between;gap:10px}',
				'.sk-tagScope{font-size:10.5px;color:var(--dsw-alias-label-quaternary)}',
				'.sk-tagPanel{overflow:hidden;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-module-platform);transition:border-color .12s,box-shadow .12s}',
				'.sk-tagPanel:focus-within{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 1px var(--dsw-alias-brand-primary)}',
				'.sk-tagList{display:flex;flex-wrap:wrap;gap:6px;padding:9px 10px}',
				'.sk-tagListBare{padding:0}',
				'.sk-tagList .sk-tag{min-height:25px;padding:3px 6px 3px 9px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);font-size:11.5px;line-height:17px}',
				'.sk-tagX{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-quaternary);cursor:pointer;line-height:1;padding:2px;border-radius:4px;display:inline-flex;align-items:center}',
				'.sk-tagX:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-state-error-primary)}',
				'.sk-tagX:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
				'.sk-tagX:disabled{cursor:default;opacity:.45}',
				'.sk-tagComposer{display:flex;align-items:center;gap:8px;padding:6px 7px 6px 10px}',
				'.sk-tagList+.sk-tagComposer{border-top:1px solid var(--dsw-alias-border-l2)}',
				'.sk-tagInput{min-width:0;flex:1;font:inherit;font-size:12.5px;line-height:1.5;background:transparent;border:0;color:var(--dsw-alias-label-primary);padding:4px 0}',
				'.sk-tagInput::placeholder{color:var(--dsw-alias-label-quaternary)}',
				'.sk-tagInput:focus{outline:0}',
				'.sk-tagAdd{appearance:none;flex:none;min-width:54px;border:1px solid var(--dsw-alias-label-primary);border-radius:7px;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-base);cursor:pointer;font:inherit;font-size:11.5px;font-weight:600;line-height:1.4;padding:5px 10px}',
				'.sk-tagAdd:hover:not(:disabled){opacity:.88}',
				'.sk-tagAdd:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
				'.sk-tagAdd:disabled{border-color:transparent;background:var(--dsw-alias-fill-tsp-secondary);color:var(--dsw-alias-label-quaternary);cursor:default}',
				'.sk-tagFoot{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:10.5px;line-height:1.4;color:var(--dsw-alias-label-quaternary)}',
				'.sk-tagIssue{color:var(--dsw-alias-state-warn-primary)}',
				'.sk-upd{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--dsw-alias-label-tertiary);line-height:1.5}',
				'.sk-updDot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-label-quaternary);flex:none}',
				'.sk-adv{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;overflow:hidden}',
				'.sk-advBtn{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:12px;width:100%;text-align:left;padding:7px 10px;display:flex;align-items:center;gap:6px}',
				'.sk-advBtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
				'.sk-advBody{border-top:1px solid var(--dsw-alias-border-l2);padding:8px 10px;display:flex;flex-direction:column;gap:6px;font-size:11.5px;color:var(--dsw-alias-label-tertiary);line-height:1.5}',
				'.sk-advBody code{overflow-wrap:anywhere;font-size:11px}',
				// preset / slim previews
				'[role="dialog"]:has(.sk-presetApply){width:min(700px,calc(100vw - 40px));max-width:none}',
				'[role="dialog"]:has(.sk-presetSave){width:min(580px,calc(100vw - 40px));max-width:none}',
				'.sk-presetApply{width:min(640px,calc(100vw - 96px));display:flex;flex-direction:column;gap:14px}',
				'.sk-presetMode{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:3px;background:var(--dsw-alias-fill-tsp-secondary)}',
				'.sk-presetModeBtn{appearance:none;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:13px;line-height:1.35;min-height:38px;padding:8px 12px;text-align:center;white-space:nowrap}',
				'.sk-presetModeBtn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}',
				'.sk-presetModeBtnOn{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-weight:600;box-shadow:0 1px 4px rgba(0,0,0,.08)}',
				'.sk-presetImpact{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:0 2px}',
				'.sk-presetImpactMain{font-size:13.5px;font-weight:600;color:var(--dsw-alias-label-primary);line-height:1.45}',
				'.sk-presetImpactMeta{font-size:11.5px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}',
				'.sk-presetListTitle{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:2px;font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}',
				'.sk-modalDiff{display:flex;flex-direction:column;gap:12px;max-height:300px;overflow-y:auto;padding-right:5px;scrollbar-gutter:stable}',
				'.sk-diffGroup{display:flex;flex-direction:column}',
				'.sk-diffGroupHead{display:flex;align-items:center;gap:7px;padding:0 2px 7px;border-bottom:1px solid var(--dsw-alias-border-l2);font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}',
				'.sk-diffGroupCount{font-size:11px;font-weight:400;color:var(--dsw-alias-label-quaternary)}',
				'.sk-diffRow{display:flex;gap:10px;font-size:12.5px;align-items:center;min-height:34px;padding:5px 2px;border-bottom:1px solid var(--dsw-alias-border-l2)}',
				'.sk-diffRow:last-child{border-bottom:0}',
				'.sk-diffName{overflow-wrap:anywhere;min-width:0;flex:1}',
				'.sk-diffMeta{font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}',
				'.sk-diffState{flex:none;border-radius:999px;background:var(--dsw-alias-fill-tsp-secondary);padding:2px 8px;font-size:10.5px;line-height:1.4;color:var(--dsw-alias-label-secondary)}',
				'.sk-diffStateAdd{color:var(--dsw-alias-brand-primary)}',
				'.sk-diffStateDel{color:var(--dsw-alias-state-error-primary)}',
				'.sk-presetFooter{width:100%;min-width:0;display:flex;align-items:center;gap:10px;flex-wrap:nowrap}',
				'.sk-presetFooterLeft{display:flex;align-items:center;gap:12px;min-width:0}',
				'.sk-presetTextBtn{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:12px;padding:6px 0;white-space:nowrap}',
				'.sk-presetTextBtn:hover{color:var(--dsw-alias-label-primary)}',
				'.sk-presetTextDanger:hover{color:var(--dsw-alias-state-error-primary)}',
				'.sk-presetPrimary{min-width:96px!important;background:var(--dsw-alias-label-primary)!important;border-color:var(--dsw-alias-label-primary)!important;color:var(--dsw-alias-bg-base)!important}',
				'.sk-presetPrimary:hover:not(:disabled){opacity:.88}',
				'.sk-presetPrimary:disabled{background:var(--dsw-alias-fill-tsp-secondary)!important;border-color:var(--dsw-alias-border-l2)!important;color:var(--dsw-alias-label-quaternary)!important}',
				'.sk-presetSave{width:min(500px,calc(100vw - 96px));display:flex;flex-direction:column;gap:16px}',
				'.sk-presetField{display:flex;flex-direction:column;gap:7px}',
				'.sk-presetFieldHead{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-primary)}',
				'.sk-presetCounter{font-size:11px;font-weight:400;color:var(--dsw-alias-label-quaternary);font-variant-numeric:tabular-nums}',
				'.sk-presetInput,.sk-presetTextarea{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:1.5;padding:9px 11px}',
				'.sk-presetInput{height:40px}',
				'.sk-presetTextarea{min-height:96px;resize:vertical}',
				'.sk-presetInput:focus,.sk-presetTextarea:focus{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px;border-color:transparent}',
				'.sk-presetSaveSummary{display:flex;flex-direction:column;gap:3px;padding:10px 12px;border-top:1px solid var(--dsw-alias-border-l2);border-bottom:1px solid var(--dsw-alias-border-l2);font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.5}',
				'.sk-presetSaveSummary strong{font-weight:600;color:var(--dsw-alias-label-primary)}',
				'.sk-presetSaveSummary span{font-size:11px;color:var(--dsw-alias-label-quaternary)}',
				'@media(max-width:900px){.ext-nav:not(.ext-navCollapsed){width:168px;padding:10px}.ext-main{padding:16px}.sk-projectCard{align-items:flex-start;flex-wrap:wrap}.sk-projectStats{order:3;width:100%;padding:10px 0 0;border-left:0;border-top:1px solid var(--dsw-alias-border-l2)}.sk-projectActions{margin-left:auto}.sk-toolbar{align-items:stretch}.sk-searchWrap{flex-basis:100%}.sk-bulkbar{flex-wrap:wrap}}',
				'@media(max-width:680px){.ext-nav{display:none}.ext-main{padding:12px}.sk-projectActions{width:100%;margin-left:0}.sk-projectActions .sk-projBtn{flex:1}.sk-projectPath{max-width:75vw}}',
				'@media(max-width:600px){[role="dialog"]:has(.sk-presetApply),[role="dialog"]:has(.sk-presetSave){width:calc(100vw - 24px)}.sk-presetApply,.sk-presetSave{width:auto}.sk-presetMode{grid-template-columns:1fr}.sk-presetImpact{align-items:flex-start;flex-direction:column;gap:3px}.sk-presetFooter{flex-wrap:wrap}.sk-presetFooterLeft{width:100%}}',
				'@media(max-width:480px){.ext-top{padding:12px}.ext-topTitle{white-space:nowrap}.ext-topSub{display:none}.sk-projectCard{padding:12px}.sk-filterBtn{padding:6px 8px}}'
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
			/** Compact list copy without throwing away the full drawer description. */
			function firstSentence(text) {
				var value = String(text || '').replace(/\s+/g, ' ').trim();
				if (value === '') return '';
				for (var i = 0; i < value.length; i += 1) {
					var ch = value[i];
					var isBoundary = ch === '。' || ch === '！' || ch === '？' || ch === '!' || ch === '?';
					if (ch === '.') {
						var before = value[i - 1] || '';
						var after = value[i + 1] || '';
						var token = value.slice(0, i + 1).split(' ').pop().toLowerCase();
						var abbreviation = /^(?:e\.g\.|i\.e\.|etc\.|vs\.|mr\.|mrs\.|ms\.|dr\.)$/.test(token);
						isBoundary = !abbreviation && !(/[0-9]/.test(before) && /[0-9]/.test(after)) && (after === '' || /\s|[\"'”’）\]]/.test(after));
					}
					if (!isBoundary) continue;
					var end = i + 1;
					while (end < value.length && /[\"'”’）\]]/.test(value[end])) end += 1;
					return value.slice(0, end);
				}
				return value;
			}

			/**
			 * V1 fetch helper: like apiCall, but only pins body.cwd from the
			 * current session when the caller did not set it (project ops
			 * pass the selected project's cwd explicitly).
			 */
			function apiCallAt(op, payload, ctx) {
				var body = Object.assign({ op: op }, payload || {});
				if (body.cwd === undefined) body.cwd = currentCwd(ctx);
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
			/** Display basename of a host path (Windows or POSIX separators). */
			function baseName(p) {
				if (typeof p !== 'string' || p === '') return '';
				var parts = p.replace(/\\/g, '/').split('/').filter(Boolean);
				return parts.length === 0 ? p : parts[parts.length - 1];
			}
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
						role: 'switch',
						'aria-checked': on,
						'aria-label': (on ? '停用 ' : '启用 ') + skill.name + '（仅当前项目）',
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

			// ── DSH-008 V1: per-project SKILL management ─────────────────
			/** Build the project options: current session workspace + DSH workspaces. */
			function buildProjectOptions(ctx) {
				var out = [];
				var seen = {};
				function push(cwd, title, kind) {
					if (typeof cwd !== 'string' || cwd === '' || seen[cwd] === true) return;
					seen[cwd] = true;
					out.push({ cwd: cwd, title: (typeof title === 'string' && title !== '') ? title : (baseName(cwd) || cwd), kind: kind });
				}
				// Current workspace title = its name (the menu adds a
				// "当前工作区" hint beside it), matching the visual target.
				var cur = currentCwd(ctx);
				push(cur, baseName(cur) || cur, 'current');
				try {
					var ws = ctx.get('workspaces');
					var snap = ws && ws.list && typeof ws.list.getSnapshot === 'function' ? ws.list.getSnapshot() : null;
					if (snap && Array.isArray(snap.items)) {
						var items = snap.items.slice().sort(function (a, b) {
							return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
						});
						for (var i = 0; i < items.length && out.length < 12; i += 1) {
							if (items[i] && typeof items[i].path === 'string') push(items[i].path, items[i].title, 'workspace');
						}
					}
				} catch (error) { /* workspaces service unavailable: degrade */ }
				return out;
			}
			/** Shared diff list (preset apply / 一键精简 preview). */
			function DiffView(props) {
				var diff = (props && props.diff) || {};
				var groups = [];
				function group(title, key, values, renderRow) {
					if (!Array.isArray(values) || values.length === 0) return;
					groups.push(h('section', { key: key, className: 'sk-diffGroup', 'aria-label': title },
						h('div', { className: 'sk-diffGroupHead' }, title, h('span', { className: 'sk-diffGroupCount' }, String(values.length))),
						values.map(renderRow)));
				}
				group('将启用', 'enable', diff.toEnable || [], function (n) {
					return h('div', { key: 'e' + n, className: 'sk-diffRow' },
						h('span', { className: 'sk-diffName' }, n),
						h('span', { className: 'sk-diffState sk-diffStateAdd' }, '启用'));
				});
				group('将停用', 'disable', diff.toDisable || [], function (n) {
					return h('div', { key: 'd' + n, className: 'sk-diffRow' },
						h('span', { className: 'sk-diffName' }, n),
						h('span', { className: 'sk-diffState sk-diffStateDel' }, '停用'));
				});
				group('来源变更', 'source', diff.sourceChanges || [], function (c) {
					return h('div', { key: 's' + c.name, className: 'sk-diffRow' },
						h('span', { className: 'sk-diffName' }, c.name),
						h('span', { className: 'sk-diffMeta' }, (c.from || '默认') + ' → ' + (c.to || '默认')));
				});
				if (groups.length === 0) groups.push(h('p', { key: 'none', className: 'sk-slimNote' }, '没有变化：当前配置已与该预设一致'));
				if (!props || props.showFinal !== false) groups.push(h('p', { key: 'final', className: 'sk-slimNote' },
					'应用后启用 ' + (diff.finalEnabled || []).length + ' 个 Skill；下一轮对话生效，无需重启'));
				return h('div', { className: 'sk-modalDiff' }, groups);
			}
			/**
			 * The V1 body. Rendered only after the apiVersion 6 probe
			 * succeeded, so all hooks here run unconditionally.
			 */
			function SkillCenterV1Body(props) {
				var ctx = props.ctx;
				var [projects, setProjects] = React.useState([]);
				var [project, setProject] = React.useState(null); // { cwd, title, kind }
				var [projMenuOpen, setProjMenuOpen] = React.useState(false);
				var [view, setView] = React.useState(null);
				var [viewError, setViewError] = React.useState(null);
				var [viewBusy, setViewBusy] = React.useState(false);
				var [presets, setPresets] = React.useState([]);
				var [presetMenuOpen, setPresetMenuOpen] = React.useState(false);
				var [search, setSearch] = React.useState('');
				var [enableFilter, setEnableFilter] = React.useState('all'); // 'all'|'on'|'off'
				var [tagFilter, setTagFilter] = React.useState(null);
				var [tagMenuOpen, setTagMenuOpen] = React.useState(false);
				var [actionMenuOpen, setActionMenuOpen] = React.useState(false);
				var [selectedRows, setSelectedRows] = React.useState({}); // name -> true
				var [bulkMode, setBulkMode] = React.useState(false);
				var [drawerName, setDrawerName] = React.useState(null);
				var [toggling, setToggling] = React.useState({}); // name -> true
				var [sourceBusy, setSourceBusy] = React.useState(null); // name | null
				var [presetModal, setPresetModal] = React.useState(null); // {name, desc, mode, diff}
				var [presetBusy, setPresetBusy] = React.useState(false);
				var [slimModal, setSlimModal] = React.useState(null); // {kind, preset, diff}
				var [slimBusy, setSlimBusy] = React.useState(false);
				var [saveOpen, setSaveOpen] = React.useState(false);
				var [saveName, setSaveName] = React.useState('');
				var [saveDesc, setSaveDesc] = React.useState('');
				var [tagDraft, setTagDraft] = React.useState('');
				var [tagBusy, setTagBusy] = React.useState(false);
				var [tagComposerOpen, setTagComposerOpen] = React.useState(false);
				var [advOpen, setAdvOpen] = React.useState(false);
				var [sourceOpen, setSourceOpen] = React.useState(false);
				var genRef = React.useRef(0); // selected-project generation
				var viewGenRef = React.useRef(0); // catalog request generation
				var projectRef = React.useRef(null); // current project, kept in a ref for async guards
				var [partialWarning, setPartialWarning] = React.useState(null); // P2-3 persistent partial-failure warning
				var drawerRow = null;
				if (view !== null && drawerName !== null) {
					for (var drawerIndex = 0; drawerIndex < view.identities.length; drawerIndex += 1) {
						if (view.identities[drawerIndex].name === drawerName) {
							drawerRow = view.identities[drawerIndex];
							break;
						}
					}
				}
				React.useEffect(function () { projectRef.current = project; }, [project]);

				function patchRow(row2) {
					setView(function (v) {
						if (v === null) return v;
						var identities = v.identities.map(function (r) { return r.name === row2.name ? row2 : r; });
						var tags = {};
						identities.forEach(function (r) {
							(r.tags || []).forEach(function (tag) { tags[tag] = true; });
						});
						return Object.assign({}, v, {
							identities: identities,
							allTags: Object.keys(tags).sort()
						});
					});
				}
				function isCurrentProject(gen, cwd) {
					var current = projectRef.current;
					var currentCwd = current && current.cwd !== undefined ? current.cwd : '';
					return genRef.current === gen && currentCwd === cwd;
				}
				var loadView = React.useCallback(function (proj) {
					// Catalog request order is separate from project generation: a refresh
					// must not invalidate concurrent mutations for the same project.
					var gen = genRef.current;
					var viewGen = viewGenRef.current + 1;
					viewGenRef.current = viewGen;
					var cwd = proj && proj.cwd !== undefined ? proj.cwd : '';
					setViewBusy(true);
					setViewError(null);
					return apiCallAt('catalog', proj ? { cwd: proj.cwd } : {}, ctx).then(
						function (value) {
							if (viewGenRef.current === viewGen && isCurrentProject(gen, cwd)) { setView(value); setViewBusy(false); }
						},
						function (e) {
							if (viewGenRef.current === viewGen && isCurrentProject(gen, cwd)) {
								setViewError(String((e && e.message) || e));
								setViewBusy(false);
							}
						}
					);
				}, [ctx]);
				var loadPresets = React.useCallback(function () {
					return apiCallAt('presets.list', {}, ctx).then(
						function (value) { setPresets(Array.isArray(value && value.presets) ? value.presets : []); },
						function () { /* presets are optional sugar */ }
					);
				}, [ctx]);

				// Initial project options + selection. The active session workspace
				// always wins so reopening the page cannot silently target an older
				// project kept in localStorage.
				React.useEffect(function () {
					var options = buildProjectOptions(ctx);
					setProjects(options);
					var stored = null;
					try { stored = window.localStorage.getItem('smgr.v1.project'); } catch (error) {}
					var pick = null;
					var activeCwd = currentCwd(ctx);
					if (typeof activeCwd === 'string' && activeCwd !== '') {
						for (var i = 0; i < options.length; i += 1) {
							if (options[i].cwd === activeCwd) { pick = options[i]; break; }
						}
					}
					if (pick === null && typeof stored === 'string' && stored !== '') {
						for (var j = 0; j < options.length; j += 1) {
							if (options[j].cwd === stored) { pick = options[j]; break; }
						}
					}
					if (pick === null) pick = options[0] || null;
					projectRef.current = pick;
					setProject(pick);
					void loadPresets();
				}, [ctx, loadPresets]);

				// Reload the catalog whenever the selected project changes.
				React.useEffect(function () {
					if (project === null) { void loadView(null); return; }
					void loadView(project);
				}, [project, loadView]);

				// Esc closes the drawer (inner modal dialogs own Esc first).
				React.useEffect(function () {
					if (drawerName === null) return;
					function onKey(event) {
						if (event.key !== 'Escape') return;
						// The drawer itself is role="dialog"; only a *modal*
						// dialog on top of it takes Esc first.
						var dialogs = document.querySelectorAll('[role="dialog"]');
						for (var i = 0; i < dialogs.length; i += 1) {
							if (dialogs[i].classList.contains('sk-drawer') === false) return;
						}
						setDrawerName(null);
						setTagDraft('');
						setTagComposerOpen(false);
						setAdvOpen(false);
						setSourceOpen(false);
					}
					document.addEventListener('keydown', onKey);
					return function () { document.removeEventListener('keydown', onKey); };
				}, [drawerName]);

				function chooseProject(p) {
					setProjMenuOpen(false);
					setPresetMenuOpen(false);
					setActionMenuOpen(false);
					if (p === null || (project !== null && project.cwd === p.cwd)) return;
					// Switching project: bump the generation, invalidate the in-flight
					// view, and clear all selection/UI state so a stale response can never
					// write into the new project's view (review P1-5).
					genRef.current += 1;
					viewGenRef.current += 1;
					projectRef.current = p;
					setProject(p);
					setView(null);
					setViewError(null);
					setPartialWarning(null);
					setSelectedRows({});
					setBulkMode(false);
					setToggling({});
					setSourceBusy(null);
					setDrawerName(null);
					setTagDraft('');
					setTagComposerOpen(false);
					setSourceOpen(false);
					setPresetModal(null);
					setPresetBusy(false);
					setSlimModal(null);
					setSlimBusy(false);
					setSaveOpen(false);
					setViewBusy(true);
					try { window.localStorage.setItem('smgr.v1.project', p.cwd); } catch (error) {}
				}
				function addLocalProject() {
					var ws = null;
					try { ws = ctx.get('workspaces'); } catch (error) {}
					if (ws === null || typeof ws.pickDirectory !== 'function') {
						setViewError('当前环境不支持目录选择（workspaces 服务不可用）');
						return;
					}
					setViewError(null);
					Promise.resolve(ws.pickDirectory()).then(function (path) {
						if (path === null || path === undefined) return;
						var done = function () {
							var options = buildProjectOptions(ctx);
							setProjects(options);
							var pick = null;
							for (var i = 0; i < options.length; i += 1) {
								if (options[i].cwd === path) { pick = options[i]; break; }
							}
							chooseProject(pick || { cwd: path, title: baseName(path), kind: 'manual' });
						};
						if (typeof ws.create === 'function') {
							Promise.resolve(ws.create({ path: path })).then(done, done);
						} else done();
					}, function (e) {
						setViewError(String((e && e.message) || e));
					});
				}

				// ── row actions ───────────────────────────────────────────────
				function doToggle(row, force) {
					var proj = project;
					if (proj === null || toggling[row.name] === true || viewBusy === true) return;
					if (view && (view.configCorrupt === true || view.configFuture === true)) return;
					var want = force === 'boolean' ? force : row.enabled !== true;
					var gen = genRef.current;
					setToggling(function (t) { var n = Object.assign({}, t); n[row.name] = true; return n; });
					setViewError(null);
					apiCallAt('setEnabled', { cwd: proj.cwd, name: row.name, enabled: want }, ctx).then(
						function (value) {
							if (!isCurrentProject(gen, proj.cwd)) { return; }
							setToggling(function (t) { var n = Object.assign({}, t); delete n[row.name]; return n; });
							if (value && value.view) { patchRow(value.view); }
							if (value && value.partial === true) {
								var rep = value.report || {};
								var parts = [];
								var failed = rep.failed || [];
								var conflicts = rep.conflicts || [];
								for (var pi = 0; pi < failed.length; pi += 1) { parts.push((failed[pi].name || '*') + '（' + (failed[pi].error || '失败') + '）'); }
								for (var pj = 0; pj < conflicts.length; pj += 1) { parts.push((conflicts[pj].name || '*') + '（' + (conflicts[pj].message || '冲突') + '）'); }
								setPartialWarning('部分变更未完全生效：' + (parts.length > 0 ? parts.join('、') : '存在失败或冲突') + '。请刷新查看真实状态。');
								void loadView(proj);
							}
						},
						function (e) {
							if (!isCurrentProject(gen, proj.cwd)) { return; }
							setToggling(function (t) { var n = Object.assign({}, t); delete n[row.name]; return n; });
							setViewError(String((e && e.message) || e));
						}
					);
				}
				function doBulk(enabled) {
					var proj = project;
					var names = Object.keys(selectedRows);
					if (names.length === 0 || proj === null || viewBusy === true) return;
					if (view && (view.configCorrupt === true || view.configFuture === true)) return;
					var gen = genRef.current;
					setViewError(null);
					apiCallAt('setMany', { cwd: proj.cwd, names: names, enabled: enabled }, ctx).then(
						function (value) {
							if (!isCurrentProject(gen, proj.cwd)) { return; }
							setSelectedRows({});
							setBulkMode(false);
							if (value && value.partial === true) {
								setPartialWarning('批量变更未完全生效：部分 Skill 的文件副作用失败。请刷新查看真实状态。');
							}
							void loadView(proj);
						},
						function (e) { if (isCurrentProject(gen, proj.cwd)) { setViewError(String((e && e.message) || e)); } }
					);
				}
				function doSource(name, sourceKey) {
					var proj = project;
					if (proj === null || sourceBusy === name || viewBusy === true) return;
					if (view && (view.configCorrupt === true || view.configFuture === true)) return;
					var gen = genRef.current;
					setSourceBusy(name);
					setViewError(null);
					apiCallAt('setSource', { cwd: proj.cwd, name: name, source: sourceKey }, ctx).then(
						function (value) {
							if (!isCurrentProject(gen, proj.cwd)) { return; }
							setSourceBusy(null);
							if (value && value.view) patchRow(value.view);
							if (value && value.partial === true) {
								setPartialWarning('来源变更未完全生效：文件副作用失败。请刷新查看真实状态。');
							}
						},
						function (e) { if (isCurrentProject(gen, proj.cwd)) { setSourceBusy(null); setViewError(String((e && e.message) || e)); } }
					);
				}
				function doTags(row, tags) {
					var proj = project;
					if (viewBusy === true || tagBusy === true) return;
					var gen = genRef.current;
					setTagBusy(true);
					setViewError(null);
					apiCallAt('setTags', { cwd: proj ? proj.cwd : undefined, name: row.name, tags: tags }, ctx).then(
						function (value) {
							if (!isCurrentProject(gen, proj ? proj.cwd : '')) { setTagBusy(false); return; }
							if (value && value.view) { patchRow(value.view); }
							setTagDraft('');
							setTagBusy(false);
						},
						function (e) {
							setTagBusy(false);
							if (isCurrentProject(gen, proj ? proj.cwd : '')) { setViewError(String((e && e.message) || e)); }
						}
					);
				}
				function commitTag() {
					var row = drawerRow;
					var v = tagDraft.trim();
					if (row === null || v === '' || tagBusy === true) return;
					var tags = (row.tags || []).slice();
					if (tags.length >= 20 || tags.indexOf(v) !== -1) return;
					tags.push(v);
					doTags(row, tags);
				}

				// ── presets & 一键精简 ────────────────────────────────────────
				function openPreset(p) {
					var proj = project;
					if (proj === null) { setViewError('请先选择项目，再应用预设'); return; }
					var gen = genRef.current;
					setViewError(null);
					apiCallAt('presets.preview', { cwd: proj.cwd, name: p.name, mode: 'replace' }, ctx).then(
						function (value) {
							if (!isCurrentProject(gen, proj.cwd)) return;
							setPresetModal({ name: p.name, desc: p.description || '', mode: 'replace', diff: value.diff, cwd: proj.cwd, gen: gen });
						},
						function (e) { if (isCurrentProject(gen, proj.cwd)) setViewError(String((e && e.message) || e)); }
					);
				}
				function switchPresetMode(mode) {
					var modal = presetModal;
					var proj = project;
					if (modal === null || proj === null || modal.cwd !== proj.cwd) return;
					var gen = genRef.current;
					apiCallAt('presets.preview', { cwd: proj.cwd, name: modal.name, mode: mode }, ctx).then(
						function (value) {
							if (!isCurrentProject(gen, proj.cwd)) return;
							setPresetModal(function (m) {
								return m && m.name === modal.name && m.cwd === proj.cwd ? Object.assign({}, m, { mode: mode, diff: value.diff }) : m;
							});
						},
						function (e) { if (isCurrentProject(gen, proj.cwd)) setViewError(String((e && e.message) || e)); }
					);
				}
				function applyPreset() {
					var proj = project;
					if (presetModal === null || proj === null || presetModal.cwd !== proj.cwd || presetBusy || viewBusy === true) return;
					if (view && (view.configCorrupt === true || view.configFuture === true)) return;
					var gen = genRef.current;
					setPresetBusy(true);
					setViewError(null);
					apiCallAt('presets.apply', { cwd: proj.cwd, name: presetModal.name, mode: presetModal.mode }, ctx).then(
						function (value) {
							if (!isCurrentProject(gen, proj.cwd)) { return; }
							setPresetBusy(false);
							setPresetModal(null);
							setSelectedRows({});
							setBulkMode(false);
							if (value && value.partial === true) {
								setPartialWarning('预设应用未完全生效：部分 Skill 的文件副作用失败。请刷新查看真实状态。');
							}
							void loadView(proj);
						},
						function (e) { if (isCurrentProject(gen, proj.cwd)) { setPresetBusy(false); setViewError(String((e && e.message) || e)); } }
					);
				}
				function setDefaultPreset(name) {
					apiCallAt('presets.setDefault', { name: name }, ctx).then(
						function () { void loadPresets(); },
						function (e) { setViewError(String((e && e.message) || e)); }
					);
				}
				function deletePreset(name) {
					apiCallAt('presets.delete', { name: name }, ctx).then(
						function () { setPresetModal(null); void loadPresets(); },
						function (e) { setViewError(String((e && e.message) || e)); }
					);
				}
				function savePreset() {
					var name = saveName.trim();
					var proj = project;
					if (name === '' || proj === null) return;
					var gen = genRef.current;
					setPresetBusy(true);
					setViewError(null);
					apiCallAt('presets.save', { cwd: proj.cwd, name: name, description: saveDesc.trim() === '' ? undefined : saveDesc.trim() }, ctx).then(
						function () {
							if (!isCurrentProject(gen, proj.cwd)) return;
							setPresetBusy(false);
							setSaveOpen(false);
							setSaveName('');
							setSaveDesc('');
							void loadPresets();
						},
						function (e) { if (isCurrentProject(gen, proj.cwd)) { setPresetBusy(false); setViewError(String((e && e.message) || e)); } }
					);
				}
				function doSlimPreview() {
					var proj = project;
					if (proj === null) return;
					var gen = genRef.current;
					setViewError(null);
					apiCallAt('slim.preview', { cwd: proj.cwd }, ctx).then(
						function (value) { if (isCurrentProject(gen, proj.cwd)) setSlimModal(Object.assign({}, value, { cwd: proj.cwd, gen: gen })); },
						function (e) { if (isCurrentProject(gen, proj.cwd)) setViewError(String((e && e.message) || e)); }
					);
				}
				function doSlimApply() {
					var proj = project;
					if (proj === null || slimModal === null || slimModal.cwd !== proj.cwd || slimBusy || viewBusy === true) return;
					if (view && (view.configCorrupt === true || view.configFuture === true)) return;
					var gen = genRef.current;
					setSlimBusy(true);
					setViewError(null);
					apiCallAt('slim.apply', { cwd: proj.cwd }, ctx).then(
						function (value) {
							if (!isCurrentProject(gen, proj.cwd)) { return; }
							setSlimBusy(false);
							setSlimModal(null);
							setSelectedRows({});
							setBulkMode(false);
							if (value && value.partial === true) {
								setPartialWarning('一键精简未完全生效：部分 Skill 的文件副作用失败。请刷新查看真实状态。');
							}
							void loadView(proj);
						},
						function (e) { if (isCurrentProject(gen, proj.cwd)) { setSlimBusy(false); setViewError(String((e && e.message) || e)); } }
					);
				}

				// ── filtering ─────────────────────────────────────────────────
				function matchesSearch(row) {
					if (search === '') return true;
					var n = search.toLowerCase();
					return row.name.toLowerCase().indexOf(n) !== -1
						|| (row.description || '').toLowerCase().indexOf(n) !== -1;
				}
				var visibleRows = [];
				if (view !== null) {
					visibleRows = view.identities.filter(matchesSearch);
					if (enableFilter === 'on') visibleRows = visibleRows.filter(function (r) { return r.enabled === true; });
					if (enableFilter === 'off') visibleRows = visibleRows.filter(function (r) { return r.enabled !== true; });
					if (tagFilter !== null) {
						visibleRows = visibleRows.filter(function (r) { return Array.isArray(r.tags) && r.tags.indexOf(tagFilter) !== -1; });
					}
				}
				var selectedVisibleCount = 0;
				for (var visibleIndex = 0; visibleIndex < visibleRows.length; visibleIndex += 1) {
					if (selectedRows[visibleRows[visibleIndex].name] === true) selectedVisibleCount += 1;
				}
				var allVisibleSelected = visibleRows.length > 0 && selectedVisibleCount === visibleRows.length;
				function toggleVisibleSelection() {
					setSelectedRows(function (selected) {
						var next = Object.assign({}, selected);
						visibleRows.forEach(function (row) {
							if (allVisibleSelected) delete next[row.name];
							else next[row.name] = true;
						});
						return next;
					});
				}

				// ── row / drawer pieces ───────────────────────────────────────
				function switchV1(row) {
					var on = row.enabled === true;
					var dim = project === null || toggling[row.name] === true;
					var title = project === null
						? '请先选择项目'
						: on
							? '在本项目禁用（模型不再自动调用，仍可用 /' + row.name + ' 手动调用）'
							: '在本项目启用（下一轮对话生效）';
					return h('button', {
						type: 'button',
						role: 'switch',
						'aria-checked': on,
						'aria-label': (on ? '停用 ' : '启用 ') + row.name + '（仅当前项目）',
						className: 'smgr-switch' + (on ? ' smgr-switchOn' : '') + (dim ? ' smgr-switchDim' : ''),
						disabled: dim || viewBusy === true || (view && (view.configCorrupt === true || view.configFuture === true)),
						title: title,
						onClick: function (event) { event.stopPropagation(); doToggle(row); }
					}, h('span', { className: 'smgr-switchKnob' }));
				}
				function openDrawer(row) {
					setDrawerName(row.name);
					setTagDraft('');
					setTagComposerOpen(false);
					setAdvOpen(false);
					setSourceOpen(false);
				}
				function rowEl(row) {
					var off = row.enabled !== true;
					var checked = selectedRows[row.name] === true;
					return h(
						'div',
						{
							key: row.name,
							className: 'sk-row' + (drawerName === row.name ? ' sk-rowActive' : '')
								+ (row.enabled === true ? ' sk-rowEnabled' : '')
								+ (off ? ' sk-rowOff' : ''),
						},
						bulkMode
							? h('input', {
								type: 'checkbox',
								className: 'sk-check' + (checked ? ' sk-checkOn' : ''),
								checked: checked,
								disabled: viewBusy === true || (view && (view.configCorrupt === true || view.configFuture === true)),
								'aria-label': '选择 ' + row.name,
								onClick: function (event) { event.stopPropagation(); },
								onChange: function () {
									setSelectedRows(function (s) {
										var n = Object.assign({}, s);
										if (checked) delete n[row.name]; else n[row.name] = true;
										return n;
									});
								}
							})
							: null,
						h(
							'button',
							{
								type: 'button',
								className: 'sk-rowOpen',
								'aria-label': '查看 ' + row.name + ' 详情',
								onClick: function () { openDrawer(row); },
								onMouseUp: function (event) { event.currentTarget.blur(); },
								onKeyDown: function (event) {
									if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
									event.preventDefault();
									openDrawer(row);
								}
							},
							h('div', { className: 'sk-rowMain', title: row.description || undefined },
							h(
								'div',
								{ className: 'sk-rowTitle' },
								h('span', { className: 'sk-rowName' }, row.name),
								row.specialized === true
									? h('span', { className: 'sk-badge sk-badgeSpec', title: '本项目存在已修改的来源副本（项目特化）' }, '项目特化')
									: null,
								row.updateInfo !== null && row.updateInfo !== undefined
									? h('span', { className: 'sk-badge sk-badgeUpdate', title: String(row.updateInfo) }, '可更新')
									: null,
								row.sources.length > 1
									? h('span', { className: 'sk-badge', title: '该 Skill 存在多个来源，可在详情中选择' }, '来源 ×' + row.sources.length)
									: null
							),
							row.description ? h('div', { className: 'sk-rowDesc' }, firstSentence(row.description)) : null
							)
						),
						h('div', { className: 'sk-rowSide' }, !bulkMode ? switchV1(row) : null)
					);
				}
				function drawerEl() {
					var row = drawerRow;
					if (row === null) return null;
					var eff = null;
					for (var i = 0; i < row.sources.length; i += 1) {
						if (row.sources[i].key === row.effectiveSourceKey) { eff = row.sources[i]; break; }
					}
					var defaultSrc = null;
					for (var j = 0; j < row.sources.length; j += 1) {
						if (row.sources[j].key === row.defaultSourceKey) { defaultSrc = row.sources[j]; break; }
					}
					var canWrite = project !== null
						&& viewBusy !== true
						&& !(view && (view.configCorrupt === true || view.configFuture === true));
					var tagValues = Array.isArray(row.tags) ? row.tags : [];
					var normalizedTag = tagDraft.trim();
					var tagAtLimit = tagValues.length >= 20;
					var tagDuplicate = normalizedTag !== '' && tagValues.indexOf(normalizedTag) !== -1;
					var tagCanAdd = canWrite && tagBusy !== true && normalizedTag !== '' && !tagAtLimit && !tagDuplicate;
					var tagHelpId = 'sk-tag-help-' + row.name;
					var tagIssue = tagAtLimit
						? '已达到 20 个标签上限'
						: tagDuplicate
							? '这个标签已经存在'
							: '按 Enter 添加';
					return h(
						'aside',
						{ className: 'sk-drawer', role: 'dialog', 'aria-label': 'Skill 详情：' + row.name },
						h(
							'div',
							{ className: 'sk-drawerHead' },
							h('div', { className: 'sk-drawerName' }, row.name),
							h('span', { className: 'sk-badge' + (row.enabled === true ? ' sk-badgeSpec' : '') }, row.enabled === true ? '已启用' : '未启用'),
							h('button', {
								type: 'button',
								className: 'sk-icBtn',
								'aria-label': '关闭详情',
								title: '关闭（Esc）',
								onClick: function () { setDrawerName(null); setTagDraft(''); setTagComposerOpen(false); setAdvOpen(false); setSourceOpen(false); }
							}, h(P.IconCloseOutline16))
						),
						h(
							'div',
							{ className: 'sk-drawerBody' },
							h(
								'div',
									{ className: 'sk-drawerRow' },
									h(
										'div',
										null,
										h('div', { className: 'sk-drawerRowLabel' }, '启用此 Skill'),
										h('div', { className: 'sk-slimNote' }, '关闭后模型在本项目不再自动调用，仍可用 /' + row.name + ' 手动调用；下一轮对话生效')
									),
									switchV1(row)
								),
							h(
								'div',
								{ className: 'sk-sec' },
								h('div', { className: 'sk-secTitle' }, '描述'),
								row.description
									? h('p', { className: 'sk-descFull' }, row.description)
									: h('p', { className: 'sk-slimNote' }, '（无描述）')
							),
							h(
								'div',
								{ className: 'sk-sec' },
								h('div', { className: 'sk-secTitle' }, '来源'),
								h('div', { className: 'sk-sourceSummary' },
									h('div', { className: 'sk-sourceCurrent' },
										eff
											? h('div', { className: 'sk-srcName' }, eff.label,
												row.specialized === true && eff.key === row.effectiveSourceKey
													? h('span', { className: 'sk-badge sk-badgeSpec' }, '项目副本')
													: null)
											: h('span', { className: 'sk-slimNote' }, '无可用来源'),
										eff ? h('span', { className: 'sk-srcMeta' }, eff.scope === 'project' ? '项目来源' : eff.scope === 'bundled' ? '内置来源' : '用户来源') : null
									),
									row.sources.length > 0
										? h('button', {
											type: 'button',
											className: 'sk-quietBtn' + (sourceOpen ? ' sk-quietBtnOn' : ''),
											'aria-expanded': sourceOpen,
											onClick: function () { setSourceOpen(!sourceOpen); }
										}, sourceOpen ? '收起' : '更改来源', h(P.IconChevronDownOutline14, { style: { transform: sourceOpen ? 'rotate(180deg)' : 'none' } }))
										: null
								),
								sourceOpen && row.sources.length > 0
									? h(
										'div',
										{ className: 'sk-srcList', role: 'radiogroup', 'aria-label': row.name + ' 的来源' },
									h('button', {
										type: 'button',
										role: 'radio',
										'aria-checked': row.sourceKey === null,
											className: 'sk-src' + (row.sourceKey === null ? ' sk-srcOn' : ''),
											disabled: !canWrite || sourceBusy === row.name,
											onClick: function () { doSource(row.name, null); }
										},
											h('span', { className: 'sk-radio' + (row.sourceKey === null ? ' sk-radioOn' : '') }),
											h(
												'span',
												{ className: 'sk-srcMain' },
												h('span', { className: 'sk-srcName' }, '默认（按优先级自动选择）'),
												h('span', { className: 'sk-srcMeta' }, defaultSrc ? '当前解析为：' + defaultSrc.label : '无可用来源')
											)
										),
										row.sources.map(function (s) {
											var on = row.sourceKey === s.key;
										return h('button', {
											type: 'button',
											key: s.key,
											role: 'radio',
											'aria-checked': on,
											className: 'sk-src' + (on ? ' sk-srcOn' : ''),
												disabled: !canWrite || s.broken === true || sourceBusy === row.name,
												title: s.broken ? '该来源格式损坏，不能选择' : undefined,
												onClick: function () { doSource(row.name, s.key); }
											},
												h('span', { className: 'sk-radio' + (on ? ' sk-radioOn' : '') }),
												h(
													'span',
													{ className: 'sk-srcMain' },
													h(
														'span',
														{ className: 'sk-srcName' },
														s.label,
														s.broken === true ? h('span', { className: 'sk-badge sk-badgeWarn' }, '格式损坏') : null,
														s.modified === true ? h('span', { className: 'sk-badge sk-badgeSpec' }, '已修改') : null,
														s.stale === true ? h('span', { className: 'sk-badge', title: '通用来源内容已变化' }, '来源有更新') : null
													),
													h('span', { className: 'sk-srcMeta' },
														s.scope === 'project' ? '项目' : s.scope === 'global' ? '其他全局（只读）' : s.scope === 'bundled' ? '内置（只读）' : '用户级',
														' · 优先级 ' + s.rank)
												)
											);
										})
									)
									: null
							),
							h(
								'div',
								{ className: 'sk-sec' },
								h('div', { className: 'sk-tagHeading' },
									h('div', { className: 'sk-secTitle' }, '标签'),
									h('span', { className: 'sk-tagScope' }, '全局共享')),
								tagValues.length > 0
									? h('div', { className: 'sk-tagList sk-tagListBare', 'aria-label': '已有标签' }, tagValues.map(function (t) {
											return h('span', { key: t, className: 'sk-tag' },
												t,
												h('button', {
													type: 'button',
													className: 'sk-tagX',
													'aria-label': '移除标签「' + t + '」',
													title: '移除标签「' + t + '」',
													disabled: !canWrite || tagBusy === true,
													onClick: function () {
														var rest = tagValues.filter(function (x) { return x !== t; });
														doTags(row, rest);
													}
												}, h(P.IconCloseOutline16, { size: 10 })));
										}))
									: null,
								h('button', {
									type: 'button',
									className: 'sk-quietBtn' + (tagComposerOpen ? ' sk-quietBtnOn' : ''),
									'aria-expanded': tagComposerOpen,
									disabled: !canWrite || tagAtLimit,
									onClick: function () { setTagDraft(''); setTagComposerOpen(!tagComposerOpen); }
								}, tagComposerOpen ? h(P.IconChevronDownOutline14, { style: { transform: 'rotate(180deg)' } }) : h(P.IconPlusOutline16), tagComposerOpen ? '收起标签输入' : '添加标签'),
								tagComposerOpen
									? h(
										'div',
										{ className: 'sk-tagPanel' },
										h('div', { className: 'sk-tagComposer' },
										h('input', {
											className: 'sk-tagInput',
											'aria-label': '新标签',
											'aria-describedby': tagHelpId,
											placeholder: tagAtLimit ? '已达到标签上限' : '输入标签',
											value: tagDraft,
											maxLength: 32,
											disabled: !canWrite || tagBusy === true || tagAtLimit,
											onChange: function (event) { setTagDraft(event.target.value); },
											onKeyDown: function (event) {
												if (event.key === 'Enter') { event.preventDefault(); commitTag(); }
											}
										}),
										h('button', {
											type: 'button',
											className: 'sk-tagAdd',
											'aria-label': '添加标签',
											disabled: !tagCanAdd,
											onClick: commitTag
										}, tagBusy ? '保存中…' : '添加')),
										h('div', {
											id: tagHelpId,
											className: 'sk-tagFoot' + ((tagAtLimit || tagDuplicate) ? ' sk-tagIssue' : ''),
											'aria-live': 'polite'
										}, h('span', null, tagIssue), h('span', null, tagValues.length + '/20 · 每个最多 32 字符'))
									)
									: null
							),
							h(
								'div',
								{ className: 'sk-adv' },
								h('button', {
									type: 'button',
									className: 'sk-advBtn',
									onClick: function () { setAdvOpen(!advOpen); }
								},
									h(P.IconChevronDownOutline14, { style: { transform: advOpen ? 'rotate(180deg)' : 'none', transition: 'transform .12s' } }),
									'更多信息'),
								advOpen
									? h(
										'div',
										{ className: 'sk-advBody' },
										h('div', null, '当前来源路径：', h('code', null, (eff && eff.path) || '—')),
										view && view.projectRoot ? h('div', null, '项目配置：', h('code', null, view.projectRoot + '/.dsh/skill-manager.json'), '（仅本机，不提交 Git）') : null,
										h('div', null, '格式：', eff ? (eff.format === 'dir' ? '目录（附属文件 ' + eff.files.length + ' 个）' : '单文件') : '—'),
										h('div', null, '更新：', row.updateInfo !== null && row.updateInfo !== undefined ? String(row.updateInfo) : '当前版本不检测远端更新'),
										h('div', null, '项目特化：V1.2 后续能力，当前版本不可用'),
										eff && Array.isArray(eff.files) && eff.files.length > 0
											? h('div', null, '附属文件：', h('code', null, eff.files.join(', ')))
											: null,
										view && view.configCorrupt === true
											? h('div', { style: { color: 'var(--dsw-alias-state-warn-primary)' } }, '注意：项目配置文件已损坏，按空配置处理（可手动删除后重建）')
											: null,
										view && view.configExisted === false
											? h('div', null, '该项目还没有配置文件；首次启停会在项目内创建 .dsh/skill-manager.json（本机私有配置，不提交 Git）')
											: null
									)
									: null
							)
						)
					);
				}

				// ── page chrome ───────────────────────────────────────────────
				var enabledCount = 0;
				if (view !== null) {
					for (var k = 0; k < view.identities.length; k += 1) {
						if (view.identities[k].enabled === true) enabledCount += 1;
					}
				}
				var totalCount = view !== null ? view.identities.length : 0;
				var disabledCount = Math.max(0, totalCount - enabledCount);
				var selectedCount = Object.keys(selectedRows).length;
				var recommendedPreset = null;
				for (var presetIndex = 0; presetIndex < presets.length; presetIndex += 1) {
					if (presets[presetIndex].defaultSlim === true) { recommendedPreset = presets[presetIndex]; break; }
				}
				if (recommendedPreset === null && presets.length > 0) recommendedPreset = presets[0];

				return h(
					'div',
					{ className: 'sk-root' },
					view && view.configCorrupt === true
					? h('div', { className: 'sk-banner sk-bannerErr', role: 'alert' },
						h('strong', null, '项目配置已损坏'),
						' .dsh/skill-manager.json 无法解析（JSON 错误）。当前按空配置展示，且所有修改被拒绝，未写入任何文件。请修复或删除该文件后重新打开本页面。')
					: view && view.configFuture === true
					? h('div', { className: 'sk-banner sk-bannerWarn', role: 'alert' },
						h('strong', null, '配置版本更高（只读）'),
						' 项目配置 apiVersion 高于当前 DSH 版本。为保护数据，本页仅可查看；请升级 DSH 后再修改。')
					: partialWarning !== null
					? h('div', { className: 'sk-banner sk-bannerWarn', role: 'alert' },
						h('span', null, partialWarning),
						h('button', { type: 'button', className: 'sk-chip', onClick: function () { setPartialWarning(null); } }, '知道了'))
					: null,
					h(
						'div',
						{ className: 'sk-content' },
						h(
							'div',
							{ className: 'sk-listcol' },
							h(
									'div',
									{ className: 'sk-projectCard' },
									h(
										'div',
										{ className: 'sk-projectIdentity' },
										h('div', { className: 'sk-projectMeta' },
											h('span', { className: 'sk-currentBadge' }, project && project.cwd === currentCwd(ctx) ? '当前项目' : '所选项目'),
											h('span', { className: 'sk-projectTitle', title: project ? project.cwd : undefined }, project ? project.title : '未选择项目')
										)
									),
									h(
										'div',
										{ className: 'sk-projectStats' },
										h('div', { className: 'sk-statValue' }, '已启用 ' + enabledCount + ' / ' + totalCount)
									),
									h(
										'div',
										{ className: 'sk-projectActions' },
										h(
											'div',
											{ style: { position: 'relative' } },
										h('button', {
											type: 'button',
												className: 'sk-quietBtn sk-projBtn' + (projMenuOpen ? ' sk-quietBtnOn' : ''),
												disabled: projects.length === 0,
												onClick: function () {
													setProjects(buildProjectOptions(ctx));
													setProjMenuOpen(!projMenuOpen);
													setTagMenuOpen(false);
													setPresetMenuOpen(false);
													setActionMenuOpen(false);
												},
												title: project ? '当前项目：' + project.cwd : '选择要管理的项目'
											}, '切换项目', h(P.IconChevronDownOutline14)),
											projMenuOpen
												? h('div', { className: 'sk-menu', style: { left: 'auto', right: 0 } },
													projects.map(function (p) {
														var isCurrent = p.cwd === currentCwd(ctx);
														return h('button', {
															type: 'button', key: p.cwd,
															className: 'sk-menuBtn' + (project && project.cwd === p.cwd ? ' sk-menuBtnActive' : ''),
															onClick: function () { chooseProject(p); }
														},
															isCurrent ? h(P.IconCheckOutline14) : h('span', { style: { width: 14, flex: 'none' } }),
															h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 } }, p.title),
															isCurrent ? h('span', { className: 'sk-menuHint' }, '当前工作区') : null);
													}),
													h('div', { className: 'sk-menuSep' }),
													h('button', { type: 'button', className: 'sk-menuBtn', onClick: function () { setProjMenuOpen(false); addLocalProject(); } },
														h(P.IconPlusOutline16), '添加本地项目…'))
												: null
											),
										h(
											'div',
											{ style: { position: 'relative' } },
											h('button', {
												type: 'button',
												className: 'sk-quietBtn' + (presetMenuOpen ? ' sk-quietBtnOn' : ''),
												'aria-expanded': presetMenuOpen,
												onClick: function () {
													setPresetMenuOpen(!presetMenuOpen);
													setProjMenuOpen(false);
													setTagMenuOpen(false);
													setActionMenuOpen(false);
												}
											}, '预设', h(P.IconChevronDownOutline14)),
											presetMenuOpen
												? h('div', { className: 'sk-menu', style: { left: 'auto', right: 0, minWidth: 180 } },
													recommendedPreset !== null
														? h('button', { type: 'button', className: 'sk-menuBtn', onClick: function () { setPresetMenuOpen(false); openPreset(recommendedPreset); } }, '应用推荐预设')
														: null,
													h('button', { type: 'button', className: 'sk-menuBtn', onClick: function () { setPresetMenuOpen(false); setSaveName(''); setSaveDesc(''); setSaveOpen(true); } }, '保存为预设'))
												: null
										)
									)
								),
							h(
								'div',
								{ className: 'sk-toolbar' },
								h(
									'div',
									{ className: 'sk-searchWrap' },
									h('span', { className: 'sk-ic' }, h(P.IconSearchOutline16)),
									h('input', {
										className: 'sk-search',
										placeholder: '搜索 Skill',
										value: search,
										onChange: function (event) { setSearch(event.target.value); setSelectedRows({}); }
									})
								),
								h(
									'div',
									{ className: 'sk-filters' },
									[['all', '全部', totalCount], ['on', '已启用', enabledCount], ['off', '未启用', disabledCount]].map(function (f) {
										return h('button', {
											type: 'button',
											key: f[0],
											className: 'sk-filterBtn' + (enableFilter === f[0] ? ' sk-filterBtnActive' : ''),
											onClick: function () { setEnableFilter(f[0]); setSelectedRows({}); }
										}, f[1], h('span', { className: 'sk-filterCount' }, f[2]));
									})
								),
								h(
									'div',
									{ style: { position: 'relative' } },
									h('button', {
										type: 'button',
										className: 'sk-quietBtn' + (tagMenuOpen || tagFilter !== null ? ' sk-quietBtnOn' : ''),
										'aria-expanded': tagMenuOpen,
										onClick: function () {
											setTagMenuOpen(!tagMenuOpen);
											setProjMenuOpen(false);
											setPresetMenuOpen(false);
											setActionMenuOpen(false);
										}
									},
										tagFilter !== null ? tagFilter : '筛选',
										h(P.IconChevronDownOutline14)),
									tagMenuOpen
										? h(
											'div',
											{ className: 'sk-menu', style: { left: 'auto', right: 0, minWidth: 180 } },
											h('button', {
												type: 'button',
												className: 'sk-menuBtn' + (tagFilter === null ? ' sk-menuBtnActive' : ''),
											onClick: function () { setTagFilter(null); setTagMenuOpen(false); setSelectedRows({}); }
											}, '全部标签'),
											((view && view.allTags) || []).map(function (t) {
												return h('button', {
													type: 'button',
													key: t,
													className: 'sk-menuBtn' + (tagFilter === t ? ' sk-menuBtnActive' : ''),
												onClick: function () { setTagFilter(t); setTagMenuOpen(false); setSelectedRows({}); }
												}, t);
											})
										)
										: null
								),
							bulkMode
								? h('label', { className: 'sk-selectVisible' },
									h('input', {
										type: 'checkbox',
										checked: allVisibleSelected,
										disabled: visibleRows.length === 0 || viewBusy === true,
										onChange: toggleVisibleSelection,
										'aria-label': allVisibleSelected ? '取消选择当前结果' : '全选当前结果'
									}),
									'全选当前结果',
									visibleRows.length > 0 ? h('span', { className: 'sk-filterCount' }, visibleRows.length) : null)
								: null,
							bulkMode
								? h('button', {
									type: 'button',
									className: 'sk-quietBtn sk-quietBtnOn',
									onClick: function () { setSelectedRows({}); setBulkMode(false); }
								}, '完成批量管理')
								: h(
									'div',
									{ style: { position: 'relative' } },
									h('button', {
										type: 'button',
										className: 'sk-quietBtn' + (actionMenuOpen ? ' sk-quietBtnOn' : ''),
										'aria-label': '更多操作',
										'aria-expanded': actionMenuOpen,
										onClick: function () {
											setActionMenuOpen(!actionMenuOpen);
											setTagMenuOpen(false);
											setProjMenuOpen(false);
											setPresetMenuOpen(false);
										}
									}, '更多', h(P.IconChevronDownOutline14)),
									actionMenuOpen
										? h('div', { className: 'sk-menu', style: { left: 'auto', right: 0, minWidth: 180 } },
											h('button', {
												type: 'button', className: 'sk-menuBtn',
												onClick: function () { setActionMenuOpen(false); setSelectedRows({}); setBulkMode(true); }
											}, '批量管理'),
											h('button', {
												type: 'button', className: 'sk-menuBtn',
												disabled: project === null || viewBusy === true || (view !== null && enabledCount === 0) || (view && (view.configCorrupt === true || view.configFuture === true)),
												onClick: function () { setActionMenuOpen(false); doSlimPreview(); }
											}, '一键精简'))
										: null
								)
							),
							bulkMode
								? h('div', { className: 'sk-batchHint', role: 'status' }, '批量管理模式：勾选 Skill 后统一启用或停用，右侧单项开关已暂时隐藏。')
								: null,
							viewError !== null ? h('p', { className: 'sk-error', role: 'alert' }, viewError) : null,
							h(
								'div',
								{ className: 'sk-list' },
								view === null && !viewError
									? h('p', { className: 'sk-empty' }, viewBusy ? '正在扫描…' : '（空）')
									: null,
							visibleRows.length === 0 && view !== null
								? h('div', { className: 'sk-empty' },
									h('div', null, search !== '' || tagFilter !== null || enableFilter !== 'all'
										? (enableFilter === 'on' && enabledCount === 0 ? '这个项目还没有启用任何 Skill' : '没有匹配的 Skill')
										: '没有发现任何 Skill'),
									h('div', { className: 'sk-emptyActions' },
										search !== '' || tagFilter !== null || enableFilter !== 'all'
											? h('button', { type: 'button', className: 'sk-chip', onClick: function () { setSearch(''); setTagFilter(null); setEnableFilter('all'); } }, '查看全部 Skill')
											: null,
										recommendedPreset !== null
											? h('button', { type: 'button', className: 'sk-chip', onClick: function () { openPreset(recommendedPreset); } }, '应用推荐预设')
											: null))
								: null,
							visibleRows.map(rowEl)
						),
						bulkMode && selectedCount > 0
							? h('div', { className: 'sk-bulkbar', role: 'region', 'aria-label': '批量操作' },
								h('strong', null, '已选择 ' + selectedCount + ' 项'),
								h('span', { className: 'sk-slimNote' }, '更改仅作用于 ' + (project ? project.title : '当前项目')),
								h('span', { className: 'sk-spacer' }),
								h('button', { type: 'button', className: 'sk-bulkPrimary', disabled: project === null || viewBusy === true || (view && (view.configCorrupt === true || view.configFuture === true)), onClick: function () { doBulk(true); } }, '在本项目启用（' + selectedCount + '）'),
								h('button', { type: 'button', className: 'sk-chip', disabled: project === null || viewBusy === true || (view && (view.configCorrupt === true || view.configFuture === true)), onClick: function () { doBulk(false); } }, '在本项目停用（' + selectedCount + '）'),
								h('button', { type: 'button', className: 'sk-chip sk-chipAdd', onClick: function () { setSelectedRows({}); } }, '清除选择'))
								: null
						),
						drawerName !== null ? drawerEl() : null
					),
					h(Modal, {
						open: presetModal !== null,
						onClose: function () { setPresetModal(null); },
						title: presetModal ? '应用预设「' + presetModal.name + '」' : '应用预设',
						closeLabel: '关闭',
						description: '预览当前项目将发生的变化，再选择替换或合并；版本与项目特化内容不会写入预设。',
						footer: h(
							'div',
							{ className: 'sk-presetFooter' },
							presetModal
								? h(React.Fragment, null,
									h('div', { className: 'sk-presetFooterLeft' },
										h('button', { type: 'button', className: 'sk-presetTextBtn', title: '设为默认精简预设', onClick: function () { setDefaultPreset(presetModal.name); } }, '设为默认'),
										h('button', { type: 'button', className: 'sk-presetTextBtn sk-presetTextDanger', onClick: function () { deletePreset(presetModal.name); } }, '删除预设')),
									h('span', { className: 'sk-spacer' }),
									h(Button, { variant: 'outline', onClick: function () { setPresetModal(null); } }, '取消'),
									h(Button, { className: 'sk-presetPrimary', disabled: presetBusy || viewBusy === true || (project !== null && presetModal.cwd !== project.cwd), onClick: applyPreset }, presetBusy ? '应用中…' : '应用（' + (presetModal.mode === 'replace' ? '替换' : '合并') + '）'))
								: null
						)
					},
						presetModal
							? h(
								'div',
								{ className: 'sk-presetApply' },
								h(
									'div',
									{ className: 'sk-presetMode', role: 'radiogroup', 'aria-label': '预设应用方式' },
									[['replace', '替换当前配置'], ['merge', '合并到当前配置']].map(function (m) {
										return h('button', {
											type: 'button',
											role: 'radio',
											'aria-checked': presetModal.mode === m[0],
											key: m[0],
											className: 'sk-presetModeBtn' + (presetModal.mode === m[0] ? ' sk-presetModeBtnOn' : ''),
											onClick: function () { switchPresetMode(m[0]); }
										}, m[1]);
									})
								),
								h('div', { className: 'sk-presetImpact', role: 'status', 'aria-live': 'polite' },
									h('span', { className: 'sk-presetImpactMain' },
										'将启用 ' + (presetModal.diff.toEnable || []).length + ' 个 Skill，停用 ' + (presetModal.diff.toDisable || []).length + ' 个'),
									h('span', { className: 'sk-presetImpactMeta' }, (presetModal.diff.sourceChanges || []).length + ' 项来源变更')),
								presetModal.desc ? h('p', { className: 'sk-slimNote' }, presetModal.desc) : null,
								h('div', { className: 'sk-presetListTitle' },
									h('span', null, '全部变更'),
									h('span', { className: 'sk-presetImpactMeta' }, '下一轮对话生效')),
								h(DiffView, { diff: presetModal.diff, showFinal: false })
							)
							: null
					),
					h(Modal, {
						open: slimModal !== null,
						onClose: function () { setSlimModal(null); },
						title: slimModal && slimModal.kind === 'preset' ? '一键精简：按预设「' + slimModal.preset + '」' : '一键精简：关闭全部启用',
						closeLabel: '关闭',
						description: slimModal && slimModal.kind === 'preset'
							? '按默认精简预设替换当前启用集合（下一轮对话生效）。'
							: '没有默认精简预设：将关闭本项目全部已启用的 Skill（仍可用 /skill-name 手动调用）。',
						footer: h(
							React.Fragment,
							null,
							h(Button, { variant: 'outline', onClick: function () { setSlimModal(null); } }, '取消'),
							h(Button, { disabled: slimBusy || viewBusy === true || (project !== null && slimModal && slimModal.cwd !== project.cwd), onClick: doSlimApply }, slimBusy ? '精简中…' : '确认精简')
						)
					},
						slimModal ? h(DiffView, { diff: slimModal.diff }) : null
					),
					h(Modal, {
						open: saveOpen,
						onClose: function () { setSaveOpen(false); },
						title: '保存为自定义预设',
						closeLabel: '关闭',
						description: '保存当前项目的启用 Skill 与所选来源，可在其他项目复用。',
						footer: h(
							'div',
							{ className: 'sk-presetFooter' },
							h('span', { className: 'sk-spacer' }),
							h(Button, { variant: 'outline', onClick: function () { setSaveOpen(false); } }, '取消'),
							h(Button, { className: 'sk-presetPrimary', disabled: presetBusy || saveName.trim() === '', onClick: savePreset }, presetBusy ? '保存中…' : '保存')
						)
					},
						h(
							'div',
							{ className: 'sk-presetSave' },
							h('label', { className: 'sk-presetField' },
								h('span', { className: 'sk-presetFieldHead' },
									h('span', null, '预设名称'),
									h('span', { className: 'sk-presetCounter' }, saveName.length + '/64')),
								h('input', {
									className: 'sk-presetInput',
									placeholder: '例如：日常研发 · 精简',
									value: saveName,
									maxLength: 64,
									onChange: function (event) { setSaveName(event.target.value); },
									onKeyDown: function (event) { if (event.key === 'Enter' && saveName.trim() !== '') savePreset(); }
								})),
							h('label', { className: 'sk-presetField' },
								h('span', { className: 'sk-presetFieldHead' },
									h('span', null, '描述（可选）'),
									h('span', { className: 'sk-presetCounter' }, saveDesc.length + '/200')),
								h('textarea', {
									className: 'sk-presetTextarea',
									placeholder: '说明适用场景、来源或使用建议',
									value: saveDesc,
									maxLength: 200,
									onChange: function (event) { setSaveDesc(event.target.value); }
								})),
							project !== null
								? h('div', { className: 'sk-presetSaveSummary' },
									h('strong', null, '将保存当前项目的 ' + enabledCount + ' 个已启用 Skill 与所选来源'),
									h('span', null, '可跨项目复用 · 不保存版本与项目特化内容'))
								: null,
							project === null
								? h('p', { className: 'sk-slimNote' }, '需要项目上下文：请先在顶部选择项目。')
								: null
						)
					)
				);
			}

			/**
			 * The SKILL tab: probes the host for the V1 (apiVersion 6)
			 * with a lightweight `capabilities` op. Hosts from the first V1
			 * release do not expose it, so an unknown op falls back to one
			 * `catalog` request; an unknown catalog means the host predates
			 * DSH-008 and the legacy section is shown instead.
			 */
			function SkillCenterV1(props) {
				var api = props.api;
				var ctx = props.ctx;
				var [probe, setProbe] = React.useState('loading'); // loading | v1 | legacy | error
				var [probeError, setProbeError] = React.useState(null);
				var [attempt, setAttempt] = React.useState(0);
				React.useEffect(function () {
					setProbe('loading');
					setProbeError(null);
					function accept(value) {
						if (value && Number(value.apiVersion) >= 6) setProbe('v1');
						else setProbe('legacy');
					}
					function reject(e) {
						var msg = String((e && e.message) || e);
						if (msg.indexOf('未知操作') !== 0) { setProbe('error'); setProbeError(msg); return; }
						apiCallAt('catalog', {}, ctx).then(
							function (value) { accept(value); },
							function (catalogError) {
								var catalogMessage = String((catalogError && catalogError.message) || catalogError);
								if (catalogMessage.indexOf('未知操作') === 0) setProbe('legacy');
								else { setProbe('error'); setProbeError(catalogMessage); }
							}
						);
					}
					apiCallAt('capabilities', {}, ctx).then(
						accept,
						function (e) {
							reject(e);
						}
					);
				}, [attempt, ctx]);
				if (probe === 'loading') {
					return h('div', { className: 'sk-root' }, h('p', { className: 'sk-empty' }, '正在加载…'));
				}
				if (probe === 'legacy') {
					return h(
						'div',
						{ className: 'smgr' },
						h('p', { className: 'sk-banner' },
							'当前 dsh web 尚未加载 DSH-008 的 host 接口（apiVersion 6）。重启 dsh web 后即可使用新版项目 SKILL 管理中心；现在显示旧版界面。'),
						h(SkillManagerSection, { api: api })
					);
				}
				if (probe === 'error') {
					return h(
						'div',
						{ className: 'sk-root' },
						h('p', { className: 'sk-error' }, '加载 SKILL 管理中心失败：' + probeError),
						h(Button, { variant: 'outline', onClick: function () { setAttempt(function (n) { return n + 1; }); } }, '重试')
					);
				}
				return h(SkillCenterV1Body, { api: api, ctx: ctx });
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
				{ id: 'skill', label: 'SKILL', desc: 'Skills 技能管理', icon: P.IconSkillOutline16 },
				{ id: 'mcp', label: 'MCP', desc: 'Model Context Protocol 服务器', soon: true, icon: P.IconLinkOutline16 },
				{ id: 'plugin', label: 'Plugin', desc: '已安装插件', soon: true, icon: P.IconCordisPluginOutline14 }
			];
			function readExtNavCollapsed() {
				try { return window.localStorage.getItem('smgr.ext.navCollapsed') === '1'; }
				catch (error) { return false; }
			}

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
				var ctx = props.ctx;
				var onClose = props.onClose;
				// Keep the latest onClose in a ref so the Esc listener is
				// registered exactly once per mount. The inline onClose prop
				// changes identity on every re-render of the sidebar entry;
				// re-registering on each change drifted this page-level
				// handler to AFTER the drawer's own Esc handler, whose React
				// close flushes synchronously — so the page handler then saw
				// no dialog left and closed the whole Extensions page.
				var onCloseRef = React.useRef(onClose);
				onCloseRef.current = onClose;
				var [tab, setTab] = React.useState('skill');
				var [navCollapsed, setNavCollapsed] = React.useState(readExtNavCollapsed);
				function toggleNav() {
					var next = !navCollapsed;
					setNavCollapsed(next);
					try { window.localStorage.setItem('smgr.ext.navCollapsed', next ? '1' : '0'); } catch (error) {}
				}
				React.useEffect(function () {
					function onKey(event) {
						if (event.key !== 'Escape') return;
						// An inner dialog (the drawer) owns Esc first.
						if (document.querySelector('[role="dialog"]') !== null) return;
						onCloseRef.current();
					}
					document.addEventListener('keydown', onKey);
					return function () { document.removeEventListener('keydown', onKey); };
				}, []);
				return h(
					'div',
					{ className: 'ext-page', role: 'region', 'aria-label': '扩展管理' },
					h(
						'header',
						{ className: 'ext-top' },
						h('div', { className: 'ext-topTitle' }, h(ExtIcon, { size: 20 }), '扩展'),
						h('span', { className: 'ext-topSub' }, '/ ' + tab.toUpperCase()),
						h('button', { type: 'button', className: 'ext-close', 'aria-label': '关闭扩展页', title: '关闭（Esc）', onClick: onClose }, '✕')
					),
					h(
						'div',
						{ className: 'ext-body' },
						h(
							'nav',
							{ className: 'ext-nav' + (navCollapsed ? ' ext-navCollapsed' : ''), 'aria-label': '扩展类型' },
							h(
								'div',
								{ className: 'ext-navHead' },
								h('span', { className: 'ext-navTitle' }, '扩展类型'),
								h('button', {
									type: 'button',
									className: 'ext-navToggle',
									'aria-label': navCollapsed ? '展开扩展类型导航' : '收起扩展类型导航',
									'aria-expanded': !navCollapsed,
									title: navCollapsed ? '展开导航' : '收起导航',
									onClick: toggleNav
								}, h(navCollapsed ? P.IconChevronRightOutline14 : P.IconChevronLeftOutline14))
							),
							h(
								'div',
								{ className: 'ext-navList' },
								EXT_TABS.map(function (t) {
									return h(
										'button',
										{
											key: t.id,
											type: 'button',
											className: 'ext-navBtn' + (tab === t.id ? ' ext-navBtnActive' : ''),
											'aria-label': t.label + (t.soon ? '（建设中）' : ''),
											title: navCollapsed ? t.label + (t.soon ? '（建设中）' : '') : undefined,
											onClick: function () { setTab(t.id); }
										},
										h('span', { className: 'ext-navIcon' }, h(t.icon),
											navCollapsed && t.soon ? h('span', { className: 'ext-navSoonDot', 'aria-hidden': true }) : null),
										h(
											'span',
											{ className: 'ext-navCopy' },
											h(
												'span',
												{ className: 'ext-navLabel' },
												t.label,
												t.soon ? h('span', { className: 'ext-soon' }, '建设中') : null
											)
										)
									);
								})
							)
						),
						h(
							'main',
							{ className: 'ext-main' },
							tab === 'skill'
								? h(SkillCenterV1, { api: api, ctx: ctx })
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
										body: '展示已安装到 web profile 的 DSH 插件（如 skill-manager）：名称、版本、来源与启用状态。',
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
					open ? h(ExtensionsPage, { api: api, ctx: props.ctx, onClose: function () { setOpen(false); } }) : null
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
									},
									// V1 (DSH-008): the live client context so the
									// skill center can read sessions/workspaces.
									ctx: ctx
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
