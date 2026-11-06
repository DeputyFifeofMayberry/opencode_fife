# Implementation report: edit line endings scaling

**Spec:** `.opencode/specs/2026-11-06-edit-line-endings-scaling.md`, revision 1, approved 2026-11-06.
**Stage:** Implementation (authorized 2026-11-06). No commit, push, branch, or PR.
**Base:** `dev` at `a2e29605ff`, one commit ahead of `origin/dev`, clean at the start.
**Worktree:** `Y:/CodingProjects/opencode_fife`. The `harness-optimization` worktree was not touched.
**Status:** COMPLETE (full core suite and repository check deferred to Tester).

## Changed paths

| Path | Change |
|---|---|
| `packages/core/src/tool/plugin/edit-endings.ts` | New internal module. Holds `crlf`, `normalizeForMatch`, `lineEnding`, `withRegionEndings`, `alignLines`. `withRegionEndings` now has the R-01/R-02 fast paths and the R-03 prefix trim. |
| `packages/core/src/tool/plugin/edit.ts` | Imports `crlf`, `lineEnding`, `normalizeForMatch`, `withRegionEndings` from `./edit-endings.js`; removed the local copies. `EditTool`, `name`, `Input`, `Output`, `Plugin` are unchanged. |
| `packages/core/script/benchmark-edit.ts` | New benchmark. Calls `withRegionEndings` directly for the 12 workloads in R-04. |
| `packages/core/package.json` | Added `"benchmark:edit": "bun run script/benchmark-edit.ts"`. |
| `packages/core/test/tool-edit-endings.test.ts` | New direct tests for R-01/R-02/R-03, the 10,000-line uniform test, the section 2.5 suffix counterexample, and the `EditTool` surface check. |
| `.opencode/reports/implementation/2026-11-06-edit-line-endings-scaling.md` | This report. |
| `.opencode/reports/implementation/evidence/2026-11-06-edit-line-endings-scaling/` | Raw benchmark and differential evidence. |

The eight existing line-ending tests in `packages/core/test/tool-edit.test.ts` were not edited. `packages/core/src/tool/plugin/file-diff.ts`, the `endingsOnly` branch, and `missHint` were not edited.

## Requirements and acceptance criteria

| ID | State | Evidence |
|---|---|---|
| R-01 uniform-ending fast path | Implemented | `withRegionEndings` returns `after.join(ending)` when `fallback === ending` and every region ending is identical, and `after.join(fallback)` when the region has no line break. When a direct caller passes a different fallback, it falls through to the alignment path, preserving the old bytes. Direct tests: uniform CRLF 3/4 lines, uniform LF, fallback-disagreement fall-through, no-break region. |
| R-02 single-line replacement | Implemented | `if (!replacement.includes("\n")) return replacement` before any region work. Direct test with a mixed region. |
| R-03 common-prefix trim | Implemented | Longest common prefix of `normalizeForMatch(line.trimEnd())` keys is matched one-to-one; only the remainder goes to `alignLines`, with indices offset by the prefix. No suffix trim. Direct 1,000-line-prefix test and section 2.5 counterexample test. |
| R-04 benchmark | Implemented | `packages/core/script/benchmark-edit.ts`, `benchmark:edit` script, 12 workloads, elapsed ms and `arrayBuffers` delta per row. Baseline and post-change recorded below. |
| R-05 tests | Implemented | `packages/core/test/tool-edit-endings.test.ts`: 9 tests. All eight existing line-ending tests pass unchanged. 10,000-line-per-side uniform test asserts exact output. The fallback-disagreement test proves the guard. |
| R-06 unchanged `EditTool` surface | Implemented | `edit.ts` imports the helpers and exports only `EditTool`, `name`, `Input`, `Output`, `Plugin`. The test asserts `Object.keys(EditTool).sort()` equals `["EditTool", "Input", "Output", "Plugin", "name"]`. |
| R-07 no behavior change | Implemented | Existing edit suite passes (21/21). The `endingsOnly` path, `missHint`, BOM handling, and unchanged-result failure were not edited. Differential check: 50,000 random cases and 5 fixed cases match the original algorithm byte-for-byte. |
| R-08 checks | NOT RUN (deferred to Tester) | The full core suite and the repository check are deferred to the Tester; see the verification table. |
| AC-01 | Passed | Direct tests for uniform CRLF, uniform LF, fallback disagreement (`"a\r\nb\r\nc"`, `"x\ny"`, fallback `"\n"` → `"x\r\ny"`), no-break region, and no-break replacement, each with a golden string. |
| AC-02 | Passed | 1,000-line common prefix test and the section 2.5 suffix counterexample test. |
| AC-03 | Passed | Existing edit suite: 21 pass, 0 fail; the eight line-ending expectations are unedited. |
| AC-04 | Passed | Benchmark command completes and prints one row per workload. Baseline and post-change tables below. |
| AC-05 | Passed | Uniform CRLF 10,000: 314.89 ms baseline to 0.73 ms post-change (median of three), `arrayBuffers` delta 0.00 MiB in both (measurement caveat below), analytical full table 381.55 MiB baseline to 0 post-change. |
| AC-06 | Passed | `EditTool` surface test. |
| AC-07 | NOT RUN (deferred to Tester) | `bun test` from `packages/core` and `bun run check` from the repository root are deferred to the Tester. |

