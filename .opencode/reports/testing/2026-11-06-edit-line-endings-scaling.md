# Testing report: edit line endings scaling

**Spec:** `.opencode/specs/2026-11-06-edit-line-endings-scaling.md`, revision 1, approved 2026-11-06.
**Implementation:** uncommitted working tree on `dev`, HEAD `a2e29605ff`.
**Testing authorization:** Tester stage, authorized 2026-11-06.
**Environment:** Windows (`win32`), Bun `1.4.4` (`38afee6c8`), repository `Y:\CodingProjects\opencode_fife`, package `packages/core`.
**Overall result:** **Failed as written** on AC-07. The full core suite has 157 failures, all in `test/shell-scan/*`, confirmed pre-existing by a clean-HEAD run. The root check fails in `@opencode/app#typecheck` because `packages/app/src/custom-elements.d.ts` is an untraversable symlink on this drive; `packages/app` is untouched by the change and the failure reproduces standalone. All edit-specific criteria (AC-01 through AC-06) passed.

## 1. Acceptance criteria

| AC | Verdict | Evidence |
|---|---|---|
| AC-01 | **Passed** | Independent golden script: 15/15 cases passed, including uniform CRLF, uniform LF, no-break region, no-break replacement on a mixed region, mixed region, shorter replacement, the fallback-disagreement case `withRegionEndings("a\r\nb\r\nc", "x\ny", "\n") === "x\r\ny"`, empty region, empty replacement, trailing newline, lone `\r`, and a 1,000-line prefix. Command and output in section 2.1. |
| AC-02 | **Passed** | Differential against the pre-change algorithm copied from `git show HEAD:packages/core/src/tool/plugin/edit.ts`: 50,012 cases (11 fixed + 50,000 randomized + 1 large structured), 0 mismatches. Exhaustive differential over a two-symbol alphabet, lengths 0–5, every CRLF/LF ending combination, both fallbacks: 172,116 cases, 0 mismatches. The section 2.5 suffix counterexample returns `"A\r\nX"`, not `"A\nX"`. Section 2.2. |
| AC-03 | **Passed** | `git diff HEAD -- packages/core/test/tool-edit.test.ts` is empty. Existing suite: 21 pass, 0 fail, 85 `expect()` calls. Section 2.3. |
| AC-04 | **Passed** | `bun run benchmark:edit` from `packages/core` completes and prints 12 workload rows with elapsed milliseconds, `arrayBuffers` MiB, `external` MiB, and analytical full-table MiB. The implementation report contains baseline and post-change rows for all 12 workloads. Three independent post-change runs in section 3.1. |
| AC-05 | **Passed** | Uniform CRLF 10,000: 0.72/0.73/0.76 ms versus recorded baseline 314.89 ms (414–437× faster; requirement ≥10×). Uniform LF 10,000: 0.60/0.72/0.59 ms versus recorded baseline 271.61 ms (377–460×). `arrayBuffers` delta 0.00 MiB (requirement <1 MB). Mixed heavily changed 5,000: 66.32/72.92/68.64 ms versus baseline 70.11 ms; no improvement is claimed for this row. Section 3.1. |
| AC-06 | **Passed** | `Object.keys(EditTool).sort()` returns `["EditTool","Input","Output","Plugin","name"]`. No alignment helpers are exported from `edit.ts`; they live in `edit-endings.ts`. Section 2.5. |
| AC-07 | **Failed as written (pre-existing environment failures)** | `bun test` from `packages/core`: 6,284 pass, 1,201 skip, 157 fail, 92,913 `expect()` calls, 7,642 tests across 348 files, 288.39 s, exit code 1. Every failure is in `test/shell-scan/*` and is a local-bash environment failure (`/bin/bash: ... scan_probe: command not found`), not an edit-tool failure. Stash verification: on clean HEAD with the change stashed, `bash-safety.test.ts` still failed 81/435 with the same bash errors, so the failures predate the change. `bun typecheck` from `packages/core`: no type errors in 1,962 files across 2 projects (6.18 s). `bun run check` from the repository root: exit code 1; lint reported 1,348 warnings and 0 errors, and typecheck failed only at `@opencode/app#typecheck` with `TS5083: Cannot read file 'packages/app/src/custom-elements.d.ts'`. That file is a symlink to `../../ui/src/custom-elements.d.ts` on an untrusted mount point; `packages/app` has no diff and the failure reproduces standalone, so it predates and is unrelated to this change. Section 4. |

