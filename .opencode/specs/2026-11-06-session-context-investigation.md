# Finding 2 investigation: per-step session history reconstruction

Status: Approved
Requirements revision: R1
Date: 2026-11-06
Source finding: `docs/audits/cli-performance/app-performance-review-2026-11-05.md`, finding 2. The audit was written at `edab3236fb73ed209df51a7b3f0e915e20cca739`. Code references below were checked at HEAD `76a553a8879026e97471e794c4566690cf23b2c8`.

## Outcome and scope

The audit's second finding says every model step rebuilds the active history. The step reads message rows from the selected compaction boundary, fetches assistant parts, hydrates media blobs, decodes each row, and reconstructs retained text for a `keepID` compaction. The read and instruction initialization share one database transaction. The audit ranked the finding on source evidence without measuring it.

This task produces the measurement. The outcome is a reproducible benchmark and a report that answers one question: is per-step history reconstruction material on representative session shapes, and if so, where does the time go?

This task does not change production behavior. If the numbers justify an optimization, the report proposes one with expected gain, risks, and the invariants it must preserve. That proposal becomes a separate spec with its own approval.

Included work:

- A benchmark harness at `packages/core/script/benchmark-session-context.ts`.
- A `benchmark:session-context` script in `packages/core/package.json`.
- A report at `docs/audits/cli-performance/finding-02-history-reconstruction-2026-11-06.md`.

Excluded work:

- Any change under `packages/core/src/`.
- Provider, network, tool-execution, TUI, and desktop timing.
- Changes to replay, instruction, compaction, or media semantics.
- New dependencies.
- PR, release, or deployment work.

Who is affected: anyone running long or tool-heavy sessions. A step that spends 100 ms rebuilding history adds up over a 20-step turn. The measurement decides whether that cost is real.

## Current behavior and evidence

The per-step call is `llm.ts:218`, inside `advanceToStep`. Each iteration of the `drain` loop at `llm.ts:245-260` calls `advanceToStep`, which returns the loaded context, then `runStep`. `runStep` loads again at `llm.ts:331` for the initial attempt and at `:338` after a model switch.

`context.load` at `context.ts:168-184` resolves the model and calls `SessionHistory.entriesForRunner` at `:170`.

`entriesForRunner` at `history.ts:275-292` opens `db.transaction` and runs:

- `messageEntries` at `:284`.
- `InstructionState.initial` at `:286`.

`messageEntries` at `history.ts:183-224`:

- Calls `latestCompaction` at `:192`, one query.
- Selects message rows from the compaction sequence at `:193-204`, one query.
- Calls `withParts` at `:206`, one query per 500 assistant messages, which merges `session_part` rows into `data.content`.
- Calls `SessionBlob.hydrate` at `:206`, one query per 500 distinct blob hashes, which base64-encodes blob rows and inlines them.
- Decodes each row at `:205-209` with concurrency 1.
- Recurses at `:212-213` when the first row is a native compaction that the boundary cannot replay.
- Calls `withRecentText` at `:214` when a compaction is present.

`withRecentText` at `history.ts:231-265`:

- Reads the `keepID` row, one query.
- Reads the retained range, one query.
- Fetches parts again, one query per 500 assistant messages.
- Decodes and renders `SessionRecentText.messageToText`, then joins.

`InstructionState.initial` at `instruction-state.ts:173-182` reads the instruction state and its blobs, then renders. `InstructionState.prepare` at `:80-87` diffs and commits instruction changes per step.

No cache or memoization exists in `llm.ts`, `context.ts`, or `history.ts`. The only timing is the resume log at `llm.ts:265-274`, which covers the whole drain, not the context load.

The audit's estimate is a hypothesis. This task tests it.

## Requirements and verification

### R-01 Harness entry point

Requirement: from `packages/core`, `bun run benchmark:session-context` runs every scenario and exits 0.

AC-01: Trigger: run the command on a clean checkout. Expected: a result table for every scenario ID in the matrix, exit code 0. Verify: run it and capture the exit code.

### R-02 Real code path

Requirement: the primary measurement calls the production `SessionHistory.entriesForRunner` imported from the source tree. The harness must not reimplement history assembly, decoding, hydration, or instruction rendering.

AC-02: Trigger: inspect the script. Expected: `entriesForRunner` is imported and called; local code is limited to fixture seeding, measurement wrappers, and reporting. Verify: read the script and trace the call.

