import { type MutationLedger, type ProjectConfig, type SkillStateOptions, type UnknownRecord } from './state.js';
export type SkillFormat = 'flat' | 'dir';
export type SkillScope = 'project' | 'global' | 'user' | 'bundled';
interface AgentPresetsService {
    list(): Promise<unknown[]>;
}
interface CatalogFaults {
    beforeCopySwap?(context: UnknownRecord): Promise<void> | void;
    afterSourcePrecheck?(context: UnknownRecord): Promise<void> | void;
}
export interface CatalogOptions extends Omit<SkillStateOptions, 'faults'> {
    home?: string;
    agentPresets?: AgentPresetsService;
    logger?: {
        warn?(message: string): void;
    };
    faults?: SkillStateOptions['faults'] & CatalogFaults;
}
export interface SkillFile {
    name: string;
    title: string;
    path: string;
    format: SkillFormat;
    mtimeMs: number;
    description: string;
    whenToUse?: string;
    modelInvocable?: boolean;
    broken?: string;
    readOnly: boolean;
    isShadow?: boolean;
}
export interface SkillRoot {
    id: string;
    scope: Exclude<SkillScope, 'bundled'>;
    label: string;
    dir: string;
    rank: number;
}
export interface BundledGroup {
    presetId: string;
    label: string;
    skills: SkillFile[];
}
export interface SkillSource extends UnknownRecord {
    key: string;
    label: string;
    scope: SkillScope;
    rank: number;
    format: SkillFormat;
    path: string;
    description: string;
    whenToUse?: string;
    modelInvocable: boolean;
    mtimeMs: number;
    broken?: string;
    files: string[];
    readOnly?: boolean;
    generated: boolean;
    modified: boolean;
    stale: boolean;
    shadow: boolean;
}
interface IdentityV1 {
    description: string;
    whenToUse?: string;
    tags: string[];
    defaultSourceKey: string | null;
    sourceKey: string | null;
    effectiveSourceKey: string | null;
    specialized: boolean;
    mechanism: 'self' | 'copy' | 'original';
    enabled: boolean;
    modelInvocable: boolean;
    updateInfo: null;
}
export interface SkillIdentity {
    name: string;
    sources: SkillSource[];
    v1?: IdentityV1;
}
export interface ReconcileReport {
    created: string[];
    removed: string[];
    rewritten: string[];
    conflicts: Array<{
        name: string;
        message: string;
    }>;
    failed: Array<{
        name: string;
        error: string;
    }>;
}
export interface ProjectView {
    apiVersion: number;
    projectRoot: string | null;
    identities: ProjectIdentityRow[];
    configExisted: boolean;
    configCorrupt: boolean;
    configFuture: boolean;
}
export interface ProjectIdentityRow extends UnknownRecord {
    name: string;
    description: string;
    whenToUse?: string;
    tags: string[];
    sources: Array<UnknownRecord & {
        key: string;
        modelInvocable: boolean;
        mtimeMs: number;
    }>;
    defaultSourceKey: string | null;
    sourceKey: string | null;
    effectiveSourceKey: string | null;
    specialized: boolean;
    enabled: boolean;
    modelInvocable: boolean;
    updateInfo: null;
}
interface CopySourcePlan {
    path: string;
    format: SkillFormat;
}
interface ReconcileOptions {
    sweepOrphans?: boolean;
}
/** Precedence ranks mirroring dsh-skill-filesystem (lower wins). */
export declare const RANKS: {
    readonly 'project-dsh': 100;
    readonly 'project-agents': 200;
    readonly global: 300;
    readonly 'user-dsh': 400;
    readonly 'user-agents': 500;
    readonly bundled: 600;
};
/** Description prefix marking switch stubs we generated; never delete files without it. */
export declare const SHADOW_DESC_PREFIX = "[skill-manager] \u672C\u9879\u76EE\u7981\u7528\u5F00\u5173";
/**
 * Validate and parse one skill file's raw content.
 * @param raw - full file text (frontmatter + body).
 * @returns { name, description, whenToUse, disableModelInvocation, body }
 * @throws ApiError(400) with a user-facing reason.
 */
export declare function parseSkill(raw: string): {
    name: string;
    description: string;
    whenToUse?: string;
    disableModelInvocation?: boolean;
    body: string;
};
/**
 * Toggle the `disable-model-invocation` frontmatter flag of one skill file
 * without touching any other byte (EOL style preserved).
 * @returns { content, changed }
 */
export declare function patchInvocationFlag(raw: string, setTrue: boolean): {
    content: string;
    changed: boolean;
};
/** Whether a file is a switch stub we generated (marker in its description). */
export declare function isShadowFile(path: string): Promise<boolean>;
/** Body of a generated marker switch stub. */
export declare function markerContent(name: string, projectRoot: string): string;
/**
 * Reserved flat-filename prefix for generated marker switch stubs
 * (review P2-4): DSH resolves flat skills by their frontmatter name, so the
 * file name itself is free to reserve. This distinguishes the rebuildable,
 * gitignored generated stub from a hand-written project skill that a
 * `.dsh/skills/<name>.md` alone cannot, and is the precise ignore pattern
 * in .gitignore. The frontmatter name stays the shadowed skill name.
 */
export declare const SHADOW_STUB_PREFIX = "__smgr-shadow-";
/** Marker switch stub location (reserved prefix, review P2-4). */
export declare function shadowStubPath(projectRoot: string, name: string): string;
/**
 * Build the managed skill roots for one workspace.
 * @returns { roots, projectRoot }
 */