## 2. Direct behavior and differential evidence

All commands in this section were run from `Y:\CodingProjects\opencode_fife\packages\core`.

### 2.1 Independent golden cases (AC-01)

Command:

```
bun run ../../.opencode/reports/testing/_tmp-edit-endings-independent.ts
```

Output: `15/15 passed, 0 failed`.

The 15 cases and expected strings were derived from the pre-change algorithm, not from the new module:

- `("a\r\nb\r\nc", "a\nb\nc\nd", "\r\n")` → `"a\r\nb\r\nc\r\nd"`.
- `("a\nb\nc", "x\ny\nz", "\n")` → `"x\ny\nz"`.
- `("abc", "x\ny", "\r\n")` → `"x\r\ny"` (no-break region uses fallback).
- `("a\r\nb\nc", "single", "\n")` → `"single"` (no-break replacement, mixed region).
- `("a\r\nb\nc", "a\nb\nc", "\n")` → `"a\r\nb\nc"` (mixed region keeps each line's ending).
- `("a\r\nb\nc\nd", "a\nc", "\n")` → `"a\r\nc"` (replacement shorter than region).
- `("a\r\nb\r\nc", "x\ny", "\n")` → `"x\r\ny"` (fallback disagreement; required by the handoff).
- `("A\r\nB\nA\n", "A\nX", "\n")` → `"A\r\nX"` (section 2.5 suffix counterexample).
- `("", "x\ny", "\n")` → `"x\ny"` (empty region).
- `("a\r\nb", "", "\r\n")` → `""` (empty replacement).
- `("a\r\nb\r\nc", "x\ny\n", "\r\n")` → `"x\r\ny\r\n"` (trailing newline).
- `("a\rb\nc", "x\ny", "\n")` → `"x\ny"` (lone `\r` is not a line break).
- `("a\r\nb\r\n", "x\ny\nz", "\r\n")` → `"x\r\ny\r\nz"` (region ends with a newline).
- `("a\r\nb", "x\ny\nz", "\r\n")` → `"x\r\ny\r\nz"` (region shorter than replacement).
- 1,000-line alternating-ending prefix plus a 3-line changed core: prefix lines keep their own endings; the changed core inherits the region's endings (`new1` CRLF, `new2` LF, `new3` last line).

### 2.2 Differential against the old algorithm (AC-02)

The reference was copied verbatim from `git show HEAD:packages/core/src/tool/plugin/edit.ts`: `crlf`, `normalizeForMatch`, `lineEnding`, `withRegionEndings`, and `alignLines`.

Randomized differential command:

```
bun run ../../.opencode/reports/testing/_tmp-edit-endings-differential.ts
```

Output:

```
fixed cases: 11
random cases: 50000
large structured cases: 1
total cases: 50012
mismatches: 0
```

The randomized generator covered empty strings, single lines, trailing newlines, lone `\r`, mixed endings, replacements longer and shorter than the region, empty replacements, and fallbacks that disagree with the region's dominant ending. The large structured case was a 1,000-line alternating-ending prefix plus a changed core.

Exhaustive differential command:

```
bun run ../../.opencode/reports/testing/_tmp-edit-endings-exhaustive.ts
```

Output:

```
exhaustive cases: 172116
mismatches: 0
```

The exhaustive space was all line sequences over `{A, B}` of length 0–5, every CRLF/LF combination for the separators and optional trailing newline, every replacement line sequence of length 0–5, and fallbacks `"\r\n"` and `"\n"`.

The suffix counterexample was exercised directly: `withRegionEndings("A\r\nB\nA\n", "A\nX", "\n")` returns `"A\r\nX"`. A suffix trim would map `"A"` to the last region line and produce `"A\nX"`.

### 2.3 Existing tests and diff (AC-03, AC-07)

```
git diff HEAD -- packages/core/test/tool-edit.test.ts
```

Output: empty.

```
bun run script/test.ts test/tool-edit.test.ts
```

Output:

```
bun test v1.4.4 (38afee6c8)

 21 pass
 0 fail
 85 expect() calls
Ran 21 tests across 1 file. [2.27s]
```

The eight line-ending tests are present with their expected strings unedited.

### 2.4 New direct tests

```
bun run script/test.ts test/tool-edit-endings.test.ts
```

Output:

```
bun test v1.4.4 (38afee6c8)

 9 pass
 0 fail
 9 expect() calls
Ran 9 tests across 1 file. [1327.00ms]
```

### 2.5 `EditTool` surface (AC-06)

```
bun -e "import { EditTool } from './src/tool/plugin/edit'; console.log(JSON.stringify(Object.keys(EditTool).sort()))"
```

Output:

```
["EditTool","Input","Output","Plugin","name"]
```

`git diff HEAD -- packages/core/src/tool/plugin/edit.ts` shows only the new import line and the removal of the five local helpers (`crlf`, `normalizeForMatch`, `lineEnding`, `withRegionEndings`, `alignLines`). The `endingsOnly` branch and `missHint` are not in the diff.

### 2.6 End-to-end edit-tool cases

A temporary test file, `packages/core/test/_tmp-tester-edit-e2e.test.ts`, used the existing `tool-edit.test.ts` harness (`withTempDir`, `withTool`, `executeTool`, the real `EditTool.Plugin` registration) and was run with:

```
bun run script/test.ts test/_tmp-tester-edit-e2e.test.ts
```

Output:

```
bun test v1.4.4 (38afee6c8)

 3 pass
 0 fail
 7 expect() calls
Ran 3 tests across 1 file. [878.00ms]
```

Cases and written bytes:

- Uniform CRLF file `"alpha\r\nbeta\r\ngamma\r\n"`, edit `oldString: "beta\ngamma"`, `newString: "BETA\nGAMMA"` → written bytes `"alpha\r\nBETA\r\nGAMMA\r\n"`.
- Mixed-ending file `"one\r\ntwo\nthree\r\nfour\n"`, edit `oldString: "one\ntwo\nthree"`, `newString: "ONE\nTWO\nTHREE"` → written bytes `"ONE\r\nTWO\nTHREE\r\nfour\n"` (the mixed region's first line keeps CRLF, the second keeps LF, the third is the last replacement line).
- `replaceAll` on `"a\r\nb\r\na\r\nb\r\n"`, `oldString: "a\nb"`, `newString: "x\ny"`, `replaceAll: true` → 2 replacements, written bytes `"x\r\ny\r\nx\r\ny\r\n"`.

The temporary test file was removed after the run; no existing test was modified.

## 3. Benchmark evidence (AC-04, AC-05)

### 3.1 Post-change benchmark

Command, from `packages/core`, run three times:

```
bun run benchmark:edit
```

Latest three runs:

| Workload | Run 1 ms | Run 2 ms | Run 3 ms | arrayBuffers MiB | external MiB | Full table MiB |
|---|---:|---:|---:|---:|---:|---:|
| uniform CRLF 1000 | 0.47 | 0.46 | 0.41 | 0.00 | 0.00 | 3.82 |
| uniform CRLF 5000 | 0.64 | 0.67 | 0.62 | 0.00 | 0.00 | 95.41 |
| uniform CRLF 10000 | 0.72 | 0.73 | 0.76 | 0.00 | 0.00 | 381.55 |
| uniform LF 1000 | 0.08 | 0.09 | 0.07 | 0.00 | 0.00 | 3.82 |
| uniform LF 5000 | 0.30 | 0.37 | 0.30 | 0.00 | 0.00 | 95.41 |
| uniform LF 10000 | 0.60 | 0.72 | 0.59 | 0.00 | 0.00 | 381.55 |
| mixed 1000 | 6.22 | 6.08 | 6.31 | 0.00 | 0.00 | 3.82 |
| mixed 5000 | 87.71 | 87.88 | 88.43 | 0.00 | 0.07 | 95.41 |
| mixed 10000 | 327.40 | 331.05 | 326.24 | 0.00 | 0.01 / 381.55 / 381.55 | 381.55 |
| mixed mostly unchanged 5000 | 47.44 | 42.30 | 44.46 | 0.00 | 0.00 | 95.41 |
| mixed heavily changed 5000 | 66.32 | 72.92 | 68.64 | 0.00 | 0.06 | 95.41 |
| large region one-line replacement 10000 | 0.00 | 0.00 | 0.01 | 0.00 | 0.00 | 0.08 |

An earlier, separate set of three runs before the full suite produced uniform CRLF 10000 at 0.73/0.79/0.74 ms, uniform LF 10000 at 0.60/0.59/0.61 ms, mixed 10000 at 294.03/295.06/293.61 ms, mixed mostly unchanged 5000 at 40.46/40.59/40.14 ms, and mixed heavily changed 5000 at 65.41/65.65/70.01 ms. The mixed 10000 row is sensitive to machine state: 293–295 ms in the earlier set, 326–331 ms in the latest set. It is the residual full-table case and is not required to improve.

### 3.2 Independent baseline benchmark

The pre-change algorithm was copied verbatim from `git show HEAD:packages/core/src/tool/plugin/edit.ts` and measured with the same workload construction. Command, from `packages/core`, run three times:

```
bun run ../../.opencode/reports/testing/_tmp-baseline-benchmark.ts
```

| Workload | Run 1 ms | Run 2 ms | Run 3 ms | arrayBuffers MiB | external MiB |
|---|---:|---:|---:|---:|---:|
| uniform CRLF 10000 | 359.79 | 353.74 | 364.17 | 0.00 | 0.04 |
| uniform LF 10000 | 300.94 | 293.90 | 316.66 | 0.00 | 0.02 |
| mixed heavily changed 5000 | 65.42 | 77.58 | 71.97 | 0.00 | 0.06 |

The recorded implementation-report baselines are 314.89 ms (uniform CRLF 10000), 271.61 ms (uniform LF 10000), and 70.11 ms (mixed heavily changed 5000). This machine measured 354–364 ms, 294–317 ms, and 65–78 ms respectively, so the recorded baselines are plausible and conservative for the two uniform rows. Even against the slower of the two recorded baselines (271.61 ms), the post-change 0.72 ms is 377× faster, far above the required 10×.

### 3.3 Memory measurement caveat

Probe 1 (`_tmp-memory-arraybuffers.ts`) allocates a 400,000,000-byte `Uint32Array` (381.47 MiB), touches every 4,096th entry, and samples `process.memoryUsage()`:

```
bun: 1.4.4
array byteLength: 400000000 (381.47 MiB)
before: {"arrayBuffers":0,"external":0,"rss":17195008,"heapUsed":496640}
after:  {"arrayBuffers":0,"external":0,"rss":120074240,"heapUsed":514048}
deltas: arrayBuffers=0.00 MiB, external=0.00 MiB, rss=98.11 MiB, heapUsed=0.02 MiB
arrayBuffers delta bytes: 0
external delta bytes: 0
claim (arrayBuffers ignores new Uint32Array): TRUE
```

Probe 2 (`_tmp-memory-arraybuffers-2.ts`) commits every page and samples after GC:

```
after fill (every page touched): arrayBuffers=0.00 MiB (0), external=0.00 MiB (0), rss=400.95 MiB
after Bun.gc(true) x2: arrayBuffers=0.00 MiB (0), external=381.51 MiB (400043192), rss=402.09 MiB
after ArrayBuffer(400MB) + fill: arrayBuffers=381.47 MiB (400000096), external=762.98 MiB (800043288)
after Buffer.alloc(400MB): arrayBuffers=381.47 MiB (400000096), external=762.98 MiB (800043288)
```

Verdict: the report's core caveat is **true**. Bun 1.4.4 does not count `new Uint32Array` in `process.memoryUsage().arrayBuffers`; the delta is 0 bytes even after the array is fully committed and after GC. `external` also reads 0 immediately after allocation and fill, but rises to 400,043,192 bytes (381.51 MiB) after `Bun.gc(true)`. The benchmark samples immediately after the call, so its `external` column is unreliable at that point; the mixed 10000 row showed 0.01 MiB in one run and 381.55 MiB in two runs. The analytical full-table column (`4 * (region lines + 1) * (replacement lines + 1)`) is the reliable allocation figure, as the implementation report states.

## 4. Deferred checks

### 4.1 Full core suite

Command, from `packages/core`:

```
bun test
```

Observed result:

```
 6284 pass
 1201 skip
 157 fail
 92913 expect() calls
Ran 7642 tests across 348 files. [288.39s]
```

Exit code 1. Every failure is in `test/shell-scan/*` (`bash-safety.test.ts`, `bash-syntax.test.ts`, `compound-parity.test.ts`, `parity-regressions.test.ts`). The failures are local-bash environment failures: the tests spawn `bash` with `PATH=/usr/bin:/bin` and expect helper functions such as `scan_probe` to be visible, but the local bash reports `scan_probe: command not found` and, in some cases, syntax errors. No failure names an edit-tool module, `withRegionEndings`, `alignLines`, or a line-ending test.

Stash verification: `git stash push -u -m "tester-preexisting-shell-scan"` removed the change and all untracked test assets, then `bun --cwd packages/core test test/shell-scan/bash-safety.test.ts` ran on clean HEAD. Result: 114 pass, 240 skip, 81 fail, 589 `expect()` calls, 435 tests, 12.02 s, exit code 1, with the same `scan_probe: command not found` and bash syntax errors. `git stash pop` restored the exact pre-stash status (`POP_EXIT=0`, stash dropped; post-pop `git status --short` matched the pre-stash list). This confirms the shell-scan failures predate the change and are not an edit-tool regression.

### 4.2 Root check

Command, from the repository root:

```
bun run check
```

Result: exit code 1. Lint completed with 1,348 warnings and 0 errors. Typecheck ran 34 tasks; 29 succeeded and `@opencode/app#typecheck` failed:

```
error TS5083: Cannot read file 'Y:/CodingProjects/opencode_fife/packages/app/src/custom-elements.d.ts'.
Found 1 error, checked 1,907 files across 1 project [655.69ms]
```

`packages/app/src/custom-elements.d.ts` exists and is tracked, but it is a symbolic link to `../../ui/src/custom-elements.d.ts` on an untrusted mount point. Reading it fails with "The path cannot be traversed because it contains an untrusted mount point." `packages/app` has no diff from HEAD, and `bun run typecheck` from `packages/app` reproduces the same `TS5083` failure standalone. The root check therefore fails for a pre-existing environment reason unrelated to the edit change; it is not claimed as passed.

### 4.3 Package typecheck

Command, from `packages/core`:

```
bun typecheck
```

Output:

```
$ bun check --no-script -b -p tsconfig.tests.json
✓ No type errors in 1,962 files across 2 projects [6.18s]
```

## 5. Regressions, gaps, and deviations

- No edit-tool regression was observed. All 15 independent golden cases, 50,012 randomized/fixed differential cases, 172,116 exhaustive differential cases, the 9 new direct tests, the 21 existing edit tests, and the 3 end-to-end edit cases pass.
- The full core suite has 157 failures, all in `test/shell-scan/*`. They are environment-specific bash failures, verified against clean HEAD (same failures with the change stashed). They are not caused by the edit change, but they mean the full suite does not pass as a whole.
- The root check fails in `@opencode/app#typecheck` on a pre-existing untraversable symlink (`packages/app/src/custom-elements.d.ts`). `packages/app` is untouched and the failure reproduces standalone, so it is unrelated to the edit change, but the root check does not pass.
- The external temporary directory `C:\Users\barne\AppData\Local\Temp\opencode` was readable by the shell but the `write` tool denied `external_directory`. Temporary scripts were therefore placed under the permitted `.opencode/reports/testing/` path and removed after use. No production code or existing test was modified.
- The benchmark's `external` column is noisy at the immediate post-call sample, as demonstrated in section 3.3. The report correctly treats the analytical full-table column as the reliable allocation figure.

## 6. Reproducible failures

### 6.1 Shell-scan failures (pre-existing environment)

Expected: `bash` executes the extracted command and prints `scan_probe`/`executed` on stderr; the test asserts exit code 0 and the expected stderr.

Actual: `/bin/bash: line 1: scan_probe: command not found` (and related syntax errors), exit code 2, assertion failures at `test/shell-scan/bash-safety.test.ts:247`, `bash-syntax.test.ts:106`, `compound-parity.test.ts:125`, and `parity-regressions.test.ts:99`.

Minimal reproduction: `bun test` from `packages/core`, or `bun run script/test.ts test/shell-scan/bash-safety.test.ts`. Preconditions: Windows, Bun 1.4.4, the local `bash` on this machine. This is unrelated to the edit-tool change; the stash check in section 4.1 is the confirmation.

### 6.2 Root-check app typecheck (pre-existing environment)

Expected: `bun run check` completes with exit code 0.

Actual: exit code 1; `@opencode/app#typecheck` reports `error TS5083: Cannot read file 'Y:/CodingProjects/opencode_fife/packages/app/src/custom-elements.d.ts'`. The file is a symbolic link to `../../ui/src/custom-elements.d.ts` on an untrusted mount point; reading it fails with "The path cannot be traversed because it contains an untrusted mount point." `packages/app` has no diff from HEAD, and `bun run typecheck` from `packages/app` reproduces the failure standalone. This predates and is unrelated to the edit change.

No edit-tool failure was reproduced.

## 7. Residual mixed-ending case

The residual case is recorded in the approved spec (section 5, "Residual risk") and in the implementation report ("Benchmark 'mostly unchanged' position"). It is not silently regressed:

- `mixed 10000` (all lines changed, alternating endings): 293–295 ms in the earlier run set and 326–331 ms in the latest set; the full 381.55 MiB table remains. This is the documented residual case.
- `mixed heavily changed 5000`: 65–73 ms versus the recorded baseline 70.11 ms. No improvement is claimed, and none is observed beyond noise.
- `mixed mostly unchanged 5000`: 40–47 ms versus the recorded baseline 111.32 ms. The prefix trim reduces the table from 95.41 MiB to 23.86 MiB, which is the intended partial improvement.
- The implementation report explicitly labels the heavily changed row as not required to improve. No false improvement claim was found.

## 8. Test assets changed

- Added and removed: `.opencode/reports/testing/_tmp-edit-endings-independent.ts`, `_tmp-edit-endings-differential.ts`, `_tmp-edit-endings-exhaustive.ts`, `_tmp-baseline-benchmark.ts`, `_tmp-memory-arraybuffers.ts`, `_tmp-memory-arraybuffers-2.ts`.
- Added and removed: `packages/core/test/_tmp-tester-edit-e2e.test.ts`.
- No production code, existing test, `file-diff.ts`, `endingsOnly` branch, or `missHint` was modified.

## 9. Remaining gaps

- The root check fails on a pre-existing untraversable symlink in `packages/app`; it was not made to pass. This is an environment limitation, not an edit-tool defect.
- The full suite's 157 shell-scan failures are confirmed pre-existing (clean-HEAD stash run) and remain an environment limitation, not an edit-tool defect.
- No edit-specific gap remains.
