# Finding 2 investigation: per-step session history reconstruction

Measured 2026-11-06 on `dev` at `76a553a8879026e97471e794c4566690cf23b2c8`. This report follows the approved investigation spec `.opencode/specs/2026-11-06-session-context-investigation.md` (R1). It measures the finding 2 hypothesis in `docs/audits/cli-performance/app-performance-review-2026-11-05.md`: every model step rebuilds the active history.

**Verdict: Material** under the R-09 cross-run distribution rule. Three 100-iteration runs put S3 `entriesForRunner` p95 at 104.47, 103.66, and 121.93 ms, all above the 100 ms budget. The S3 median is stable at 85.21–85.90 ms; the materiality is in the tail, not the typical step. The S2 p95, scaling ratio, retained-text delta, and media delta remain below their thresholds. A 10-step S3-shaped turn spends about 1.0–1.2 s rebuilding history at the p95, and a 50-step turn about 5.2–6.1 s.

## Method

The harness is `packages/core/script/benchmark-session-context.ts`, run from `packages/core` with `bun run benchmark:session-context`. It seeds synthetic sessions into a temporary SQLite database under a temporary global directory and home, then calls the production `SessionHistory.entriesForRunner` imported from `packages/core/src/session/history.ts`. The harness does not reimplement history assembly, decoding, hydration, or instruction rendering.

- Each scenario is asserted before timing: seeded message, assistant, part, blob, and compaction counts, then result entry count, first entry type, retained-text presence, hydrated media presence, and native-compaction presence. A mismatch exits non-zero with scenario, field, expected, and actual.
- Warm measurements use 5 warm-ups and the configured number of measured iterations. Cold is the first `entriesForRunner` call on a freshly opened connection, reported separately. The OS page cache is warm for both.
- Memory is `process.memoryUsage().heapUsed` after two forced GCs with the result held, plus RSS, following `benchmark-location-memory.ts`.
- Query counts are **derived** from the code path and labeled derived. The SQLite driver exposes no statement counter. The derivation counts one `latestCompaction` select, one message select, `ceil(assistant IDs / 500)` part queries, `ceil(blob hashes / 500)` blob queries, one instruction-state select, and for a `keepID` compaction one keep-ID select, one retained-range select, and `ceil(retained assistant IDs / 500)` part queries.
- CPU attribution uses Bun's sampling profiler (`bun:jsc`) over 30 S2 and 30 S3 calls after a warm-up. The sampler records JS stacks; it does not sample while the thread waits on SQLite I/O.

### Iteration counts and the distribution rule

The default run uses 20 measured iterations. The 20-iteration p95 is the second-highest of 20 samples, so a single slow sample can move it by 20–30 ms. The final-revision 20-iteration runs produced S3 p95 values of 93.24, 92.86, and 93.96 ms, while the Tester's two clean 20-iteration runs produced 120.51 and 115.77 ms. The same tree therefore straddled the 100 ms budget at 20 iterations.

To measure the tail, correction cycle 2 used the existing `--iterations` flag, which applies to every scenario and phase, at 100 iterations. The 100-iteration p95 is the 95th percentile of 100 samples (the fifth-highest), which is less sensitive to a single slow sample. Three full runs were taken one at a time on the current tree:

```powershell
cd packages/core
bun run benchmark:session-context --iterations 100 --json <path>
```

The runs took 35.56, 35.02, and 35.81 s, well inside the 10-minute bound. No harness code changed in this cycle; the existing flag was used as-is.

The R-09 distribution interpretation is: all runs below 100 ms → Not material; all runs at or above 100 ms → Material; runs straddling 100 ms → Inconclusive. The 100 ms threshold and the other R-09 conditions are unchanged. The median is reported for context and is not used as the verdict statistic.

### Final harness revision

The harness is the final revision from the previous cycle: the working tree at commit `76a553a8879026e97471e794c4566690cf23b2c8`, uncommitted, as required by the stage authorization. The final revision adds four edits after the first comparison runs:

