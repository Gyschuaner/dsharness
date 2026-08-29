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
	readonly publishedAt?: string | null;
	readonly updatedAt?: string | null;
}

type UnknownRecord = Record<string, unknown>;

const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const HEADER_NAME_RE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,80}$/;
const NPM_PACKAGE_RE = /^(?:@[a-z0-9._~-]+\/)?[a-z0-9._~-]+$/i;

function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
	return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function safeHttps(value: unknown): string | null {
	const raw = text(value);
	if (raw === null) return null;
	try {
		const url = new URL(raw);
		return url.protocol === 'https:' ? url.toString() : null;
	} catch {
		return null;
	}
}

function repositoryIdentity(value: unknown): { repository: string | null; url: string | null } {
	if (!isRecord(value)) return { repository: null, url: null };
	const url = safeHttps(value.url);
	if (url === null) return { repository: null, url: null };
	try {
		const parsed = new URL(url);
		if (parsed.hostname.toLowerCase() !== 'github.com') return { repository: null, url };
		const parts = parsed.pathname.split('/').filter(Boolean);
		if (parts.length < 2) return { repository: null, url };
		return { repository: `${parts[0]}/${String(parts[1]).replace(/\.git$/i, '')}`, url };
	} catch {
		return { repository: null, url: null };
	}
}

function serverSlug(name: string): string {
	const tail = name.split('/').pop() || name;
	const slug = tail.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
	return slug || 'mcp-server';
}

function environmentProjection(value: unknown): { env: Record<string, string>; required: string[] } | null {
	const rows = Array.isArray(value) ? value : [];
	const env: Record<string, string> = {};
	const required: string[] = [];
	for (const rowValue of rows) {
		if (!isRecord(rowValue) || !ENV_NAME_RE.test(String(rowValue.name || ''))) return null;
		const name = String(rowValue.name);
		env[name] = name;
		if (rowValue.isRequired === true) required.push(name);
	}
	return { env, required };
}

function argumentValues(value: unknown): string[] | null {
	const rows = Array.isArray(value) ? value : [];
	const result: string[] = [];
	for (const rowValue of rows) {
		if (!isRecord(rowValue) || rowValue.type !== 'positional' || typeof rowValue.value !== 'string' || rowValue.value.includes('\0')) return null;
		result.push(rowValue.value);
	}
	return result;
}

function inferRemoteInstall(server: UnknownRecord, serverName: string, description: string): MarketplaceInstall | null {
	const remotes = Array.isArray(server.remotes) ? server.remotes.filter(isRecord) : [];
	if (remotes.length !== 1) return null;
	const remote = remotes[0]!;
	if (remote.type !== 'streamable-http') return null;
	const url = safeHttps(remote.url);
	if (url === null || /[{}]/.test(url)) return null;
	const headers: Record<string, string> = {};
	const requiredEnv: string[] = [];
	for (const headerValue of Array.isArray(remote.headers) ? remote.headers : []) {
		if (!isRecord(headerValue) || !HEADER_NAME_RE.test(String(headerValue.name || ''))) return null;
		const header = String(headerValue.name);
		if (typeof headerValue.value === 'string' && /[{}]/.test(headerValue.value)) return null;
		const envName = `MCP_${serverName}_${header}`.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
		headers[header] = envName;
		if (headerValue.isRequired !== false) requiredEnv.push(envName);
	}
	return { serverName, description, transport: 'streamable-http', url, headers, requiredEnv };
}

function inferPackageInstall(server: UnknownRecord, serverName: string, description: string): MarketplaceInstall | null {
	const packages = Array.isArray(server.packages) ? server.packages.filter(isRecord) : [];
	if (packages.length !== 1) return null;
	const pkg = packages[0]!;
	if (pkg.registryType !== 'npm' || (pkg.runtimeHint !== undefined && pkg.runtimeHint !== 'npx')) return null;
	const transport = isRecord(pkg.transport) ? pkg.transport : {};
	const identifier = text(pkg.identifier);
	const version = text(pkg.version);
	if (transport.type !== 'stdio' || identifier === null || version === null || !NPM_PACKAGE_RE.test(identifier) || /[~^*<>=|\s]/.test(version) || version === 'latest') return null;
	const runtimeArgs = argumentValues(pkg.runtimeArguments);
	const packageArgs = argumentValues(pkg.packageArguments);
	const environment = environmentProjection(pkg.environmentVariables);
	if (runtimeArgs === null || packageArgs === null || environment === null) return null;
	const args = [...runtimeArgs.filter((arg) => arg !== '-y'), '-y', `${identifier}@${version}`, ...packageArgs];
	return { serverName, description, transport: 'stdio', command: 'npx', args, env: environment.env, requiredEnv: environment.required };
}

/** Normalize one official Registry ServerResponse. Unclear install metadata is
 * kept discoverable but deliberately view-only. */
