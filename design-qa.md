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

---

# DSH-035 compact extension context and Billing copy QA

## Inputs and evidence

- User Skill target: `C:\Users\chuansgu\AppData\Local\Temp\codex-clipboard-c3023c76-2cbb-408b-ab04-4e90cc200366.png`
- User Billing target: `C:\Users\chuansgu\AppData\Local\Temp\codex-clipboard-5aa67e9f-706d-4108-ab6b-30659e9c840c.png`
- Browser captures: `artifacts/design-qa/DSH-035/skill-compact-context.png`, `mcp-clean-header.png`,
  `plugin-clean-header.png`, `billing-dashboard.png`, `billing-settings-qwen-pricing.png`
- Responsive capture: `artifacts/design-qa/DSH-035/skill-compact-context-680.png`
- Same-input comparisons: `artifacts/design-qa/DSH-035/comparison-skill.png` and
  `artifacts/design-qa/DSH-035/comparison-billing.png`
- Enabled-row follow-up target: `C:\Users\chuansgu\AppData\Local\Temp\codex-clipboard-a5e88682-8827-4644-a771-172c96b0f7dc.png`
- Enabled-row browser capture: `artifacts/design-qa/DSH-035/skill-enabled-white-rows.png`
- Enabled-row same-input comparison: `artifacts/design-qa/DSH-035/comparison-skill-enabled-background.png`

## Findings

- The repeated `Web 配置` label is absent from Skill, MCP, and Plugin. MCP also no longer repeats
  `当前配置 web · 已连接 …` above the counted filters.
- Skill project identity, enabled count, project switcher, and preset actions now occupy one compact
  upper-right group. Both menus expose semantic `menu`/`menuitem` roles; Escape closes the inner menu
  without closing Extensions.
- At 680 × 900, the page reports `scrollWidth === clientWidth === 680`; the project group wraps above
  the tabs and the toolbar wraps without overlap or horizontal clipping.
- Billing no longer shows `影子计费，非真实账单` below the total. The exact
  `Qwen3.8-Flash-Next-FP8` name and Qwen brand icon remain visible, historical Qwen usage now has a
  non-zero estimate, and Settings exposes the official fixed ¥1 / ¥0.1 / ¥3 price table.
- The final interaction pass produced no new browser error or warning after the QA cutoff. Connection
  messages captured at the restart timestamp were transient startup recovery logs and did not recur.
- Follow-up comparison treats the user screenshot as the undesirable starting state and the user request
  as the target direction. At a 1234 × 945 CSS viewport (DPR 1.5), all 11 enabled rows report transparent
  background, no background image, and no box shadow; enabled switches remain blue (`rgb(65, 118, 230)`).
  The page has no horizontal overflow, and switching `已启用 11` → `全部 68` preserves the expected counts.

## Enabled-row follow-up fidelity surfaces

- Fonts and typography: unchanged from the verified compact Skill page; row names and descriptions retain
  the same weights, line heights, truncation, and hierarchy.
- Spacing and layout rhythm: row height, padding, separators, toolbar geometry, and switch alignment are
  unchanged; only the persistent enabled-row fill was removed.
- Colors and visual tokens: enabled rows now inherit the neutral page background. The existing blue switch
  remains the only inline enabled-state accent; hover and opened-detail states use the shared neutral tokens.
- Image quality and asset fidelity: no image or icon asset changed. Existing DSH primitive icons and native
  switches remain intact.
- Copy and content: Skill names, descriptions, source badges, counts, filters, and accessible labels are
  unchanged.

## Enabled-row follow-up comparison history

1. The source screenshot showed a P2 visual-noise issue: every enabled row carried a full-width blue-gray
   fill, which overwhelmed the list and duplicated the blue switch's state signal.
2. Removed all `.sk-rowEnabled` background overrides from both base and shared-shell styles. The post-fix
   same-input comparison shows white/transparent rows with unchanged separators and blue switches; no
   actionable P0/P1/P2 difference remains.

No actionable P0/P1/P2 difference remains in the target regions.

final result: passed

---

# Skill Manager build 19 · Visual-noise reduction QA

## Inputs

