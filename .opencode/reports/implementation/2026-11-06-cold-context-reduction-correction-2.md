# Cold-session context reduction: correction 2

Status: correction implemented and self-tested; live model and real-provider verification remain incomplete.

- Approved specification: `.opencode/specs/2026-11-06-cold-context-reduction.md`, R1. User explicitly authorized correction and retesting after QA.
- Baseline: `dev` at `0d2111f091`, plus the previously reported uncommitted implementation and reports. The original specification was not changed.
- QA-01: Root `AGENTS.md` now instructs the agent to resolve all `.opencode/references/` paths against the workspace root into absolute file-tool paths. The correction uses the actual `FileAccess.resolvePath` and `ReadToolFileSystem.read` on all five files from both root and `packages/core` locations. This proves these filesystem operations work when given an absolute path, not that a live model will form or request the correct path.
- QA-02: Expanded non-edit triggers, restored the session step/turn vocabulary, local-status notification, and tier-boundary rules upfront, and audited the moved bullets below. Textual preservation does not establish model compliance.
- QA-03: Real model adherence, the configured router/MCP request, provider tokenization, and later reference-loading costs remain unverified. No live server, installed app, or provider was touched.

## Verification

- Red phase: `bun test test/cold-context-routes.test.ts` from `packages/core` failed both tests before the routing corrections.
- `bun test test/cold-context-routes.test.ts test/instruction-discovery.test.ts test/tool-read-filesystem.test.ts test/file-access.test.ts` from `packages/core`: 52 pass. The three new tests use real path resolution and native read filesystem against the working tree. They are structural/runtime filesystem checks, not an end-to-end model test.
- `bun typecheck` from `packages/core`: passed. `bun run agent:manifest -- --check` from root: passed.
- `bun run script/measure-cold-context.ts 0d2111f091` from `packages/core`: synthetic request JSON fell from 50,130 to 32,042 characters. The fixed synthetic plugin and tool exclude real plugin/provider data.
- Full repository `bun run check`: passed, 36 tasks. `git diff --check`: passed for tracked changes, with Git's line-ending warning.
- Independent Tester/QA and live model adherence: not run in this correction stage. User authorized retesting, not a fresh QA stage.

## Rule-by-rule audit

Each item below is the original baseline instruction or example, retained in full in the named guide. The table records the trigger selected for its section. Examples and introductory paragraphs are grouped after each section. This audit is static and does not assert that a model follows the trigger.

### Style Guide

Destination: `.opencode/references/coding-style.md`. Trigger: Before code work or experimental API/plugin-hook work.

