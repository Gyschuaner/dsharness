/**
 * dsh-shadow-billing — Client half（DSH-032）。
 *
 * Billing 只出现在扩展管理器与设置页。仪表盘沿用 DSH-032 最终确认的
 * 收据标题、三项总览、Token/费用组合图、模型构成和调用明细布局。
 */

interface SummaryValue {
	days: number;
	requests: number;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	costNano: number;
}

interface ModelRow {
	model: string;
	requests: number;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	costNano: number;
}

interface DailyRow {
	day: string;
	requests: number;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	costNano: number;
}

interface RequestRow {
	record_id: string;
	session_id: string;
	model: string;
	input_tokens: number;
	output_tokens: number;
	cache_read_tokens: number;
	cache_write_tokens: number;
	cost_nano: number;
	day: string;
	created_at: number;
}

interface RequestsValue {
	days: number;
	page: number;
	size: number;
	total: number;
	rows: RequestRow[];
}

interface BillingData {
	summary: SummaryValue;
	models: ModelRow[];
	daily: DailyRow[];
	requests: RequestsValue;
}

interface ApiEnvelope<T> {
	ok: boolean;
	value?: T;
	error?: { code: string; message: string };
}

interface ShadowBillingSlots {
	register(config: Record<string, unknown>, component: (props: Record<string, unknown>) => unknown): unknown;
	inject(name: string, effect: () => unknown): void;
}

function fmtTokens(value: number): string {
	if (value >= 1_000_000_000) return (value / 1_000_000_000).toFixed(2) + 'B';
	if (value >= 1_000_000) return (value / 1_000_000).toFixed(2) + 'M';
	if (value >= 1_000) return (value / 1_000).toFixed(1) + 'K';
	return Math.round(value).toLocaleString('en-US');
}

function fmtCost(costNano: number): string {
	return '¥' + (costNano / 1e9).toFixed(2);
}

function fmtDay(day: string): string {
	const parts = day.split('-');
	return parts.length === 3 ? Number(parts[1]) + '/' + Number(parts[2]) : day;
}

function fmtTime(timestamp: number): string {
	return new Intl.DateTimeFormat('zh-CN', {
		timeZone: 'Asia/Shanghai',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
	}).format(new Date(timestamp));
}

async function apiGet<T>(url: string): Promise<T> {
	const response = await fetch(url, { headers: { accept: 'application/json' } });
	const body = (await response.json()) as ApiEnvelope<T>;
	if (!response.ok || !body.ok || body.value === undefined) {
		throw new Error(body.error?.message ?? 'Billing 请求失败（' + response.status + '）');
	}
	return body.value;
}

