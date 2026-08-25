"use strict";
(function () {
    window.__ModuleLoader__.load({
        id: 'dsh-billing',
        factory: function (requireModule) {
            var React = requireModule('react');
            var h = React.createElement;
            var P = requireModule('@deepseek-ai/dsh-client-ui-primitives');
            var existingStyle = document.querySelector('style[data-plugin="dsh-billing"]');
            var style = existingStyle || document.createElement('style');
            style.setAttribute('data-plugin', 'dsh-billing');
            style.textContent = [
                '.bl-page{box-sizing:border-box;width:100%;height:100%;overflow:auto;padding:30px 34px 46px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}',
                '.bl-shell{max-width:1180px;margin:0 auto}',
                '.bl-heading{display:flex;align-items:flex-start;gap:12px;margin-bottom:26px}',
                '.bl-headingIcon{width:34px;height:34px;border-radius:10px;background:color-mix(in srgb,#1677ff 10%,var(--dsw-alias-bg-base));color:#1677ff;display:grid;place-items:center;flex:none}',
                '.bl-headingCopy{min-width:0}',
                '.bl-title{margin:0;font-size:26px;line-height:34px;font-weight:680;letter-spacing:-.02em}',
                '.bl-subtitle{margin-top:5px;color:var(--dsw-alias-label-tertiary);font-size:13px}',
                '.bl-headingActions{margin-left:auto;display:flex;align-items:center;gap:8px}',
                '.bl-range{height:36px;display:inline-flex;align-items:center;gap:8px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-base);padding:0 11px;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;white-space:nowrap}',
                '.bl-iconBtn{appearance:none;height:36px;width:36px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);cursor:pointer;display:inline-grid;place-items:center}',
                '.bl-iconBtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
                '.bl-tabs{display:flex;align-items:center;gap:5px;margin:-7px 0 17px}',
                '.bl-tab{appearance:none;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;font:inherit;font-size:13px;padding:7px 11px}',
                '.bl-tab:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
                '.bl-tabActive{background:color-mix(in srgb,#1677ff 10%,var(--dsw-alias-bg-base));color:#1677ff;font-weight:650}',
                '.bl-card{border:1px solid var(--dsw-alias-border-l2);border-radius:13px;background:var(--dsw-alias-bg-base);box-shadow:0 1px 2px rgba(0,0,0,.02);margin-bottom:16px}',
                '.bl-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));padding:18px 24px}',
                '.bl-metric{min-width:0;padding:0 24px;border-left:1px solid var(--dsw-alias-border-l2)}',
                '.bl-metric:first-child{border-left:0;padding-left:0}',
                '.bl-metricLabel{color:var(--dsw-alias-label-secondary);font-size:13px}',
                '.bl-metricValue{margin-top:10px;font-size:28px;line-height:32px;font-weight:680;letter-spacing:-.02em}',
                '.bl-metricValueCost{color:#bd7b32}',
                '.bl-metricHint{margin-top:7px;color:var(--dsw-alias-label-tertiary);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
                '.bl-metricHintAccent{color:#1677ff}',
                '.bl-chartCard{padding:18px 22px 13px}',
                '.bl-cardHeader{display:flex;align-items:center;gap:12px;margin-bottom:15px}',
                '.bl-cardTitle{font-size:15px;font-weight:650}',
                '.bl-legend{margin-left:auto;display:flex;align-items:center;gap:16px;color:var(--dsw-alias-label-secondary);font-size:12px}',
                '.bl-legendItem{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}',
                '.bl-swatch{width:9px;height:9px;border-radius:3px;display:inline-block}',
                '.bl-swatchInput{background:#4b8ff7}',
                '.bl-swatchCache{background:#4faf9c}',
                '.bl-swatchOutput{background:#a8c6eb}',
                '.bl-lineLegend{width:18px;height:3px;border-radius:3px;background:#d18b3d;position:relative;display:inline-block}',
                '.bl-lineLegend:after{content:"";width:7px;height:7px;border:2px solid #d18b3d;border-radius:50%;background:var(--dsw-alias-bg-base);position:absolute;left:5px;top:-3px}',
                '.bl-chart{height:258px;position:relative;padding:10px 58px 29px 49px;box-sizing:border-box}',
                '.bl-yLabels{position:absolute;top:8px;bottom:29px;left:0;width:42px;display:flex;flex-direction:column;justify-content:space-between;color:var(--dsw-alias-label-tertiary);font-size:11px;text-align:right}',
                '.bl-costLabels{position:absolute;top:8px;bottom:29px;right:0;width:50px;display:flex;flex-direction:column;justify-content:space-between;color:var(--dsw-alias-label-tertiary);font-size:11px;text-align:left}',
                '.bl-chartPlot{position:relative;height:100%;border-bottom:1px solid var(--dsw-alias-border-l2);background:repeating-linear-gradient(to bottom,transparent 0,transparent calc(25% - 1px),var(--dsw-alias-border-l2) 25%,transparent calc(25% + 1px))}',
                '.bl-bars{position:absolute;inset:0;display:grid;align-items:end}',
                '.bl-barColumn{height:100%;display:flex;align-items:center;justify-content:flex-end;flex-direction:column;min-width:0}',
                '.bl-barColumn:focus-visible{outline:2px solid color-mix(in srgb,#1677ff 70%,transparent);outline-offset:3px;border-radius:6px}',
                '.bl-barStack{width:min(34px,65%);display:flex;flex-direction:column;justify-content:flex-end;border-radius:4px 4px 0 0;overflow:hidden;min-height:1px}',
                '.bl-bar{width:100%;min-height:1px}',
                '.bl-barInput{background:#4b8ff7}',
                '.bl-barCache{background:#4faf9c}',
                '.bl-barOutput{background:#a8c6eb}',
                '.bl-xLabels{position:absolute;left:49px;right:58px;bottom:0;height:20px;display:grid;color:var(--dsw-alias-label-tertiary);font-size:11px;text-align:center}',
                '.bl-xLabelCurrent{color:#1677ff;font-weight:650}',
                '.bl-costLine{position:absolute;left:0;right:0;top:0;bottom:0;width:100%;height:100%;pointer-events:none;overflow:visible}',
                '.bl-costPoints{position:absolute;left:49px;right:58px;top:10px;bottom:29px;pointer-events:none;z-index:3}',
                '.bl-costPoint{position:absolute;width:9px;height:9px;border:2px solid #d18b3d;border-radius:50%;background:var(--dsw-alias-bg-base);box-sizing:border-box;transform:translate(-50%,-50%);box-shadow:0 0 0 3px color-mix(in srgb,#d18b3d 12%,transparent)}',
                '.bl-chartTooltip{position:absolute;z-index:5;min-width:194px;padding:11px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-base);box-shadow:0 10px 28px rgba(15,23,42,.16);pointer-events:none}',
                '.bl-chartTooltipTitle{font-size:12px;font-weight:650;color:var(--dsw-alias-label-primary)}',
                '.bl-chartTooltipRows{display:grid;gap:7px;margin-top:9px}',
                '.bl-chartTooltipRow{display:grid;grid-template-columns:8px minmax(0,1fr) auto;align-items:center;gap:7px;font-size:12px}',
                '.bl-chartTooltipSwatch{width:8px;height:8px;border-radius:3px;display:block}',
                '.bl-chartTooltipSwatchInput{background:#4b8ff7}',
                '.bl-chartTooltipSwatchCache{background:#4faf9c}',
                '.bl-chartTooltipSwatchOutput{background:#a8c6eb}',
                '.bl-chartTooltipSwatchCost{background:#d18b3d;border-radius:50%}',
                '.bl-chartTooltipLabel{color:var(--dsw-alias-label-secondary)}',
                '.bl-chartTooltipValue{color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums}',
                '.bl-chartTooltipCost{color:#bd7b32;font-weight:650}',
                '.bl-chartEmpty{height:100%;display:grid;place-items:center;color:var(--dsw-alias-label-tertiary);font-size:13px}',
                '.bl-modelCard{padding:18px 22px 9px}',
                '.bl-modelHead,.bl-modelRow{display:grid;grid-template-columns:minmax(210px,1.35fr) minmax(230px,1.8fr) 104px 72px 100px;gap:16px;align-items:center}',
                '.bl-modelHead{color:var(--dsw-alias-label-tertiary);font-size:12px;padding:0 0 13px}',
                '.bl-modelHead>span:nth-child(n+3),.bl-modelRow>span:nth-child(n+3){text-align:right}',
                '.bl-modelRow{min-height:78px;border-top:1px solid var(--dsw-alias-border-l2);font-size:13px}',
                '.bl-modelName{min-width:0;display:flex;align-items:center;gap:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
                '.bl-modelBrand{width:28px;height:28px;border-radius:9px;display:grid;place-items:center;flex:none}',
                '.bl-modelBrand svg{width:18px;height:18px;display:block;fill:currentColor}',
                '.bl-modelBrandDeepSeek{background:#eaf1ff;color:#3f7ff2}',
                '.bl-modelBrandQwen{background:#f0ecff;color:#7254df}',
                '.bl-modelBrandOpenAI{background:#edf1f6;color:#223049}',
                '.bl-modelBrandAnthropic{background:#fff0e9;color:#b56b4c}',
                '.bl-modelBrandGeneric{background:#edf1f7;color:#63728b}',
                '.bl-modelProgress{min-width:0}',
                '.bl-progress{height:7px;display:flex;border-radius:9px;background:var(--dsw-alias-fill-tsp-secondary);overflow:hidden}',
                '.bl-progressSegment{display:block;height:100%;min-width:0}',
                '.bl-progressInput{background:#4b8ff7}',
                '.bl-progressCache{background:#4faf9c}',
                '.bl-progressOutput{background:#a8c6eb}',
                '.bl-modelShare{margin-bottom:7px;color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:1.2}',
                '.bl-modelBreakdown{display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:8px;color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:1.2}',
                '.bl-modelBreakdownItem{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}',
                '.bl-modelBreakdownSwatch{width:6px;height:6px;border-radius:2px;display:inline-block;flex:none}',
                '.bl-modelBreakdownSwatchInput{background:#4b8ff7}',
                '.bl-modelBreakdownSwatchCache{background:#4faf9c}',
                '.bl-modelBreakdownSwatchOutput{background:#a8c6eb}',
                '.bl-modelBreakdownStrong{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;font-weight:600}',
                '.bl-modelMuted{color:var(--dsw-alias-label-tertiary)}',
                '.bl-total{font-weight:650;border-top:1px solid var(--dsw-alias-border-l2);padding-top:13px;margin-top:4px}',
                '.bl-detailCard{overflow:hidden}',
                '.bl-tableScroll{overflow:auto}',
                '.bl-detailTable{width:100%;border-collapse:collapse;font-size:12px;min-width:760px}',
                '.bl-detailTable th{color:var(--dsw-alias-label-tertiary);font-weight:500;text-align:left;background:var(--dsw-alias-fill-tsp-secondary);padding:11px 14px;white-space:nowrap}',
                '.bl-detailTable td{padding:12px 14px;border-top:1px solid var(--dsw-alias-border-l2);white-space:nowrap}',
                '.bl-detailTable th:nth-child(n+3),.bl-detailTable td:nth-child(n+3){text-align:right}',
                '.bl-status{font-size:12px;color:var(--dsw-alias-label-tertiary);margin:3px 0 14px}',
                '.bl-issue{padding:11px 13px;border:1px solid color-mix(in srgb,#f0a116 35%,var(--dsw-alias-border-l2));background:color-mix(in srgb,#f0a116 8%,var(--dsw-alias-bg-base));border-radius:9px;color:var(--dsw-alias-label-secondary);font-size:12px;margin-bottom:16px}',
                '.bl-empty{padding:35px 20px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:13px}',
                '.bl-settings{max-width:760px}',
                '.bl-settingSection{padding:19px 22px;border-bottom:1px solid var(--dsw-alias-border-l2)}',
                '.bl-settingSection:last-child{border-bottom:0}',
                '.bl-settingTitle{font-size:14px;font-weight:650;margin-bottom:8px}',
                '.bl-settingText{font-size:13px;line-height:1.7;color:var(--dsw-alias-label-secondary)}',
                '.bl-rateTable{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}',
                '.bl-rateTable th,.bl-rateTable td{text-align:left;padding:9px 0;border-top:1px solid var(--dsw-alias-border-l2)}',
                '.bl-rateTable th{color:var(--dsw-alias-label-tertiary);font-weight:500}',
                '.bl-badgeWrap{position:relative;display:inline-flex}',
                '.bl-badge{appearance:none;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:12px;height:30px;padding:0 9px;display:inline-flex;align-items:center;gap:7px;white-space:nowrap}',
                '.bl-badge:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
                '.bl-badgeDot{width:7px;height:7px;border-radius:50%;background:#3c8bf4}',
                '.bl-popover{position:absolute;z-index:20;right:0;top:37px;width:260px;padding:14px;border:1px solid var(--dsw-alias-border-l2);border-radius:11px;background:var(--dsw-alias-bg-base);box-shadow:0 10px 30px rgba(0,0,0,.14)}',
                '.bl-popoverTitle{font-size:13px;font-weight:650}',
                '.bl-popoverValue{margin-top:11px;font-size:20px;font-weight:680}',
                '.bl-popoverMeta{margin-top:7px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.6}',
                '.bl-popoverLink{appearance:none;border:0;background:transparent;color:#1677ff;cursor:pointer;font:inherit;font-size:12px;padding:9px 0 0}',
                '.bl-loading{min-height:240px;display:grid;place-items:center;color:var(--dsw-alias-label-tertiary);font-size:13px}',
                '@media(max-width:900px){.bl-page{padding:23px 20px 35px}.bl-modelHead,.bl-modelRow{grid-template-columns:minmax(180px,1.25fr) minmax(205px,1.65fr) 90px 60px 80px;gap:10px}.bl-metrics{padding:17px 14px}.bl-metric{padding:0 14px}}',
                '@media(max-width:680px){.bl-heading{flex-wrap:wrap}.bl-headingActions{width:100%;margin-left:46px}.bl-metrics{grid-template-columns:1fr;gap:15px}.bl-metric,.bl-metric:first-child{border-left:0;border-top:1px solid var(--dsw-alias-border-l2);padding:15px 0 0}.bl-metric:first-child{border-top:0;padding-top:0}.bl-legend{display:none}.bl-chart{padding-left:42px;padding-right:53px}.bl-yLabels{width:35px}.bl-costLabels{width:45px}.bl-xLabels{left:42px;right:53px}.bl-costPoints{left:42px;right:53px}.bl-modelHead,.bl-modelRow{grid-template-columns:minmax(150px,1fr) minmax(180px,1.2fr) 80px;gap:10px}.bl-modelHead>span:nth-child(4),.bl-modelRow>span:nth-child(4),.bl-modelHead>span:nth-child(5),.bl-modelRow>span:nth-child(5){display:none}.bl-modelHead>span:nth-child(3),.bl-modelRow>span:nth-child(3){grid-column:3}}',
                '@media(prefers-reduced-motion:reduce){.bl-barStack,.bl-card{animation:none!important;transition:none!important}}',
            ].join('');
            if (!existingStyle)
                document.head.appendChild(style);
            function icon(props) {
                var size = props && props.size ? props.size : 16;
                return h('svg', { width: size, height: size, viewBox: '0 0 18 18', fill: 'none', 'aria-hidden': true }, h('path', { d: 'M4 2.25h10v13.5l-2.5-1.5-2.5 1.5-2.5-1.5L4 15.75V2.25Z', stroke: 'currentColor', strokeWidth: 1.35, strokeLinejoin: 'round' }), h('path', { d: 'M6.5 5.75h5M6.5 8.75h5M6.5 11.75h3', stroke: 'currentColor', strokeWidth: 1.25, strokeLinecap: 'round' }));
            }
            function isRecord(value) {
                return typeof value === 'object' && value !== null && !Array.isArray(value);
            }
            function formatTokens(value) {
                if (value >= 1_000_000_000)
                    return `${(value / 1_000_000_000).toFixed(2)}B`;
                if (value >= 1_000_000)
                    return `${(value / 1_000_000).toFixed(2)}M`;
                if (value >= 1_000)
                    return `${(value / 1_000).toFixed(1)}K`;
                return Math.round(value).toLocaleString('en-US');
            }
            function formatCost(value) {
                return value === null ? '—' : `¥${value.toFixed(2)}`;
            }
            function formatDate(timestamp) {
                return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric' }).format(new Date(timestamp));
            }
            function formatTime(timestamp) {
                return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
            }
            function requestBilling(body) {
                return window.fetch('/api/billing', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(body),
                }).then(async function (response) {
                    var payload = await response.json();
                    if (!response.ok || !isRecord(payload) || payload.ok !== true || !isRecord(payload.value)) {
                        var error = isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === 'string'
                            ? payload.error.message
                            : `Billing 请求失败（${response.status}）`;
                        throw new Error(error);
                    }
                    return payload.value;
                });
            }
            function useBillingData(sessionId) {
                var [state, setState] = React.useState({ loading: true, error: '' });
                var load = React.useCallback(function () {
                    if (sessionId === '')
                        return;
                    setState(function (previous) {
                        return previous.data === undefined
                            ? { loading: true, error: '' }
                            : { loading: false, error: '', data: previous.data };
                    });
                    requestBilling({ op: 'summary', ...(sessionId ? { sessionId: sessionId } : {}) }).then(function (data) {
                        setState({ loading: false, error: '', data: data });
                    }, function (error) {
                        setState(function (previous) {
                            return previous.data === undefined
                                ? { loading: false, error: error instanceof Error ? error.message : String(error) }
                                : { loading: false, error: error instanceof Error ? error.message : String(error), data: previous.data };
                        });
                    });
                }, [sessionId]);
                React.useEffect(function () {
                    load();
                    var timer = window.setInterval(load, 12_000);
                    return function () { window.clearInterval(timer); };
                }, [load]);
                return { ...state, refresh: load };
            }
            function Metric(props) {
                return h('div', { className: 'bl-metric' }, h('div', { className: 'bl-metricLabel' }, props.label), h('div', { className: 'bl-metricValue' + (props.cost ? ' bl-metricValueCost' : '') }, props.value), h('div', { className: 'bl-metricHint' }, props.hint));
            }
            function Metrics(props) {
                var totals = props.data.totals;
                return h('div', { className: 'bl-card bl-metrics' }, h(Metric, { label: '时间范围 Token', value: formatTokens(totals.totalTokens), hint: `${totals.calls} 次调用` }), h(Metric, { label: '估算费用', value: formatCost(totals.estimatedCost), hint: totals.unpricedCalls > 0 ? `${totals.unpricedCalls} 次未知模型未计价` : '估算费用，非官方账单', cost: true }), h(Metric, { label: '缓存命中 Token', value: formatTokens(totals.cacheReadTokens), hint: totals.totalTokens > 0 ? `占总量 ${(totals.cacheReadTokens / totals.totalTokens * 100).toFixed(1)}%` : '暂无缓存命中数据' }));
            }
            function Chart(props) {
                var [hoveredIndex, setHoveredIndex] = React.useState(null);
                var [hoverPosition, setHoverPosition] = React.useState(null);
                var chartPlotRef = React.useRef(null);
                function updateHoverPosition(event) {
                    var chartPlot = chartPlotRef.current;
                    if (chartPlot === null)
                        return;
                    var rect = chartPlot.getBoundingClientRect();
                    if (rect.width <= 0 || rect.height <= 0)
                        return;
                    setHoverPosition({
                        x: (event.clientX - rect.left) / rect.width * 100,
                        y: (event.clientY - rect.top) / rect.height * 100,
                    });
                }
                var days = props.data.daily.slice(-7);
                var maxTokens = Math.max(1, ...days.map(function (day) { return day.totalTokens; }));
                var maxCost = Math.max(0.01, ...days.map(function (day) { return day.estimatedCost; }));
                var costPoints = days.map(function (day, index) {
                    var x = days.length <= 1 ? 50 : (index + 0.5) / days.length * 100;
                    var y = 92 - day.estimatedCost / maxCost * 80;
                    return { x: x, y: y };
                });
                var costPath = costPoints.length === 0 ? '' : costPoints.length === 1
                    ? `M ${costPoints[0].x} ${costPoints[0].y}`
                    : costPoints.reduce(function (path, point, index) {
                        if (index === 0)
                            return `M ${point.x} ${point.y}`;
                        var previous = costPoints[index - 1];
                        var beforePrevious = costPoints[index - 2] || previous;
                        var next = costPoints[index + 1] || point;
                        var cp1x = previous.x + (point.x - beforePrevious.x) / 6;
                        var cp2x = point.x - (next.x - previous.x) / 6;
                        return `${path} C ${cp1x} ${previous.y}, ${cp2x} ${point.y}, ${point.x} ${point.y}`;
                    }, '');
                var areaPath = costPath === '' ? '' : `${costPath} L ${costPoints[costPoints.length - 1].x} 92 L ${costPoints[0].x} 92 Z`;
                var tooltip = null;
                if (hoveredIndex !== null) {
                    var hoveredDay = days[hoveredIndex];
                    var hoveredPoint = costPoints[hoveredIndex];
                    if (hoveredDay !== undefined && hoveredPoint !== undefined) {
                        var hoveredTimestamp = new Date(`${hoveredDay.date}T00:00:00+08:00`).getTime();
                        var tooltipLeft = Math.min(82, Math.max(18, hoveredPoint.x));
                        var tooltipTop = Math.max(5, Math.min(48, hoveredPoint.y - 24));
                        var tooltipTransform = 'translateX(-50%)';
                        if (hoverPosition !== null) {
                            tooltipLeft = Math.min(84, Math.max(16, hoverPosition.x));
                            tooltipTop = Math.min(92, Math.max(6, hoverPosition.y));
                            tooltipTransform = hoverPosition.y >= 55
                                ? 'translate(-50%, calc(-100% - 12px))'
                                : 'translate(-50%, 12px)';
                        }
                        tooltip = h('div', { className: 'bl-chartTooltip', role: 'tooltip', style: { left: `${tooltipLeft}%`, top: `${tooltipTop}%`, transform: tooltipTransform } }, h('div', { className: 'bl-chartTooltipTitle' }, formatDate(hoveredTimestamp)), h('div', { className: 'bl-chartTooltipRows' }, h('div', { className: 'bl-chartTooltipRow' }, h('i', { className: 'bl-chartTooltipSwatch bl-chartTooltipSwatchInput' }), h('span', { className: 'bl-chartTooltipLabel' }, '输入 Token'), h('strong', { className: 'bl-chartTooltipValue' }, formatTokens(hoveredDay.inputTokens + hoveredDay.cacheWriteTokens))), h('div', { className: 'bl-chartTooltipRow' }, h('i', { className: 'bl-chartTooltipSwatch bl-chartTooltipSwatchCache' }), h('span', { className: 'bl-chartTooltipLabel' }, '缓存命中 Token'), h('strong', { className: 'bl-chartTooltipValue' }, formatTokens(hoveredDay.cacheReadTokens))), h('div', { className: 'bl-chartTooltipRow' }, h('i', { className: 'bl-chartTooltipSwatch bl-chartTooltipSwatchOutput' }), h('span', { className: 'bl-chartTooltipLabel' }, '输出 Token'), h('strong', { className: 'bl-chartTooltipValue' }, formatTokens(hoveredDay.outputTokens))), h('div', { className: 'bl-chartTooltipRow' }, h('i', { className: 'bl-chartTooltipSwatch bl-chartTooltipSwatchCost' }), h('span', { className: 'bl-chartTooltipLabel' }, '估算费用'), h('strong', { className: 'bl-chartTooltipValue bl-chartTooltipCost' }, formatCost(hoveredDay.estimatedCost)))));
                    }
                }
                return h('div', { className: 'bl-card bl-chartCard' }, h('div', { className: 'bl-cardHeader' }, h('div', { className: 'bl-cardTitle' }, '最近 7 天'), h('div', { className: 'bl-legend' }, h('span', { className: 'bl-legendItem' }, h('i', { className: 'bl-swatch bl-swatchInput' }), '输入 Token'), h('span', { className: 'bl-legendItem' }, h('i', { className: 'bl-swatch bl-swatchCache' }), '缓存命中 Token'), h('span', { className: 'bl-legendItem' }, h('i', { className: 'bl-swatch bl-swatchOutput' }), '输出 Token'), h('span', { className: 'bl-legendItem' }, h('i', { className: 'bl-lineLegend' }), '估算费用（¥）'))), days.length === 0 ? h('div', { className: 'bl-chartEmpty' }, '暂无模型调用记录') : h('div', { className: 'bl-chart', onMouseLeave: function () { setHoveredIndex(null); setHoverPosition(null); } }, h('div', { className: 'bl-yLabels' }, h('span', null, formatTokens(maxTokens)), h('span', null, formatTokens(maxTokens / 2)), h('span', null, '0')), h('div', { className: 'bl-costLabels' }, h('span', null, `¥${maxCost.toFixed(2)}`), h('span', null, `¥${(maxCost / 2).toFixed(2)}`), h('span', null, '¥0')), h('div', { className: 'bl-chartPlot', ref: chartPlotRef }, h('div', { className: 'bl-bars', style: { gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` } }, days.map(function (day, index) {
                    var scale = 100 / maxTokens;
                    return h('div', { className: 'bl-barColumn', key: day.date, tabIndex: 0, 'aria-label': `${formatDate(new Date(`${day.date}T00:00:00+08:00`).getTime())}，输入 ${formatTokens(day.inputTokens + day.cacheWriteTokens)}，缓存命中 ${formatTokens(day.cacheReadTokens)}，输出 ${formatTokens(day.outputTokens)}，估算费用 ${formatCost(day.estimatedCost)}`, onFocus: function () { setHoveredIndex(index); } }, h('div', { className: 'bl-barStack', style: { height: `${Math.max(1, day.totalTokens * scale)}%` }, onMouseEnter: function (event) { setHoveredIndex(index); updateHoverPosition(event); }, onMouseMove: updateHoverPosition, onMouseLeave: function () { setHoveredIndex(null); setHoverPosition(null); } }, h('div', { className: 'bl-bar bl-barOutput', style: { flex: day.outputTokens } }), h('div', { className: 'bl-bar bl-barCache', style: { flex: day.cacheReadTokens } }), h('div', { className: 'bl-bar bl-barInput', style: { flex: day.inputTokens + day.cacheWriteTokens } })));
                })), h('svg', { className: 'bl-costLine', viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': true }, h('defs', null, h('linearGradient', { id: 'billing-cost-fill', x1: '0', y1: '0', x2: '0', y2: '1' }, h('stop', { offset: '0%', stopColor: '#d18b3d', stopOpacity: '0.18' }), h('stop', { offset: '100%', stopColor: '#d18b3d', stopOpacity: '0' }))), areaPath === '' ? null : h('path', { d: areaPath, fill: 'url(#billing-cost-fill)' }), costPath === '' ? null : h('path', { d: costPath, fill: 'none', stroke: '#d18b3d', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', vectorEffect: 'non-scaling-stroke' })), tooltip), h('div', { className: 'bl-costPoints' }, days.map(function (day, index) {
                    var point = costPoints[index];
                    return h('span', { key: day.date, className: 'bl-costPoint', style: { left: `${point.x}%`, top: `${point.y}%` } });
                })), h('div', { className: 'bl-xLabels', style: { gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` } }, days.map(function (day, index) {
                    return h('span', { key: day.date, className: index === days.length - 1 ? 'bl-xLabelCurrent' : '' }, formatDate(new Date(`${day.date}T00:00:00+08:00`).getTime()));
                }))));
            }
            function ModelIcon(props) {
                var value = props.model.toLowerCase();
                var provider = '其他模型';
                var className = 'bl-modelBrand bl-modelBrandGeneric';
                var path = 'M12 2l8 4.5v9L12 20l-8-4.5v-9L12 2Zm0 4-4 2.3v4.4l4 2.3 4-2.3V8.3L12 6Z';
                if (value.includes('deepseek')) {
                    provider = 'DeepSeek';
                    className = 'bl-modelBrand bl-modelBrandDeepSeek';
                    path = 'M23.748 4.651c-.254-.124-.364.113-.512.233-.051.04-.094.09-.137.137-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.155-.708-.311-.955-.65-.172-.24-.219-.509-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.094.172.187.129.323-.082.28-.18.553-.266.833-.055.179-.137.218-.328.14a5.5 5.5 0 0 1-1.737-1.179c-.857-.828-1.631-1.743-2.597-2.46a12 12 0 0 0-.689-.47c-.985-.957.13-1.743.387-1.836.27-.098.094-.433-.778-.428-.872.003-1.67.295-2.687.685a3 3 0 0 1-.465.136 9.6 9.6 0 0 0-2.883-.101c-1.885.21-3.39 1.1-4.497 2.622C.082 8.776-.231 10.854.152 13.02c.403 2.284 1.568 4.175 3.36 5.653 1.857 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.132-.284 4.994-1.86.47.234.962.328 1.78.398.629.058 1.235-.031 1.705-.129.735-.155.684-.836.418-.961-2.155-1.004-1.682-.595-2.112-.926 1.095-1.295 2.768-3.598 3.284-6.733.05-.346.115-.834.108-1.114-.004-.171.035-.238.23-.257a4.2 4.2 0 0 0 1.545-.475c1.397-.763 1.96-2.016 2.093-3.517.02-.23-.004-.467-.247-.588M11.58 18.168c-2.088-1.642-3.101-2.183-3.52-2.16-.39.024-.32.472-.234.763.09.288.207.487.371.74.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.168-1.361-.801-2.5-1.86-3.301-3.306-.775-1.393-1.225-2.888-1.299-4.482-.02-.385.094-.522.477-.592a4.7 4.7 0 0 1 1.53-.038c2.131.311 3.946 1.264 5.467 2.774.868.86 1.525 1.887 2.202 2.89.72 1.066 1.494 2.082 2.48 2.915.348.291.626.513.892.677-.802.09-2.14.109-3.055-.615zm1.001-6.44a.306.306 0 0 1 .415-.287.3.3 0 0 1 .113.074.3.3 0 0 1 .086.214c0 .17-.136.307-.308.307a.303.303 0 0 1-.306-.307m3.11 1.596c-.2.081-.4.151-.591.16a1.25 1.25 0 0 1-.798-.254c-.274-.23-.47-.358-.551-.758a1.7 1.7 0 0 1 .015-.588c.07-.327-.007-.537-.238-.727-.188-.156-.426-.199-.689-.199a.6.6 0 0 1-.254-.078.253.253 0 0 1-.114-.358 1 1 0 0 1 .192-.21c.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.392.451.462.576.685.915.176.264.336.536.446.848.066.194-.02.353-.25.45';
                }
                else if (value.includes('qwen')) {
                    provider = 'Qwen';
                    className = 'bl-modelBrand bl-modelBrandQwen';
                    path = 'M23.919 14.545 20.817 9.17l1.47-2.544a.56.56 0 0 0 0-.566l-1.633-2.83a.57.57 0 0 0-.49-.283h-6.207L12.487.402a.57.57 0 0 0-.49-.284H8.732a.56.56 0 0 0-.49.284L5.139 5.775h-2.94a.56.56 0 0 0-.49.284L.077 8.887a.56.56 0 0 0 0 .567L3.18 14.83l-1.47 2.545a.56.56 0 0 0 0 .566l1.634 2.83a.57.57 0 0 0 .49.283h6.205l1.47 2.545a.57.57 0 0 0 .49.284h3.266a.57.57 0 0 0 .49-.284l3.104-5.375h2.94a.57.57 0 0 0 .49-.283l1.634-2.828a.55.55 0 0 0-.004-.568M8.733.686l1.634 2.828-1.634 2.828H21.8L20.164 9.17H7.425L5.63 6.06Zm1.306 19.801-6.205-.002 1.634-2.83h3.265L2.201 6.344h3.267q3.182 5.517 6.367 11.032zm10.124-5.66L18.53 12l-6.532 11.315-1.634-2.83c2.129-3.673 4.25-7.351 6.373-11.028h3.592l3.102 5.374z';
                }
                else if (value.includes('gpt') || value.includes('openai')) {
                    provider = 'OpenAI';
                    className = 'bl-modelBrand bl-modelBrandOpenAI';
                    path = 'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z';
                }
                else if (value.includes('claude') || value.includes('anthropic')) {
                    provider = 'Anthropic';
                    className = 'bl-modelBrand bl-modelBrandAnthropic';
                    path = 'M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z';
                }
                return h('span', { className: className, title: provider }, h('svg', { viewBox: '0 0 24 24', role: 'img', 'aria-label': provider }, h('path', { d: path })));
            }
            function formatShare(value, total) {
                return `${total > 0 ? (value / total * 100).toFixed(1) : '0.0'}%`;
            }
            function TokenComposition(props) {
                var inputTokens = props.model.inputTokens + props.model.cacheWriteTokens;
                var cacheTokens = props.model.cacheReadTokens;
                var outputTokens = props.model.outputTokens;
                var total = inputTokens + cacheTokens + outputTokens;
                var inputShare = total > 0 ? inputTokens / total * 100 : 0;
                var cacheShare = total > 0 ? cacheTokens / total * 100 : 0;
                var outputShare = total > 0 ? outputTokens / total * 100 : 0;
                var label = `模型占总量 ${formatShare(props.model.totalTokens, props.totalTokens)}；输入 ${formatTokens(inputTokens)}（${formatShare(inputTokens, total)}），缓存命中 ${formatTokens(cacheTokens)}（${formatShare(cacheTokens, total)}），输出 ${formatTokens(outputTokens)}（${formatShare(outputTokens, total)}）`;
                return h('div', { className: 'bl-modelProgress', title: label, 'aria-label': label }, h('div', { className: 'bl-modelShare' }, `模型占总量 ${formatShare(props.model.totalTokens, props.totalTokens)}`), h('div', { className: 'bl-progress', role: 'img', 'aria-label': label }, h('span', { className: 'bl-progressSegment bl-progressInput', style: { width: `${inputShare}%` } }), h('span', { className: 'bl-progressSegment bl-progressCache', style: { width: `${cacheShare}%` } }), h('span', { className: 'bl-progressSegment bl-progressOutput', style: { width: `${outputShare}%` } })), h('div', { className: 'bl-modelBreakdown' }, h('span', { className: 'bl-modelBreakdownItem' }, h('i', { className: 'bl-modelBreakdownSwatch bl-modelBreakdownSwatchInput' }), '输入 ', h('strong', { className: 'bl-modelBreakdownStrong' }, formatTokens(inputTokens)), ` · ${formatShare(inputTokens, total)}`), h('span', { className: 'bl-modelBreakdownItem' }, h('i', { className: 'bl-modelBreakdownSwatch bl-modelBreakdownSwatchCache' }), '命中 ', h('strong', { className: 'bl-modelBreakdownStrong' }, formatTokens(cacheTokens)), ` · ${formatShare(cacheTokens, total)}`), h('span', { className: 'bl-modelBreakdownItem' }, h('i', { className: 'bl-modelBreakdownSwatch bl-modelBreakdownSwatchOutput' }), '输出 ', h('strong', { className: 'bl-modelBreakdownStrong' }, formatTokens(outputTokens)), ` · ${formatShare(outputTokens, total)}`)));
            }
            function ModelList(props) {
                var models = props.data.models;
                return h('div', { className: 'bl-card bl-modelCard' }, h('div', { className: 'bl-cardHeader' }, h('div', { className: 'bl-cardTitle' }, '按模型')), models.length === 0 ? h('div', { className: 'bl-empty' }, '暂无可展示的模型调用') : h(React.Fragment, null, h('div', { className: 'bl-modelHead' }, h('span', null, '模型'), h('span', null, '用量占比'), h('span', null, 'Token'), h('span', null, '缓存命中'), h('span', null, '估算费用（¥）')), models.map(function (model) {
                    return h('div', { className: 'bl-modelRow', key: model.model }, h('span', { className: 'bl-modelName', title: model.model }, h(ModelIcon, { model: model.model }), model.model), h(TokenComposition, { model: model, totalTokens: props.data.totals.totalTokens }), h('span', null, formatTokens(model.totalTokens)), h('span', null, formatTokens(model.cacheReadTokens)), h('span', { className: model.estimatedCost === 0 && model.unpricedCalls > 0 ? 'bl-modelMuted' : '' }, formatCost(model.estimatedCost === 0 && model.unpricedCalls > 0 ? null : model.estimatedCost)));
                }), h('div', { className: 'bl-modelRow bl-total' }, h('span', null, '合计'), h('div', { className: 'bl-modelProgress' }), h('span', null, formatTokens(props.data.totals.totalTokens)), h('span', null, formatTokens(props.data.totals.cacheReadTokens)), h('span', null, formatCost(props.data.totals.estimatedCost)))));
            }
            function DetailList(props) {
                return h('div', { className: 'bl-card bl-detailCard' }, h('div', { className: 'bl-cardHeader', style: { padding: '18px 22px 0' } }, h('div', { className: 'bl-cardTitle' }, '调用明细')), props.data.truncated ? h('div', { className: 'bl-status', style: { padding: '0 22px' } }, '明细最多展示最近 2,000 次调用，汇总数据不受影响。') : null, props.data.calls.length === 0 ? h('div', { className: 'bl-empty' }, '暂无模型调用记录') : h('div', { className: 'bl-tableScroll' }, h('table', { className: 'bl-detailTable' }, h('thead', null, h('tr', null, h('th', null, '时间'), h('th', null, '模型'), h('th', null, '输入'), h('th', null, '缓存命中'), h('th', null, '输出'), h('th', null, '估算费用'))), h('tbody', null, props.data.calls.map(function (call) {
                    return h('tr', { key: call.callKey }, h('td', null, formatTime(call.timestamp)), h('td', null, call.model), h('td', null, formatTokens(call.inputTokens)), h('td', null, formatTokens(call.cacheReadTokens)), h('td', null, formatTokens(call.outputTokens)), h('td', { title: call.priceReason }, formatCost(call.estimatedCost)));
                })))));
            }
            function Issues(props) {
                if (props.data.issues.length === 0)
                    return null;
                var first = props.data.issues[0];
                return h('div', { className: 'bl-issue', role: 'status' }, `部分日志未能完整读取：${first ? first.message : '请稍后重试'}${props.data.issues.length > 1 ? `（共 ${props.data.issues.length} 项）` : ''}`);
            }
            function Dashboard(_props) {
                var state = useBillingData();
                var [tab, setTab] = React.useState('usage');
                if (state.loading && state.data === undefined)
                    return h('div', { className: 'bl-page' }, h('div', { className: 'bl-loading' }, '正在读取 Token 用量…'));
                if (state.error !== '' && state.data === undefined)
                    return h('div', { className: 'bl-page' }, h('div', { className: 'bl-empty' }, state.error));
                var data = state.data;
                if (data === undefined)
                    return null;
                return h('div', { className: 'bl-page', 'data-testid': 'billing-dashboard' }, h('div', { className: 'bl-shell' }, h('div', { className: 'bl-heading' }, h('div', { className: 'bl-headingIcon' }, h(icon, { size: 20 })), h('div', { className: 'bl-headingCopy' }, h('h1', { className: 'bl-title' }, 'Billing')), h('div', { className: 'bl-headingActions' }, h('span', { className: 'bl-range' }, '最近 7 天'), h('button', { className: 'bl-iconBtn', type: 'button', title: '刷新', 'aria-label': '刷新', onClick: state.refresh }, h(P.IconRefreshOutline16)))), h('div', { className: 'bl-tabs', role: 'tablist' }, h('button', { type: 'button', role: 'tab', className: tab === 'usage' ? 'bl-tab bl-tabActive' : 'bl-tab', 'aria-selected': tab === 'usage', onClick: function () { setTab('usage'); } }, 'Token 用量'), h('button', { type: 'button', role: 'tab', className: tab === 'detail' ? 'bl-tab bl-tabActive' : 'bl-tab', 'aria-selected': tab === 'detail', onClick: function () { setTab('detail'); } }, '调用明细')), h(Issues, { data: data }), state.error !== '' ? h('div', { className: 'bl-status' }, `刷新失败，正在展示上次数据：${state.error}`) : null, tab === 'usage' ? h(React.Fragment, null, h(Metrics, { data: data }), h(Chart, { data: data }), h(ModelList, { data: data })) : h(DetailList, { data: data })));
            }
            function SettingsSection(_props) {
                return h('div', { className: 'bl-page' }, h('div', { className: 'bl-shell bl-settings' }, h('div', { className: 'bl-heading' }, h('div', { className: 'bl-headingIcon' }, h(icon, { size: 20 })), h('div', { className: 'bl-headingCopy' }, h('h1', { className: 'bl-title' }, 'Billing'), h('div', { className: 'bl-subtitle' }, '影子计费设置'))), h('div', { className: 'bl-card' }, h('div', { className: 'bl-settingSection' }, h('div', { className: 'bl-settingTitle' }, '计价口径'), h('div', { className: 'bl-settingText' }, '以下价格只用于本地估算，不会产生真实扣费。基于 DeepSeek-V4-Flash 官方美元价，按 ¥7.2/USD 折算；峰值时段按低谷价 ×2。缓存命中价显著低于输入未命中价。')), h('div', { className: 'bl-settingSection' }, h('div', { className: 'bl-settingTitle' }, 'DeepSeek Flash 价目表（¥ / 1M Token）'), h('table', { className: 'bl-rateTable' }, h('thead', null, h('tr', null, h('th', null, 'Token 类型'), h('th', null, '低谷'), h('th', null, '高峰'))), h('tbody', null, h('tr', null, h('td', null, '输入 / 未命中'), h('td', null, '¥1.01'), h('td', null, '¥2.02')), h('tr', null, h('td', null, '缓存命中'), h('td', null, '¥0.02'), h('td', null, '¥0.04')), h('tr', null, h('td', null, '输出'), h('td', null, '¥2.02'), h('td', null, '¥4.03'))))), h('div', { className: 'bl-settingSection' }, h('div', { className: 'bl-settingTitle' }, '峰谷规则'), h('div', { className: 'bl-settingText' }, '高峰：北京时间工作日 09:00–12:00、14:00–18:00；低谷：其他时段及周末（2026-08-23 起周末全天低谷）。未知模型只展示 Token，不计入费用。')))));
            }
            function apply(ctx) {
                var slots = ctx.get('slots');
                if (slots === undefined)
                    return;
                var resolvedSlots = slots;
                resolvedSlots.inject('extension.manager.section', function () {
                    return resolvedSlots.register({ name: 'extension.manager.section', id: 'billing', order: 40, label: 'Billing' }, Dashboard);
                });
                resolvedSlots.inject('settings.section', function () {
                    return resolvedSlots.register({ name: 'settings.section', id: 'billing', order: 80, label: 'Billing' }, SettingsSection);
                });
            }
            return { apply: apply };
        },
    });
})();
//# sourceMappingURL=client.js.map