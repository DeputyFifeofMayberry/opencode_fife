# Code Audit Report — opencode_fife

**Date:** 2026-10-28 · **Scope:** full repo (40 turbo packages, ~3,890 src files) · **Lenses:** Code Health, Cross-Module Coherence, Refactoring, Security & Performance, Correctness (opt-in)
**Method:** scout codemap + static analysis (`bun run check`: PASS, 0 errors; 1,579 non-blocking warnings), 5 parallel lens agents (specialist agents), orchestrator verification of all P0/P1 evidence against source.

---

## Theme: The public share surface (packages/web) is unsanitized and exempt from every check

**Remediation path:** Sanitize the share-site markdown pipeline (DOMPurify + attribute escaping + URL scheme allowlist), then migrate `packages/web` type imports onto `@opencode/schema` and add the package to `astro check` / turbo typecheck so the surface stops being invisible.
**Estimated effort:** medium

### P1: Stored XSS in the share-page markdown renderer (unsanitized marked → innerHTML)
**Priority:** P1 | **Complexity:** low | **Validity:** high (verified in source by orchestrator)

**Location:** `packages/web/src/components/share/content-markdown.tsx:9-29, 40, 53` (consumed by `packages/web/src/components/share/part.tsx:136, 160, 655` and `Share.tsx`)
**Evidence:** Three compounding defects: (1) `markedWithShiki.parse(markdown)` output is injected via `innerHTML={html()}` with no DOMPurify/sanitizer anywhere in `packages/web` (grep-verified: zero sanitizer hits; no CSP header), and `marked` passes raw HTML through by default; (2) the custom link renderer interpolates `href` and `title` into the HTML string without attribute escaping, so a `"` in `title` breaks out into arbitrary attribute/event-handler injection; (3) `javascript:`/`data:` schemes are not filtered. Contrast: the in-app pipeline is correct — `packages/session-ui/src/components/markdown-cache.tsx:76-79` runs every block through `DOMPurify.sanitize`.
**Impact:** `ContentMarkdown` renders shared session message text (`part.tsx:136`: `text={props.part.text}`) — model/tool output that can echo malicious repo files, web-search results, or tool output. A user shares such a session; any viewer of the public share page executes injected script in the share-site origin. Session-wide stored XSS on a public website.
**Suggestion:** Route parsed HTML through `DOMPurify.sanitize` before `innerHTML` (mirroring session-ui), escape `href`/`title` in the link renderer, and allowlist link schemes (`http:`, `https:`, `mailto:`).
**Validation:** Unit test rendering a payload of raw HTML + `"`-breaking title + `javascript:` link through `ContentMarkdown` asserting inert output; e2e check on the `s/[id]` page.

### P2: Share surface types against a phantom `opencode/session/*` module; package excluded from every check
**Priority:** P2 | **Complexity:** medium | **Validity:** high (verified in source by orchestrator)

**Location:** `packages/web/src/components/Share.tsx:8-10`, `packages/web/src/pages/s/[id].astro:4` ↔ `packages/web/package.json` (no `opencode` dependency, no typecheck/test script)
**Evidence:** `import type { MessageV2 } from "opencode/session/message-v2"` etc. — no `opencode` package exists in the workspace (pre-monorepo upstream layout). All offending imports are `import type`, so builds erase them; the v1→v2 conversion in `Share.tsx:503-549` (with non-null assertions like `v1.metadata.assistant!.cost`) is unverifiable by `bun run check`, `astro build`, or tests. The live page renders with `client:only="solid"` (`s/[id].astro:147`).
**Impact:** Any drift between the share API payload and the hand-assumed shapes is invisible to all checks on a deployed public surface; the conversion logic is effectively uncheckable.
**Suggestion:** Point the imports at `@opencode/schema` (MessageV2/Session live there), add the missing manifest dependency, and include `web` in the `astro check` turbo task alongside `www`/`posts`.
**Validation:** `astro check` covers the package; typecheck fails on any payload/shape drift.

---

## Theme: Session execution lifecycle misclassifies a user decline as shutdown

**Remediation path:** Make the decline self-interrupt carry an explicit interruption reason (or return a typed outcome from the drain) so the claim is released and jobs are cancelled, matching the AGENTS.md invariant "user interruption releases it". Fix the adjacent adoption range bound while in the area.
**Estimated effort:** medium

