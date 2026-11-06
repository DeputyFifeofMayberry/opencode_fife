# Edit tool: line-ending alignment scaling

**Status:** Approved
**Revision:** 1
**Date:** 2026-11-06
**Source finding:** `docs/audits/cli-performance/app-performance-review-2026-11-05.md`, finding 1

**Approval:** Revision 1 approved by user on 2026-11-06. Implementation authorized.

## 1. Outcome and scope

A large edit currently allocates a line-matching table whose size is the product of the matched region's line count and the replacement's line count. A 10,000-line region against a 10,000-line replacement allocates about 400 MB (381 MiB) and runs 100 million synchronous loop iterations. The table exists only to decide which line ending each output line inherits.

After this change, a matched region that uses one consistent line ending never allocates the table. A region with mixed endings aligns only its changed core. Output bytes stay identical in every case. The change has no effect on token usage.

In scope:

1. A fast path for regions with a single line ending, including regions with no line break.
2. Common-prefix trimming before alignment for mixed-ending regions.
3. A committed benchmark that measures the alignment function at fixed workloads.
4. Correctness tests for each fast path and a large-input test.
5. No change to `EditTool`'s public exports.

Out of scope:

1. The per-match full-content rebuild at `edit.ts:324-329`. Deferred; recorded in section 7 as a follow-up.
2. Unbounded `replaceAll` match counts.
3. New input size caps or truncation.
4. The residual mixed-ending large-core case. Measured and documented, not fixed.
5. Every other finding in the audit.

## 2. Current behavior and evidence

### 2.1 The table

`packages/core/src/tool/plugin/edit.ts:119-126`:

```ts
const withRegionEndings = (region: string, replacement: string, fallback: string) => {
  const before = region.split(/\r?\n/)
  const endings = [...region.matchAll(/\r?\n/g)].map((match) => match[0])
  const after = replacement.split("\n")
  const key = (line: string) => normalizeForMatch(line.trimEnd())
  const source = alignLines(before.map(key), after.map(key))
  return after.map((line, index) => (index === after.length - 1 ? line : line + (endings[source[index]!] ?? fallback))).join("")
}
```

`alignLines` (`edit.ts:132-163`) allocates `new Uint32Array((before.length + 1) * (after.length + 1))` and fills it with a nested loop over the same dimensions.

`withRegionEndings` is called once per replacement from `matchView`'s `replace` closure (`edit.ts:184-187`):

```ts
replace: (match: Match) => {
  const region = source.slice(match.start, match.end)
  return withRegionEndings(region, replacement, lineEnding(region, fileEnding))
},
```

`region` is the matched slice of the original file. `replacement` is `newString` with CRLF normalized to LF (`edit.ts:174`). `fallback` is the region's dominant ending, falling back to the file's dominant ending.

### 2.2 Why the table exists

The edit tool accepts `\n` from the model and promises to preserve the file's own line endings. When the matched region itself contains mixed endings, the tool pairs each replacement line with a region line through a longest-common-subsequence alignment. An unchanged line keeps its region line's ending, a line changed in place inherits the ending of the line it replaces, and lines beyond any counterpart take `fallback`.

### 2.3 What bounds the table

Nothing in the tool caps `oldString`, `newString`, or the number of replacements. `Input` (`edit.ts:25-35`) declares both as plain `Schema.String` with descriptions only. The only validations are equality and emptiness checks (`edit.ts:288-297`). `replaceAll: true` applies every match (`edit.ts:324`), and each match allocates its own table.

The generic tool-output bound (`packages/core/src/tool-output.ts:13`, `MAX_LINES = 2_000`) applies to tool results, not to edit inputs.

The practical ceiling is the model's context window. Twenty thousand lines at roughly 40 characters each is about 800 KB, or 200k tokens, which is at or beyond what a model can emit in one tool call. The realistic large edit is closer to 2,000 lines per side: a 16 MB table and 4 million iterations.

### 2.4 Why most of the work is unnecessary

`fallback` is `lineEnding(region, fileEnding)` (`edit.ts:186`). `lineEnding` (`edit.ts:106-111`) returns the region's dominant ending whenever the two counts differ, and returns its fallback argument only when they are equal.

- If the region contains only CRLF, `crlfCount > 0` and `lfCount = 0`, so it returns CRLF.
- If the region contains only LF, `crlfCount = 0` and `lfCount > 0`, so it returns LF.
- If the region contains no line break, both counts are 0, so it returns `fileEnding`, and `endings` is empty, so every output line takes `fallback`.

In a uniform region, `endings[source[index]]` and `fallback` are therefore the same string. The alignment result cannot change the output. Skipping `alignLines` and joining the replacement lines with that ending produces identical bytes.

