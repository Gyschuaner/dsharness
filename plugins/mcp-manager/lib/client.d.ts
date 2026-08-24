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
    repository: string;
    description: string;
    iconUrl: string | null;
    installable: boolean;
    status: 'installed' | 'not-installed';
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
    stale?: boolean;
}
interface McpApi {
    call(op: 'list'): Promise<{
        servers: McpServerView[];
        connected: number;
    }>;
    call(op: 'marketplace', payload: {
        force: boolean;
    }): Promise<{
        items: McpMarketItem[];
    }>;
    call(op: 'marketplace.detail', payload: {
        id: string;
    }): Promise<McpMarketDetail>;
    call(op: string, payload?: Record<string, unknown>): Promise<unknown>;
}
interface ClientSlots {
    register(config: Record<string, unknown>, component: React.ComponentType<{
        api: McpApi;
    }>): unknown;
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
//# sourceMappingURL=client.d.ts.map