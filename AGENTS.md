## Repository Invariants

- After changing public Protocol/Server `HttpApi`: run `bun run generate` from repo root; never edit generated client files directly.
- Dependency direction: Schema → Core and Protocol → Server. Client runtime may depend on Schema and Protocol only, never Core or Server; `sdk` composes Client, Core, Server.
- No Changesets: never add `.changeset` files; use the existing release workflow.
- Daily integration branch `dev`: base new tasks on the current local `dev`; use `origin/dev` when no unpushed local work exists. Preserve `main` for future release work. GitHub's default branch may remain `main`.

## Skills

The repository `.opencode/skills/` tree is the canonical source for the managed skill library: 32 global-scope skills and 10 project-scope skills. `~/.config/opencode/skills/` is an install target, never a source. On OpenCode V2 the precedence is project `.opencode/skills/` → personal `~/.config/opencode/skills/`, so the project copy is the one that runs; edit that copy or the change is invisible.

- **Global-scope skills** are copied to the global config root by `bun run update:local`. They supply general technique: the writing and prompting skills, review and planning skills, security and performance skills, and the rest of the 32-skill library.
- **Project-scope skills** supply repository knowledge and tooling and are never installed globally: `unit-tests`, `tui-tests`, `app-e2e-tests`, `component-tests`, `effect`, `opencode-dev`, `humanizer_fife`, `plan-hardening`, `rtl-aware-development`, and `sample-skill`.
- **Adding or changing a skill:** edit `.opencode/skills/<name>/`, add the name to `GLOBAL_SKILLS` or `PROJECT_SKILLS` in `script/agent-system/lib.ts`, run `bun run agent:manifest`, then `bun run agent:manifest -- --check` and `bun run test:agent-system`.

Use a skill when its description matches the task. A question, a read-only inspection, or a one-line fix needs no skill.

Plans under `docs/superpowers/` and `docs/plans/` are preserved historical artifacts; any `REQUIRED SUB-SKILL` headers in them refer to retired tooling and are not active instructions.

`.opencode/references/` holds the standing checklists: `definition-of-done.md` (completion bar), `testing-patterns.md`, `orchestration-patterns.md` (slash-command and persona patterns), and the `security-`, `performance-`, `observability-`, and `accessibility-checklist.md` files. Read the matching one when a change touches that dimension.

All `.opencode/references/` paths in these instructions are relative to the repository root, not the session directory. Before using a file tool, resolve them against the repository root to an absolute path; use the environment's workspace root folder.

## Lessons Learned

- Record lessons only when the `lessons-learned` skill is invoked.
- Document significant issues, recurring mistakes, and unresolved difficulties in `docs/agent-lessons.md`.
- Keep entries concise, factual, and free of speculation. Consolidate recurring issues rather than duplicating entries.
- This file is for human review only. Do not initiate corrective actions based on its contents.

## Delegation

- Tier choice, dispatch caps, and the routing protocol belong to the active model-router plugin's system-prompt contract. Follow that contract; do not restate or second-guess it here.
- The primary agent, Build by default, owns the task, the final diff, verification, and the final report. Delegate bounded work, not accountability.
- One writer per file. Never run parallel write-capable agents over the same files.
- Do not delegate final verification, small context-heavy edits, or sequential work that depends on this conversation.
- A dispatch states the goal, allowed paths, constraints, relevant context, output contract, and what to verify. Subagents start with fresh context, so restate anything they need.
- Report what was delegated, why, and what came back. Do not hide child-session cost or failures.
- Prefer existing slash commands for deterministic specialist workflows. `orchestration-patterns.md` covers slash-command and persona patterns.
- High-risk or ambiguous work: plan first and get approval before implementing.
- `fast`, `medium`, and `heavy` are plugin-registered subagents and the sole owners of model selection. The four SDD roles are disabled; `build` is the default coding agent.

## Workflow

- **Inspect:** read relevant code, tests, callers; check branch/worktree state; preserve existing changes and untracked files. Nontrivial task → define scope + acceptance criteria, clarify consequential ambiguity.
- **Implement:** simplest correct change. Preserve interfaces, module boundaries, compatibility, data; no unrelated work, no speculative abstraction.
- **Protect:** handle meaningful failures, edge cases, permissions, security risks. Never conceal errors.
- **Verify:** run relevant checks; fix failures and rerun; inspect final diff; update affected docs.
- **Local development:** GitHub stores source history and backup. Ordinary changes need no PR, GitHub CI run, release notes, tag, registry publication, installer package, or deployment. Keep applicable local lint, typechecks, regression tests, generation, and runtime checks; broaden verification when shared code or dependencies change. See `docs/local-development.md`.
- **Daily app:** use the installed `dev` CLI while editing source. Adopt a new install only when active sessions and terminal work are idle; opening a normal new TUI can replace a version-mismatched server.

## Local Updates

Before checking or reporting local update status, rolling back, pruning, updating, packaging, or installing OpenCode, read `.opencode/references/local-updates.md`. Never install without an explicit user request; protect active sessions. The canonical full procedure is `bun run update:local` on a clean, committed `dev` tree. If `bun run local:status` shows `dev` ahead of the installed build, say so and wait for the user to request the update.

## Live TUI Testing

