# Remediation Plan — audit findings (.audit/report.md)

Produced by planner agent, 2026-10-28. Status: **COMPLETE — all phases (1-5) merged to `dev` and verified (root `bun run check` 36/36). Phase 6 backlog deferred to individually-planned tasks.**

### Requirements Restatement

Remediate the audit findings (`.audit/report.md`, 0×P0 / 2×P1 / 6×P2 / 19×P3) in risk order, scoped to the P1s, P2s, and the P3s that are cheap or adjacent to P1/P2 work. Specifically:

1. **P1** — Stored XSS in the share-site markdown renderer (`packages/web`): unsanitized `marked` output into `innerHTML`, unescaped `href`/`title` attributes, no scheme filtering — verified at `content-markdown.tsx:12-14, 40, 53`.
2. **P1** — Tool-permission decline misclassified as `"shutdown"` interruption: `step.ts:296` bare `Effect.interrupt` → `terminal()` (`execution.ts:49`) defaults to `"shutdown"` → durable claim preserved, jobs keep running → `resumeSuspendedSessions` (`restart.ts:77-98`) auto-resumes the deliberately stopped turn after restart.
3. **P2** — `packages/web` types against phantom `opencode/session/*` modules and is excluded from every typecheck.
4. **P2** — Symlink paths bypass the `external_directory` approval boundary (`file-access.ts:95-106`); **P3** — non-constant-time password compare (`server/src/auth.ts:33-37`).
5. **P2** — Triplicated apply-patch/FileDiff decoders (already drifted), plus the `isRecord`/boundary-scalar duplication cluster.
6. **P2** — Boundary-parsing convention drift (5 named hotspots, `drafts.ts` worst).
7. Adjacent **P3**s: session-adoption range bound (`projector.ts:561-571`).

Giant-file splits (TUI session route 3,820 ln, tool-renderer 2,722 ln, `Prompt`, `createData`, `ProviderConnection`) and remaining P3 hygiene are **deferred to individually-planned follow-up tasks** — they are maintainability debt with no failure path, and each split is a multi-day change deserving its own plan.

## Implementation Phases

Each phase is an independent task → its own worktree/branch off current local `dev` (per AGENTS.md), conventional commits, tests run from the affected package directory. Phases are ordered by risk; 1–5 are sequenced, 6 is backlog.

### Phase 1 — Sanitize the share-site markdown pipeline (branch `share-sanitizer`, package `web`)
- 1.1 Add `dompurify` (+ types) to `packages/web/package.json`. Low risk.
- 1.2 Create `packages/web/src/components/share/sanitize.ts`: pure `markdown → sanitized html` pipeline — `markedWithShiki.parse()` → `DOMPurify.sanitize()`, mirroring the proven session-ui config (`session-ui/src/components/markdown-cache.tsx:76-80`): keep the `rel="noopener noreferrer"` hook, `ADD_ATTR: ["target"]` so the existing `target="_blank"` survives, and rely on DOMPurify's default URI regexp to drop `javascript:`/`data:` schemes. DOMPurify defaults also strip event-handler attributes, closing the attribute-injection vector.
- 1.3 Fix the link renderer at `content-markdown.tsx:12-14`: escape `href`/`title` (`&`, `"`, `<`, `>`) before interpolation — defense-in-depth under the sanitizer.
- 1.4 Route `ContentMarkdown`'s `createResource` (line 40) through the new pipeline; keep the `strip()` wrapper behavior unchanged.
- 1.5 Add a `test` script to `packages/web/package.json` and unit-test the pure pipeline with bun test. DOMPurify needs a DOM — use a `jsdom` window in tests, mirroring session-ui's setup. Payloads: raw `<script>`/`<img onerror>`, `"`-breaking `title` attribute, `javascript:` link, shiki-highlighted block (must survive intact), `target`/`rel` preservation.
- Validation: `bun test` in `packages/web`; `astro build`; manual pass on a shared-session page.

### Phase 2 — Classify permission decline as a deliberate user stop (branch `decline-classification`, package `core`) — *consumer survey before writing code*
- 2.1 Survey all consumers of `SessionEvent.Execution.Interrupted`'s `reason` field (TUI, app, SSE feed, plugin, SDK) to decide: settle declines as reason `"user"` (minimal vocabulary) vs. a new `"declined"` reason. Prefer `"user"` unless a consumer requires otherwise.
- 2.2 Replace the bare `return yield* Effect.interrupt` at `runner/step.ts:294-297` with a typed failure (dedicated tagged error; keep the `isLocationClosed()` branch untouched).
- 2.3 Extend `terminal()` (`execution.ts:47-51`) to classify that tag as `{ type: "interrupted", reason: "user" }` so `settled()` takes the release branch (`execution.ts:127-131`): claim released, `jobs.cancel(sessionID)` runs.
- 2.4 Update the silent-cause classification (`reportLifecycle` at `execution.ts:62-72`, drain `tapCause` at 96-100) so the decline failure is not logged as an error. Check `model-request.ts:453-454` (DeclinedError already in `ExecuteError`) for interactions.
- 2.5 Update pinned tests encoding old behavior (`core/test/session-execution.test.ts:49-53`, `core/test/session-runner.test.ts:5214-5273`); add: decline → claim released + jobs cancelled + reason asserted; genuine shutdown → claim preserved; sweep does not synthesize a resume for a declined session.
- 2.6 Adjacent P3: fix adoption range bound at `session/projector.ts:561-571` — escaped `LIKE prefix || '%'` (or drop the SQL upper bound; in-memory filter at line 578 already guards). Test with an emoji subdirectory.
- Validation: `bun test` in `packages/core`; `bun run check`.

