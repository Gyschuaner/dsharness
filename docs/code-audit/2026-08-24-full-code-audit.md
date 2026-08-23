# DSH-029 full code audit

## Scope and baseline

- Repository: `D:\Pythonproject\dsharness`
- Base branch: `origin/main`
- Base commit: `66fc05414723b3f4b6c9e8ff25314411d8b2b31c`
- Audit branch: `fix/full-code-audit-20260824-DSH-029`
- Audit date: 2026-08-24 (Asia/Shanghai)
- Included: tracked JavaScript runtime and tests, PowerShell/Bash/Python scripts, JSON/YAML/package configuration, and launcher wrappers.
- Explicit exclusions: 49 binary PNG evidence files, 29 Markdown instruction/design/history documents, and 24 historical patch snapshots. These are not executable runtime inputs; their paths and reasons remain recorded in `full-code-audit-coverage.json`.
- Pre-change backup: annotated tag `backup/DSH-029-pre-typescript-20260824-021330`; verified bundle `D:\Pythonproject\dsharness-backups\DSH-029-pre-typescript-20260824-021330-66fc05414723.bundle`; SHA-256 `B43B14B1E2FDD31911672164559524A02E90DFEB61707CD11E7027E127FF530A`.

## Coverage

- Total tracked files: 162
- Reviewed: 60
- Skipped with reason: 102
- Pending: 0
- Coverage: 100%
- Machine-readable ledger: `docs/code-audit/full-code-audit-coverage.json`

## Executive result (first-pass freeze)

- Confirmed findings: 15
- High: 5 confirmed
- Medium: 8 confirmed
- Low: 2 confirmed
- Fixed: 0 at first-pass freeze; fixes start only after this report is frozen.
- Highest current risk: process/path operations can terminate unrelated services or mutate files outside the intended plugin/skill root; plugin installation and global skill configuration are not fully transactional against failure/corruption.
- Branch readiness: not ready for merge until every confirmed finding is fixed, TypeScript migration is complete, and full regression/browser/SIT evidence is appended.

## Findings

### AUDIT-001 | high | security/correctness | confirmed

Location: `restart-dsh-web.ps1:33`, `restart-dsh-web.ps1:79`, `restart-dsh-web.command:101`

Trigger: Run either restart launcher on a port currently owned by a non-DSH listener; on Windows, pass a crafted host value that reaches the interpolated PowerShell `-Command` string.

Impact: An unrelated process can be terminated. The Windows launcher also reparses interpolated values as PowerShell source, creating command-injection and quoting failures.

Evidence: Both launchers enumerate all listening PIDs by port and stop them without verifying the executable/command line. The Windows launcher builds `$DshCommand` as text and passes it to `powershell.exe -Command`.

Fix: Pending. Verify the listener belongs to DSH before stopping it and launch the resolved executable with an argument array, never an interpolated command string.

Verification: Pending targeted launcher tests and process-ownership negative test.

Commit: Pending.

### AUDIT-002 | high | security/data safety | confirmed

Location: `dev/setup-plugin-junction.ps1:43`, `dev/setup-plugin-junction.ps1:49`, `dev/setup-plugin-junction.ps1:112`

Trigger: Supply `PluginName` containing traversal/rooted path syntax, an arbitrary `Restore` path, or shell metacharacters in a path passed to `cmd /c mklink`.

Impact: The script can resolve outside the repository/live plugin roots, move an unrelated restore path, or invoke unintended `cmd.exe` syntax during a destructive junction setup.

Evidence: `PluginName` is joined without single-segment validation or resolved containment checks; `Restore` is moved without proving it is the expected sibling backup; junction creation crosses into `cmd /c` with interpolated paths.

Fix: Pending. Validate exact roots and leaf names, constrain restore backups, and use native PowerShell junction creation/removal.

Verification: Pending traversal, arbitrary-restore, spaces/metacharacters, dry-run, create, and restore tests.

Commit: Pending.

### AUDIT-003 | medium | correctness/reliability | confirmed

Location: `plugins/mcp-manager/lib/state.js:161`, `plugins/mcp-manager/lib/marketplace.js:39`, `plugins/mcp-manager/lib/client.js:253`

Trigger: Create/import an MCP server with an `env` or `headers` mapping whose referenced host environment variable is absent, while `requiredEnv` is omitted (including the Context7 marketplace entry).

