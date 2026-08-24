import { ApiError, findProjectRoot, projectConfigPath, globalConfigPath, atomicWriteFile, readProjectConfig, writeProjectConfig, readGlobalConfig, writeGlobalConfig, validateTagList, normalizeTagsMap, normalizePresetsMap, assertPresetName } from './state.js';
import { shadowStubPath, parseSkill, patchInvocationFlag, isShadowFile, markerContent, computeRoots, discoverInRoot, discoverBundled, walkSkillFiles, copySkillToProject, reconcileProject, applySourceSelection, buildProjectView, buildIdentityCatalog, type CatalogOptions } from './catalog.js';
import { createMarketplace } from './marketplace.js';
interface AgentPresetService {
    list(): Promise<unknown[]>;
}
interface Logger {
    warn?(message: string): void;
}
interface HandlerDeps extends CatalogOptions {
    agentPresets: AgentPresetService;
    logger?: Logger;
    /** Injectable transport/catalog for deterministic Host tests. */
    fetch?: (...args: any[]) => Promise<any>;
    marketplace?: unknown[];
}
interface PolicyState {
    globalDefaultOff: boolean;
}
interface TargetPlan {
    rootId: string;
    readOnly: boolean;
    readOnlyReason?: 'external' | 'bundled';
    dir: string;
    path: string;
    existing?: 'dir' | 'flat';
}
interface RequestLike extends AsyncIterable<Uint8Array> {
    method?: string;
}
interface ResponseLike {
    writeHead(status: number, headers: Record<string, string | number>): unknown;
    end(value?: string | Uint8Array): unknown;
}
type RequestHandler = (req: RequestLike, res: ResponseLike) => Promise<void>;
interface HostContext {
    logger?: Logger;
    get(service: 'webServer'): {
        register(route: {
            kind: 'exact';
            path: string;
            handler: ReturnType<typeof makeHandler>;
        }): unknown;
    } | undefined;
    get(service: 'agentPresets'): AgentPresetService;
    effect(register: () => unknown, label: string): void;
}
/** Stable Cordis plugin name (host half). */
declare const name = "skill-manager";
/** Wait for both host services before applying on a cold web-profile boot. */
declare const inject: string[];
declare function readPolicyState(opts?: CatalogOptions): Promise<PolicyState>;
declare function writePolicyState(state: PolicyState, opts?: CatalogOptions): Promise<void>;
/**
 * Policy enforcement write with a bounded retry: on Windows a file that was
 * just created/changed can be briefly held by a watcher, so a single rename
 * failure is transient. Still throws after the last attempt so callers can
 * report it instead of silently skipping the file.
 */
declare function policyWrite(path: string, content: string): Promise<void>;
/** Find a user-root skill by name (either user root, dir bundle or flat). */
declare function findUserSkill(cwd: string | undefined, skillName: string, opts?: CatalogOptions): Promise<TargetPlan | undefined>;
/** Find a project-root skill by name; { plan, marker } or undefined. */
declare function findProjectSkill(cwd: string, skillName: string, opts?: CatalogOptions): Promise<{
    plan: TargetPlan;
    marker: boolean;
} | undefined>;
/**
 * Enforce the legacy global default-off policy for this workspace: add the
 * disable flag to every healthy user-root skill that lacks it, and drop
 * legacy marker switches in this project whose original is a user skill
 * (now globally off, so the marker is redundant). Idempotent; safe to run
 * from the legacy list(). Never touches project-original, global or bundled
 * files. (V1 project-level state lives in the project config; the two are
 * coordinated in reconcileProject.)
 */
declare function enforceGlobalPolicy(cwd: string | undefined, opts?: CatalogOptions): Promise<{
    changed: number;
    markersRemoved: number;
    failed: Array<{
        name: string;
        path: string;
        error: string;
    }>;
}>;
/**
 * Resolve one {root, name} target to a concrete file plan.
 * @returns { rootId, readOnly, dir, path, existing } where existing is
 *   'dir' | 'flat' | undefined.
 */
declare function resolveTarget(agentPresets: AgentPresetService | undefined, cwd: string | undefined, rootId: unknown, skillName: unknown, forCreate: boolean, opts?: CatalogOptions): Promise<TargetPlan>;
/** Build a store-only ZIP archive. @param entries - [{ name, data }] */
declare function buildZip(entries: Array<{
    name: string;
    data: Buffer;
}>): Buffer;
/**
 * Build the request handler for the /api/skill-manager route.
 * @param deps - { agentPresets, logger, home? } — home is an optional test
 *   injection; when absent the real user home is used.
 * @returns (req, res) => Promise<void>
 */
declare function makeHandler(deps: HandlerDeps): RequestHandler;
/**
 * Register the skill-manager HTTP route on the web server.
 * @param ctx - the plugin context.
 */
declare function apply(ctx: HostContext): void;
export { name, inject, apply };
export declare const internals: {
    parseSkill: typeof parseSkill;
    patchInvocationFlag: typeof patchInvocationFlag;
    isShadowFile: typeof isShadowFile;
    findProjectRoot: typeof findProjectRoot;
    computeRoots: typeof computeRoots;
    readPolicyState: typeof readPolicyState;
    writePolicyState: typeof writePolicyState;
    atomicWriteFile: typeof atomicWriteFile;
    policyWrite: typeof policyWrite;
    findUserSkill: typeof findUserSkill;
    findProjectSkill: typeof findProjectSkill;
    markerContent: typeof markerContent;
    copySkillToProject: typeof copySkillToProject;
    enforceGlobalPolicy: typeof enforceGlobalPolicy;
    discoverInRoot: typeof discoverInRoot;
    discoverBundled: typeof discoverBundled;
    makeHandler: typeof makeHandler;
    resolveTarget: typeof resolveTarget;
    RANKS: {
        readonly 'project-dsh': 100;
        readonly 'project-agents': 200;
        readonly global: 300;
        readonly 'user-dsh': 400;
        readonly 'user-agents': 500;
        readonly bundled: 600;
    };
    SHADOW_DESC_PREFIX: string;
    SHADOW_STUB_PREFIX: string;
    shadowStubPath: typeof shadowStubPath;
    STATE_PATH: string;
    buildZip: typeof buildZip;
    createMarketplace: typeof createMarketplace;
    ApiError: typeof ApiError;
    NAME_RE: RegExp;
    PROJECT_API_VERSION: number;
    projectConfigPath: typeof projectConfigPath;
    globalConfigPath: typeof globalConfigPath;
    readProjectConfig: typeof readProjectConfig;
    writeProjectConfig: typeof writeProjectConfig;
    readGlobalConfig: typeof readGlobalConfig;
    writeGlobalConfig: typeof writeGlobalConfig;
    validateTagList: typeof validateTagList;
    normalizeTagsMap: typeof normalizeTagsMap;
    normalizePresetsMap: typeof normalizePresetsMap;
    assertPresetName: typeof assertPresetName;
    walkSkillFiles: typeof walkSkillFiles;
    reconcileProject: typeof reconcileProject;
    applySourceSelection: typeof applySourceSelection;
    buildProjectView: typeof buildProjectView;
    buildIdentityCatalog: typeof buildIdentityCatalog;
};
//# sourceMappingURL=index.d.ts.map