- Selected Product Design reference: `C:\Users\chuansgu\.codex\generated_images\01a02d80-ab9f-7f10-ae90-23b61ac6563f\exec-2d3c5cc1-c738-4076-84b9-01512deec2b5.png`
- Browser-rendered list: `D:\Pythonproject\dsharness\artifacts\design-qa\skill-manager-build19\01-list-denoised.png`
- Browser-rendered drawer: `D:\Pythonproject\dsharness\artifacts\design-qa\skill-manager-build19\02-drawer-denoised.png`
- Browser-rendered collapsed navigation: `D:\Pythonproject\dsharness\artifacts\design-qa\skill-manager-build19\03-nav-collapsed.png`
- Equal-size side-by-side comparison (reference left, implementation right): `D:\Pythonproject\dsharness\artifacts\design-qa\skill-manager-build19\04-reference-vs-implementation.png`
- Local implementation URL: `http://127.0.0.1:3080/`

## State and geometry

- In-app Browser viewport and implementation captures: 1252 × 945 CSS px. The selected 1443 × 1090 reference was normalized to the same 1252 × 945 size only for the side-by-side comparison.
- Real project: `game`, 68 catalog identities, 11 enabled. Browser QA did not toggle a real Skill, change its source, add a tag, or apply a preset.
- Expanded extension navigation is 156px; collapsed navigation is 64px. No `.ext-navDesc` nodes remain, while official icons, accessible names, construction state, titles, and persisted collapse behavior remain.
- Before and after opening `cordis-plugin-development`, the list column remains x=176px and 1057.33px wide. The overlay drawer is 400.67px wide and does not alter list geometry.

## Comparison history

1. **P2 · repeated information** — the first implementation pass retained a footer that repeated the already-visible 11/68 project count. Removed the footer; project scope and technical configuration remain available in context or in the drawer's on-demand information.
2. **P2 · tag-editor density** — the first comparison showed an always-open input panel where the selected direction used a quiet add affordance. Changed the default to existing tag chips plus `添加标签`; the validated input, character limit, duplicate protection, Enter action, and remove controls appear only after expansion.
3. **P2 · state emphasis** — the active extension destination and enabled switches were too close to neutral gray. Reused the existing blue token for a soft active-nav fill, enabled switches, row tint, and keyboard focus without introducing new colors or custom assets.

## Final assessment

- The page matches the selected hierarchy: compact extension header, slim navigation, one-line project context, wide search, counted state filters, stable catalog rows, blue enabled state, and a right overlay drawer.
- Catalog rows no longer repeat a generic Skill icon, global tag chips, or a `未启用` badge. They retain the name, only meaningful status/source badges, the description's first sentence, and the single project toggle. Full description text remains unchanged in the drawer.
- Recommended/save preset actions live in one `预设` menu; batch management and one-click slim live in `更多`. Entering bulk mode still reveals checkboxes, hides per-row switches, and preserves the existing bulk action bar.
- Drawer source choices and tag input are collapsed by default. `更改来源`, `添加标签`, and `更多信息` expose the full existing capability without keeping optional or future information in the primary visual layer.
- Keyboard detail access, switch/radio semantics, named dialog, Esc ordering, project switching, and accessible navigation labels remain covered by real-bundle DOM tests.
- No actionable P0/P1/P2 issue remains after the final side-by-side comparison.

final result: passed

---

# Skill Manager build 18 · Single-page navigation and overlay drawer QA

## Inputs

- User-reported fixed extension navigation: `C:\Users\chuansgu\AppData\Local\Temp\codex-clipboard-307115d7-ffd1-4ac7-8052-706fcba6fa6e.png`
- Browser-rendered overlay drawer: `D:\Pythonproject\dsharness\artifacts\design-qa\skill-manager-build18\01-overlay-drawer.png`
- Browser-rendered collapsed navigation: `D:\Pythonproject\dsharness\artifacts\design-qa\skill-manager-build18\02-collapsed-nav.png`
- Local implementation URL: `http://127.0.0.1:3080/`

## Information architecture and layout findings

- The former project-management and unified-library pages both rendered the same merged 68-Skill catalog with the same search and tag controls. Source switching was already available in the project drawer, so the duplicate sub-page tabs were removed without removing merged identities, source badges, source priority, or project-specific selection.
- At the 1252 × 900 browser viewport, the expanded extension navigation is 208px and collapses to a 64px icon rail. The main content grows into the released space; Skill, MCP, and Plugin retain official icons, accessible names, construction status, and collapsed-state titles.
- The detail drawer is a 400px absolute overlay. Before and after opening `cordis-plugin-development`, the Skill list, project card, and toolbar remained 997.33px wide at x=232px. The drawer exposed three source radio options and did not change list geometry or wrapping.

## Primary interactions and accessibility checked