1. Process-environment isolation: `HOME`, `USERPROFILE`, and the `XDG_*` directories point at the temporary root.
2. The Inconclusive verdict no longer sets a non-zero exit code; the harness exits 0 unless an assertion or an execution error fails it.
3. The optional `--profile` phase runs 30 S2 and 30 S3 calls instead of 10 each.
4. A type-only `bun:jsc` declaration for `samplingProfilerStackTraces`, which bun-types 1.4.4 omits.

None of these changes the default measurement path: the same fixtures, the same production `entriesForRunner`, the same assertions, and the same derived query counts. The 100-iteration distribution runs use this same revision with the existing `--iterations 100` flag; no harness code changed in correction cycle 2. The negative-check and typecheck results from the previous cycle remain valid because the harness is unchanged.

## Environment

| Item | Value |
|---|---|
| OS | Windows_NT 10.0.26300 |
| CPU | AMD Ryzen 7 7800X3D 8-Core Processor |
| RAM | 31.1 GiB |
| Runtime | Bun 1.4.4 |
| Commit | `76a553a8879026e97471e794c4566690cf23b2c8` |
| Database | temporary SQLite file under `%TEMP%\opencode-session-context-*` |
| Warm-ups | 5 |
| Iterations | 20 (baseline) and 100 (distribution) |

The default run removes the temporary directory. `--keep` leaves it and prints the path. Both behaviors were checked.

## Scenario shapes

All text messages are 1 KB unless stated. "Alternating" means user at odd sequences and assistant at even sequences. Assistant text parts are stored in `session_part`; the assistant row's inline `content` is empty so `withParts` performs the merge.

| ID | Seeded shape | Boundary | Expected entries |
|---|---|---|---|
| S0 | Instruction state only, 0 messages | latest | 0 |
| S1 | 20 assistant messages, 1 text part each | latest | 20 |
| S2a | 500 assistant messages, 1 text part each | latest | 500 |
| S2 | 2,000 assistant messages, 1 text part each | latest | 2,000 |
| S3 | 500 assistant messages, 20 tool parts each, 5 KB output per part | latest | 500 |
| S4 | 200 user messages, 50 file refs to 50 blobs of 200 KB | latest | 200 |
| S4b | 200 user messages, no files or blobs | latest | 200 |
| S5 | 2,000 rows: 1,799 alternating pre-compaction messages, summary compaction at seq 1,800 with `keepID` at seq 1,600, 200 alternating post-compaction messages | latest | 201 |
| S5b | Same as S5 without `keepID` | latest | 201 |
| S6 | 2,000 rows: 1,899 alternating pre-compaction messages, native compaction at seq 1,900 with a valid `native.messages` window and the test `Model.Ref`, 100 alternating post-compaction messages | latest | 101 |
| S6-latest | S6 | latest | 101 |
| S6-match | S6 | test `Model.Ref` | 101 |
| S6-local | S6 | local | 1,999 |
| S6-mismatch | S6 | non-matching `Model.Ref` | 1,999 |

S6 and S6-latest share the same seed and boundary. The duplicate is measured so every matrix ID appears in the output.

The S6 native window decodes, and the matching `Model.Ref` and `latest` boundaries keep the native compaction. The `local` and non-matching variants read from the start of the session and drop the native checkpoint in the final filter. The non-matching variant does not take the literal recursive branch at `history.ts:212-213`; `latestCompaction` already excludes the checkpoint because the model does not match, so the read starts before it and the filter removes it. The result shape is the same 1,999 entries with no native compaction.

## 100-iteration distribution

The verdict basis. Three full runs, one at a time, on the current tree. Times in milliseconds.

| Run | Iterations | S2 median | S2 p95 | S2 max | S3 median | S3 p95 | S3 max | Verdict |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | 100 | 11.26 | 15.90 | 17.69 | 85.21 | 104.47 | 134.74 | Material |
| 2 | 100 | 10.84 | 15.62 | 20.00 | 85.90 | 103.66 | 142.01 | Material |
| 3 | 100 | 11.31 | 15.16 | 17.18 | 85.61 | 121.93 | 159.46 | Material |

