/**
 * dsh-skill-manager — client half (browser bundle).
 * build: 26
 *
 * Served verbatim at /plugins/dsh-skill-manager/client.js by the client
 * module system; a classic script that registers its lazy-CJS factory on
 * window.__ModuleLoader__. The factory requires only shell seed words
 * (react, @deepseek-ai/dsh-client-ui-primitives) and contributes the SKILL
 * page to the `extension.manager.section` Slot owned by
 * dsh-extension-manager.
 *
 * build 26: remove the obsolete apiVersion <6 fallback page and its package /
 * legacy list UI. The current project center is the only Client page; an old
 * Host now gets a clear upgrade state while the Host API keeps its legacy
 * operations for wire compatibility.
 * build 13 (DSH-008): project-management UI adds a persistent project
 * context card, per-state counts/grouping, select-visible bulk actions,
 * current-workspace-safe defaults, derived drawer/tag state, responsive
 * drawer behavior, and accessible switch/radio/detail controls. The SKILL
 * management view is served by the host's apiVersion 6
 * ops (catalog / setEnabled / setMany / setSource / setTags / presets.* /
 * slim.*): project selector over DSH workspaces, per-project enable
 * state, merged same-name identities with source selection, global tags,
 * presets with replace/merge preview, and 一键精简. When the running host
 * predates apiVersion 6, the page shows an explicit upgrade state.
 * build 17: the project list no longer regroups rows by enabled state.
 * Catalog order and scroll context stay stable while the switch and optional
 * state filters communicate enabled status.
 * build 18: the redundant unified-library sub-page is removed; merged source
 * selection remains in the project Skill drawer. The drawer now overlays the
 * list at every desktop width without reflowing it, and the SKILL / MCP /
 * Plugin navigation can collapse to an icon rail with browser-local state.
 * build 19: visual-noise reduction compresses project context and navigation,
 * moves presets and infrequent batch actions into menus, shows only the first
 * description sentence in stable catalog rows, and defers source choices and
 * technical metadata inside the overlay drawer until explicitly requested.
 * build 20: a single toggle updates its row and project count immediately,
 * shows a quiet pending label while persistence finishes, and restores the
 * exact previous row if the Host rejects or rolls back the mutation.
 * build 21: enabled rows no longer receive a persistent blue background tint;
 * the switch remains the sole inline enabled-state accent.
 * build 21: the first catalog load gets a centered Skill scan state with a
 * restrained pulse/sweep animation, descriptive status copy, and a
 * prefers-reduced-motion static fallback.
 * build 22: the generic sidebar entry, full-page shell, and MCP / Plugin
 * placeholders move to dsh-extension-manager. This plugin now owns only the
 * SKILL section and its `/api/skill-manager` business API.
 * build 24: the Skill section adopts the MCP / Plugin page chrome: a 980px
 * centered frame, shared title and tab rhythm, compact project summary and
 * toolbar, flat 72px list rows, and fixed 400px detail drawers.
 * build 25: arbitrary public GitHub repository install with Host-side
 * discovery/preview/provenance, plus explicit install-vs-runtime safety copy.
 *
 * TypeScript source compiled to a classic browser script — no JSX/imports.
 */