(function () {
	window.__ModuleLoader__.load({
		id: 'dsh-shadow-billing',
		factory: function (require) {
			var React = require('react');
			var h = React.createElement;

			function ReceiptIcon(props: { size?: number }): React.ReactNode {
				const size = props.size ?? 18;
				return h('svg', { width: size, height: size, viewBox: '0 0 18 18', fill: 'none', 'aria-hidden': true },
					h('path', { d: 'M4 2.25h10v13.5l-2.5-1.5-2.5 1.5-2.5-1.5L4 15.75V2.25Z', stroke: 'currentColor', strokeWidth: 1.35, strokeLinejoin: 'round' }),
					h('path', { d: 'M6.5 5.75h5M6.5 8.75h5M6.5 11.75h3', stroke: 'currentColor', strokeWidth: 1.25, strokeLinecap: 'round' }),
				);
			}

			function RefreshIcon(): React.ReactNode {
				return h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
					h('path', { d: 'M13 5.5V2.75m0 0h-2.75M13 2.75A5.75 5.75 0 1 0 13.2 10', stroke: 'currentColor', strokeWidth: 1.35, strokeLinecap: 'round', strokeLinejoin: 'round' }),
				);
			}

			function useBillingData(page: number): {
				loading: boolean;
				refreshing: boolean;
				error: string;
				data?: BillingData;
				refresh: () => void;
			} {
				const [state, setState] = React.useState<{
					loading: boolean;
					refreshing: boolean;
					error: string;
					data?: BillingData;
				}>({ loading: true, refreshing: false, error: '' });
				const load = React.useCallback(function (fold: boolean): void {
					setState(function (previous) {
						return { ...previous, loading: previous.data === undefined, refreshing: fold, error: '' };
					});
					const prepare = fold
						? fetch('/api/shadow-billing/fold', { method: 'POST' }).then(function () { return undefined; })
						: Promise.resolve();
					prepare.then(function () {
						return Promise.all([
							apiGet<SummaryValue>('/api/shadow-billing/summary?days=7'),
							apiGet<{ models: ModelRow[] }>('/api/shadow-billing/by-model?days=7'),
							apiGet<{ daily: DailyRow[] }>('/api/shadow-billing/daily?days=7'),
							apiGet<RequestsValue>('/api/shadow-billing/requests?days=7&page=' + page + '&size=20'),
						]);
					}).then(function ([summary, models, daily, requests]) {
						setState({
							loading: false,
							refreshing: false,
							error: '',
							data: { summary, models: models.models, daily: daily.daily, requests },
						});
					}, function (error: unknown) {
						setState(function (previous) {
							return {
								...previous,
								loading: false,
								refreshing: false,
								error: error instanceof Error ? error.message : String(error),
							};
						});
					});
				}, [page]);
				React.useEffect(function () { load(false); }, [load]);
				return { ...state, refresh: function () { load(true); } };
			}

			function Metric(props: { label: string; value: string; hint?: string; cost?: boolean }): React.ReactNode {
				return h('div', { className: 'bl-metric' },
					h('div', { className: 'bl-metricLabel' }, props.label),
					h('div', { className: 'bl-metricValue' + (props.cost ? ' bl-metricValueCost' : '') }, props.value),
					props.hint === undefined ? null : h('div', { className: 'bl-metricHint' }, props.hint),
				);
			}

			function Metrics(props: { summary: SummaryValue }): React.ReactNode {
				const summary = props.summary;
				const total = summary.inputTokens + summary.cacheReadTokens + summary.outputTokens;
				const cacheRate = total === 0 ? 0 : summary.cacheReadTokens / total * 100;
				return h('div', { className: 'bl-card bl-metrics' },
					h(Metric, { label: '最近 7 天 Token', value: fmtTokens(total), hint: summary.requests + ' 次模型调用' }),
					h(Metric, { label: '估算费用', value: fmtCost(summary.costNano), cost: true }),
					h(Metric, { label: '缓存命中 Token', value: fmtTokens(summary.cacheReadTokens), hint: '占总量 ' + cacheRate.toFixed(1) + '%' }),
				);
			}

			function Chart(props: { daily: DailyRow[] }): React.ReactNode {
				const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);
				const [hoverPosition, setHoverPosition] = React.useState<{ x: number; y: number } | null>(null);
				const plotRef = React.useRef<HTMLDivElement | null>(null);
				const days = props.daily.slice(-7);
				const totals = days.map(function (day) {
					return day.inputTokens + day.cacheReadTokens + day.outputTokens;
				});
				const maxTokens = Math.max(1, ...totals);
				const maxCost = Math.max(0.01, ...days.map(function (day) { return day.costNano / 1e9; }));
				const points = days.map(function (day, index) {
					return {
						x: days.length <= 1 ? 50 : (index + 0.5) / days.length * 100,
						y: 92 - (day.costNano / 1e9) / maxCost * 80,
					};
				});
				const costPath = points.length === 0 ? '' : points.map(function (point, index) {
					return (index === 0 ? 'M' : 'L') + ' ' + point.x + ' ' + point.y;
				}).join(' ');
				const areaPath = costPath === '' ? '' : costPath + ' L ' + points[points.length - 1]!.x + ' 92 L ' + points[0]!.x + ' 92 Z';
				function updateHover(event: React.MouseEvent<HTMLDivElement>): void {
					const plot = plotRef.current;
					if (plot === null) return;
					const rect = plot.getBoundingClientRect();
					if (rect.width <= 0 || rect.height <= 0) return;
					setHoverPosition({
						x: (event.clientX - rect.left) / rect.width * 100,
						y: (event.clientY - rect.top) / rect.height * 100,
					});
				}
				let tooltip: React.ReactNode = null;
				if (hoveredIndex !== null && days[hoveredIndex] !== undefined) {
					const day = days[hoveredIndex]!;
					const point = points[hoveredIndex]!;
					const left = Math.min(84, Math.max(16, hoverPosition?.x ?? point.x));
					const y = hoverPosition?.y ?? point.y;
					const top = Math.min(92, Math.max(6, y));
					const transform = y >= 55 ? 'translate(-50%, calc(-100% - 12px))' : 'translate(-50%, 12px)';
					function tooltipRow(className: string, label: string, value: string, cost = false): React.ReactNode {
						return h('div', { className: 'bl-chartTooltipRow' },
							h('i', { className: 'bl-chartTooltipSwatch ' + className }),
							h('span', { className: 'bl-chartTooltipLabel' }, label),
							h('strong', { className: 'bl-chartTooltipValue' + (cost ? ' bl-chartTooltipCost' : '') }, value),
						);
					}
					tooltip = h('div', {
						className: 'bl-chartTooltip',
						role: 'tooltip',
						style: { left: left + '%', top: top + '%', transform },
					},
						h('div', { className: 'bl-chartTooltipTitle' }, fmtDay(day.day)),
						h('div', { className: 'bl-chartTooltipRows' },
							tooltipRow('bl-chartTooltipSwatchInput', '输入 Token', fmtTokens(day.inputTokens)),
							tooltipRow('bl-chartTooltipSwatchCache', '缓存命中 Token', fmtTokens(day.cacheReadTokens)),
							tooltipRow('bl-chartTooltipSwatchOutput', '输出 Token', fmtTokens(day.outputTokens)),
							tooltipRow('bl-chartTooltipSwatchCost', '估算费用', fmtCost(day.costNano), true),
						),
					);
				}
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
					days.length === 0
						? h('div', { className: 'bl-chartEmpty' }, '暂无模型调用记录')
						: h('div', {
							className: 'bl-chart',
							onMouseLeave: function () { setHoveredIndex(null); setHoverPosition(null); },
						},
							h('div', { className: 'bl-yLabels' },
								h('span', null, fmtTokens(maxTokens)),
								h('span', null, fmtTokens(maxTokens / 2)),
								h('span', null, '0'),
							),
							h('div', { className: 'bl-costLabels' },
								h('span', null, '¥' + maxCost.toFixed(2)),
								h('span', null, '¥' + (maxCost / 2).toFixed(2)),
								h('span', null, '¥0'),
							),
							h('div', { className: 'bl-chartPlot', ref: plotRef },
								h('div', {
									className: 'bl-bars',
									style: { gridTemplateColumns: 'repeat(' + days.length + ', minmax(0, 1fr))' },
								}, days.map(function (day, index) {
									const total = totals[index]!;
									return h('div', {
										className: 'bl-barColumn',
										key: day.day,
										tabIndex: 0,
										onFocus: function () { setHoveredIndex(index); },
									},
										h('div', {
											className: 'bl-barStack',
											'data-billing-bar': day.day,
											style: { height: Math.max(1, total / maxTokens * 100) + '%' },
											onMouseEnter: function (event: React.MouseEvent<HTMLDivElement>) {
												setHoveredIndex(index);
												updateHover(event);
											},
											onMouseMove: updateHover,
											onMouseLeave: function () { setHoveredIndex(null); setHoverPosition(null); },
										},
											h('div', { className: 'bl-bar bl-barOutput', style: { flex: day.outputTokens } }),
											h('div', { className: 'bl-bar bl-barCache', style: { flex: day.cacheReadTokens } }),
											h('div', { className: 'bl-bar bl-barInput', style: { flex: day.inputTokens } }),
										),
									);
								})),
								h('svg', {
									className: 'bl-costLine',
									viewBox: '0 0 100 100',
									preserveAspectRatio: 'none',
									'aria-hidden': true,
								},
									h('defs', null, h('linearGradient', {
										id: 'shadow-billing-cost-fill', x1: '0', y1: '0', x2: '0', y2: '1',
									},
										h('stop', { offset: '0%', stopColor: '#d18b3d', stopOpacity: '.18' }),
										h('stop', { offset: '100%', stopColor: '#d18b3d', stopOpacity: '0' }),
									)),
									areaPath === '' ? null : h('path', { d: areaPath, fill: 'url(#shadow-billing-cost-fill)' }),
									costPath === '' ? null : h('path', {
										d: costPath,
										fill: 'none',
										stroke: '#d18b3d',
										strokeWidth: 2.2,
										vectorEffect: 'non-scaling-stroke',
									}),
								),
								tooltip,
							),
							h('div', { className: 'bl-costPoints' }, days.map(function (day, index) {
								const point = points[index]!;
								return h('span', {
									key: day.day,
									className: 'bl-costPoint',
									style: { left: point.x + '%', top: point.y + '%' },
								});
							})),
							h('div', {
								className: 'bl-xLabels',
								style: { gridTemplateColumns: 'repeat(' + days.length + ', minmax(0, 1fr))' },
							}, days.map(function (day, index) {
								return h('span', {
									key: day.day,
									className: index === days.length - 1 ? 'bl-xLabelCurrent' : '',
								}, fmtDay(day.day));
							})),
						),
				);
			}

			function displayModelName(model: string): string {
				const normalized = model.toLowerCase();
				if (normalized === 'ds-flash') return 'deepseek-v4-flash-0731';
				if (normalized === 'qwen3.8-flash') return 'Qwen3.8-Flash-Next-FP8';
				return model;
			}

			function ModelIcon(props: { model: string }): React.ReactNode {
				const lower = displayModelName(props.model).toLowerCase();
				let provider = '其他模型';
				let className = 'bl-modelBrand bl-modelBrandGeneric';
				let path = 'M12 2l8 4.5v9L12 20l-8-4.5v-9L12 2Zm0 4-4 2.3v4.4l4 2.3 4-2.3V8.3L12 6Z';
				if (lower.includes('deepseek')) {
					provider = 'DeepSeek';
					className = 'bl-modelBrand bl-modelBrandDeepSeek';
					path = 'M23.748 4.651c-.254-.124-.364.113-.512.233-.051.04-.094.09-.137.137-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.155-.708-.311-.955-.65-.172-.24-.219-.509-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.094.172.187.129.323-.082.28-.18.553-.266.833-.055.179-.137.218-.328.14a5.5 5.5 0 0 1-1.737-1.179c-.857-.828-1.631-1.743-2.597-2.46a12 12 0 0 0-.689-.47c-.985-.957.13-1.743.387-1.836.27-.098.094-.433-.778-.428-.872.003-1.67.295-2.687.685a3 3 0 0 1-.465.136 9.6 9.6 0 0 0-2.883-.101c-1.885.21-3.39 1.1-4.497 2.622C.082 8.776-.231 10.854.152 13.02c.403 2.284 1.568 4.175 3.36 5.653 1.857 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.132-.284 4.994-1.86.47.234.962.328 1.78.398.629.058 1.235-.031 1.705-.129.735-.155.684-.836.418-.961-2.155-1.004-1.682-.595-2.112-.926 1.095-1.295 2.768-3.598 3.284-6.733.05-.346.115-.834.108-1.114-.004-.171.035-.238.23-.257a4.2 4.2 0 0 0 1.545-.475c1.397-.763 1.96-2.016 2.093-3.517.02-.23-.004-.467-.247-.588M11.58 18.168c-2.088-1.642-3.101-2.183-3.52-2.16-.39.024-.32.472-.234.763.09.288.207.487.371.74.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.168-1.361-.801-2.5-1.86-3.301-3.306-.775-1.393-1.225-2.888-1.299-4.482-.02-.385.094-.522.477-.592a4.7 4.7 0 0 1 1.53-.038c2.131.311 3.946 1.264 5.467 2.774.868.86 1.525 1.887 2.202 2.89.72 1.066 1.494 2.082 2.48 2.915.348.291.626.513.892.677-.802.09-2.14.109-3.055-.615zm1.001-6.44a.306.306 0 0 1 .415-.287.3.3 0 0 1 .113.074.3.3 0 0 1 .086.214c0 .17-.136.307-.308.307a.303.303 0 0 1-.306-.307m3.11 1.596c-.2.081-.4.151-.591.16a1.25 1.25 0 0 1-.798-.254c-.274-.23-.47-.358-.551-.758a1.7 1.7 0 0 1 .015-.588c.07-.327-.007-.537-.238-.727-.188-.156-.426-.199-.689-.199a.6.6 0 0 1-.254-.078.253.253 0 0 1-.114-.358 1 1 0 0 1 .192-.21c.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.392.451.462.576.685.915.176.264.336.536.446.848.066.194-.02.353-.25.45';
				} else if (lower.includes('qwen')) {
					provider = 'Qwen';
					className = 'bl-modelBrand bl-modelBrandQwen';
					path = 'M23.919 14.545 20.817 9.17l1.47-2.544a.56.56 0 0 0 0-.566l-1.633-2.83a.57.57 0 0 0-.49-.283h-6.207L12.487.402a.57.57 0 0 0-.49-.284H8.732a.56.56 0 0 0-.49.284L5.139 5.775h-2.94a.56.56 0 0 0-.49.284L.077 8.887a.56.56 0 0 0 0 .567L3.18 14.83l-1.47 2.545a.56.56 0 0 0 0 .566l1.634 2.83a.57.57 0 0 0 .49.283h6.205l1.47 2.545a.57.57 0 0 0 .49.284h3.266a.57.57 0 0 0 .49-.284l3.104-5.375h2.94a.57.57 0 0 0 .49-.283l1.634-2.828a.55.55 0 0 0-.004-.568M8.733.686l1.634 2.828-1.634 2.828H21.8L20.164 9.17H7.425L5.63 6.06Zm1.306 19.801-6.205-.002 1.634-2.83h3.265L2.201 6.344h3.267q3.182 5.517 6.367 11.032zm10.124-5.66L18.53 12l-6.532 11.315-1.634-2.83c2.129-3.673 4.25-7.351 6.373-11.028h3.592l3.102 5.374z';
				} else if (lower.includes('gpt') || lower.includes('openai')) {
					provider = 'OpenAI';
					className = 'bl-modelBrand bl-modelBrandOpenAI';
					path = 'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z';
				} else if (lower.includes('claude') || lower.includes('anthropic')) {
					provider = 'Anthropic';
					className = 'bl-modelBrand bl-modelBrandAnthropic';
					path = 'M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z';
				}
				return h('span', {
					className,
					title: provider,
				}, h('svg', {
					viewBox: '0 0 24 24',
					role: 'img',
					'aria-label': provider,
				}, h('path', { d: path })));
			}

			function TokenComposition(props: { model: ModelRow; allTokens: number }): React.ReactNode {
				const model = props.model;
				const total = model.inputTokens + model.cacheReadTokens + model.outputTokens;
				const percent = function (value: number): string {
					return (total > 0 ? value / total * 100 : 0) + '%';
				};
				const share = props.allTokens > 0 ? total / props.allTokens * 100 : 0;
				return h('div', { className: 'bl-modelProgress' },
					h('div', { className: 'bl-modelShare' }, '模型占总量 ' + share.toFixed(1) + '%'),
					h('div', { className: 'bl-progress' },
						h('span', { className: 'bl-progressSegment bl-progressInput', style: { width: percent(model.inputTokens) } }),
						h('span', { className: 'bl-progressSegment bl-progressCache', style: { width: percent(model.cacheReadTokens) } }),
						h('span', { className: 'bl-progressSegment bl-progressOutput', style: { width: percent(model.outputTokens) } }),
					),
					h('div', { className: 'bl-modelBreakdown' },
						h('span', { className: 'bl-modelBreakdownItem' }, h('i', { className: 'bl-modelBreakdownSwatch bl-modelBreakdownSwatchInput' }), '输入 ' + fmtTokens(model.inputTokens)),
						h('span', { className: 'bl-modelBreakdownItem' }, h('i', { className: 'bl-modelBreakdownSwatch bl-modelBreakdownSwatchCache' }), '命中 ' + fmtTokens(model.cacheReadTokens)),
						h('span', { className: 'bl-modelBreakdownItem' }, h('i', { className: 'bl-modelBreakdownSwatch bl-modelBreakdownSwatchOutput' }), '输出 ' + fmtTokens(model.outputTokens)),
					),
				);
			}

			function ModelList(props: { models: ModelRow[]; summary: SummaryValue }): React.ReactNode {
				const allTokens = props.summary.inputTokens + props.summary.cacheReadTokens + props.summary.outputTokens;
				return h('div', { className: 'bl-card bl-modelCard' },
					h('div', { className: 'bl-cardHeader' }, h('div', { className: 'bl-cardTitle' }, '按模型')),
					props.models.length === 0
						? h('div', { className: 'bl-empty' }, '暂无可展示的模型调用')
						: h(React.Fragment, null,
							h('div', { className: 'bl-modelHead' },
								h('span', null, '模型'),
								h('span', null, '用量构成'),
								h('span', null, 'Token'),
								h('span', null, '请求'),
								h('span', null, '估算费用（¥）'),
							),
							props.models.map(function (model) {
								const total = model.inputTokens + model.cacheReadTokens + model.outputTokens;
								const displayName = displayModelName(model.model);
								return h('div', { className: 'bl-modelRow', key: model.model },
									h('span', { className: 'bl-modelName', title: displayName }, h(ModelIcon, { model: displayName }), displayName),
									h(TokenComposition, { model, allTokens }),
									h('span', null, fmtTokens(total)),
									h('span', null, String(model.requests)),
									h('span', null, fmtCost(model.costNano)),
								);
							}),
							h('div', { className: 'bl-modelRow bl-total' },
								h('span', null, '合计'),
								h('span', null),
								h('span', null, fmtTokens(allTokens)),
								h('span', null, String(props.summary.requests)),
								h('span', null, fmtCost(props.summary.costNano)),
							),
						),
				);
			}

			function DetailList(props: { requests: RequestsValue; setPage: (page: number) => void }): React.ReactNode {
				const value = props.requests;
				return h('div', { className: 'bl-card bl-detailCard' },
					h('div', { className: 'bl-cardHeader bl-detailHeader' },
						h('div', { className: 'bl-cardTitle' }, '调用明细'),
						h('span', { className: 'bl-status' }, '共 ' + value.total + ' 条'),
					),
					value.rows.length === 0
						? h('div', { className: 'bl-empty' }, '暂无模型调用记录')
						: h('div', { className: 'bl-tableScroll' },
							h('table', { className: 'bl-detailTable' },
								h('thead', null, h('tr', null,
									h('th', null, '时间'),
									h('th', null, '模型'),
									h('th', null, '输入'),
									h('th', null, '缓存命中'),
									h('th', null, '输出'),
									h('th', null, '估算费用'),
								)),
								h('tbody', null, value.rows.map(function (row) {
									return h('tr', { key: row.record_id },
										h('td', null, fmtTime(row.created_at)),
										h('td', null, displayModelName(row.model)),
										h('td', null, fmtTokens(row.input_tokens)),
										h('td', null, fmtTokens(row.cache_read_tokens)),
										h('td', null, fmtTokens(row.output_tokens)),
										h('td', null, fmtCost(row.cost_nano)),
									);
								})),
							),
						),
					h('div', { className: 'bl-pager' },
						h('button', {
							type: 'button',
							className: 'bl-pageBtn',
							disabled: value.page <= 0,
							onClick: function () { props.setPage(value.page - 1); },
						}, '上一页'),
						h('span', null, '第 ' + (value.page + 1) + ' 页'),
						h('button', {
							type: 'button',
							className: 'bl-pageBtn',
							disabled: (value.page + 1) * value.size >= value.total,
							onClick: function () { props.setPage(value.page + 1); },
						}, '下一页'),
					),
				);
			}

			function Dashboard(): React.ReactNode {
				const [tab, setTab] = React.useState<'usage' | 'detail'>('usage');
				const [page, setPage] = React.useState(0);
				const state = useBillingData(page);
				if (state.loading && state.data === undefined) {
					return h('div', { className: 'bl-page' }, h('div', { className: 'bl-loading' }, '正在读取 Token 用量…'));
				}
				if (state.data === undefined) {
					return h('div', { className: 'bl-page' }, h('div', { className: 'bl-empty' }, state.error || '暂无计费数据'));
				}
				const data = state.data;
				return h('div', { className: 'bl-page', 'data-testid': 'billing-dashboard' },
					h('div', { className: 'bl-shell' },
						h('div', { className: 'bl-heading' },
							h('div', { className: 'bl-headingIcon' }, h(ReceiptIcon, { size: 20 })),
							h('div', { className: 'bl-headingCopy' },
								h('h1', { className: 'bl-title' }, 'Billing'),
								h('div', { className: 'bl-subtitle' }, '模型调用与 Token 成本'),
							),
							h('div', { className: 'bl-headingActions' },
								h('span', { className: 'bl-range' }, '最近 7 天'),
								h('button', {
									className: 'bl-iconBtn',
									type: 'button',
									title: '刷新',
									'aria-label': '刷新',
									disabled: state.refreshing,
									onClick: state.refresh,
								}, h(RefreshIcon)),
							),
						),
						h('div', { className: 'bl-tabs', role: 'tablist' },
							h('button', {
								type: 'button',
								role: 'tab',
								className: tab === 'usage' ? 'bl-tab bl-tabActive' : 'bl-tab',
								'aria-selected': tab === 'usage',
								onClick: function () { setTab('usage'); },
							}, 'Token 用量'),
							h('button', {
								type: 'button',
								role: 'tab',
								className: tab === 'detail' ? 'bl-tab bl-tabActive' : 'bl-tab',
								'aria-selected': tab === 'detail',
								onClick: function () { setTab('detail'); },
							}, '调用明细'),
						),
						state.error ? h('div', { className: 'bl-issue' }, '刷新失败，正在展示上次数据：' + state.error) : null,
						tab === 'usage'
							? h(React.Fragment, null,
								h(Metrics, { summary: data.summary }),
								h(Chart, { daily: data.daily }),
								h(ModelList, { models: data.models, summary: data.summary }),
							)
							: h(DetailList, { requests: data.requests, setPage }),
					),
				);
			}

			function SettingsView(): React.ReactNode {
				const [status, setStatus] = React.useState<{
					lastFold: { at: number; imported: number; repaired?: number; scanned: number } | null;
					sessionsRoot: string;
				} | null>(null);
				React.useEffect(function () {
					apiGet<{
						lastFold: { at: number; imported: number; repaired?: number; scanned: number } | null;
						sessionsRoot: string;
					}>('/api/shadow-billing/status').then(setStatus, function () { setStatus(null); });
				}, []);
				const source = status === null
					? '正在读取本地日志状态…'
					: status.sessionsRoot + (status.lastFold === null
						? ' · 尚未完成日志折叠'
						: ' · 上次折叠 ' + fmtTime(status.lastFold.at) + ' · 新增 ' + status.lastFold.imported + ' 条');
				return h('div', { className: 'bl-page', 'data-testid': 'sb-settings' },
					h('div', { className: 'bl-shell bl-settings' },
						h('div', { className: 'bl-heading' },
							h('div', { className: 'bl-headingIcon' }, h(ReceiptIcon, { size: 20 })),
							h('div', { className: 'bl-headingCopy' },
								h('h1', { className: 'bl-title' }, 'Billing'),
								h('div', { className: 'bl-subtitle' }, '影子计费设置'),
							),
						),
						h('div', { className: 'bl-card' },
							h('div', { className: 'bl-settingSection' },
								h('div', { className: 'bl-settingTitle' }, '计价口径'),
								h('div', { className: 'bl-settingText' }, '以下价格只用于本地估算，不会产生真实扣费。数据来自 DSH 会话日志中的真实 Token 用量。'),
							),
							h('div', { className: 'bl-settingSection' },
								h('div', { className: 'bl-settingTitle' }, 'DeepSeek Flash 价目表（¥ / 1M Token）'),
								h('table', { className: 'bl-rateTable' },
									h('thead', null, h('tr', null, h('th', null, 'Token 类型'), h('th', null, '低谷'), h('th', null, '高峰'))),
									h('tbody', null,
										h('tr', null, h('td', null, '输入 / 未命中'), h('td', null, '¥1.50'), h('td', null, '¥3.00')),
										h('tr', null, h('td', null, '缓存命中'), h('td', null, '¥0.05'), h('td', null, '¥0.10')),
										h('tr', null, h('td', null, '输出'), h('td', null, '¥4.50'), h('td', null, '¥9.00')),
									),
								),
							),
							h('div', { className: 'bl-settingSection' },
								h('div', { className: 'bl-settingTitle' }, 'Qwen3.8 Flash Next 价目表（¥ / 1M Token）'),
								h('div', { className: 'bl-settingText' }, '阿里云百炼华北 2 官方原价，全天固定价。'),
								h('table', { className: 'bl-rateTable' },
									h('thead', null, h('tr', null, h('th', null, 'Token 类型'), h('th', null, '价格'))),
									h('tbody', null,
										h('tr', null, h('td', null, '输入 / 未命中'), h('td', null, '¥1.00')),
										h('tr', null, h('td', null, '缓存命中'), h('td', null, '¥0.10')),
										h('tr', null, h('td', null, '输出'), h('td', null, '¥3.00')),
									),
								),
							),
							h('div', { className: 'bl-settingSection' },
								h('div', { className: 'bl-settingTitle' }, '峰谷规则'),
								h('div', { className: 'bl-settingText' }, '高峰：北京时间工作日 09:00–12:00、14:00–18:00；低谷：其他时段及周末（2026-08-23 起周末全天低谷）。'),
							),
							h('div', { className: 'bl-settingSection' },
								h('div', { className: 'bl-settingTitle' }, '数据源'),
								h('div', { className: 'bl-settingText' }, source),
							),
						),
					),
				);
			}

			var existingStyle = document.querySelector<HTMLStyleElement>('style[data-plugin="dsh-shadow-billing"]');
			var style = existingStyle || document.createElement('style');
			style.setAttribute('data-plugin', 'dsh-shadow-billing');
			style.textContent = [
				'.bl-page{box-sizing:border-box;width:100%;height:100%;overflow:auto;padding:30px 34px 46px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}',
				'.bl-shell{max-width:1180px;margin:0 auto}.bl-heading{display:flex;align-items:flex-start;gap:12px;margin-bottom:26px}.bl-headingIcon{width:34px;height:34px;border-radius:10px;background:color-mix(in srgb,#1677ff 10%,var(--dsw-alias-bg-base));color:#1677ff;display:grid;place-items:center;flex:none}.bl-headingCopy{min-width:0}.bl-title{margin:0;font-size:26px;line-height:34px;font-weight:680;letter-spacing:-.02em}.bl-subtitle{margin-top:5px;color:var(--dsw-alias-label-tertiary);font-size:13px}.bl-headingActions{margin-left:auto;display:flex;align-items:center;gap:8px}.bl-range{height:36px;display:inline-flex;align-items:center;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;padding:0 11px;color:var(--dsw-alias-label-secondary);font-size:13px}.bl-iconBtn{height:36px;width:36px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);cursor:pointer;display:inline-grid;place-items:center}.bl-iconBtn:hover{background:var(--dsw-alias-interactive-bg-hover)}',
				'.bl-tabs{display:flex;gap:5px;margin:-7px 0 17px}.bl-tab{border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;font:inherit;font-size:13px;padding:7px 11px}.bl-tab:hover{background:var(--dsw-alias-interactive-bg-hover)}.bl-tabActive{background:color-mix(in srgb,#1677ff 10%,var(--dsw-alias-bg-base));color:#1677ff;font-weight:650}',
				'.bl-card{border:1px solid var(--dsw-alias-border-l2);border-radius:13px;background:var(--dsw-alias-bg-base);box-shadow:0 1px 2px rgba(0,0,0,.02);margin-bottom:16px}.bl-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));padding:18px 24px}.bl-metric{min-width:0;padding:0 24px;border-left:1px solid var(--dsw-alias-border-l2)}.bl-metric:first-child{border-left:0;padding-left:0}.bl-metricLabel{color:var(--dsw-alias-label-secondary);font-size:13px}.bl-metricValue{margin-top:10px;font-size:28px;line-height:32px;font-weight:680;letter-spacing:-.02em}.bl-metricValueCost{color:#bd7b32}.bl-metricHint{margin-top:7px;color:var(--dsw-alias-label-tertiary);font-size:12px}',
				'.bl-chartCard{padding:18px 22px 13px}.bl-cardHeader{display:flex;align-items:center;gap:12px;margin-bottom:15px}.bl-cardTitle{font-size:15px;font-weight:650}.bl-legend{margin-left:auto;display:flex;gap:16px;color:var(--dsw-alias-label-secondary);font-size:12px}.bl-legendItem{display:inline-flex;align-items:center;gap:6px}.bl-swatch{width:9px;height:9px;border-radius:3px}.bl-swatchInput,.bl-barInput,.bl-progressInput,.bl-chartTooltipSwatchInput{background:#4b8ff7}.bl-swatchCache,.bl-barCache,.bl-progressCache,.bl-chartTooltipSwatchCache{background:#4faf9c}.bl-swatchOutput,.bl-barOutput,.bl-progressOutput,.bl-chartTooltipSwatchOutput{background:#a8c6eb}.bl-lineLegend{width:18px;height:3px;border-radius:3px;background:#d18b3d;display:inline-block}',
				'.bl-chart{height:258px;position:relative;padding:10px 58px 29px 49px;box-sizing:border-box}.bl-yLabels{position:absolute;top:8px;bottom:29px;left:0;width:42px;display:flex;flex-direction:column;justify-content:space-between;color:var(--dsw-alias-label-tertiary);font-size:11px;text-align:right}.bl-costLabels{position:absolute;top:8px;bottom:29px;right:0;width:50px;display:flex;flex-direction:column;justify-content:space-between;color:var(--dsw-alias-label-tertiary);font-size:11px}.bl-chartPlot{position:relative;height:100%;border-bottom:1px solid var(--dsw-alias-border-l2);background:repeating-linear-gradient(to bottom,transparent 0,transparent calc(25% - 1px),var(--dsw-alias-border-l2) 25%,transparent calc(25% + 1px))}.bl-bars{position:absolute;inset:0;display:grid;align-items:end}.bl-barColumn{height:100%;display:flex;align-items:center;justify-content:flex-end;flex-direction:column}.bl-barStack{width:min(34px,65%);display:flex;flex-direction:column;justify-content:flex-end;border-radius:4px 4px 0 0;overflow:hidden;min-height:1px}.bl-bar{width:100%;min-height:1px}.bl-xLabels{position:absolute;left:49px;right:58px;bottom:0;height:20px;display:grid;color:var(--dsw-alias-label-tertiary);font-size:11px;text-align:center}.bl-xLabelCurrent{color:#1677ff;font-weight:650}.bl-costLine{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}.bl-costPoints{position:absolute;left:49px;right:58px;top:10px;bottom:29px;pointer-events:none}.bl-costPoint{position:absolute;width:9px;height:9px;border:2px solid #d18b3d;border-radius:50%;background:var(--dsw-alias-bg-base);transform:translate(-50%,-50%)}.bl-chartEmpty{height:220px;display:grid;place-items:center;color:var(--dsw-alias-label-tertiary)}',
				'.bl-chartTooltip{position:absolute;z-index:5;min-width:194px;padding:11px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-base);box-shadow:0 10px 28px rgba(15,23,42,.16);pointer-events:none}.bl-chartTooltipTitle{font-size:12px;font-weight:650}.bl-chartTooltipRows{display:grid;gap:7px;margin-top:9px}.bl-chartTooltipRow{display:grid;grid-template-columns:8px minmax(0,1fr) auto;align-items:center;gap:7px;font-size:12px}.bl-chartTooltipSwatch{width:8px;height:8px;border-radius:3px}.bl-chartTooltipSwatchCost{background:#d18b3d;border-radius:50%}.bl-chartTooltipLabel{color:var(--dsw-alias-label-secondary)}.bl-chartTooltipValue{font-variant-numeric:tabular-nums}.bl-chartTooltipCost{color:#bd7b32}',
				'.bl-modelCard{padding:18px 22px 9px}.bl-modelHead,.bl-modelRow{display:grid;grid-template-columns:minmax(210px,1.35fr) minmax(230px,1.8fr) 104px 72px 100px;gap:16px;align-items:center}.bl-modelHead{color:var(--dsw-alias-label-tertiary);font-size:12px;padding-bottom:13px}.bl-modelHead>span:nth-child(n+3),.bl-modelRow>span:nth-child(n+3){text-align:right}.bl-modelRow{min-height:78px;border-top:1px solid var(--dsw-alias-border-l2);font-size:13px}.bl-modelName{min-width:0;display:flex;align-items:center;gap:8px;overflow:hidden;text-overflow:ellipsis}.bl-modelBrand{width:28px;height:28px;border-radius:9px;display:grid;place-items:center;flex:none}.bl-modelBrand svg{width:18px;height:18px;display:block;fill:currentColor}.bl-modelBrandDeepSeek{background:#eaf1ff;color:#3f7ff2}.bl-modelBrandQwen{background:#f0ecff;color:#7254df}.bl-modelBrandOpenAI{background:#edf1f6;color:#223049}.bl-modelBrandAnthropic{background:#fff0e9;color:#b56b4c}.bl-modelBrandGeneric{background:#edf1f7;color:#63728b}.bl-modelShare{margin-bottom:7px;color:var(--dsw-alias-label-tertiary);font-size:10px}.bl-progress{height:7px;display:flex;border-radius:9px;background:var(--dsw-alias-fill-tsp-secondary);overflow:hidden}.bl-progressSegment{height:100%}.bl-modelBreakdown{display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:8px;color:var(--dsw-alias-label-tertiary);font-size:10px}.bl-modelBreakdownItem{display:inline-flex;align-items:center;gap:4px}.bl-modelBreakdownSwatch{width:6px;height:6px;border-radius:2px}.bl-total{font-weight:650;padding-top:13px;margin-top:4px}',
				'.bl-detailCard{overflow:hidden}.bl-detailHeader{padding:18px 22px 0}.bl-detailHeader .bl-status{margin-left:auto}.bl-tableScroll{overflow:auto}.bl-detailTable{width:100%;border-collapse:collapse;font-size:12px;min-width:760px}.bl-detailTable th{color:var(--dsw-alias-label-tertiary);font-weight:500;text-align:left;background:var(--dsw-alias-fill-tsp-secondary);padding:11px 14px}.bl-detailTable td{padding:12px 14px;border-top:1px solid var(--dsw-alias-border-l2)}.bl-detailTable th:nth-child(n+3),.bl-detailTable td:nth-child(n+3){text-align:right}.bl-pager{display:flex;justify-content:flex-end;align-items:center;gap:10px;padding:12px 16px;color:var(--dsw-alias-label-tertiary);font-size:12px}.bl-pageBtn{height:28px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);cursor:pointer}.bl-pageBtn:disabled{opacity:.45;cursor:not-allowed}.bl-status{font-size:12px;color:var(--dsw-alias-label-tertiary)}.bl-issue{padding:11px 13px;border:1px solid color-mix(in srgb,#f0a116 35%,var(--dsw-alias-border-l2));border-radius:9px;color:var(--dsw-alias-label-secondary);font-size:12px;margin-bottom:16px}.bl-empty,.bl-loading{min-height:240px;display:grid;place-items:center;color:var(--dsw-alias-label-tertiary);font-size:13px}',
				'.bl-settings{max-width:760px}.bl-settingSection{padding:19px 22px;border-bottom:1px solid var(--dsw-alias-border-l2)}.bl-settingSection:last-child{border-bottom:0}.bl-settingTitle{font-size:14px;font-weight:650;margin-bottom:8px}.bl-settingText{font-size:13px;line-height:1.7;color:var(--dsw-alias-label-secondary)}.bl-rateTable{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}.bl-rateTable th,.bl-rateTable td{text-align:left;padding:9px 0;border-top:1px solid var(--dsw-alias-border-l2)}.bl-rateTable th{color:var(--dsw-alias-label-tertiary);font-weight:500}',
				'@media(max-width:900px){.bl-page{padding:23px 20px 35px}.bl-modelHead,.bl-modelRow{grid-template-columns:minmax(180px,1.25fr) minmax(205px,1.65fr) 90px 60px 80px;gap:10px}.bl-metrics{padding:17px 14px}.bl-metric{padding:0 14px}}@media(max-width:680px){.bl-heading{flex-wrap:wrap}.bl-headingActions{width:100%;margin-left:46px}.bl-metrics{grid-template-columns:1fr;gap:15px}.bl-metric,.bl-metric:first-child{border-left:0;border-top:1px solid var(--dsw-alias-border-l2);padding:15px 0 0}.bl-metric:first-child{border-top:0;padding-top:0}.bl-legend{display:none}.bl-modelHead,.bl-modelRow{grid-template-columns:minmax(150px,1fr) minmax(180px,1.2fr) 80px;gap:10px}.bl-modelHead>span:nth-child(n+4),.bl-modelRow>span:nth-child(n+4){display:none}}',
			].join('');
			if (!existingStyle) document.head.appendChild(style);

			var module: ClientModule = { exports: {} };
			module.exports.name = 'shadow-billing-ui';
			module.exports.inject = ['slots'];
			module.exports.apply = function (ctx) {
				var slots = ctx.get('slots') as ShadowBillingSlots | undefined;
				if (slots === undefined || typeof slots.register !== 'function') return;
				var activeSlots = slots;
				activeSlots.inject('extension.manager.section', function () {
					return activeSlots.register({
						name: 'extension.manager.section',
						id: 'billing',
						order: 40,
						label: function () { return 'Billing'; },
					}, Dashboard);
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