Impact: The manager allows enablement and reports no missing environment even though the runtime mapping cannot resolve, so failure is deferred to MCP startup/tool use.

Evidence: `normalizeServer` validates `requiredEnv` separately but never unions mapping values into it; the form has no independent required-env editor; Context7 maps `CONTEXT7_API_KEY` but does not declare it required.

Fix: Pending. Derive required variables from every env/header reference, preserving explicit requirements.

Verification: Pending stdio env, HTTP header, marketplace import, missing/present environment tests.

Commit: Pending.

### AUDIT-004 | medium | configuration integrity | confirmed

Location: `plugins/mcp-manager/lib/state.js:77`, `plugins/plugin-manager/lib/state.js:88`

Trigger: A profile patch contains duplicate managed start/end markers.

Impact: Read/replace handles only the first block and leaves later managed rows active, producing duplicate or contradictory runtime configuration instead of failing closed.

Evidence: Both implementations use the first `indexOf(start)` and following `indexOf(end)` without enforcing exactly one ordered pair.

Fix: Pending. Reject duplicate, reversed, or incomplete marker layouts before reads/writes.

Verification: Pending duplicate start/end/reversed/incomplete block tests for MCP and Plugin managers.

Commit: Pending.

### AUDIT-005 | medium | correctness | confirmed

Location: `plugins/plugin-manager/lib/state.js:123`

Trigger: A Cordis row has nested configuration containing `name:` or `disabled:` keys.

Impact: Nested values overwrite the row's direct module/disabled leaves, so Plugin Manager can misidentify a plugin, row ID state, or mount.

Evidence: `parsePatchRows` accepts matching keys at any indentation greater than the row indentation, rather than only direct children.

Fix: Pending. Parse only direct row leaves and keep nested mappings isolated.

Verification: Pending nested-name and nested-disabled fixtures.

Commit: Pending.

### AUDIT-006 | high | transaction/data consistency | confirmed

Location: `plugins/plugin-manager/lib/state.js:458`

Trigger: `dsh plugin add` changes multiple direct dependencies, post-install manifest/bundle inspection fails, mount-patch write fails, or rollback removal fails.

Impact: Extra or invalid dependencies can remain installed, a valid dependency can remain after the API reports failure, and rollback failure is hidden behind a message claiming installation was rolled back.

Evidence: Success accepts one DSH candidate even when `changed` contains additional packages; the post-validation/mount phase is outside rollback; removal failures are swallowed.

Fix: Pending. Require one exact direct dependency delta and wrap every post-install step in an explicit rollback transaction whose failure is surfaced.

Verification: Pending multi-delta, non-plugin, bundle-read failure, mount-write failure, and rollback-failure tests.

Commit: Pending.

### AUDIT-007 | medium | API correctness | confirmed

Location: `plugins/plugin-manager/lib/state.js:535`

Trigger: Request the same marketplace detail within the cache TTL, especially after local install/update state changes.

Impact: Cached responses omit/reuse stale local `status`, `installedVersion`, and `packageName`, so the drawer can show the wrong action or no install state.

Evidence: The cache stores raw GitHub detail and the early cache return occurs before `listLocalPlugins`/`marketplaceStatus` are recomputed.

Fix: Pending. Cache remote facts only and merge fresh local state on every response, including stale fallback.

Verification: Pending cached detail before/after local install/update tests.

Commit: Pending.

### AUDIT-008 | medium | path security | confirmed

Location: `plugins/plugin-manager/lib/state.js:253`

Trigger: An installed third-party manifest declares `dsh.bundle.patch` as an absolute path or `../` traversal.

Impact: Plugin Manager reads a file outside that package and interprets its first patch row as plugin identity, violating the package boundary and exposing filesystem-derived data/behavior.

Evidence: `resolve(packageDir, patch)` is read without canonical containment or regular-file validation.

Fix: Pending. Resolve and canonicalize the patch beneath the package directory and reject escapes/symlinks outside it.

Verification: Pending relative valid, traversal, absolute, symlink escape, and non-file tests.

Commit: Pending.

### AUDIT-009 | high | data loss | confirmed

Location: `plugins/skill-manager/lib/state.js:395`

Trigger: The global skill-manager JSON is syntactically corrupt, unreadable, or fails with an I/O error, then any tags/presets/policy write occurs.

Impact: Existing global tags, presets, legacy policy, and unknown future fields can be silently replaced from an empty configuration.