export declare function computeRoots(cwd?: string | null, opts?: CatalogOptions): Promise<{
    roots: SkillRoot[];
    projectRoot: string | null;
}>;
/**
 * Discover skills in one root directory (directory bundles + flat .md).
 * @returns { exists, skills }
 */
export declare function discoverInRoot(dir: string): Promise<{
    exists: boolean;
    skills: SkillFile[];
}>;
/**
 * Discover read-only skills bundled in every known agent preset.
 * @returns [{ presetId, label, skills }]
 */
export declare function discoverBundled(agentPresets?: AgentPresetsService, _opts?: CatalogOptions): Promise<BundledGroup[]>;
/** Recursively list the regular files under one skill directory (safe walk). */
export declare function walkSkillFiles(dir: string): Promise<string[]>;
/**
 * Reproduces the pre-raw-byte digest exactly (review P1-3): sha256 over the
 * utf8 text, no file length, `rel=<utf8hex>` lines, so a registration written
 * before that upgrade verifies as unmodified instead of reading as modified.
 */
export declare function hashSkillSourceLegacy(path: string, format: SkillFormat): Promise<string>;
/**
 * Whether the stored digest (new raw-byte form or legacy utf8-text form, review
 * P1-3) matches `current`.
 */
export declare function hashMatches(stored: unknown, path: string, format: SkillFormat, current: string): Promise<boolean>;
/**
 * Copy one source skill into <projectRoot>/.dsh/skills (flat file or full
 * directory bundle), with the invocation flag set to the project's desired
 * state. Bounded at 50MB. Returns the destination SKILL.md path.
 */
export declare function copySkillToProject(projectRoot: string, name: string, sourcePlan: CopySourcePlan, flagSetTrue: boolean, opts?: CatalogOptions, ledger?: MutationLedger): Promise<string>;
/**
 * Build the merged identity catalog for one project context.
 * @param cwd - resolved workspace cwd, or undefined (no project roots).
 * @param opts - { agentPresets, home }.
 * @param config - optional project config; registers generated copies so
 *   project-scope sources are flagged `generated` during the scan (the
 *   reconcile pass classifies mechanisms from this flag).
 * @returns { identities: Map<name, identity>, projectRoot, roots, bundled }
 */
export declare function buildIdentityCatalog(cwd?: string | null, opts?: CatalogOptions, config?: ProjectConfig): Promise<{
    identities: Map<string, SkillIdentity>;
    projectRoot: string | null;
    roots: SkillRoot[];
    bundled: BundledGroup[];
}>;
/**
 * Reconcile one project: materialize/clean derived artifacts so the on-disk
 * state matches the project config. Idempotent; per-file failures are
 * collected, never fatal.
 *
 * @returns report { created: [path], removed: [path], rewritten: [path],
 *   conflicts: [{name, message}], failed: [{name, error}] }
 */
export declare function reconcileProject(projectRoot: string, projectConfig: ProjectConfig, identities: Map<string, SkillIdentity>, opts?: CatalogOptions, logger?: CatalogOptions['logger'], ledger?: MutationLedger, reconcileOptions?: ReconcileOptions): Promise<ReconcileReport>;
/**
 * Ensure a managed copy of `sourceKey` exists in the project, applying the
 * safety rules: never clobber a real project skill, never overwrite a
 * user-modified copy, verify content hashes before removing/replacing an
 * existing managed copy.
 * @param recordSource - false for default materialization: the copy is a
 *   derivative of the product default and must NOT be recorded as an
 *   explicit source selection (sourceKey stays null in the UI).
 * @returns { copyCreated, copyPath }
 * @throws ApiError(409/404) on conflicts.
 */
export declare function ensureManagedCopy(projectRoot: string, projectConfig: ProjectConfig, identity: SkillIdentity, sourceKey: string, flagSetTrue: boolean, opts: CatalogOptions | undefined, report: ReconcileReport, recordSource?: boolean, ledger?: MutationLedger): Promise<{
    copyCreated: boolean;
    copyPath: string;
}>;
/**
 * Apply an explicit source selection: record it, and materialize (or
 * refresh) the managed copy when the selected source would not win DSH's
 * rank resolution on its own.
 * @returns { changed, copyCreated, report }
 * @throws ApiError(409) on conflicts (real project skill, modified copy,
 *   broken selection).
 */
export declare function applySourceSelection(projectRoot: string, projectConfig: ProjectConfig, identity: SkillIdentity, sourceKey: string | null, opts?: CatalogOptions, _logger?: CatalogOptions['logger'], ledger?: MutationLedger): Promise<{
    changed: boolean;
    copyCreated: boolean;
    report: ReconcileReport;
}>;
/**
 * Annotate identities with V1 fields (tags, enabled state, generated/
 * modified/stale source marks, effective-source resolution) and run the
 * idempotent reconcile for the project.
 *
 * @param cwd - resolved workspace cwd (or null when there is none).
 * @param opts - { agentPresets, home, logger }.
 * @returns { view, config, report } — view is a plain-JSON-safe project
 *   catalog; config/report are for persistence and the API response.
 */
export declare function buildProjectView(cwd?: string | null, opts?: CatalogOptions): Promise<{
    view: ProjectView;
    config: ProjectConfig;
    report: ReconcileReport;
    identities: Map<string, SkillIdentity>;
    raw: UnknownRecord | undefined;
}>;
export {};
//# sourceMappingURL=catalog.d.ts.map