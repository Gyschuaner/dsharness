export declare const MARKET_API_VERSION = 1;
/**
 * Curated public sources.  `path` points to one canonical Skill directory,
 * not a whole repository, so a market install cannot accidentally copy an
 * unrelated project tree.
 */
export declare const MARKETPLACE: readonly (Readonly<{
    id: "openai/skills#skills/.curated/cli-creator";
    name: "cli-creator";
    repository: "openai/skills";
    path: "skills/.curated/cli-creator";
    ref: "main";
    description: "Create or improve command-line tools with a focused, testable workflow.";
    tags: readonly string[];
}> | Readonly<{
    id: "openai/skills#skills/.curated/security-best-practices";
    name: "security-best-practices";
    repository: "openai/skills";
    path: "skills/.curated/security-best-practices";
    ref: "main";
    description: "Perform language- and framework-specific security best-practice reviews.";
    tags: readonly string[];
}> | Readonly<{
    id: "openai/skills#skills/.curated/security-threat-model";
    name: "security-threat-model";
    repository: "openai/skills";
    path: "skills/.curated/security-threat-model";
    ref: "main";
    description: "Create a repository-grounded threat model with actionable mitigations.";
    tags: readonly string[];
}> | Readonly<{
    id: "SmileTao/dsh-plugin-dev-skill#skills/dsh-plugin-dev";
    name: "dsh-plugin-dev";
    repository: "SmileTao/dsh-plugin-dev-skill";
    path: "skills/dsh-plugin-dev";
    ref: "main";
    description: "DeepSeek Harness 插件开发指南，覆盖 Cordis、工具、事件与发布流程。";
    tags: readonly string[];
}> | Readonly<{
    id: "w2112515/dsh-plugin-development#skills/dsh-plugin-development";
    name: "dsh-plugin-development";
    repository: "w2112515/dsh-plugin-development";
    path: "skills/dsh-plugin-development";
    ref: "main";
    description: "Portable DeepSeek Harness plugin design, implementation and diagnostics workflow.";
    tags: readonly string[];
}>)[];
/**
 * Create an isolated marketplace service.  `entries` and `fetch` are
 * injectable so Host tests never touch the network or a user's filesystem.
 */
export declare function createMarketplace(options?: {}): {
    entries: readonly any[];
    list: (cwd: any, force?: boolean) => Promise<{
        apiVersion: number;
        source: string;
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
            tags: any;
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
        fileCount: number | null;
        files: any[];
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
            hash: string;
            fileCount: number;
            files: any[];
            manifest: {
                name: string;
                description: string;
                whenToUse?: string;
                disableModelInvocation?: boolean;
                body: string;
            };
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
        contentHash: string;
    }>;
    findEntry: (id: any) => any;
};
//# sourceMappingURL=marketplace.d.ts.map