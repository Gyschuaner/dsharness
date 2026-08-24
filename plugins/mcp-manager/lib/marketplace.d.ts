/**
 * DSH-028 curated MCP discovery index.
 *
 * Repository metadata is fetched from GitHub and the official MCP Registry by
 * the Host. Installation is deliberately a reviewed configuration import: a
 * market entry is written disabled and never executes third-party code merely
 * because the user pressed Install.
 */
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
    readonly repository: string;
    readonly registryName: string | null;
    readonly description: string;
    readonly install: MarketplaceInstall | null;
}
export declare const MARKETPLACE: readonly (Readonly<{
    id: "github/github-mcp-server";
    repository: "github/github-mcp-server";
    registryName: "io.github.github/github-mcp-server";
    description: "GitHub's official MCP Server";
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
}> | Readonly<{
    id: "microsoft/playwright-mcp";
    repository: "microsoft/playwright-mcp";
    registryName: "io.github.microsoft/playwright-mcp";
    description: "Playwright MCP server";
    install: Readonly<{
        serverName: "playwright";
        description: "Browser automation through Playwright accessibility snapshots.";
        transport: "stdio";
        command: "npx";
        args: readonly string[];
        env: Readonly<{}>;
    }>;
}> | Readonly<{
    id: "upstash/context7";
    repository: "upstash/context7";
    registryName: "io.github.upstash/context7";
    description: "Up-to-date code documentation for LLMs and AI code editors";
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
}> | Readonly<{
    id: "modelcontextprotocol/servers";
    repository: "modelcontextprotocol/servers";
    registryName: null;
    description: "Model Context Protocol reference servers";
    install: null;
}> | Readonly<{
    id: "awslabs/mcp";
    repository: "awslabs/mcp";
    registryName: null;
    description: "Open source MCP Servers for AWS";
    install: null;
}>)[];
export declare function findMarketplaceEntry(id: string): MarketplaceEntry | null;
//# sourceMappingURL=marketplace.d.ts.map