If the replacement contains no `\n`, `after` has one element and the map returns it unchanged.

### 2.5 Prefix trimming is exact; suffix trimming is not

The traceback starts at `i = 0, j = 0` and, while `before[i] === after[j]`, assigns `result[j] = i` and advances both (`edit.ts:150-155`). If the first `p` lines are equal by key, those lines are matched one-to-one before any other branch can run. Removing that prefix and offsetting the remaining indices yields the same mapping for the remaining lines.

Trimming a common suffix is not equivalent. With `before = ["A", "B", "A"]` and `after = ["A"]`, the full traceback maps `after[0]` to `before[0]`. Trimming the common suffix (`before[2] === after[0]`) would map it to `before[2]`. If `before[0]` ends CRLF and `before[2]` ends LF, the output differs. The implementation must not trim a suffix.

### 2.6 Existing tests

`packages/core/test/tool-edit.test.ts` covers line endings in eight tests:

| Test | Line |
|---|---|
| uses non-overlapping trailing-whitespace matches and preserves CRLF | 598 |
| preserves BOM and CRLF line endings | 629 |
| matches across mixed line endings and keeps each region's endings | 650 |
| keeps the endings of unchanged and in-place lines inside a multi-line match | 700 |
| applies edits that differ only in `\r` to the exact bytes | 733 |
| ignores trailing whitespace while preserving untouched lines | 581 |
| fails instead of reporting success when the edit leaves the file unchanged | 780 |
| replaces every exact occurrence when replaceAll is true | 522 |

The two mixed-ending tests assert exact output bytes, including the case where a region crosses a CRLF/LF boundary.

### 2.7 Measurement status

No benchmark for the edit tool exists. `packages/core/package.json` has `benchmark:location` and `benchmark:location-memory`, both Location-level. The audit's 400 MB figure is arithmetic from the allocation, not a measured result.

## 3. Requirements

**R-01. Uniform-ending fast path.** When the matched region has no line break, or all of its line breaks are the same sequence, `withRegionEndings` must return the replacement's lines joined with that ending without calling `alignLines`. When the region has no line break, the join uses `fallback`. The result must be byte-identical to the current implementation for every input that reaches this branch.

**R-02. Single-line replacement.** When the replacement contains no `\n`, `withRegionEndings` must return it unchanged. This must hold for every region shape, including mixed-ending regions.

**R-03. Common-prefix trim.** Before aligning a mixed-ending region, remove the longest common prefix of lines, compared with `normalizeForMatch(line.trimEnd())`, and assign those lines their own endings. Align only the remaining lines. The result must be byte-identical. Do not trim a common suffix, for the reason in section 2.5.

**R-04. Benchmark.** Add a benchmark to `packages/core` that calls the alignment function directly and prints one row per workload with elapsed milliseconds and peak `arrayBuffers` growth. It must run from `packages/core` with one command and be committed. Workloads:

| Workload | Region | Replacement |
|---|---|---|
| uniform CRLF, 1k / 5k / 10k | N lines, all CRLF | N lines |
| uniform LF, 1k / 5k / 10k | N lines, all LF | N lines |
| mixed, 1k / 5k / 10k | alternating CRLF and LF | N lines |
| mixed, mostly unchanged | 5,000 lines, one line changed | 5,000 lines |
| mixed, heavily changed | 5,000 lines, all lines changed | 5,000 lines |
| large region, one-line replacement | 10,000 lines | 1 line |

The benchmark must report the pre-change baseline and the post-change result in the implementation report.

**R-05. Tests.** Add direct unit tests for R-01, R-02, and R-03. Keep every existing line-ending test unchanged. Add one test at 10,000 lines per side that exercises the uniform fast path and asserts exact output.

**R-06. Testable helpers, unchanged surface.** The alignment helpers must be importable by a test and a benchmark without executing the tool. The recommended arrangement is a new internal module `packages/core/src/tool/plugin/edit-endings.ts` holding `withRegionEndings`, `alignLines`, `lineEnding`, and the normalization and `crlf` constant they need, with `edit.ts` importing them. An equivalent arrangement is acceptable if `EditTool` keeps its current members (`EditTool`, `name`, `Input`, `Output`, `Plugin`) and gains none of the helpers.

**R-07. No behavior change.** Every edit that succeeds today must produce the same bytes. Every edit that fails today must fail with the same message. The `endingsOnly` path (`edit.ts:319-322`), `missHint`, BOM handling, and the unchanged-result failure must not change.

**R-08. Checks.** `bun test` from `packages/core` passes. `bun run check` from the repository root passes, or any failure is shown to predate the change.