export function normalizeRegistryMarketplaceEntry(value: unknown): MarketplaceEntry | null {
	const response = isRecord(value) ? value : {};
	const server = isRecord(response.server) ? response.server : response;
	const metadata = isRecord(response._meta) && isRecord(response._meta['io.modelcontextprotocol.registry/official'])
		? response._meta['io.modelcontextprotocol.registry/official']
		: {};
	const registryName = text(server.name);
	if (registryName === null) return null;
	const description = text(server.description) || '该 MCP Server 没有提供描述。';
	const name = text(server.title) || registryName;
	const repository = repositoryIdentity(server.repository);
	const serverName = serverSlug(registryName);
	const remoteInstall = inferRemoteInstall(server, serverName, description);
	const packageInstall = inferPackageInstall(server, serverName, description);
	const install = remoteInstall || packageInstall;
	const icons = Array.isArray(server.icons) ? server.icons.filter(isRecord) : [];
	const iconUrl = icons.map((icon) => safeHttps(icon.src)).find((url) => url !== null) || null;
	return {
		id: `registry:${registryName}`,
		name,
		repository: repository.repository,
		repositoryUrl: repository.url,
		registryName,
		version: text(server.version),
		description,
		iconUrl,
		source: 'mcp-registry',
		install,
		installReason: install === null ? 'Registry 元数据无法唯一、安全地推导一个 DSH 配置' : null,
		publishedAt: text(metadata.publishedAt),
		updatedAt: text(metadata.updatedAt),
	};
}

export const MARKETPLACE = Object.freeze([
	Object.freeze({
		id: 'github/github-mcp-server',
		name: 'GitHub MCP Server',
		repository: 'github/github-mcp-server',
		repositoryUrl: 'https://github.com/github/github-mcp-server',
		registryName: 'io.github.github/github-mcp-server',
		version: null,
		description: "GitHub's official MCP Server",
		iconUrl: null,
		source: 'featured',
		install: Object.freeze({
			serverName: 'github',
			description: 'GitHub repositories, issues, pull requests and workflows.',
			transport: 'streamable-http',
			url: 'https://api.githubcopilot.com/mcp/',
			headers: Object.freeze({ Authorization: 'GITHUB_MCP_AUTHORIZATION' }),
			requiredEnv: Object.freeze(['GITHUB_MCP_AUTHORIZATION']),
		}),
		installReason: null,
	}),
	Object.freeze({
		id: 'microsoft/playwright-mcp',
		name: 'Playwright MCP',
		repository: 'microsoft/playwright-mcp',
		repositoryUrl: 'https://github.com/microsoft/playwright-mcp',
		registryName: 'io.github.microsoft/playwright-mcp',
		version: null,
		description: 'Playwright MCP server',
		iconUrl: null,
		source: 'featured',
		install: Object.freeze({
			serverName: 'playwright',
			description: 'Browser automation through Playwright accessibility snapshots.',
			transport: 'stdio',
			command: 'npx',
			args: Object.freeze(['-y', '@playwright/mcp@latest']),
			env: Object.freeze({}),
		}),
		installReason: null,
	}),
	Object.freeze({
		id: 'upstash/context7',
		name: 'Context7',
		repository: 'upstash/context7',
		repositoryUrl: 'https://github.com/upstash/context7',
		registryName: 'io.github.upstash/context7',
		version: null,
		description: 'Up-to-date code documentation for LLMs and AI code editors',
		iconUrl: null,
		source: 'featured',
		install: Object.freeze({
			serverName: 'context7',
			description: 'Current library documentation and code examples.',
			transport: 'stdio',
			command: 'npx',
			args: Object.freeze(['-y', '@upstash/context7-mcp@latest']),
			env: Object.freeze({ CONTEXT7_API_KEY: 'CONTEXT7_API_KEY' }),
		}),
		installReason: null,
	}),
	Object.freeze({
		id: 'modelcontextprotocol/servers',
		name: 'MCP Reference Servers',
		repository: 'modelcontextprotocol/servers',
		repositoryUrl: 'https://github.com/modelcontextprotocol/servers',
		registryName: null,
		version: null,
		description: 'Model Context Protocol reference servers',
		iconUrl: null,
		source: 'featured',
		install: null,
		installReason: '该仓库包含多个 Server，不能唯一推导安装配置',
	}),
	Object.freeze({
		id: 'awslabs/mcp',
		name: 'AWS Labs MCP',
		repository: 'awslabs/mcp',
		repositoryUrl: 'https://github.com/awslabs/mcp',
		registryName: null,
		version: null,
		description: 'Open source MCP Servers for AWS',
		iconUrl: null,
		source: 'featured',
		install: null,
		installReason: '该仓库包含多个 Server，不能唯一推导安装配置',
	}),
] satisfies readonly MarketplaceEntry[]);

export function findMarketplaceEntry(id: string): MarketplaceEntry | null {
	return MARKETPLACE.find((entry) => entry.id === id) ?? null;
}
