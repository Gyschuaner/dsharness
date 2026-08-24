import { type MarketplaceEntry } from './marketplace.js';
export declare const API_VERSION = 1;
export declare const OVERRIDE_START = "# plugin-manager:overrides:start";
export declare const OVERRIDE_END = "# plugin-manager:overrides:end";
export declare const MOUNT_START = "# plugin-manager:mounts:start";
export declare const MOUNT_END = "# plugin-manager:mounts:end";
export declare const PROTECTED_PACKAGES: Set<string>;
type UnknownRecord = Record<string, unknown>;
interface PluginManifest extends UnknownRecord {
    name: string;
    version?: string;
    description?: string;
    repository?: string | {
        url?: string;
    };
    license?: string;
    main?: string;
    exports?: Record<string, unknown>;
    dsh: {
        client?: unknown;
        bundle?: {
            patch?: string;
        };
        plugin?: unknown;
    };
    engines?: Record<string, string>;
    peerDependencies?: Record<string, string>;
}
interface PatchRow {
    id: string;
    indent: number;
    name: string | null;
    disabled: boolean | undefined;
}
export interface LocalPlugin {
    name: string;
    rowId: string;
    version: string;
    description: string;
    source: string;
    spec: string;
    enabled: boolean;
    protected: boolean;
    repository: string | null;
    license: string | null;
    runtimeEnabled: boolean | null;
    runtimePhase: string | null;
    manifest: {
        hostEntry: string | null;
        clientEntry: string | null;
        bundlePatch: string | null;
    };
}
interface RunResult {
    stdout: string;
    stderr: string;
}
type RunDsh = (args: string[], options?: {
    timeoutMs?: number;
}) => Promise<RunResult>;
interface PluginDependencies {
    writeText?(path: string, text: string): Promise<void> | void;
    runDsh?: RunDsh;
    installTimeoutMs?: number;
    githubTimeoutMs?: number;
    fetch?: typeof globalThis.fetch;
    inventory?: {
        list(): unknown | Promise<unknown>;
    };
}
interface ProfileOptions {
    profileDir?: string;
    dshHome?: string;
    profileName?: string;
}
export interface PluginManagerOptions extends ProfileOptions {
    deps?: PluginDependencies;
    githubCacheMs?: number;
    registryCacheMs?: number;
    registryUrl?: string;
}
interface GithubDetail extends UnknownRecord {
    id: string;
    repository: string;
    iconUrl: string | null;
    iconSource: 'github' | 'github-avatar' | 'generic';
    latestVersion: string | null;
}
export declare class ApiError extends Error {
    readonly status: number;
    readonly code: string;
    constructor(status: number, message: string, code?: string);
}
declare function withoutTrailingSlash(value: unknown): string;
export declare function resolveProfileDir(options?: ProfileOptions): string;
export declare function extractManagedBlock(text: string, start: string, end: string): string;
export declare function replaceManagedBlock(text: string, start: string, end: string, body: string): string;
/** Parse just the row leaves used by DSH patches; this is not a YAML parser. */
export declare function parsePatchRows(text: string): PatchRow[];
declare function parseOverrideMap(text: string): Map<string, boolean>;
declare function serializeOverrideMap(map: ReadonlyMap<string, boolean>): string;
declare function parseMountMap(text: string): Map<string, string>;
declare function serializeMountMap(map: ReadonlyMap<string, string>): string;
declare function packageSlug(name: string): string;
declare function repositorySlug(repository: PluginManifest['repository']): string | null;
declare function dependencySource(spec: unknown): string;
declare function firstSentence(value: unknown): string;
export declare function isDshPluginManifest(pkg: unknown): pkg is PluginManifest;
export declare function compareVersions(a: unknown, b: unknown): number;
declare function listLocalPlugins(profileDir: string): Promise<LocalPlugin[]>;
declare function fetchGithubDetail(entry: MarketplaceEntry, deps: PluginDependencies): Promise<GithubDetail>;
export declare function validateImportSource(source: unknown): string;
export declare function createPluginManager(options?: PluginManagerOptions): {
    profileDir: string;
    profileName: string;
    call(op: unknown, body?: UnknownRecord): Promise<any>;
};
export declare const internals: {
    firstSentence: typeof firstSentence;
    repositorySlug: typeof repositorySlug;
    dependencySource: typeof dependencySource;
    packageSlug: typeof packageSlug;
    parseOverrideMap: typeof parseOverrideMap;
    parseMountMap: typeof parseMountMap;
    serializeOverrideMap: typeof serializeOverrideMap;
    serializeMountMap: typeof serializeMountMap;
    listLocalPlugins: typeof listLocalPlugins;
    fetchGithubDetail: typeof fetchGithubDetail;
    withoutTrailingSlash: typeof withoutTrailingSlash;
};
export {};
//# sourceMappingURL=state.d.ts.map