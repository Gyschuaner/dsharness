/**
 * dsh-mcp-manager — Client half (DSH-026 / DSH-028, build 2).
 *
 * Plain classic JavaScript bundle: no imports, JSX or private product DOM
 * selectors. The page contributes one business section to the Extensions
 * shell and talks only to its own Host route.
 */
interface McpToolView {
	name: string;
	publicName: string;
	description: string;
}

interface McpServerView {
	id: string;
	serverName: string;
	description: string;
	transport: 'stdio' | 'streamable-http';
	enabled: boolean;
	toolCallTimeoutMs: number;
	requiredEnv: string[];
	status: string;
	missingEnvironment: string[];
	endpoint: string;
	fiberPhase: string | null;
	toolCount: number;
	tools: McpToolView[];
	updatedAt: string;
	command?: string;
	args?: string[];
	cwd?: string;
	env?: Record<string, string>;
	url?: string;
	headers?: Record<string, string>;
}

interface McpServerInput {
	serverName: string;
	description: string;
	transport: 'stdio' | 'streamable-http';
	enabled: boolean;
	toolCallTimeoutMs: number;
	requiredEnv: string[];
	command?: string;
	args?: string[];
	cwd?: string;
	env?: Record<string, string>;
	url?: string;
	headers?: Record<string, string>;
}

interface McpDraft {
	serverName: string;
	description: string;
	transport: 'stdio' | 'streamable-http';
	enabled: boolean;
	url: string;
	headersText: string;
	command: string;
	argsText: string;
	cwd: string;
	envText: string;
	toolCallTimeoutMs: number | string;
	requiredEnv: string[];
}

interface McpMarketItem {
	id: string;
	name: string;
	repository: string | null;
	repositoryUrl: string;
	registryName: string | null;
	version: string | null;
	description: string;
	iconUrl: string | null;
	source: 'featured' | 'mcp-registry';
	installable: boolean;
	installReason: string | null;
	status: 'installed' | 'not-installed';
	publishedAt?: string | null;
	updatedAt?: string | null;
}

type McpMarketSort = 'relevance' | 'popular' | 'recent';

interface McpMarketPage {
	limit: number;
	nextCursor: string | null;
	hasMore: boolean;
}

interface McpMarketDetail {
	url?: string;
	description?: string;
	iconUrl?: string | null;
	author?: string | null;
	language?: string | null;
	license?: string | null;
	stars?: number | null;
	forks?: number | null;
	lastPushedAt?: string | null;
	topics?: string[];
	latestVersion?: string | null;
	releasePublishedAt?: string | null;
	releaseUrl?: string | null;
	metadataError?: string | null;
	installReason?: string | null;
	installable?: boolean;
	stale?: boolean;
}

interface McpApi {
	call(op: 'list'): Promise<{ servers: McpServerView[]; connected: number }>;
	call(op: 'marketplace', payload: { force: boolean; query?: string; cursor?: string; limit?: number; sort?: McpMarketSort }): Promise<{ items: McpMarketItem[]; page: McpMarketPage; warning?: string | null }>;
	call(op: 'marketplace.detail', payload: { id: string }): Promise<McpMarketDetail>;
	call(op: string, payload?: Record<string, unknown>): Promise<unknown>;
}

interface ClientSlots {
	register(config: Record<string, unknown>, component: React.ComponentType<{ api: McpApi }>): unknown;
	inject(name: string, effect: () => unknown): void;
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	primary?: boolean;
	danger?: boolean;
}

interface SearchProps {
	value: string;
	placeholder: string;
	onChange(value: string): void;
}

interface SwitchProps {
	checked: boolean;
	disabled?: boolean;
	label: string;
	onChange(value: boolean): void;
}

interface RemoteIconProps {
	src?: string | null;
	className?: string;
	fallbackClass?: string;
	size?: number;
}

interface FieldProps {
	id: string;
	label: string;
	wide?: boolean;
	help?: string;
	children?: React.ReactNode;
}

interface ServerDialogProps {
	server: McpServerView | null;
	busy: boolean;
	onClose(): void;
	onSubmit(server: McpServerInput): Promise<unknown>;
}

interface DeleteDialogProps {
	server: McpServerView;
	busy: boolean;
	onClose(): void;
	onConfirm(): void;
}

interface ServerDrawerProps {
	server: McpServerView;
	busy: boolean;
	onClose(): void;
	onReconnect(): void;
	onEdit(): void;
	onDelete(): void;
}

interface MarketDrawerProps {
	item: McpMarketItem;
	detail: McpMarketDetail | null;
	loading: boolean;
	busy: boolean;
	onClose(): void;
	onInstall(): void;
}