- No project-management/unified-library tablist is rendered; the page enters project management directly.
- Collapse changes the control from `aria-label="收起扩展类型导航"` / `aria-expanded=true` to `aria-label="展开扩展类型导航"` / `aria-expanded=false`.
- Refreshing the DSH page and reopening Extensions preserved the 64px collapsed state; expanding restored 208px. Final browser state was restored to expanded navigation.
- The detail drawer remains a named dialog, its close button and Esc close only the drawer, and the extension page remains open.
- DOM regression covers the single-page structure, absolute drawer CSS, absence of drawer-induced layout classes, official nav icons, tooltips, persistence across remount, and expansion.

## Findings

- No actionable P0/P1/P2 issue remains in this pass. The overlay intentionally has no full-page dim backdrop so users retain list context and can close or switch the selected Skill quickly.
- MCP and Plugin remain explicit construction placeholders; their collapsed icons carry a small neutral status dot and full accessible title rather than showing an unreadable miniature badge.

final result: passed

---

# Skill Manager build 16 · Tag editor Design QA

## Inputs

- Problem-state source capture supplied by the user: `C:\Users\chuansgu\AppData\Local\Temp\codex-clipboard-3264d851-36be-460d-a208-58561bef31de.png`
- Selected Product Design style truth: `C:\Users\chuansgu\.codex\generated_images\01a02d80-ab9f-7f10-ae90-23b61ac6563f\exec-fb66b855-a747-4e1a-ac0a-08707dc3f7cc.png`
- Browser capture before the change: `D:\Pythonproject\dsharness\artifacts\design-qa\skill-tag-editor-before-build16.png`
- Browser capture, empty state: `D:\Pythonproject\dsharness\artifacts\design-qa\skill-tag-editor-empty-build16.png`
- Browser capture, typed state: `D:\Pythonproject\dsharness\artifacts\design-qa\skill-tag-editor-typed-build16.png`
- Local implementation URL: `http://127.0.0.1:3080/`

## State, viewport, and normalization

- User crop: 588 × 354 px showing the original tag control and the adjacent update/specialization sections.
- Style truth: 1487 × 1058 px concept board; it supplies the selected neutral border, compact spacing, persistent-label, and dark-primary-action language rather than an exact tag-editor layout.
- Implementation captures: 1252 × 945 px from a 1253 × 945 CSS px in-app-browser viewport, DPR 1.5. The screenshot API normalizes output to CSS-pixel dimensions, so density resampling was not required.
- State: `game`, 11/68 enabled, `developer-platform-cli` detail drawer, no existing tags. Empty and unsaved `研发` input states were captured; browser QA did not mutate the user's global tags.
- Because the supplied source is a tight crop and the style truth is a concept board, comparison was normalized around the tag region's hierarchy, spacing, tokens, and interaction states rather than absolute page coordinates.

## Full-view comparison evidence

- The style truth, original user crop, and revised typed-state browser capture were opened together in one comparison input at original resolution.
- The original showed two unrelated low-contrast pills with no container, count, keyboard hint, or clear active state. The revised screen groups input and add action inside one 330 px panel, keeps section spacing aligned with the source selector cards above, and preserves the surrounding update/specialization layout.
- The typed state maps to the selected direction's dark primary action; the empty state intentionally returns the add action to a quiet disabled treatment.

## Focused-region comparison evidence

- The user crop is itself the focused region. At original size, labels, borders, button states, helper copy, focus outline, and neighboring-section spacing were readable without an additional crop.
- DOM inspection confirmed `scrollWidth === clientWidth` for the tag panel and a stable 330 px drawer width at the tested viewport.

## Findings

- No actionable P0/P1/P2 issue remains. The editor now communicates one operation, a clear inactive/active primary state, global scope, keyboard behavior, and limits without increasing drawer density.
- [P3] The focus ring is nearly black in this local theme because `--dsw-alias-brand-primary` resolves to the product's dark brand token. It remains visible and consistent with the selected preset controls, so no one-off color override was added.

## Required fidelity surfaces

- Fonts and typography: the native DSH stack, 11–12.5 px detail scale, uppercase section label, helper line, and button weight preserve the drawer's hierarchy without introducing a new font.
- Spacing and layout rhythm: 10 px panel radius, 6–10 px internal spacing, aligned heading metadata, and a single 41 px empty composer replace the former disconnected pills.
- Colors and visual tokens: panel, border, focus, disabled, primary, warning, and text colors use existing `--dsw-alias-*` tokens; there are no hard-coded theme surfaces.
- Image quality and asset fidelity: this component contains no imagery. The remove action reuses the existing Cordis close icon component; no custom SVG, glyph, emoji, or CSS illustration was introduced.
- Copy and content: `标签 / 全局共享`, `输入标签`, `按 Enter 添加`, `0/20`, and `每个最多 32 字符` explain scope, action, and constraints in place.