### R-03 Fixture validity

Requirement: before timing a scenario, the harness asserts the seeded shape and the result shape. A mismatch exits non-zero with the scenario ID, the field, the expected value, and the actual value.

AC-03a: Trigger: any scenario. Expected: assertions cover message count, assistant count, part count, blob count, compaction count, entry count, first entry type, retained-text presence or absence, and hydrated media presence. Verify: inspect the assertions.

AC-03b: Trigger: a deliberately wrong expected count in a copy of the script. Expected: non-zero exit and a message naming the scenario and field. Verify: run the copy.

AC-03c: Trigger: scenario S6. Expected: the native window decodes, the matching `Model.Ref` and `latest` variants keep the native compaction, and the `local` and non-matching variants read the full history before the native checkpoint and drop it in the final filter. The literal recursive branch at `history.ts:212-213` is not reached with a valid window because `latestCompaction` excludes the checkpoint for `local` and non-matching refs. Verify: inspect the result-shape assertions and the output.

### R-04 Scenario coverage

Requirement: the harness includes every scenario in the matrix below.

AC-04: Trigger: run the harness. Expected: every scenario ID appears in the output. Verify: compare the output IDs to the matrix.

### R-05 Metrics

Requirement: for each scenario, report median, p95, mean, min, and max wall time over at least 10 measured iterations after at least 3 warm-ups; retained heap delta and RSS after two forced GCs; and query count, measured or derived and labeled. The harness supports `--json <path>` for machine-readable output.

AC-05: Trigger: run the harness. Expected: those fields for every scenario, with the iteration count and warm-up count printed. Verify: read the table and the `--json` output.

### R-06 Phase breakdown

Requirement: for S2 and S3 at minimum, report:

- U1 `entriesForRunner` total.
- U2 `SessionHistory.load` history-only.
- U3 `InstructionState.initial` standalone.
- U4 `SessionBlob.hydrate` standalone.
- U5 `withParts` standalone.
- U6 raw message select, labeled as a lower bound.
- U7 `InstructionState.prepare` standalone.
- The retained-text delta from S5 minus S5b.
- The media delta from S4 minus S4b.
- CPU profile attribution for `latestCompaction`, `decodeMessageRow`, `withRecentText`, the filter, and transaction overhead.

AC-06: Trigger: read the report and the harness output. Expected: every unit has a number or an explicit "not isolatable" note with the reason. Verify: compare the list to the report.

### R-07 Environment isolation

Requirement: the harness uses a temporary global directory, temporary home, temporary SQLite database, no network, and no filesystem watchers. It prints OS, CPU, RAM, Bun version, commit, and the database path. `--keep` preserves the database.

AC-07: Trigger: default run and `--keep` run. Expected: the environment block appears; the default run removes the temporary directory; `--keep` leaves it and prints the path. Verify: run both and check the filesystem.

### R-08 Report

Requirement: the report contains method, environment, scenario shapes, raw results, scaling analysis, per-turn projection, verdict, recommendation, limitations, and the exact reproduction command.

AC-08: Trigger: read the report. Expected: every section present. Verify: checklist against the requirement.

### R-09 Verdict rule

Requirement: the report applies this rule:

- Material if U1 p95 is at least 100 ms at S2 or S3, or if the S2 time divided by the S2a time is greater than 4.5 for a 4x message increase, or if the retained-text delta is at least 50 ms p95, or if the media delta is at least 50 ms p95.
- Not material if none of those hold.
- Inconclusive if p95 divided by median is greater than 2 for a primary scenario, or one of the U1-U7 measurement units cannot be measured. The CPU profile targets in R-06 are supplementary attribution aids; marking one "not isolatable" with a reason does not by itself make the verdict inconclusive.

AC-09: Trigger: recompute the verdict from the reported numbers. Expected: the same verdict. Verify: arithmetic.

### R-10 No production behavior change

Requirement: the diff touches only the script, `packages/core/package.json`, the report, and a test-only helper if strictly needed.

AC-10: Trigger: `git diff --stat`. Expected: no files under `packages/core/src/`. Verify: diff.

### R-11 Reproducibility

Requirement: a second run on the same machine reproduces the scenario ordering and the verdict; each scenario median is within plus or minus 30 percent of the first run, or the report explains the variance.

AC-11: Trigger: two consecutive runs. Expected: same ordering and verdict; medians within tolerance or an explanation. Verify: compare the JSON outputs.

