/**
 * dsh-billing — client half.
 *
 * This is a classic browser bundle loaded by DSH's ModuleLoader. It contributes
 * additive Cordis slots only: an Extensions Billing section and a settings
 * section.
 */
interface BillingSlotEntry {
	name: string
	id: string
	order?: number
	label?: string | (() => string)
}

interface BillingSlots {
	inject(name: string, effect: () => unknown): unknown
	register(definition: BillingSlotEntry, component: React.ComponentType<Record<string, unknown>>): unknown
}

interface BillingProps extends Record<string, unknown> {}

interface TokenTotals {
	calls: number
	pricedCalls: number
	unpricedCalls: number
	inputTokens: number
	outputTokens: number
	cacheReadTokens: number
	cacheWriteTokens: number
	totalTokens: number
	estimatedCost: number
}

interface BillingDaily extends TokenTotals {
	date: string
}

interface BillingModel extends TokenTotals {
	model: string
	share: number
}

interface BillingCall {
	callKey: string
	sessionId: string
	sessionTitle: string
	model: string
	timestamp: number
	turn: number
	step: number
	inputTokens: number
	outputTokens: number
	cacheReadTokens: number
	cacheWriteTokens: number
	estimatedCost: number | null
	priceMode: string
	priceReason: string
}

interface BillingSummary {
	apiVersion: 1
	generatedAt: number
	range: { from: number; to: number }
	totals: TokenTotals
	daily: BillingDaily[]
	models: BillingModel[]
	calls: BillingCall[]
	issues: Array<{ path: string; code: string; message: string }>
	truncated: boolean
	priceNote: string
}

interface BillingState {
	loading: boolean
	error: string
	data?: BillingSummary
}