Evidence: `readGlobalConfig` maps every non-ENOENT error to an empty config with `raw: {}`; `writeGlobalConfig` then writes that synthetic state.

Fix: Pending. Distinguish missing/corrupt/future/I/O states, expose them, and refuse writes that would clobber unreadable truth.

Verification: Pending corrupt JSON, permission/I/O, future-version, missing-file, and round-trip tests.

Commit: Pending.

### AUDIT-010 | medium | availability/API validation | confirmed

Location: `plugins/skill-manager/lib/index.js:1109`

Trigger: Send an arbitrarily large request body or an operation name inherited from `Object.prototype` such as `constructor`.

Impact: A local caller can cause unbounded memory collection; prototype members can bypass the intended unknown-operation check and execute an unintended function path.

Evidence: The handler appends all chunks without a byte limit and dispatches with `ops[op]` without an own-property check.

Fix: Pending. Enforce the same bounded JSON body policy as the other managers and dispatch only own operation keys.

Verification: Pending oversized body, invalid JSON/object, `constructor`, `toString`, and valid op tests.

Commit: Pending.

### AUDIT-011 | high | path security/data safety | confirmed

Location: `plugins/skill-manager/lib/index.js:232`

Trigger: Place a directory symlink/junction under a writable skill root that points outside that root, then invoke save/delete/setStatus against it.

Impact: The HTTP manager can write or delete through the link outside the selected project/user skill root despite claiming canonical containment.

Evidence: `assertContained` compares lexical `resolve()` paths only, while discovery and target resolution deliberately follow directory junctions.

Fix: Pending. Add operation-aware canonical containment checks for existing targets and creation parents while preserving explicitly supported root junctions.

Verification: Pending symlink/junction escape read/write/delete and valid in-root/root-junction tests.

Commit: Pending.

### AUDIT-012 | medium | state consistency | confirmed

Location: `plugins/skill-manager/lib/catalog.js:1277`

Trigger: A managed source copy is user-modified, then the user selects a source that would normally win without a copy.

Impact: The code records a pure source selection while leaving the modified rank-100 project copy in place, so the stored selection and actual DSH resolution disagree.

Evidence: The pure-selection branch sets `{ generated: false }`; modified/mismatched copies skip deletion without throwing, unlike reset/rank-losing selection paths.

Fix: Pending. Reject the transition with 409 until the specialized copy is explicitly resolved.

Verification: Pending modified-copy to rank-winning source test proving bytes and config stay unchanged.

Commit: Pending.

### AUDIT-013 | low | UI correctness/accessibility | confirmed

Location: `plugins/skill-manager/lib/client.js:1909`

Trigger: Open the source picker for an identity whose source has `broken` set to an error string.

Impact: The broken source remains enabled/selectable and lacks its visible damage badge; the Host rejects only after the user clicks it.

Evidence: The client tests `s.broken === true`, but Host source rows carry the error message string.

Fix: Pending. Treat any non-empty broken value as broken for disabling, title, and badge rendering.

Verification: Pending DOM test with string-valued `broken`.

Commit: Pending.

### AUDIT-014 | medium | artifact integrity | confirmed

Location: `dev/qwen36-vision-ram/stage-model.sh:18`

Trigger: The staged RAM model or mmproj is corrupted/replaced without changing file size.

Impact: The script reports `RAM_FILE_REUSED` and launches inference against invalid model bytes, causing misleading startup success or incorrect/crashing inference.

Evidence: Reuse and post-copy validation compare size only; no byte/hash verification exists.

Fix: Pending. Verify staged content against the source before reuse and before publication.

Verification: Pending same-size corruption, valid reuse, new copy, and wrong-size refusal tests.

Commit: Pending.

### AUDIT-015 | low | client lifecycle | confirmed

Location: `plugins/better-sidebar-smooth/lib/client.js:44`, `plugins/extension-manager/lib/client.js:66`, `plugins/mcp-manager/lib/client.js:154`, `plugins/plugin-manager/lib/client.js:120`, `plugins/skill-manager/lib/client.js:351`

Trigger: The client module factory is evaluated again during plugin reload/hot replacement without a full document navigation.

Impact: A new style element is appended each time, causing duplicate rules, retained DOM nodes, and harder-to-reason theme/reload behavior.

