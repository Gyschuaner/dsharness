"use strict";
/**
 * dsh-shadow-billing — Client half（DSH-032）。
 *
 * 三个 Slot：
 * - conversation.session.header.utilities：会话头部徽标（累计 token + 估算费用，点击弹详情）；
 * - conversation.view：与「对话 / 轨迹」并列的「用量」页签（统计卡 + 趋势 + 排行 + 明细）；
 * - settings.section：设置页（价目表与口径说明）。
 *
 * 动效：数字滚动（300ms ease-out）、趋势面积图路径绘制入场（800ms）、
 * 统计卡淡入上移（200ms）；prefers-reduced-motion 下全部降级为瞬时。
 */
// ---- 工具（不依赖 React） -------------------------------------------------
function fmtTokens(n) {
    if (n >= 1_000_000)
        return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)
        return (n / 1_000).toFixed(1) + 'k';
    return String(n);
}
function fmtCost(costNano) {
    return (costNano / 1e9).toFixed(2);
}
function fmtTime(ts) {
    const d = new Date(ts);
    const p = (x) => String(x).padStart(2, '0');
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
async function apiGet(url) {
    try {
        const res = await fetch(url, { headers: { accept: 'application/json' } });
        if (!res.ok)
            return null;
        const body = (await res.json());
        return body.ok ? (body.value ?? null) : null;
    }
    catch {
        return null;
    }
}
/** 尊重 prefers-reduced-motion。 */
function prefersReducedMotion() {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
// ---- 插件入口 -------------------------------------------------------------
(function () {
    window.__ModuleLoader__.load({
        id: 'dsh-shadow-billing',
        factory: function (require) {
            var React = require('react');
            var h = React.createElement;
            /** 数字滚动：从旧值缓动滚到新值（300ms ease-out）。 */
            function useCountUp(target, duration = 300) {
                const [display, setDisplay] = React.useState(target);
                const prevRef = React.useRef(target);
                React.useEffect(() => {
                    const from = prevRef.current;
                    if (from === target)
                        return;
                    const start = performance.now();
                    let raf = 0;
                    const step = (now) => {
                        const t = Math.min(1, (now - start) / duration);
                        const eased = 1 - Math.pow(1 - t, 3);
                        setDisplay(from + (target - from) * eased);
                        if (t < 1)
                            raf = requestAnimationFrame(step);
                        else
                            prevRef.current = target;
                    };
                    raf = requestAnimationFrame(step);
                    return () => cancelAnimationFrame(raf);
                }, [target, duration]);
                return display;
            }
            /** 统计卡：淡入上移入场。 */
            function StatCard(props) {
                return h('div', { className: 'sb-card' + (props.accent ? ' sb-cardAccent' : ''), style: prefersReducedMotion() ? undefined : { animation: 'sb-card-in .2s ease-out both' } }, h('div', { className: 'sb-cardLabel' }, props.label), h('div', { className: 'sb-cardValue' }, props.value), props.hint ? h('div', { className: 'sb-cardHint' }, props.hint) : null);
            }
            /** 会话头部徽标：累计 token + 估算费用，点击弹详情层。 */
            function SessionBadge(props) {
                const sessionId = typeof props.sessionId === 'string' ? props.sessionId : '';
                const [data, setData] = React.useState(null);
                const [open, setOpen] = React.useState(false);
                const [failed, setFailed] = React.useState(false);
                const costNano = data?.costNano ?? 0;
                const tokens = (data?.inputTokens ?? 0) + (data?.outputTokens ?? 0) + (data?.cacheReadTokens ?? 0);
                const shownCost = useCountUp(costNano / 1e9, 300);
                React.useEffect(() => {
                    if (!sessionId)
                        return;
                    let alive = true;
                    const load = () => {
                        apiGet(`/api/shadow-billing/session?sessionId=${encodeURIComponent(sessionId)}`).then((v) => {
                            if (!alive)
                                return;
                            if (v === null)
                                setFailed(true);
                            else {
                                setData(v);
                                setFailed(false);
                            }
                        });
                    };
                    load();
                    const timer = setInterval(load, 30_000);
                    return () => { alive = false; clearInterval(timer); };
                }, [sessionId]);
                if (!sessionId || (data === null && !failed)) {
                    return h('span', { className: 'sb-badge', 'data-testid': 'sb-badge-loading' }, '…');
                }
                const breathe = costNano >= 1e9; // 估算费用 ≥ ¥1 时呼吸提示
                return h('div', { className: 'sb-badgeWrap' }, h('button', {
                    type: 'button',
                    className: 'sb-badge' + (breathe ? ' sb-badgeHot' : '') + (open ? ' sb-badgeOpen' : ''),
                    onClick: () => setOpen(!open),
                    'aria-expanded': open,
                    title: '本会话估算消耗（影子计费）',
                    'data-testid': 'sb-badge',
                }, h('span', { className: 'sb-badgeCost' }, `≈¥${shownCost.toFixed(2)}`), h('span', { className: 'sb-badgeTokens' }, fmtTokens(tokens))), open ? h('div', { className: 'sb-popover', role: 'dialog', 'data-testid': 'sb-popover' }, h('div', { className: 'sb-popoverTitle' }, '本会话估算消耗'), data === null ? h('p', { className: 'sb-muted' }, '暂无记录') : h(React.Fragment, null, h('div', { className: 'sb-popoverRow' }, h('span', null, '请求'), h('b', null, String(data.requests))), h('div', { className: 'sb-popoverRow' }, h('span', null, '未命中输入'), h('b', null, fmtTokens(data.inputTokens))), h('div', { className: 'sb-popoverRow' }, h('span', null, '缓存命中'), h('b', null, fmtTokens(data.cacheReadTokens))), h('div', { className: 'sb-popoverRow' }, h('span', null, '输出'), h('b', null, fmtTokens(data.outputTokens))), h('div', { className: 'sb-popoverRow sb-popoverRowTotal' }, h('span', null, '估算费用'), h('b', null, `¥${fmtCost(data.costNano)}`)), data.lastAt !== null ? h('p', { className: 'sb-muted' }, `最近调用 ${fmtTime(data.lastAt)}`) : null), h('p', { className: 'sb-footnote' }, '按 DeepSeek Flash 峰谷价影子计费，非真实账单')) : null);
            }
            /** 趋势面积图：SVG 路径绘制入场 + 数据点。 */
            function TrendChart(props) {
                const rows = props.daily;
                const W = 640;
                const H = 160;
                const PAD = 4;
                if (rows.length === 0) {
                    return h('p', { className: 'sb-muted', style: { padding: '24px 0', textAlign: 'center' } }, '该时间窗暂无用量记录');
                }
                const max = Math.max(1, ...rows.map((r) => r.inputTokens + r.outputTokens + r.cacheReadTokens));
                const stepX = (W - PAD * 2) / Math.max(1, rows.length - 1);
                const points = rows.map((r, i) => {
                    const x = PAD + i * stepX;
                    const y = H - PAD - ((r.inputTokens + r.outputTokens + r.cacheReadTokens) / max) * (H - PAD * 2);
                    return { x, y, r };
                });
                const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
                const firstX = points[0]?.x ?? PAD;
                const lastX = points[points.length - 1]?.x ?? PAD;
                const area = `${line} L${lastX},${H - PAD} L${firstX},${H - PAD} Z`;
                const reduced = prefersReducedMotion();
                return h('div', { className: 'sb-trend' }, h('svg', {
                    viewBox: `0 0 ${W} ${H}`,
                    preserveAspectRatio: 'none',
                    className: 'sb-trendSvg',
                    role: 'img',
                    'aria-label': 'token 用量趋势',
                }, h('defs', null, h('linearGradient', { id: 'sb-trend-fill', x1: '0', y1: '0', x2: '0', y2: '1' }, h('stop', { offset: '0%', stopColor: 'var(--dsw-alias-brand-primary)', stopOpacity: 0.35 }), h('stop', { offset: '100%', stopColor: 'var(--dsw-alias-brand-primary)', stopOpacity: 0.02 }))), h('path', { d: area, fill: 'url(#sb-trend-fill)', className: 'sb-trendArea' }), h('path', {
                    d: line,
                    fill: 'none',
                    className: 'sb-trendLine',
                    style: reduced ? undefined : { strokeDasharray: 600, strokeDashoffset: 600 },
                }), points.map((p, i) => h('circle', { key: i, cx: p.x, cy: p.y, r: 2.5, className: 'sb-trendDot' }))));
            }
            /** 用量页签主视图。 */
            function UsageView() {
                const [days, setDays] = React.useState(7);
                const [summary, setSummary] = React.useState(null);
                const [models, setModels] = React.useState([]);
                const [daily, setDaily] = React.useState([]);
                const [reqs, setReqs] = React.useState(null);
                const [page, setPage] = React.useState(0);
                const [refreshing, setRefreshing] = React.useState(false);
                const load = React.useCallback((d, p) => {
                    apiGet(`/api/shadow-billing/summary?days=${d}`).then(setSummary);
                    apiGet(`/api/shadow-billing/by-model?days=${d}`).then((v) => setModels(v?.models ?? []));
                    apiGet(`/api/shadow-billing/daily?days=${d}`).then((v) => setDaily(v?.daily ?? []));
                    apiGet(`/api/shadow-billing/requests?days=${d}&page=${p}&size=10`).then((v) => {
                        if (v !== null) {
                            setReqs(v);
                            setPage(p);
                        }
                    });
                }, []);
                React.useEffect(() => { load(days, 0); }, [days, load]);
                const refresh = () => {
                    setRefreshing(true);
                    fetch('/api/shadow-billing/fold', { method: 'POST' })
                        .catch(() => { })
                        .finally(() => {
                        load(days, page);
                        setRefreshing(false);
                    });
                };
                const totalTokens = (summary?.inputTokens ?? 0) + (summary?.outputTokens ?? 0) + (summary?.cacheReadTokens ?? 0);
                const cacheRate = totalTokens > 0 ? ((summary?.cacheReadTokens ?? 0) / totalTokens) * 100 : 0;
                const shownCost = useCountUp((summary?.costNano ?? 0) / 1e9, 400);
                const daysOptions = [[1, '今天'], [7, '7 天'], [30, '30 天'], [90, '90 天'], [0, '全部']];
                return h('div', { className: 'sb-root', 'data-testid': 'sb-usage-view' }, h('div', { className: 'sb-head' }, h('h2', null, '用量'), h('div', { className: 'sb-headRight' }, h('div', { className: 'sb-days', role: 'tablist' }, daysOptions.map(([d, label]) => h('button', {
                    key: d,
                    type: 'button',
                    role: 'tab',
                    'aria-selected': days === d,
                    className: 'sb-dayTab' + (days === d ? ' sb-dayTabOn' : ''),
                    onClick: () => setDays(d),
                }, label))), h('button', { type: 'button', className: 'sb-btn', onClick: refresh, disabled: refreshing, title: '重新折叠日志并刷新' }, refreshing ? '刷新中…' : '刷新'))), h('div', { className: 'sb-cards' }, h(StatCard, { label: '估算费用', value: `¥${shownCost.toFixed(2)}`, hint: '影子计费 · 非真实账单', accent: true }), h(StatCard, { label: 'Token 消耗', value: fmtTokens(totalTokens), hint: `${fmtTokens(summary?.inputTokens ?? 0)} 未命中 + ${fmtTokens(summary?.cacheReadTokens ?? 0)} 命中 + ${fmtTokens(summary?.outputTokens ?? 0)} 输出` }), h(StatCard, { label: '请求次数', value: String(summary?.requests ?? 0), hint: `${days === 0 ? '全部' : '近 ' + days + ' 天'}` }), h(StatCard, { label: '缓存命中率', value: `${cacheRate.toFixed(1)}%`, hint: '缓存命中 token 占比' })), h(TrendChart, { daily }), h('div', { className: 'sb-grid' }, h('section', { className: 'sb-panel' }, h('h3', null, '模型排行'), models.length === 0 ? h('p', { className: 'sb-muted' }, '暂无记录') : h('table', { className: 'sb-table' }, h('thead', null, h('tr', null, h('th', null, '模型'), h('th', { className: 'sb-num' }, '请求'), h('th', { className: 'sb-num' }, 'Token'), h('th', { className: 'sb-num' }, '估算费用'))), h('tbody', null, models.map((m, i) => h('tr', { key: i }, h('td', null, m.model), h('td', { className: 'sb-num' }, String(m.requests)), h('td', { className: 'sb-num' }, fmtTokens(m.inputTokens + m.outputTokens + m.cacheReadTokens)), h('td', { className: 'sb-num' }, `¥${fmtCost(m.costNano)}`)))))), h('section', { className: 'sb-panel' }, h('h3', null, '请求明细'), reqs === null || reqs.rows.length === 0 ? h('p', { className: 'sb-muted' }, '暂无记录') : h(React.Fragment, null, h('table', { className: 'sb-table sb-tableDense' }, h('thead', null, h('tr', null, h('th', null, '时间'), h('th', null, '模型'), h('th', { className: 'sb-num' }, '输入'), h('th', { className: 'sb-num' }, '命中'), h('th', { className: 'sb-num' }, '输出'), h('th', { className: 'sb-num' }, '费用'))), h('tbody', null, reqs.rows.map((r) => h('tr', { key: r.record_id }, h('td', { className: 'sb-mono' }, fmtTime(r.created_at)), h('td', null, r.model), h('td', { className: 'sb-num' }, fmtTokens(r.input_tokens)), h('td', { className: 'sb-num' }, fmtTokens(r.cache_read_tokens)), h('td', { className: 'sb-num' }, fmtTokens(r.output_tokens)), h('td', { className: 'sb-num' }, `¥${fmtCost(r.cost_nano)}`))))), h('div', { className: 'sb-pager' }, h('button', { type: 'button', className: 'sb-btn', disabled: page <= 0, onClick: () => load(days, page - 1) }, '上一页'), h('span', { className: 'sb-muted' }, `第 ${page + 1} 页 · 共 ${reqs.total} 条`), h('button', { type: 'button', className: 'sb-btn', disabled: (page + 1) * 10 >= reqs.total, onClick: () => load(days, page + 1) }, '下一页'))))), h('p', { className: 'sb-footnote' }, '费用按 DeepSeek Flash 官方峰谷价（¥/1M：命中 0.05 / 未命中 1.5 / 输出 4.5，高峰 ×2）影子计费，仅供成本核算参考，非真实账单。'));
            }
            /** 设置页：价目表与口径说明。 */
            function SettingsView() {
                const [status, setStatus] = React.useState(null);
                React.useEffect(() => {
                    apiGet('/api/shadow-billing/status').then(setStatus);
                }, []);
                return h('div', { className: 'sb-settings', 'data-testid': 'sb-settings' }, h('h2', null, '用量计费'), h('p', null, '按 DeepSeek Flash 官方峰谷价对本地模型调用做影子计费。数据来自 DSH 会话日志中的真实 token 用量，仅作成本核算参考，不是真实账单。'), h('h3', null, '价目表（¥ / 1M tokens）'), h('table', { className: 'sb-table' }, h('thead', null, h('tr', null, h('th', null, '档位'), h('th', null, '低谷价'), h('th', null, '高峰价（×2）'))), h('tbody', null, h('tr', null, h('td', null, '缓存命中'), h('td', null, '0.05'), h('td', null, '0.10')), h('tr', null, h('td', null, '未命中'), h('td', null, '1.5'), h('td', null, '3.0')), h('tr', null, h('td', null, '输出'), h('td', null, '4.5'), h('td', null, '9.0')))), h('p', { className: 'sb-muted' }, '高峰时段：北京时间 9:00-12:00 / 14:00-18:00；2026-08-23 起周末全天低谷价。峰谷按北京时间判定，不随用户时区漂移。'), h('h3', null, '数据源'), status === null ? h('p', { className: 'sb-muted' }, '读取中…') : h(React.Fragment, null, h('p', { className: 'sb-mono' }, status.sessionsRoot), h('p', { className: 'sb-muted' }, status.lastFold === null
                    ? '尚未完成日志折叠。'
                    : `上次折叠：${fmtTime(status.lastFold.at)} · 扫描 ${status.lastFold.scanned} 个会话 · 新增 ${status.lastFold.imported} 条记录。`)));
            }
            var existingStyle = document.querySelector('style[data-plugin="dsh-shadow-billing"]');
            var style = existingStyle || document.createElement('style');
            style.setAttribute('data-plugin', 'dsh-shadow-billing');
            style.textContent = [
                /* 徽标 */
                '.sb-badgeWrap{position:relative;display:inline-flex}',
                '.sb-badge{appearance:none;display:inline-flex;align-items:baseline;gap:6px;height:24px;padding:0 9px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;transition:border-color .15s,background .15s;white-space:nowrap}',
                '.sb-badge:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary)}',
                '.sb-badgeOpen{border-color:var(--dsw-alias-brand-primary)}',
                '.sb-badgeCost{font-weight:600;color:var(--dsw-alias-label-primary)}',
                '.sb-badgeTokens{color:var(--dsw-alias-label-tertiary)}',
                '.sb-badgeHot{animation:sb-breathe 2s ease-in-out infinite}',
                '@keyframes sb-breathe{0%,100%{opacity:1}50%{opacity:.72}}',
                /* 详情浮层 */
                '.sb-popover{position:absolute;top:calc(100% + 6px);right:0;z-index:50;width:240px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-module-platform);box-shadow:0 8px 24px rgba(0,0,0,.14);font-size:12px}',
                '.sb-popoverTitle{font-weight:600;color:var(--dsw-alias-label-primary);margin-bottom:6px}',
                '.sb-popoverRow{display:flex;justify-content:space-between;padding:2px 0;color:var(--dsw-alias-label-secondary)}',
                '.sb-popoverRowTotal{border-top:1px solid var(--dsw-alias-border-l1);margin-top:4px;padding-top:6px}',
                '.sb-popoverRowTotal b{color:var(--dsw-alias-label-primary)}',
                /* 用量页签 */
                '.sb-root{box-sizing:border-box;max-width:980px;margin:0 auto;padding:8px 8px 24px;color:var(--dsw-alias-label-primary);font-size:13px;display:flex;flex-direction:column;gap:14px}',
                '.sb-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap}',
                '.sb-head h2{margin:0;font-size:22px;line-height:1.25;font-weight:650;letter-spacing:-.02em}',
                '.sb-headRight{display:flex;align-items:center;gap:10px}',
                '.sb-days{display:flex;gap:2px;padding:2px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-module-platform)}',
                '.sb-dayTab{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;padding:3px 10px;border-radius:6px;cursor:pointer}',
                '.sb-dayTabOn{background:var(--dsw-alias-brand-primary);color:#fff;font-weight:600}',
                '.sb-btn{appearance:none;height:30px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer}',
                '.sb-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
                '.sb-btn:disabled{cursor:not-allowed;opacity:.5}',
                '.sb-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}',
                '.sb-card{padding:12px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-module-platform)}',
                '.sb-cardAccent{border-color:var(--dsw-alias-brand-primary)}',
                '.sb-cardLabel{font-size:12px;color:var(--dsw-alias-label-tertiary)}',
                '.sb-cardValue{font-size:20px;font-weight:650;margin-top:4px;letter-spacing:-.01em;font-variant-numeric:tabular-nums}',
                '.sb-cardHint{font-size:11px;color:var(--dsw-alias-label-quaternary);margin-top:2px}',
                '@keyframes sb-card-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}',
                /* 趋势图 */
                '.sb-trend{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px 12px;background:var(--dsw-alias-bg-module-platform)}',
                '.sb-trendSvg{width:100%;height:160px;display:block}',
                '.sb-trendLine{stroke:var(--dsw-alias-brand-primary);stroke-width:1.5;animation:sb-draw .8s ease-out forwards}',
                '@keyframes sb-draw{to{stroke-dashoffset:0}}',
                '.sb-trendDot{fill:var(--dsw-alias-brand-primary)}',
                /* 面板与表格 */
                '.sb-grid{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,3fr);gap:12px}',
                '.sb-panel{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:12px 14px;background:var(--dsw-alias-bg-module-platform);min-width:0}',
                '.sb-panel h3{margin:0 0 8px;font-size:14px;font-weight:600}',
                '.sb-table{width:100%;border-collapse:collapse;font-size:12px}',
                '.sb-table th{text-align:left;color:var(--dsw-alias-label-tertiary);font-weight:500;padding:4px 6px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
                '.sb-table td{padding:5px 6px;border-bottom:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}',
                '.sb-table tr:last-child td{border-bottom:0}',
                '.sb-num{text-align:right;font-variant-numeric:tabular-nums}',
                '.sb-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px}',
                '.sb-pager{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:8px}',
                '.sb-muted{color:var(--dsw-alias-label-tertiary);font-size:12px;margin:4px 0}',
                '.sb-footnote{color:var(--dsw-alias-label-quaternary);font-size:11px;margin:0}',
                /* 设置页 */
                '.sb-settings{box-sizing:border-box;max-width:720px;margin:0 auto;padding:8px 8px 24px;color:var(--dsw-alias-label-primary);font-size:13px;display:flex;flex-direction:column;gap:10px}',
                '.sb-settings h2{margin:0;font-size:22px;font-weight:650;letter-spacing:-.02em}',
                '.sb-settings h3{margin:8px 0 4px;font-size:14px;font-weight:600}',
                '@media (prefers-reduced-motion: reduce){.sb-badgeHot,.sb-trendLine,.sb-card{animation:none}}',
            ].join('');
            if (!existingStyle)
                document.head.appendChild(style);
            var module = { exports: {} };
            module.exports.name = 'shadow-billing-ui';
            module.exports.inject = ['slots'];
            module.exports.apply = function (ctx) {
                var slots = ctx.get('slots');
                if (slots === undefined || typeof slots.register !== 'function')
                    return;
                var activeSlots = slots;
                activeSlots.inject('conversation.session.header.utilities', function () {
                    return activeSlots.register({
                        name: 'conversation.session.header.utilities',
                        id: 'shadow-billing',
                        order: -10,
                    }, SessionBadge);
                });
                activeSlots.inject('conversation.view', function () {
                    return activeSlots.register({
                        name: 'conversation.view',
                        id: 'shadow-billing-usage',
                        order: 20,
                        label: function () { return '用量'; },
                    }, UsageView);
                });
                activeSlots.inject('settings.section', function () {
                    return activeSlots.register({
                        name: 'settings.section',
                        id: 'shadow-billing',
                        order: 25,
                        label: function () { return '用量计费'; },
                    }, SettingsView);
                });
            };
            return module.exports;
        },
    });
})();
//# sourceMappingURL=client.js.map