Before planning, reviewing, or running a live TUI test, read `.opencode/references/live-tui-and-desktop.md` and use `opencode-dev` when running it. Do not disrupt the shared server, storage, or active sessions.

## Live Desktop Diagnostics

Before interacting with a live desktop window or planning, reviewing, or attaching diagnostics to it, read `.opencode/references/live-tui-and-desktop.md`. Preserve its focus, theme, and media preferences.

## TUI Stories

Before planning, reviewing, creating, or changing a TUI story, read the TUI Stories section of `.opencode/references/live-tui-and-desktop.md`.

## TUI Theme Tokens

Before planning, reviewing, choosing, using, or changing TUI theme tokens, read the TUI Theme Tokens section of `.opencode/references/live-tui-and-desktop.md`.

## Branch Names

Branch names: at most three short words, hyphen-separated, no slashes or type prefixes (`feat/`). Examples: `session-recovery`, `fix-scroll-state`, `regenerate-sdk`.

## Worktrees

- A single task may edit and commit directly on `dev`. Independent concurrent tasks use separate worktrees and branches based on the current local `dev`; continue related work in the task's existing worktree. Follow Branch Names.
- Multiple agents may inspect a worktree, but only one may modify it. Never check out a branch active in another worktree; never switch, reset, remove, or repurpose another session's worktree.
- Before consequential Git operations (branch switches, worktree create/remove, integration): inspect `git worktree list`, each checkout's branch, and working-tree status — never assume. Preserve existing work.
- **Integration:** Review the final diff and run applicable local verification, then integrate completed task branches into an idle, clean `dev` checkout with an ordinary local merge. Never force-move a branch. Fetch remote changes before integration when needed; use fast-forward-only synchronization when possible and inspect divergence rather than discarding local history. GitHub CI and PRs are optional for personal development.
- **PR lifecycle:** Only open a PR when requested. Keep separate authorization for opening and merging unless the user approves both upfront. Respect any applicable remote branch protections. Public release work needs an explicit release request and its relevant release checks.
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

Before writing, editing, or reviewing code, or designing, reviewing, implementing, or documenting experimental APIs or plugin hooks, read `.opencode/references/coding-style.md`. Follow the repository invariants and established local style; validate unknown inputs at their boundary, avoid `any`, and preserve module boundaries.

## Testing

- Minimal mocks; `globalThis.*` only when no alternative exists.
- Test the actual implementation; never duplicate logic into tests.
- Tests never run from repo root (guard: `do-not-run-tests-from-root`); run from package directories (e.g. `packages/core`).
- Before writing or changing tests, read the matching `.opencode/skills` skill: `unit-tests` (bun test), `tui-tests` (OpenTUI renderer tests), `app-e2e-tests` (Playwright, `packages/app/e2e`), `component-tests` (Playwright on stories, `packages/stories`) — they cover known CI slowness/flakiness causes.
- Write the failing test first; use `test-design` when the question is test size, structure, or flakiness rather than the red-green loop.

## Checks

- `bun run check` from repo root: canonical full lint + type-check.
- Focused iteration: `bun typecheck` from the affected package directory (e.g. `packages/core`). Never run `tsc` directly.
- Local `typecheck` scripts: `bun check`. CI and publishing: `typecheck:tsc` (official `@typescript/native`). Disagreement → `tsc` is source of truth; reproduce via `bun run typecheck:tsc` from the package directory.
- `bun check` targets TypeScript 7.1, not the `7.0.2` `process.versions.typescript` reports (oven-sh/bun#46536); writes no declaration files, so declaration-emit errors (TS5088, TS2883) appear only in `tsc` — do not report those. Other divergence: file a minimal dependency-free repro at https://github.com/oven-sh/bun/issues with both outputs.
- Never claim unrun or failed checks passed; never weaken checks to manufacture a pass.

## Session Core

Before investigating or explaining Session execution, history, inbox, compaction, or related APIs, or designing, reviewing, or changing them, read `.opencode/references/session-core.md` and preserve its invariants. One step is one logical LLM call. Never write "provider turn" or use bare "turn" for a single call; a turn is the future assistant-turn unit containing all steps until the session would go idle.

## Technical Communication and Decision Support

Use clear, concise language for an analytically strong user without assuming software engineering expertise. Lead with the answer, explain material terms and tradeoffs, and preserve uncertainty. Before preparing prose or explaining a technical decision, read `.opencode/references/technical-communication.md` from the repository root.

## Communication

- Plain, direct, concise replies, docs, and commit messages. No filler, staged openers, em-dash chains, or contrived contrasts. Explain jargon once for nondevelopers, without talking down. Never invent facts or certainty.
- **Complete** = acceptance criteria met + applicable verification passed. Implementation finished but checks unrun → **Complete (unverified)**; otherwise **Partial** or **Blocked**. Separate attempted work from confirmed results.
- **Final task report** (usually <=120 words; expand only for material complexity/risk): **Status** — Complete / Complete (unverified) / Partial / Blocked; **Done** — 1–3 meaningful outcomes; **Verified** — checks actually run + results, noting material gaps; **Pending** — open issues/risks/decisions, else "None"; **Next** — highest-value next action + owner, else "None"; **Git** — file/branch/commit/PR state + skipped checks. Lead with the outcome; use for task completion only, not progress updates.