Evidence: Every client bundle creates/appends its style at factory evaluation and neither reuses an existing element nor removes it during lifecycle cleanup.

Fix: Pending. Make style ownership idempotent by reusing/replacing the plugin's single tagged style element.

Verification: Pending double-evaluation DOM test for all five client bundles and built-in browser reload check.

Commit: Pending.

### AUDIT-016 | low | UI correctness | confirmed during migration

DP Bug: `BUG-990BB208`

Location: `plugins/skill-manager/src/client.ts` (`doToggle`)

Trigger: Call the toggle helper with an explicit `true` or `false` target.

Impact: The explicit target is ignored and the current row state is inverted, so idempotent or caller-directed toggle behavior is impossible.

Evidence: The migrated source compared the value with the string (`force === 'boolean'`) instead of checking its type.

Fix: Completed. Use `typeof force === 'boolean'` and keep the row-state inversion only as the no-argument fallback.

Verification: Targeted static regression plus the Skill client toggle DOM suite.

### AUDIT-017 | low | API contract | confirmed during migration

DP Bug: `BUG-1BC444EC`

Location: `plugins/skill-manager/src/catalog.ts` (`applySourceSelection`)

Trigger: Select a source that requires a managed project copy.

Impact: `copyCreated` carries an object instead of the documented boolean, breaking callers and hiding the mismatch until strict typing or runtime inspection.

Evidence: The function returned `{ copyCreated: copyResult }` instead of the nested boolean.

Fix: Completed. Return `copyResult.copyCreated` and assert the runtime type in the source-selection regression.

Verification: `setSource: selecting a rank-losing source materializes a managed copy` now checks the helper contract.

### AUDIT-018 | high | package boundary/security | confirmed during re-review

DP Bug: `BUG-EFE4534A`

Location: `plugins/plugin-manager/src/state.ts` (`readInstalledManifest`, `readBundleRowId`)

Trigger: An installed dependency manifest reports another valid package name (or a traversal-shaped invalid name) and declares a bundle patch.

Impact: Bundle inspection can be redirected from the profile's actual dependency directory into a different package, defeating the package-boundary check added for AUDIT-008.

Evidence: The directory was rebuilt from third-party `manifest.name` after the dependency key had already identified the real package.

Fix: Completed. Validate package names, require manifest/dependency identity equality, and resolve bundle content only beneath the directory selected by the profile dependency key.

Verification: Cross-package redirect and traversal-shaped manifest regressions.

### AUDIT-019 | high | data safety/backward compatibility | confirmed during re-review

DP Bug: `BUG-F61C8312`

Location: `plugins/skill-manager/src/catalog.ts` (managed-copy verification and source reset)

Trigger: A generated-copy registration contains only the V1 `contentHash` field or contains no verifiable content marker, then a source is switched/reset.

Impact: A copy that cannot be proven unmodified can be automatically deleted, violating the manager's central derived-artifact safety invariant.

Evidence: Two removal branches treated missing `copyHash` as permission to remove, while other paths ignored the documented legacy `contentHash` field.

Fix: Completed. Use `copyHash` with `contentHash` fallback; when neither exists or hashing fails, classify the copy as project-owned, preserve its bytes, and report an explicit conflict.

Verification: Legacy-marker compatibility and unmarked-copy preservation regression.

### AUDIT-020 | medium | transaction/API correctness | confirmed during re-review

DP Bug: `BUG-D7644EBA`

Location: `plugins/skill-manager/src/index.ts` (`mutateProject` after `setSource`)

Trigger: Switch from a managed rank-100 copy to a pure source, which moves/removes the copy inside the mutation ledger.

Impact: The configuration is committed successfully but reconcile reads the removed path from the pre-mutation identity snapshot and the API falsely reports HTTP 500.

Evidence: `reconcileProject` received `locked.identities` after the mutator had changed the source tree.

Fix: Completed. Re-scan the identity catalog after file-affecting mutation planning and reconcile against the refreshed filesystem view.

Verification: Pure-source transition now asserts HTTP 200, correct bytes, and correct persisted source selection.

## Fix completion matrix

All confirmed findings are implemented on the DSH-029 branch; final commit IDs are appended after the verified commit is created.

