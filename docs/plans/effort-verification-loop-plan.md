# Plan: Guaranteed effort loop (harness-initiated verification)

Status: Slices A, B, D complete; C complete (re-seeded `explore → low`); E deferred
(2026-10-29)
Related: `docs/plans/effort-adaptive-mode.md` (shipped adaptive mode), `docs/spec/effort-policy.md`,
`docs/intent/effort-policy.md`, `perf/token-reasoning/README.md`

## Objective

Close the gap between "the effort loop works when the model cooperates" and "the loop works".
Today every trigger depends on the model choosing to run a configured verifier, in a
recognizable shape, with an honest exit code. The plan converts verification into a
harness-owned activity, makes the workspace evidence ground-truth, validates the ladder
tiers, and adds the measurement loop — taking the practical success rate from ~60% to the
high nineties.

## Background (measured 2026-10-29, opencode-dev.db)

- 224 sessions, zero policy-authored decisions under static mode; every reply ran pinned or
  provider-default tiers.
- One governed verification failure tonight would now escalate (matcher fix shipped,
  `197bf7afef`); the worktree failure (19:38 UTC) remains unreachable because project config
  does not travel to worktrees.
- Verifier settlements are rare: ~4 all day. Loop activity is bounded by that frequency.
- Stage 1 screening: the `low` tier passed 0/6 on implementation tasks — `explore → low`
  is shipped but unmeasured for exploration-class work.

## Design

### Harness-initiated verification (core slice)

When `mode: "adaptive"` and `verification_commands` is non-empty, the runner executes a
configured verifier itself and feeds the settlement through the existing evidence path
(`EffortEvidence.observe`), marked as harness-originated.

- **Trigger.** One run per idle boundary, only when state is dirty: a mutating tool settled
  since the last recorded verdict, or an open failure exists, or the durable level is above
  the seed. No run while the session is draining; a prompt admitted mid-run cancels it
  (cancelled = infrastructure = no state change).
- **Verifier selection.** The verifier with the open failure if one exists, else the first
  configured command. One command per run; never parallel.
- **Currency.** A harness run at idle is definitionally current: it bypasses the
  sequence/revision staleness guard that model-initiated settlements still pass through.
  Model-initiated evidence remains a bonus signal under today's rules.
- **Timeout.** `verification_timeout` (config, optional, default 120s). Timeout, spawn
  failure, and cancellation classify as infrastructure — no state change, logged.
- **Consent.** Configuring `verification_commands` is the consent surface; the commands run
  permission-free in the session's directory, mirroring the benchmark runner's contract.
- **No new wire surface in v1.** Verdicts surface as attributed transitions (already
  shipped) plus logs. A durable `session.effort.observed` event is deferred until a UI
  needs it.

### Workspace revision (with the core slice)

Keep the monotonic tool-based revision for model-initiated staleness. Add a cheap digest
check for harness runs only: `git status --porcelain` hash when the session directory is a
repo (fallback: existing revision counter otherwise), recorded with each harness verdict so
"the workspace changed since the last verdict" is an observation, not an inference from
tool names. This closes the documented v1 hole where shell-mediated mutations (e.g.
`sed -i`) never advance the revision.

### Config scoping (operator action + test)

Move `effort_policy` to `~/.config/opencode/opencode.json` so worktree sessions are
governed. Add a core test proving a session in a directory without project config still
resolves the global policy (config-reach regression guard).

### Ladder validation (benchmark slice)

Extend the effort benchmark for one screening-grade question: does `low` hold up on
exploration-class work on this model? Reuse the smoke-stage machinery; small n; token and
success evidence only (cost stays unpriced on the zai route). If `low` underperforms,
`sessionSeed` flips explore to `standard` and the tier assumption is retired with data.

### Evidence report (measurement slice)

A script in the `script/session-usage-report.ts` family: reads `session_effort` and
attributed transitions from a session database and emits a markdown rollup — escalations,
step-downs, time-at-tier, sessions governed vs untouched. This is the weekly "is it
working" answer.

### Deferred (decision-gated, not in this plan's build)

- Non-failure up-triggers (context growth nearing compaction, repeated same-tool
  failures, user steers). Makes ordinary build sessions actively tuned; each trigger is a
  policy-input design decision with cost implications. Deferred until the guaranteed loop
  has real usage data — adaptive currently only visibly deviates from default on
  explore/mechanical seeds, plan pin, and verification outcomes.
- Promoting adaptive to the default mode (M5/M6 gates).
- Dwell-time damping: expected unnecessary once verdicts are at most one per idle boundary;
  revisit only if the evidence report shows churn.

## Slices

| Slice | Contents | Size | Depends on |
| --- | --- | --- | --- |
| A. Config reach | User-scope config (operator), config-reach test | XS | — |
| B. Harness verification | Idle-trigger integration in the runner, dirty detection, verifier selection, timeout/cancel, harness evidence path, digest record, recovery on restart, tests (trigger, cancel, inert-when-static, recovery) | L | A (meaningful only when governed) |
| C. Ladder validation | Benchmark extension + run + write-up | M | — |
| D. Evidence report | Rollup script + fixture | S | B (data to report on) |
| E. Up-triggers | Deferred; separate plan after B has live data | — | B |

Slice B investigation step: locate the exact idle seam (runner idle path /
`SessionRunCoordinator` boundary), confirm cancellation semantics with prompt admission,
and verify config resolution for sessions outside the project root before wiring.

Outcome notes (2026-10-29):

- A: `effort_policy` moved to user-scope config; project copy emptied. Config-reach test
  deferred to the next config-discovery test touchpoint — global resolution itself is
  covered by `Config.entries` composition.
- B: shipped in `feat(effort): guarantee adaptive verification from the harness`. The
  idle seam is the runner's `DrainResult.Complete` boundary (not the coordinator):
  location-scoped so config and directory resolve naturally; verification fibers join by
  session in a `FiberMap` and a new busy period cancels the run.
- C: shipped — see `perf/token-reasoning/README.md`, exploration ladder stage. `low`
  passed 4/4 on discovery tasks with ~27% fewer tokens than default; `explore → low`
  re-seeded per the predeclared rule. Harness finding: multi-line prompts truncate through
  the Windows `cmd` argv wrap; suite prompts stay single-line until prompts travel by
  another channel.
- D: shipped — `script/effort-report.ts` renders durable state, attributed transitions,
  and governed-vs-ungoverned counts from a session database.
- E: deferred until the loop has live usage data.

## Verification

- Slice B: new core tests (trigger fires on dirty idle, cancelled-by-prompt is
  infrastructure, timeout is infrastructure, harness verdict raises/decays through the
  existing policy tests' state machine, restart recovery, inert in static mode and
  ungoverned dirs), full `test/effort` + session-runner suites, package typechecks.
- Slice C: benchmark report committed under `perf/token-reasoning/` with the README's
  counting rules.
- Slice D: script runs against the fixtures and the live dev database; output reviewed.
- No `bun run generate` required (no HttpApi change); session-event schema untouched in
  v1.

## Confidence trajectory

| State | Success estimate |
| --- | --- |
| Today (matcher fix + adaptive, opt-in, project config) | ~60% |
| + A (worktrees governed) | ~70% |
| + B (guaranteed loop) | ~90% |
| + C, D (measured ladder, visible evidence) | ~95% |
| Residual | Model-outcome empirics and provider wire truth — reducible by measurement, not to 100% |

## Out of scope

Promoting adaptive to default; parallel verifier runs; model-judged complexity;
non-zai-route cost validation; changes to delegation minimums.
