- After changing public Protocol/Server `HttpApi`: run `bun run generate` from repo root; never edit generated client files directly.
- Dependency direction: Schema → Core and Protocol → Server. Client runtime may depend on Schema and Protocol only, never Core or Server; `sdk` composes Client, Core, Server.
- No Changesets: never add `.changeset` files; use the existing release workflow.
- Default branch `dev`: base branches/worktrees on `origin/dev`, target PRs at `dev`, diff against `origin/dev` unless told otherwise.

## Agent Skills

- ECC skills: `.opencode/skills/<name>/SKILL.md`; setup, source version, and compatibility notes: `.opencode/ecc/README.md`.
- Use relevant ECC skills and configured specialist agents. Complex changes: `planner` or `/plan`; implementation: `tdd-workflow`; final verification: `verification-loop`; security: `security-review`; interfaces: `api-design`; review: `code-reviewer` or `/code-review`. Project and package instructions take precedence over generic ECC examples.
- Keep the custom and package test skills alongside ECC. Before changing tests, follow the test-skill routing in the Testing section below.
- Definition of Done (`.opencode/references/definition-of-done.md`): project completion criteria. Shared checklists remain in `.opencode/references/`.
- ECC's native v2 hook adapter is enabled at `.opencode/ecc/plugin`; capability and verification notes: `.opencode/ecc/plugin/verification.md`. The legacy v1 plugin and its custom tools remain disabled. The existing `/learn` command is preserved; ECC uses `/ecc-learn`.

## Workflow

- **Inspect:** read relevant code, tests, callers; check branch/worktree state; preserve existing changes and untracked files. Nontrivial task → define scope + acceptance criteria, clarify consequential ambiguity.
- **Implement:** simplest correct change. Preserve interfaces, module boundaries, compatibility, data; no unrelated work, no speculative abstraction.
- **Protect:** handle meaningful failures, edge cases, permissions, security risks. Never conceal errors.
- **Verify:** run relevant checks; fix failures and rerun; inspect final diff; update affected docs.

## Live TUI Testing

- `bun run dev:live` from a development worktree tests its TUI against the currently elected `opencode` background server and live sessions; pass a directory when needed (`bun run dev:live /path/to/project`).
- Script discovers server via `opencode service status`, injects its private local credential (`opencode service get password`), uses the `dev` TUI storage channel so tabs and client-local state match the installed client.
- Prefer `dev:live` over plain `bun run dev`. Implicit managed-service connection may replace the live server when worktree client version differs; explicit `--server` warns and continues without replacing it.
- **Concurrent testing:** Worktree isolation does not isolate background servers, ports, storage, or live sessions — `dev:live` targets the currently elected server and the shared `dev` TUI storage channel from any worktree. Coordinate concurrent tests; use separate instances or storage to prevent interference.

## TUI Stories

- TUI story request → fixture-driven story under `packages/tui/src/feature-plugins/system/storybook`, registered in `index.tsx`.
- Render the real production component, not a visual copy; keep submissions and side effects local so the story is safe to explore repeatedly.
- Expose state dimensions via story keybindings, listed in `StoryFooter`; include a reset command when combinations can leave the fixture confusing.
- Run one story: `OPENCODE_STORY=<story-id> bun run dev:live` from the development worktree; exercise narrow + wide terminal sizes when layout matters.

## TUI Theme Tokens

- Choose tokens by semantic role, never current color: no raw `theme.hue`, no borrowing unrelated semantic tokens for a preferred appearance.
- `text.feedback`/`background.feedback`: outcome/status feedback only (errors, warnings, success, informational). `formfield` states: form-control text, ordinals, selection markers. `action` states: actions.
- Missing semantic role → extend theme schema, defaults, resolution, types before component use; never repurpose the nearest-looking token.
- Changing the public token surface → verify built-in light + dark defaults and the custom-theme fallback path, plus the affected component.

## Branch Names

Branch names: at most three short words, hyphen-separated, no slashes or type prefixes (`feat/`). Examples: `session-recovery`, `fix-scroll-state`, `regenerate-sdk`.