### Phase 3 — Bring `packages/web` inside the typecheck (branch `web-typecheck`, package `web`; land in the same commit as its error cleanup so the canonical gate never goes red)
- 3.1 Add `@opencode/schema` to `packages/web/package.json` dependencies and `"typecheck": "astro check"` (`posts/package.json` is the precedent; turbo generic task picks it up).
- 3.2 Rewrite phantom imports at `Share.tsx:8-10` and `pages/s/[id].astro:4` to `@opencode/schema` (`MessageV2`, `Session`).
- 3.3 Fix the latent type-error wave `astro check` surfaces (v1→v2 conversion at `Share.tsx:503-549` is the likely hotspot). Timebox; explicit commented follow-ups instead of blanket suppressions.
- Validation: `bun run check` covers `web`; `astro build`.

### Phase 4 — Sandbox boundary and auth hygiene (branch `file-access-realpath`, packages `core`, `server`)
- 4.1 In `core/src/file-access.ts:95-106`, canonicalize **both** the queried path and the workspace root via realpath (fall back to lexical on ENOENT — reuse `FSUtil.resolve` at `util/src/fs-util.ts:262-270`) before the containment decision. Both sides, or symlinked workspaces (macOS `/tmp` → `/private/tmp`) start prompting as external.
- 4.2 In `server/src/auth.ts:33-37`, switch `authorized()`'s password compare to `timingSafeEqual` with a length guard.
- 4.3 Tests: workspace symlink → outside target asserts `external_directory`; symlink-to-symlinked-workspace stays internal.
- Validation: `bun test` in `packages/core`, `packages/server`; `bun run check`.

### Phase 5 — Shared decoder layer + boundary-parse paydown (branch `decoder-consolidation`, packages `util`, `tui`, `session-ui`, `cli`, `stats`, then `app`)
- 5.1 One superset FileDiff decoder; re-point `session-ui/src/components/apply-patch-file.ts:17-55`, `tui/src/routes/session/index.tsx:3764-3789`, `tui/src/mini/tool.ts:218-239` (decide mini's raw-status divergence by reading its consumer). Tests from all three call sites' accepted inputs first; TUI snapshot suite is the net.
- 5.2 Delete the three local `isRecord` copies in favor of `util/src/record.ts:2`.
- 5.3 New `util/src/boundary.ts` (`stringValue`/`recordValue`/`finiteNumber`); adopt in tui/cli/stats (×5 sites).
- 5.4 Question/diagnostics metadata: adopt the session-ui Effect-Schema idiom when consolidating TUI's manual record-walking. Can split into its own task.
- 5.5 Schema-based boundary parsing in the five hotspots: `app/src/runtime/persistence/drafts.ts` (50 warnings — biggest, preserve read-path compatibility with persisted shapes), `core/src/models-dev.ts:354`, `core/src/mcp/index.ts:313`, `core/src/config/plugin/formatter.ts:73`, `core/src/instructions/index.ts:245`.
- Validation: touched-file warning counts → ~0; `bun run check` green; `bun test` per touched package.

### Phase 6 — Deferred backlog (each independently planned)
God-file splits (TUI session route, tool-renderer, `shell/scan.ts`, `Prompt`, `createData`, `ProviderConnection`); session-list composite index; protocol/plugin coverage; `Bus.listen` migration; `cli` protocol dep; TUI `Slug` graph-weight; `binary.ts` confirm; `watcher.ts:3` `@ts-ignore`; console statements; event-manifest exhaustiveness check (report Question 1).

## Risks
- **HIGH — Lifecycle classification ripples** (Phase 2): wrong direction either still resurrects declined turns or breaks restart-continuity. Mitigation: consumer survey first; pin both directions in tests; no schema change.
- **HIGH — `astro check` un-hides unknown latent errors** (Phase 3): never land the typecheck script red; migration + cleanup in one commit.
- **MEDIUM — realpath can flip existing approvals** (Phase 4): canonicalize both sides; test symlinked-workspace stays internal.
- **MEDIUM — decoder unification must be a true superset** (Phase 5): tests from all three consumers' accepted inputs first.
- **MEDIUM — DOMPurify in bun test needs a DOM shim**: assert sanitized non-empty output, mirror session-ui harness.
- **LOW:** ~20 KB share-page bundle; `timingSafeEqual` length guard; LIKE escaping in adoption fix; `drafts.ts` persisted-shape compatibility.

## Estimated Complexity
**Overall: MEDIUM** (~6–9 focused days for Phases 1–5; Phase 6 deferred).
- Phase 1: LOW (0.5–1 day) · Phase 2: MEDIUM (1–2 days) · Phase 3: LOW–MEDIUM (0.5–2 days) · Phase 4: MEDIUM (0.5–1 day) · Phase 5: LOW–MEDIUM (1.5–2.5 days)