### P1: Tool-permission decline leaks the durable execution claim and resurrects the stopped turn on restart
**Priority:** P1 | **Complexity:** medium | **Validity:** high (verified in source by orchestrator)

**Location:** `packages/core/src/session/runner/step.ts:294-297` + `packages/core/src/session/execution.ts:47-51, 125-133` + `packages/core/src/session/execution/restart.ts:77-98`
**Evidence:** A decline fails the tool fiber with `Permission.DeclinedError`, and `step.ts:296` responds with a bare `return yield* Effect.interrupt`. `terminal()` (`execution.ts:49`) classifies any interrupts-only exit without an explicit reason as `reason: "shutdown"` — pinned by `core/test/session-execution.test.ts:49-53`, and `core/test/session-runner.test.ts:5214-5273` confirms the decline exit is interrupts-only. `settled()` then takes the shutdown branch (`execution.ts:127-131`): no `jobs.cancel(sessionID)`, no `releaseOnCommit`. The leaked claim is exactly the signature `resumeSuspendedSessions` sweeps (`restart.ts:36-43, 77-98`): next boot injects the synthetic "The server restarted while you were working…" message and auto-resumes the turn.
**Impact:** Trigger: user declines a tool permission (routine), then the server restarts (daily for the managed server). The turn the user deliberately stopped auto-continues under a fabricated restart pretext, its background jobs (shells, subagents) keep running, and repeated decline+restart cycles consume the 10-attempt resume budget toward `RESUME_EXHAUSTED`. Direct divergence from the documented AGENTS.md invariant.
**Suggestion:** Thread an explicit interrupt reason through the step for declines (the decline site knows it is a deliberate user stop) or return a typed decline outcome from the drain instead of `Effect.interrupt`; settle with reason `"user"` so the claim releases and jobs cancel.
**Validation:** Runner/execution test pinning: decline → claim released (`time_suspended` cleared), jobs cancelled, and no synthetic restart resume on the next sweep.

### P3: Worktree session-adoption range bound excludes astral-plane directory characters
**Priority:** P3 | **Complexity:** low | **Validity:** medium *(corrected during remediation: the original failure claim did not reproduce)*

**Location:** `packages/core/src/session/projector.ts:561-571`
**Evidence:** The adoption projection matches `directory <= prefix + "\uffff"`. SQLite BINARY collation compares UTF-8 bytes; any supplementary-plane character (e.g. emoji, U+1F600) sorts above `\uffff`, so sessions in subdirectories whose first diverging character is astral are excluded from the SQL rows before the in-memory `FSUtil.contains` filter (line 578) can recover them.
**Impact:** Those sessions keep a stale `project_id`/path projection and are never re-adopted. Exotic-path, low likelihood; genuine boundary bug.
**Suggestion:** Replace the upper bound with an escaped `LIKE prefix || '%'` (or drop the SQL upper bound and rely on the in-memory containment filter, which is already applied).
**Validation:** Projector test with an emoji-named subdirectory session asserting re-adoption.

> **Remediation correction (2026-10-28):** implementation-phase analysis showed the claimed exclusion cannot occur for *contained* paths — a contained directory always begins `prefix + separator`, and the separator sorts below `\uffff`, so contained emoji directories were never excluded by the SQL range. The bound was still replaced with an escaped `LIKE` + in-memory guard as simplification, with a pinning test (`fix(core): adopt sessions in astral-character directories`). Finding validity downgraded; original text retained for the record.

---

## Theme: Sandbox boundary and auth hygiene

**Remediation path:** Canonicalize paths (realpath) before the internal/external containment decision, and switch the Basic-auth password comparison to `timingSafeEqual`. Fold the remaining items into docs or follow-up confirms.
**Estimated effort:** low-medium

### P2: Symlinked paths bypass the external-directory approval boundary
**Priority:** P2 | **Complexity:** medium | **Validity:** high (verified in source by orchestrator)