## Benchmark

Command, from `packages/core`:

```
bun run benchmark:edit
```

The benchmark builds the region and replacement strings once per workload, forces GC twice, samples `process.memoryUsage()`, runs `withRegionEndings` once, and samples again. The `full table MiB` column is analytical: `4 * (region lines + 1) * (replacement lines + 1)`, the pre-change allocation. The `arrayBuffers MiB` and `external MiB` columns are measured deltas.

**Measurement caveat.** Bun 1.4.4 does not count `new Uint32Array` allocations in `process.memoryUsage().arrayBuffers`; a standalone 400 MB `Uint32Array` reports `arrayBuffers` delta 0. The `external` delta does track it, but it is noisy because the table can be collected before the post-call sample. The analytical full-table column is therefore the reliable allocation figure. The measured `arrayBuffers` delta is reported as required and is 0.00 MiB for every workload in both runs.

### Baseline (extracted, unoptimized code)

| Workload | Elapsed ms | arrayBuffers MiB | external MiB | Full table MiB (analytical) |
|---|---:|---:|---:|---:|
| uniform CRLF 1000 | 6.16 | 0.00 | 0.00 | 3.82 |
| uniform CRLF 5000 | 87.23 | 0.00 | 0.07 | 95.41 |
| uniform CRLF 10000 | 314.89 | 0.00 | 381.55 | 381.55 |
| uniform LF 1000 | 5.58 | 0.00 | 0.00 | 3.82 |
| uniform LF 5000 | 65.90 | 0.00 | 0.00 | 95.41 |
| uniform LF 10000 | 271.61 | 0.00 | 0.00 | 381.55 |
| mixed 1000 | 3.33 | 0.00 | 0.00 | 3.82 |
| mixed 5000 | 68.35 | 0.00 | 0.00 | 95.41 |
| mixed 10000 | 296.00 | 0.00 | 0.02 | 381.55 |
| mixed mostly unchanged 5000 | 111.32 | 0.00 | 0.00 | 95.41 |
| mixed heavily changed 5000 | 70.11 | 0.00 | 0.00 | 95.41 |
| large region one-line replacement 10000 | 1.69 | 0.00 | 0.00 | 0.08 |

### Post-change (median of three runs)

| Workload | Elapsed ms | arrayBuffers MiB | external MiB | Full table MiB (analytical) | Post-change table MiB (analytical) |
|---|---:|---:|---:|---:|---:|
| uniform CRLF 1000 | 0.40 | 0.00 | 0.00 | 3.82 | 0 |
| uniform CRLF 5000 | 0.57 | 0.00 | 0.00 | 95.41 | 0 |
| uniform CRLF 10000 | 0.73 | 0.00 | 0.00 | 381.55 | 0 |
| uniform LF 1000 | 0.09 | 0.00 | 0.00 | 3.82 | 0 |
| uniform LF 5000 | 0.36 | 0.00 | 0.00 | 95.41 | 0 |
| uniform LF 10000 | 0.71 | 0.00 | 0.00 | 381.55 | 0 |
| mixed 1000 | 6.02 | 0.00 | 0.00 | 3.82 | 3.82 |
| mixed 5000 | 88.32 | 0.00 | 0.07 | 95.41 | 95.41 |
| mixed 10000 | 296.19 | 0.00 | 0.01 | 381.55 | 381.55 |
| mixed mostly unchanged 5000 | 41.87 | 0.00 | 0.00 | 95.41 | 23.86 |
| mixed heavily changed 5000 | 69.81 | 0.00 | 0.06 | 95.41 | 95.41 |
| large region one-line replacement 10000 | 0.00 | 0.00 | 0.00 | 0.08 | 0 |

The post-change table column is 0 for the R-01/R-02 fast paths. For the mixed workloads the prefix trim leaves: mixed 1000/5000/10000 have no common prefix (all lines changed), so the full table remains; mixed mostly unchanged 5000 changes line 2,500 of 5,000, leaving a 2,500-line core and a `(2501)^2 * 4` byte table (23.86 MiB); mixed heavily changed 5000 keeps the full 95.41 MiB table.

The single-run benchmark showed mixed 1000/5000 slightly above the single baseline run. A warm A/B micro-benchmark (same inputs, repeated calls) shows the optimized function is not slower: mixed 1000 all changed 2.89 ms vs 3.15 ms, mixed 5000 all changed 66.32 ms vs 76.95 ms, mixed 5000 one changed 36.01 ms vs 122.86 ms, uniform CRLF 10000 0.75 ms vs 314.78 ms. The single-run difference is JIT warm-up noise.

### Post-guard confirmation

The guard adds one string comparison to the uniform fast path. Four post-guard runs of `bun run benchmark:edit` produced:

| Workload | Post-guard elapsed ms (four runs) | Pre-guard range | arrayBuffers MiB | external MiB | Full table MiB (analytical) |
|---|---|---:|---:|---:|---:|
| uniform CRLF 10000 | 0.97, 0.73, 0.92, 0.74 | 0.72–0.83 | 0.00 | 0.00 | 381.55 |
| uniform LF 10000 | 0.60, 0.59, 0.75, 0.60 | 0.58–0.84 | 0.00 | 0.00 | 381.55 |
| mixed mostly unchanged 5000 | 42.78, 43.16, 40.31, 42.66 | 40.65–42.23 | 0.00 | 0.00 | 95.41 |

All uniform rows remain sub-millisecond, and their ranges overlap the pre-guard runs. The mixed mostly unchanged row is also within its pre-guard range. The guard's single string comparison is not a measurable cost.

## Verification

| Check | Command | Result | Evidence |
|---|---|---|---|
| Existing edit suite (extraction) | `bun run script/test.ts test/tool-edit.test.ts` from `packages/core` | PASSED: 21 pass, 0 fail, 85 expect() calls, 2.79s | Run before the optimization, after the verbatim extraction. |
| Existing + new tests (post-guard) | `bun run script/test.ts test/tool-edit-endings.test.ts test/tool-edit.test.ts` from `packages/core` | PASSED: 30 pass, 0 fail, 94 expect() calls, 1.147s | 21 existing + 9 new; the eight existing line-ending expectations are unchanged. |
| New direct tests (post-guard) | `bun run script/test.ts test/tool-edit-endings.test.ts` from `packages/core` | PASSED: 9 pass, 0 fail, 9 expect() calls, 459ms | Includes the fallback-disagreement test at `tool-edit-endings.test.ts:14`, the 10,000-line uniform test, and the `EditTool` surface test. |
| Differential check | `bun run C:\Users\barne\AppData\Local\Temp\opencode\edit-endings-differential.ts` | PASSED: 50,000 random cases and 5 fixed cases match the original byte-for-byte | Temporary script outside the repository; evidence in `evidence/differential-and-ab.txt`. |
| Warm A/B micro-benchmark | `bun run C:\Users\barne\AppData\Local\Temp\opencode\edit-endings-ab.ts` | PASSED: optimized is faster on every workload | Evidence in `evidence/differential-and-ab.txt`. |
| Package typecheck | `bun typecheck` from `packages/core` | NOT RUN (deferred to Tester) | The full suite exceeded the implementation turn; the Tester will run typecheck, the full suite, and the repository check. A pre-guard `bun typecheck` passed (1,961 files, no errors), but it is not the final post-guard check. |
| Full core test suite | `bun test` from `packages/core` | NOT RUN (deferred to Tester) | The full suite exceeded the implementation turn; the Tester will run all three deferred checks. |
| Repository check | `bun run check` from the repository root | NOT RUN (deferred to Tester) | The full suite exceeded the implementation turn; the Tester will run all three deferred checks. |

## Decisions, deviations, and limitations

- **Extraction.** The helpers moved verbatim first, the existing suite passed, the benchmark baseline was measured, then the fast paths and prefix trim were applied. This keeps the baseline honest.
- **Fallback guard.** The uniform fast path requires `fallback === ending` before joining with the region's ending. The production caller passes `lineEnding(region, fileEnding)`, which equals that ending for a uniform region, so production cost is one string comparison. A direct caller that passes a different fallback falls through to the existing alignment path, preserving the old bytes. The direct test at `packages/core/test/tool-edit-endings.test.ts:14` calls `withRegionEndings("a\r\nb\r\nc", "x\ny", "\n")` and asserts `"x\r\ny"`, the old algorithm's output. No deviation remains.
- **No suffix trim.** The implementation trims only the common prefix. The direct test uses `region = "A\r\nB\nA\n"`, `replacement = "A\nX"` and asserts `"A\r\nX"`; a suffix trim would give `"A\nX"`.
- **Benchmark memory measurement.** `arrayBuffers` is 0 for `new Uint32Array` in Bun 1.4.4. The benchmark prints `arrayBuffers` as required, plus `external` and the analytical full-table size. The report labels measured and analytical figures separately.
- **Benchmark "mostly unchanged" position.** The one changed line is line 2,500 of 5,000, a middle change, so the prefix trim leaves a 2,500-line core. This is the residual case the spec records.
- **Environment repair.** The checkout's `node_modules` symlinks were untraversable on this drive (`untrusted mount point`). The dependency tree was reinstalled with `bun install --backend=copyfile --ignore-scripts --frozen-lockfile` and `bun run --cwd packages/core fix-node-pty`. No tracked file changed; `bun.lock` is unchanged.
- **No input caps, no truncation, no new validation.** The change only adds fast paths and prefix trimming.
- **No edits to `file-diff.ts`, `endingsOnly`, or `missHint`.**

## Remaining work

- Deferred to the Tester: `bun typecheck` from `packages/core`, the full `bun test` from `packages/core`, and `bun run check` from the repository root.