Distribution summary:

| Statistic | S2 | S3 |
|---|---:|---:|
| Median range | 10.84–11.31 | 85.21–85.90 |
| p95 range | 15.16–15.90 | 103.66–121.93 |
| p95 median | 15.62 | 104.47 |
| p95 mean | 15.56 | 110.02 |
| Max range | 17.18–20.00 | 134.74–159.46 |

All three S3 p95 values are at or above 100 ms. The S3 median is stable at 85.21–85.90 ms, and the S3 max ranges 134.74–159.46 ms. The tail is real: the p95 is above the budget in every run, and the slowest sample is 135–159 ms.

## Raw results

The table is the third 100-iteration run, the most recent and the highest S3 p95, so it does not understate the tail. The distribution table above is the verdict basis; this table gives the full scenario set for the same run. Times in milliseconds. Heap is the retained delta after two forced GCs and is noisy; RSS is the stable memory figure. Query counts are derived.

| Scenario | Median | p95 | Mean | Min | Max | Cold | Heap MiB | RSS MiB | Queries |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| S0 | 0.22 | 0.39 | 0.27 | 0.16 | 2.95 | 0.60 | 0.02 | 305.77 | 3 |
| S1 | 0.39 | 0.44 | 0.40 | 0.32 | 0.50 | 0.77 | 0.03 | 325.77 | 4 |
| S2a | 3.04 | 4.59 | 3.39 | 2.57 | 6.37 | 4.71 | 0.00 | 329.55 | 4 |
| S2 | 11.31 | 15.16 | 11.95 | 10.21 | 17.18 | 14.22 | 0.00 | 342.86 | 7 |
| S3 | 85.61 | 121.93 | 89.82 | 73.29 | 159.46 | 140.19 | 0.00 | 418.40 | 4 |
| S4 | 22.92 | 28.39 | 22.63 | 17.77 | 31.79 | 23.43 | -0.28 | 340.96 | 4 |
| S4b | 0.88 | 1.38 | 0.98 | 0.80 | 2.76 | 1.13 | 0.01 | 333.57 | 3 |
| S5 | 1.98 | 3.68 | 2.25 | 1.57 | 4.82 | 3.55 | 0.00 | 336.20 | 7 |
| S5b | 1.15 | 1.58 | 1.18 | 0.80 | 3.50 | 1.50 | 0.00 | 334.86 | 4 |
| S6 | 0.59 | 0.91 | 0.66 | 0.51 | 2.04 | 0.96 | 0.00 | 333.70 | 4 |
| S6-latest | 0.56 | 0.89 | 0.62 | 0.48 | 2.33 | 0.93 | 0.00 | 332.16 | 4 |
| S6-match | 0.66 | 1.00 | 0.74 | 0.53 | 2.65 | 0.89 | 0.00 | 333.99 | 4 |
| S6-local | 7.44 | 11.29 | 8.09 | 6.57 | 12.91 | 9.91 | 0.02 | 300.57 | 5 |
| S6-mismatch | 7.60 | 13.61 | 8.74 | 6.29 | 16.44 | 9.68 | 0.01 | 328.43 | 5 |

Heap deltas are noisy; S4 is negative and the others are near zero. RSS and the analytical size are the reliable memory figures. Cold can diverge from warm in both directions: S3's cold call is 140.19 ms against 85.61 ms warm, S4's cold call is 23.43 ms against 22.92 ms warm, and small scenarios such as S6-latest show cold times about 1.7x their medians. Cold is reported separately and does not affect the verdict.

Analytical data size: S2 about 4 MB of message and part JSON, S3 about 50 MB of tool output plus JSON overhead, S4 about 10 MB of raw blob bytes (about 13.3 MB base64) plus 200 KB of text.

## Phase breakdown

S2 and S3 at p95 (median in parentheses) for the third 100-iteration run. U1 is `entriesForRunner`; U2 `SessionHistory.load`; U3 `InstructionState.initial`; U4 `SessionBlob.hydrate`; U5 `withParts`; U6 the raw message select (a lower bound); U7 `InstructionState.prepare`.