## 4. Acceptance criteria

**AC-01 (R-01, R-02, R-05).** Direct unit tests on the alignment function:

- A three-line uniform CRLF region with a four-line replacement produces CRLF on every line except the last.
- A three-line uniform LF region produces LF.
- A region with no line break uses `fallback`.
- A replacement with no line break is returned unchanged, including when the region is mixed.
- Each case matches a golden string.

**AC-02 (R-03, R-05).** A mixed-ending region whose first 1,000 lines are identical to the replacement's first 1,000 lines produces the same bytes as the current implementation. A test built on the section 2.5 counterexample confirms the suffix is not trimmed: the output line takes the ending of the first matching region line, not the last.

**AC-03 (R-05, R-07).** All eight existing line-ending tests pass with their expected strings unedited.

**AC-04 (R-04).** The benchmark command completes from `packages/core` and prints one row per workload with elapsed milliseconds and `arrayBuffers` delta. The implementation report contains the pre-change baseline and the post-change result for every workload.

**AC-05 (R-01, R-04, performance).** On the reference machine, the 10,000-line uniform CRLF workload shows an `arrayBuffers` delta below 1 MB and an elapsed time at least 10 times lower than the pre-change baseline. The mixed heavily-changed workload is recorded and is not required to improve.

**AC-06 (R-06).** `EditTool` keeps its current members (`EditTool`, `name`, `Input`, `Output`, `Plugin`) and does not gain the alignment helpers. A test or a documented inspection confirms it.

**AC-07 (R-08).** `bun test` in `packages/core` passes. `bun run check` passes, or its failure is shown to predate the change.

## 5. Constraints and decisions

**Base and worktree.** Work continues in `Y:/CodingProjects/opencode_fife` on `dev` at `a2e29605ff`, which is one commit ahead of `origin/dev` and clean. The other worktree (`harness-optimization`, `f47abd338a`) belongs to another session and must not be touched.

**No input caps.** This change does not add size limits to `oldString`, `newString`, or `replaceAll`. A cap would change which edits succeed and is a separate product decision.

**Residual risk.** A mixed-ending region whose changed core is thousands of lines still allocates the full table. Triggering it requires a file with mixed endings, a single edit with thousands of lines on both sides, and a changed core that the prefix trim cannot shrink. The benchmark records this case so the cost is known rather than assumed.

**Benchmark scope.** The benchmark measures the alignment function directly, so file I/O, diff generation, and formatting are excluded. That isolates the finding. The end-to-end effect follows because the table was the dominant cost for large uniform edits.

**Token cost.** None. The work is local computation. The size of `oldString` and `newString` drives token cost, and this change does not alter those sizes.

**Deferred follow-up.** The reducer at `edit.ts:324-329` rebuilds the whole file string once per match. With `replaceAll` over many matches that cost grows with matches times file size. It is a separate finding and is not addressed here.

**Approval choice on the residual case.** The user chose to fix the common case exactly and document the residual rather than adding a memory cap or replacing the algorithm. A cap would change output bytes for the extreme case; a linear-memory algorithm would risk changing endings in ordinary mixed files through different tie-breaking.

## 6. Execution record

| Stage | Authorization | State | Evidence | Next owner |
|---|---|---|---|---|
| Specification | — | Approved, revision 1 | This document | — |
| Implementation | Authorized 2026-11-06 | Complete on code and fast checks; package typecheck, full core suite, and root check deferred to Tester | `.opencode/reports/implementation/2026-11-06-edit-line-endings-scaling.md` | Tester |
| Testing | Authorized 2026-11-06 | Complete: AC-01 to AC-06 passed; AC-07 fails only on pre-existing environment failures confirmed on clean HEAD | `.opencode/reports/testing/2026-11-06-edit-line-endings-scaling.md` | QA |
| QA | Not authorized | Not started | — | QA |

Implementation note: the first handoff left the uniform fast path ignoring `fallback`, which was not byte-identical for a direct caller passing an unrelated fallback. The Implementer added a `fallback === ending` guard and a test at `packages/core/test/tool-edit-endings.test.ts:14`. Production behavior and speed are unchanged.

Testing note: AC-07 is recorded as failed as written because the full core suite has 157 failures and the root check exits 1. Both were reproduced on clean HEAD with the change stashed: the suite failures are local bash environment failures in `test/shell-scan/*`, and the root check fails on an untraversable symlink at `packages/app/src/custom-elements.d.ts`. Neither touches the edit tool. Package typecheck passed with no errors in 1,962 files.

Correction cycles used: 1 of 2 (the fallback guard, closed within the implementation stage before the testing handoff).
