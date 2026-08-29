/**
 * dsh-skill-manager — client half (browser bundle).
 * build: 26
 *
 * Served verbatim at /plugins/dsh-skill-manager/client.js by the client
 * module system; a classic script that registers its lazy-CJS factory on
 * window.__ModuleLoader__. The factory requires only shell seed words
 * (react, @deepseek-ai/dsh-client-ui-primitives) and contributes the SKILL
 * page to the `extension.manager.section` Slot owned by
 * dsh-extension-manager.
 *
 * build 26: remove the obsolete apiVersion <6 fallback page and its package /
 * legacy list UI. The current project center is the only Client page; an old
 * Host now gets a clear upgrade state while the Host API keeps its legacy
 * operations for wire compatibility.
 * build 13 (DSH-008): project-management UI adds a persistent project
 * context card, per-state counts/grouping, select-visible bulk actions,
 * current-workspace-safe defaults, derived drawer/tag state, responsive
 * drawer behavior, and accessible switch/radio/detail controls. The SKILL
 * management view is served by the host's apiVersion 6
 * ops (catalog / setEnabled / setMany / setSource / setTags / presets.* /
 * slim.*): project selector over DSH workspaces, per-project enable
 * state, merged same-name identities with source selection, global tags,
 * presets with replace/merge preview, and 一键精简. When the running host
 * predates apiVersion 6, the page shows an explicit upgrade state.
 * build 17: the project list no longer regroups rows by enabled state.
 * Catalog order and scroll context stay stable while the switch and optional
 * state filters communicate enabled status.
 * build 18: the redundant unified-library sub-page is removed; merged source
 * selection remains in the project Skill drawer. The drawer now overlays the
 * list at every desktop width without reflowing it, and the SKILL / MCP /
 * Plugin navigation can collapse to an icon rail with browser-local state.
 * build 19: visual-noise reduction compresses project context and navigation,
 * moves presets and infrequent batch actions into menus, shows only the first
 * description sentence in stable catalog rows, and defers source choices and
 * technical metadata inside the overlay drawer until explicitly requested.
 * build 20: a single toggle updates its row and project count immediately,
 * shows a quiet pending label while persistence finishes, and restores the
 * exact previous row if the Host rejects or rolls back the mutation.
 * build 21: enabled rows no longer receive a persistent blue background tint;
 * the switch remains the sole inline enabled-state accent.
 * build 21: the first catalog load gets a centered Skill scan state with a
 * restrained pulse/sweep animation, descriptive status copy, and a
 * prefers-reduced-motion static fallback.
 * build 22: the generic sidebar entry, full-page shell, and MCP / Plugin
 * placeholders move to dsh-extension-manager. This plugin now owns only the
 * SKILL section and its `/api/skill-manager` business API.
 * build 24: the Skill section adopts the MCP / Plugin page chrome: a 980px
 * centered frame, shared title and tab rhythm, compact project summary and
 * toolbar, flat 72px list rows, and fixed 400px detail drawers.
 * build 25: arbitrary public GitHub repository install with Host-side
 * discovery/preview/provenance, plus explicit install-vs-runtime safety copy.
 *
 * TypeScript source compiled to a classic browser script — no JSX/imports.
 */
type DynamicValue = any;
type ApiPayload = Record<string, DynamicValue>;
//# sourceMappingURL=client.d.ts.map