## Primary interactions and accessibility checked

- Empty input keeps the native add button disabled; typing activates the dark primary action and the panel focus state.
- Input exposes `aria-label="新标签"`, `maxlength=32`, and a described live helper. Remove controls expose per-tag accessible labels and visible keyboard focus.
- Client DOM regression verifies adding a tag, rendering/removing chips, duplicate detection, duplicate Enter suppression, live counters, and global-filter propagation.
- Browser interaction checked focus, typed and cleared states without saving; the final empty state restored correctly, the page and panel had no horizontal overflow, and console inspection returned no entries.

## Comparison history

1. Initial user and browser evidence found a P2 hierarchy/affordance issue: the input and add action appeared as unrelated disabled pills, with no container or behavioral guidance. Fixed by introducing `.sk-tagPanel`, `.sk-tagComposer`, explicit heading metadata, helper/count text, and a token-backed active primary button.
2. Post-fix comparison of the selected style truth, original crop, and revised browser capture found no remaining P0/P1/P2 difference. The near-black focus token remains a P3 theme-system characteristic.

## Implementation checklist

- [x] One grouped tag editor surface
- [x] Existing-tag chips with accessible remove actions
- [x] Empty, focus, typed, duplicate, limit, busy, and disabled states
- [x] Enter-to-add and duplicate-write guard
- [x] DOM regression and in-app-browser visual evidence

final result: passed

## Build 14 interaction clarification

- The default project list now exposes only the per-Skill enable/disable switch. Selection checkboxes and “select all” are absent, so the row has one clear state-changing control.
- An explicit **批量管理** action enters batch mode. In that mode, row checkboxes, “全选当前结果”, and the fixed batch action bar appear while per-Skill switches are hidden; **完成** exits without changing state.
- Successful bulk enable/disable, project switching, preset application, and slim preset application all clear the selection and return to the default single-item mode.
- The native detail button handles mouse click, Enter, and Space consistently and keeps its visible keyboard focus style.
- In-app browser write regression on `127.0.0.1:3080`: `game` 0/68 → single 1/68 → restored 0/68 → bulk 2/68 → restored 0/68; `dsharness` remained 11/68 with both Cordis Skills enabled. The generated `game/.dsh/skill-manager.json` was removed after the test, restoring the initial absent-file state.
- Visual review at the normal desktop viewport confirmed that default and batch controls are mutually exclusive, the batch-mode hint is visible, row alignment is stable, and no error/warning console entries were produced.

build 14 result: passed

---

# Skill Manager build 15 · Preset dialogs Design QA

## Inputs

- Source visual truth: `C:\Users\chuansgu\.codex\generated_images\01a02d80-ab9f-7f10-ae90-23b61ac6563f\exec-fb66b855-a747-4e1a-ac0a-08707dc3f7cc.png`
- Browser-rendered apply dialog: `D:\Pythonproject\dsharness\artifacts\design-qa\skill-preset-apply-build15.png`
- Browser-rendered save dialog: `D:\Pythonproject\dsharness\artifacts\design-qa\skill-preset-save-build15.png`
- Local implementation URL: `http://127.0.0.1:3080/`

## State, viewport, and normalization

- Source: 1487 × 1058 px Product Design concept board containing the apply and save states side by side.
- Implementation: 1252 × 945 px screenshots from a 1253 × 945 CSS px in-app-browser viewport, reported DPR 1.5. The browser screenshot API normalized output to CSS-pixel dimensions, so no density resampling was needed.
- Apply state: `game`, 0/68 enabled, `default` preset preview, replace selected, 11 to enable, 0 to disable, 0 source changes.
- Save state: `game`, name `日常研发 · 精简`, 9/64; description 25/200; 0 enabled Skills. The source uses illustrative 11-Skill content, so the count difference is real project data rather than design drift.
- The source is a concept board rather than a same-size host screenshot. Comparison therefore used modal frame, hierarchy, density, typography, controls, tokens, and interaction states rather than pixel-position matching against the surrounding page.

## Full-view comparison evidence

