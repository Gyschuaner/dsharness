export declare const MARKET_API_VERSION = 1;
/**
 * Curated public sources.  `path` points to one canonical Skill directory,
 * not a whole repository, so a market install cannot accidentally copy an
 * unrelated project tree.
 */
export declare const MARKETPLACE: readonly (Readonly<{
    id: "anthropics/skills#skills/xlsx";
    name: "xlsx";
    repository: "anthropics/skills";
    path: "skills/xlsx";
    ref: "main";
    description: "Create, edit, analyze, and verify spreadsheet workbooks.";
    tags: readonly string[];
    marketSource: "featured";
}> | Readonly<{
    id: "anthropics/skills#skills/docx";
    name: "docx";
    repository: "anthropics/skills";
    path: "skills/docx";
    ref: "main";
    description: "Create, edit, and review Word documents.";
    tags: readonly string[];
    marketSource: "featured";
}> | Readonly<{
    id: "anthropics/skills#skills/skill-creator";
    name: "skill-creator";
    repository: "anthropics/skills";
    path: "skills/skill-creator";
    ref: "main";
    description: "Create and improve reusable Agent Skills.";
    tags: readonly string[];
    marketSource: "featured";
}> | Readonly<{
    id: "SmileTao/dsh-plugin-dev-skill#skills/dsh-plugin-dev";
    name: "dsh-plugin-dev";
    repository: "SmileTao/dsh-plugin-dev-skill";
    path: "skills/dsh-plugin-dev";
    ref: "main";
    description: "DeepSeek Harness 插件开发指南，覆盖 Cordis、工具、事件与发布流程。";
    tags: readonly string[];
    marketSource: "featured";
}> | Readonly<{
    id: "w2112515/dsh-plugin-development#skills/dsh-plugin-development";
    name: "dsh-plugin-development";
    repository: "w2112515/dsh-plugin-development";
    path: "skills/dsh-plugin-development";
    ref: "main";
    description: "Portable DeepSeek Harness plugin design, implementation and diagnostics workflow.";
    tags: readonly string[];
    marketSource: "featured";
}>)[];
/** Parse a public GitHub repository or directory URL without accepting an
 * arbitrary download host. Directory URLs use GitHub's /tree/<ref>/<path>
 * shape; refs containing slashes can be supplied by using a repository URL
 * and choosing a discovered Skill path in the preview UI. */
export declare function parseGitHubSkillUrl(value: any): {
    repository: string;
    ref: string;
    explicitRef: boolean;
    path: string | null;
    repositoryUrl: string;
};
/**
 * Create an isolated marketplace service.  `entries` and `fetch` are
 * injectable so Host tests never touch the network or a user's filesystem.
 */
export declare function createMarketplace(options?: {}): {
    entries: readonly any[];
    list: (cwd: any, force?: boolean, requestedSort?: string) => Promise<{
        apiVersion: number;
        source: string;
        sort: string;
        registries: {
            id: "anthropic-agent-skills";
            label: "Anthropic 官方";
        }[];
        warning: string | null;
        items: {
            id: any;
            name: any;
            repository: any;
            path: any;
            ref: any;
            description: any;
            iconUrl: any;
            iconSource: string;
            repositoryUrl: any;
            author: any;
            license: any;
            stars: any;
            forks: any;
            tags: any;
            marketSource: any;
            latestRevision: any;
            lastPushedAt: any;
            status: string;
            installedRevision: any;
            stale: boolean;
            metadataError: string | null;
        }[];
    }>;
    detail: (id: any, cwd: any, force?: boolean) => Promise<{
        apiVersion: number;
        id: any;
        name: any;
        repository: any;
        path: any;
        ref: any;
        marketSource: any;
        url: any;
        description: any;
        iconUrl: any;
        author: any;
        stars: any;
        forks: any;
        language: any;
        license: any;
        lastPushedAt: any;
        topics: any;
        latestRevision: any;
        status: string;
        metadataError: string | null;
        stale: boolean;
        manifest: {
            name: string;
            description: string;
            whenToUse: string | undefined;
        } | null;
        fileCount: any;
        files: any;
        contentHash: string | null;
        security: {
            trustedSource: boolean;
            frontmatterValidated: boolean;
            pathsValidated: boolean;
            symlinksRejected: boolean;
            thirdPartyCodeExecuted: boolean;
        };
    }>;
    preview: (id: any, cwd: any) => Promise<{
        apiVersion: number;
        id: any;
        name: any;
        projectRoot: string;
        targetPath: string;
        action: string;
        canInstall: boolean;
        message: string;
        existing: {
            format: string;
            path: any;
            hash: string | null;
            managed: boolean;
        } | null;
        incoming: {
            hash: any;
            fileCount: any;
            files: any;
            manifest: any;
        };
        checks: {
            remoteRepository: string;
            trustedSource: boolean;
            frontmatterValidated: boolean;
            pathsValidated: boolean;
            symlinksRejected: boolean;
            thirdPartyCodeExecuted: boolean;
        };
    }>;
    install: (id: any, cwd: any) => Promise<{
        apiVersion: number;
        changed: boolean;
        updated: boolean;
        installedDisabled: boolean;
        id: any;
        name: any;
        projectRoot: string;
        path: string;
        contentHash: any;
    }>;
    inspectGithub: (url: any) => Promise<{
        apiVersion: number;
        repository: string;
        ref: string;
        discoverySource: string;
        repositoryUrl: string;
        requestedPath: string | null;
        candidates: any;
    }>;
    githubPreview: (url: any, path: any, cwd: any) => Promise<{
        source: string;
        repository: string;
        path: any;
        ref: string;
        apiVersion: number;
        id: any;
        name: any;
        projectRoot: string;
        targetPath: string;
        action: string;
        canInstall: boolean;
        message: string;
        existing: {
            format: string;
            path: any;
            hash: string | null;
            managed: boolean;
        } | null;
        incoming: {
            hash: any;
            fileCount: any;
            files: any;
            manifest: any;
        };
        checks: {
            remoteRepository: string;
            trustedSource: boolean;
            frontmatterValidated: boolean;
            pathsValidated: boolean;
            symlinksRejected: boolean;
            thirdPartyCodeExecuted: boolean;
        };
    }>;
    githubInstall: (url: any, path: any, cwd: any) => Promise<{
        apiVersion: number;
        changed: boolean;
        updated: boolean;
        installedDisabled: boolean;
        id: any;
        name: any;
        projectRoot: string;
        path: string;
        contentHash: any;
    }>;
    findEntry: (id: any) => any;
};
//# sourceMappingURL=marketplace.d.ts.map