| Finding | DP Bug | Fix status | Primary regression |
|---|---|---|---|
| AUDIT-001 | BUG-1FC2A9F7 | Fixed | listener ownership, exact-port scope, parser/shell tests |
| AUDIT-002 | BUG-8197AE7C | Fixed | traversal/restore rejection plus create/restore junction cycle |
| AUDIT-003 | BUG-687A25E6 | Fixed | implicit stdio/header environment requirements |
| AUDIT-004 | BUG-70DB862C | Fixed | duplicate/reversed/exact-line marker tests |
| AUDIT-005 | BUG-266A57BC | Fixed | nested Cordis leaf fixture |
| AUDIT-006 | BUG-17E7E749 | Fixed | multi-delta, mount failure, rollback failure |
| AUDIT-007 | BUG-150278B0 | Fixed | cached remote detail with fresh local state |
| AUDIT-008 | BUG-EC3EF2F0 | Fixed | traversal/absolute bundle patch rejection |
| AUDIT-009 | BUG-C77D4B33 | Fixed | corrupt/future/I/O global truth preservation |
| AUDIT-010 | BUG-A50198C0 | Fixed | oversized body and prototype operation rejection |
| AUDIT-011 | BUG-6984A6B5 | Fixed | child junction canonical-containment rejection |
| AUDIT-012 | BUG-38D297AE | Fixed | modified-copy pure-selection conflict |
| AUDIT-013 | BUG-04E0659D | Fixed | string-valued broken source DOM test |
| AUDIT-014 | BUG-7DB4F5D5 | Fixed | shell parse and byte comparison assertion |
| AUDIT-015 | BUG-9E069109 | Fixed | five-bundle idempotence and stale-style replacement |
| AUDIT-016 | BUG-990BB208 | Fixed | explicit force type-check regression |
| AUDIT-017 | BUG-1BC444EC | Fixed | boolean `copyCreated` contract assertion |
| AUDIT-018 | BUG-EFE4534A | Fixed | manifest/dependency identity boundary regression |
| AUDIT-019 | BUG-F61C8312 | Fixed | legacy/unmarked copy safety regression |
| AUDIT-020 | BUG-D7644EBA | Fixed | refreshed post-source-mutation reconcile regression |

## Fix batches and commits

- First-pass report frozen before business-code edits. Fix batches and commit SHAs will be appended after implementation.

## Verification evidence

### Baseline

- `node --check` over all 25 tracked JavaScript files: 25 passed.
- `node --test` over the repository with `DSH_SOURCE_DIR=D:\Pythonproject\deepseek-harness`: 96 total, 92 passed, 4 platform-skipped, 0 failed.
- Independent backup restore checkout repeated the same checks: 96 total, 92 passed, 4 platform-skipped, 0 failed.
- PowerShell parser validation completed without syntax errors.

### Post-fix/migration

- `pnpm run verify`: strict production TypeScript build, test TypeScript check, generated bundle build, 115 tests (111 passed, 4 explicitly platform-skipped, 0 failed), and the tracked-JavaScript inventory gate all passed.
- `pnpm audit --audit-level high --registry https://registry.npmjs.org`: no known vulnerabilities.
- `git diff --check`: passed.
- Post-migration coverage ledger: 247 tracked paths, 71 reviewed, 176 generated/document/binary/vendor paths skipped with reasons, 0 pending, 100% coverage.
- SIT, built-in browser, reload/restart, clean-checkout reproduction, and the final committed-diff review remain pending at this checkpoint.

## Re-review result

Pending after all fixes and the TypeScript migration.

## Residual risks and deferred work

- No confirmed finding is deferred at first-pass freeze.
- Production deployment is outside DSH-029 authorization. The user authorized merge/push to `main` only after verification.

## Final summary (first-pass freeze)

- Open findings: 5 high, 8 medium, 2 low.
- Coverage: 100%; pending files: 0.
- Baseline test/build status: green as recorded above; post-change status pending.
- Re-review: pending.
- Branch: `fix/full-code-audit-20260824-DSH-029`.
- Report: `docs/code-audit/2026-08-24-full-code-audit.md`.
- Merge/push is pre-authorized after all acceptance gates; production deployment is not authorized.

## Migration checkpoint summary

- Confirmed findings after migration/re-review: 7 high, 9 medium, 4 actionable low (20 total).
- Implemented fixes: 20; open confirmed defects at this checkpoint: 0.
- Hand-written JavaScript remaining: 0. `plugins/*/src/*.ts` and TypeScript tests/configuration are the source of truth; `plugins/*/lib/*.js` is generated runtime output.