## Worktrees

- Independent concurrent tasks → separate worktrees and branches based on `origin/dev`; continue related work in the task's existing worktree. Follow Branch Names.
- Multiple agents may inspect a worktree, but only one may modify it. Never check out a branch active in another worktree; never switch, reset, remove, or repurpose another session's worktree.
- Before consequential Git operations (branch switches, worktree create/remove, integration): inspect `git worktree list`, each checkout's branch, and working-tree status — never assume. Preserve existing work.
- **Integration:** Feature branches integrate into `dev` through CI-validated, squash-merged PRs — never advance local `dev` directly to a task branch or via `git branch -f`. After merge, synchronize local `dev` with `origin/dev` only by fetch + `git merge --ff-only origin/dev` (verified fast-forward). Never force-update or overwrite divergent history. Follow Git Safety approval requirements.
- **PR lifecycle:** Opening and merging a PR may occur in the same task or agent session. Treat them as separate authorization checkpoints unless the user explicitly approves the complete workflow upfront. Before merging, confirm required CI checks, reviews, mergeability, and final diff. Squash-merge into `dev` only when all requirements are satisfied; never bypass branch protections. After merge, safely synchronize local `dev` and clean up the task worktree.
- After integration: remove the task worktree + branch only after verifying no uncommitted or unmerged work remains. Rule changes apply to new tasks; never disrupt worktrees or branches used by active sessions.

## Git Safety

- Never force-push, rewrite published history, run destructive `git reset`/`git clean`, or discard others' work. Unclear Git state or possible data loss → stop, identify what must be resolved first.
- Explicit approval before pushing to a remote, opening a PR, or creating a tag/release.

## Commits and PR Titles

Conventional messages and titles: `type(scope): summary`. Types: `feat`, `fix`, `perf`, `docs`, `chore`, `refactor`, `test`. Scopes optional — affected package/area when helpful (`core`, `opencode`, `tui`, `app`, `desktop`, `sdk`, `plugin`).

Examples: `fix(tui): simplify thinking toggle styling`, `docs: update contributing guide`, `chore(sdk): regenerate types`.

Before committing: inspect status + diff; stage only task files; exclude secrets, credentials, unnecessary artifacts.

User-facing `feat`/`fix`/`perf` PRs: add a small looping animated SVG under `### Visual` in the PR body (240×72 `svg` block, e.g. dock growing out of the composer, spinners turning in step). `currentColor` + opacity, works in light and dark; unanimated state = good still (shown under reduced motion); CSS or SMIL only; <8 KB, no scripts or external references. Desktop beta "What's new" dialog shows it.

## Style Guide

### General Principles

- One function unless composable or reusable.
- Validate unknown values once, at the owning boundary; pass typed values inward. No repeated `typeof value === "object"`/property-existence checks; no defensive revalidation of values already guaranteed by schema, constructor, or internal type.
- No preemptive single-use helpers; inline at the call site unless reused, hiding a genuinely complex boundary, or carrying a clear independent name that improves the caller.
- Speculative or vanishingly unlikely race/security complexity → explain concrete failure mode, likelihood, complexity cost; get user buy-in first. Never silently expand scope for theoretical robustness.
- Avoid `try`/`catch` where possible.
- No `any`.
- Prefer Bun APIs (`Bun.file()`).
- Prefer type inference; explicit annotations/interfaces only when necessary (exports, clarity).
- Prefer functional array methods (`flatMap`, `filter`, `map`) over for loops; type guards on `filter` preserve downstream inference.
- `src/config`: follow the existing self-export pattern at file top (`export * as ConfigAgent from "./agent.js"`).
- Effect generators: bind services to named variables before calling methods; no nested service yields (`yield* (yield* Foo.Service).bar()`).

Inline values used only once:

```ts
// Good
const journal = await Bun.file(path.join(dir, "journal.json")).json()

// Bad
const journalPath = path.join(dir, "journal.json")
const journal = await Bun.file(journalPath).json()
```

