"use strict";
(function () {
    window.__ModuleLoader__.load({
        id: 'dsh-plugin-manager',
        factory: function (require) {
            var React = require('react');
            var h = React.createElement;
            var P = require('@deepseek-ai/dsh-client-ui-primitives');
            var existingStyle = document.querySelector('style[data-plugin="dsh-plugin-manager"]');
            var style = existingStyle || document.createElement('style');
            style.setAttribute('data-plugin', 'dsh-plugin-manager');
            style.textContent = [
                '.pm-root{box-sizing:border-box;height:100%;min-height:0;max-width:980px;margin:0 auto;color:var(--dsw-alias-label-primary);font-size:13px;display:flex;flex-direction:column}',
                '.pm-head{flex:none;display:flex;align-items:baseline;gap:14px;padding:6px 8px 16px}',
                '.pm-head h2{margin:0;font-size:22px;line-height:1.25;font-weight:650;letter-spacing:-.02em}',
                '.pm-tabs{flex:none;height:40px;border-bottom:1px solid var(--dsw-alias-border-l2);display:flex;align-items:flex-end;gap:28px;padding:0 8px}',
                '.pm-tab{appearance:none;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-weight:500;height:40px;padding:0 1px}',
                '.pm-tab:hover{color:var(--dsw-alias-label-primary)}',
                '.pm-tabOn{border-bottom-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);font-weight:600}',
                '.pm-toolbar{flex:none;display:flex;align-items:center;gap:10px;padding:16px 8px 8px}',
                '.pm-search{box-sizing:border-box;min-width:0;flex:1;height:38px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-module-platform);display:flex;align-items:center;gap:8px;padding:0 11px;color:var(--dsw-alias-label-tertiary)}',
                '.pm-search:focus-within{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 1px var(--dsw-alias-brand-primary)}',
                '.pm-search input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit}',
                '.pm-search input::placeholder{color:var(--dsw-alias-label-quaternary)}',
                '.pm-btn{appearance:none;height:38px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;font-weight:500;padding:0 13px;display:inline-flex;align-items:center;justify-content:center;gap:7px;white-space:nowrap}',
                '.pm-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
                '.pm-btn:disabled{cursor:not-allowed;color:var(--dsw-alias-label-quaternary)}',
                '.pm-btnPrimary{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-brand-primary);color:white}',
                '.pm-btnPrimary:hover:not(:disabled){background:var(--dsw-alias-brand-primary-hover, var(--dsw-alias-brand-primary))}',
                '.pm-iconBtn{width:38px;padding:0}',
                '.pm-helper{flex:none;margin:0;padding:0 8px 10px;color:var(--dsw-alias-label-quaternary);font-size:12px}',
                '.pm-marketFilters{flex:none;display:flex;gap:18px;padding:12px 8px 0}',
                '.pm-marketFilter{appearance:none;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:12px;padding:0 1px 8px}',
                '.pm-marketFilter:hover{color:var(--dsw-alias-label-primary)}',
                '.pm-marketFilterOn{border-bottom-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);font-weight:600}',
                '.pm-registryState{flex:none;margin:0;padding:0 8px 10px;color:var(--dsw-alias-label-quaternary);font-size:12px}',
                '.pm-registryStateWarning{color:var(--dsw-alias-status-warning, #9a6700)}',
                '.pm-loadMore{display:flex;justify-content:center;padding:18px 0 6px}',
                '.pm-list{min-height:0;overflow:auto;padding:0 8px 32px}',
                '.pm-row{position:relative;box-sizing:border-box;width:100%;min-height:72px;border:0;border-top:1px solid var(--dsw-alias-border-l2);background:transparent;color:inherit;text-align:left;font:inherit;padding:13px 10px;display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:14px;align-items:center}',
                '.pm-row:last-child{border-bottom:1px solid var(--dsw-alias-border-l2)}',
                '.pm-rowClick{cursor:pointer}',
                '.pm-rowClick:hover{background:var(--dsw-alias-interactive-bg-hover)}',
                '.pm-rowSelected{background:color-mix(in srgb,var(--dsw-static-blue-500) 7%,var(--dsw-alias-bg-module-platform))}',
                '.pm-rowSelected:hover{background:color-mix(in srgb,var(--dsw-static-blue-500) 9%,var(--dsw-alias-bg-module-platform))}',
                '.pm-rowMain{min-width:0;display:flex;align-items:flex-start;gap:11px}',
                '.pm-pluginIcon{flex:none;width:28px;height:28px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary);margin-top:1px}',
                '.pm-marketMain{min-width:0;display:flex;align-items:center;gap:16px}',
                '.pm-marketIcon{flex:none;width:42px;height:42px;border-radius:10px;object-fit:cover;background:var(--dsw-alias-fill-tsp-secondary)}',
                '.pm-marketFallback{flex:none;width:42px;height:42px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary)}',
                '.pm-marketCopy{min-width:0;display:flex;flex-direction:column}',
                '.pm-rowCopy{min-width:0}',
                '.pm-rowTitle{font-size:13.5px;font-weight:600;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
                '.pm-rowDesc{margin-top:4px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.45}',
                '.pm-rowMeta{margin-top:5px;color:var(--dsw-alias-label-quaternary);font-size:11.5px;display:flex;gap:7px;align-items:center}',
                '.pm-rowSide{display:flex;align-items:center;gap:12px;color:var(--dsw-alias-label-secondary)}',
                '.pm-status{font-size:12px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}',
                '.pm-statusUpdate{color:var(--dsw-alias-brand-primary)}',
                '.pm-switch{appearance:none;position:relative;flex:none;width:44px;height:24px;border:0;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 20%,var(--dsw-alias-bg-module-platform));cursor:pointer;padding:0;transition:background-color .25s ease}',
                '.pm-switch:after{content:"";position:absolute;left:3px;top:3px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .3s cubic-bezier(.34,1.56,.64,1)}',
                '.pm-switch:active:after,.pm-switchOn:active:after{transition-duration:.12s}',
                '.pm-switch:active:after{transform:scaleX(1.12)}',
                '.pm-switchOn{background:var(--dsw-alias-state-business-primary)}',
                '.pm-switchOn:after{transform:translateX(20px)}',
                '.pm-switchOn:active:after{transform:translateX(20px) scaleX(1.12)}',
                '.pm-switch:disabled{cursor:not-allowed;opacity:.5}',
                '.pm-switch:focus-visible{outline:2px solid color-mix(in srgb,var(--dsw-alias-state-business-primary) 55%,transparent);outline-offset:2px}',
                '@media (prefers-reduced-motion:reduce){.pm-switch,.pm-switch:after{transition:none}}',
                '.pm-empty,.pm-loading,.pm-error{margin:24px 8px;padding:20px 0;color:var(--dsw-alias-label-tertiary)}',
                '.pm-error{color:var(--dsw-alias-status-error, #c93535)}',
                '.pm-loadingState{flex:1;min-height:220px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;padding:52px 24px;text-align:center}',
                '.pm-loadingVisual{position:relative;width:216px;height:132px;color:var(--dsw-alias-label-secondary)}',
                '.pm-loadingCore{position:absolute;z-index:2;left:50%;top:54%;width:46px;height:46px;display:grid;place-items:center;transform:translate(-50%,-50%);color:var(--dsw-alias-label-primary);opacity:.76;animation:pm-loadingCore 1.8s linear infinite}',
                '.pm-loadingCore svg{width:40px;height:40px}',
                '.pm-loadingModule{position:absolute;z-index:1;width:18px;height:18px;display:grid;place-items:center;color:color-mix(in srgb,var(--dsw-alias-label-secondary) 72%,transparent);opacity:0;will-change:transform,opacity}',
                '.pm-loadingModule svg{width:16px;height:16px}',
                '.pm-loadingModuleNorthWest{left:16px;top:14px;animation:pm-loadingNorthWest 1.8s cubic-bezier(.42,0,.18,1) infinite}',
                '.pm-loadingModuleNorthEast{right:16px;top:12px;color:var(--dsw-static-blue-500);animation:pm-loadingNorthEast 1.8s cubic-bezier(.42,0,.18,1) infinite}',
                '.pm-loadingModuleSouthWest{left:14px;bottom:12px;animation:pm-loadingSouthWest 1.8s cubic-bezier(.42,0,.18,1) infinite}',
                '.pm-loadingModuleSouthEast{right:16px;bottom:12px;animation:pm-loadingSouthEast 1.8s cubic-bezier(.42,0,.18,1) infinite}',
                '.pm-loadingLabel{position:relative;display:inline-block;font-family:"Inter Variable","Inter","Segoe UI Variable Text","Segoe UI",system-ui,sans-serif;font-size:14px;line-height:20px;font-weight:450;font-variation-settings:"wght" 470;letter-spacing:.026em;color:color-mix(in srgb,var(--dsw-alias-label-secondary) 72%,transparent);filter:blur(.2px);white-space:nowrap}',
                '.pm-loadingLabel:before{content:attr(data-text);position:absolute;inset:0;color:color-mix(in srgb,var(--dsw-alias-label-primary) 88%,var(--dsw-alias-label-secondary));filter:none;clip-path:inset(0 100% 0 0);animation:pm-loadingTextFocus 1.8s cubic-bezier(.4,0,.2,1) infinite}',
                '.pm-loadingCursor{position:absolute;left:0;bottom:-6px;width:10px;height:1.25px;border-radius:999px;background:var(--dsw-static-blue-500);opacity:0;animation:pm-loadingCursor 1.8s cubic-bezier(.4,0,.2,1) infinite}',
                '@keyframes pm-loadingNorthWest{0%{transform:translate3d(-8px,-6px,0) scale(.76);opacity:.18}10%{opacity:.62}28%{transform:translate3d(64px,38px,0) scale(1);opacity:.7}38%{transform:translate3d(86px,51px,0) scale(.18);opacity:0}39%,94%{transform:translate3d(86px,51px,0) scale(.18);opacity:0}95%{transform:translate3d(-8px,-6px,0) scale(.76);opacity:0}100%{transform:translate3d(-8px,-6px,0) scale(.76);opacity:.18}}',
                '@keyframes pm-loadingNorthEast{0%,5%{transform:translate3d(8px,-6px,0) scale(.8);opacity:.2}14%{opacity:.94}30%{transform:translate3d(-64px,39px,0) scale(1);opacity:.96}40%{transform:translate3d(-85px,52px,0) scale(.18);opacity:0}41%,94%{transform:translate3d(-85px,52px,0) scale(.18);opacity:0}95%{transform:translate3d(8px,-6px,0) scale(.8);opacity:0}100%{transform:translate3d(8px,-6px,0) scale(.8);opacity:.2}}',
                '@keyframes pm-loadingSouthWest{0%,10%{transform:translate3d(-8px,6px,0) scale(.74);opacity:.16}18%{opacity:.56}32%{transform:translate3d(64px,-30px,0) scale(1);opacity:.64}42%{transform:translate3d(87px,-43px,0) scale(.18);opacity:0}43%,94%{transform:translate3d(87px,-43px,0) scale(.18);opacity:0}95%{transform:translate3d(-8px,6px,0) scale(.74);opacity:0}100%{transform:translate3d(-8px,6px,0) scale(.74);opacity:.16}}',
                '@keyframes pm-loadingSouthEast{0%,15%{transform:translate3d(8px,6px,0) scale(.74);opacity:.14}23%{opacity:.5}34%{transform:translate3d(-62px,-30px,0) scale(.96);opacity:.58}44%{transform:translate3d(-85px,-43px,0) scale(.18);opacity:0}45%,94%{transform:translate3d(-85px,-43px,0) scale(.18);opacity:0}95%{transform:translate3d(8px,6px,0) scale(.74);opacity:0}100%{transform:translate3d(8px,6px,0) scale(.74);opacity:.14}}',
                '@keyframes pm-loadingCore{0%,25%,31%,37%,43%,100%{opacity:.76;transform:translate(-50%,-50%) scale(.96)}28%,34%,40%{opacity:1;transform:translate(-50%,-50%) scale(1.04)}}',
                '@keyframes pm-loadingTextFocus{0%,4%{clip-path:inset(0 100% 0 0);opacity:0}8%{opacity:1}46%,84%{clip-path:inset(0 0 0 0);opacity:1}91%,100%{clip-path:inset(0 0 0 0);opacity:0}}',
                '@keyframes pm-loadingCursor{0%,4%{left:0;opacity:0}8%{left:0;opacity:.92}46%{left:calc(100% - 10px);opacity:.92}57%,100%{left:calc(100% - 10px);opacity:0}}',
                '.pm-loadError{margin:24px 8px;padding:20px 0;display:flex;align-items:center;gap:12px;flex-wrap:wrap}',
                '.pm-loadError .pm-error{margin:0;padding:0;flex:1;min-width:240px}',
                '@media (prefers-reduced-motion: reduce){.pm-loadingCore,.pm-loadingModule,.pm-loadingLabel:before,.pm-loadingCursor{animation:none}.pm-loadingCore{opacity:1;transform:translate(-50%,-50%);color:var(--dsw-alias-label-primary)}.pm-loadingModule{display:none}.pm-loadingModuleNorthEast{display:grid;right:42px;top:33px;opacity:.8;transform:none}.pm-loadingLabel{color:transparent;filter:none}.pm-loadingLabel:before{clip-path:inset(0);opacity:1}.pm-loadingCursor{left:calc(100% - 10px);opacity:.7}}',
                '.pm-drawer{position:fixed;z-index:230;box-sizing:border-box;top:66px;right:0;bottom:0;width:400px;max-width:calc(100vw - 64px);border-left:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);box-shadow:-10px 0 24px rgba(16,24,40,.06);display:flex;flex-direction:column}',
                '.pm-drawerHead{flex:none;padding:24px 24px 16px;border-bottom:1px solid var(--dsw-alias-border-l2)}',
                '.pm-drawerTitleRow{display:flex;align-items:flex-start;gap:12px}',
                '.pm-drawerTitle{min-width:0;flex:1;margin:0;font-size:19px;font-weight:650;line-height:1.3;overflow-wrap:anywhere}',
                '.pm-close{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:4px;border-radius:7px;display:inline-flex}',
                '.pm-close:hover{background:var(--dsw-alias-interactive-bg-hover)}',
                '.pm-repo{margin-top:10px;color:var(--dsw-alias-brand-primary);text-decoration:none;display:flex;align-items:center;gap:7px;font-size:12px;overflow-wrap:anywhere}',
                '.pm-drawerDesc{margin:10px 0 0;color:var(--dsw-alias-label-secondary);line-height:1.6}',
                '.pm-drawerBody{min-height:0;flex:1;overflow:auto;padding:0 24px 24px}',
                '.pm-versionDecision{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:22px 0 8px;font-size:13px}',
                '.pm-versionDecision strong{font-size:14px;font-weight:600}',
                '.pm-versionArrow{color:var(--dsw-alias-label-quaternary)}',
                '.pm-restart{color:var(--dsw-alias-label-tertiary);font-size:12px;padding-bottom:20px}',
                '.pm-section{border-top:1px solid var(--dsw-alias-border-l2);padding:18px 0}',
                '.pm-sectionTitle{margin:0 0 13px;font-size:13px;font-weight:600}',
                '.pm-kv{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.5fr);gap:11px 16px;color:var(--dsw-alias-label-tertiary);font-size:12.5px}',
                '.pm-kv dd,.pm-kv dt{margin:0;min-width:0}',
                '.pm-kv dd{text-align:right;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}',
                '.pm-disclosure{appearance:none;width:100%;height:54px;border:0;border-top:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;font-weight:600;padding:0;display:flex;align-items:center;justify-content:space-between}',
                '.pm-disclosureBody{padding:0 0 18px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.7}',
                '.pm-topics{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}',
                '.pm-topic{border-radius:999px;background:var(--dsw-alias-fill-tsp-secondary);padding:3px 8px;color:var(--dsw-alias-label-tertiary)}',
                '.pm-drawerFoot{flex:none;border-top:1px solid var(--dsw-alias-border-l2);padding:16px 24px;display:grid;grid-template-columns:1fr 1.15fr;gap:10px;background:var(--dsw-alias-bg-base)}',
                '.pm-dialogBackdrop{position:fixed;z-index:260;inset:0;background:rgba(15,23,42,.24);display:flex;align-items:center;justify-content:center;padding:20px}',
                '.pm-dialog{box-sizing:border-box;width:min(520px,100%);border:1px solid var(--dsw-alias-border-l2);border-radius:16px;background:var(--dsw-alias-bg-base);box-shadow:0 20px 60px rgba(15,23,42,.16);padding:24px}',
                '.pm-dialog h3{margin:0;font-size:18px;font-weight:650}',
                '.pm-dialog p{margin:8px 0 18px;color:var(--dsw-alias-label-tertiary);line-height:1.6}',
                '.pm-field{display:flex;flex-direction:column;gap:7px}',
                '.pm-field label{font-size:12px;font-weight:600}',
                '.pm-input{box-sizing:border-box;width:100%;height:40px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);font:inherit;padding:0 11px}',
                '.pm-input:focus{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px;border-color:transparent}',
                '.pm-dialogActions{display:flex;justify-content:flex-end;gap:10px;margin-top:22px}',
                '.pm-toast{position:fixed;z-index:280;left:50%;bottom:28px;transform:translateX(-50%);max-width:min(560px,calc(100vw - 32px));border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-base);box-shadow:0 8px 24px rgba(15,23,42,.13);padding:10px 14px;color:var(--dsw-alias-label-primary)}',
                '.pm-toastError{color:var(--dsw-alias-status-error, #c93535)}',
                '@media(max-width:680px){.pm-root{margin:0}.pm-head{padding-left:0}.pm-tabs,.pm-toolbar,.pm-helper,.pm-list{padding-left:0;padding-right:0}.pm-toolbar{flex-wrap:wrap}.pm-search{flex-basis:100%}.pm-drawer{top:61px;width:calc(100vw - 12px);max-width:none}.pm-row{padding-left:6px;padding-right:6px}}'
            ].join('');
            if (!existingStyle)
                document.head.appendChild(style);
            function Icon(props) {
                var type = props.type;
                var size = props.size || 16;
                var common = { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true };
                if (type === 'search')
                    return h('svg', common, h('circle', { cx: 7, cy: 7, r: 4.5, stroke: 'currentColor', strokeWidth: 1.4 }), h('path', { d: 'M10.4 10.4 14 14', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }));
                if (type === 'external')
                    return h('svg', common, h('path', { d: 'M9 2h5v5M8 8l6-6M13 9v3.5A1.5 1.5 0 0 1 11.5 14h-8A1.5 1.5 0 0 1 2 12.5v-8A1.5 1.5 0 0 1 3.5 3H7', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' }));
                if (type === 'plus')
                    return h('svg', common, h('path', { d: 'M8 3v10M3 8h10', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }));
                if (type === 'dots')
                    return h('svg', common, h('circle', { cx: 3, cy: 8, r: 1, fill: 'currentColor' }), h('circle', { cx: 8, cy: 8, r: 1, fill: 'currentColor' }), h('circle', { cx: 13, cy: 8, r: 1, fill: 'currentColor' }));
                if (type === 'github')
                    return h('svg', common, h('path', { d: 'M8 1.5a6.5 6.5 0 0 0-2.05 12.67c.33.06.45-.14.45-.32v-1.26c-1.84.4-2.23-.78-2.23-.78-.3-.77-.74-.97-.74-.97-.6-.42.05-.41.05-.41.67.05 1.02.69 1.02.69.6 1.02 1.56.72 1.94.55.06-.43.23-.72.42-.89-1.47-.17-3.02-.74-3.02-3.28 0-.72.26-1.32.68-1.78-.07-.17-.3-.84.06-1.75 0 0 .56-.18 1.79.68A6.2 6.2 0 0 1 8 4.63c.55 0 1.1.08 1.62.22 1.24-.86 1.8-.68 1.8-.68.36.91.13 1.58.06 1.75.42.46.68 1.06.68 1.78 0 2.55-1.55 3.11-3.03 3.28.24.21.45.61.45 1.23v1.64c0 .18.12.38.46.32A6.5 6.5 0 0 0 8 1.5Z', fill: 'currentColor' }));
                return h('svg', common, h('rect', { x: 2, y: 2, width: 5, height: 5, rx: 1.4, fill: 'currentColor' }), h('rect', { x: 9, y: 2, width: 5, height: 5, rx: 1.4, fill: 'currentColor', opacity: .45 }), h('rect', { x: 2, y: 9, width: 5, height: 5, rx: 1.4, fill: 'currentColor', opacity: .45 }), h('circle', { cx: 11.5, cy: 11.5, r: 2.5, stroke: 'currentColor', strokeWidth: 1.2, strokeDasharray: '1.5 1.3' }));
            }
            function safeIconSource(value) {
                if (!value)
                    return null;
                try {
                    var parsed = new URL(value);
                    return parsed.protocol === 'https:' ? parsed.toString() : null;
                }
                catch {
                    return null;
                }
            }
            function RemoteIcon(props) {
                var [failed, setFailed] = React.useState(false);
                var source = safeIconSource(props.src);
                React.useEffect(function () { setFailed(false); }, [props.src]);
                if (!source || failed)
                    return h('span', { className: props.fallbackClass || 'pm-marketFallback', 'aria-hidden': true }, h(Icon, { type: 'plugin', size: props.size || 18 }));
                return h('img', {
                    className: props.className || 'pm-marketIcon',
                    src: source,
                    alt: '',
                    loading: 'lazy',
                    referrerPolicy: 'no-referrer',
                    onError: function () { setFailed(true); }
                });
            }
            function apiCall(op, payload) {
                return fetch('/api/plugin-manager', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(Object.assign({ op: op }, payload || {}))
                }).then(function (response) {
                    return response.json().then(function (raw) {
                        var data = raw;
                        if (!response.ok || data.ok !== true)
                            throw new Error(data.error?.message || ('HTTP ' + response.status));
                        return data.value;
                    });
                });
            }
            function formatNumber(value) {
                return typeof value === 'number' ? value.toLocaleString('en-US') : '—';
            }
            function relativeTime(value) {
                if (!value)
                    return '—';
                var delta = Math.max(0, Date.now() - new Date(value).getTime());
                var hours = Math.floor(delta / 3600000);
                if (hours < 1)
                    return '刚刚';
                if (hours < 24)
                    return hours + ' 小时前';
                var days = Math.floor(hours / 24);
                return days + ' 天前';
            }
            function Button(props) {
                var next = Object.assign({}, props);
                var primary = next.primary;
                delete next.primary;
                next.className = 'pm-btn' + (primary ? ' pm-btnPrimary' : '') + (next.className ? ' ' + next.className : '');
                return h('button', next, props.children);
            }
            function Switch(props) {
                return h('button', {
                    type: 'button',
                    role: 'switch',
                    className: 'pm-switch' + (props.checked ? ' pm-switchOn' : ''),
                    'aria-checked': props.checked,
                    'aria-label': props.label,
                    disabled: props.disabled,
                    title: props.title,
                    onClick: function (event) { event.stopPropagation(); props.onChange(!props.checked); }
                });
            }
            function Search(props) {
                return h('label', { className: 'pm-search' }, h(Icon, { type: 'search' }), h('input', {
                    value: props.value,
                    placeholder: props.placeholder,
                    'aria-label': props.placeholder,
                    onChange: function (event) { props.onChange(event.target.value); }
                }));
            }
            function ImportDialog(props) {
                var [source, setSource] = React.useState('');
                var [busy, setBusy] = React.useState(false);
                var [error, setError] = React.useState('');
                function submit() {
                    if (source.trim() === '') {
                        setError('请输入插件来源');
                        return;
                    }
                    setBusy(true);
                    setError('');
                    props.onSubmit(source.trim()).then(props.onClose, function (reason) {
                        setError(reason instanceof Error ? reason.message : String(reason));
                    }).finally(function () { setBusy(false); });
                }
                return h('div', { className: 'pm-dialogBackdrop', onMouseDown: function (event) { if (event.target === event.currentTarget && !busy)
                        props.onClose(); } }, h('div', { className: 'pm-dialog', role: 'dialog', 'aria-modal': true, 'aria-label': '导入插件' }, h('h3', null, '导入插件'), h('p', null, '支持 npm 包、GitHub 仓库或本地绝对目录。安装时默认不执行第三方安装脚本。'), h('div', { className: 'pm-field' }, h('label', { htmlFor: 'pm-import-source' }, '插件来源'), h('input', { id: 'pm-import-source', className: 'pm-input', autoFocus: true, value: source, disabled: busy, placeholder: '例如 dsh-example@latest 或 github:user/repo', onChange: function (event) { setSource(event.target.value); }, onKeyDown: function (event) { if (event.key === 'Enter' && !busy)
                        submit(); } })), error ? h('p', { className: 'pm-error', role: 'alert' }, error) : null, h('div', { className: 'pm-dialogActions' }, h(Button, { type: 'button', disabled: busy, onClick: props.onClose }, '取消'), h(Button, { type: 'button', primary: true, disabled: busy, onClick: submit }, busy ? '正在导入…' : '导入'))));
            }
            function KeyValues(props) {
                var children = [];
                props.rows.forEach(function (row, index) {
                    children.push(h('dt', { key: 'k' + index }, row[0]));
                    children.push(h('dd', { key: 'v' + index }, row[1] || '—'));
                });
                return h('dl', { className: 'pm-kv' }, children);
            }
            function Disclosure(props) {
                var [open, setOpen] = React.useState(false);
                return h(React.Fragment, null, h('button', { type: 'button', className: 'pm-disclosure', 'aria-expanded': open, onClick: function () { setOpen(!open); } }, props.title, h(open ? P.IconChevronUpOutline14 : P.IconChevronDownOutline14)), open ? h('div', { className: 'pm-disclosureBody' }, props.children) : null);
            }
            function LocalDrawer(props) {
                var plugin = props.plugin;
                var readOnlyReason = !plugin.managed ? '此插件由系统组合管理，只读展示' : plugin.protected ? '此插件维持当前管理页面运行' : undefined;
                return h('aside', { className: 'pm-drawer', role: 'dialog', 'aria-label': plugin.name + ' 详情' }, h('header', { className: 'pm-drawerHead' }, h('div', { className: 'pm-drawerTitleRow' }, h('h3', { className: 'pm-drawerTitle' }, plugin.name), h('button', { type: 'button', className: 'pm-close', 'aria-label': '关闭详情', onClick: props.onClose }, h(P.IconCloseOutline16))), plugin.repository ? h('a', { className: 'pm-repo', href: 'https://github.com/' + plugin.repository, target: '_blank', rel: 'noreferrer' }, h(Icon, { type: 'github' }), 'github.com/' + plugin.repository, h(Icon, { type: 'external', size: 13 })) : null, h('p', { className: 'pm-drawerDesc' }, plugin.description || '此插件没有提供描述。')), h('div', { className: 'pm-drawerBody' }, h('section', { className: 'pm-section' }, h('h4', { className: 'pm-sectionTitle' }, '版本与来源'), h(KeyValues, { rows: [['版本', plugin.version], ['来源', plugin.source], ['安装声明', plugin.spec]] })), h('section', { className: 'pm-section' }, h('h4', { className: 'pm-sectionTitle' }, '挂载与生效'), h(KeyValues, { rows: [['期望状态', plugin.enabled ? '已启用' : '已停用'], ['当前运行', plugin.runtimePhase || (plugin.runtimeEnabled === false ? '未挂载' : '—')], ['组合行', plugin.rowId], ['管理方式', plugin.managed ? 'Profile 覆盖；重启 Web 后生效' : '系统 Bundle；当前页面只读']] })), h(Disclosure, { title: '技术信息' }, h(KeyValues, { rows: [['Host 入口', plugin.manifest.hostEntry], ['Client 入口', plugin.manifest.clientEntry], ['Bundle patch', plugin.manifest.bundlePatch], ['许可证', plugin.license]] }))), h('footer', { className: 'pm-drawerFoot' }, plugin.repository ? h('a', { className: 'pm-btn', href: 'https://github.com/' + plugin.repository, target: '_blank', rel: 'noreferrer' }, '在 GitHub 查看', h(Icon, { type: 'external', size: 13 })) : h(Button, { type: 'button', disabled: true }, '本地来源'), h(Button, { type: 'button', primary: true, disabled: props.busy || plugin.protected || !plugin.managed, title: readOnlyReason, onClick: function () { props.onToggle(!plugin.enabled); } }, !plugin.managed ? '系统组合只读' : plugin.protected ? '运行所必需' : plugin.enabled ? '停用插件' : '启用插件')));
            }
            function MarketDrawer(props) {
                var item = props.item;
                var detail = props.detail;
                var loading = props.loading;
                var url = detail && detail.url ? detail.url : 'https://github.com/' + item.repository;
                var latest = detail && detail.latestVersion;
                var status = detail && detail.status ? detail.status : item.status;
                var installable = detail && detail.installable !== undefined ? detail.installable !== false : item.installable !== false;
                var actionText = !installable ? '仅查看' : status === 'update-available' && latest ? '更新到 ' + latest : status === 'installed' ? '已安装' : '安装插件';
                return h('aside', { className: 'pm-drawer', role: 'dialog', 'aria-label': item.repository + ' 详情' }, h('header', { className: 'pm-drawerHead' }, h('div', { className: 'pm-drawerTitleRow' }, h(RemoteIcon, { src: detail && detail.iconUrl || item.iconUrl }), h('h3', { className: 'pm-drawerTitle' }, item.repository.split('/')[1]), h('button', { type: 'button', className: 'pm-close', 'aria-label': '关闭详情', onClick: props.onClose }, h(P.IconCloseOutline16))), h('a', { className: 'pm-repo', href: url, target: '_blank', rel: 'noreferrer' }, h(Icon, { type: 'github' }), 'github.com/' + item.repository, h(Icon, { type: 'external', size: 13 })), h('p', { className: 'pm-drawerDesc' }, detail && detail.description || item.description)), h('div', { className: 'pm-drawerBody' }, loading ? h('p', { className: 'pm-loading' }, '正在读取 GitHub 信息…') : !detail ? h('p', { className: 'pm-error' }, '仓库信息不可用') : detail.error ? h('p', { className: 'pm-error' }, detail.error) : h(React.Fragment, null, status !== 'not-installed' ? h(React.Fragment, null, h('div', { className: 'pm-versionDecision' }, h('span', null, '已安装 ', h('strong', null, detail.installedVersion || item.installedVersion || '—')), h('span', { className: 'pm-versionArrow' }, '→'), h('span', null, '最新 ', h('strong', null, latest || '—'))), h('div', { className: 'pm-restart' }, installable ? '更新后需要重启 Web' : 'Registry 发现条目当前仅支持查看')) : h('div', { className: 'pm-restart', style: { paddingTop: '20px' } }, installable ? '安装完成后需要重启 Web' : 'Registry 发现条目当前仅支持查看'), h('section', { className: 'pm-section' }, h('h4', { className: 'pm-sectionTitle' }, '概览'), h(KeyValues, { rows: [['作者', detail.author], ['许可', detail.license], ['语言', detail.language], ['仓库', 'Stars ' + formatNumber(detail.stars) + ' · Forks ' + formatNumber(detail.forks)], ['最后推送', relativeTime(detail.lastPushedAt)]] })), h(Disclosure, { title: 'GitHub 信息' }, h('div', null, '仓库：', item.repository, detail.releaseUrl ? h('div', null, '最新发布：', latest || '—') : null, detail.topics && detail.topics.length ? h('div', { className: 'pm-topics' }, detail.topics.map(function (topic) { return h('span', { className: 'pm-topic', key: topic }, topic); })) : null)), h(Disclosure, { title: '兼容与技术信息' }, h(KeyValues, { rows: [['DSH 要求', detail.manifest && detail.manifest.dshRequirement], ['插件清单', detail.manifest && detail.manifest.valid ? '已校验' : '未识别'], ['Host 入口', detail.manifest && detail.manifest.hostEntry], ['Client 入口', detail.manifest && detail.manifest.clientEntry]] })))), h('footer', { className: 'pm-drawerFoot' }, h('a', { className: 'pm-btn', href: url, target: '_blank', rel: 'noreferrer' }, '在 GitHub 查看', h(Icon, { type: 'external', size: 13 })), h(Button, { type: 'button', primary: installable, disabled: props.busy || loading || !installable || (status === 'installed' && !latest) || detail?.manifest?.valid === false, onClick: props.onInstall }, props.busy ? '正在处理…' : actionText)));
            }
            function PluginLoadingState() {
                var modules = [
                    ['NorthWest', false],
                    ['NorthEast', true],
                    ['SouthWest', false],
                    ['SouthEast', false]
                ];
                return h('div', { className: 'pm-loadingState', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }, h('div', { className: 'pm-loadingVisual', 'aria-hidden': true }, modules.map(function (module) {
                    return h('span', { key: module[0], className: 'pm-loadingModule pm-loadingModule' + module[0] + (module[1] ? ' pm-loadingModuleAccent' : '') }, h(P.IconCordisPluginOutline14));
                }), h('span', { className: 'pm-loadingCore' }, h(P.IconCordisPluginOutline14))), h('span', { className: 'pm-loadingLabel', 'data-text': 'Plugin Loading' }, 'Plugin Loading', h('span', { className: 'pm-loadingCursor', 'aria-hidden': true })));
            }
            function PluginManagerSection(props) {
                var api = props.api;
                var [tab, setTab] = React.useState('local');
                var [query, setQuery] = React.useState('');
                var [local, setLocal] = React.useState([]);
                var [market, setMarket] = React.useState([]);
                var [registryInfo, setRegistryInfo] = React.useState({ status: 'unavailable', generatedAt: null, warning: null });
                var [marketLoaded, setMarketLoaded] = React.useState(false);
                var [marketLoading, setMarketLoading] = React.useState(false);
                var [marketNextCursor, setMarketNextCursor] = React.useState(null);
                var [marketWarning, setMarketWarning] = React.useState('');
                var [loading, setLoading] = React.useState(true);
                var [error, setError] = React.useState('');
                var [attempt, setAttempt] = React.useState(0);
                var [busy, setBusy] = React.useState('');
                var [selectedLocal, setSelectedLocal] = React.useState(null);
                var [selectedMarket, setSelectedMarket] = React.useState(null);
                var [marketDetail, setMarketDetail] = React.useState(null);
                var [detailLoading, setDetailLoading] = React.useState(false);
                var [importOpen, setImportOpen] = React.useState(false);
                var [toast, setToast] = React.useState(null);
                var marketRequest = React.useRef(0);
                function notify(message, isError) {
                    setToast({ message: message, error: isError === true });
                    window.setTimeout(function () { setToast(null); }, 3600);
                }
                function loadLocal() {
                    return api.call('list').then(function (value) {
                        setLocal(value.plugins || []);
                        setSelectedLocal(function (current) { return current ? (value.plugins || []).find(function (item) { return item.name === current.name; }) || null : null; });
                    });
                }
                function loadMarket(search = query, cursor = '', append = false, force = false) {
                    var request = ++marketRequest.current;
                    setMarketLoading(true);
                    return api.call('marketplace', { query: search.trim(), cursor: cursor, limit: 24, force: force }).then(function (value) {
                        if (request !== marketRequest.current)
                            return;
                        var incoming = value.items || [];
                        setMarket(function (current) {
                            if (!append)
                                return incoming;
                            var seen = new Set(current.map(function (item) { return item.id; }));
                            return current.concat(incoming.filter(function (item) { return !seen.has(item.id); }));
                        });
                        setMarketLoaded(true);
                        setMarketNextCursor(value.page && value.page.nextCursor ? value.page.nextCursor : null);
                        setMarketWarning(value.warning || '');
                        setRegistryInfo(value.registry || { status: 'unavailable', generatedAt: null, warning: null });
                    }).finally(function () { if (request === marketRequest.current)
                        setMarketLoading(false); });
                }
                React.useEffect(function () {
                    var alive = true;
                    var settleTimer = null;
                    var startedAt = Date.now();
                    setLoading(true);
                    setError('');
                    Promise.all([loadLocal()]).catch(function (reason) {
                        if (alive)
                            setError(reason instanceof Error ? reason.message : String(reason));
                    }).finally(function () {
                        if (!alive)
                            return;
                        var remaining = Math.max(0, 680 - (Date.now() - startedAt));
                        settleTimer = window.setTimeout(function () { if (alive)
                            setLoading(false); }, remaining);
                    });
                    return function () { alive = false; if (settleTimer !== null)
                        window.clearTimeout(settleTimer); };
                }, [attempt]);
                React.useEffect(function () {
                    if (tab !== 'market')
                        return;
                    var timer = window.setTimeout(function () { loadMarket(query, '', false, false).catch(function (reason) { notify(reason instanceof Error ? reason.message : String(reason), true); }); }, query.trim() === '' ? 0 : 320);
                    return function () { window.clearTimeout(timer); };
                }, [tab, query, attempt]);
                React.useEffect(function () {
                    function onKey(event) {
                        if (event.key !== 'Escape' || importOpen)
                            return;
                        if (selectedLocal)
                            setSelectedLocal(null);
                        else if (selectedMarket)
                            setSelectedMarket(null);
                    }
                    document.addEventListener('keydown', onKey);
                    return function () { document.removeEventListener('keydown', onKey); };
                }, [selectedLocal, selectedMarket, importOpen]);
                function toggle(plugin, enabled) {
                    setBusy(plugin.name);
                    return api.call('setEnabled', { name: plugin.name, enabled: enabled }).then(function (result) {
                        setLocal(function (items) { return items.map(function (item) { return item.name === plugin.name ? Object.assign({}, item, { enabled: enabled }) : item; }); });
                        setSelectedLocal(function (current) { return current && current.name === plugin.name ? Object.assign({}, current, { enabled: enabled }) : current; });
                        notify((enabled ? '已启用 ' : '已停用 ') + plugin.name + (result.restartRequired ? '；重启 Web 后生效' : ''), false);
                    }).catch(function (reason) { notify(reason instanceof Error ? reason.message : String(reason), true); }).finally(function () { setBusy(''); });
                }
                function importPlugin(source) {
                    setBusy('import');
                    return api.call('import', { source: source }).then(function (result) {
                        notify('已导入 ' + (result.plugin ? result.plugin.name : '插件') + '；重启 Web 后生效', false);
                        return Promise.all([loadLocal(), loadMarket(query)]);
                    }).finally(function () { setBusy(''); });
                }
                function openMarket(item) {
                    setSelectedLocal(null);
                    setSelectedMarket(item);
                    setMarketDetail(null);
                    setDetailLoading(true);
                    api.call('marketplace.detail', { id: item.id }).then(function (value) { setMarketDetail(value); }, function (reason) { setMarketDetail({ error: reason instanceof Error ? reason.message : String(reason) }); }).finally(function () { setDetailLoading(false); });
                }
                function installMarket() {
                    if (!selectedMarket)
                        return;
                    var target = selectedMarket;
                    setBusy(target.id);
                    api.call('marketplace.install', { id: target.id }).then(function (result) {
                        notify('已安装 ' + (result.plugin ? result.plugin.name : target.repository) + '；重启 Web 后生效', false);
                        return Promise.all([loadLocal(), loadMarket(query, '', false, true), api.call('marketplace.detail', { id: target.id, force: true }).then(function (value) { setMarketDetail(value); })]);
                    }).catch(function (reason) { notify(reason instanceof Error ? reason.message : String(reason), true); }).finally(function () { setBusy(''); });
                }
                var needle = query.trim().toLowerCase();
                var visibleLocal = local.filter(function (plugin) { return needle === '' || plugin.name.toLowerCase().includes(needle) || String(plugin.description || '').toLowerCase().includes(needle); });
                var visibleMarket = market;
                var registryStatusLabel = registryInfo.status === 'fresh' ? 'Registry 已更新' : registryInfo.status === 'stale' ? 'Registry 使用缓存' : 'Registry 暂不可用，当前保留精选';
                var body;
                if (loading)
                    body = h(PluginLoadingState);
                else if (error)
                    body = h('div', { className: 'pm-loadError' }, h('p', { className: 'pm-error', role: 'alert' }, '加载 Plugin Manager 失败：' + error), h(Button, { type: 'button', onClick: function () { setAttempt(function (value) { return value + 1; }); } }, '重试'));
                else if (tab === 'local')
                    body = visibleLocal.length === 0 ? h('p', { className: 'pm-empty' }, '没有匹配的本地插件。') : h('div', { className: 'pm-list', 'data-testid': 'local-list' }, visibleLocal.map(function (plugin) {
                        return h('div', { key: plugin.name, className: 'pm-row pm-rowClick' + (selectedLocal && selectedLocal.name === plugin.name ? ' pm-rowSelected' : ''), onClick: function () { setSelectedMarket(null); setSelectedLocal(plugin); } }, h('div', { className: 'pm-rowMain' }, h('span', { className: 'pm-pluginIcon' }, h(Icon, { type: 'plugin', size: 15 })), h('div', { className: 'pm-rowCopy' }, h('div', { className: 'pm-rowTitle' }, plugin.name), h('div', { className: 'pm-rowDesc' }, plugin.description || '此插件没有提供描述。'), h('div', { className: 'pm-rowMeta' }, h('span', null, plugin.version), h('span', null, '·'), h('span', null, plugin.source), !plugin.managed ? h('span', null, '· 只读') : plugin.protected ? h('span', null, '· 运行所必需') : null))), h('div', { className: 'pm-rowSide' }, h(Switch, { checked: plugin.enabled, disabled: busy === plugin.name || plugin.protected || !plugin.managed, label: (plugin.enabled ? '停用 ' : '启用 ') + plugin.name, title: !plugin.managed ? '此插件由系统组合管理，只读展示' : plugin.protected ? '此插件维持当前管理页面运行' : undefined, onChange: function (enabled) { toggle(plugin, enabled); } })));
                    }));
                else if (marketLoading && !marketLoaded)
                    body = h('p', { className: 'pm-empty', role: 'status' }, '正在搜索 DSH Plugin Registry…');
                else
                    body = h(React.Fragment, null, visibleMarket.length === 0 ? h('p', { className: 'pm-empty' }, '远程 Registry 中没有匹配且通过 manifest 校验的插件。') : h('div', { className: 'pm-list', 'data-testid': 'market-list' }, visibleMarket.map(function (item) {
                        var statusLabel = item.installable === false ? '仅查看' : item.status === 'installed' ? '已安装' : item.status === 'update-available' ? '可更新' : '未安装';
                        return h('button', { key: item.id, type: 'button', className: 'pm-row pm-rowClick' + (selectedMarket && selectedMarket.id === item.id ? ' pm-rowSelected' : ''), onClick: function () { openMarket(item); } }, h('div', { className: 'pm-marketMain' }, h(RemoteIcon, { src: item.iconUrl }), h('div', { className: 'pm-marketCopy' }, h('div', { className: 'pm-rowTitle' }, item.repository), h('div', { className: 'pm-rowDesc' }, item.description), h('div', { className: 'pm-rowMeta' }, item.marketSource === 'npm' ? 'npm Registry' : item.marketSource === 'registry' ? 'DSH Registry' : '精选', item.latestVersion ? ' · ' + item.latestVersion : ''))), h('div', { className: 'pm-rowSide' }, h('span', { className: 'pm-status' + (item.status === 'update-available' ? ' pm-statusUpdate' : '') }, statusLabel), h(P.IconChevronRightOutline14)));
                    })), marketNextCursor ? h('div', { className: 'pm-loadMore' }, h(Button, { type: 'button', disabled: marketLoading, onClick: function () { if (marketNextCursor)
                            loadMarket(query, marketNextCursor, true, false); } }, marketLoading ? '加载中…' : '加载更多')) : null);
                return h('section', { className: 'pm-root', 'aria-label': 'Plugin Manager' }, h('header', { className: 'pm-head' }, h('h2', null, 'Plugin')), h('div', { className: 'pm-tabs', role: 'tablist' }, h('button', { type: 'button', role: 'tab', className: 'pm-tab' + (tab === 'local' ? ' pm-tabOn' : ''), 'aria-selected': tab === 'local', onClick: function () { setTab('local'); setQuery(''); setSelectedMarket(null); } }, '本地插件'), h('button', { type: 'button', role: 'tab', className: 'pm-tab' + (tab === 'market' ? ' pm-tabOn' : ''), 'aria-selected': tab === 'market', onClick: function () { setTab('market'); setQuery(''); setSelectedLocal(null); } }, '插件市场')), h('div', { className: 'pm-toolbar' }, h(Search, { value: query, onChange: setQuery, placeholder: tab === 'local' ? '搜索本地插件' : '搜索 DSH 插件或 npm 包' }), tab === 'local' ? h(React.Fragment, null, h(Button, { type: 'button', onClick: function () { setImportOpen(true); } }, h(Icon, { type: 'plus', size: 14 }), '导入插件'), h(Button, { type: 'button', className: 'pm-iconBtn', title: '更多操作', 'aria-label': '更多操作' }, h(Icon, { type: 'dots' }))) : null), tab === 'market' ? h('p', { className: 'pm-helper' }, '自动搜索 npm 与 DSH Registry · 只有含有效 dsh manifest 的精确版本可以一键安装') : null, tab === 'market' ? h('p', { className: 'pm-registryState' + (registryInfo.status === 'fresh' ? '' : ' pm-registryStateWarning'), role: 'status' }, registryStatusLabel) : null, tab === 'market' && marketWarning ? h('p', { className: 'pm-registryState pm-registryStateWarning', role: 'status' }, 'npm 搜索暂时不可用：' + marketWarning) : null, body, selectedLocal ? h(LocalDrawer, { plugin: selectedLocal, busy: busy === selectedLocal.name, onClose: function () { setSelectedLocal(null); }, onToggle: function (enabled) { if (selectedLocal)
                        toggle(selectedLocal, enabled); } }) : null, selectedMarket ? h(MarketDrawer, { item: selectedMarket, detail: marketDetail, loading: detailLoading, busy: busy === selectedMarket.id, onClose: function () { setSelectedMarket(null); }, onInstall: installMarket }) : null, importOpen ? h(ImportDialog, { onClose: function () { if (busy !== 'import')
                        setImportOpen(false); }, onSubmit: importPlugin }) : null, toast ? h('div', { className: 'pm-toast' + (toast.error ? ' pm-toastError' : ''), role: 'status' }, toast.message) : null);
            }
            var module = { exports: {} };
            module.exports.name = 'plugin-manager-ui';
            module.exports.inject = ['slots'];
            module.exports.apply = function (ctx) {
                var slots = ctx.get('slots');
                if (slots === undefined || typeof slots.register !== 'function')
                    return;
                var activeSlots = slots;
                activeSlots.inject('extension.manager.section', function () {
                    return activeSlots.register({
                        name: 'extension.manager.section',
                        id: 'plugin',
                        order: 30,
                        label: function () { return 'Plugin'; },
                        inject: function () { return { api: { call: apiCall } }; }
                    }, PluginManagerSection);
                });
            };
            return module.exports;
        }
    });
})();
//# sourceMappingURL=client.js.map