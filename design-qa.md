# Skill Manager build 13–14 · Design QA

## Inputs

- Design direction: `C:\Users\chuansgu\.codex\generated_images\01a02d80-ab9f-7f10-ae90-23b61ac6563f\exec-e5faaeff-f5b3-48c2-9485-b1badad119f5.png`
- Desktop implementation: `C:\Users\chuansgu\.codex\visualizations\2026\08\23\01a02d80-ab9f-7f10-ae90-23b61ac6563f\skill-manager-build13\skill-manager-compare-state.png`
- Side-by-side comparison: `C:\Users\chuansgu\.codex\visualizations\2026\08\23\01a02d80-ab9f-7f10-ae90-23b61ac6563f\skill-manager-build13\design-comparison.png`
- Responsive evidence: `skill-manager-760.png`, `skill-manager-600.png`, `skill-manager-600-drawer.png`, `skill-manager-375-final.png` in the same QA directory.

## State and viewport

- Desktop: 1253 × 945 CSS px, DPR 1.5, real `dsharness` catalog, 11/68 enabled, three selected rows and the bulk action bar visible.
- Tablet: 760 × 900 CSS px, real catalog, project card and toolbar wrapped.
- Narrow: 600 × 900 CSS px, navigation hidden and detail drawer overlaid.
- Phone: 375 × 812 CSS px, navigation and top subtitle hidden, no horizontal overflow.
- The generated direction used illustrative 12/68 data. The implementation evidence uses the real 11/68 project state and longer real-world descriptions; this content difference is intentional.

## Comparison history

1. **P1 · behavior/layout** — opening a row deep in a long list let the outer page scroll, which moved the detail drawer header above the viewport and hid the sticky bulk bar. Fixed by constraining the Skill center to the available height and making the list the scrolling surface.
2. **P1 · responsive desktop** — opening the drawer compressed the project name and path to a few characters. Fixed with a drawer-aware wrapping layout for project identity, counts, and actions.
3. **P2 · phone typography** — at 375 px the top subtitle forced “扩展” onto two lines. Fixed by hiding the secondary subtitle below 480 px and keeping the title on one line.

## Final assessment

- Layout and spacing preserve the selected direction: project context first, counted filters, enabled/disabled groups, per-row switches, and a persistent bulk action surface.
- Typography and colors use the existing DSH token system and remain legible with long Chinese and English descriptions.
- All visible controls use existing Cordis/DSH icon components; no placeholder image or custom decorative asset was introduced.
- Switches, selection controls, detail buttons, source choices, and dialogs expose semantic roles and labels. Keyboard focus styles remain visible.
- Tablet, narrow, and phone checks show no overlap or horizontal overflow. The drawer remains usable at 600 px and becomes full-width inside the content area at phone width.
- The implementation intentionally keeps preset actions in the project card instead of the generated direction's separate toolbar row, reducing vertical travel while preserving the same hierarchy and functionality.

final result: passed

## Build 14 interaction clarification

- The default project list now exposes only the per-Skill enable/disable switch. Selection checkboxes and “select all” are absent, so the row has one clear state-changing control.
- An explicit **批量管理** action enters batch mode. In that mode, row checkboxes, “全选当前结果”, and the fixed batch action bar appear while per-Skill switches are hidden; **完成** exits without changing state.
- Successful bulk enable/disable, project switching, preset application, and slim preset application all clear the selection and return to the default single-item mode.
- The native detail button handles mouse click, Enter, and Space consistently and keeps its visible keyboard focus style.
- In-app browser write regression on `127.0.0.1:3080`: `game` 0/68 → single 1/68 → restored 0/68 → bulk 2/68 → restored 0/68; `dsharness` remained 11/68 with both Cordis Skills enabled. The generated `game/.dsh/skill-manager.json` was removed after the test, restoring the initial absent-file state.
- Visual review at the normal desktop viewport confirmed that default and batch controls are mutually exclusive, the batch-mode hint is visible, row alignment is stable, and no error/warning console entries were produced.

build 14 result: passed