**Location:** `packages/core/src/file-access.ts:95-106` (with `packages/util/src/fs-util.ts:289-292`)
**Evidence:** The internal/external decision is purely lexical: `resolvePath` + `FSUtil.contains` (a `path.relative` prefix check). No `realpath` canonicalization occurs before the decision (`FSUtil.resolve` at `fs-util.ts:262-270`, which does call `realpathSync`, is unused here), while content reads follow final symlinks (`packages/core/src/environment/files.ts:33`). Verified: `file-access.ts:96-100` computes containment with no symlink resolution.
**Impact:** Git preserves symlinks, so an untrusted repository can ship `link → ~/.ssh`. A Read/Grep/Glob/Edit call through `link/…` resolves lexically inside the workspace, the `external_directory` permission assert (`file-access.ts:125-142`) never fires, and outside-file contents enter the LLM context under the workspace-internal approval path — defeating the specific gate that makes out-of-workspace access visible to the user.
**Suggestion:** Canonicalize the resolved absolute path (`realpathSync`, falling back to the lexical path when the target does not exist) before the containment check, so the boundary decision is made on the final target.
**Validation:** Test with a workspace symlink pointing outside the workspace asserting the `external_directory` assert fires for read/edit through the link.

### P3: Basic-auth password comparison is not constant-time
**Priority:** P3 | **Complexity:** low | **Validity:** high (dual-lens: security lens + correctness lens flagged the same line)

**Location:** `packages/server/src/auth.ts:33-37`
**Evidence:** `authorized()` compares the presented password with `===` while `verifySession()` on the adjacent line correctly uses `timingSafeEqual` for session tokens. The direct-password branch holds the long-lived secret.
**Impact:** Theoretical timing side channel; practically negligible for a loopback-bound dev server, but a one-line consistency fix matching the module's own discipline.
**Suggestion:** Use `timingSafeEqual` (length-guarded) for the password comparison.
**Validation:** Existing auth tests continue to pass; no behavioral change intended.

---

## Theme: Giant files concentrate change risk in UI surfaces

**Remediation path:** Incremental, behavior-preserving splits with the existing test suites as safety nets — start with the seams that already exist (registry, parse helpers, scanner types) rather than big-bang rewrites. Full detail in `.audit/lens-refactoring.md`.
**Estimated effort:** high (individually), incremental paths available

### P2: TUI session route is a 3,820-line god-file with a ~1,520-line component
**Priority:** P2 | **Complexity:** high | **Validity:** high (size measured by scout and lens)

**Location:** `packages/tui/src/routes/session/index.tsx:147-1671` (Session component); tool renderers at 2731-3697; parse helpers at 3724-3820
**Evidence:** One file mixes route shell, ~45 message/part views, ~20 tool renderers, and exported parse helpers consumed by tests (`packages/tui/test/cli/tui/inline-tool-wrap-snapshot.test.tsx:7-13`) — a test-only-export smell against the repo's own 800-line soft ceiling and many-small-files rule. Downgraded from the lens's P1 per severity gating: concrete evidence, no failure path — maintainability, not a broken contract.
**Impact:** Every tool-renderer or message-view change edits one giant file; view and parsing concerns coupled; helpers testable only through the route module.
**Suggestion:** Split mirroring repo precedent: `routes/session/message.tsx`, `routes/session/tool.tsx`, and move `parse*` helpers to `tui/src/util/`. The snapshot suite is a ready-made safety net.
**Validation:** `bun check` + tui test suite (snapshot tests) before/after; no visual/behavior change.

### P2: 85 production source files exceed the repo's 800-line soft ceiling
**Priority:** P2 | **Complexity:** high (aggregate) | **Validity:** medium-high (measured; exceptions context needed)

**Location:** repo-wide; densest in `packages/tui` (mini/, component/, routes/session), `packages/session-ui`, `packages/app`, `packages/core`
**Evidence:** 226 files exceed 800 lines counting tests/i18n/vendored data; excluding those, 85 production files breach the ceiling (top: tui session route 3,820; session-ui tool-renderer 2,722; core shell/scan.ts 2,407; codemode interpreter 2,357). Some giants are justified exceptions — `plugin/src/gui/host-apis.ts` (declarative SDK type surface), `shell/scan.ts` (complexity-protected parser with 14 dedicated test files), codemode interpreter (documented deliberate architecture) — the rest carry no stated exception.
**Impact:** Per the repo's own rules this is drift the repo itself defines as a ceiling; change risk concentrates in the same few files (churn data in the codemap confirms tui prompt/themes and core are the hot spots).
**Suggestion:** Don't chase the count. Split the highest-churn giants without documented exceptions (session route, tool-renderer, `Prompt`, `createData`, `ProviderConnection` — see refactoring lens), and record documented-exception status for the intentional ones.
**Validation:** Track the count over time; each split verified by its package suite.

