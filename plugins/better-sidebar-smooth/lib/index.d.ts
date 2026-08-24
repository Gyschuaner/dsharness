/**
 * dsh-better-sidebar-smooth — host half (no-op).
 *
 * All of this plugin's behavior lives in the client half (lib/client.js),
 * which injects a single CSS rule. The host entry exists only so the
 * package can be mounted as a profile tree entry (cordis entries resolve
 * to an importable module).
 */
declare const name = "better-sidebar-smooth";
declare const inject: readonly string[];
declare function apply(): void;
export { name, inject, apply };
//# sourceMappingURL=index.d.ts.map