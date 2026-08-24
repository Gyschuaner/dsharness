export declare const API_VERSION = 1;
export declare const SERVERS_START = "# mcp-manager:servers:start";
export declare const SERVERS_END = "# mcp-manager:servers:end";
export declare const SERVER_META = "# mcp-manager:server ";
type UnknownRecord = Record<string, unknown>;
type Environment = Readonly<Record<string, string | undefined>>;
type ReferenceMap = Record<string, string>;
interface ServerBase {
    id: string;
    serverName: string;
    description: string;
    enabled: boolean;
    toolCallTimeoutMs: number;
    failOnStartupError: boolean;
    requiredEnv: string[];
    source: 'market' | 'manual';
    marketId: string | null;
    repository: string | null;
    iconUrl: string | null;
    revision: number;
    updatedAt: string;
}
export interface StdioServer extends ServerBase {
    transport: 'stdio';
    command: string;
    args: string[];
    env: ReferenceMap;
    cwd: string;
}
export interface HttpServer extends ServerBase {
    transport: 'streamable-http';
    url: string;
    headers: ReferenceMap;
}
export type McpServer = StdioServer | HttpServer;
interface ProfileOptions {
    profileDir?: string;
    dshHome?: string;
    profileName?: string;
}
interface McpDependencies {
    writeText?(path: string, text: string): Promise<void> | void;
    inventory?: {
        list(): unknown;
    };
    tools?: {
        schemas(): unknown;
    };
    env?: Environment;
    fetch?: typeof globalThis.fetch;
}
export interface McpManagerOptions extends ProfileOptions {
    deps?: McpDependencies;
    env?: Environment;
    cacheTtlMs?: number;
    logger?: {
        warn?(...values: unknown[]): void;
    };
}
export declare class ApiError extends Error {
    readonly status: number;
    readonly code: string;
    constructor(status: number, message: string, code?: string);
}
export declare function resolveProfileDir(options?: ProfileOptions): string;
export declare function extractManagedBlock(text: string, start?: string, end?: string): string;
export declare function replaceManagedBlock(text: string, body: string, start?: string, end?: string): string;
export declare function normalizeServer(input: unknown, options?: {
    id?: string;
}): McpServer;
export declare function serializeServers(servers: readonly McpServer[]): string;
export declare function parseServers(text: string): McpServer[];
export declare function createMcpManager(options?: McpManagerOptions): {
    profileDir: string;
    patchPath: string;
    call(op: unknown, body?: UnknownRecord): Promise<any>;
};
export {};
//# sourceMappingURL=state.d.ts.map