### Refactoring opportunities (detected, prioritized — full detail in `.audit/lens-refactoring.md`)
- **session-ui tool-renderer split along existing registry seams** (2,722 ln; medium)
- **`shell/scan.ts` two-scanners split** — mechanical shape, security-relevant, high care (2,407 ln; `scanPowerShellList` ~515 ln single function)
- **`Prompt` ~1,860-ln component extraction** following the prompt-history-machine precedent (high)
- **`createData` ~1,820-ln factory → per-resource slices** (high; hidden slice coupling)
- **`ProviderConnection` ~1,320-ln dialog split by flow phase** (high)
- **Vertical/horizontal session-tabs interaction-hook consolidation** (medium)
- **session-review v1/v2 duality** — pick the canonical tree first; extract shared types (medium-high)
- **ai `anthropic-messages.ts` wire-schema extraction** (medium)
- Accepted exceptions, no action: codemode `Frame`, `plugin/src/gui/host-apis.ts`.

---

## Theme: Duplication clusters and missed reuse across surfaces

**Remediation path:** One shared decoder layer in `@opencode/util` (or the non-generated client module) adopting the Effect-Schema idiom the repo already prefers; reconcile the drifted variants deliberately before unifying (pick the superset tolerance).
**Estimated effort:** low-medium

### P2: Apply-patch / FileDiff record decoding implemented three times — already drifted
**Priority:** P2 | **Complexity:** medium | **Validity:** high (merged: code-health + refactoring lenses found the same cluster independently)

**Location:** `packages/session-ui/src/components/apply-patch-file.ts:17-55` ↔ `packages/tui/src/routes/session/index.tsx:3764-3789` ↔ `packages/tui/src/mini/tool.ts:218-239` (complementary: `packages/util/src/patch.ts:101-119`)
**Evidence:** All three coerce the same untyped tool-metadata payload into typed file-diff shapes. The status→type mapping is verbatim in two of them; the mini variant already diverges (keeps raw status instead of deriving type).
**Impact:** Schema changes to the patch payload must be replicated in three surfaces; silent divergence is already present within the same package.
**Suggestion:** One shared decoder (util or client where `FileDiffInfo` is exported), superset tolerance for the `relativePath`/`filePath` aliases.
**Validation:** Unit tests for the unified decoder covering all three consumers' current accepted shapes.

### P3: Related reuse gaps (compact list)
- **Question/diagnostics metadata decoded two ways** — TUI manual record-walking (`tui/src/routes/session/index.tsx:3791-3820`) vs session-ui Effect Schema (`session-ui/src/tools/tool-renderer.tsx:111-187`); adopt the Schema idiom when consolidating. (medium)
- **`isRecord` ×4** — shared home exists (`packages/util/src/record.ts:2`); local copies in `codemode/src/openapi/spec.ts:17`, `tui/src/util/record.ts:1`, `ai/src/utils/record.ts:2`, all already depending on util. (low)
- **Scalar boundary helpers ×5** — `stringValue`/`recordValue`/`finiteNumber` re-rolled in tui/cli/stats×2; one `util/src/boundary.ts` module removes them and feeds the `no-runtime-typeof` warning paydown. (low)
- **Identical 3-TODO block ×3** — `core/src/file-mutation.ts:129-134`, `core/src/tool/plugin/write.ts:43-45`, `core/src/tool/plugin/edit.ts:204-206`; land the future mutation side-effects work as one shared service, not three copies. (design constraint, no change now)
- **Compaction estimation re-runs the runner's request shaping** — author-flagged TODO at `core/src/session/compaction.ts:1155-1160`; extract a shared shaping helper with the image-budget scope as an explicit parameter. (medium)

---

## Theme: Convention drift and lint debt

**Remediation path:** Batched mechanical paydown (ast-grep autofix + `SAFETY:` comments where assertions are genuine) plus rewriting the worst boundary-parsing hotspot onto the sanctioned schema idiom.
**Estimated effort:** low (mechanical), medium (drafts.ts)

### P2: Boundary-parsing convention drift is real, concentrated, and backend-wide
**Priority:** P2 | **Complexity:** medium | **Validity:** high

