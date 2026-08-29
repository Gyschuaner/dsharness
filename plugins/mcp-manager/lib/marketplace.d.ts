/** DSH-028 / DSH-036 MCP discovery and safe configuration projection. */
export interface MarketplaceInstall {
    readonly serverName: string;
    readonly description: string;
    readonly transport: 'stdio' | 'streamable-http';
    readonly command?: string;
    readonly args?: readonly string[];
    readonly env?: Readonly<Record<string, string>>;
    readonly url?: string;
    readonly headers?: Readonly<Record<string, string>>;
    readonly requiredEnv?: readonly string[];
}
export interface MarketplaceEntry {
    readonly id: string;
    readonly name: string;
    readonly repository: string | null;
    readonly repositoryUrl: string | null;
    readonly registryName: string | null;
    readonly version: string | null;
    readonly description: string;
    readonly iconUrl: string | null;
    readonly source: 'featured' | 'mcp-registry';
    readonly install: MarketplaceInstall | null;
    readonly installReason: string | null;
}
/** Normalize one official Registry ServerResponse. Unclear install metadata is
 * kept discoverable but deliberately view-only. */
export declare function normalizeRegistryMarketplaceEntry(value: unknown): MarketplaceEntry | null;
export declare const MARKETPLACE: readonly (Readonly<{
    id: "github/github-mcp-server";
    name: "GitHub MCP Server";
    repository: "github/github-mcp-server";
    repositoryUrl: "https://github.com/github/github-mcp-server";
    registryName: "io.github.github/github-mcp-server";
    version: null;
    description: "GitHub's official MCP Server";
    iconUrl: null;
    source: "featured";
    install: Readonly<{
        serverName: "github";
        description: "GitHub repositories, issues, pull requests and workflows.";
        transport: "streamable-http";
        url: "https://api.githubcopilot.com/mcp/";
        headers: Readonly<{
            Authorization: "GITHUB_MCP_AUTHORIZATION";
        }>;
        requiredEnv: readonly string[];
    }>;
    installReason: null;
}> | Readonly<{
    id: "microsoft/playwright-mcp";
    name: "Playwright MCP";
    repository: "microsoft/playwright-mcp";
    repositoryUrl: "https://github.com/microsoft/playwright-mcp";
    registryName: "io.github.microsoft/playwright-mcp";
    version: null;
    description: "Playwright MCP server";
    iconUrl: null;
    source: "featured";
    install: Readonly<{
        serverName: "playwright";
        description: "Browser automation through Playwright accessibility snapshots.";
        transport: "stdio";
        command: "npx";
        args: readonly string[];
        env: Readonly<{}>;
    }>;
    installReason: null;
}> | Readonly<{
    id: "upstash/context7";
    name: "Context7";
    repository: "upstash/context7";
    repositoryUrl: "https://github.com/upstash/context7";
    registryName: "io.github.upstash/context7";
    version: null;
    description: "Up-to-date code documentation for LLMs and AI code editors";
    iconUrl: null;
    source: "featured";
    install: Readonly<{
        serverName: "context7";
        description: "Current library documentation and code examples.";
        transport: "stdio";
        command: "npx";
        args: readonly string[];
        env: Readonly<{
            CONTEXT7_API_KEY: "CONTEXT7_API_KEY";
        }>;
    }>;
    installReason: null;
}> | Readonly<{
    id: "modelcontextprotocol/servers";
    name: "MCP Reference Servers";
    repository: "modelcontextprotocol/servers";
    repositoryUrl: "https://github.com/modelcontextprotocol/servers";
    registryName: null;
    version: null;
    description: "Model Context Protocol reference servers";
    iconUrl: null;
    source: "featured";
    install: null;
    installReason: "该仓库包含多个 Server，不能唯一推导安装配置";
}> | Readonly<{
    id: "awslabs/mcp";
    name: "AWS Labs MCP";
    repository: "awslabs/mcp";
    repositoryUrl: "https://github.com/awslabs/mcp";
    registryName: null;
    version: null;
    description: "Open source MCP Servers for AWS";
    iconUrl: null;
    source: "featured";
    install: null;
    installReason: "该仓库包含多个 Server，不能唯一推导安装配置";
}>)[];
export declare function findMarketplaceEntry(id: string): MarketplaceEntry | null;
//# sourceMappingURL=marketplace.d.ts.map