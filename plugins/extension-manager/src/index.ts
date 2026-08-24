/**
 * dsh-extension-manager — host half (no-op, DSH-006).
 *
 * The plugin owns only the Web client composition shell. Feature plugins
 * contribute pages through the `extension.manager.section` client Slot.
 */
const name = 'extension-manager';
const inject: readonly string[] = [];

function apply() {}

export { name, inject, apply };
