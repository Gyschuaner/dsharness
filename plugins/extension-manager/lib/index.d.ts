/**
 * dsh-extension-manager — host half (no-op, DSH-006).
 *
 * The plugin owns only the Web client composition shell. Feature plugins
 * contribute pages through the `extension.manager.section` client Slot.
 */
declare const name = "extension-manager";
declare const inject: readonly string[];
declare function apply(): void;
export { name, inject, apply };
//# sourceMappingURL=index.d.ts.map