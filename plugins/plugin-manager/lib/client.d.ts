/**
 * dsh-plugin-manager — Client half (DSH-027, build 2).
 *
 * TypeScript source compiled to a classic browser bundle with no JSX/imports. The plugin
 * contributes only the Plugin business section to dsh-extension-manager.
 */
interface PluginLocalView {
    name: string;
    rowId: string;
    version: string;
    description: string;
    source: string;
    spec: string;
    enabled: boolean;
    managed: boolean;
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
interface PluginMarketItem {
    id: string;
    repository: string;
    description: string;
    iconUrl?: string | null;
    iconSource?: string;
    marketSource?: 'featured' | 'registry' | 'npm';
    installable?: boolean;
    status: string;
    installedVersion: string | null;
    latestVersion?: string | null;
    popularity?: number | null;
    publishedAt?: string | null;
}
type PluginMarketSort = 'relevance' | 'popular' | 'recent';
interface PluginRegistryInfo {
    status: 'fresh' | 'stale' | 'unavailable';
    generatedAt: string | null;
    warning: string | null;
}
interface PluginMarketplaceResponse {
    items: PluginMarketItem[];
    registry?: PluginRegistryInfo;
    page?: {
        offset: number;
        limit: number;
        total: number;
        hasMore: boolean;
        nextCursor: string | null;
    };
    warning?: string | null;
}
interface PluginMarketDetail {
    url?: string;
    description?: string;
    iconUrl?: string | null;
    iconSource?: string;
    marketSource?: 'featured' | 'registry' | 'npm';
    installable?: boolean;
    status?: string;
    installedVersion?: string | null;
    latestVersion?: string | null;
    author?: string | null;
    license?: string | null;
    language?: string | null;
    stars?: number;
    forks?: number;
    lastPushedAt?: string | null;
    releaseUrl?: string | null;
    topics?: string[];
    error?: string;
    manifest?: {
        valid: boolean;
        dshRequirement?: string | null;
        hostEntry?: string | null;
        clientEntry?: string | null;
    };
}
interface PluginApi {
    call(op: 'list'): Promise<{
        plugins: PluginLocalView[];
    }>;
    call(op: 'marketplace', payload?: {
        query?: string;
        cursor?: string;
        limit?: number;
        force?: boolean;
        sort?: PluginMarketSort;
    }): Promise<PluginMarketplaceResponse>;
    call(op: 'marketplace.detail', payload: {
        id: string;
        force?: boolean;
    }): Promise<PluginMarketDetail>;
    call(op: 'setEnabled', payload: {
        name: string;
        enabled: boolean;
    }): Promise<{
        restartRequired: boolean;
    }>;
    call(op: 'import' | 'marketplace.install', payload: Record<string, unknown>): Promise<{
        plugin: PluginLocalView | null;
    }>;
    call(op: string, payload?: Record<string, unknown>): Promise<unknown>;
}
interface PluginClientSlots {
    register(config: Record<string, unknown>, component: React.ComponentType<{
        api: PluginApi;
    }>): unknown;
    inject(name: string, effect: () => unknown): void;
}
interface PluginButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    primary?: boolean;
}
interface PluginSwitchProps {
    checked: boolean;
    disabled?: boolean;
    label: string;
    title?: string | undefined;
    onChange(value: boolean): void;
}
interface PluginSearchProps {
    value: string;
    placeholder: string;
    onChange(value: string): void;
}
interface ImportDialogProps {
    onClose(): void;
    onSubmit(source: string): Promise<unknown>;
}
interface LocalDrawerProps {
    plugin: PluginLocalView;
    busy: boolean;
    onClose(): void;
    onToggle(enabled: boolean): void;
}
interface PluginMarketDrawerProps {
    item: PluginMarketItem;
    detail: PluginMarketDetail | null;
    registry: PluginRegistryInfo;
    loading: boolean;
    busy: boolean;
    onClose(): void;
    onInstall(): void;
}
interface RemoteIconProps {
    src?: string | null | undefined;
    className?: string;
    fallbackClass?: string;
    size?: number;
}
//# sourceMappingURL=client.d.ts.map