- The source and each browser screenshot were opened together in one comparison input at original resolution.
- Apply dialog: both use a wide single-column frame, title/description, two-option segmented control, impact summary, scrollable change list, secondary actions at lower left, and cancel + dark primary action at lower right. The implementation keeps all footer actions on one line at the tested desktop viewport and has no dialog or body horizontal overflow (`scrollWidth === clientWidth`).
- Save dialog: both use a compact form frame, persistent labels and counters, single-line name, multiline description, a save-impact summary, and right-aligned cancel + dark primary save. The implementation also adds a secondary line clarifying cross-project reuse and excluded data.

## Focused-region comparison evidence

- No separate crop was needed: both implementation captures contain a single centered modal at a readable original size, and the source board keeps the same fields and controls legible. Focused inspection covered the segmented control, change-row separators/state labels, field labels/counters, focus ring, summary block, and footer alignment.

## Findings

- [P3] The implementation follows DSH's smaller native type scale and neutral status pills instead of the concept's larger typography and green plus/check accents. This is an intentional token-system adaptation: hierarchy, contrast, and scan order remain equivalent without introducing custom icons or colors.
- No actionable P0/P1/P2 fidelity issue remained. There is no missing imagery or asset substitution; these dialogs use only native controls and text.

## Required fidelity surfaces

- Fonts and typography: native DSH font stack, weights, counters, and wrapping are consistent; title, description, field labels, metadata, and button hierarchy remain distinct.
- Spacing and layout rhythm: 700 px apply and 580 px save frames, 10 px control radii, stable content gaps, scroll containment, and non-wrapping desktop footer match the selected compact direction.
- Colors and visual tokens: surfaces, borders, focus, disabled state, and primary action use `--dsw-alias-*` tokens; the dark primary action has sufficient visual priority without a new palette.
- Image quality and asset fidelity: the source has no product imagery, logo, or illustration to reproduce. No custom SVG, emoji, CSS art, or placeholder asset was introduced.
- Copy and content: wording clearly distinguishes preview, replace/merge, next-round activation, cross-project reuse, and excluded version/project-specialized data.

## Primary interactions and accessibility checked

- Replace → merge → replace updates `aria-checked` and the primary action label (`应用（替换）` / `应用（合并）`).
- Empty preset name produces a native disabled save button; `maxlength=64` and `maxlength=200` are present, with live counters.
- Cancel and Escape close without applying or saving. Destructive/default actions were intentionally not triggered during visual QA.
- Dialog, radiogroup, radio, status, region, field-label, button, focus, and disabled semantics were inspected in the live accessibility tree.
- Console check after both flows returned no entries. `game` remained 0/68 and no preset was created.
- The current in-app-browser controller did not expose a viewport override, so build-15 modal-specific narrow screenshots were not recaptured. Responsive media rules keep modal width to `100vw - 24px`, stack the mode control, and allow the footer to wrap intentionally below 600 px; the surrounding Skill center's 760/600/375 evidence remains documented in the build 13–14 section above.

## Comparison history

1. Initial implementation review found a P2 footer hierarchy mismatch: primary actions still inherited the low-emphasis ghost treatment. Fixed by adding a token-backed dark `.sk-presetPrimary` state, then reloaded and recaptured both dialogs. Post-fix screenshots show the intended dark apply/save action and clear cancel separation.
2. Post-fix comparison found no remaining P0/P1/P2 mismatch. The smaller native typography and neutral state pills are retained as P3 host-system adaptations.

## Implementation checklist

- [x] Apply modal hierarchy and grouped diff list
- [x] Save modal labels, counters, textarea, and impact summary
- [x] Stable footer with dark primary action
- [x] Replace/merge, disabled, cancel, and Escape states
- [x] Browser screenshots, console inspection, and DOM regression tests

final result: passed

---

# Skill Finding optical-focus loading state QA

- Source visual truth: `D:\Pythonproject\dsharness\artifacts\design-qa\skill-finding-build24\reference.png`
- Rendered implementation: `D:\Pythonproject\dsharness\artifacts\design-qa\skill-finding-build24\implementation-full.png`
- Focused comparison: `D:\Pythonproject\dsharness\artifacts\design-qa\skill-finding-build24\comparison.png`
- Browser viewport: 1280 × 720 CSS px, device pixel ratio 1.5
- Source pixels: 1420 × 1144; center-cropped without distortion and normalized to 510 × 398
- Implementation pixels: 1280 × 720; loading region cropped to 510 × 398 at the same visual scale
- State: SKILL catalog initial loading, approximately 360 ms after opening Extensions

**Findings**

- No actionable P0/P1/P2 differences remain.
- The implementation intentionally uses the product's official `IconSkillOutline16`, so its stroke geometry is slightly stronger than the generated reference. This preserves icon-system consistency and remains within the reference's visual hierarchy.
- Particle positions differ from the still reference because the captured implementation is an in-motion keyframe. Their starting radius, asymmetry, single blue accent, and convergence direction match the selected concept.

