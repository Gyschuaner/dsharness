/**
 * Versioned Plugin marketplace Registry (DSH-030 / DSH-036).
 *
 * The Registry is data only. It never carries executable code or secrets. The
 * Host validates the document before merging it with the built-in featured
 * list. A Registry package becomes installable only after npm manifest
 * validation; repository-only records remain view-only.
 */
export declare const REGISTRY_SCHEMA_VERSION: 1;
export declare const DEFAULT_REGISTRY_URL = "https://raw.githubusercontent.com/Gyschuaner/dsharness/main/marketplace/plugin-registry.json";
export interface RegistryItem {
    readonly id: string;
    readonly repository: string;
    readonly packageName: string | null;
    readonly description: string;
    readonly iconUrl: string | null;
    readonly latestHint: string | null;
}
export interface PluginRegistry {
    readonly schemaVersion: typeof REGISTRY_SCHEMA_VERSION;
    readonly generatedAt: string;
    readonly items: readonly RegistryItem[];
}
/**
 * Validate and normalize an untrusted Registry response. Duplicate
 * repositories are merged by keeping the first valid entry, so a bad mirror
 * cannot create duplicate rows in the UI.
 */
export declare function normalizeRegistry(value: unknown): PluginRegistry;
//# sourceMappingURL=registry.d.ts.map