### Destructuring

Avoid unnecessary destructuring; dot notation preserves context.

```ts
// Good
obj.a
obj.b

// Bad
const { a, b } = obj
```

### Imports

- No aliased imports (`import { foo as bar } from "..."`, renamed imports like `resolve as pathResolve`).
- No type-position `import("...")`, e.g. `Schema.declare<import("@opencode/plugin/effect/plugin").Plugin["effect"]>`. Genuine, unavoidable name collision only: aliased type import (`import type { Plugin as PluginDefinition } from "..."`) as last resort — still strongly discouraged.
- No star imports (`import * as Foo`, `import type * as Foo`).
- Namespace-style value → import the module's exported namespace by name (`import { Project } from "@opencode/core/project"`), reference `Project.ID`.
- Dynamic imports for heavy modules needed only in selected code paths, especially startup-sensitive entrypoints. Destructure bindings near the top of the narrowest scope, reading like normal imports. No inline chains (`await import("./module").then((mod) => mod.value())`, `(await import("./module")).value()`). Branch-specific imports stay inside the branch needing them, preserving lazy loading.

### Variables

Prefer `const` over `let`; ternaries or early returns over reassignment.

```ts
// Good
const foo = condition ? 1 : 2

// Bad
let foo
if (condition) foo = 1
else foo = 2
```

### Control Flow

No `else`; prefer early returns.

```ts
// Good
function foo() {
  if (condition) return 1
  return 2
}

// Bad
function foo() {
  if (condition) return 1
  else return 2
}
```

### Complex Logic

Several validation branches or supporting details → main function reads as the happy path; supporting details move to small helpers below.

```ts
// Good
export function loadThing(input: unknown) {
  const config = requireConfig(input)
  const metadata = readMetadata(input)
  return createThing({ config, metadata })
}

function requireConfig(input: unknown) {
  ...
}
```

- Helpers stay close to the code they support, below the main export when that reads better; extract only real concepts (`requireConfig`, `readMetadata`).
- No `Effect` returns from helpers unless genuinely effectful; synchronous parsing, validation, option building stay synchronous.
- Untrusted JSON → Effect schema helpers (`Schema.UnknownFromJsonString`, `Schema.decodeUnknownOption`), not manual `JSON.parse` in `Effect.try`.
- Comments cover non-obvious constraints and surprising behavior only — not obvious assignments or control flow.

### Schema Definitions (Drizzle)

snake_case field names, so columns never redefine names as strings.

```ts
// Good
const table = sqliteTable("session", {
  id: text().primaryKey(),
  project_id: text().notNull(),
  created_at: integer().notNull(),
})

// Bad
const table = sqliteTable("session", {
  id: text("id").primaryKey(),
  projectID: text("project_id").notNull(),
  createdAt: integer("created_at").notNull(),
})
```

## Testing

- Minimal mocks; `globalThis.*` only when no alternative exists.
- Test the actual implementation; never duplicate logic into tests.
- Tests never run from repo root (guard: `do-not-run-tests-from-root`); run from package directories (e.g. `packages/core`).
- Before writing or changing tests, read the matching `.opencode/skills` skill: `unit-tests` (bun test), `tui-tests` (OpenTUI renderer tests), `app-e2e-tests` (Playwright, `packages/app/e2e`), `component-tests` (Playwright on stories, `packages/stories`) — they cover known CI slowness/flakiness causes.

## Checks

