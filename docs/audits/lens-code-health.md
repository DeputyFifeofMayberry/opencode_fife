# Lens 1: Code Health & Conventions - Findings

**Scope:** full repo, structural health. Convention yardstick: AGENTS.md + codemap Convention Fingerprint (repo thresholds: 200-400 lines typical, 800-line soft file ceiling, under-50-line function guidance).
**Method:** codemap risk hotspots + static-analysis cross-reference, verified in code by targeted reads/greps. Static-analysis warnings treated as leads and verified before reporting.

## Finding: TUI session route is a 3,820-line god-file with a ~1,500-line component
- **Location:** packages/tui/src/routes/session/index.tsx:147-1671 (Session component); file total 3,820 lines, 64 top-level definitions
- **Evidence:** Session spans ~1,524 lines (def at 147, next top-level def SessionRowView at 1671). The same file mixes route shell, message/part views, token usage, and ~20 per-tool renderers (Shell 2979, Write 3153, Edit 3443, ApplyPatch 3507, TodoWrite 3627, Question 3653, Skill 3689), plus non-view parse helpers exported from the view (parseApplyPatchFiles 3764, parseQuestions 3791, parseDiagnostics 3806). Conflicts with fingerprint rule "MANY SMALL FILES over FEW LARGE FILES (200-400 typical, 800 soft ceiling)" and the under-50-line function guidance.
- **Impact:** every tool-renderer or message-view change edits one giant file; view and parsing concerns are coupled; helpers are testable only through the route module.
- **Severity suggestion:** P1
- **Category:** size / complexity