1. One function unless composable or reusable.
2. Validate unknown values once, at the owning boundary; pass typed values inward. No repeated `typeof value === "object"`/property-existence checks; no defensive revalidation of values already guaranteed by schema, constructor, or internal type.
3. No preemptive single-use helpers; inline at the call site unless reused, hiding a genuinely complex boundary, or carrying a clear independent name that improves the caller.
4. Speculative or vanishingly unlikely race/security complexity → explain concrete failure mode, likelihood, complexity cost; get user buy-in first. Never silently expand scope for theoretical robustness.
5. Avoid `try`/`catch` where possible.
6. No `any`.
7. Prefer Bun APIs (`Bun.file()`).
8. Prefer type inference; explicit annotations/interfaces only when necessary (exports, clarity).
9. Prefer functional array methods (`flatMap`, `filter`, `map`) over for loops; type guards on `filter` preserve downstream inference.
10. `src/config`: follow the existing self-export pattern at file top (`export * as ConfigAgent from "./agent.js"`).
11. Effect generators: bind services to named variables before calling methods; no nested service yields (`yield* (yield* Foo.Service).bar()`).
12. No aliased imports (`import { foo as bar } from "..."`, renamed imports like `resolve as pathResolve`).
13. No type-position `import("...")`, e.g. `Schema.declare<import("@opencode/plugin/effect/plugin").Plugin["effect"]>`. Genuine, unavoidable name collision only: aliased type import (`import type { Plugin as PluginDefinition } from "..."`) as last resort — still strongly discouraged.
14. No star imports (`import * as Foo`, `import type * as Foo`).
15. Namespace-style value → import the module's exported namespace by name (`import { Project } from "@opencode/core/project"`), reference `Project.ID`.
16. Dynamic imports for heavy modules needed only in selected code paths, especially startup-sensitive entrypoints. Destructure bindings near the top of the narrowest scope, reading like normal imports. No inline chains (`await import("./module").then((mod) => mod.value())`, `(await import("./module")).value()`). Branch-specific imports stay inside the branch needing them, preserving lazy loading.
17. Helpers stay close to the code they support, below the main export when that reads better; extract only real concepts (`requireConfig`, `readMetadata`).
18. No `Effect` returns from helpers unless genuinely effectful; synchronous parsing, validation, option building stay synchronous.
19. Untrusted JSON → Effect schema helpers (`Schema.UnknownFromJsonString`, `Schema.decodeUnknownOption`), not manual `JSON.parse` in `Effect.try`.
20. Comments cover non-obvious constraints and surprising behavior only — not obvious assignments or control flow.
21. An experimental endpoint lives at `/api/experimental/<group>/...`, its OpenAPI identifier is `experimental.<group>.<method>`, and it lands in the SDK as `client.experimental.<group>.<method>`. Its description says "Experimental: may change without compatibility guarantees."
22. `packages/protocol/test/experimental-identifiers.test.ts` enforces the path and identifier match in both directions; the SDK namespace follows from the path.
23. An experimental field or parameter on a stable endpoint goes under an `experimental` key (`experimental.<name>`), the same way config does (`config.experimental.*`).
24. New endpoints and new default behaviors start experimental.
25. To graduate one, move the route out of `/api/experimental`, drop the `experimental.` prefix, and note it in `CHANGELOG.md`.
26. Experimental HTTP routes change without aliases: rename or remove the route, then update the callers.
27. A breaking move of shipped SDK or plugin API (including moving it under `experimental`) keeps the old path and type names as deprecated aliases of the new ones until the next minor, each marked `@deprecated` with the replacement and "Removed in the next minor". Generated SDK moves get them from the codegen (`compile(..., { aliases: true })` in `packages/client/script/generate.ts`), not by hand.
28. Experimental plugin hooks are named `experimental.*` (`experimental.ws.handshake`).

Non-bullet explanations and examples in this section are preserved verbatim in the destination.

### Session Core

Destination: `.opencode/references/session-core.md`. Trigger: Before investigation, explanation, design, review, or change; vocabulary also retained upfront.

1. Durable events stay minimal: record irreducible new facts; never repeat state derivable by folding ordered aggregate history. Enrich projections and read models with previous or derived state when consumers need self-contained views.
2. Durable prompt admission stays separate from model execution. `Session.prompt(...)` publishes `session.inbox.enqueued`, whose projection inserts one durable `session_inbox` row, then schedules advisory `SessionExecution.wake(sessionID)` unless `resume: false` requests admit-only behavior. Delivery publishes `session.inbox.delivered`; its projection consumes the inbox row and inserts the visible message in the same transaction. `session_inbox` stores only unconsumed work.
3. Reusing a Session ID adopts the existing Session. Reused user/synthetic inbox item ID is idempotent when Session and type match: first admission wins; retried payload, metadata, and delivery mode are ignored, whether pending or already delivered (reconciled from the projected message without retained enqueue history). Cross-Session or cross-type reuse fails. Control items keep their operation-specific conflict behavior.
4. `SessionExecution` stays process-global and Session-ID based. Its local implementation owns the process-local Session coordinator and discovers placement via `SessionStore` + `LocationServiceMap.get(session.location)` only when a drain starts; no layer takes a Session ID. Interruption targets the active process-local ownership chain for that Session; interrupting a known-but-idle or locally-unowned Session is a no-op; the public API rejects an unknown Session.
5. `SessionRunner`, model resolution, tool registry, permissions, filesystem: all Location-scoped. Omitted `Location.workspaceID` = implicit-local placement; explicit workspace identity reserved for future placement semantics.
6. Each step: one explicit `llm.stream` call continuing from reloaded history. No in-memory tool loop.
7. Local Session drains stay process-local until clustering is implemented. `SessionRunCoordinator` joins explicit same-Session resumes, coalesces prompt wakeups, lets different Sessions run concurrently. Write-ahead execution claim marks a process-local busy period for restart recovery: terminal completion, failure, or user interruption releases it; shutdown interruption and process death preserve it. Startup recovery resumes claimed top-level Sessions with durable per-execution attempt accounting. Claim = recovery marker, not clustered ownership, fencing, or an exactly-once guarantee.
8. Delivery vocabulary stays explicit. Prompts steer by default. Safe step boundaries: steered compaction takes priority up to the first steered move control; other steers keep enqueue order. Idle boundary: steers take priority; otherwise exactly one queued item delivers before the runner reevaluates continuation. Inbox items may be cancelled or changed between queue and steer before delivery. Promoting new user input resets the selected agent's step allowance; a steer batch resets it once.
9. One step = one logical LLM call; its durable record covers only the model-visible span. Never write "provider turn"; never use bare "turn" for a single call — "turn" is reserved for the future assistant-turn unit containing all steps from prompt promotion until the session would go idle.
10. Event replay ownership stays separate from clustered Session execution ownership.