### R-12 Runtime bound

Requirement: the default run completes in 10 minutes or less on the reference machine.

AC-12: Trigger: time the default run. Expected: 600 seconds or less. Verify: measure.

## Scenario matrix

| ID | Seeded shape | Purpose |
|---|---|---|
| S0 | Instruction state only, 0 messages | Fixed overhead baseline |
| S1 | 20 messages, 1 assistant part each, 1 KB text | Short session |
| S2a | 500 messages, 1 assistant part each, 1 KB text | Scaling baseline |
| S2 | 2,000 messages, 1 assistant part each, 1 KB text | Long session |
| S3 | 500 messages, 20 assistant parts each, 5 KB tool output per part | Tool-heavy session |
| S4 | 200 messages, 50 blobs of 200 KB each | Media hydration |
| S4b | S4 without blobs | Media A/B |
| S5 | 1,799 pre-compaction messages, a completed local compaction at sequence 1,800, `keepID` at message 1,600, and 200 post-compaction messages (2,000 rows total) | Retained text |
| S5b | S5 with the same compaction but no `keepID` | Retained-text A/B |
| S6 | 2,000 rows: 1,899 messages, a completed native compaction at sequence 1,900 carrying a model that matches the test `Model.Ref`, a valid `native.messages` window, and 100 post-compaction messages | Native boundary replay |
| S6-latest | S6 with boundary `latest` | Native window kept |
| S6-local | S6 with boundary `local` | Full-history read before the native checkpoint |
| S6-match | S6 with a `Model.Ref` matching the compaction model | Native window kept |
| S6-mismatch | S6 with a `Model.Ref` that does not match | Full-history read before the native checkpoint |

The 2,000-message size is a chosen long-session size, not an audit measurement. The tool-heavy size uses 20 parts per assistant message to exercise `withParts` batching. The media size uses 10 MB of blob data to exercise hydration without making the run slow.

The literal recursive branch at `history.ts:212-213` requires a native compaction whose model matches the boundary but whose window does not decode. The S6 scenarios use a valid window, so the branch is not exercised. The report discloses this, and the S6-local and S6-mismatch measurements bound the full-history read the branch would add.

## Measurement units

Warm measurements are primary because production reuses a warm connection. Cold is the first call on a freshly opened connection and is reported separately.

The scaling check compares S2 (2,000 messages) with S2a (500 messages) at the same shape, so the ratio isolates message count from part count and text size.

The phase decomposition uses subtraction:

- U1 minus U2 isolates instruction initialization plus transaction overhead.
- U3 confirms the instruction part.
- U2 minus U4 minus U5 minus U6 approximates decode plus filter.
- S5 minus S5b isolates `withRecentText`.
- S4 minus S4b isolates media hydration.

The report labels every derived number as derived. Query counts are measured if the SQLite driver exposes a counter or trace; otherwise they are derived from the code path and labeled derived.

Memory is retained heap after two forced GCs plus RSS, following `benchmark-location-memory.ts`. Peak RSS sampling is optional. Analytical data size is reported for S2, S3, and S4.

## Constraints and decisions

- The harness runs on Windows with Bun from `packages/core`. It must not run from the repo root.
- Structure follows `packages/core/script/benchmark-edit.ts`; memory reporting follows `benchmark-location-memory.ts`.
- The 100 ms and 50 ms thresholds are chosen budgets, not measured user thresholds. They are open to adjustment at approval.
- The per-turn projection multiplies U1 p95 by 1, 10, and 50 steps. It excludes provider latency.
- Synthetic data is used. Real-session sampling is out of scope because it would require user data.
- `entriesForRunner` requires a valid `InstructionState` row. The harness seeds it and proves validity with a successful call before timing.
- The report is a new file. The audit file is not edited.
- `context.select` is measured only if its dependencies can be isolated in the fixed environment. Otherwise the report excludes it with a reason, because the finding is about history assembly.

## Risks

- Synthetic sessions may not match real ones. Mitigation: use the audit's sizes, document the assumptions, and report the shape of each scenario.
- SQLite and OS caches can distort timings. Mitigation: warm and cold runs, at least 10 iterations, median and p95, and a variance check.
- Effect runtime overhead can dominate small scenarios. Mitigation: S0 baseline and subtraction.
- Bun under-reports typed arrays. Mitigation: `bun:jsc` heap statistics plus analytical size.
- The harness could measure the wrong path. Mitigation: call the production entry point and assert the result shape.
- A `keepID` compaction without valid state can die. Mitigation: seed a valid instruction state and assert a successful call before timing.
- CPU profiles are noisy. Mitigation: use them for attribution only, not primary numbers.