**Required fidelity surfaces**

- Fonts and typography: `Skill Finding` is exact and remains on one line. The live style is 14 px, weight 450, 20 px line height, and 0.026 em tracking. A sharp overlay and 10 px blue focus cursor progressively replace the softly blurred base text.
- Spacing and layout rhythm: the unboxed 40 px Skill icon sits in a 216 × 132 motion field with a 26 px gap to the label. The component remains centered in the existing SKILL content surface without adding a card, tile, or shadow.
- Colors and visual tokens: graphite, fog gray, and one cobalt accent are mapped to existing DSH label and blue tokens. There are no gradients, glows, or ad-hoc hard-coded theme colors.
- Image quality and asset fidelity: the official product icon component is reused. No raster placeholder, emoji, handcrafted SVG, or replacement logo is present.
- Copy and content: the only loading copy is `Skill Finding`; the former Chinese title and subtitle are absent.

**Interaction and accessibility evidence**

- Closing and reopening Extensions displays the loading status, then exits it and renders 68 Skill rows.
- `role="status"`, `aria-live="polite"`, `aria-atomic="true"`, and a decorative `aria-hidden` visual are present.
- `prefers-reduced-motion` disables all motion, keeps a fully sharp label and official icon, and leaves one static blue point.
- Browser console check returned no entries.

**Comparison history**

1. Initial implementation retained a large icon relative to the selected mock. It was reduced from 44 px to 40 px, then recaptured in `implementation-full.png`.
2. The first animation timing deferred most motion beyond the typical catalog response. The cycle was compressed from 3.6 s to 2.4 s and meaningful particle/text motion was moved into the first second. The final browser run showed the loading state, cleanly exited it, and rendered the catalog.

**Implementation Checklist**

- [x] Preserve the selected optical-focus composition.
- [x] Synchronize particle absorption with the text-focus cursor.
- [x] Use the official Skill icon and existing theme tokens.
- [x] Cover the loading lifecycle and reduced-motion fallback in DOM tests.
- [x] Verify the live browser flow and console.

**Follow-up Polish**

- P3: If future catalog work consistently completes below 300 ms, consider a minimum visibility threshold or skip the loader entirely to avoid a flash; do not delay a fast response only to show the animation.

final result: passed

---

# MCP Manager Design QA

final result: passed

## Comparison Target

- Source visual truth:
  - `C:\Users\chuansgu\AppData\Local\Temp\codex-clipboard-5cc77b18-4d93-445a-9f43-f3e12ce425cd.png`（MCP 市场 + GitHub 详情）
  - `C:\Users\chuansgu\AppData\Local\Temp\codex-clipboard-60c6e1e3-611e-4d38-986e-fd8cbd42593e.png`（服务器列表 + 详情）
- Browser-rendered implementation:
  - `.tmp/qa/market-pass2.png`
  - `.tmp/qa/server-pass3.png`
- Same-input comparison evidence:
  - `.tmp/qa/market-comparison-pass2.png`
  - `.tmp/qa/server-comparison-pass2.png`（第二轮列宽修正前）
  - `.tmp/qa/server-comparison-pass3.png`（第二轮列宽修正后）
- Local URL: `http://127.0.0.1:3180/`
- State: light theme；比较截图中的市场选中 GitHub 官方 Server 并展开详情；服务器页使用
  5 条隔离测试配置并展开 context7 详情。最终集成冒烟基于最新 `origin/main`，左导航同时
  加载 SKILL、MCP 与 Plugin 三个真实业务分区。

## Viewport and Normalization

- Source pixels: `1487 x 1058`，两张一致。
- Implementation pixels / CSS viewport: `1488 x 1058`，browser viewport override，device density 1。
- 比较拼图将 source 横向补齐 1 px 到 `1488 x 1058`，未裁剪内容；实现截图保持原始尺寸。
- 响应式补充检查：`900 x 800`、`720 x 800`、`640 x 760`，三个宽度均满足 `scrollWidth === clientWidth`；640 宽时扩展导航隐藏，详情抽屉保持 12 px 左侧余量。

## Findings

没有剩余的 P0 / P1 / P2 问题。

可接受差异：

