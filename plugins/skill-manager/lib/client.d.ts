/**
 * dsh-skill-manager — client half (browser bundle).
 * build: 23
 *
 * Served verbatim at /plugins/dsh-skill-manager/client.js by the client
 * module system; a classic script that registers its lazy-CJS factory on
 * window.__ModuleLoader__. The factory requires only shell seed words
 * (react, @deepseek-ai/dsh-client-ui-primitives) and contributes the SKILL
 * page to the `extension.manager.section` Slot owned by
 * dsh-extension-manager.
 *
 * build 3: skill packages — skills sharing a prefix (first hyphen part)
 * with 3+ members collapse into one package row (default folded, per-root
 * state in localStorage), with editable display label, batch delete, and
 * batch export to a single ZIP (host op `exportZip`).
 * build 5: per-project enable/disable — a small switch on every skill row.
 * Toggling writes either the skill's own frontmatter flag (project-local
 * skills) or a project-level shadow switch file (user/bundled skills), so
 * only this project's sessions are affected (host op `setStatus`, needs a
 * dsh web restart until the running host loads apiVersion 4; switches are
 * greyed out with an explanation until then).
 * build 6: global default-off policy (host apiVersion 5) — a page-level
 * master switch that flags every user-root skill (bundled built-ins and
 * external global roots untouched); while on, enabling a user skill in a
 * project creates a project-local copy. Marker switch-file rows are hidden
 * by default, counted in the project section header, and revealed by
 * search. Toggling switches no longer flashes a toast.
 * build 7: state clarity — disabled rows are dimmed with a solid amber
 * 「已禁用」 badge; a 全部/已启用/已禁用 filter sits in the toolbar
 * (the 已禁用 filter also reveals marker switch files, which stay hidden
 * by default); marker switch files no longer leak into package groups.
 * build 8: in-place editing removed (detail view is read-only now; the
 * host `save` op stays available but has no UI entry) and the 只读 /
 * 被 … 遮蔽 badges are dropped — the dimmed state already tells the
 * story.
 * build 9: packages stand out — brand-tinted background (color-mix,
 * fallback for old engines), 3px brand accent bar on the left, a small
 * crate icon; and within each root section package rows are sorted to
 * the top (standalone rows follow, both keeping relative order).
 * build 10: the brand token in this theme is a near-black bluish gray,
 * so the tint read as plain gray — switch to the theme's real blue
 * scale (--dsw-static-blue-500), raise the tint to 10%, and redraw the
 * icon as an outlined box with a lid line.
 * build 13 (DSH-008): project-management UI adds a persistent project
 * context card, per-state counts/grouping, select-visible bulk actions,
 * current-workspace-safe defaults, derived drawer/tag state, responsive
 * drawer behavior, and accessible switch/radio/detail controls. The SKILL
 * management view is served by the host's apiVersion 6
 * ops (catalog / setEnabled / setMany / setSource / setTags / presets.* /
 * slim.*): project selector over DSH workspaces, per-project enable
 * state, merged same-name identities with source selection, global tags,
 * presets with replace/merge preview, and 一键精简. When the running host
 * predates apiVersion 6 (unknown `catalog` op), the page degrades to the
 * legacy section above with a notice.
 * build 17: the project list no longer regroups rows by enabled state.
 * Catalog order and scroll context stay stable while a soft blue row tint,
 * the switch, and the optional state filters communicate enabled status.
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
 * build 21: the first catalog load gets a centered Skill scan state with a
 * restrained pulse/sweep animation, descriptive status copy, and a
 * prefers-reduced-motion static fallback.
 * build 22: the generic sidebar entry, full-page shell, and MCP / Plugin
 * placeholders move to dsh-extension-manager. This plugin now owns only the
 * SKILL section and its `/api/skill-manager` business API.
 *
 * TypeScript source compiled to a classic browser script — no JSX/imports.
 */
type DynamicValue = any;
type ApiPayload = Record<string, DynamicValue>;
interface HostClientApi {
    call(op: string, payload: ApiPayload): Promise<DynamicValue>;
    zip(rootId: string, names: string[]): Promise<string>;
}
interface SectionProps {
    api: HostClientApi;
    ctx?: ClientContext;
}
//# sourceMappingURL=client.d.ts.map