(function () {
	window.__ModuleLoader__.load({
		id: 'dsh-mcp-manager',
		factory: function (require) {
			var React = require('react');
			var h = React.createElement;
			var P = require('@deepseek-ai/dsh-client-ui-primitives');

			var existingStyle = document.querySelector<HTMLStyleElement>('style[data-plugin="dsh-mcp-manager"]');
			var style = existingStyle || document.createElement('style');
			style.setAttribute('data-plugin', 'dsh-mcp-manager');
			style.textContent = [
				'.mm-root{--mm-accent:#1677ff;--mm-accent-hover:#0f63d7;box-sizing:border-box;height:100%;min-height:0;color:var(--dsw-alias-label-primary);font-size:13px;display:flex;flex-direction:column}',
				'.mm-tabs{flex:none;height:48px;border-bottom:1px solid var(--dsw-alias-border-l2);display:flex;align-items:flex-end;gap:30px;padding:0 18px}',
				'.mm-tab{appearance:none;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-weight:500;height:48px;padding:0 2px;display:inline-flex;align-items:center;gap:7px}',
				'.mm-tab:hover{color:var(--dsw-alias-label-primary)}',
				'.mm-tab:focus-visible{outline:2px solid var(--mm-accent);outline-offset:-3px;border-radius:5px 5px 0 0}',
				'.mm-tabOn{border-bottom-color:var(--mm-accent);color:var(--dsw-alias-label-primary);font-weight:650}',
				'.mm-count{min-width:18px;height:18px;padding:0 5px;box-sizing:border-box;border-radius:5px;background:var(--dsw-alias-fill-tsp-secondary);color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:18px;text-align:center}',
				'.mm-content{min-height:0;flex:1;display:flex;flex-direction:column;padding:16px 18px 0}',
				'.mm-search{box-sizing:border-box;flex:none;height:38px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-module-platform);display:flex;align-items:center;gap:8px;padding:0 11px;color:var(--dsw-alias-label-tertiary)}',
				'.mm-search:focus-within{border-color:var(--mm-accent);box-shadow:0 0 0 1px var(--mm-accent)}',
				'.mm-search input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit}',
				'.mm-sort{box-sizing:border-box;flex:none;height:38px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);font:inherit;padding:0 30px 0 10px;cursor:pointer}',
				'.mm-sort:focus{outline:2px solid var(--mm-accent);outline-offset:-1px;border-color:transparent}',
				'.mm-search input::placeholder{color:var(--dsw-alias-label-quaternary)}',
				'.mm-filters{flex:none;display:flex;align-items:center;gap:4px;padding:12px 0 13px}',
				'.mm-filter{appearance:none;height:32px;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;padding:0 11px}',
				'.mm-filter:hover{background:var(--dsw-alias-interactive-bg-hover)}',
				'.mm-filterOn{border-color:color-mix(in srgb,var(--mm-accent) 65%,var(--dsw-alias-border-l2));color:var(--dsw-alias-label-primary);font-weight:600}',
				'.mm-btn{appearance:none;height:36px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;font-weight:500;padding:0 12px;display:inline-flex;align-items:center;justify-content:center;gap:7px;white-space:nowrap}',
				'.mm-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
				'.mm-btn:disabled{cursor:not-allowed;color:var(--dsw-alias-label-quaternary);opacity:.7}',
				'.mm-btnPrimary{border-color:var(--mm-accent);background:var(--mm-accent);color:white}',
				'.mm-btnPrimary:hover:not(:disabled){background:var(--mm-accent-hover)}',
				'.mm-btnDanger{color:var(--dsw-alias-status-error,#d33b3b)}',
				'.mm-table{min-height:0;flex:1;overflow:auto;padding-bottom:30px}',
				'.mm-tableHead,.mm-serverRow{display:grid;grid-template-columns:minmax(240px,1fr) 128px 112px 92px 58px;column-gap:14px;align-items:center}',
				'.mm-tableHead{height:42px;border-top:1px solid var(--dsw-alias-border-l2);border-bottom:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary);font-size:12px;padding:0 14px}',
				'.mm-serverRow{min-height:84px;border-bottom:1px solid var(--dsw-alias-border-l2);padding:0 14px;position:relative}',
				'.mm-serverRowSelected{background:color-mix(in srgb,var(--dsw-static-blue-500) 7%,var(--dsw-alias-bg-module-platform))}',
				'.mm-serverOpen{appearance:none;border:0;background:transparent;color:inherit;text-align:left;font:inherit;padding:14px 0;min-width:0;cursor:pointer;display:flex;align-items:center;gap:14px}',
				'.mm-serverOpen:focus-visible{outline:2px solid var(--mm-accent);outline-offset:2px;border-radius:6px}',
				'.mm-serverGlyph{flex:none;width:34px;height:34px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary)}',
				'.mm-serverCopy{min-width:0;display:flex;flex-direction:column}',
				'.mm-serverName{display:block;font-size:14px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
				'.mm-serverDesc{margin-top:5px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
				'.mm-status{display:inline-flex;align-items:center;gap:8px;color:var(--dsw-alias-label-secondary);white-space:nowrap}',
				'.mm-dot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-label-quaternary);flex:none}',
				'.mm-statusConnected .mm-dot{background:#12b76a}',
				'.mm-statusFailed{color:var(--dsw-alias-status-error,#d33b3b)}',
				'.mm-statusFailed .mm-dot{background:var(--dsw-alias-status-error,#d33b3b)}',
				'.mm-statusConnecting .mm-dot{background:#f79009}',
				'.mm-transport{display:inline-flex;width:max-content;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:2px 7px;color:var(--dsw-alias-label-tertiary);font-size:11.5px}',
				'.mm-toolCount{color:var(--dsw-alias-label-secondary)}',
				'.mm-switch{appearance:none;position:relative;flex:none;width:44px;height:24px;border:0;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 20%,var(--dsw-alias-bg-module-platform));cursor:pointer;padding:0;transition:background-color .25s ease}',
				'.mm-switch:after{content:"";position:absolute;left:3px;top:3px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .3s cubic-bezier(.34,1.56,.64,1)}',
				'.mm-switch:active:after,.mm-switchOn:active:after{transition-duration:.12s}',
				'.mm-switch:active:after{transform:scaleX(1.12)}',
				'.mm-switchOn{background:var(--dsw-alias-state-business-primary)}',
				'.mm-switchOn:after{transform:translateX(20px)}',
				'.mm-switchOn:active:after{transform:translateX(20px) scaleX(1.12)}',
				'.mm-switch:disabled{cursor:not-allowed;opacity:.5}',
				'.mm-switch:focus-visible{outline:2px solid color-mix(in srgb,var(--dsw-alias-state-business-primary) 55%,transparent);outline-offset:2px}',
				'@media (prefers-reduced-motion:reduce){.mm-switch,.mm-switch:after{transition:none}}',
				'.mm-marketList{min-height:0;flex:1;overflow:auto;padding-top:16px;padding-bottom:30px}',
				'.mm-marketRow{appearance:none;box-sizing:border-box;width:100%;min-height:92px;border:0;border-top:1px solid var(--dsw-alias-border-l2);background:transparent;color:inherit;text-align:left;font:inherit;padding:15px 18px;display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:16px;align-items:center;cursor:pointer}',
				'.mm-marketRow:last-child{border-bottom:1px solid var(--dsw-alias-border-l2)}',
				'.mm-marketRow:hover{background:var(--dsw-alias-interactive-bg-hover)}',
				'.mm-marketRow:focus-visible{outline:1px solid var(--mm-accent);outline-offset:-1px}',
				'.mm-marketRowSelected{background:color-mix(in srgb,var(--dsw-static-blue-500) 7%,var(--dsw-alias-bg-module-platform))}',
				'.mm-marketMain{min-width:0;display:flex;align-items:center;gap:16px}',
				'.mm-marketIcon{flex:none;width:42px;height:42px;border-radius:10px;object-fit:cover;background:var(--dsw-alias-fill-tsp-secondary)}',
				'.mm-marketFallback{flex:none;width:42px;height:42px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary)}',
				'.mm-marketCopy{min-width:0;display:flex;flex-direction:column}',
				'.mm-marketTitle{display:block;font-size:14px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
				'.mm-marketDesc{display:block;margin-top:6px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.45}',
				'.mm-marketMeta{display:block;margin-top:5px;color:var(--dsw-alias-label-quaternary);font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
				'.mm-marketSide{display:flex;align-items:center;gap:14px;color:var(--dsw-alias-label-secondary)}',
				'.mm-installed{font-size:12px;color:var(--dsw-alias-label-tertiary)}',
				'.mm-marketWarning{margin:0;padding:0 2px 10px;color:var(--dsw-alias-status-warning,#9a6700);font-size:12px}',
				'.mm-loadMore{display:flex;justify-content:center;padding:18px 0 4px}',
				'.mm-empty,.mm-loading,.mm-error{margin:24px 0;padding:18px 2px;color:var(--dsw-alias-label-tertiary)}',
				'.mm-error{color:var(--dsw-alias-status-error,#d33b3b)}',
				'.mm-connectingState{flex:1;min-height:220px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;padding:52px 24px;text-align:center}',
				'.mm-connectingVisual{position:relative;width:216px;height:132px;color:var(--dsw-alias-label-secondary)}',
				'.mm-connectingCore{position:absolute;z-index:2;left:50%;top:54%;width:46px;height:46px;display:grid;place-items:center;transform:translate(-50%,-50%);color:var(--dsw-alias-label-primary);opacity:.76;animation:mm-connectingCore 2s linear infinite}',
				'.mm-connectingCore svg{width:40px;height:40px}',
				'.mm-connectingEndpoint{position:absolute;z-index:1;top:54%;width:22px;height:22px;display:grid;place-items:center;color:color-mix(in srgb,var(--dsw-alias-label-secondary) 74%,transparent);opacity:0;will-change:transform,opacity}',
				'.mm-connectingEndpoint svg{width:18px;height:18px}',
				'.mm-connectingEndpointLocal{left:16px;animation:mm-connectingLocal 2s cubic-bezier(.42,0,.18,1) infinite}',
				'.mm-connectingEndpointRemote{right:16px;color:var(--dsw-static-blue-500);animation:mm-connectingRemote 2s cubic-bezier(.42,0,.18,1) infinite}',
				'.mm-connectingLabel{position:relative;display:inline-block;font-family:"Inter Variable","Inter","Segoe UI Variable Text","Segoe UI",system-ui,sans-serif;font-size:14px;line-height:20px;font-weight:450;font-variation-settings:"wght" 470;letter-spacing:.026em;color:color-mix(in srgb,var(--dsw-alias-label-secondary) 72%,transparent);filter:blur(.2px);white-space:nowrap}',
				'.mm-connectingLabel:before{content:attr(data-text);position:absolute;inset:0;color:color-mix(in srgb,var(--dsw-alias-label-primary) 88%,var(--dsw-alias-label-secondary));filter:none;clip-path:inset(0 100% 0 0);animation:mm-connectingTextFocus 2s cubic-bezier(.4,0,.2,1) infinite}',
				'.mm-connectingCursor{position:absolute;left:0;bottom:-6px;width:10px;height:1.25px;border-radius:999px;background:var(--dsw-static-blue-500);opacity:0;animation:mm-connectingCursor 2s cubic-bezier(.4,0,.2,1) infinite}',
				'@keyframes mm-connectingLocal{0%,5%{transform:translate3d(-8px,-50%,0) scale(.8);opacity:.18}13%{opacity:.68}34%{transform:translate3d(64px,-50%,0) scale(1);opacity:.76}42%{transform:translate3d(78px,-50%,0) scale(.35);opacity:0}43%,94%{transform:translate3d(78px,-50%,0) scale(.35);opacity:0}95%{transform:translate3d(-8px,-50%,0) scale(.8);opacity:0}100%{transform:translate3d(-8px,-50%,0) scale(.8);opacity:.18}}',
				'@keyframes mm-connectingRemote{0%,9%{transform:translate3d(8px,-50%,0) scale(.8);opacity:.2}17%{opacity:.95}36%{transform:translate3d(-64px,-50%,0) scale(1);opacity:.96}44%{transform:translate3d(-78px,-50%,0) scale(.35);opacity:0}45%,94%{transform:translate3d(-78px,-50%,0) scale(.35);opacity:0}95%{transform:translate3d(8px,-50%,0) scale(.8);opacity:0}100%{transform:translate3d(8px,-50%,0) scale(.8);opacity:.2}}',
				'@keyframes mm-connectingCore{0%,27%,46%,100%{opacity:.76;transform:translate(-50%,-50%) scale(.96)}34%{opacity:1;transform:translate(-50%,-50%) scale(1.06)}40%{opacity:.9;transform:translate(-50%,-50%) scale(1)}}',
				'@keyframes mm-connectingTextFocus{0%,4%{clip-path:inset(0 100% 0 0);opacity:0}8%{opacity:1}48%,84%{clip-path:inset(0 0 0 0);opacity:1}91%,100%{clip-path:inset(0 0 0 0);opacity:0}}',
				'@keyframes mm-connectingCursor{0%,4%{left:0;opacity:0}8%{left:0;opacity:.92}48%{left:calc(100% - 10px);opacity:.92}59%,100%{left:calc(100% - 10px);opacity:0}}',
				'.mm-loadError{margin:24px 0;padding:18px 2px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}',
				'.mm-loadError .mm-error{margin:0;padding:0;flex:1;min-width:240px}',
				'@media (prefers-reduced-motion: reduce){.mm-connectingCore,.mm-connectingEndpoint,.mm-connectingLabel:before,.mm-connectingCursor{animation:none}.mm-connectingCore{opacity:1;transform:translate(-50%,-50%);color:var(--dsw-alias-label-primary)}.mm-connectingEndpoint{opacity:.78;transform:translateY(-50%)}.mm-connectingEndpointLocal{left:52px}.mm-connectingEndpointRemote{right:52px}.mm-connectingLabel{color:transparent;filter:none}.mm-connectingLabel:before{clip-path:inset(0);opacity:1}.mm-connectingCursor{left:calc(100% - 10px);opacity:.7}}',
				'.mm-drawer{position:fixed;z-index:230;box-sizing:border-box;top:65px;right:0;bottom:0;width:400px;max-width:calc(100vw - 64px);border-left:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);box-shadow:-10px 0 24px rgba(16,24,40,.06);display:flex;flex-direction:column}',
				'.mm-drawerHead{flex:none;padding:24px 24px 18px}',
				'.mm-drawerTitleRow{display:flex;align-items:flex-start;gap:13px}',
				'.mm-drawerIdentity{min-width:0;flex:1}',
				'.mm-drawerTitle{margin:0;font-size:19px;font-weight:680;line-height:1.3;overflow-wrap:anywhere}',
				'.mm-drawerLink{margin-top:7px;color:var(--mm-accent);text-decoration:none;font-size:12px;display:inline-flex;align-items:center;gap:5px;overflow-wrap:anywhere}',
				'.mm-close{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:5px;border-radius:7px;display:inline-flex}',
				'.mm-close:hover{background:var(--dsw-alias-interactive-bg-hover)}',
				'.mm-drawerDesc{margin:18px 0 0;color:var(--dsw-alias-label-secondary);line-height:1.6}',
				'.mm-drawerBody{min-height:0;flex:1;overflow:auto;padding:0 24px 24px}',
				'.mm-section{border-top:1px solid var(--dsw-alias-border-l2);padding:20px 0}',
				'.mm-sectionTitle{margin:0 0 15px;font-size:13px;font-weight:650}',
				'.mm-kv{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.55fr);gap:14px 16px;color:var(--dsw-alias-label-tertiary);font-size:12.5px}',
				'.mm-kv dt,.mm-kv dd{margin:0;min-width:0}',
				'.mm-kv dd{text-align:right;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}',
				'.mm-reconnect{width:100%;margin-top:18px}',
				'.mm-tools{display:flex;flex-direction:column}',
				'.mm-tool{display:flex;align-items:flex-start;gap:11px;padding:11px 0;border-bottom:1px solid var(--dsw-alias-border-l2)}',
				'.mm-tool:last-child{border-bottom:0}',
				'.mm-toolIcon{color:var(--dsw-alias-label-secondary);padding-top:1px}',
				'.mm-toolName{font-size:12.5px;color:var(--dsw-alias-label-primary);overflow-wrap:anywhere}',
				'.mm-toolDesc{margin-top:4px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}',
				'.mm-topics{display:flex;flex-wrap:wrap;gap:7px}',
				'.mm-topic{border:1px solid var(--dsw-alias-border-l2);border-radius:7px;padding:5px 9px;color:var(--dsw-alias-label-tertiary);font-size:12px}',
				'.mm-metaNotice{margin:0 0 14px;padding:9px 11px;border-radius:8px;background:var(--dsw-alias-fill-tsp-secondary);color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:1.5}',
				'.mm-drawerFoot{flex:none;border-top:1px solid var(--dsw-alias-border-l2);padding:16px 24px;display:grid;grid-template-columns:1fr 1.15fr;gap:10px;background:var(--dsw-alias-bg-base)}',
				'.mm-dialogBackdrop{position:fixed;z-index:270;inset:0;background:rgba(15,23,42,.24);display:flex;align-items:center;justify-content:center;padding:20px}',
				'.mm-dialog{box-sizing:border-box;width:min(620px,100%);max-height:min(820px,calc(100vh - 40px));overflow:auto;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-base);box-shadow:0 20px 60px rgba(15,23,42,.16);padding:24px}',
				'.mm-dialogSmall{width:min(430px,100%)}',
				'.mm-dialog h3{margin:0;font-size:18px;font-weight:680}',
				'.mm-dialogLead{margin:8px 0 20px;color:var(--dsw-alias-label-tertiary);line-height:1.55}',
				'.mm-formGrid{display:grid;grid-template-columns:1fr 1fr;gap:16px}',
				'.mm-field{display:flex;flex-direction:column;gap:7px;min-width:0}',
				'.mm-fieldWide{grid-column:1/-1}',
				'.mm-field label{font-size:12px;font-weight:600}',
				'.mm-field small{color:var(--dsw-alias-label-quaternary);line-height:1.45}',
				'.mm-input,.mm-select,.mm-textarea{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);font:inherit;padding:0 11px}',
				'.mm-input,.mm-select{height:40px}',
				'.mm-textarea{min-height:76px;padding-top:9px;padding-bottom:9px;resize:vertical;line-height:1.45}',
				'.mm-input:focus,.mm-select:focus,.mm-textarea:focus{outline:2px solid var(--mm-accent);outline-offset:-1px;border-color:transparent}',
				'.mm-check{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-secondary);font-size:12.5px}',
				'.mm-formError{grid-column:1/-1;color:var(--dsw-alias-status-error,#d33b3b);font-size:12px}',
				'.mm-dialogActions{display:flex;justify-content:flex-end;gap:10px;margin-top:22px}',
				'.mm-toast{position:fixed;z-index:290;left:50%;bottom:28px;transform:translateX(-50%);max-width:min(620px,calc(100vw - 32px));border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-base);box-shadow:0 8px 24px rgba(15,23,42,.13);padding:10px 14px;color:var(--dsw-alias-label-primary)}',
				'.mm-toastError{color:var(--dsw-alias-status-error,#d33b3b)}',
				'@media(min-width:981px){.mm-rootHasDrawer{padding-right:400px}}',
				'@media(max-width:980px){.mm-tableHead,.mm-serverRow{grid-template-columns:minmax(220px,1fr) 118px 84px 58px}.mm-transportCol{display:none}}',
					'@media(max-width:760px){.mm-tabs{padding-left:2px}.mm-content{padding-left:2px;padding-right:2px}.mm-tableHead,.mm-serverRow{grid-template-columns:minmax(180px,1fr) 108px 58px}.mm-toolCol{display:none}.mm-drawer{top:61px;width:calc(100vw - 12px);max-width:none}.mm-formGrid{grid-template-columns:1fr}.mm-fieldWide{grid-column:auto}}',
					/* Match Plugin Manager's page chrome while keeping MCP-specific data and actions. */
					'.mm-root{max-width:980px;margin:0 auto}',
					'.mm-head{flex:none;display:flex;align-items:baseline;gap:14px;padding:6px 8px 16px}',
					'.mm-head h2{margin:0;font-size:22px;line-height:1.25;font-weight:650;letter-spacing:-.02em}',
					'.mm-tabs{height:40px;border-bottom:1px solid var(--dsw-alias-border-l2);align-items:flex-end;gap:28px;padding:0 8px}',
					'.mm-tab{height:40px;padding:0 1px}',
					'.mm-tabOn{border-bottom-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);font-weight:600}',
					'.mm-toolbar{flex:none;display:flex;align-items:center;gap:10px;padding:16px 8px 8px}',
					'.mm-search{height:38px;border-radius:8px;background:var(--dsw-alias-bg-module-platform)}',
					'.mm-search:focus-within{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 1px var(--dsw-alias-brand-primary)}',
					'.mm-btn{height:38px;border-radius:8px;padding:0 13px}',
					'.mm-btnPrimary{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-brand-primary)}',
					'.mm-btnPrimary:hover:not(:disabled){background:var(--dsw-alias-brand-primary-hover,var(--dsw-alias-brand-primary))}',
					'.mm-filters{padding:0 8px 10px;gap:4px}',
					'.mm-filter{height:30px;border-radius:7px;padding:0 10px}',
					'.mm-list{min-height:0;flex:1;overflow:auto;padding:0 8px 32px}',
					'.mm-row{position:relative;box-sizing:border-box;width:100%;min-height:72px;border:0;border-top:1px solid var(--dsw-alias-border-l2);background:transparent;color:inherit;text-align:left;font:inherit;padding:13px 10px;display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:14px;align-items:center}',
					'.mm-row:last-child{border-bottom:1px solid var(--dsw-alias-border-l2)}',
					'.mm-rowClick{cursor:pointer}',
					'.mm-rowClick:hover{background:var(--dsw-alias-interactive-bg-hover)}',
					'.mm-rowSelected{background:color-mix(in srgb,var(--dsw-static-blue-500) 7%,var(--dsw-alias-bg-module-platform))}',
					'.mm-rowSelected:hover{background:color-mix(in srgb,var(--dsw-static-blue-500) 9%,var(--dsw-alias-bg-module-platform))}',
					'.mm-serverRow{grid-template-columns:minmax(0,1fr) auto;min-height:72px;padding:13px 10px}',
					'.mm-serverOpen{appearance:none;width:100%;border:0;background:transparent;color:inherit;text-align:left;font:inherit;padding:0;min-width:0;cursor:pointer;display:flex;align-items:flex-start;gap:11px}',
					'.mm-serverOpen:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;border-radius:6px}',
					'.mm-serverGlyph{flex:none;width:28px;height:28px;border-radius:8px;margin-top:1px}',
					'.mm-rowCopy{min-width:0;display:flex;flex-direction:column}',
					'.mm-rowTitle{font-size:13.5px;font-weight:600;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
					'.mm-rowDesc{margin-top:4px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.45}',
					'.mm-rowMeta{margin-top:5px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:var(--dsw-alias-label-quaternary);font-size:11.5px}',
					'.mm-rowSide{display:flex;align-items:center;gap:12px;color:var(--dsw-alias-label-secondary)}',
					'.mm-status{font-size:11.5px;gap:6px}',
					'.mm-dot{width:6px;height:6px}',
					'.mm-transport{border:0;border-radius:0;padding:0;color:var(--dsw-alias-label-quaternary);font-size:11.5px}',
					'.mm-toolCount{color:var(--dsw-alias-label-quaternary);font-size:11.5px}',
					'.mm-marketRow{min-height:72px;border-top:1px solid var(--dsw-alias-border-l2);padding:13px 10px;display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:14px;align-items:center}',
					'.mm-marketRow:last-child{border-bottom:1px solid var(--dsw-alias-border-l2)}',
					'.mm-marketMain{min-width:0;display:flex;align-items:flex-start;gap:11px}',
					'.mm-marketIcon,.mm-marketFallback{flex:none;width:28px;height:28px;border-radius:8px}',
					'.mm-marketFallback{margin-top:1px}',
					'.mm-marketCopy{min-width:0;display:flex;flex-direction:column}',
					'.mm-marketTitle{font-size:13.5px;font-weight:600}',
					'.mm-marketDesc{margin-top:4px;line-height:1.45}',
					'.mm-marketSide{gap:12px}',
					'.mm-empty,.mm-loading,.mm-error{margin:24px 8px;padding:20px 0}',
					'.mm-loadError{margin:24px 8px;padding:20px 0}',
					'.mm-rootHasDrawer{padding-right:0}',
					'.mm-drawer{top:66px}',
					'.mm-drawerHead{padding:24px 24px 16px;border-bottom:1px solid var(--dsw-alias-border-l2)}',
					'.mm-drawerTitle{font-size:19px;font-weight:650}',
					'.mm-section{padding:18px 0}',
					'.mm-sectionTitle{margin-bottom:13px;font-weight:600}',
					'.mm-topic{border:0;border-radius:999px;background:var(--dsw-alias-fill-tsp-secondary);padding:3px 8px}',
					'.mm-dialog{border-radius:16px}',
					'@media(max-width:680px){.mm-root{margin:0}.mm-head{padding-left:0}.mm-tabs,.mm-toolbar,.mm-filters,.mm-list{padding-left:0;padding-right:0}.mm-toolbar{flex-wrap:wrap}.mm-search{flex-basis:100%}.mm-drawer{top:61px;width:calc(100vw - 12px);max-width:none}.mm-row{padding-left:6px;padding-right:6px}.mm-rowMeta{gap:6px}.mm-formGrid{grid-template-columns:1fr}.mm-fieldWide{grid-column:auto}}'
				].join('');
			if (!existingStyle) document.head.appendChild(style);

			function apiCall<T>(op: string, payload?: Record<string, unknown>): Promise<T> {
				return fetch('/api/mcp-manager', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(Object.assign({ op: op }, payload || {}))
				}).then(function (response) {
					return response.json().then(function (raw: unknown) {
						var data = raw as { ok?: boolean; value?: unknown; error?: { message?: string } };
						if (!response.ok || data.ok !== true) throw new Error(data.error?.message || ('HTTP ' + response.status));
						return data.value as T;
					});
				});
			}

			function Button(props: ButtonProps): React.ReactNode {
				var next: ButtonProps = Object.assign({}, props);
				var primary = next.primary;
				var danger = next.danger;
				delete next.primary; delete next.danger;
				next.className = 'mm-btn' + (primary ? ' mm-btnPrimary' : '') + (danger ? ' mm-btnDanger' : '') + (next.className ? ' ' + next.className : '');
				return h('button', next, props.children);
			}

			function Search(props: SearchProps): React.ReactNode {
				return h('label', { className: 'mm-search' }, h(P.IconSearchOutline16), h('input', {
					value: props.value,
					placeholder: props.placeholder,
					'aria-label': props.placeholder,
					onChange: function (event: React.ChangeEvent<HTMLInputElement>) { props.onChange(event.target.value); }
				}));
			}

			function Switch(props: SwitchProps): React.ReactNode {
				return h('button', {
					type: 'button', role: 'switch',
					className: 'mm-switch' + (props.checked ? ' mm-switchOn' : ''),
					'aria-checked': props.checked,
					'aria-label': props.label,
					disabled: props.disabled,
					onClick: function () { props.onChange(!props.checked); }
				});
			}

			function RemoteIcon(props: RemoteIconProps): React.ReactNode {
				var [failed, setFailed] = React.useState(false);
				if (!props.src || failed) return h('span', { className: props.fallbackClass || 'mm-marketFallback', 'aria-hidden': true }, h(P.IconLinkOutline16, { size: props.size || 18 }));
				return h('img', {
					className: props.className || 'mm-marketIcon', src: props.src, alt: '',
					loading: 'lazy', referrerPolicy: 'no-referrer',
					onError: function () { setFailed(true); }
				});
			}

			function statusInfo(status: string): { label: string; className: string } {
				if (status === 'connected') return { label: '已连接', className: ' mm-statusConnected' };
				if (status === 'connected-empty') return { label: '已加载 · 无工具', className: ' mm-statusConnecting' };
				if (status === 'connecting') return { label: '连接中', className: ' mm-statusConnecting' };
				if (status === 'failed') return { label: '加载失败', className: ' mm-statusFailed' };
				if (status === 'needs-environment') return { label: '缺少环境变量', className: ' mm-statusFailed' };
				if (status === 'disconnecting') return { label: '断开中', className: ' mm-statusConnecting' };
				if (status === 'disabled') return { label: '已停用', className: '' };
				return { label: '未加载', className: '' };
			}

			function Status(props: { status: string }): React.ReactNode {
				var info = statusInfo(props.status);
				return h('span', { className: 'mm-status' + info.className }, h('span', { className: 'mm-dot', 'aria-hidden': true }), info.label);
			}

			function formatDate(value: string | null | undefined): string | null {
				if (!value) return null;
				var date = new Date(value);
				if (Number.isNaN(date.getTime())) return null;
				return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
			}

			function formatNumber(value: number | null | undefined): string | null {
				return typeof value === 'number' ? value.toLocaleString('en-US') : null;
			}

			function pairsToText(value: Readonly<Record<string, string>> | undefined): string {
				return Object.entries(value || {}).map(function (entry) { return entry[0] + '=' + entry[1]; }).join('\n');
			}

			function textToPairs(value: string, label: string): Record<string, string> {
				var result: Record<string, string> = {};
				String(value || '').split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean).forEach(function (line) {
					var at = line.indexOf('=');
					if (at <= 0 || at === line.length - 1) throw new Error(label + ' 每行必须是 TARGET=SOURCE_ENV');
					result[line.slice(0, at).trim()] = line.slice(at + 1).trim();
				});
				return result;
			}

			function draftOf(server: McpServerView | null): McpDraft {
				var source = server || {} as Partial<McpServerView>;
				return {
					serverName: source.serverName || '', description: source.description || '',
					transport: source.transport || 'streamable-http', enabled: source.enabled !== false,
					url: source.url || '', headersText: pairsToText(source.headers),
					command: source.command || '', argsText: (source.args || []).join('\n'),
					cwd: source.cwd || '', envText: pairsToText(source.env),
					toolCallTimeoutMs: source.toolCallTimeoutMs || 60000,
					requiredEnv: source.requiredEnv || []
				};
			}

			function Field(props: FieldProps): React.ReactNode {
				return h('div', { className: 'mm-field' + (props.wide ? ' mm-fieldWide' : '') }, h('label', { htmlFor: props.id }, props.label), props.children, props.help ? h('small', null, props.help) : null);
			}

			function ServerDialog(props: ServerDialogProps): React.ReactNode {
				var [draft, setDraft] = React.useState(function () { return draftOf(props.server); });
				var [error, setError] = React.useState('');
				function set<K extends keyof McpDraft>(name: K, value: McpDraft[K]): void { setDraft(function (current) { return { ...current, [name]: value }; }); }
				function submit(event: React.FormEvent<HTMLFormElement>): void {
					event.preventDefault(); setError('');
					try {
						var server: McpServerInput = {
							serverName: draft.serverName, description: draft.description, transport: draft.transport,
							enabled: draft.enabled, toolCallTimeoutMs: Number(draft.toolCallTimeoutMs), requiredEnv: draft.requiredEnv
						};
						if (draft.transport === 'stdio') {
							server.command = draft.command;
							server.args = draft.argsText.split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
							server.cwd = draft.cwd;
							server.env = textToPairs(draft.envText, '环境变量映射');
						} else {
							server.url = draft.url;
							server.headers = textToPairs(draft.headersText, '请求头映射');
						}
						props.onSubmit(server).catch(function (reason) { setError(reason instanceof Error ? reason.message : String(reason)); });
					} catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
				}
				return h('div', { className: 'mm-dialogBackdrop', role: 'presentation', onMouseDown: function (event: React.MouseEvent<HTMLDivElement>) { if (event.target === event.currentTarget && !props.busy) props.onClose(); } },
					h('form', { className: 'mm-dialog', role: 'dialog', 'aria-modal': true, 'aria-label': props.server ? '编辑 MCP 服务器' : '新增 MCP 服务器', onSubmit: submit },
						h('h3', null, props.server ? '编辑服务器' : '新增服务器'),
						h('p', { className: 'mm-dialogLead' }, '配置保存后由 Cordis 热加载。密钥仅通过 Host 环境变量引用。'),
						h('div', { className: 'mm-formGrid' },
							h(Field, { id: 'mm-name', label: '服务器名称' }, h('input', { id: 'mm-name', className: 'mm-input', value: draft.serverName, maxLength: 32, required: true, disabled: Boolean(props.server), onChange: function (event: React.ChangeEvent<HTMLInputElement>) { set('serverName', event.target.value); } })),
							h(Field, { id: 'mm-transport', label: '传输方式' }, h('select', { id: 'mm-transport', className: 'mm-select', value: draft.transport, onChange: function (event: React.ChangeEvent<HTMLSelectElement>) { var value = event.target.value; if (value === 'stdio' || value === 'streamable-http') set('transport', value); } }, h('option', { value: 'streamable-http' }, 'Streamable HTTP'), h('option', { value: 'stdio' }, 'stdio'))),
							h(Field, { id: 'mm-description', label: '描述', wide: true }, h('input', { id: 'mm-description', className: 'mm-input', value: draft.description, maxLength: 240, onChange: function (event: React.ChangeEvent<HTMLInputElement>) { set('description', event.target.value); } })),
							draft.transport === 'stdio' ? h(React.Fragment, null,
								h(Field, { id: 'mm-command', label: '启动命令' }, h('input', { id: 'mm-command', className: 'mm-input', value: draft.command, required: true, onChange: function (event: React.ChangeEvent<HTMLInputElement>) { set('command', event.target.value); } })),
								h(Field, { id: 'mm-cwd', label: '工作目录' }, h('input', { id: 'mm-cwd', className: 'mm-input', value: draft.cwd, placeholder: '可选绝对路径', onChange: function (event: React.ChangeEvent<HTMLInputElement>) { set('cwd', event.target.value); } })),
								h(Field, { id: 'mm-args', label: '启动参数', wide: true, help: '每行一个参数，Host 直接传递参数数组，不经过 shell 拼接。' }, h('textarea', { id: 'mm-args', className: 'mm-textarea', value: draft.argsText, onChange: function (event: React.ChangeEvent<HTMLTextAreaElement>) { set('argsText', event.target.value); } })),
								h(Field, { id: 'mm-env', label: '环境变量引用', wide: true, help: '每行 TARGET=SOURCE_ENV；这里只保存环境变量名，不保存值。' }, h('textarea', { id: 'mm-env', className: 'mm-textarea', value: draft.envText, placeholder: 'API_KEY=MY_MCP_API_KEY', onChange: function (event: React.ChangeEvent<HTMLTextAreaElement>) { set('envText', event.target.value); } }))
							) : h(React.Fragment, null,
								h(Field, { id: 'mm-url', label: 'MCP 端点', wide: true, help: '公网地址必须使用 HTTPS，本机地址可以使用 HTTP。' }, h('input', { id: 'mm-url', className: 'mm-input', type: 'url', value: draft.url, required: true, placeholder: 'https://example.com/mcp', onChange: function (event: React.ChangeEvent<HTMLInputElement>) { set('url', event.target.value); } })),
								h(Field, { id: 'mm-headers', label: '请求头环境变量引用', wide: true, help: '每行 HEADER=SOURCE_ENV；例如 Authorization=GITHUB_MCP_AUTHORIZATION。' }, h('textarea', { id: 'mm-headers', className: 'mm-textarea', value: draft.headersText, onChange: function (event: React.ChangeEvent<HTMLTextAreaElement>) { set('headersText', event.target.value); } }))
							),
							h(Field, { id: 'mm-timeout', label: '工具超时（毫秒）' }, h('input', { id: 'mm-timeout', className: 'mm-input', type: 'number', min: 1000, max: 600000, step: 1000, value: draft.toolCallTimeoutMs, onChange: function (event: React.ChangeEvent<HTMLInputElement>) { set('toolCallTimeoutMs', event.target.value); } })),
							h('label', { className: 'mm-check' }, h('input', { type: 'checkbox', checked: draft.enabled, onChange: function (event: React.ChangeEvent<HTMLInputElement>) { set('enabled', event.target.checked); } }), '保存后启用'),
							error ? h('div', { className: 'mm-formError', role: 'alert' }, error) : null
						),
						h('div', { className: 'mm-dialogActions' }, h(Button, { type: 'button', disabled: props.busy, onClick: props.onClose }, '取消'), h(Button, { type: 'submit', primary: true, disabled: props.busy }, props.busy ? '保存中…' : '保存'))
					)
				);
			}

			function DeleteDialog(props: DeleteDialogProps): React.ReactNode {
				return h('div', { className: 'mm-dialogBackdrop', role: 'presentation', onMouseDown: function (event: React.MouseEvent<HTMLDivElement>) { if (event.target === event.currentTarget && !props.busy) props.onClose(); } },
					h('div', { className: 'mm-dialog mm-dialogSmall', role: 'dialog', 'aria-modal': true, 'aria-label': '删除 MCP 服务器' },
						h('h3', null, '删除 ' + props.server.serverName + '？'),
						h('p', { className: 'mm-dialogLead' }, '删除后该服务器贡献的工具会随 Cordis 热加载移除。此操作不会卸载第三方包。'),
						h('div', { className: 'mm-dialogActions' }, h(Button, { type: 'button', disabled: props.busy, onClick: props.onClose }, '取消'), h(Button, { type: 'button', danger: true, disabled: props.busy, onClick: props.onConfirm }, props.busy ? '删除中…' : '确认删除'))
					)
				);
			}

			function ServerGlyph(props: { transport: McpServerView['transport'] }): React.ReactNode {
				return h('span', { className: 'mm-serverGlyph', 'aria-hidden': true }, props.transport === 'stdio' ? h(P.IconCodeOutline16) : h(P.IconLinkOutline16));
			}

			function ServerDrawer(props: ServerDrawerProps): React.ReactNode {
				var server = props.server;
				var missing = server.missingEnvironment || [];
				return h('aside', { className: 'mm-drawer', role: 'dialog', 'aria-modal': false, 'aria-label': server.serverName + ' 详情' },
					h('header', { className: 'mm-drawerHead' },
						h('div', { className: 'mm-drawerTitleRow' }, h(ServerGlyph, { transport: server.transport }), h('div', { className: 'mm-drawerIdentity' }, h('h3', { className: 'mm-drawerTitle' }, server.serverName), h('div', { style: { marginTop: '8px' } }, h(Status, { status: server.status }))), h('button', { type: 'button', className: 'mm-close', 'aria-label': '关闭详情', onClick: props.onClose }, h(P.IconCloseOutline16))),
						server.description ? h('p', { className: 'mm-drawerDesc' }, server.description) : null
					),
					h('div', { className: 'mm-drawerBody' },
						missing.length ? h('p', { className: 'mm-metaNotice' }, '启用前需要在 Host 环境中提供：' + missing.join('、')) : null,
						h('section', { className: 'mm-section' }, h('h4', { className: 'mm-sectionTitle' }, '概览'), h('dl', { className: 'mm-kv' },
							h('dt', null, '传输方式'), h('dd', null, server.transport === 'streamable-http' ? 'HTTP' : 'stdio'),
							h('dt', null, '端点'), h('dd', null, server.endpoint),
							h('dt', null, '状态来源'), h('dd', null, server.fiberPhase || 'Loader 未挂载'),
							h('dt', null, '工具超时'), h('dd', null, Math.round(server.toolCallTimeoutMs / 1000) + ' 秒'),
							h('dt', null, '最近配置'), h('dd', null, formatDate(server.updatedAt) || '—')
						), h(Button, { type: 'button', className: 'mm-reconnect', disabled: props.busy || !server.enabled, onClick: props.onReconnect }, h(P.IconRefreshOutline16), props.busy ? '重新连接中…' : '重新连接')),
						h('section', { className: 'mm-section' }, h('h4', { className: 'mm-sectionTitle' }, '工具 (' + server.toolCount + ')'), server.tools.length ? h('div', { className: 'mm-tools' }, server.tools.map(function (tool) { return h('div', { key: tool.publicName, className: 'mm-tool' }, h('span', { className: 'mm-toolIcon' }, h(P.IconApiOutline14)), h('div', null, h('div', { className: 'mm-toolName' }, tool.name), tool.description ? h('div', { className: 'mm-toolDesc' }, tool.description) : null)); })) : h('p', { className: 'mm-empty' }, '当前没有可投影的 MCP 工具。'))
					),
					h('footer', { className: 'mm-drawerFoot' }, h(Button, { type: 'button', onClick: props.onEdit }, h(P.IconEditOutline16), '编辑配置'), h(Button, { type: 'button', danger: true, onClick: props.onDelete }, h(P.IconTrashOutline16), '删除服务器'))
				);
			}

			function MarketDrawer(props: MarketDrawerProps): React.ReactNode {
				var item = props.item;
				var detail = props.detail;
				var sourceUrl = (detail && detail.url) || item.repositoryUrl;
				var sourceLabel = item.source === 'mcp-registry' ? 'MCP Registry' : 'GitHub';
				var rows = (detail ? [
					['作者', detail.author], ['语言', detail.language], ['许可证', detail.license],
					['仓库', (detail.stars === null || detail.stars === undefined) && (detail.forks === null || detail.forks === undefined) ? null : (formatNumber(detail.stars) || '0') + ' Stars · ' + (formatNumber(detail.forks) || '0') + ' Forks'],
					['最后推送', formatDate(detail.lastPushedAt)]
				] as Array<[string, string | null | undefined]> : []).filter(function (row): row is [string, string] { return typeof row[1] === 'string' && row[1] !== ''; });
				return h('aside', { className: 'mm-drawer', role: 'dialog', 'aria-modal': false, 'aria-label': item.name + ' 详情' },
					h('header', { className: 'mm-drawerHead' },
						h('div', { className: 'mm-drawerTitleRow' }, h(RemoteIcon, { src: (detail && detail.iconUrl) || item.iconUrl }), h('div', { className: 'mm-drawerIdentity' }, h('h3', { className: 'mm-drawerTitle' }, item.name), h('a', { className: 'mm-drawerLink', href: sourceUrl, target: '_blank', rel: 'noreferrer' }, item.repository || item.registryName || sourceLabel, h(P.IconRightUpOutline14))), h('button', { type: 'button', className: 'mm-close', 'aria-label': '关闭详情', onClick: props.onClose }, h(P.IconCloseOutline16))),
						h('p', { className: 'mm-drawerDesc' }, (detail && detail.description) || item.description)
					),
					h('div', { className: 'mm-drawerBody' },
						props.loading ? h('p', { className: 'mm-loading', role: 'status' }, '正在读取 GitHub 与 MCP Registry…') : null,
						detail && detail.metadataError ? h('p', { className: 'mm-metaNotice' }, detail.stale ? '远程元数据暂不可用，正在显示缓存。' : '部分远程元数据暂不可用。') : null,
						h('section', { className: 'mm-section' }, h('h4', { className: 'mm-sectionTitle' }, '发现与安装'), h('p', { className: 'mm-metaNotice' }, '实时搜索官方 MCP Registry；仅当配置可以唯一、安全推导时允许安装，安装后默认停用。')),
						rows.length ? h('section', { className: 'mm-section' }, h('h4', { className: 'mm-sectionTitle' }, '仓库信息'), h('dl', { className: 'mm-kv' }, rows.flatMap(function (row, index) { return [h('dt', { key: 'dt' + index }, row[0]), h('dd', { key: 'dd' + index }, row[1])]; }))) : null,
						detail && detail.topics && detail.topics.length ? h('section', { className: 'mm-section' }, h('h4', { className: 'mm-sectionTitle' }, 'Topics'), h('div', { className: 'mm-topics' }, detail.topics.map(function (topic) { return h('span', { key: topic, className: 'mm-topic' }, topic); }))) : null,
						detail && detail.latestVersion ? h('section', { className: 'mm-section' }, h('h4', { className: 'mm-sectionTitle' }, '最新发布'), h('dl', { className: 'mm-kv' }, h('dt', null, '版本'), h('dd', null, detail.latestVersion), detail.releasePublishedAt ? h(React.Fragment, null, h('dt', null, '发布时间'), h('dd', null, formatDate(detail.releasePublishedAt))) : null), detail.releaseUrl ? h('a', { className: 'mm-drawerLink', href: detail.releaseUrl, target: '_blank', rel: 'noreferrer' }, '查看 Release', h(P.IconRightUpOutline14)) : null) : null,
						!item.installable ? h('p', { className: 'mm-metaNotice' }, (detail && detail.installReason) || item.installReason || '当前条目无法安全推导安装配置。') : h('p', { className: 'mm-metaNotice' }, '安装会写入停用配置，不会立即执行第三方 Server；检查环境变量后再启用。')
					),
					h('footer', { className: 'mm-drawerFoot' }, h(Button, { type: 'button', onClick: function () { window.open(sourceUrl, '_blank', 'noopener,noreferrer'); } }, '查看' + sourceLabel, h(P.IconRightUpOutline14)), h(Button, { type: 'button', primary: true, disabled: props.busy || !item.installable || item.status === 'installed', onClick: props.onInstall }, props.busy ? '安装中…' : item.status === 'installed' ? '已安装' : item.installable ? '安装为停用配置' : '仅查看'))
				);
			}

			function McpConnectingState(): React.ReactNode {
				return h('div', { className: 'mm-connectingState', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
					h('div', { className: 'mm-connectingVisual', 'aria-hidden': true },
						h('span', { className: 'mm-connectingEndpoint mm-connectingEndpointLocal' }, h(P.IconCodeOutline16)),
						h('span', { className: 'mm-connectingEndpoint mm-connectingEndpointRemote' }, h(P.IconApiOutline14)),
						h('span', { className: 'mm-connectingCore' }, h(P.IconLinkOutline16))
					),
					h('span', { className: 'mm-connectingLabel', 'data-text': 'MCP Connecting' }, 'MCP Connecting', h('span', { className: 'mm-connectingCursor', 'aria-hidden': true }))
				);
			}

			function McpManagerSection(props: { api: McpApi }): React.ReactNode {
				var api = props.api;
				var [tab, setTab] = React.useState('servers');
				var [servers, setServers] = React.useState<McpServerView[]>([]);
				var [connected, setConnected] = React.useState(0);
				var [loading, setLoading] = React.useState(true);
				var [refreshing, setRefreshing] = React.useState(false);
				var [error, setError] = React.useState('');
				var [attempt, setAttempt] = React.useState(0);
				var [query, setQuery] = React.useState('');
				var [marketSort, setMarketSort] = React.useState<McpMarketSort>('relevance');
				var [filter, setFilter] = React.useState('all');
				var [selectedServer, setSelectedServer] = React.useState<McpServerView | null>(null);
				var [editor, setEditor] = React.useState<McpServerView | 'new' | null>(null);
				var [deleting, setDeleting] = React.useState<McpServerView | null>(null);
				var [market, setMarket] = React.useState<McpMarketItem[]>([]);
				var [marketLoaded, setMarketLoaded] = React.useState(false);
				var [marketLoading, setMarketLoading] = React.useState(false);
				var [marketNextCursor, setMarketNextCursor] = React.useState<string | null>(null);
				var [marketWarning, setMarketWarning] = React.useState('');
				var [selectedMarket, setSelectedMarket] = React.useState<McpMarketItem | null>(null);
				var [marketDetail, setMarketDetail] = React.useState<McpMarketDetail | null>(null);
				var [detailLoading, setDetailLoading] = React.useState(false);
				var [busy, setBusy] = React.useState('');
				var [toast, setToast] = React.useState<{ message: string; error: boolean } | null>(null);
				var marketRequest = React.useRef(0);

				function notify(message: string, isError: boolean): void {
					setToast({ message: message, error: isError });
				}
				function loadServers(): Promise<void> {
					return api.call('list').then(function (value) {
						setServers(value.servers || []); setConnected(value.connected || 0);
						setSelectedServer(function (current) { return current ? (value.servers || []).find(function (server) { return server.id === current.id; }) || null : null; });
					});
				}
				function refreshServers(): Promise<void> {
					setRefreshing(true);
					return loadServers().catch(function (reason) { notify(reason instanceof Error ? reason.message : String(reason), true); }).finally(function () { setRefreshing(false); });
				}
				function loadMarket(force: boolean, search = query, cursor = '', append = false, sort = marketSort): Promise<void> {
					var request = ++marketRequest.current;
					setMarketLoading(true);
					return api.call('marketplace', { force: force === true, query: search.trim(), cursor: cursor, limit: 24, sort: sort }).then(function (value) {
						if (request !== marketRequest.current) return;
						var incoming = value.items || [];
						setMarket(function (current) {
							if (!append) return incoming;
							var seen = new Set(current.map(function (item) { return item.id; }));
							return current.concat(incoming.filter(function (item) { return !seen.has(item.id); }));
						});
						setMarketLoaded(true);
						setMarketNextCursor(value.page && value.page.nextCursor ? value.page.nextCursor : null);
						setMarketWarning(value.warning || '');
						if (!append) setSelectedMarket(function (current) { return current ? incoming.find(function (item) { return item.id === current.id; }) || null : null; });
					}, function (reason) { if (request === marketRequest.current) notify(reason instanceof Error ? reason.message : String(reason), true); }).finally(function () { if (request === marketRequest.current) setMarketLoading(false); });
				}
				React.useEffect(function () {
					var alive = true;
					var settleTimer: number | null = null;
					var startedAt = Date.now();
					setLoading(true); setError('');
					loadServers().catch(function (reason) {
						if (alive) setError(reason instanceof Error ? reason.message : String(reason));
					}).finally(function () {
						if (!alive) return;
						var remaining = Math.max(0, 680 - (Date.now() - startedAt));
						settleTimer = window.setTimeout(function () { if (alive) setLoading(false); }, remaining);
					});
					return function () { alive = false; if (settleTimer !== null) window.clearTimeout(settleTimer); };
				}, [attempt]);
				React.useEffect(function () {
					if (tab !== 'market') return;
					var timer = window.setTimeout(function () { loadMarket(false, query, '', false); }, query.trim() === '' ? 0 : 320);
					return function () { window.clearTimeout(timer); };
				}, [tab, query, marketSort]);
				React.useEffect(function () {
					function onKey(event: KeyboardEvent): void {
						if (event.key !== 'Escape') return;
						if (editor) setEditor(null);
						else if (deleting) setDeleting(null);
						else if (selectedServer) setSelectedServer(null);
						else if (selectedMarket) setSelectedMarket(null);
					}
					document.addEventListener('keydown', onKey);
					return function () { document.removeEventListener('keydown', onKey); };
				}, [editor, deleting, selectedServer, selectedMarket]);

				function saveServer(server: McpServerInput): Promise<unknown> {
					var editing = typeof editor === 'object' && editor !== null ? editor.id : undefined;
					setBusy('save');
					return api.call(editing ? 'update' : 'create', editing ? { id: editing, server: server } : { server: server }).then(function () {
						setEditor(null); notify(editing ? '服务器配置已保存并触发热加载' : '服务器已添加并触发热加载', false); return loadServers();
					}).finally(function () { setBusy(''); });
				}
				function toggle(server: McpServerView, enabled: boolean): void {
					setBusy(server.id);
					api.call('setEnabled', { id: server.id, enabled: enabled }).then(function () { notify(enabled ? '服务器已启用' : '服务器已停用', false); return loadServers(); }).catch(function (reason) { notify(reason instanceof Error ? reason.message : String(reason), true); }).finally(function () { setBusy(''); });
				}
				function reconnect(server: McpServerView): void {
					setBusy(server.id);
					api.call('reconnect', { id: server.id }).then(function () { notify('已触发 Cordis 重新连接', false); return loadServers(); }).catch(function (reason) { notify(reason instanceof Error ? reason.message : String(reason), true); }).finally(function () { setBusy(''); });
				}
				function remove(server: McpServerView): void {
					setBusy('delete');
					api.call('delete', { id: server.id }).then(function () { setDeleting(null); setSelectedServer(null); notify('服务器已删除', false); return Promise.all([loadServers(), marketLoaded ? loadMarket(false, query) : Promise.resolve()]); }).catch(function (reason) { notify(reason instanceof Error ? reason.message : String(reason), true); }).finally(function () { setBusy(''); });
				}
				function openMarket(item: McpMarketItem): void {
					setSelectedServer(null); setSelectedMarket(item); setMarketDetail(null); setDetailLoading(true);
					api.call('marketplace.detail', { id: item.id }).then(function (value) { setMarketDetail(value); }, function (reason) { setMarketDetail({ metadataError: reason instanceof Error ? reason.message : String(reason) }); }).finally(function () { setDetailLoading(false); });
				}
				function installMarket(item: McpMarketItem): void {
					setBusy(item.id);
					api.call('marketplace.install', { id: item.id }).then(function () {
						notify('已安装为停用配置；请在服务器页检查环境变量后启用', false);
						return Promise.all([loadServers(), loadMarket(false, query)]);
					}).catch(function (reason) { notify(reason instanceof Error ? reason.message : String(reason), true); }).finally(function () { setBusy(''); });
				}

				var needle = query.trim().toLowerCase();
				var visibleServers = servers.filter(function (server) {
					var matchText = needle === '' || server.serverName.toLowerCase().includes(needle) || String(server.description || '').toLowerCase().includes(needle) || String(server.endpoint || '').toLowerCase().includes(needle) || server.tools.some(function (tool) { return tool.name.toLowerCase().includes(needle); });
					if (!matchText || filter === 'all') return matchText;
					if (filter === 'connected') return server.status === 'connected' || server.status === 'connected-empty';
					if (filter === 'failed') return server.status === 'failed' || server.status === 'needs-environment';
					return filter === 'disabled' ? server.status === 'disabled' : true;
				});
				var visibleMarket = market;
				var filters: Array<[string, string]> = [['all', '全部 ' + servers.length], ['connected', '已连接 ' + connected], ['failed', '连接问题 ' + servers.filter(function (server) { return server.status === 'failed' || server.status === 'needs-environment'; }).length], ['disabled', '已停用 ' + servers.filter(function (server) { return server.status === 'disabled'; }).length]];

				var serverBody;
				if (loading) serverBody = h(McpConnectingState);
					else if (error) serverBody = h('div', { className: 'mm-loadError' }, h('p', { className: 'mm-error', role: 'alert' }, '加载 MCP Manager 失败：' + error), h(Button, { type: 'button', onClick: function () { setAttempt(function (value) { return value + 1; }); } }, h(P.IconRefreshOutline16), '重试'));
					else serverBody = h('div', { className: 'mm-list', 'data-testid': 'server-list' },
						visibleServers.length ? visibleServers.map(function (server) {
							return h('div', { key: server.id, className: 'mm-row mm-rowClick mm-serverRow' + (selectedServer && selectedServer.id === server.id ? ' mm-rowSelected mm-serverRowSelected' : '') },
								h('button', { type: 'button', className: 'mm-serverOpen', onClick: function () { setSelectedMarket(null); setSelectedServer(server); } },
									h(ServerGlyph, { transport: server.transport }),
									h('span', { className: 'mm-rowCopy' },
										h('span', { className: 'mm-rowTitle' }, server.serverName),
										h('span', { className: 'mm-rowDesc' }, server.description || server.endpoint),
										h('span', { className: 'mm-rowMeta' },
											h(Status, { status: server.status }),
											h('span', { className: 'mm-transport' }, server.transport === 'streamable-http' ? 'HTTP' : 'stdio'),
											h('span', { className: 'mm-toolCount' }, server.toolCount + ' 个工具')
									)
								)
								),
								h('div', { className: 'mm-rowSide' }, h(Switch, { checked: server.enabled, disabled: busy === server.id, label: (server.enabled ? '停用 ' : '启用 ') + server.serverName, onChange: function (enabled) { toggle(server, enabled); } }))
							);
						}) : h('p', { className: 'mm-empty' }, '没有匹配的 MCP 服务器。')
					);

					var marketBody = h(React.Fragment, null, marketWarning ? h('p', { className: 'mm-marketWarning', role: 'status' }, '官方 Registry 暂时不可用：' + marketWarning) : null, h('div', { className: 'mm-list', 'data-testid': 'market-list' }, marketLoading && !marketLoaded ? h('p', { className: 'mm-loading', role: 'status' }, '正在读取 MCP 官方 Registry…') : visibleMarket.length ? visibleMarket.map(function (item) {
						return h('button', { key: item.id, type: 'button', className: 'mm-row mm-rowClick mm-marketRow' + (selectedMarket && selectedMarket.id === item.id ? ' mm-rowSelected mm-marketRowSelected' : ''), onClick: function () { openMarket(item); } },
							h('span', { className: 'mm-marketMain' }, h(RemoteIcon, { src: item.iconUrl }), h('span', { className: 'mm-marketCopy' }, h('span', { className: 'mm-marketTitle' }, item.name), h('span', { className: 'mm-marketDesc' }, item.description), h('span', { className: 'mm-marketMeta' }, item.source === 'mcp-registry' ? 'MCP Registry' + (item.version ? ' · ' + item.version : '') : item.repository || '精选'))),
							h('span', { className: 'mm-rowSide mm-marketSide' }, item.status === 'installed' ? h('span', { className: 'mm-installed' }, '已安装') : !item.installable ? h('span', { className: 'mm-installed' }, '仅查看') : null, h(P.IconChevronRightOutline14))
						);
					}) : h('p', { className: 'mm-empty' }, '官方 Registry 中没有匹配的 MCP Server。')), marketNextCursor ? h('div', { className: 'mm-loadMore' }, h(Button, { type: 'button', disabled: marketLoading, onClick: function () { if (marketNextCursor) loadMarket(false, query, marketNextCursor, true); } }, marketLoading ? '加载中…' : '加载更多')) : null);

					return h('section', { className: 'mm-root' + (selectedServer || selectedMarket ? ' mm-rootHasDrawer' : ''), 'aria-label': 'MCP Manager' },
						h('header', { className: 'mm-head' }, h('h2', null, 'MCP')),
						h('div', { className: 'mm-tabs', role: 'tablist' },
							h('button', { type: 'button', role: 'tab', className: 'mm-tab' + (tab === 'servers' ? ' mm-tabOn' : ''), 'aria-selected': tab === 'servers', onClick: function () { setTab('servers'); setQuery(''); setSelectedMarket(null); } }, '服务器'),
							h('button', { type: 'button', role: 'tab', className: 'mm-tab' + (tab === 'market' ? ' mm-tabOn' : ''), 'aria-selected': tab === 'market', onClick: function () { setTab('market'); setQuery(''); setSelectedServer(null); } }, '市场')
						),
						tab === 'servers' ? h(React.Fragment, null,
							h('div', { className: 'mm-toolbar' },
								h(Search, { value: query, onChange: setQuery, placeholder: '搜索服务器或工具' }),
								h(Button, { type: 'button', disabled: loading || refreshing, onClick: refreshServers }, h(P.IconRefreshOutline16), refreshing ? '检测中…' : '重新检测'),
								h(Button, { type: 'button', primary: true, onClick: function () { setEditor('new'); } }, h(P.IconPlusOutline16), '新增服务器')
							),
							h('div', { className: 'mm-filters' }, filters.map(function (item) { return h('button', { key: item[0], type: 'button', className: 'mm-filter' + (filter === item[0] ? ' mm-filterOn' : ''), onClick: function () { setFilter(item[0]); } }, item[1]); })),
							serverBody
						) : h(React.Fragment, null,
							h('div', { className: 'mm-toolbar' }, h(Search, { value: query, onChange: setQuery, placeholder: '搜索 MCP Server' }), h('select', { className: 'mm-sort', 'aria-label': 'MCP 市场排序', value: marketSort, onChange: function (event: React.ChangeEvent<HTMLSelectElement>) { setMarketSort(event.target.value as McpMarketSort); } }, h('option', { value: 'relevance' }, '综合排序'), h('option', { value: 'popular' }, '热度优先'), h('option', { value: 'recent' }, '最新优先'))),
							marketBody
						),
					selectedServer ? h(ServerDrawer, { server: selectedServer, busy: busy === selectedServer.id, onClose: function () { setSelectedServer(null); }, onReconnect: function () { if (selectedServer) reconnect(selectedServer); }, onEdit: function () { if (selectedServer) setEditor(selectedServer); }, onDelete: function () { if (selectedServer) setDeleting(selectedServer); } }) : null,
					selectedMarket ? h(MarketDrawer, { item: selectedMarket, detail: marketDetail, loading: detailLoading, busy: busy === selectedMarket.id, onClose: function () { setSelectedMarket(null); }, onInstall: function () { if (selectedMarket) installMarket(selectedMarket); } }) : null,
					editor ? h(ServerDialog, { server: typeof editor === 'object' ? editor : null, busy: busy === 'save', onClose: function () { if (busy !== 'save') setEditor(null); }, onSubmit: saveServer }) : null,
					deleting ? h(DeleteDialog, { server: deleting, busy: busy === 'delete', onClose: function () { if (busy !== 'delete') setDeleting(null); }, onConfirm: function () { if (deleting) remove(deleting); } }) : null,
					toast ? h('div', { className: 'mm-toast' + (toast.error ? ' mm-toastError' : ''), role: 'status' }, toast.message) : null
				);
			}

			var module: ClientModule = { exports: {} };
			module.exports.name = 'mcp-manager-ui';
			module.exports.inject = ['slots'];
			module.exports.apply = function (ctx) {
				var slots = ctx.get('slots') as ClientSlots | undefined;
				if (slots === undefined || typeof slots.register !== 'function') return;
				var activeSlots = slots;
				activeSlots.inject('extension.manager.section', function () {
					return activeSlots.register({
						name: 'extension.manager.section',
						id: 'mcp',
						order: 20,
						label: function () { return 'MCP'; },
						inject: function () { return { api: { call: apiCall } }; }
					}, McpManagerSection);
				});
			};
			return module.exports;
		}
	});
})();