- 隔离 profile 未挂载 SKILL Manager，因此左侧只显示 MCP 和 Plugin；这是测试组合差异，不是 MCP 页面缺失。
- 市场使用 MCP Registry 可信图标和 GitHub owner avatar，因而 Microsoft、Context7、AWS 等图标比设计稿中的统一 GitHub 图标更真实；这直接落实了“图标能获取就显示真实图标”的产品要求。
- GitHub 描述、推送日期与 Release 为浏览器验收当时的在线返回值，不锁死设计稿中的示例文本。
- 服务器验收配置全部停用，故状态和工具数与设计稿示例不同；真实 Loader phase 和 `tools.schemas()` 投影已由自动化覆盖，页面不会伪造重试次数或错误详情。
- 服务器页保留与市场页一致的两 Tab 导航；两张来源图对此并不一致，统一导航让用户可从任一页面直接切换，属于有意的产品一致性调整。

## Required Fidelity Surfaces

- Fonts and typography: 沿用 DSH Web 的字体栈；标题、正文、辅助信息、表头和标签权重分层与来源一致。首轮发现 repository 名称和描述落在同一行，已改为独立纵向块；长 GitHub 描述单行截断。
- Spacing and layout rhythm: 顶栏、188 px 左导航、主内容边距、92 px 市场行、84 px 服务器行和 400 px 抽屉已与来源对齐。第二轮补充 drawer-open 的 400 px 内容预留，服务器所有列不再被抽屉覆盖。
- Colors and visual tokens: 使用 DSH 中性色 token，交互主色固定为来源的 `#1677ff`；选中行使用低饱和蓝底，错误/连接/停用状态保持语义色。
- Image quality and asset fidelity: 市场图片均为 Host 验证后的 HTTPS PNG/JPEG/WebP；MCP Registry 优先、GitHub avatar 回退。没有手写 SVG、CSS 图标或 emoji 占位。
- Copy and content: 页面只展示 Host 能可靠提供的配置、Loader phase、工具 schema 和 GitHub/Registry 字段；已移除来源不可靠的“最后检测”“重试次数”等示例信息。
- Icons: Shell 和操作控件使用 DSH primitives 图标库；市场项目使用真实远程项目图标；加载失败时使用 primitives 通用链接图标。
- Accessibility: Tab、按钮、switch、dialog、label 和 aria 状态完整；Esc 层级关闭、键盘 focus ring、图片空 alt 和无横向溢出均已验证。

## Full-view and Focused Evidence

- Full-view: `market-comparison-pass2.png` 显示左右三栏比例、搜索、5 行市场结果、选中态和 400 px 详情抽屉与来源一致；真实项目图标是有意增强。
- Full-view: `server-comparison-pass2.png` 验证 5 行表格、筛选、详情抽屉、底部操作区和去噪密度。
- Focused region: 原始尺寸拼图已能清楚读取市场行图标/标题/描述、仓库键值、Topics、Release，以及服务器表头/列/详情工具区，因此无需额外裁切。`server-comparison-pass3.png` 进一步确认 drawer-open 后状态、传输、工具数与开关列全部可见。

## Comparison History

### Iteration 1 — blocked

- [P2] 市场和服务器的标题/描述 span 未建立纵向布局，浏览器将两段文本连在一行。
  - Fix: `.mm-marketCopy` / `.mm-serverCopy` 改为纵向 flex，标题和描述显式 block。
- [P2] 扩展左导航为 156 px，而来源为约 188 px，导致主区域比例和搜索框起点漂移。
  - Fix: 左导航改为 188 px，主内容水平 padding 改为 8 px，使实际内容起点与来源对齐。
- [P2] 详情抽屉打开时覆盖服务器表格后四列。
  - Fix: 桌面宽度下 `.mm-rootHasDrawer` 为内容预留 400 px；980 px 以下继续使用覆盖式抽屉。
- [P3] 市场选中行依赖浏览器默认黑色 focus outline。
  - Fix: 使用 1 px `#1677ff` focus ring，与页面主色一致。

### Iteration 2 — passed

- `market-comparison-pass2.png`：左导航、主内容起点、5 行密度、真实图标、选中态和详情抽屉无 P0/P1/P2 偏差。
- `server-comparison-pass3.png`：drawer-open 状态下表头和 5 列均完整可见，概要操作、行密度与抽屉 footer 没有重叠或裁切。
- Fresh browser tab console: 0 error / 0 warn。

## Primary Interactions Tested

