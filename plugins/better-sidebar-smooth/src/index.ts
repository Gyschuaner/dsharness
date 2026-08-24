/**
 * dsh-better-sidebar-smooth — host half (no-op).
 *
 * All of this plugin's behavior lives in the client half (lib/client.js),
 * which injects a single CSS rule. The host entry exists only so the
 * package can be mounted as a profile tree entry (cordis entries resolve
 * to an importable module).
 */
const name = 'better-sidebar-smooth';
const inject: readonly string[] = [];

function apply() {}

export { name, inject, apply };