## Approval and execution

Requirements revision: R1.
Approval state: Approved on 2026-11-06.

Approved decisions:

1. Scope is investigation only.
2. The materiality thresholds are 100 ms for U1 p95 and 50 ms for the A/B deltas.
3. The report path is `docs/audits/cli-performance/finding-02-history-reconstruction-2026-11-06.md`.

Execution state: Complete.
Definition of Done: `.opencode/references/definition-of-done.md` applies. For this task, the harness assertions and the negative check satisfy the "new behavior covered by tests" item. No production behavior changes, so no regression suite is required beyond the harness run.

Execution record:

- Session start: repo root `Y:\CodingProjects\opencode_fife`, branch `dev`, HEAD `76a553a8879026e97471e794c4566690cf23b2c8`, clean working tree, no stashes, no merge, rebase, or cherry-pick in progress, `dev` level with `origin/dev`.
- Worktrees: `git worktree list` shows only `Y:/CodingProjects/opencode_fife` on `dev`. OpenCode's registry also lists `harness-optimization` and `Y:\Coding_Projects\opencode_fife`; neither is a Git worktree of this repository. Leave both untouched.
- Isolation: use the current clean worktree on `dev`. No new worktree or branch.
- GitHub CLI: authenticated as `DeputyFifeofMayberry`, scopes `gist`, `read:org`, `repo`, `workflow`.
- Stage authorization: R1 approved on 2026-11-06. Implementation authorized. Independent testing authorized on 2026-11-06. QA authorized on 2026-11-06.
- Implementation (2026-11-06): Implementer returned. Changed paths: `packages/core/script/benchmark-session-context.ts` (new), `packages/core/package.json` (one script line), `docs/audits/cli-performance/finding-02-history-reconstruction-2026-11-06.md` (new). No `packages/core/src/` changes. Self-checks: default run exit 0 in 10.32 s with all 14 scenario IDs; second run exit 0 with the same verdict and ordering; negative check exit 1 with `S1: entry count expected 21, actual 20`; `bun typecheck` pass; `--keep` verified. Verdict: Not material. Primary run S3 p95 89.50 ms, final run 96.40 ms; S2 p95 15.20 ms; scaling ratio 3.24; retained-text delta p95 1.70 ms; media delta p95 28.38 ms.
- Spec correction (2026-11-06): AC-03c and the S6-local/S6-mismatch purpose changed from "recurses to the history before the native compaction" to "full-history read before the native checkpoint". Evidence: `latestCompaction` at `history.ts:55-88` excludes native checkpoints for `local` and non-matching refs, so the recursive branch is not reached with a valid window. Scope, thresholds, and verdict rule unchanged. Recorded as a factual correction, not a scope change.
- Testing (2026-11-06): Tester returned Pass for R-01 through R-12 and corrected AC-03c. Four runs, exit 0, 10.21-10.70 s, all 14 scenario IDs. S3 p95 by run: 94.69, 88.53, 87.08, 91.79 ms; no p95 reached 100 ms. One individual S3 sample reached 100.13 ms in run 2, but R-09 uses p95. Negative check exit 1 with the expected message. Kept-database inspection confirmed the S6 compaction at seq 1900, model `bench/bench-model`, native window present, 2,000 rows, 10,000 S3 parts, 50 blob rows and 50 blob refs, and boundary queries latest/match to 1900, local/mismatch to null. No production source changes. Caveats: thin S3 margin; CPU profile not independently regenerated; blob-count assertion checks `blob_ref` rows; cold-limitation wording overgeneralizes S4. Typecheck follow-up: `bun typecheck` from `packages/core`, exit 0, `No type errors in 1,963 files across 2 projects`.
- Spec clarification (2026-11-06): R-09 "required phase" now explicitly means the U1-U7 measurement units. CPU profile targets are supplementary and may be marked not isolatable without making the verdict inconclusive. Meaning preserved; recorded to remove the ambiguity the Tester identified.
- QA handoff (2026-11-06): first dispatch stopped at the authorization check because the handoff did not quote the user's explicit approval. Corrected handoff sent with the exact exchange ("Do you authorize QA?" / "approved") and the review cycle. QA resumed; no technical finding from the stop.
- QA (2026-11-06): Inconclusive. The verdict arithmetic is defensible, but QA could not establish that the report's detailed measurements correspond to the final harness revision. Findings: QA-01 evidence gap, the report's comparison runs preceded a final harness edit and the full final-run table is missing; QA-02 report defect, the CPU profile sampled S2 and S3, which do not exercise `withRecentText`, so the absence of samples does not establish that it is I/O-bound; QA-03 report defect, the cold-limitation wording is contradicted by the table for S5b and S6-latest. No production defect found. Correction cycle 1 proposed; QA continuation needed after correction.
- Correction cycle 1 (2026-11-06): Authorized by the user. Scope is report accuracy and evidence completeness: describe the final harness edit, confirm or regenerate the full final-run table, correct the `withRecentText` CPU attribution, and correct the cold-limitation wording. No production code changes; no harness behavior change unless the final edit changed measurement logic.
- Correction cycle 1 result (2026-11-06): Report updated. Added the "Final harness revision" note with the four edits and baseline identity; replaced the pre-final table with the final-revision table; corrected QA-02 (`withRecentText` not covered by the profile, S5/S5b delta is the evidence); corrected QA-03 (cold can diverge for small scenarios and S4). Final-revision primary run: exit 0, 10.52 s, S3 p95 93.24 ms, S2/S2a ratio 3.46, retained delta 1.44 ms, media delta 42.76 ms, verdict Not material. Repeat run S3 p95 92.86 ms; post-edit confirmation S3 p95 93.96 ms. No production or harness behavior change. Awaiting authorization for retesting.
- Retesting (2026-11-06): Authorized by the user. Tester dispatched to verify the corrected report, the final-revision table, QA-02, QA-03, and the R-09 arithmetic. No code changes.
- Retesting follow-up (2026-11-06): First response stopped while waiting on Run B and did not return the analysis. Follow-up sent to collect the result and finish the report. No technical conclusion from the incomplete response.
- Retest result (2026-11-06): Fail. Two clean runs on the current tree produced S3 p95 120.51 ms and 115.77 ms, both above the 100 ms budget, so the R-09 rule says Material. The report's final table says 93.24 ms and Not material. Medians are broadly consistent (about 83-91 ms), but the p95 tail swings by 20-27 ms across runs. The report's Not material verdict is not reproducible. QA-01, QA-02, and QA-03 corrections passed; QA-03 has a minor caveat about the "about twice" example. No production or harness behavior change. Correction cycle 2 proposed: more measured iterations, multiple full runs, and a distribution-based verdict.
- Correction cycle 2 (2026-11-06): Authorized by the user. Scope is measurement stability and a distribution-based verdict: at least 100 measured iterations, three full runs, report the S3 p95 distribution, and apply R-09 across runs (all below 100 ms = Not material; all at or above = Material; straddling = Inconclusive). No threshold or statistic change; no production code change.
- Correction cycle 2 recovery (2026-11-06): First attempt ended while the 100-iteration run was executing. Checked: no `bun` process, no temp directory, report unchanged. Follow-up sent to re-run the three runs one at a time and update the report.
- Correction cycle 2 result (2026-11-06): Three 100-iteration runs, all Material. S3 p95 104.47, 103.66, and 121.93 ms; medians 85.21, 85.90, and 85.61 ms; maxes 134.74, 142.01, and 159.46 ms. JSON files at `%TEMP%\session-context-100-run1.json`, `run2.json`, and `run3.json`. Distribution rule gives Material. Report update in progress.
- Correction cycle 2 complete (2026-11-06): Report updated to Material. Three 100-iteration runs, all Material: S3 p95 104.47, 103.66, 121.93 ms; medians 85.21, 85.90, 85.61 ms; maxes 134.74, 142.01, 159.46 ms. Report adds the distribution table, uses run 3 for the full scenario table, updates the phase breakdown and per-turn projection, and proposes a separate optimization spec targeting `withParts`. No production or harness code change. Awaiting authorization for the final retest.
- Final decision (2026-11-06): The user decided the optimization is not worth pursuing at this time based on the evidence. The investigation is closed. The final retest and QA continuation are waived by the decision. The report records the Material stress-case verdict and the real-world relevance caveat.
- Current state: Complete.
- Cost and latency: implementation and testing session cost and latency not measured.