**Location:** `packages/app/src/runtime/persistence/drafts.ts` (50 warnings; e.g. lines 120/124/232/246), `packages/core/src/models-dev.ts:354`, `core/src/mcp/index.ts:313`, `core/src/config/plugin/formatter.ts:73`, `core/src/instructions/index.ts:245`
**Evidence:** Repeated `typeof value !== "object"` narrowing and unannotated assertions — exactly the pattern AGENTS.md bans ("Validate unknown values once, at the owning boundary"; "Untrusted JSON → Effect schema helpers"). The sanctioned idiom already exists in-repo (`packages/app/e2e/utils/mock-server.ts:1627`: `Schema.decodeUnknownOption(Schema.JsonObject)`). 171 `no-runtime-typeof` and 409 missing-`SAFETY:` warnings repo-wide; warnings are non-blocking so drift accretes.
**Impact:** Each hand-rolled assertion is an unchecked contract at a persistence/IO boundary.
**Suggestion:** Convert the boundary parsing in the five named hotspots to schema-based decoding; add `SAFETY:` comments only where an assertion is genuinely safe.
**Validation:** Warning count for the touched files drops to ~0; `bun run check` stays green.

### P3: Related hygiene items (compact list)
- **`app/src/new-session/` decorative cluster: 362 lint warnings + 1-2-letter field names** (`pin-board.tsx:66-95`, 30-field `Pin` type) — densest drift hotspot; style-level fix, restructuring not recommended. (low)
- **Two production console statements** — `app/src/runtime/server/client.tsx:104`, `app/src/shell/tabs/tabs.tsx:554`. (low)
- **Stale suppression** — `packages/util/src/cross-spawn-spawner.ts:15` unused `ast-grep-ignore` (flagged by `bun run check` itself). (low)
- **Unresolved "MUST FIX" type-safety TODO** — `packages/core/src/github-copilot/chat/openai-compatible-chat-language-model.ts:385`. (low)
- **Bare `@ts-ignore`** — `packages/core/src/filesystem/watcher.ts:3`; should be `@ts-expect-error` or a local `.d.ts` so it fails loudly when types ship. (low)

---

## Theme: Coverage, dead code, and packaging hygiene

**Remediation path:** Targeted coverage where the risk is highest (public protocol contract, plugin runtime), manifest corrections, and the mechanical deprecation/dead-code cleanups.
**Estimated effort:** low-medium

### P3: Test coverage thin relative to size and risk in plugin, protocol, util, desktop
**Priority:** P3 | **Complexity:** medium-high | **Validity:** high

**Location:** package level — `packages/plugin` 86 src / 4 test files, `packages/protocol` 40/4, `packages/util` 58/5, `packages/desktop` 154 src / no dedicated test dir
**Evidence:** plugin hosts third-party code execution (security-adjacent) and protocol defines the public HTTP contract consumed by every surface; both sit near the bottom of the coverage table while core (305), tui (190), ai (151) are well covered. Positive outlier: `core/src/shell/scan.ts` — 14 dedicated test files including adversarial/mutation/oracle suites.
**Impact:** The public contract and the plugin runtime can regress without test signal.
**Suggestion:** Prioritize protocol round-trip tests and plugin lifecycle tests before adding more elsewhere.
**Validation:** Coverage counts per package; regression tests added for any bug found.

### P3: Remaining hygiene items (compact list)
- **`cli` imports `@opencode/protocol/errors` at runtime while protocol is only a devDependency** — `packages/cli/src/acp/client.ts:2` ↔ `packages/cli/package.json:59`; satisfied today only by hoisting. Move to dependencies. (low)
- **TUI's only core import is one `Slug` helper** — `packages/tui/src/component/dialog-worktree-name.tsx:1` pulls the whole core domain graph for a 6-line generator; move to `packages/util` or inline. Not a layering violation (manifest-declared) — graph-weight hygiene. (low)
- **Deprecated `Bus.listen` kept alive by ~20 test call sites** — `packages/core/src/bus.ts:166-167`; migrate tests to `subscribe()` stream collectors, then delete. (low-medium)
- **`util/src/binary.ts` referenced only by its own test** — zero imports repo-wide; public-package caveat (`publishConfig.access: public`) — confirm no external consumer, or deprecate first. (low)
- **Session list queries sort/filter on unindexed columns** — `packages/core/src/session/store.ts:145-187` vs schema `core/src/session/sql.ts:74-80`: no index on `directory` or `time_updated`; most frequent server query full-scans and sorts per call. Add a composite index when convenient; sub-100ms today. (low)

---

## Questions

