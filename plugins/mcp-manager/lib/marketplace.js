/**
 * DSH-028 curated MCP discovery index.
 *
 * Repository metadata is fetched from GitHub and the official MCP Registry by
 * the Host. Installation is deliberately a reviewed configuration import: a
 * market entry is written disabled and never executes third-party code merely
 * because the user pressed Install.
 */
export const MARKETPLACE = Object.freeze([
	Object.freeze({
		id: 'github/github-mcp-server',
		repository: 'github/github-mcp-server',
		registryName: 'io.github.github/github-mcp-server',
		description: "GitHub's official MCP Server",
		install: Object.freeze({
			serverName: 'github',
			description: 'GitHub repositories, issues, pull requests and workflows.',
			transport: 'streamable-http',
			url: 'https://api.githubcopilot.com/mcp/',
			headers: Object.freeze({ Authorization: 'GITHUB_MCP_AUTHORIZATION' }),
			requiredEnv: Object.freeze(['GITHUB_MCP_AUTHORIZATION']),
		}),
	}),
	Object.freeze({
		id: 'microsoft/playwright-mcp',
		repository: 'microsoft/playwright-mcp',
		registryName: 'io.github.microsoft/playwright-mcp',
		description: 'Playwright MCP server',
		install: Object.freeze({
			serverName: 'playwright',
			description: 'Browser automation through Playwright accessibility snapshots.',
			transport: 'stdio',
			command: 'npx',
			args: Object.freeze(['-y', '@playwright/mcp@latest']),
			env: Object.freeze({}),
		}),
	}),
	Object.freeze({
		id: 'upstash/context7',
		repository: 'upstash/context7',
		registryName: 'io.github.upstash/context7',
		description: 'Up-to-date code documentation for LLMs and AI code editors',
		install: Object.freeze({
			serverName: 'context7',
			description: 'Current library documentation and code examples.',
			transport: 'stdio',
			command: 'npx',
			args: Object.freeze(['-y', '@upstash/context7-mcp@latest']),
			env: Object.freeze({ CONTEXT7_API_KEY: 'CONTEXT7_API_KEY' }),
		}),
	}),
	Object.freeze({
		id: 'modelcontextprotocol/servers',
		repository: 'modelcontextprotocol/servers',
		registryName: null,
		description: 'Model Context Protocol reference servers',
		install: null,
	}),
	Object.freeze({
		id: 'awslabs/mcp',
		repository: 'awslabs/mcp',
		registryName: null,
		description: 'Open source MCP Servers for AWS',
		install: null,
	}),
]);

export function findMarketplaceEntry(id) {
	return MARKETPLACE.find((entry) => entry.id === id) ?? null;
}
