/** Skill-name grammar: kebab-case (same as the legacy plugin). */
export declare const NAME_RE: RegExp;
/** Project config schema/apiVersion for V1. */
export declare const PROJECT_API_VERSION = 6;
/** Global config schema marker. */
export declare const GLOBAL_SCHEMA = "dsh-skill-manager/global";
export declare const PROJECT_SCHEMA = "dsh-skill-manager/project";
/** Tag constraints (V1): 1–32 chars, max 20 per skill identity. */
export declare const TAG_MAX_LENGTH = 32;
export declare const TAGS_PER_SKILL_MAX = 20;
export type UnknownRecord = Record<string, unknown>;
export interface SkillStateOptions {
    home?: string;
    faults?: {
        beforeProjectConfigWrite?(context: {
            path: string;
            config: UnknownRecord;
        }): Promise<void> | void;
    };
}
export interface SourceSelection extends UnknownRecord {
    source?: string;
    contentHash?: string;
    originHash?: string;
    copyHash?: string;
    generated?: boolean;
    /** Project-local provenance for a Skill installed from the curated market. */
    marketManaged?: boolean;
    marketId?: string;
    marketRepository?: string;
    marketPath?: string;
    marketRef?: string;
    marketRevision?: string | null;
    marketHash?: string;
}
export interface ProjectConfig extends UnknownRecord {
    schema: string;
    apiVersion: number;
    projectRoot: string;
    enabled: string[];
    sources: Record<string, SourceSelection>;
    appliedPreset: string | null;
    updatedAt: string;
}
export interface SkillPresetSelection {
    source?: string;
}
export interface SkillPreset {
    name: string;
    description?: string;
    defaultSlim: boolean;
    skills: Record<string, SkillPresetSelection>;
    updatedAt?: string;
}
export interface GlobalConfig extends UnknownRecord {
    schema: string;
    apiVersion: number;
    globalDefaultOff: boolean;
    tags: Record<string, string[]>;
    presets: Record<string, SkillPreset>;
}
export interface ProjectConfigReadResult {
    config: ProjectConfig;
    path: string;
    existed: boolean;
    corrupt: boolean;
    future: boolean;
    raw: UnknownRecord | undefined;
}
export interface GlobalConfigReadResult {
    config: GlobalConfig;
    path: string;
    existed: boolean;
    corrupt: boolean;
    future: boolean;
    raw: UnknownRecord;
}
type LedgerAction = () => Promise<void> | void;
export interface MutationLedger {
    record(undo?: LedgerAction, cleanup?: LedgerAction): void;
    commit(): Promise<string[]>;
    rollback(): Promise<string[]>;
}
export declare class ApiError extends Error {
    readonly status: number;
    constructor(status: number, message: string);
}
/**
 * Mirror of dsh-skill-filesystem's findProjectRoot: walk up from cwd looking
 * for a `.git` marker; when none exists, fall back to cwd itself.
 * @param cwd - absolute workspace directory.
 * @returns the project root DSH actually scans for project-level skills.
 */
export declare function findProjectRoot(cwd: string): Promise<string>;
/** Validate a cwd argument; undefined/null/'' stays undefined. */
export declare function assertCwd(cwd: unknown): Promise<string | undefined>;
/**
 * Absolute, canonical path for the project config file. Containment: the
 * file must sit exactly one level below the project root's .dsh directory.
 * @param projectRoot - resolved project root.
 */
export declare function projectConfigPath(projectRoot: string): string;
/** Absolute, canonical path for the global config file. */
export declare function globalConfigPath(opts?: SkillStateOptions): string;
/** Atomic write: tmp file in the same directory, then rename over the target. */
export declare function atomicWriteFile(path: string, content: string): Promise<void>;
/**
 * Per-canonical-config-path serialization (review P1-1): one mutation queue
 * per key, so a read -> compute -> write -> reconcile transaction never
 * interleaves with another mutation of the same config. A rejecting task
 * still releases the queue and its rejection propagates to the caller.
 * @param key - stable lock key (projectLockKey / globalLockKey).
 * @param task - async unit of work.
 * @returns the resolved value of `task`.
 */