Non-bullet explanations and examples in this section are preserved verbatim in the destination.

### Technical Communication and Decision Support

Destination: `.opencode/references/technical-communication.md`. Trigger: Before preparing prose or explaining technical decisions.

1. **Terms.** On first use of a term, acronym, concept, or tool: what it is in everyday English, what it does here, why it matters to this project. Keep the real term so it becomes familiar; never swap one piece of jargon for another. Explain only as much as the decision needs. Instead of "a middleware abstraction with dependency injection to decouple the services", say "separate these parts so they don't depend directly on each other, so changing one is less likely to break another; developers call this loose coupling".
2. **Subjects.** Cover what it is, what it does, why it matters here, and whether it needs a decision or only awareness. Skip questions that do not apply.
3. **Decisions.** Never present bare implementation options. State the choice in plain language, give each option's practical gain and cost, name the consequences that matter (quality, reliability, complexity, performance, security, cost, maintenance), then recommend one and say why. Frame choices around outcomes, not mechanisms. Routine engineering choices are yours; escalate only when a choice materially affects scope, cost, security, reliability, user experience, maintenance, or an established requirement, and follow existing approval boundaries.
4. **Problems.** For bugs, errors, and design weaknesses: what is happening, why, what the user would experience, whether it affects current behavior or future maintenance, how severe, whether action is needed, and a proportionate fix. Separate confirmed problems from risks and speculation; do not inflate an issue because it offends an ideal.
5. **Analogies.** Construction, project-management, or everyday parallels when they genuinely help. Never force one, never make it childish, never let it replace an accurate explanation, and name where it breaks down.
6. **Accuracy.** Simplification must not change meaning. Keep real distinctions, uncertainty, assumptions, and exact identifiers, paths, commands, and config values; explain why a detail matters instead of dropping it. Mark recommendations as recommendations, requirements as requirements.
7. **Tone.** Lead with the answer or recommendation, then the reasoning. Direct and respectful, never patronizing. Do not re-explain what the user has already shown they understand. Short answers for simple questions, enough background for complex ones; bullets and a concrete example when they shorten the explanation.
8. **Decision shape** (adapt, never template): Decision, Context, Options, Recommendation, Impact, Next step.
9. **Test before sending:** would an intelligent professional without software engineering experience understand what this is, why it matters, and what to do next? If not, rewrite.

Non-bullet explanations and examples in this section are preserved verbatim in the destination.

### Local Updates

Destination: `.opencode/references/local-updates.md`. Trigger: Before checking/reporting status, rollback, pruning, updating, packaging, or installing; status and permission boundaries retained upfront.