- `bun run check` from repo root: canonical full lint + type-check.
- Focused iteration: `bun typecheck` from the affected package directory (e.g. `packages/core`). Never run `tsc` directly.
- Local `typecheck` scripts: `bun check`. CI and publishing: `typecheck:tsc` (official `@typescript/native`). Disagreement → `tsc` is source of truth; reproduce via `bun run typecheck:tsc` from the package directory.
- `bun check` targets TypeScript 7.1, not the `7.0.2` `process.versions.typescript` reports (oven-sh/bun#46536); writes no declaration files, so declaration-emit errors (TS5088, TS2883) appear only in `tsc` — do not report those. Other divergence: file a minimal dependency-free repro at https://github.com/oven-sh/bun/issues with both outputs.
- Never claim unrun or failed checks passed; never weaken checks to manufacture a pass.

## Session Core

- Durable events stay minimal: record irreducible new facts; never repeat state derivable by folding ordered aggregate history. Enrich projections and read models with previous or derived state when consumers need self-contained views.
- Durable prompt admission stays separate from model execution. `Session.prompt(...)` publishes `session.inbox.enqueued`, whose projection inserts one durable `session_inbox` row, then schedules advisory `SessionExecution.wake(sessionID)` unless `resume: false` requests admit-only behavior. Delivery publishes `session.inbox.delivered`; its projection consumes the inbox row and inserts the visible message in the same transaction. `session_inbox` stores only unconsumed work.
- Reusing a Session ID adopts the existing Session. Reused user/synthetic inbox item ID is idempotent when Session and type match: first admission wins; retried payload, metadata, and delivery mode are ignored, whether pending or already delivered (reconciled from the projected message without retained enqueue history). Cross-Session or cross-type reuse fails. Control items keep their operation-specific conflict behavior.
- `SessionExecution` stays process-global and Session-ID based. Its local implementation owns the process-local Session coordinator and discovers placement via `SessionStore` + `LocationServiceMap.get(session.location)` only when a drain starts; no layer takes a Session ID. Interruption targets the active process-local ownership chain for that Session; interrupting a known-but-idle or locally-unowned Session is a no-op; the public API rejects an unknown Session.
- `SessionRunner`, model resolution, tool registry, permissions, filesystem: all Location-scoped. Omitted `Location.workspaceID` = implicit-local placement; explicit workspace identity reserved for future placement semantics.
- Each step: one explicit `llm.stream` call continuing from reloaded history. No in-memory tool loop.
- Local Session drains stay process-local until clustering is implemented. `SessionRunCoordinator` joins explicit same-Session resumes, coalesces prompt wakeups, lets different Sessions run concurrently. Write-ahead execution claim marks a process-local busy period for restart recovery: terminal completion, failure, or user interruption releases it; shutdown interruption and process death preserve it. Startup recovery resumes claimed top-level Sessions with durable per-execution attempt accounting. Claim = recovery marker, not clustered ownership, fencing, or an exactly-once guarantee.
- Delivery vocabulary stays explicit. Prompts steer by default. Safe step boundaries: steered compaction takes priority up to the first steered move control; other steers keep enqueue order. Idle boundary: steers take priority; otherwise exactly one queued item delivers before the runner reevaluates continuation. Inbox items may be cancelled or changed between queue and steer before delivery. Promoting new user input resets the selected agent's step allowance; a steer batch resets it once.
- One step = one logical LLM call; its durable record covers only the model-visible span. Never write "provider turn"; never use bare "turn" for a single call — "turn" is reserved for the future assistant-turn unit containing all steps from prompt promotion until the session would go idle.
- Event replay ownership stays separate from clustered Session execution ownership.

## Communication

- Plain, direct, concise replies, docs, and commit messages. No filler, staged openers, em-dash chains, or contrived contrasts. Explain jargon once for nondevelopers, without talking down. Never invent facts or certainty.
- **Complete** = acceptance criteria met + applicable verification passed. Implementation finished but checks unrun → **Complete (unverified)**; otherwise **Partial** or **Blocked**. Separate attempted work from confirmed results.
- **Final task report** (usually <=120 words; expand only for material complexity/risk): **Status** — Complete / Complete (unverified) / Partial / Blocked; **Done** — 1–3 meaningful outcomes; **Verified** — checks actually run + results, noting material gaps; **Pending** — open issues/risks/decisions, else "None"; **Next** — highest-value next action + owner, else "None"; **Git** — file/branch/commit/PR state + skipped checks. Lead with the outcome; use for task completion only, not progress updates.