// The classic browser loader and Host JSON endpoint are intentionally
// untyped runtime boundaries; UI state narrows their values at use sites.
type DynamicValue = any;
type ApiPayload = Record<string, DynamicValue>;

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
			var existingStyle = document.querySelector<HTMLStyleElement>('style[data-plugin="dsh-skill-manager"]');
			var style = existingStyle || document.createElement('style');
			style.setAttribute('data-plugin', 'dsh-skill-manager');
			style.textContent = [
				'.sk-switch{appearance:none;position:relative;flex:none;width:44px;height:24px;border-radius:999px;border:0;background:color-mix(in srgb,var(--dsw-alias-label-primary) 20%,var(--dsw-alias-bg-module-platform));cursor:pointer;padding:0;transition:background-color .25s ease}',
				'.sk-switchOn{background:var(--dsw-alias-state-business-primary)}',
				'.sk-switchKnob{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .3s cubic-bezier(.34,1.56,.64,1);pointer-events:none}',
				'.sk-switchOn .sk-switchKnob{transform:translateX(20px)}',
				'.sk-switch:active .sk-switchKnob,.sk-switchOn:active .sk-switchKnob{transition-duration:.12s}',
				'.sk-switch:active .sk-switchKnob{transform:scaleX(1.12)}',
				'.sk-switchOn:active .sk-switchKnob{transform:translateX(20px) scaleX(1.12)}',
				'.sk-switchDim{opacity:.5;cursor:not-allowed}',
				'.sk-switch:focus-visible{outline:2px solid color-mix(in srgb,var(--dsw-alias-state-business-primary) 55%,transparent);outline-offset:2px}',
				'@media (prefers-reduced-motion:reduce){.sk-switch,.sk-switchKnob{transition:none}}',
				// ── DSH-008 V1: per-project SKILL management ─────────────────
				'.sk-root{display:flex;flex-direction:column;flex:1;min-height:0;height:100%;width:100%;max-width:1180px;margin:0 auto;color:var(--dsw-alias-label-primary)}',
				'.sk-content{position:relative;isolation:isolate;display:flex;flex:1;min-height:0}',
				'.sk-listcol{flex:1;min-width:0;display:flex;flex-direction:column}',
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
				'.sk-rowActive{background:var(--dsw-alias-interactive-bg-hover-solid)}',
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
				'.sk-saving{font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}',
				'.sk-empty{margin:0;font-size:12px;color:var(--dsw-alias-label-quaternary);padding:24px 4px}',
				'.sk-findingState{flex:1;min-height:220px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;padding:52px 24px;text-align:center}',
				'.sk-findingVisual{position:relative;width:216px;height:132px;color:var(--dsw-alias-label-secondary)}',
				'.sk-findingCore{position:absolute;z-index:2;left:50%;top:56%;width:44px;height:44px;display:grid;place-items:center;transform:translate(-50%,-50%);color:var(--dsw-alias-label-primary);opacity:.78;animation:sk-findingFocus 2.4s linear infinite}',
				'.sk-findingCore svg{width:40px;height:40px}',
				'.sk-findingParticle{position:absolute;z-index:1;display:block;width:6px;height:6px;border-radius:50%;background:color-mix(in srgb,var(--dsw-alias-label-secondary) 70%,transparent);opacity:0;will-change:transform,opacity}',
				'.sk-findingParticleNorth{left:calc(50% - 3px);top:3px;width:7px;height:7px;animation:sk-findingNorth 2.4s cubic-bezier(.42,0,.18,1) infinite}',
				'.sk-findingParticleEast{left:calc(100% - 22px);top:48px;width:7px;height:7px;background:var(--dsw-static-blue-500);animation:sk-findingEast 2.4s cubic-bezier(.42,0,.18,1) infinite}',
				'.sk-findingParticleSouthWest{left:22px;top:105px;animation:sk-findingSouthWest 2.4s cubic-bezier(.42,0,.18,1) infinite}',
				'.sk-findingLabel{position:relative;display:inline-block;font-family:"Inter Variable","Inter","Segoe UI Variable Text","Segoe UI",system-ui,sans-serif;font-size:14px;line-height:20px;font-weight:450;font-variation-settings:"wght" 470;letter-spacing:.026em;color:color-mix(in srgb,var(--dsw-alias-label-secondary) 72%,transparent);filter:blur(.2px);white-space:nowrap}',
				'.sk-findingLabel:before{content:attr(data-text);position:absolute;inset:0;color:color-mix(in srgb,var(--dsw-alias-label-primary) 88%,var(--dsw-alias-label-secondary));filter:none;clip-path:inset(0 100% 0 0);animation:sk-findingTextFocus 2.4s cubic-bezier(.4,0,.2,1) infinite}',
				'.sk-findingCursor{position:absolute;left:0;bottom:-6px;width:10px;height:1.25px;border-radius:999px;background:var(--dsw-static-blue-500);opacity:0;animation:sk-findingCursor 2.4s cubic-bezier(.4,0,.2,1) infinite}',
				'@keyframes sk-findingNorth{0%{transform:translate3d(0,-5px,0) scale(.78);opacity:.24}9%{opacity:.66}20%{transform:translate3d(4px,28px,0) scale(1);opacity:.72}30%{transform:translate3d(1px,57px,0) scale(.64);opacity:.48}34%,94%{transform:translate3d(0,69px,0) scale(.12);opacity:0}95%{transform:translate3d(0,-5px,0) scale(.78);opacity:0}100%{transform:translate3d(0,-5px,0) scale(.78);opacity:.24}}',
				'@keyframes sk-findingEast{0%,7%{transform:translate3d(7px,-2px,0) scale(.8);opacity:.22}16%{opacity:.94}27%{transform:translate3d(-46px,7px,0) scale(1);opacity:.96}38%{transform:translate3d(-76px,18px,0) scale(.62);opacity:.6}42%,94%{transform:translate3d(-87px,22px,0) scale(.12);opacity:0}95%{transform:translate3d(7px,-2px,0) scale(.8);opacity:0}100%{transform:translate3d(7px,-2px,0) scale(.8);opacity:.22}}',
				'@keyframes sk-findingSouthWest{0%,15%{transform:translate3d(-6px,5px,0) scale(.76);opacity:.18}24%{opacity:.58}36%{transform:translate3d(48px,-14px,0) scale(1);opacity:.64}48%{transform:translate3d(76px,-25px,0) scale(.6);opacity:.44}52%,94%{transform:translate3d(86px,-31px,0) scale(.12);opacity:0}95%{transform:translate3d(-6px,5px,0) scale(.76);opacity:0}100%{transform:translate3d(-6px,5px,0) scale(.76);opacity:.18}}',
				'@keyframes sk-findingFocus{0%,25%,35%,44%,56%,100%{opacity:.78}30%,40%,50%{opacity:1}}',
				'@keyframes sk-findingTextFocus{0%,4%{clip-path:inset(0 100% 0 0);opacity:0}8%{opacity:1}52%,86%{clip-path:inset(0 0 0 0);opacity:1}92%,100%{clip-path:inset(0 0 0 0);opacity:0}}',
				'@keyframes sk-findingCursor{0%,4%{left:0;opacity:0}8%{left:0;opacity:.92}52%{left:calc(100% - 10px);opacity:.92}61%,100%{left:calc(100% - 10px);opacity:0}}',
				'@media (prefers-reduced-motion: reduce){.sk-findingCore,.sk-findingParticle,.sk-findingLabel:before,.sk-findingCursor{animation:none}.sk-findingCore{opacity:1;color:var(--dsw-alias-label-primary)}.sk-findingParticle{display:none}.sk-findingParticleEast{display:block;opacity:.9;transform:translate3d(-24px,10px,0)}.sk-findingLabel{color:transparent;filter:none}.sk-findingLabel:before{clip-path:inset(0);opacity:1}.sk-findingCursor{left:calc(100% - 10px);opacity:.7}}',
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
				// marketplace — same title / tab / row / drawer language as MCP and Plugin
				'.sk-head{display:flex;align-items:baseline;gap:10px;flex:none;padding:2px 0 10px}',
				'.sk-headTitle{margin:0;font-size:18px;font-weight:600}',
				'.sk-tabs{display:flex;align-items:center;gap:2px;border-bottom:1px solid var(--dsw-alias-border-l2);flex:none}',
				'.sk-tab{appearance:none;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;font:inherit;font-size:13px;line-height:1.4;padding:8px 0 9px}',
				'.sk-tab:hover{color:var(--dsw-alias-label-primary)}',
				'.sk-tabActive{border-bottom-color:var(--dsw-alias-label-primary);color:var(--dsw-alias-label-primary);font-weight:600}',
				'.sk-primaryTabs{gap:28px}',
				'.sk-marketLayout{display:flex;flex:1;min-height:0;min-width:0}',
				'.sk-marketListCol{display:flex;flex:1;min-width:0;min-height:0;flex-direction:column}',
				'.sk-marketToolbar{display:flex;align-items:center;gap:8px;padding:14px 0 9px;flex:none;flex-wrap:wrap}',
				'.sk-marketProjectPicker{position:relative;flex:none}',
				'.sk-marketSearch{min-width:180px}',
				'.sk-marketHelper{flex:none;margin:0 0 9px;color:var(--dsw-alias-label-quaternary);font-size:11px;line-height:1.5}',
				'.sk-marketNotice{flex:none;margin:0 0 9px;padding:7px 9px;border:1px solid color-mix(in srgb,var(--dsw-static-blue-500) 35%,var(--dsw-alias-border-l2));border-radius:8px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5}',
				'.sk-marketList{display:flex;flex:1;min-height:0;overflow-y:auto;flex-direction:column;padding:7px 0 26px}',
				'.sk-marketRow{appearance:none;box-sizing:border-box;width:100%;min-height:88px;border:0;border-top:1px solid var(--dsw-alias-border-l2);background:transparent;color:inherit;text-align:left;font:inherit;padding:14px 12px;display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:16px;align-items:center;cursor:pointer}',
				'.sk-marketRow:last-child{border-bottom:1px solid var(--dsw-alias-border-l2)}',
				'.sk-marketRow:hover{background:var(--dsw-alias-interactive-bg-hover)}',
				'.sk-marketRow:focus-visible{outline:1px solid var(--dsw-static-blue-500);outline-offset:-1px}',
				'.sk-marketRowActive{background:color-mix(in srgb,var(--dsw-static-blue-500) 7%,var(--dsw-alias-bg-module-platform))}',
				'.sk-marketMain{display:flex;align-items:center;gap:14px;min-width:0}',
				'.sk-marketIcon,.sk-marketFallback{flex:none;width:40px;height:40px;border-radius:10px;object-fit:cover}',
				'.sk-marketIcon{background:var(--dsw-alias-fill-tsp-secondary)}',
				'.sk-marketFallback{display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}',
				'.sk-marketCopy{display:flex;flex-direction:column;min-width:0}',
				'.sk-marketTitle{font-size:14px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
				'.sk-marketDesc{display:block;margin-top:5px;color:var(--dsw-alias-label-tertiary);line-height:1.45;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
				'.sk-marketMeta{display:block;margin-top:5px;color:var(--dsw-alias-label-quaternary);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
				'.sk-marketSide{display:flex;align-items:center;gap:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap}',
				'.sk-marketStatus{font-size:12px;color:var(--dsw-alias-label-tertiary)}',
				'.sk-marketStatus-update-available{color:var(--dsw-alias-state-error-primary)}',
				'.sk-marketStatus-modified,.sk-marketStatus-conflict{color:var(--dsw-alias-state-warn-primary)}',
				'.sk-marketLoadError{padding:10px 0}',
				'.sk-marketDrawer{width:400px;max-width:46%;position:relative}',
				'.sk-marketDrawerIdentity{display:flex;flex:1;min-width:0;flex-direction:column;gap:5px}',
				'.sk-marketLink{display:inline-flex;align-items:center;gap:4px;max-width:100%;color:var(--dsw-static-blue-500);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-decoration:none}',
				'.sk-marketLink:hover{text-decoration:underline}',
				'.sk-marketFacts{display:grid;grid-template-columns:1fr 1fr;gap:7px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.45}',
				'.sk-marketState{display:flex;align-items:center;gap:7px;color:var(--dsw-alias-label-secondary);font-size:12px}',
				'.sk-marketFiles,.sk-marketChecks{display:flex;flex-direction:column;gap:5px;color:var(--dsw-alias-label-tertiary);font-size:11.5px;line-height:1.45}',
				'.sk-marketFiles code{overflow-wrap:anywhere;color:var(--dsw-alias-label-secondary)}',
				'.sk-marketChecks span{color:var(--dsw-alias-label-secondary)}',
				'.sk-marketMetaNotice{margin:0;padding:7px 9px;border-radius:7px;background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 12%,transparent);color:var(--dsw-alias-label-secondary);font-size:11.5px;line-height:1.5}',
				'.sk-marketFoot{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex:none;position:sticky;bottom:0;padding:10px 16px;border-top:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);z-index:2}',
				'.sk-marketPreview{display:flex;flex-direction:column;gap:14px;max-height:360px;overflow-y:auto}',
				'.sk-marketPreviewSummary{display:flex;flex-direction:column;gap:5px;font-size:12px;line-height:1.5}',
				'.sk-marketPreviewSummary span{overflow-wrap:anywhere;color:var(--dsw-alias-label-tertiary)}',
				'@media(max-width:680px){.sk-marketDrawer{position:absolute;inset:0 0 0 auto;width:min(400px,100%);max-width:none;z-index:20}}',
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
				'@media(max-width:900px){.sk-toolbar{align-items:stretch}.sk-searchWrap{flex-basis:100%}.sk-bulkbar{flex-wrap:wrap}}',
				'@media(max-width:680px){.sk-projectPath{max-width:75vw}}',
					'@media(max-width:600px){[role="dialog"]:has(.sk-presetApply),[role="dialog"]:has(.sk-presetSave){width:calc(100vw - 24px)}.sk-presetApply,.sk-presetSave{width:auto}.sk-presetMode{grid-template-columns:1fr}.sk-presetImpact{align-items:flex-start;flex-direction:column;gap:3px}.sk-presetFooter{flex-wrap:wrap}.sk-presetFooterLeft{width:100%}}',
					'@media(max-width:480px){.sk-filterBtn{padding:6px 8px}}',
					// build 24: use the same page chrome as MCP / Plugin. Skill keeps
					// its project controls and richer row semantics, but shares the
					// centered width, compact toolbar, flat list rhythm, and overlay
					// drawer geometry of the sibling managers.
					'.sk-root{box-sizing:border-box;height:100%;min-height:0;max-width:980px;margin:0 auto;font-size:13px}',
					'.sk-head{align-items:center;padding:6px 8px 16px}',
					'.sk-headTitle{font-size:22px;line-height:1.25;font-weight:650;letter-spacing:-.02em}',
					'.sk-headContext{margin-left:auto;display:flex;align-items:center;justify-content:flex-end;gap:6px;min-width:0}',
					'.sk-contextAnchor{position:relative;min-width:0}',
					'.sk-contextProjectBtn{box-sizing:border-box;height:38px;max-width:420px;padding:0 10px;border-radius:8px;background:transparent}',
					'.sk-contextCopy{display:flex;align-items:baseline;gap:6px;min-width:0}',
					'.sk-contextEyebrow{color:var(--dsw-alias-label-tertiary);font-size:11px;font-weight:500;white-space:nowrap}',
					'.sk-projectTitle{max-width:190px;font-size:13px;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
					'.sk-contextStat{padding-left:7px;border-left:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary);font-size:11px;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap}',
					'.sk-tabs{height:40px;align-items:flex-end;gap:28px;padding:0 8px}',
					'.sk-primaryTabs{gap:28px}',
					'.sk-tab{height:40px;padding:0 1px;display:inline-flex;align-items:center;font-size:13px;line-height:normal;font-weight:500}',
					'.sk-tabActive{border-bottom-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);font-weight:600}',
					'.sk-toolbar{margin:0;padding:16px 8px 8px;gap:10px}',
					'.sk-searchWrap{box-sizing:border-box;height:38px;min-width:0;background:var(--dsw-alias-bg-module-platform);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;gap:8px;padding:0 11px;color:var(--dsw-alias-label-tertiary)}',
					'.sk-searchWrap>.sk-ic{position:static;left:auto;color:var(--dsw-alias-label-tertiary);pointer-events:none}',
					'.sk-search{box-sizing:border-box;height:36px;min-width:0;flex:1;width:auto;background:transparent;border:0;border-radius:0;padding:0;color:var(--dsw-alias-label-primary)}',
					'.sk-search:focus{outline:0}',
					'.sk-searchWrap:focus-within{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 1px var(--dsw-alias-brand-primary)}',
					'.sk-filters{height:38px;align-items:stretch}',
					'.sk-filterBtn{height:38px;padding:0 10px}',
					'.sk-quietBtn{height:38px;box-sizing:border-box;padding:0 10px}',
					'.sk-list{gap:0;padding:0 8px 32px}',
					'.sk-row{box-sizing:border-box;min-height:72px;border:0;border-top:1px solid var(--dsw-alias-border-l2);border-radius:0;padding:13px 10px}',
					'.sk-list>.sk-row:last-child{border-bottom:1px solid var(--dsw-alias-border-l2)}',
					'.sk-row:hover{background:var(--dsw-alias-interactive-bg-hover)}',
					'.sk-rowActive{background:var(--dsw-alias-interactive-bg-hover)}',
					'.sk-rowName{font-size:13.5px}',
					'.sk-rowDesc{margin-top:4px;line-height:1.45}',
					'.sk-rowSide{gap:12px}',
					'.sk-marketToolbar{padding:16px 8px 8px;gap:10px}',
					'.sk-marketSearch{min-width:180px}',
					'.sk-marketList{padding:0 8px 32px}',
					'.sk-marketRow{min-height:72px;padding:13px 10px;column-gap:14px}',
					'.sk-marketMain{align-items:flex-start;gap:11px}',
					'.sk-marketIcon,.sk-marketFallback{width:28px;height:28px;border-radius:8px}',
					'.sk-marketFallback{margin-top:1px}',
					'.sk-marketTitle{font-size:13.5px;font-weight:600}',
					'.sk-marketDesc{margin-top:4px;line-height:1.45}',
					'.sk-marketMeta{margin-top:5px;font-size:11.5px}',
					'.sk-marketSide{gap:12px}',
					'.sk-drawer{position:fixed;top:66px;right:0;bottom:0;left:auto;box-sizing:border-box;width:400px;max-width:calc(100vw - 64px);z-index:230;box-shadow:-10px 0 24px rgba(16,24,40,.06)}',
					'.sk-marketDrawer{position:fixed;top:66px;right:0;bottom:0;left:auto;width:400px;max-width:calc(100vw - 64px);z-index:230}',
					'.sk-drawerHead{padding:24px 24px 16px;border-bottom:1px solid var(--dsw-alias-border-l2)}',
					'.sk-drawerName{font-size:19px;font-weight:650}',
					'.sk-drawerBody{padding:0 24px 24px}',
					'.sk-marketFoot{padding:16px 24px}',
					'@media(max-width:680px){.sk-root{margin:0}.sk-head,.sk-tabs,.sk-toolbar,.sk-list,.sk-marketList{padding-left:0;padding-right:0}.sk-head{align-items:flex-start;flex-wrap:wrap}.sk-headContext{width:100%}.sk-contextProject{flex:1;min-width:0}.sk-contextProjectBtn{width:100%;max-width:none}.sk-toolbar{flex-wrap:wrap}.sk-searchWrap{flex-basis:100%}.sk-drawer,.sk-marketDrawer{top:61px;width:calc(100vw - 12px);max-width:none}}',
					'@media(max-width:480px){.sk-contextEyebrow{display:none}.sk-contextStat{font-size:10px}.sk-projectTitle{max-width:42vw}}'
				].join('');
			if (!existingStyle) document.head.appendChild(style);

			function sourceIsBroken(value: unknown): boolean {
				return value === true || typeof value === 'string' && value.trim() !== '';
			}

			// ── host API ──────────────────────────────────────────────────────
			/** The cwd of the session this page is showing, or undefined. */
			function currentCwd(ctx: ClientContext): string | undefined {
				try {
					var sessions = ctx.get('sessions') as DynamicValue;
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
			function firstSentence(text: unknown): string {
				var value = String(text || '').replace(/\s+/g, ' ').trim();
				if (value === '') return '';
				for (var i = 0; i < value.length; i += 1) {
					var ch = value[i];
					var isBoundary = ch === '。' || ch === '！' || ch === '？' || ch === '!' || ch === '?';
					if (ch === '.') {
						var before = value[i - 1] || '';
						var after = value[i + 1] || '';
						var token = value.slice(0, i + 1).split(' ').pop()!.toLowerCase();
						var abbreviation = /^(?:e\.g\.|i\.e\.|etc\.|vs\.|mr\.|mrs\.|ms\.|dr\.)$/.test(token);
						isBoundary = !abbreviation && !(/[0-9]/.test(before) && /[0-9]/.test(after)) && (after === '' || /\s|[\"'”’）\]]/.test(after));
					}
					if (!isBoundary) continue;
					var end = i + 1;
					while (end < value.length && /[\"'”’）\]]/.test(value[end]!)) end += 1;
					return value.slice(0, end);
				}
				return value;
			}

			/**
			 * V1 fetch helper. It only pins body.cwd from the current session when
			 * the caller did not set it (project ops pass the selected project's cwd
			 * explicitly).
			 */
			function apiCallAt(op: string, payload: ApiPayload | undefined, ctx: ClientContext): Promise<DynamicValue> {
				var body: ApiPayload = Object.assign({ op: op }, payload || {});
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
			function baseName(p: unknown): string {
				if (typeof p !== 'string' || p === '') return '';
				var parts = p.replace(/\\/g, '/').split('/').filter(Boolean);
				return parts.length === 0 ? p : parts[parts.length - 1]!;
			}
			// ── DSH-008 V1: per-project SKILL management ─────────────────
			/** Build the project options: current session workspace + DSH workspaces. */
			function buildProjectOptions(ctx: ClientContext): DynamicValue[] {
				var out: DynamicValue[] = [];
				var seen: Record<string, boolean> = {};
				function push(cwd: unknown, title: unknown, kind: string): void {
					if (typeof cwd !== 'string' || cwd === '' || seen[cwd] === true) return;
					seen[cwd] = true;
					out.push({ cwd: cwd, title: (typeof title === 'string' && title !== '') ? title : (baseName(cwd) || cwd), kind: kind });
				}
				// Current workspace title = its name (the menu adds a
				// "当前工作区" hint beside it), matching the visual target.
				var cur = currentCwd(ctx);
				push(cur, baseName(cur) || cur, 'current');
				try {
					var ws = ctx.get('workspaces') as DynamicValue;
					var snap = ws && ws.list && typeof ws.list.getSnapshot === 'function' ? ws.list.getSnapshot() : null;
					if (snap && Array.isArray(snap.items)) {
						var items = snap.items.slice().sort(function (a: DynamicValue, b: DynamicValue) {
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
			function DiffView(props: DynamicValue) {
				var diff = (props && props.diff) || {};
				var groups: React.ReactNode[] = [];
				function group(title: string, key: string, values: DynamicValue[], renderRow: (value: DynamicValue) => React.ReactNode): void {
					if (!Array.isArray(values) || values.length === 0) return;
					groups.push(h('section', { key: key, className: 'sk-diffGroup', 'aria-label': title },
						h('div', { className: 'sk-diffGroupHead' }, title, h('span', { className: 'sk-diffGroupCount' }, String(values.length))),
						values.map(renderRow)));
				}
				group('将启用', 'enable', diff.toEnable || [], function (n: string) {
					return h('div', { key: 'e' + n, className: 'sk-diffRow' },
						h('span', { className: 'sk-diffName' }, n),
						h('span', { className: 'sk-diffState sk-diffStateAdd' }, '启用'));
				});
				group('将停用', 'disable', diff.toDisable || [], function (n: string) {
					return h('div', { key: 'd' + n, className: 'sk-diffRow' },
						h('span', { className: 'sk-diffName' }, n),
						h('span', { className: 'sk-diffState sk-diffStateDel' }, '停用'));
				});
				group('来源变更', 'source', diff.sourceChanges || [], function (c: DynamicValue) {
					return h('div', { key: 's' + c.name, className: 'sk-diffRow' },
						h('span', { className: 'sk-diffName' }, c.name),
						h('span', { className: 'sk-diffMeta' }, (c.from || '默认') + ' → ' + (c.to || '默认')));
				});
				if (groups.length === 0) groups.push(h('p', { key: 'none', className: 'sk-slimNote' }, '没有变化：当前配置已与该预设一致'));
				if (!props || props.showFinal !== false) groups.push(h('p', { key: 'final', className: 'sk-slimNote' },
					'应用后启用 ' + (diff.finalEnabled || []).length + ' 个 Skill；下一轮对话生效，无需重启'));
				return h('div', { className: 'sk-modalDiff' }, groups);
			}
			function MarketIcon(props: DynamicValue) {
				var [failed, setFailed] = React.useState(false);
				if (props && props.src && !failed) {
					return h('img', {
						className: 'sk-marketIcon',
						src: props.src,
						alt: '',
						'aria-hidden': true,
						onError: function () { setFailed(true); }
					});
				}
				return h('span', { className: 'sk-marketFallback', 'aria-hidden': true }, h(P.IconSkillOutline16, { size: 19 }));
			}
			function marketStatusLabel(status: DynamicValue): string {
			if (status === 'installed') return '已安装';
			if (status === 'update-available') return '可更新';
			if (status === 'modified') return '本地已修改';
			if (status === 'conflict') return '路径冲突';
			if (status === 'project-required') return '需选择项目';
			return '未安装';
		}
			function SkillMarketplacePage(props: DynamicValue) {
				var ctx = props.ctx;
				var project = props.project;
				var projects: DynamicValue[] = props.projects || [];
				var [items, setItems] = React.useState<DynamicValue[]>([]);
				var [loaded, setLoaded] = React.useState(false);
				var [loading, setLoading] = React.useState(false);
				var [error, setError] = React.useState<string | null>(null);
				var [marketWarning, setMarketWarning] = React.useState<string | null>(null);
				var [query, setQuery] = React.useState('');
				var [selected, setSelected] = React.useState<DynamicValue>(null);
				var [detail, setDetail] = React.useState<DynamicValue>(null);
				var [detailLoading, setDetailLoading] = React.useState(false);
				var [preview, setPreview] = React.useState<DynamicValue>(null);
				var [previewLoading, setPreviewLoading] = React.useState(false);
				var [busy, setBusy] = React.useState(false);
				var [projectMenuOpen, setProjectMenuOpen] = React.useState(false);
				var [message, setMessage] = React.useState<string | null>(null);
				var [attempt, setAttempt] = React.useState(0);
				var [githubOpen, setGithubOpen] = React.useState(false);
				var [githubUrl, setGithubUrl] = React.useState('');
				var [githubInfo, setGithubInfo] = React.useState<DynamicValue>(null);
				var [githubPath, setGithubPath] = React.useState('');
				var [githubPreview, setGithubPreview] = React.useState<DynamicValue>(null);
				var [githubBusy, setGithubBusy] = React.useState(false);
				var [githubError, setGithubError] = React.useState<string | null>(null);

				function loadMarket(force: boolean) {
					setLoading(true);
					setError(null);
					return apiCallAt('marketplace', { cwd: project ? project.cwd : undefined, force: force === true }, ctx).then(
						function (value: DynamicValue) {
							var next = Array.isArray(value && value.items) ? value.items : [];
							setItems(next);
							setMarketWarning(value && value.warning ? String(value.warning) : null);
							setLoaded(true);
							setSelected(function (current: DynamicValue) { return current ? (next.find(function (item: DynamicValue) { return item.id === current.id; }) || current) : null; });
						},
						function (reason: DynamicValue) { setError(String((reason && reason.message) || reason)); }
					).finally(function () { setLoading(false); });
				}
				React.useEffect(function () {
					setLoaded(false);
					setSelected(null);
					setDetail(null);
					void loadMarket(false);
				}, [project ? project.cwd : '', attempt]);
				React.useEffect(function () {
					function onKey(event: DynamicValue) {
						if (event.key !== 'Escape') return;
						if (preview !== null) return;
						if (selected !== null) { setSelected(null); setDetail(null); }
					}
					document.addEventListener('keydown', onKey);
					return function () { document.removeEventListener('keydown', onKey); };
				}, [preview, selected]);

				function openItem(item: DynamicValue) {
					setSelected(item);
					setDetail(null);
					setDetailLoading(true);
					apiCallAt('marketplace.detail', { cwd: project ? project.cwd : undefined, id: item.id }, ctx).then(
						function (value: DynamicValue) { setDetail(value); },
						function (reason: DynamicValue) { setDetail({ metadataError: String((reason && reason.message) || reason), id: item.id, name: item.name, repository: item.repository, description: item.description, status: item.status }); }
					).finally(function () { setDetailLoading(false); });
				}
				function openPreview() {
					if (selected === null) return;
					if (project === null) { setMessage('请先选择安装目标项目'); return; }
					setMessage(null);
					setPreviewLoading(true);
					apiCallAt('marketplace.preview', { cwd: project.cwd, id: selected.id }, ctx).then(
						function (value: DynamicValue) { setPreview(value); },
						function (reason: DynamicValue) { setMessage(String((reason && reason.message) || reason)); }
					).finally(function () { setPreviewLoading(false); });
				}
				function installPreview() {
					if (preview === null || !preview.canInstall || selected === null || project === null || busy) return;
					setBusy(true);
					apiCallAt('marketplace.install', { cwd: project.cwd, id: selected.id }, ctx).then(
						function () {
							setPreview(null);
							setMessage('已安装到当前项目，默认停用；可在「本地 Skill」中启用。');
							void loadMarket(true);
							if (typeof props.onInstalled === 'function') props.onInstalled();
						},
						function (reason: DynamicValue) { setMessage(String((reason && reason.message) || reason)); }
					).finally(function () { setBusy(false); });
				}
				function inspectGithub() {
					if (githubUrl.trim() === '' || githubBusy) return;
					setGithubBusy(true); setGithubError(null); setGithubInfo(null); setGithubPreview(null);
					apiCallAt('github.inspect', { url: githubUrl.trim() }, ctx).then(
						function (value: DynamicValue) {
							setGithubInfo(value);
							var candidates = Array.isArray(value && value.candidates) ? value.candidates : [];
							setGithubPath(value && value.requestedPath ? value.requestedPath : candidates.length === 1 ? candidates[0].path : '');
						},
						function (reason: DynamicValue) { setGithubError(String((reason && reason.message) || reason)); }
					).finally(function () { setGithubBusy(false); });
				}
				function previewGithub() {
					if (project === null) { setGithubError('请先选择安装目标项目'); return; }
					if (githubPath === '' || githubBusy) return;
					setGithubBusy(true); setGithubError(null);
					apiCallAt('github.preview', { cwd: project.cwd, url: githubUrl.trim(), path: githubPath }, ctx).then(
						function (value: DynamicValue) { setGithubPreview(value); },
						function (reason: DynamicValue) { setGithubError(String((reason && reason.message) || reason)); }
					).finally(function () { setGithubBusy(false); });
				}
				function installGithub() {
					if (project === null || githubPreview === null || !githubPreview.canInstall || githubBusy) return;
					setGithubBusy(true); setGithubError(null);
					apiCallAt('github.install', { cwd: project.cwd, url: githubUrl.trim(), path: githubPath }, ctx).then(
						function () {
							setGithubOpen(false); setGithubPreview(null); setGithubInfo(null); setGithubUrl(''); setGithubPath('');
							setMessage('已从 GitHub 安装到当前项目并记录来源，默认停用；可在「本地 Skill」中启用。');
							void loadMarket(true);
							if (typeof props.onInstalled === 'function') props.onInstalled();
						},
						function (reason: DynamicValue) { setGithubError(String((reason && reason.message) || reason)); }
					).finally(function () { setGithubBusy(false); });
				}

				var needle = query.trim().toLowerCase();
				var visible = items.filter(function (item: DynamicValue) {
					return needle === '' || String(item.name || '').toLowerCase().includes(needle) || String(item.repository || '').toLowerCase().includes(needle) || String(item.description || '').toLowerCase().includes(needle);
				});
				var activeDetail = detail || selected;
				var detailStatus = activeDetail ? (activeDetail.status || (selected && selected.status)) : null;
				var canInstall = project !== null && activeDetail !== null && detailStatus !== 'modified' && detailStatus !== 'conflict';

				return h(
					'div',
					{ className: 'sk-marketLayout' },
					h('div', { className: 'sk-marketListCol' },
						h('div', { className: 'sk-marketToolbar' },
							h('span', { className: 'sk-projLabel' }, '安装目标'),
							h('div', { className: 'sk-marketProjectPicker' },
								h('button', {
									type: 'button', className: 'sk-projBtn', disabled: projects.length === 0,
								onClick: function () { setProjectMenuOpen(!projectMenuOpen); },
								title: project ? project.cwd : '选择安装目标项目'
							}, h('span', { className: 'sk-projTitle' }, project ? project.title : '（未选择）'), h(P.IconChevronDownOutline14)),
							projectMenuOpen
								? h('div', { className: 'sk-menu' },
									projects.map(function (p: DynamicValue) {
										return h('button', { type: 'button', key: p.cwd, className: 'sk-menuBtn' + (project && project.cwd === p.cwd ? ' sk-menuBtnActive' : ''), onClick: function () { setProjectMenuOpen(false); props.onChooseProject(p); } }, project && project.cwd === p.cwd ? h(P.IconCheckOutline14) : h('span', { style: { width: 14, flex: 'none' } }), h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 } }, p.title));
									}),
									h('div', { className: 'sk-menuSep' }),
									h('button', { type: 'button', className: 'sk-menuBtn', onClick: function () { setProjectMenuOpen(false); props.onAddProject(); } }, h(P.IconPlusOutline16), '添加本地项目…')
								)
								: null
							),
						h('div', { className: 'sk-searchWrap sk-marketSearch' },
							h('span', { className: 'sk-ic' }, h(P.IconSearchOutline16)),
							h('input', { className: 'sk-search', placeholder: '搜索 Skill 或 GitHub 仓库', value: query, onChange: function (event: DynamicValue) { setQuery(event.target.value); } })
						),
						h('button', { type: 'button', className: 'sk-chip', disabled: project === null, onClick: function () { setGithubOpen(true); setGithubError(null); } }, h(P.IconPlusOutline16), '从 GitHub 安装'),
						h('button', { type: 'button', className: 'sk-chip', disabled: loading, onClick: function () { setAttempt(function (value: DynamicValue) { return value + 1; }); } }, h(P.IconRefreshOutline16), loading ? '刷新中…' : '刷新')
					),
					h('p', { className: 'sk-marketHelper' }, '自动同步可信 Skill Registry，也支持任意公开 GitHub 仓库 · 安装阶段不执行第三方代码'),
					marketWarning ? h('p', { className: 'sk-marketNotice', role: 'status' }, '远程 Registry 暂时不可用，正在显示可用缓存和精选条目：' + marketWarning) : null,
					message ? h('p', { className: 'sk-marketNotice', role: 'status' }, message) : null,
					error ? h('div', { className: 'sk-marketLoadError', role: 'alert' }, h('p', { className: 'sk-error' }, '加载 Skill 市场失败：' + error), h(Button, { variant: 'outline', onClick: function () { setAttempt(function (value: DynamicValue) { return value + 1; }); } }, '重试')) : null,
					h('div', { className: 'sk-marketList', 'data-testid': 'skill-market-list' },
						loading && !loaded ? h('p', { className: 'sk-empty', role: 'status' }, '正在读取 Skill 市场…') : null,
						!loading && visible.length === 0 ? h('p', { className: 'sk-empty' }, '没有匹配的 Skill。') : null,
						visible.map(function (item: DynamicValue) {
							return h('button', { type: 'button', key: item.id, className: 'sk-marketRow' + (selected && selected.id === item.id ? ' sk-marketRowActive' : ''), onClick: function () { openItem(item); } },
								h('span', { className: 'sk-marketMain' }, h(MarketIcon, { src: item.iconUrl }), h('span', { className: 'sk-marketCopy' }, h('span', { className: 'sk-marketTitle' }, item.name), h('span', { className: 'sk-marketDesc' }, item.description), h('span', { className: 'sk-marketMeta' }, item.marketSource === 'trusted-registry' ? '可信 Registry · ' : '精选 · ', item.repository, item.license ? ' · ' + item.license : ''))),
								h('span', { className: 'sk-marketSide' }, h('span', { className: 'sk-marketStatus sk-marketStatus-' + item.status }, marketStatusLabel(item.status)), h(P.IconChevronRightOutline14))
							);
						})
					)
					),
					activeDetail
						? h('aside', { className: 'sk-drawer sk-marketDrawer', role: 'dialog', 'aria-label': activeDetail.name + ' 详情' },
							h('div', { className: 'sk-drawerHead' }, h(MarketIcon, { src: activeDetail.iconUrl }), h('div', { className: 'sk-marketDrawerIdentity' }, h('div', { className: 'sk-drawerName' }, activeDetail.name), h('a', { className: 'sk-marketLink', href: activeDetail.url || ('https://github.com/' + activeDetail.repository), target: '_blank', rel: 'noreferrer' }, activeDetail.repository, h(P.IconRightUpOutline14))), h('button', { type: 'button', className: 'sk-icBtn', 'aria-label': '关闭详情', title: '关闭（Esc）', onClick: function () { setSelected(null); setDetail(null); } }, h(P.IconCloseOutline16))),
							h('div', { className: 'sk-drawerBody' },
								detailLoading ? h('p', { className: 'sk-empty', role: 'status' }, '正在读取 GitHub Skill 信息…') : null,
								activeDetail.description ? h('p', { className: 'sk-descFull' }, activeDetail.description) : null,
								activeDetail.metadataError ? h('p', { className: 'sk-marketMetaNotice' }, '部分远程信息暂不可用：' + activeDetail.metadataError) : null,
								h('div', { className: 'sk-sec' }, h('div', { className: 'sk-secTitle' }, '仓库信息'), h('div', { className: 'sk-marketFacts' }, h('span', null, '作者：' + (activeDetail.author || '—')), h('span', null, '许可证：' + (activeDetail.license || '—')), h('span', null, 'Stars：' + (activeDetail.stars === null || activeDetail.stars === undefined ? '—' : activeDetail.stars)), h('span', null, '文件：' + (activeDetail.fileCount === null || activeDetail.fileCount === undefined ? '—' : activeDetail.fileCount)))) ,
								h('div', { className: 'sk-sec' }, h('div', { className: 'sk-secTitle' }, '当前状态'), h('div', { className: 'sk-marketState' }, marketStatusLabel(detailStatus), project ? ' · 安装到 ' + project.title : ' · 请选择安装目标项目')),
								activeDetail.files && activeDetail.files.length > 0 ? h('div', { className: 'sk-sec' }, h('div', { className: 'sk-secTitle' }, 'Skill 文件'), h('div', { className: 'sk-marketFiles' }, activeDetail.files.map(function (file: DynamicValue) { return h('code', { key: file }, file); }))) : null,
								h('div', { className: 'sk-sec' }, h('div', { className: 'sk-secTitle' }, '安装校验'), h('div', { className: 'sk-marketChecks' }, h('span', null, '✓ SKILL.md frontmatter'), h('span', null, '✓ 路径和文件大小'), h('span', null, '✓ 拒绝符号链接'), h('span', null, '✓ 不执行第三方脚本')))
							),
							h('div', { className: 'sk-marketFoot' }, h(Button, { variant: 'outline', onClick: function () { window.open(activeDetail.url || ('https://github.com/' + activeDetail.repository), '_blank', 'noopener,noreferrer'); } }, '在 GitHub 查看', h(P.IconRightUpOutline14)), h(Button, { disabled: !canInstall || previewLoading || busy, onClick: openPreview }, previewLoading ? '检查中…' : detailStatus === 'update-available' ? '更新到当前项目' : detailStatus === 'installed' ? '重新安装' : canInstall ? '安装到当前项目' : '需要人工处理'))
						)
						: null,
					h(Modal, { open: preview !== null, onClose: function () { if (!busy) setPreview(null); }, title: preview ? (preview.action === 'update' ? '更新 Skill「' + preview.name + '」' : '安装 Skill「' + preview.name + '」') : '安装预览', closeLabel: '关闭', description: preview ? preview.message : '', footer: preview ? h(React.Fragment, null, h(Button, { variant: 'outline', disabled: busy, onClick: function () { setPreview(null); } }, '取消'), h(Button, { disabled: busy || !preview.canInstall, onClick: installPreview }, busy ? '写入中…' : preview.canInstall ? '确认安装' : '无法安装') ) : null }, preview ? h('div', { className: 'sk-marketPreview' }, h('div', { className: 'sk-marketPreviewSummary' }, h('strong', null, preview.action === 'update' ? '将更新受管 Skill' : '将安装到当前项目'), h('span', null, preview.projectRoot + '/.dsh/skills/' + preview.name)), h('div', { className: 'sk-marketChecks' }, h('span', null, '✓ 已校验远程 SKILL.md'), h('span', null, '✓ ' + preview.incoming.fileCount + ' 个文件，内容哈希 ' + preview.incoming.hash.slice(0, 18) + '…'), h('span', null, '✓ 安装阶段不执行第三方代码；调用后仍受 Agent 权限与审批约束')), preview.incoming.files && preview.incoming.files.length > 0 ? h('div', { className: 'sk-marketFiles' }, preview.incoming.files.map(function (file: DynamicValue) { return h('code', { key: file }, file); })) : null) : null),
					h(Modal, {
						open: githubOpen,
						onClose: function () { if (!githubBusy) { setGithubOpen(false); setGithubPreview(null); setGithubError(null); } },
						title: '从 GitHub 安装 Skill',
						description: '输入公开仓库主页或具体 Skill 目录 URL。Host 会先读取文件树并给出只读预览。',
						footer: h(React.Fragment, null,
							h(Button, { variant: 'outline', disabled: githubBusy, onClick: function () { setGithubOpen(false); setGithubPreview(null); } }, '取消'),
							githubPreview ? h(Button, { disabled: githubBusy || !githubPreview.canInstall, onClick: installGithub }, githubBusy ? '写入中…' : githubPreview.canInstall ? '确认安装' : '无法安装') : h(Button, { disabled: githubBusy || githubPath === '', onClick: previewGithub }, githubBusy ? '校验中…' : '生成安装预览'))
					},
						h('div', { className: 'sk-marketPreview', 'data-testid': 'github-install-dialog' },
							h('div', { className: 'sk-presetField' }, h('label', { className: 'sk-presetFieldHead' }, h('span', null, 'GitHub URL')), h('div', { className: 'sk-presetInputRow' }, h('input', { className: 'sk-presetInput', value: githubUrl, placeholder: 'https://github.com/owner/repo', disabled: githubBusy || githubPreview !== null, onChange: function (event: DynamicValue) { setGithubUrl(event.target.value); setGithubInfo(null); setGithubPath(''); } }), h(Button, { variant: 'outline', disabled: githubBusy || githubUrl.trim() === '' || githubPreview !== null, onClick: inspectGithub }, githubBusy ? '读取中…' : '检查仓库'))),
							githubInfo ? h('div', { className: 'sk-presetField' }, h('label', { className: 'sk-presetFieldHead' }, h('span', null, 'Skill 目录')), h('select', { className: 'sk-presetInput', value: githubPath, disabled: githubBusy || githubPreview !== null, onChange: function (event: DynamicValue) { setGithubPath(event.target.value); } }, h('option', { value: '' }, '请选择…'), (githubInfo.candidates || []).map(function (candidate: DynamicValue) { return h('option', { key: candidate.path, value: candidate.path }, candidate.path); }))) : null,
							githubError ? h('p', { className: 'sk-error', role: 'alert' }, githubError) : null,
							githubPreview ? h('div', { className: 'sk-marketPreviewSummary' }, h('strong', null, githubPreview.action === 'update' ? '将更新受管 Skill' : '将安装 ' + githubPreview.name), h('span', null, githubPreview.repository + ' · ' + githubPreview.path + ' @ ' + githubPreview.ref), h('span', null, githubPreview.incoming.fileCount + ' 个文件 · ' + githubPreview.incoming.hash), h('span', null, githubPreview.message), h('span', null, '安装阶段不执行第三方代码；Skill 调用后的脚本行为仍受 Agent 权限与审批约束。')) : null
					)
				)
				);
			}
			function SkillFindingState() {
				var particles = [
					['North', false],
					['East', true],
					['SouthWest', false]
				];
				return h(
					'div',
					{ className: 'sk-findingState', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
					h(
						'div',
						{ className: 'sk-findingVisual', 'aria-hidden': true },
						particles.map(function (particle: Array<string | boolean>) {
							return h('span', {
								key: String(particle[0]),
								className: 'sk-findingParticle sk-findingParticle' + particle[0]
									+ (particle[1] ? ' sk-findingParticleAccent' : '')
							});
						}),
						h('span', { className: 'sk-findingCore' }, h(P.IconSkillOutline16))
					),
					h('span', { className: 'sk-findingLabel', 'data-text': 'Skill Finding' },
						'Skill Finding',
						h('span', { className: 'sk-findingCursor', 'aria-hidden': true }))
				);
			}
			/**
			 * The V1 body. Rendered only after the apiVersion 6 probe
			 * succeeded, so all hooks here run unconditionally.
			 */
			function SkillCenterV1Body(props: { ctx: ClientContext }) {
				var ctx = props.ctx;
				var [topPage, setTopPage] = React.useState<'local' | 'market'>('local');
				var [projects, setProjects] = React.useState<DynamicValue[]>([]);
				var [project, setProject] = React.useState<DynamicValue>(null); // { cwd, title, kind }
				var [projMenuOpen, setProjMenuOpen] = React.useState(false);
				var [view, setView] = React.useState<DynamicValue>(null);
				var [viewError, setViewError] = React.useState<string | null>(null);
				var [viewBusy, setViewBusy] = React.useState(false);
				var [presets, setPresets] = React.useState<DynamicValue[]>([]);
				var [presetMenuOpen, setPresetMenuOpen] = React.useState(false);
				var [search, setSearch] = React.useState('');
				var [enableFilter, setEnableFilter] = React.useState('all'); // 'all'|'on'|'off'
				var [tagFilter, setTagFilter] = React.useState<string | null>(null);
				var [tagMenuOpen, setTagMenuOpen] = React.useState(false);
				var [actionMenuOpen, setActionMenuOpen] = React.useState(false);
				var [selectedRows, setSelectedRows] = React.useState<Record<string, boolean>>({}); // name -> true
				var [bulkMode, setBulkMode] = React.useState(false);
				var [drawerName, setDrawerName] = React.useState<string | null>(null);
				var [toggling, setToggling] = React.useState<Record<string, boolean>>({}); // name -> true
				var [sourceBusy, setSourceBusy] = React.useState<string | null>(null); // name | null
				var [presetModal, setPresetModal] = React.useState<DynamicValue>(null); // {name, desc, mode, diff}
				var [presetBusy, setPresetBusy] = React.useState(false);
				var [slimModal, setSlimModal] = React.useState<DynamicValue>(null); // {kind, preset, diff}
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
				var projectRef = React.useRef<DynamicValue>(null); // current project, kept in a ref for async guards
				var [partialWarning, setPartialWarning] = React.useState<string | null>(null); // P2-3 persistent partial-failure warning
				var drawerRow: DynamicValue = null;
				if (view !== null && drawerName !== null) {
					for (var drawerIndex = 0; drawerIndex < view.identities.length; drawerIndex += 1) {
						if (view.identities[drawerIndex].name === drawerName) {
							drawerRow = view.identities[drawerIndex];
							break;
						}
					}
				}
				React.useEffect(function () { projectRef.current = project; }, [project]);

				function patchRow(row2: DynamicValue): void {
					setView(function (v: DynamicValue) {
						if (v === null) return v;
						var identities = v.identities.map(function (r: DynamicValue) { return r.name === row2.name ? row2 : r; });
						var tags: Record<string, boolean> = {};
						identities.forEach(function (r: DynamicValue) {
							(r.tags || []).forEach(function (tag: string) { tags[tag] = true; });
						});
						return Object.assign({}, v, {
							identities: identities,
							allTags: Object.keys(tags).sort()
						});
					});
				}
				function isCurrentProject(gen: number, cwd: string): boolean {
					var current = projectRef.current;
					var currentCwd = current && current.cwd !== undefined ? current.cwd : '';
					return genRef.current === gen && currentCwd === cwd;
				}
				var loadView = React.useCallback(function (proj: DynamicValue) {
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
					function onKey(event: KeyboardEvent): void {
						if (event.key !== 'Escape') return;
						// The drawer itself is role="dialog"; only a *modal*
						// dialog on top of it takes Esc first.
						var dialogs = document.querySelectorAll('[role="dialog"]');
						for (var i = 0; i < dialogs.length; i += 1) {
							if (dialogs[i]!.classList.contains('sk-drawer') === false) return;
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

				// The compact project and preset controls behave as one page-level
				// context group: Escape or an outside click closes whichever menu is
				// open without disturbing drawers or modal dialogs.
				React.useEffect(function () {
					if (!projMenuOpen && !presetMenuOpen) return;
					function closeContextMenus(): void {
						setProjMenuOpen(false);
						setPresetMenuOpen(false);
					}
					function onKey(event: KeyboardEvent): void {
						if (event.key !== 'Escape') return;
						event.preventDefault();
						event.stopImmediatePropagation();
						closeContextMenus();
					}
					function onPointerDown(event: MouseEvent): void {
						var target = event.target as Element | null;
						if (target !== null && typeof target.closest === 'function' && target.closest('[data-sk-context-menu]') !== null) return;
						closeContextMenus();
					}
					document.addEventListener('keydown', onKey, true);
					document.addEventListener('mousedown', onPointerDown);
					return function () {
						document.removeEventListener('keydown', onKey, true);
						document.removeEventListener('mousedown', onPointerDown);
					};
				}, [projMenuOpen, presetMenuOpen]);

				function chooseProject(p: DynamicValue): void {
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
					var ws: DynamicValue = null;
					try { ws = ctx.get('workspaces') as DynamicValue; } catch (error) {}
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
				function doToggle(row: DynamicValue, force?: boolean): void {
					var proj = project;
					if (proj === null || toggling[row.name] === true || viewBusy === true) return;
					if (view && (view.configCorrupt === true || view.configFuture === true)) return;
					var want = typeof force === 'boolean' ? force : row.enabled !== true;
					var before = row;
					var gen = genRef.current;
					setToggling(function (t) { var n = Object.assign({}, t); n[row.name] = true; return n; });
					setViewError(null);
					// Immediate visual feedback; the authoritative Host response replaces
					// this row, while any failure restores the exact pre-click row.
					patchRow(Object.assign({}, row, { enabled: want, modelInvocable: want }));
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
							patchRow(before);
							setViewError(String((e && e.message) || e));
						}
					);
				}
				function doBulk(enabled: boolean): void {
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
				function doSource(name: string, sourceKey: string | null): void {
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
				function doTags(row: DynamicValue, tags: string[]): void {
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
				function openPreset(p: DynamicValue): void {
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
				function switchPresetMode(mode: 'replace' | 'merge'): void {
					var modal = presetModal;
					var proj = project;
					if (modal === null || proj === null || modal.cwd !== proj.cwd) return;
					var gen = genRef.current;
					apiCallAt('presets.preview', { cwd: proj.cwd, name: modal.name, mode: mode }, ctx).then(
						function (value) {
							if (!isCurrentProject(gen, proj.cwd)) return;
							setPresetModal(function (m: DynamicValue) {
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
				function setDefaultPreset(name: string | null): void {
					apiCallAt('presets.setDefault', { name: name }, ctx).then(
						function () { void loadPresets(); },
						function (e) { setViewError(String((e && e.message) || e)); }
					);
				}
				function deletePreset(name: string): void {
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
				function matchesSearch(row: DynamicValue): boolean {
					if (search === '') return true;
					var n = search.toLowerCase();
					return row.name.toLowerCase().indexOf(n) !== -1
						|| (row.description || '').toLowerCase().indexOf(n) !== -1;
				}
				var visibleRows: DynamicValue[] = [];
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
				function switchV1(row: DynamicValue) {
					var on = row.enabled === true;
					var dim = project === null || toggling[row.name] === true;
					var title = toggling[row.name] === true
						? '正在保存项目配置'
						: project === null
						? '请先选择项目'
						: on
							? '在本项目禁用（模型不再自动调用，仍可用 /' + row.name + ' 手动调用）'
							: '在本项目启用（下一轮对话生效）';
					return h('button', {
						type: 'button',
						role: 'switch',
						'aria-checked': on,
						'aria-label': (on ? '停用 ' : '启用 ') + row.name + '（仅当前项目）',
						className: 'sk-switch' + (on ? ' sk-switchOn' : '') + (dim ? ' sk-switchDim' : ''),
						disabled: dim || viewBusy === true || (view && (view.configCorrupt === true || view.configFuture === true)),
						title: title,
						onClick: function (event) { event.stopPropagation(); doToggle(row); }
					}, h('span', { className: 'sk-switchKnob' }));
				}
				function openDrawer(row: DynamicValue): void {
					setDrawerName(row.name);
					setTagDraft('');
					setTagComposerOpen(false);
					setAdvOpen(false);
					setSourceOpen(false);
				}
				function rowEl(row: DynamicValue) {
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
								onClick: function (event: React.MouseEvent) { event.stopPropagation(); },
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
								onMouseUp: function (event: React.MouseEvent<HTMLButtonElement>) { event.currentTarget.blur(); },
								onKeyDown: function (event: React.KeyboardEvent<HTMLButtonElement>) {
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
						h('div', { className: 'sk-rowSide' },
							!bulkMode && toggling[row.name] === true ? h('span', { className: 'sk-saving', role: 'status' }, '保存中') : null,
							!bulkMode ? switchV1(row) : null
						)
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
										row.sources.map(function (s: DynamicValue) {
											var on = row.sourceKey === s.key;
										return h('button', {
											type: 'button',
											key: s.key,
											role: 'radio',
											'aria-checked': on,
											className: 'sk-src' + (on ? ' sk-srcOn' : ''),
											disabled: !canWrite || sourceIsBroken(s.broken) || sourceBusy === row.name,
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
												sourceIsBroken(s.broken) ? h('span', { className: 'sk-badge sk-badgeWarn' }, '格式损坏') : null,
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
									? h('div', { className: 'sk-tagList sk-tagListBare', 'aria-label': '已有标签' }, tagValues.map(function (t: string) {
											return h('span', { key: t, className: 'sk-tag' },
												t,
												h('button', {
													type: 'button',
													className: 'sk-tagX',
													'aria-label': '移除标签「' + t + '」',
													title: '移除标签「' + t + '」',
													disabled: !canWrite || tagBusy === true,
													onClick: function () {
												var rest = tagValues.filter(function (x: string) { return x !== t; });
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
				var recommendedPreset: DynamicValue = null;
				for (var presetIndex = 0; presetIndex < presets.length; presetIndex += 1) {
					if (presets[presetIndex].defaultSlim === true) { recommendedPreset = presets[presetIndex]; break; }
				}
				if (recommendedPreset === null && presets.length > 0) recommendedPreset = presets[0];

				return h(
					'div',
					{ className: 'sk-root' },
					h('div', { className: 'sk-head' },
						h('h2', { className: 'sk-headTitle' }, 'SKILL'),
						topPage === 'local'
							? h('div', { className: 'sk-headContext', 'aria-label': '当前项目上下文' },
								h('div', { className: 'sk-contextAnchor sk-contextProject', 'data-sk-context-menu': 'project' },
									h('button', {
										type: 'button',
										className: 'sk-contextProjectBtn sk-projBtn' + (projMenuOpen ? ' sk-quietBtnOn' : ''),
										disabled: projects.length === 0,
										'aria-label': (project ? '当前项目 ' + project.title : '选择当前项目') + '，已启用 ' + enabledCount + ' / ' + totalCount,
										'aria-haspopup': 'menu',
										'aria-expanded': projMenuOpen,
										onClick: function () {
											setProjects(buildProjectOptions(ctx));
											setProjMenuOpen(!projMenuOpen);
											setTagMenuOpen(false);
											setPresetMenuOpen(false);
											setActionMenuOpen(false);
										},
										title: project ? project.cwd : '选择要管理的项目'
									},
										h('span', { className: 'sk-contextCopy' },
											h('span', { className: 'sk-contextEyebrow' }, project && project.cwd === currentCwd(ctx) ? '当前项目' : '所选项目'),
											h('span', { className: 'sk-projectTitle' }, project ? project.title : '未选择项目'),
											h('span', { className: 'sk-contextStat' }, '已启用 ' + enabledCount + ' / ' + totalCount)),
										h(P.IconChevronDownOutline14)),
									projMenuOpen
										? h('div', { className: 'sk-menu', role: 'menu', style: { left: 'auto', right: 0 } },
											projects.map(function (p) {
												var isCurrent = p.cwd === currentCwd(ctx);
												return h('button', {
													type: 'button', key: p.cwd, role: 'menuitem',
													className: 'sk-menuBtn' + (project && project.cwd === p.cwd ? ' sk-menuBtnActive' : ''),
													onClick: function () { chooseProject(p); }
												},
													isCurrent ? h(P.IconCheckOutline14) : h('span', { style: { width: 14, flex: 'none' } }),
													h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 } }, p.title),
													isCurrent ? h('span', { className: 'sk-menuHint' }, '当前工作区') : null);
											}),
											h('div', { className: 'sk-menuSep' }),
											h('button', { type: 'button', role: 'menuitem', className: 'sk-menuBtn', onClick: function () { setProjMenuOpen(false); addLocalProject(); } },
												h(P.IconPlusOutline16), '添加本地项目…'))
										: null),
								h('div', { className: 'sk-contextAnchor', 'data-sk-context-menu': 'preset' },
									h('button', {
										type: 'button',
										className: 'sk-quietBtn' + (presetMenuOpen ? ' sk-quietBtnOn' : ''),
										'aria-haspopup': 'menu',
										'aria-expanded': presetMenuOpen,
										onClick: function () {
											setPresetMenuOpen(!presetMenuOpen);
											setProjMenuOpen(false);
											setTagMenuOpen(false);
											setActionMenuOpen(false);
										}
									}, '预设', h(P.IconChevronDownOutline14)),
									presetMenuOpen
										? h('div', { className: 'sk-menu', role: 'menu', style: { left: 'auto', right: 0, minWidth: 180 } },
											recommendedPreset !== null
												? h('button', { type: 'button', role: 'menuitem', className: 'sk-menuBtn', onClick: function () { setPresetMenuOpen(false); openPreset(recommendedPreset); } }, '应用推荐预设')
												: null,
											h('button', { type: 'button', role: 'menuitem', className: 'sk-menuBtn', onClick: function () { setPresetMenuOpen(false); setSaveName(''); setSaveDesc(''); setSaveOpen(true); } }, '保存为预设'))
										: null))
							: null),
					h('div', { className: 'sk-tabs sk-primaryTabs', role: 'tablist', 'aria-label': 'Skill 页面' },
						h('button', { type: 'button', role: 'tab', 'aria-selected': topPage === 'local', className: 'sk-tab' + (topPage === 'local' ? ' sk-tabActive' : ''), onClick: function () { setTopPage('local'); } }, '本地 Skill'),
						h('button', { type: 'button', role: 'tab', 'aria-selected': topPage === 'market', className: 'sk-tab' + (topPage === 'market' ? ' sk-tabActive' : ''), onClick: function () { setTopPage('market'); } }, 'Skill 市场')),
					topPage === 'market'
						? h(SkillMarketplacePage, {
							ctx: ctx,
							project: project,
							projects: projects,
							onChooseProject: chooseProject,
							onAddProject: addLocalProject,
							onInstalled: function () { if (project !== null) void loadView(project); }
						})
						: h(React.Fragment, null,
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
										((view && view.allTags) || []).map(function (t: string) {
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
									? (viewBusy
										? h(SkillFindingState)
										: h('p', { className: 'sk-empty' }, '（空）'))
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
										onClick: function () { switchPresetMode(m[0] as 'replace' | 'merge'); }
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
									onChange: function (event: React.ChangeEvent<HTMLTextAreaElement>) { setSaveDesc(event.target.value); }
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
					)
				);
			}

			/**
			 * The SKILL tab: probes the host for the V1 (apiVersion 6)
			 * with a lightweight `capabilities` op. Hosts from the first V1
			 * release do not expose it, so an unknown op falls back to one
			 * `catalog` request; an unknown catalog produces an explicit upgrade
			 * state instead of mounting an obsolete client page.
			 */
			function SkillCenterV1(props: { ctx: ClientContext }) {
				var ctx = props.ctx;
				var [probe, setProbe] = React.useState('loading'); // loading | v1 | unavailable | error
				var [probeError, setProbeError] = React.useState<string | null>(null);
				var [attempt, setAttempt] = React.useState(0);
				React.useEffect(function () {
					setProbe('loading');
					setProbeError(null);
					function accept(value: DynamicValue): void {
						if (value && Number(value.apiVersion) >= 6) setProbe('v1');
						else setProbe('unavailable');
					}
					function reject(e: DynamicValue): void {
						var msg = String((e && e.message) || e);
						if (msg.indexOf('未知操作') !== 0) { setProbe('error'); setProbeError(msg); return; }
						apiCallAt('catalog', {}, ctx).then(
							function (value) { accept(value); },
							function (catalogError) {
								var catalogMessage = String((catalogError && catalogError.message) || catalogError);
								if (catalogMessage.indexOf('未知操作') === 0) setProbe('unavailable');
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
					return h('div', { className: 'sk-root' }, h(SkillFindingState));
				}
				if (probe === 'unavailable') {
					return h(
						'div',
						{ className: 'sk-root' },
						h('p', { className: 'sk-error' }, '当前 dsh web 未加载新版 Skill Host API（apiVersion 6），请重启 dsh web 后重试。'),
						h(Button, { variant: 'outline', onClick: function () { setAttempt(function (n) { return n + 1; }); } }, '重试')
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
				return h(SkillCenterV1Body, { ctx: ctx });
			}

			// ── plugin module (the client half of dsh-skill-manager) ──────────
			var module: ClientModule = { exports: {} };
			module.exports.name = 'skill-manager-ui';
			module.exports.inject = ['slots'];
			module.exports.apply = function (ctx: ClientContext) {
				var slots = ctx.get('slots') as DynamicValue;
				if (slots === undefined || typeof slots.register !== 'function') return;
				// DSH-006 build 22: the generic Extensions shell owns the sidebar
				// entry. This plugin contributes only its SKILL business page.
				slots.inject('extension.manager.section', function () {
					return slots.register(
						{
							name: 'extension.manager.section',
							id: 'skill',
							order: 10,
							label: function () { return 'SKILL'; },
							inject: function () {
								return {
									// V1 (DSH-008): the live client context so the
									// skill center can read sessions/workspaces.
									ctx: ctx
								};
							}
						},
						SkillCenterV1
					);
				});
			};
			return module.exports;
		}
	});
})();