(function () {
	window.__ModuleLoader__.load({
		id: 'dsh-billing',
		factory: function (requireModule: ClientRequire) {
			var React = requireModule('react');
			var h = React.createElement;
			var P = requireModule('@deepseek-ai/dsh-client-ui-primitives') as ClientPrimitives;

	var existingStyle = document.querySelector<HTMLStyleElement>('style[data-plugin="dsh-billing"]');
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
		'.bl-metricValueCost{color:#e79500}',
		'.bl-metricHint{margin-top:7px;color:var(--dsw-alias-label-tertiary);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
		'.bl-metricHintAccent{color:#1677ff}',
		'.bl-chartCard{padding:18px 22px 13px}',
		'.bl-cardHeader{display:flex;align-items:center;gap:12px;margin-bottom:15px}',
		'.bl-cardTitle{font-size:15px;font-weight:650}',
		'.bl-legend{margin-left:auto;display:flex;align-items:center;gap:16px;color:var(--dsw-alias-label-secondary);font-size:12px}',
		'.bl-legendItem{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}',
		'.bl-swatch{width:9px;height:9px;border-radius:3px;display:inline-block}',
		'.bl-swatchInput{background:#3f8df5}',
		'.bl-swatchCache{background:#8e6be8}',
		'.bl-swatchOutput{background:#a8c8f7}',
		'.bl-lineLegend{width:18px;height:3px;border-radius:3px;background:#e59a13;position:relative;display:inline-block}',
		'.bl-lineLegend:after{content:"";width:7px;height:7px;border:2px solid #e59a13;border-radius:50%;background:var(--dsw-alias-bg-base);position:absolute;left:5px;top:-3px}',
		'.bl-chart{height:258px;position:relative;padding:10px 58px 29px 49px;box-sizing:border-box}',
		'.bl-yLabels{position:absolute;top:8px;bottom:29px;left:0;width:42px;display:flex;flex-direction:column;justify-content:space-between;color:var(--dsw-alias-label-tertiary);font-size:11px;text-align:right}',
		'.bl-costLabels{position:absolute;top:8px;bottom:29px;right:0;width:50px;display:flex;flex-direction:column;justify-content:space-between;color:var(--dsw-alias-label-tertiary);font-size:11px;text-align:left}',
		'.bl-chartPlot{position:relative;height:100%;border-bottom:1px solid var(--dsw-alias-border-l2);background:repeating-linear-gradient(to bottom,transparent 0,transparent calc(25% - 1px),var(--dsw-alias-border-l2) 25%,transparent calc(25% + 1px))}',
		'.bl-bars{position:absolute;inset:0;display:grid;align-items:end}',
		'.bl-barColumn{height:100%;display:flex;align-items:center;justify-content:flex-end;flex-direction:column;min-width:0}',
		'.bl-barStack{width:min(34px,65%);display:flex;flex-direction:column;justify-content:flex-end;border-radius:4px 4px 0 0;overflow:hidden;min-height:1px}',
		'.bl-bar{width:100%;min-height:1px}',
		'.bl-barInput{background:#4a91f5}',
		'.bl-barCache{background:#8e6be8}',
		'.bl-barOutput{background:#aacbf9}',
		'.bl-xLabels{position:absolute;left:49px;right:58px;bottom:0;height:20px;display:grid;color:var(--dsw-alias-label-tertiary);font-size:11px;text-align:center}',
		'.bl-xLabelCurrent{color:#1677ff;font-weight:650}',
		'.bl-costLine{position:absolute;left:0;right:0;top:0;bottom:0;width:100%;height:100%;pointer-events:none;overflow:visible}',
		'.bl-costPoints{position:absolute;left:49px;right:58px;top:10px;bottom:29px;pointer-events:none;z-index:3}',
		'.bl-costPoint{position:absolute;width:9px;height:9px;border:2px solid #e59a13;border-radius:50%;background:var(--dsw-alias-bg-base);box-sizing:border-box;transform:translate(-50%,-50%);box-shadow:0 0 0 3px color-mix(in srgb,#e59a13 12%,transparent)}',
		'.bl-chartEmpty{height:100%;display:grid;place-items:center;color:var(--dsw-alias-label-tertiary);font-size:13px}',
		'.bl-modelCard{padding:18px 22px 9px}',
		'.bl-modelHead,.bl-modelRow{display:grid;grid-template-columns:minmax(210px,1.6fr) minmax(110px,1fr) 104px 72px 100px;gap:16px;align-items:center}',
		'.bl-modelHead{color:var(--dsw-alias-label-tertiary);font-size:12px;padding:0 0 13px}',
		'.bl-modelHead span:nth-child(n+3),.bl-modelRow span:nth-child(n+3){text-align:right}',
		'.bl-modelRow{min-height:52px;border-top:1px solid var(--dsw-alias-border-l2);font-size:13px}',
		'.bl-modelName{min-width:0;display:flex;align-items:center;gap:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
		'.bl-modelDot{width:22px;height:22px;border-radius:7px;background:#1677ff;color:#fff;display:grid;place-items:center;font-size:11px;flex:none}',
		'.bl-modelDotPurple{background:#7957df}',
		'.bl-modelDotDark{background:#17233f}',
		'.bl-modelDotGrey{background:#667085}',
		'.bl-progress{height:6px;border-radius:9px;background:var(--dsw-alias-fill-tsp-secondary);overflow:hidden}',
		'.bl-progress>span{display:block;height:100%;border-radius:inherit;background:#3c8bf4}',
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
		'@media(max-width:900px){.bl-page{padding:23px 20px 35px}.bl-modelHead,.bl-modelRow{grid-template-columns:minmax(180px,1.4fr) minmax(80px,1fr) 90px 60px 80px;gap:10px}.bl-metrics{padding:17px 14px}.bl-metric{padding:0 14px}}',
		'@media(max-width:680px){.bl-heading{flex-wrap:wrap}.bl-headingActions{width:100%;margin-left:46px}.bl-metrics{grid-template-columns:1fr;gap:15px}.bl-metric,.bl-metric:first-child{border-left:0;border-top:1px solid var(--dsw-alias-border-l2);padding:15px 0 0}.bl-metric:first-child{border-top:0;padding-top:0}.bl-legend{display:none}.bl-chart{padding-left:42px;padding-right:53px}.bl-yLabels{width:35px}.bl-costLabels{width:45px}.bl-xLabels{left:42px;right:53px}.bl-costPoints{left:42px;right:53px}.bl-modelHead,.bl-modelRow{grid-template-columns:minmax(150px,1fr) 100px 80px;gap:10px}.bl-modelHead span:nth-child(2),.bl-modelRow .bl-modelProgress{display:none}.bl-modelHead span:nth-child(3){grid-column:2}.bl-modelHead span:nth-child(4){grid-column:3}.bl-modelHead span:nth-child(5){display:none}.bl-modelRow span:nth-child(3){grid-column:2}.bl-modelRow span:nth-child(4){grid-column:3}.bl-modelRow span:nth-child(5){display:none}}',
		'@media(prefers-reduced-motion:reduce){.bl-barStack,.bl-card{animation:none!important;transition:none!important}}',
	].join('');
	if (!existingStyle) document.head.appendChild(style);

	function icon(props: { size?: number }): React.ReactNode {
		var size = props && props.size ? props.size : 16;
		return h('svg', { width: size, height: size, viewBox: '0 0 18 18', fill: 'none', 'aria-hidden': true },
			h('ellipse', { cx: 8, cy: 4, rx: 5.5, ry: 2.5, stroke: 'currentColor', strokeWidth: 1.4 }),
			h('path', { d: 'M2.5 4v4c0 1.4 2.5 2.5 5.5 2.5M13.5 6.2V4', stroke: 'currentColor', strokeWidth: 1.4 }),
			h('path', { d: 'M8 8.4c0 1.4 2.5 2.5 5.5 2.5S19 9.8 19 8.4v-4', stroke: 'currentColor', strokeWidth: 1.4, transform: 'translate(-2.5 2)' }),
			h('path', { d: 'M8 12.2v1.3c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5v-4', stroke: 'currentColor', strokeWidth: 1.4, transform: 'translate(-2.5 0)' }),
		);
	}

	function isRecord(value: unknown): value is Record<string, unknown> {
		return typeof value === 'object' && value !== null && !Array.isArray(value);
	}

	function formatTokens(value: number): string {
		if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
		if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
		if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
		return Math.round(value).toLocaleString('en-US');
	}

	function formatCost(value: number | null): string {
		return value === null ? '—' : `¥${value.toFixed(2)}`;
	}

	function formatDate(timestamp: number): string {
		return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric' }).format(new Date(timestamp));
	}

	function formatTime(timestamp: number): string {
		return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
	}

	function requestBilling(body: Record<string, unknown>): Promise<BillingSummary> {
		return window.fetch('/api/billing', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		}).then(async function (response) {
			var payload: unknown = await response.json();
			if (!response.ok || !isRecord(payload) || payload.ok !== true || !isRecord(payload.value)) {
				var error = isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === 'string'
					? payload.error.message
					: `Billing 请求失败（${response.status}）`;
				throw new Error(error);
			}
			return payload.value as unknown as BillingSummary;
		});
	}

	function useBillingData(sessionId?: string): BillingState & { refresh: () => void } {
		var [state, setState] = React.useState<BillingState>({ loading: true, error: '' });
		var load = React.useCallback(function () {
			if (sessionId === '') return;
			setState(function (previous) {
				return previous.data === undefined
					? { loading: true, error: '' }
					: { loading: false, error: '', data: previous.data };
			});
			requestBilling({ op: 'summary', ...(sessionId ? { sessionId: sessionId } : {}) }).then(function (data) {
				setState({ loading: false, error: '', data: data });
			}, function (error: unknown) {
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

	function Metric(props: { label: string; value: string; hint: string; cost?: boolean }): React.ReactNode {
		return h('div', { className: 'bl-metric' },
			h('div', { className: 'bl-metricLabel' }, props.label),
			h('div', { className: 'bl-metricValue' + (props.cost ? ' bl-metricValueCost' : '') }, props.value),
			h('div', { className: 'bl-metricHint' }, props.hint),
		);
	}

	function Metrics(props: { data: BillingSummary }): React.ReactNode {
		var totals = props.data.totals;
		return h('div', { className: 'bl-card bl-metrics' },
			h(Metric, { label: '时间范围 Token', value: formatTokens(totals.totalTokens), hint: `${totals.calls} 次调用` }),
			h(Metric, { label: '估算费用', value: formatCost(totals.estimatedCost), hint: totals.unpricedCalls > 0 ? `${totals.unpricedCalls} 次未知模型未计价` : '估算费用，非官方账单', cost: true }),
			h(Metric, { label: '缓存命中 Token', value: formatTokens(totals.cacheReadTokens), hint: totals.totalTokens > 0 ? `占总量 ${(totals.cacheReadTokens / totals.totalTokens * 100).toFixed(1)}%` : '暂无缓存命中数据' }),
		);
	}

	function Chart(props: { data: BillingSummary }): React.ReactNode {
		var days = props.data.daily.slice(-7);
		var maxTokens = Math.max(1, ...days.map(function (day) { return day.totalTokens; }));
		var maxCost = Math.max(0.01, ...days.map(function (day) { return day.estimatedCost; }));
		var costPoints = days.map(function (day, index) {
			var x = days.length <= 1 ? 50 : (index + 0.5) / days.length * 100;
			var y = 92 - day.estimatedCost / maxCost * 80;
			return { x: x, y: y };
		});
		var costPath = costPoints.length === 0 ? '' : costPoints.length === 1
			? `M ${costPoints[0]!.x} ${costPoints[0]!.y}`
			: costPoints.reduce(function (path, point, index) {
				if (index === 0) return `M ${point.x} ${point.y}`;
				var previous = costPoints[index - 1]!;
				var beforePrevious = costPoints[index - 2] || previous;
				var next = costPoints[index + 1] || point;
				var cp1x = previous.x + (point.x - beforePrevious.x) / 6;
				var cp2x = point.x - (next.x - previous.x) / 6;
				return `${path} C ${cp1x} ${previous.y}, ${cp2x} ${point.y}, ${point.x} ${point.y}`;
			}, '');
		var areaPath = costPath === '' ? '' : `${costPath} L ${costPoints[costPoints.length - 1]!.x} 92 L ${costPoints[0]!.x} 92 Z`;
		return h('div', { className: 'bl-card bl-chartCard' },
			h('div', { className: 'bl-cardHeader' },
				h('div', { className: 'bl-cardTitle' }, '最近 7 天'),
				h('div', { className: 'bl-legend' },
					h('span', { className: 'bl-legendItem' }, h('i', { className: 'bl-swatch bl-swatchInput' }), '输入 Token'),
					h('span', { className: 'bl-legendItem' }, h('i', { className: 'bl-swatch bl-swatchCache' }), '缓存命中 Token'),
					h('span', { className: 'bl-legendItem' }, h('i', { className: 'bl-swatch bl-swatchOutput' }), '输出 Token'),
					h('span', { className: 'bl-legendItem' }, h('i', { className: 'bl-lineLegend' }), '估算费用（¥）'),
				),
			),
			days.length === 0 ? h('div', { className: 'bl-chartEmpty' }, '暂无模型调用记录') : h('div', { className: 'bl-chart' },
				h('div', { className: 'bl-yLabels' }, h('span', null, formatTokens(maxTokens)), h('span', null, formatTokens(maxTokens / 2)), h('span', null, '0')),
				h('div', { className: 'bl-costLabels' }, h('span', null, `¥${maxCost.toFixed(2)}`), h('span', null, `¥${(maxCost / 2).toFixed(2)}`), h('span', null, '¥0')),
				h('div', { className: 'bl-chartPlot' },
					h('div', { className: 'bl-bars', style: { gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` } }, days.map(function (day) {
					var scale = 100 / maxTokens;
					return h('div', { className: 'bl-barColumn', key: day.date },
						h('div', { className: 'bl-barStack', style: { height: `${Math.max(1, day.totalTokens * scale)}%` } },
							h('div', { className: 'bl-bar bl-barOutput', style: { flex: day.outputTokens } }),
							h('div', { className: 'bl-bar bl-barCache', style: { flex: day.cacheReadTokens } }),
							h('div', { className: 'bl-bar bl-barInput', style: { flex: day.inputTokens + day.cacheWriteTokens } }),
						),
					);
				})),
					h('svg', { className: 'bl-costLine', viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': true },
					 h('defs', null, h('linearGradient', { id: 'billing-cost-fill', x1: '0', y1: '0', x2: '0', y2: '1' }, h('stop', { offset: '0%', stopColor: '#f0a116', stopOpacity: '0.18' }), h('stop', { offset: '100%', stopColor: '#f0a116', stopOpacity: '0' }))),
					 areaPath === '' ? null : h('path', { d: areaPath, fill: 'url(#billing-cost-fill)' }),
					 costPath === '' ? null : h('path', { d: costPath, fill: 'none', stroke: '#e59a13', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', vectorEffect: 'non-scaling-stroke' }),
				),
				),
				h('div', { className: 'bl-costPoints' }, days.map(function (day, index) {
					var point = costPoints[index]!;
					return h('span', { key: day.date, className: 'bl-costPoint', style: { left: `${point.x}%`, top: `${point.y}%` } });
				})),
				h('div', { className: 'bl-xLabels', style: { gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` } }, days.map(function (day, index) {
					return h('span', { key: day.date, className: index === days.length - 1 ? 'bl-xLabelCurrent' : '' }, formatDate(new Date(`${day.date}T00:00:00+08:00`).getTime()));
				})),
			),
		);
	}

	function modelClass(index: number): string {
		return index === 1 ? 'bl-modelDot bl-modelDotPurple' : index === 2 ? 'bl-modelDot bl-modelDotDark' : index > 2 ? 'bl-modelDot bl-modelDotGrey' : 'bl-modelDot';
	}

	function ModelList(props: { data: BillingSummary }): React.ReactNode {
		var models = props.data.models;
		return h('div', { className: 'bl-card bl-modelCard' },
			h('div', { className: 'bl-cardHeader' }, h('div', { className: 'bl-cardTitle' }, '按模型')),
			models.length === 0 ? h('div', { className: 'bl-empty' }, '暂无可展示的模型调用') : h(React.Fragment, null,
				h('div', { className: 'bl-modelHead' }, h('span', null, '模型'), h('span', null, '用量占比'), h('span', null, 'Token'), h('span', null, '缓存命中'), h('span', null, '估算费用（¥）')),
				models.map(function (model, index) {
					return h('div', { className: 'bl-modelRow', key: model.model },
						h('span', { className: 'bl-modelName', title: model.model }, h('i', { className: modelClass(index) }, '◉'), model.model),
						h('span', { className: 'bl-modelProgress' }, h('div', { className: 'bl-progress' }, h('span', { style: { width: `${Math.max(2, model.share * 100)}%` } }))),
						h('span', null, formatTokens(model.totalTokens)),
						h('span', null, formatTokens(model.cacheReadTokens)),
						h('span', { className: model.estimatedCost === 0 && model.unpricedCalls > 0 ? 'bl-modelMuted' : '' }, formatCost(model.estimatedCost === 0 && model.unpricedCalls > 0 ? null : model.estimatedCost)),
					);
				}),
				h('div', { className: 'bl-modelRow bl-total' }, h('span', null, '合计'), h('span', { className: 'bl-modelProgress' }), h('span', null, formatTokens(props.data.totals.totalTokens)), h('span', null, formatTokens(props.data.totals.cacheReadTokens)), h('span', null, formatCost(props.data.totals.estimatedCost))),
			),
		);
	}

	function DetailList(props: { data: BillingSummary }): React.ReactNode {
		return h('div', { className: 'bl-card bl-detailCard' },
			h('div', { className: 'bl-cardHeader', style: { padding: '18px 22px 0' } }, h('div', { className: 'bl-cardTitle' }, '调用明细')),
			props.data.truncated ? h('div', { className: 'bl-status', style: { padding: '0 22px' } }, '明细最多展示最近 2,000 次调用，汇总数据不受影响。') : null,
			props.data.calls.length === 0 ? h('div', { className: 'bl-empty' }, '暂无模型调用记录') : h('div', { className: 'bl-tableScroll' },
				h('table', { className: 'bl-detailTable' },
					h('thead', null, h('tr', null, h('th', null, '时间'), h('th', null, '模型'), h('th', null, '输入'), h('th', null, '缓存命中'), h('th', null, '输出'), h('th', null, '估算费用'))),
					h('tbody', null, props.data.calls.map(function (call) {
						return h('tr', { key: call.callKey }, h('td', null, formatTime(call.timestamp)), h('td', null, call.model), h('td', null, formatTokens(call.inputTokens)), h('td', null, formatTokens(call.cacheReadTokens)), h('td', null, formatTokens(call.outputTokens)), h('td', { title: call.priceReason }, formatCost(call.estimatedCost)));
					})),
				),
			),
		);
	}

	function Issues(props: { data: BillingSummary }): React.ReactNode {
		if (props.data.issues.length === 0) return null;
		var first = props.data.issues[0];
		return h('div', { className: 'bl-issue', role: 'status' }, `部分日志未能完整读取：${first ? first.message : '请稍后重试'}${props.data.issues.length > 1 ? `（共 ${props.data.issues.length} 项）` : ''}`);
	}

	function Dashboard(_props: BillingProps): React.ReactNode {
		var state = useBillingData();
		var [tab, setTab] = React.useState<'usage' | 'detail'>('usage');
		if (state.loading && state.data === undefined) return h('div', { className: 'bl-page' }, h('div', { className: 'bl-loading' }, '正在读取 Token 用量…'));
		if (state.error !== '' && state.data === undefined) return h('div', { className: 'bl-page' }, h('div', { className: 'bl-empty' }, state.error));
		var data = state.data;
		if (data === undefined) return null;
		return h('div', { className: 'bl-page', 'data-testid': 'billing-dashboard' }, h('div', { className: 'bl-shell' },
			h('div', { className: 'bl-heading' }, h('div', { className: 'bl-headingIcon' }, h(icon, { size: 20 })), h('div', { className: 'bl-headingCopy' }, h('h1', { className: 'bl-title' }, 'Billing')), h('div', { className: 'bl-headingActions' }, h('span', { className: 'bl-range' }, '最近 7 天'), h('button', { className: 'bl-iconBtn', type: 'button', title: '刷新', 'aria-label': '刷新', onClick: state.refresh }, h(P.IconRefreshOutline16)))),
			h('div', { className: 'bl-tabs', role: 'tablist' }, h('button', { type: 'button', role: 'tab', className: tab === 'usage' ? 'bl-tab bl-tabActive' : 'bl-tab', 'aria-selected': tab === 'usage', onClick: function () { setTab('usage'); } }, 'Token 用量'), h('button', { type: 'button', role: 'tab', className: tab === 'detail' ? 'bl-tab bl-tabActive' : 'bl-tab', 'aria-selected': tab === 'detail', onClick: function () { setTab('detail'); } }, '调用明细')),
			h(Issues, { data: data }),
			state.error !== '' ? h('div', { className: 'bl-status' }, `刷新失败，正在展示上次数据：${state.error}`) : null,
			tab === 'usage' ? h(React.Fragment, null, h(Metrics, { data: data }), h(Chart, { data: data }), h(ModelList, { data: data })) : h(DetailList, { data: data }),
		));
	}

	function SettingsSection(_props: BillingProps): React.ReactNode {
		return h('div', { className: 'bl-page' }, h('div', { className: 'bl-shell bl-settings' },
			h('div', { className: 'bl-heading' }, h('div', { className: 'bl-headingIcon' }, h(icon, { size: 20 })), h('div', { className: 'bl-headingCopy' }, h('h1', { className: 'bl-title' }, 'Billing'), h('div', { className: 'bl-subtitle' }, '影子计费设置'))),
			h('div', { className: 'bl-card' },
				h('div', { className: 'bl-settingSection' }, h('div', { className: 'bl-settingTitle' }, '计价口径'), h('div', { className: 'bl-settingText' }, '以下价格只用于本地估算，不会产生真实扣费。DeepSeek Flash 按每百万 Token 计价，峰值时段按低谷价 ×2。')), 
				h('div', { className: 'bl-settingSection' }, h('div', { className: 'bl-settingTitle' }, 'DeepSeek Flash 价目表（¥ / 1M Token）'), h('table', { className: 'bl-rateTable' }, h('thead', null, h('tr', null, h('th', null, 'Token 类型'), h('th', null, '低谷'), h('th', null, '高峰'))), h('tbody', null, h('tr', null, h('td', null, '输入 / 未命中'), h('td', null, '¥0.05'), h('td', null, '¥0.10')), h('tr', null, h('td', null, '缓存命中'), h('td', null, '¥1.50'), h('td', null, '¥3.00')), h('tr', null, h('td', null, '输出'), h('td', null, '¥4.50'), h('td', null, '¥9.00'))))),
				h('div', { className: 'bl-settingSection' }, h('div', { className: 'bl-settingTitle' }, '峰谷规则'), h('div', { className: 'bl-settingText' }, '高峰：北京时间工作日 09:00–12:00、14:00–18:00；低谷：其他时段及周末（2026-08-23 起周末全天低谷）。未知模型只展示 Token，不计入费用。')),
			),
		));
	}

	function apply(ctx: ClientContext): void {
		var slots = ctx.get('slots') as BillingSlots | undefined;
		if (slots === undefined) return;
		var resolvedSlots = slots;
		resolvedSlots.inject('extension.manager.section', function () {
			return resolvedSlots.register({ name: 'extension.manager.section', id: 'billing', order: 40, label: 'Billing' }, Dashboard as React.ComponentType<Record<string, unknown>>);
		});
		resolvedSlots.inject('settings.section', function () {
			return resolvedSlots.register({ name: 'settings.section', id: 'billing', order: 80, label: 'Billing' }, SettingsSection as React.ComponentType<Record<string, unknown>>);
		});
	}

			return { apply: apply };
		},
	});
})();
