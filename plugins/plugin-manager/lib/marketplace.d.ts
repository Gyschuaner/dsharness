/**
 * DSH-027 featured discovery index.
 *
 * The marketplace home intentionally keeps only stable discovery facts. Live
 * repository, release and manifest metadata is fetched on demand by the Host.
 */
export interface MarketplaceManifestHint {
    readonly valid: true;
    readonly packageName: string;
    readonly version: string | null;
    readonly dshRequirement: string | null;
    readonly hostEntry: string | null;
    readonly clientEntry: string | null;
    readonly bundlePatch: string | null;
}
export interface MarketplaceEntry {
    readonly id: string;
    readonly repository: string;
    readonly packageName: string | null;
    readonly installSource?: string;
    readonly latestHint?: string;
    readonly description: string;
    readonly iconUrl?: string | null;
    /** Manifest facts verified from the exact npm version used for installation. */
    readonly verifiedManifest?: MarketplaceManifestHint;
    readonly popularity?: number | null;
    readonly publishedAt?: string | null;
}
export declare const FEATURED_MARKETPLACE: readonly (Readonly<{
    id: "omdsh-dev/DSH-better-sidebar";
    repository: "omdsh-dev/DSH-better-sidebar";
    packageName: "dsh-better-sidebar";
    installSource: "dsh-better-sidebar@latest";
    latestHint: "0.15.2";
    description: "更好的侧边栏体验，支持分组、折叠与快捷操作。";
}> | Readonly<{
    id: "huiliyi37/dsh-tianshu-tui";
    repository: "huiliyi37/dsh-tianshu-tui";
    packageName: null;
    installSource: "github:huiliyi37/dsh-tianshu-tui";
    description: "天枢推理助手，提供 TUI 式交互与工具调用能力。";
}> | Readonly<{
    id: "cccch1mneyyy/dsh-TUI";
    repository: "cccch1mneyyy/dsh-TUI";
    packageName: null;
    installSource: "github:cccch1mneyyy/dsh-TUI";
    description: "DSH 命令行增强（TUI），提供更流畅的终端体验。";
}>)[];
/** Backwards-compatible name for callers that only need the featured list. */
export declare const MARKETPLACE: readonly (Readonly<{
    id: "omdsh-dev/DSH-better-sidebar";
    repository: "omdsh-dev/DSH-better-sidebar";
    packageName: "dsh-better-sidebar";
    installSource: "dsh-better-sidebar@latest";
    latestHint: "0.15.2";
    description: "更好的侧边栏体验，支持分组、折叠与快捷操作。";
}> | Readonly<{
    id: "huiliyi37/dsh-tianshu-tui";
    repository: "huiliyi37/dsh-tianshu-tui";
    packageName: null;
    installSource: "github:huiliyi37/dsh-tianshu-tui";
    description: "天枢推理助手，提供 TUI 式交互与工具调用能力。";
}> | Readonly<{
    id: "cccch1mneyyy/dsh-TUI";
    repository: "cccch1mneyyy/dsh-TUI";
    packageName: null;
    installSource: "github:cccch1mneyyy/dsh-TUI";
    description: "DSH 命令行增强（TUI），提供更流畅的终端体验。";
}>)[];
export declare function findMarketplaceEntry(id: string): MarketplaceEntry | null;
//# sourceMappingURL=marketplace.d.ts.map