1. **Is any event published on the core bus guaranteed registered in `EventManifest.ServerDefinitions`?** at `packages/server/src/event-feed.ts:49` — unregistered events are silently dropped from the SSE feed (`isOpenCodeEvent` guard); schema tests are targeted `toContain` assertions, not a sweep. No concrete missing event found. A type-level exhaustiveness check would close this permanently.
2. **CORS trusts all localhost origins** at `packages/server/src/cors.ts:13-14` — standard dev-tool tradeoff; docs note recommended.
3. **Unauthenticated embedder contract** at `packages/server/src/routes.ts:104-110` / `fetch.ts:32-34` — CLI/desktop/server-process all provision random passwords; the SDK embedder path was not exhaustively traced. Follow-up confirm.
4. **LIKE wildcard injection in session search** at `packages/core/src/session/store.ts:155` — parameterized (no SQLi); `%`/`_` unescaped causes cosmetic search surprises only.
5. **codemode interpreter sandbox** (`packages/codemode/src/interpreter/interpreter.ts`, 2,357 ln) — full escape audit out of scope; failure mode is bounded by the agent's existing shell permissions.

## Verified sound (notable clean results)

Layering holds everywhere it is asserted (client has zero core/server imports; schema has zero internal imports; app has zero core imports; session-ui's boundary test is executable and passing). Auth surface solid (loopback default, always-provisioned random password, HMAC session tokens derived from the password, single-use scoped PTY/MCP tickets). http-recorder redaction, session-ui DOMPurify pipeline, SSE bounded queues, message pagination, shell-scan fail-closed behavior all verified. Event vocabulary, SSE envelope, and plugin↔ai interfaces consistent end-to-end. Codemap inaccuracies found during verification: session-ui sdk-dependency claim and latex "leaf" status (both corrected by lens 2; no audit impact).

---

## Structural Health Summary

### Overall Assessment
A structurally healthy codebase — clean, enforced layering, strong test culture in core/tui/ai, green static checks — with two sharp edges to fix now (an unsanitized public share surface and a session-lifecycle state bug) and one systemic debt pattern (giant UI files + cross-surface decoder duplication) that is already costing consistency.

### Top Systemic Issues
1. **packages/web is a check-exempt, unsanitized deployed surface** — no sanitizer, phantom type imports, excluded from typecheck. Bring it inside the conventions; the P1 XSS lives here.
2. **Session execution lifecycle diverges from its own documented invariants** — a routine user decline is terminalized as "shutdown", leaking the durable claim and resurrecting the stopped turn after restart. Classify deliberate stops explicitly.
3. **UI giants and cross-surface duplication feed each other** — the same payloads (file diffs, questions, diagnostics, boundary values) are hand-decoded per surface, and the surfaces doing the decoding are the largest files in the repo. A shared util decoder layer shrinks both problems.

### Findings Overview
| Priority | Count |
|----------|-------|
| P0       | 0     |
| P1       | 2     |
| P2       | 6     |
| P3       | 19    |

**Lenses applied:** Code Health, Cross-Module Coherence, Refactoring, Security & Performance, Correctness (opt-in) · **Scope:** full repo (40 packages, ~3,890 src files), per codemap coverage notes

### Coverage
Examined: all 40 packages mapped; detailed analysis of core, server, tui, cli, app, ai, protocol, schema, sdk, plugin, session-ui, client, codemode, util, web + targeted passes on desktop, stats, merman, latex. Not examined in depth: gui-plugins/console/stats/services internals (directory level only), generated client trees, patch review, test-content quality. Static-analysis caveat: turbo typecheck tasks were cache replays, not fresh compiles; `bun run check` result (0 errors) is nonetheless the repo's canonical gate and oxlint was clean.

### Recommended Next Steps
1. **Sanitize the share-site markdown pipeline** (P1, low effort, public surface) — DOMPurify + attribute escaping + scheme allowlist.
2. **Fix the decline→shutdown misclassification** (P1, medium) — explicit reason or typed outcome; add the regression test pinning claim release.
3. **Migrate web imports to `@opencode/schema` + add astro check** (P2, cheap) — makes the share surface verifiable.
4. **Canonicalize paths in `FileAccess.resolve`** (P2, medium) — closes the symlink approval bypass.
5. **Consolidate decoders in `@opencode/util`** (P2/P3, low-medium) — apply-patch, boundary scalars, `isRecord`; picks up lint warnings as a side effect.
6. **Batched lint-drift paydown + drafts.ts schema rewrite** (P2/P3, low).
7. **Incremental god-file splits** (P2, high, start with parse helpers + registry seams where suites already exist).
8. **Session-list composite index** (P3, low) — when next touching the session store.