export declare function withConfigLock<T>(key: string, task: () => Promise<T>): Promise<T>;
/** Lock key for one project config, its canonical file path. */
export declare function projectLockKey(projectRoot: string): string;
/** Lock key for the global config, its canonical file path. */
export declare function globalLockKey(opts?: SkillStateOptions): string;
/**
 * Transaction ledger for derived-artifact file ops (review P1-4): a mutation
 * plans, records undo + cleanup per file change, then commits (config persisted)
 * or rolls back (config write failed), so a failure never leaves an unregistered
 * copy shadowing other sources or loses a verified copy.
 * @param returns { record(undo, cleanup), commit(), rollback() } - undo reverts
 *   one file change, cleanup removes its backup; commit runs the cleanups,
 *   rollback runs the undos (reverse order) then the cleanups of the reverted
 *   changes, returning the rollback failure messages.
 */
export declare function createLedger(): MutationLedger;
/**
 * Read the project config.
 * @returns { config, path, existed, corrupt, future, raw } — corrupt files
 *   degrade to a VISIBLE empty config (configCorrupt in the view); no mutation
 *   overwrites one (review P2-2). `future` flags a stored apiVersion newer than
 *   PROJECT_API_VERSION: reads still normalize, writes refuse (P2-1). `raw`
 *   is the on-disk object callers pass back to writeProjectConfig so unknown
 *   fields survive the write (P2-1); undefined makes the write re-read.
 */
export declare function readProjectConfig(projectRoot: string, _opts?: SkillStateOptions): Promise<ProjectConfigReadResult>;
/** Write the project config (atomic). Rejects when the root is not writable. */
export declare function writeProjectConfig(projectRoot: string, config: unknown, opts?: SkillStateOptions, raw?: UnknownRecord): Promise<ProjectConfig>;
/** The fresh-project default: no non-required skill enters the model catalog. */
export declare function emptyProjectConfig(projectRoot?: string): ProjectConfig;
/** Coerce a parsed JSON value into a well-formed project config (tolerant). */
export declare function normalizeProjectConfig(parsed: unknown, projectRoot: string): ProjectConfig;
export declare function migrateProjectConfig(parsed: unknown, projectRoot: string): ProjectConfig;
/**
 * Read the global config. Unknown top-level fields (including the legacy
 * globalDefaultOff) are preserved on write for compatibility.
 * @returns { config, path, existed, raw } — raw carries the unknown fields.
 */
export declare function readGlobalConfig(opts?: SkillStateOptions): Promise<GlobalConfigReadResult>;
/** Merge-patch the global config (atomic; preserves unknown fields). */
export declare function writeGlobalConfig(patch: UnknownRecord, opts?: SkillStateOptions): Promise<GlobalConfig>;
/** { skillName: string[] } with per-tag validation (invalid entries dropped). */
export declare function normalizeTagsMap(input: unknown): Record<string, string[]>;
/**
 * Validate a tag list: strings, trimmed, non-empty, ≤32 chars, de-duplicated
 * case-insensitively, ≤20 total. Invalid entries are dropped, not fatal.
 */
export declare function validateTagList(tags: unknown): string[];
/**
 * Normalize the presets map: { name: { name, description?, defaultSlim?,
 * skills: { [skillName]: { source? } }, updatedAt? } }.
 * Only skill identity + chosen generic source are stored — never versions,
 * never project-specialized content (handoff §4.2).
 */
export declare function normalizePresetsMap(input: unknown): Record<string, SkillPreset>;
/** Preset name validation (shared by read/write ops). */
export declare function assertPresetName(name: unknown): string;
/** sha256 hex of a Buffer/Uint8Array (raw bytes) or a string (utf8, legacy digest). */
export declare function sha256Hex(data: string | NodeJS.TypedArray | DataView): string;
/**
 * Content hash of one skill source: flat files hash their own text;
 * directory bundles hash every file (stable sorted walk, `rel=hex` lines).
 * This is the "content unchanged" marker half for generated copies.
 * @param path - SKILL.md path (dir bundle) or flat .md path.
 * @param format - 'dir' | 'flat'.
 */
export declare function hashSkillSource(path: string, format: 'dir' | 'flat'): Promise<string>;
export {};
//# sourceMappingURL=state.d.ts.map