## Finding: 286 files exceed 500 lines; ~40 exceed 1,100 against an 800-line soft ceiling
- **Location:** repo-wide; concentration in packages/tui (mini/, component/, routes/session), packages/session-ui, packages/ui procedural avatars, packages/core
- **Evidence:** codemap measured 286 src files over 500 lines; top ~40 are 1,100+ lines (largest: tui session route 3,820; session-ui tool-renderer 2,722; core shell/scan.ts 2,407; codemode interpreter 2,357). (Measured follow-up scan: 226 files exceed 800 lines counting tests, i18n locale data, vendored .d.ts and fixtures; excluding those, 85 production source files exceed the 800-line ceiling (route file measured at 3,691-3,821 lines depending on newline convention; codemap counted 3,820). A second scan covering packages plus services counted 245 files over 800 lines by raw newline split - consistent with the first Some giants have documented role justification and should not be mechanically split: plugin/src/gui/host-apis.ts (1,978) is a TSDoc-checked SDK type surface; core/src/shell/scan.ts is an inherent-complexity parser protected by 14 dedicated test files (adversarial, mutation, oracle, parity, safety); codemode interpreter is the sandbox core. The rest (mini/ cluster 1,205-1,916, session-tabs.tsx 1,801, app.tsx 1,483, composer editor.tsx 1,487) carry no stated exception.
- **Impact:** per the repo's own rules this is drift the repo itself defines as a soft ceiling; change risk concentrates in the same few files.
- **Severity suggestion:** P1
- **Category:** size

## Finding: boundary-parsing convention drift is real, concentrated, and backend-wide
- **Location:** packages/app/src/runtime/persistence/drafts.ts (50 warnings; e.g. encode = async (value: unknown, sources: Sources): Promise of unknown at 232; value as Record of string-unknown at 120/124/246 without SAFETY comments); packages/core/src/models-dev.ts:354, core/src/mcp/index.ts:313, core/src/config/plugin/formatter.ts:73, core/src/instructions/index.ts:245; decorative cluster packages/app/src/new-session/ (341 warnings)
- **Evidence:** static analysis reports 171 no-runtime-typeof, 409 missing-SAFETY-comment, 67 unsafe-dictionary, 75 unknown-parameter warnings. Verified in drafts.ts: repeated typeof value !== object narrowing plus unannotated assertions, exactly the pattern the fingerprint bans ("unknown at boundaries must be parsed once at the owning boundary - no-runtime-typeof"; AGENTS.md: "Validate unknown values once, at the owning boundary"; "Untrusted JSON -> Effect schema helpers (Schema.UnknownFromJsonString, Schema.decodeUnknownOption)"). The sanctioned idiom already exists in-repo: packages/app/e2e/utils/mock-server.ts:1627 (Schema.decodeUnknownOption(Schema.JsonObject)).
- **Impact:** warnings are non-blocking by design, so drift persists and accretes in hotspot files; each hand-rolled assertion is an unchecked contract.
- **Severity suggestion:** P2
- **Category:** convention

## Finding: apply-patch file normalization implemented three times
- **Location:** packages/session-ui/src/components/apply-patch-file.ts:24-43; packages/tui/src/routes/session/index.tsx:3764-3789 (parseApplyPatchFiles); packages/tui/src/mini/tool.ts:218-239
- **Evidence:** all three coerce the same server payload (metadata.files for patch tools) from untyped records into typed {type, relativePath/filePath, patch, additions, deletions} shapes. The status-to-type mapping is duplicated verbatim in two of them: session-ui apply-patch-file.ts:41 and tui route line 3772 (status "added"->"add", "deleted"->"delete", else "update"); the mini variant (line 218) keeps raw status instead - the copies have already drifted.
- **Impact:** schema changes to the patch payload must be replicated in three surfaces; silent divergence already present (same-package tui copies disagree on type vs status).
- **Severity suggestion:** P2
- **Category:** duplication

## Finding: TUI depends on the entire core domain for one random-name helper
- **Location:** packages/tui/src/component/dialog-worktree-name.tsx:1 (import { Slug } from "@opencode/core/util/slug"); packages/tui/package.json:53 ("@opencode/core": "workspace:*")
- **Evidence:** grep shows exactly one @opencode/core occurrence in all of packages/tui/src - this import. It reaches into a core internal path (core/util/slug) for Slug.create() (adjective-noun generator, packages/core/src/util/slug.ts:68-74), which forces the TUI dependency graph to include the whole core domain (transitively ai, codemode, plugin, plugin-browser). The fingerprint layering yardstick treats surface-to-core edges as exceptional; packages/util is the designated generic-helper home (codemap utility inventory) and is already a tui dependency (24 imports).
- **Impact:** heavyweight edge for a trivial helper; deep subpath import bypasses core facade convention; removing it would drop core from the TUI graph entirely.
- **Fix:** move Slug to packages/util/src/slug.ts and re-export from core for compatibility, or inline the 6-line generator.
- **Severity suggestion:** P2
- **Category:** convention (dependency hygiene)

## Finding: isRecord type guard implemented 4x across packages that all depend on util
- **Location:** packages/util/src/record.ts:2 (inventoried shared home); local copies: packages/codemode/src/openapi/spec.ts:17, packages/tui/src/util/record.ts:1, packages/ai/src/utils/record.ts:2
- **Evidence:** four identical unknown-to-Record guards. codemode, ai, and tui each already declare @opencode/util in their manifests (codemap dependency table), so importing the shared guard is free.
- **Impact:** small but textbook missed-reuse cluster (4 instances); the pattern invites more local copies.
- **Severity suggestion:** P3
- **Category:** duplication

## Finding: decorative new-session feature is the densest lint-drift and readability hotspot
- **Location:** packages/app/src/new-session/ - pin-board.tsx (133 warnings), wordmark.tsx (103), brick-breaker.tsx (69), pin-quads.ts (36), pin-sound.ts (21); 362 warnings in one directory
- **Evidence:** warnings verified as real (spacing + missing SAFETY comments per raw report). Additionally pin-board.tsx:66-95 defines the 30-field Pin type with 1-2 letter names (c, r, lv, hx, hy, z, zv, e, pop, bucket, fd, bd...), against the fingerprint naming rule ("Descriptive names: the name says what the thing holds").
- **Impact:** physics/animation code is the hardest place to read terse names; the cluster will keep absorbing warnings because nothing blocks on them.
- **Severity suggestion:** P3
- **Category:** convention (readability)

## Finding: two production console debug statements
- **Location:** packages/app/src/runtime/server/client.tsx:104 (console.info "[global-sdk] event stream disconnected"); packages/app/src/shell/tabs/tabs.tsx:554 (console.debug "[tabs] update persisted session info")
- **Evidence:** repo-wide scan found console.log/debug/info in production src only here; all other hits are examples (ai/example/tutorial.ts), scripts (ai/script, cli/script), and e2e perf harnesses, where logging is appropriate. ECC rule: no console statements in production code.
- **Impact:** minor; both are labeled, structured diagnostics rather than stray debug prints.
- **Severity suggestion:** P3
- **Category:** convention

## Finding: stale lint suppression left in util
- **Location:** packages/util/src/cross-spawn-spawner.ts:15 (ast-grep-ignore: no-star-import above the node:child_process star import)
- **Evidence:** bun run check flags the directive as unused suppression (help: unused-suppression) - the rule does not fire for this import. Fingerprint: no star imports except where rules permit; stale suppressions hide real drift.
- **Severity suggestion:** P3
- **Category:** convention

## Finding: unresolved "MUST FIX" type-safety loss in Copilot chat model
- **Location:** packages/core/src/github-copilot/chat/openai-compatible-chat-language-model.ts:385
- **Evidence:** "TODO we lost type safety on Chunk, most likely due to the error schema. MUST FIX" - an acknowledged violation of the fingerprint no-any / typed-error posture, self-labeled must-fix, still present. Most other TODOs in the repo are well-formed (condition-gated: "after X exists"; one ticketed: session/usage.ts:23 TODO #35765).
- **Impact:** the exact safety property was lost and the note alone does not restore it.
- **Severity suggestion:** P3
- **Category:** convention

## Finding: test coverage thin relative to size in plugin, protocol, util, desktop
- **Location:** package level (codemap-measured): packages/plugin 86 src files / 4 test files, packages/protocol 40/4, packages/util 58/5, packages/desktop 154 src / no dedicated test dir; theme/patchmark/latex none found
- **Evidence:** plugin hosts third-party code execution (security-adjacent) and protocol defines the public HTTP contract consumed by every surface; both sit near the bottom of the coverage table while core (305), tui (190), ai (151) are well covered. core/src/shell/scan.ts is a positive outlier: 14 dedicated test files including adversarial, mutation, and oracle parity suites despite being the 4th-largest file.
- **Impact:** the public contract (protocol) and the plugin runtime can regress without test signal; helper drift (see isRecord finding) is likelier in untested util code.
- **Severity suggestion:** P3
- **Category:** size (coverage relative to package size)

## Finding: same TODO debt block duplicated across three files
- **Location:** packages/core/src/file-mutation.ts:129-131; packages/core/src/tool/plugin/write.ts:43-45; packages/core/src/tool/plugin/edit.ts:204-206
- **Evidence:** the identical three-TODO block ("Publish watcher/file-edit events...", "Add snapshots / undo...", "Notify LSP and collect diagnostics...") is copy-pasted in all three files. Minor today, but the copies will be checked off independently and can drift from the actual design when the work lands.
- **Severity suggestion:** P3
- **Category:** duplication

## Positive observations (verified clean)

- **Layering holds.** packages/client/src has zero core/server/plugin imports; packages/schema/src has zero internal imports; packages/app/src has zero core imports. Every codemap sparse-edge lead resolved as benign: protocol-to-client = Effect service identifier strings (protocol/src/client.ts:9,14), not imports; session-ui-to-core/server = a boundary test asserting their absence (session-ui/src/import-boundaries.test.ts:17-19); app-to-ai = a string literal in a story fixture.
- **i18n respected** in the new-session cluster - all user-visible strings route through language.t(...) per app AGENTS.md, including in the files with heavy lint drift.
- **Procedural avatar generators are properly decomposed**, not duplicated: procedural.ts composes procedural-kit/-world/-craft/-machine behind a documented contract, lab-only by comment.
- **bun run check passes with 0 errors**; the 1,579 warnings are non-blocking drift indicators, reported above at their verified hotspots only.