| Unit | S2 p95 (median) | S3 p95 (median) |
|---|---:|---:|
| U1 `entriesForRunner` | 15.16 (11.31) | 121.93 (85.61) |
| U2 `SessionHistory.load` | 15.91 (11.08) | 102.03 (84.86) |
| U3 `InstructionState.initial` | 0.04 (0.02) | 0.06 (0.04) |
| U4 `SessionBlob.hydrate` | 0.11 (0.02) | 0.01 (0.01) |
| U5 `withParts` | 5.74 (3.61) | 82.14 (54.89) |
| U6 raw message select | 2.52 (1.40) | 0.81 (0.41) |
| U7 `InstructionState.prepare` | 0.11 (0.05) | 0.08 (0.06) |

- U4 is effectively a no-op for S2 and S3 because neither scenario carries blob refs; the measured values are the early return.
- U5 dominates S3. In the 20-iteration baseline it was 76.67 ms p95, about 82% of U1. Across the 100-iteration runs it was 77.22–82.14 ms p95, about 67–74% of U1. The 10,000 tool parts are read in one batch of 500 assistant IDs and merged into 500 messages, then decoded.
- U7 is small. Instruction preparation with an empty instruction list and an unchanged state does not publish a delta.
- The derived transaction overhead `U1 - U2 - U3` is unstable: -5.14 ms in run 1, +3.27 ms in run 2, and +19.85 ms in run 3. The phase order and GC state differ between the measurements, so the subtraction is **not isolatable**. This does not affect the verdict because the materiality condition is U1 p95, not the transaction share.
- Retained-text delta (S5 minus S5b) p95: 1.86, 1.47, and 2.10 ms across the three runs. All below 50 ms.
- Media delta (S4 minus S4b) p95: 27.46, 27.00, and 27.01 ms across the three runs. All below 50 ms.
- Scaling ratio S2/S2a at p95: 3.43, 3.46, and 3.31 across the three runs. All below 4.5. At medians the ratio is 2.5–2.9. Per-message cost falls with size, consistent with a fixed per-call overhead being amortized.

## CPU profile attribution

The sampler collected 440 samples at 1 ms over 30 S2 and 30 S3 calls. It records JS stacks only; SQLite waits are not sampled.

| Target | Inclusive ms | Note |
|---|---:|---|
| `decodeMessageRow` | 96.00 | About 1.6 ms per U1 call across the 60 calls. |
| `filter` | 1.00 | The final filter in `messageEntries`. |
| `prepare` | 1.00 | `InstructionState.prepare`. |
| `latestCompaction` | not isolatable | No samples above the sampler's resolution. The profile's S2/S3 workloads do not make the query visible; its cost is bounded by U2 minus U6, U5, and U4, which also contains decode. |
| `withRecentText` | not covered | The profile covered S2 and S3 only; neither has a `keepID` compaction, so retained text was not exercised. The S5/S5b A/B delta is the evidence. |
| Transaction overhead | not isolatable | No samples; the U1 minus U2 minus U3 subtraction is unstable across runs. |

Top self-time frames were `values` (186 ms), `parse` (100 ms), anonymous (76 ms), `forEach` (20 ms), and `parseChecks` (8 ms). These are Schema decoding and iteration frames. The profile attributes the JS work to decoding, not to the SQL functions, which is consistent with the phase data: S3's cost is dominated by reading and decoding 10,000 parts, not by `latestCompaction`, `withRecentText`, or the filter.

## Scaling analysis

S2 and S2a have the same shape and differ only in message count. The 100-iteration p95 ratio is 3.31–3.46 for 4x messages, below the 4.5 threshold. The cost is not quadratic: the extra 1,500 messages add about 10.6–11.3 ms p95 over S2a, and the per-message cost decreases. The S6-local and S6-mismatch scenarios read all 2,000 rows and filter the native checkpoint, costing 11.29 and 13.61 ms p95 in run 3; the S6-latest and S6-match scenarios read only the 101 rows from the checkpoint, costing 0.89 and 1.00 ms p95. The boundary choice, not the session size alone, determines the read range.