1. "Update opencode", "create local update package", and "install local build" all mean one procedure: `bun run update:local` (alias of `install:local`) from the repo root on a committed `dev` tree. It installs both the CLI and the agent system. Full process: `docs/local-development.md`; confirmed decisions: `docs/intent/local-update.md`; agent-system contract: `agent-system/README.md`.
2. The canonical agent sources are `.opencode/agents/` and `.opencode/skills/`. `~/.config/opencode/` is an install target; never edit it as source. The installer copies the managed roles and global-scope skills there, merges the canonical tier keys into `opencode.json` and `opencode-model-router.overrides.jsonc`, and writes `agent-system.installed.json`.
3. Never install unasked. If `bun run local:status` shows `dev` ahead of the installed build, say so and wait for the user to request the update.
4. The installer refuses a dirty tree for a full install; commit first. `-AgentsOnly` reports the dirty tree and copies the working tree so assets can be iterated before committing. Its compiled smoke test is the only hard gate; other checks are advisory per the checklist in `docs/local-development.md`.
5. Options: `-AgentsOnly` (assets only, no CLI build), `-SkipAgents` (CLI only), `-ConfigRoot <path>` (isolated clean install), `-Force` (back up and replace a locally modified managed file), `-PromptPermissions` (restore `prompt` mode; autoaccept is the default and suppresses tool permission prompts only, leaving the SDD stage approvals intact).
6. Companion commands: `local:list`, `local:status`, `local:rollback`, `local:prune`, `agent:install`, `agent:status`, `agent:rollback`, `agent:manifest`, `test:agent-system`. Installs archive the previous build and prune the archive to the newest 5; agent-system backups use the same retention.
7. Tier boundary: `fast`, `medium`, and `heavy` are plugin-registered subagents and the sole owners of model selection. The four SDD roles keep their own `subagent` permissions and stage gates; tier selection does not alter stage authorization, approval gates, or correction limits. `plan` is disabled; `spec-writer` is the single planning primary agent and `build` remains the default coding agent.

Non-bullet explanations and examples in this section are preserved verbatim in the destination.

### Live TUI Testing

Destination: `.opencode/references/live-tui-and-desktop.md`. Trigger: Before planning, reviewing, or running live TUI tests.

1. `bun run dev:live` from a development worktree tests its TUI against the currently elected `opencode` background server and live sessions; pass a directory when needed (`bun run dev:live /path/to/project`).
2. Script discovers server via `opencode service status`, injects its private local credential (`opencode service get password`), uses the `dev` TUI storage channel so tabs and client-local state match the installed client.
3. Prefer `dev:live` over plain `bun run dev`. Implicit managed-service connection may replace the live server when worktree client version differs; explicit `--server` warns and continues without replacing it.
4. **Concurrent testing:** Worktree isolation does not isolate background servers, ports, storage, or live sessions — `dev:live` targets the currently elected server and the shared `dev` TUI storage channel from any worktree. Coordinate concurrent tests; use separate instances or storage to prevent interference.

Non-bullet explanations and examples in this section are preserved verbatim in the destination.

### Live Desktop Diagnostics

Destination: `.opencode/references/live-tui-and-desktop.md`. Trigger: Before interacting with a live window or planning, reviewing, or attaching diagnostics.

1. When attaching Playwright to a running desktop app, use `chromium.connectOverCDP(endpoint, { noDefaults: true })`.
2. Without `noDefaults`, Playwright applies light-mode media emulation during attachment. An app following the system theme then flashes light until the connection closes. The option also preserves the existing focus and other media preferences.
3. Do not emulate a color scheme or reduced-motion preference on the user's live window unless explicitly requested; use an isolated test context for those scenarios.

Non-bullet explanations and examples in this section are preserved verbatim in the destination.

### TUI Stories

Destination: `.opencode/references/live-tui-and-desktop.md`. Trigger: Before planning, reviewing, creating, or changing a story.

1. TUI story request → fixture-driven story under `packages/tui/src/feature-plugins/system/storybook`, registered in `index.tsx`.
2. Render the real production component, not a visual copy; keep submissions and side effects local so the story is safe to explore repeatedly.
3. Expose state dimensions via story keybindings, listed in `StoryFooter`; include a reset command when combinations can leave the fixture confusing.
4. Run one story: `OPENCODE_STORY=<story-id> bun run dev:live` from the development worktree; exercise narrow + wide terminal sizes when layout matters.

Non-bullet explanations and examples in this section are preserved verbatim in the destination.

### TUI Theme Tokens

Destination: `.opencode/references/live-tui-and-desktop.md`. Trigger: Before planning, reviewing, choosing, using, or changing tokens.

1. Choose tokens by semantic role, never current color: no raw `theme.hue`, no borrowing unrelated semantic tokens for a preferred appearance.
2. `text.feedback`/`background.feedback`: outcome/status feedback only (errors, warnings, success, informational). `formfield` states: form-control text, ordinals, selection markers. `action` states: actions.
3. Missing semantic role → extend theme schema, defaults, resolution, types before component use; never repurpose the nearest-looking token.
4. Changing the public token surface → verify built-in light + dark defaults and the custom-theme fallback path, plus the affected component.

Non-bullet explanations and examples in this section are preserved verbatim in the destination.