- 扩展入口与 MCP 分区加载。
- 服务器 / 市场 Tab 切换、搜索和列表渲染。
- 服务器详情、环境变量缺失时拒绝启用、重新检测入口。
- 市场 GitHub/Registry 元数据、真实图标、详情抽屉、安装为停用配置、已安装状态回写。
- 最新 `origin/main` 四插件组合：SKILL / MCP / Plugin 导航均为真实贡献，无壳占位；
  市场 5 行、GitHub 详情与远程头像正常，fresh tab console 0 error / 0 warn。
- Esc 内层关闭由 DOM 集成测试覆盖；新增/编辑/删除 dialog 语义和路由由自动化覆盖。

## Follow-up Polish

- P3：当 MCP client 将来公开结构化连接错误与 retry telemetry 时，可在详情抽屉增加真实“最后检测/重试次数”，当前不应以推测值填充。

---

# MCP Connecting endpoint-handshake loading state QA

- Source visual truth: `D:\Pythonproject\dsharness-DSH-026-mcp-manager\artifacts\design-qa\mcp-connecting-build1\reference-skill-finding-full.png`
- Rendered loading state: `D:\Pythonproject\dsharness-DSH-026-mcp-manager\artifacts\design-qa\mcp-connecting-build1\implementation-loading.png`
- Settled MCP page: `D:\Pythonproject\dsharness-DSH-026-mcp-manager\artifacts\design-qa\mcp-connecting-build1\implementation-full.png`
- Focused same-input comparison: `D:\Pythonproject\dsharness-DSH-026-mcp-manager\artifacts\design-qa\mcp-connecting-build1\comparison.png`
- Browser viewport: 982 × 953 CSS px in the Codex in-app browser.
- State: MCP server list initial request, captured about 240 ms after entering the MCP section.

## Findings

- No actionable P0/P1/P2 visual or interaction issue remains.
- The optical-focus text treatment, unboxed central glyph, centered rhythm, graphite/fog palette, and single blue accent deliberately match `Skill Finding`.
- MCP identity is expressed with official primitives instead of custom artwork: a local process endpoint (`IconCodeOutline16`) and a blue remote API endpoint (`IconApiOutline14`) converge on the official link glyph (`IconLinkOutline16`), then the connection core pulses once.
- The MCP core is slightly more visually dense than the Skill glyph because three official symbols overlap during the handshake keyframe. This is intentional and remains readable at the captured scale.

## Required fidelity surfaces

- Fonts and typography: `MCP Connecting` stays on one line at the same 14 px optical-focus scale. The sharp overlay and 10 px blue cursor traverse the soft base label over the 2 s cycle.
- Spacing and layout rhythm: the animation uses the same 216 × 132 visual field and 26 px label gap as the selected Skill state. Tabs, profile summary, search, and filters remain stable while the server data connects.
- Colors and visual tokens: graphite and fog use existing DSH label tokens; the remote endpoint and focus cursor use the existing static blue token. No gradients, glow, or new palette was introduced.
- Image quality and asset fidelity: all three symbols come from DSH client UI primitives. No generated bitmap, custom SVG, emoji, CSS-drawn icon, or placeholder logo is used.
- Copy and content: the only branded loading copy is `MCP Connecting`; failure copy is separate and gives a real retry action.

## Interaction and accessibility evidence

- Initial loading is held for at least 680 ms so the animation does not flash on a fast Host response, then exits to the real five-server list.
- Failure exits to `role="alert"` with a `重试` button; retry re-enters the branded connecting state and restores the list. This lifecycle is covered by DOM integration tests.
- `role="status"`, `aria-live="polite"`, `aria-atomic="true"`, and a decorative `aria-hidden` visual are present.
- `prefers-reduced-motion` disables all animation while keeping the sharp label, connection core, and two static endpoints visible.
- Live in-app browser accessibility snapshot exposed `MCP Connecting` as the active status; settled page rendered five server rows. Browser console errors: 0.

## Comparison history

1. The first rendered implementation was compared side by side with the live `Skill Finding` state at a normalized center crop. Its icon scale, text baseline, cursor weight, whitespace, and visual density matched without a P0/P1/P2 discrepancy.
2. The moving still shows the local and remote endpoints already docking into the link core; this keyframe makes the MCP-specific handshake legible while preserving the selected Skill motion language. No second visual correction was required.

## Implementation checklist

- [x] Preserve the selected Skill optical-focus language.
- [x] Add an MCP-specific local-to-remote endpoint handshake.
- [x] Use only official UI primitives and existing theme tokens.
- [x] Keep page chrome stable and enforce a 680 ms minimum dwell.
- [x] Add retryable failure and reduced-motion states.
- [x] Verify automated lifecycle, live browser rendering, accessibility tree, and console.

final result: passed
