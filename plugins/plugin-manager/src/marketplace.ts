/**
 * DSH-027 curated discovery index.
 *
 * The marketplace home intentionally keeps only stable discovery facts. Live
 * repository, release and manifest metadata is fetched on demand by the Host.
 */
export interface MarketplaceEntry {
	readonly id: string;
	readonly repository: string;
	readonly packageName: string | null;
	readonly installSource: string;
	readonly latestHint?: string;
	readonly description: string;
}

export const MARKETPLACE = Object.freeze([
	Object.freeze({
		id: 'omdsh-dev/DSH-better-sidebar',
		repository: 'omdsh-dev/DSH-better-sidebar',
		packageName: 'dsh-better-sidebar',
		installSource: 'dsh-better-sidebar@latest',
		latestHint: '0.15.2',
		description: '更好的侧边栏体验，支持分组、折叠与快捷操作。',
	}),
	Object.freeze({
		id: 'huiliyi37/dsh-tianshu-tui',
		repository: 'huiliyi37/dsh-tianshu-tui',
		packageName: null,
		installSource: 'github:huiliyi37/dsh-tianshu-tui',
		description: '天枢推理助手，提供 TUI 式交互与工具调用能力。',
	}),
	Object.freeze({
		id: 'cccch1mneyyy/dsh-TUI',
		repository: 'cccch1mneyyy/dsh-TUI',
		packageName: null,
		installSource: 'github:cccch1mneyyy/dsh-TUI',
		description: 'DSH 命令行增强（TUI），提供更流畅的终端体验。',
	}),
] satisfies readonly MarketplaceEntry[]);

export function findMarketplaceEntry(id: string): MarketplaceEntry | null {
	return MARKETPLACE.find((entry) => entry.id === id) ?? null;
}