## Per-turn projection

The projection multiplies U1 p95 by 1, 10, and 50 steps and excludes provider latency. It assumes every step reconstructs history, which the current code does. The S3 row uses the third run's p95 (121.93 ms); the distribution range is 103.66–121.93 ms, so the 10-step projection is about 1.04–1.22 s and the 50-step projection about 5.22–6.10 s.

| Scenario | 1 step | 10 steps | 50 steps |
|---|---:|---:|---:|
| S2 (2,000 messages, 1 part each) | 15.2 ms | 151.6 ms | 758.0 ms |
| S3 (500 messages, 20 tool parts each) | 121.9 ms | 1,219.3 ms | 6,096.7 ms |

The per-step cost is above the 100 ms budget in every 100-iteration run. The cumulative cost is the reason the finding matters: a long tool-heavy turn spends seconds rebuilding the same history.

## Verdict

The R-09 cross-run distribution rule applied to the three 100-iteration runs:

| Condition | Measured | Threshold | Result |
|---|---:|---:|---|
| S3 U1 p95, run 1 | 104.47 ms | at least 100 ms | met |
| S3 U1 p95, run 2 | 103.66 ms | at least 100 ms | met |
| S3 U1 p95, run 3 | 121.93 ms | at least 100 ms | met |
| S2 U1 p95 | 15.16–15.90 ms | at least 100 ms | not met |
| S2 / S2a p95 ratio for 4x messages | 3.31–3.46 | greater than 4.5 | not met |
| Retained-text delta p95 | 1.47–2.10 ms | at least 50 ms | not met |
| Media delta p95 | 27.00–27.46 ms | at least 50 ms | not met |
| S2 p95 / median | 1.34–1.44 | greater than 2 | not met |
| S3 p95 / median | 1.21–1.42 | greater than 2 | not met |

All three S3 p95 values are at or above 100 ms, so the distribution rule gives **Material**. The S3 p95/median ratios are below 2, so the result is not inconclusive. The 100 ms threshold is unchanged, and the median is not used as the verdict statistic. The materiality is the S3 tail: the median is stable at 85.21–85.90 ms, while the p95 is 103.66–121.93 ms and the max is 134.74–159.46 ms.

## Reproducibility

The 100-iteration distribution is the verdict basis: 104.47, 103.66, and 121.93 ms, all above 100 ms. The S3 median is stable at 85.21, 85.90, and 85.61 ms. The S2 p95 is stable at 15.90, 15.62, and 15.16 ms.

The 20-iteration runs explain the earlier instability. At 20 iterations the p95 is the second-highest of 20 samples, so one slow sample can move it by 20–30 ms. The final-revision 20-iteration runs produced 93.24, 92.86, and 93.96 ms; the Tester's two clean 20-iteration runs produced 120.51 and 115.77 ms. The same tree therefore straddled 100 ms at 20 iterations. At 100 iterations the p95 is the fifth-highest of 100 samples and is less sensitive to a single sample; all three runs are above 100 ms.

The tail is real, not a code regression: the median is stable across both iteration counts, and the slowest S3 sample is 135–159 ms. The cause is GC and scheduler variance in the S3 tail, not a change in the measured path.

## Recommendation

The materiality is driven by `withParts`, so the recommended next step is a separate optimization spec, not a change in this investigation. The reusable unit is the merged and decoded part set for a message range. The current path re-reads 10,000 `session_part` rows and re-merges them into 500 messages on every step; the part rows are immutable once the message is settled.

Proposed separate spec:

- **Target:** reduce the S3 `withParts` cost. It is 76.67 ms p95 (about 82% of U1) in the 20-iteration baseline and 77.22–82.14 ms p95 (about 67–74% of U1) across the 100-iteration runs.
- **Reusable unit:** the ordered part set for a message range, keyed by session, boundary, and sequence range, with the decoded content attached.
- **Invalidation rule:** any durable message or part write for the session invalidates the cached range. That includes tool results, steering input, compaction, revert, and media writes. Instruction epochs and compaction boundaries also invalidate.
- **Expected gain:** removing most of the 77–82 ms `withParts` cost would bring S3 p95 below 100 ms. The residual message select, decode, and instruction work remains.
- **Risks:** stale parts if invalidation misses a write; memory retention for long sessions; cache-key complexity across boundaries and forks; interaction with media hydration and compaction.
- **Invariants:** fresh history at every step; instruction epochs; compaction boundaries; media lifetime; steering and tool writes between steps. The cache must never serve a part set that predates a durable write.

This is a proposal for a separate spec. No optimization was implemented in this investigation.

## Limitations

- The S3 p95 tail is heavy and unstable. The median is stable at 85.21–85.90 ms; the p95 is 103.66–121.93 ms and the max is 134.74–159.46 ms. The verdict is Material under the approved 100 ms p95 rule, not because the typical step is slow.
- The 20-iteration p95 is the second-highest of 20 samples and can cross the threshold in either direction. The 100-iteration p95 is the fifth-highest of 100 and is more stable, but still varies by about 18 ms across runs.
- The benchmark is synthetic and runs on Windows with Bun 1.4.4. Real sessions and other platforms may differ.
- The phase subtraction is approximate. The transaction overhead is not isolatable; it varies from -5.14 to +19.85 ms across the three runs.
- The CPU profile has 440 samples and records JS stacks only. It covered S2 and S3, which do not exercise retained text; the S5/S5b delta is the retained-text evidence.
- Heap deltas are noisy. RSS and the analytical size are the reliable memory figures.
- S6-local and S6-mismatch reach the same result shape through the `latestCompaction` exclusion and the final filter, not through the literal recursive branch. The result-shape assertions pass.

## Reproduction

```powershell
cd packages/core
bun run benchmark:session-context
```

100-iteration distribution run:

```powershell
cd packages/core
bun run benchmark:session-context --iterations 100 --json session-context-100.json
```

CPU profile and kept database:

```powershell
cd packages/core
bun run script/benchmark-session-context.ts --profile session-context-profile.json --keep
```

Negative assertion check: copy `script/benchmark-session-context.ts` to `script/benchmark-session-context-negative.ts`, change S1's expected `entries` from 20 to 21, run `bun run script/benchmark-session-context-negative.ts --iterations 1 --warmups 1`, and confirm exit code 1 with `S1: entry count expected 21, actual 20`. Delete the copy afterwards.

## Verification record

| Check | Command | Result |
|---|---|---|
| 100-iteration run 1 | `bun run benchmark:session-context --iterations 100 --json C:\Users\barne\AppData\Local\Temp\session-context-100-run1.json` | exit 0, 35.56 s, S3 p95 104.47 ms, Material |
| 100-iteration run 2 | `bun run benchmark:session-context --iterations 100 --json C:\Users\barne\AppData\Local\Temp\session-context-100-run2.json` | exit 0, 35.02 s, S3 p95 103.66 ms, Material |
| 100-iteration run 3 | `bun run benchmark:session-context --iterations 100 --json C:\Users\barne\AppData\Local\Temp\session-context-100-run3.json` | exit 0, 35.81 s, S3 p95 121.93 ms, Material |
| 20-iteration baseline | `bun run benchmark:session-context` | exit 0 at 10.52, 10.08, and 10.47 s; S3 p95 93.24, 92.86, 93.96 ms; Not material |
| Tester's 20-iteration runs | same command | S3 p95 120.51 and 115.77 ms; Material |
| Negative check | copy with S1 entries 21 | exit 1, `S1: entry count expected 21, actual 20` |
| Typecheck | `bun typecheck` in `packages/core` | pass, 1,963 files |
| Scope | `git diff --stat` plus untracked files | only the script, `package.json`, and this report; no `packages/core/src/` changes |
| `--keep` | `bun run script/benchmark-session-context.ts --iterations 1 --warmups 1 --keep` | directory left and path printed; default runs removed theirs |
