# Static Analysis Report

**Date:** 2026-10-28 · **Command:** `bun run check` from repo root (canonical per AGENTS.md)
**Overall result: PASS (exit 0)** — 0 errors. 1,579 lint warnings, 0 type errors.
**Complete raw output (24,180 lines, 1.4 MB):** `.audit/static-analysis-raw.txt`

## What `bun run check` runs

1. `bun run lint` = `oxlint` + `ast-grep scan -c script/ast-grep/gui-plugins/sgconfig.yml` + `bun script/sdk-docs.ts`
2. `bun run typecheck` = `bun turbo typecheck --concurrency=3` (per-package `bun check`, i.e. Bun's typechecker; local `typecheck:tsc` variant uses `@typescript/native` tsc)

## Summary

| Stage | Result | Detail |
|-------|--------|--------|
| oxlint | PASS | No findings emitted (the 1,579-warning total is fully accounted for by ast-grep rules; oxlint printed nothing) |
| ast-grep (anti-slop rules) | PASS with 1,579 warnings, 0 errors | 5,514 files scanned in 4.0s; 306 distinct files carry at least one warning |
| sdk-docs check | PASS | 250 declarations, 917 members, 278 parameters documented in 21 files; 11 guide blocks match source; 0 problems |
| turbo typecheck (35 packages) | PASS — 35/35 tasks successful | **All 35 tasks were turbo cache hits** ("FULL TURBO", 167 ms); no fresh compile this run. Turbo's `transit` task folds every workspace dependency into the cache hash, and the cached logs reference input-identical sources (paths from a sibling worktree, `C:\Users\barne\.local\share\opencode\worktree\9e87c6\triage-audit-fixes`), so results are content-valid for this tree, but the typecheck was replayed, not executed. Note also per AGENTS.md: `bun check` targets TS 7.1 and writes no declarations; declaration-emit errors surface only via `typecheck:tsc` (not part of `check`). |

## Lint warnings by rule (ast-grep "anti-slop" custom rules, all warnings, 0 errors)

| Rule | Count | Meaning |
|------|-------|---------|
| require-readable-spacing | 563 | Style: expected blank line before statement |
| require-safety-comment-for-type-assertion | 409 | Type assertion without adjacent `SAFETY:` justification |
| no-runtime-typeof | 171 | `typeof` narrowing instead of boundary parsing |
| no-known-value-widening | 92 | Explicit anonymous type annotation discards known inference |
| no-unknown-parameters | 75 | Callback parameter typed `unknown` instead of a domain type |
| no-unsafe-dictionary-type | 67 | Untyped/unsafe dictionary typing |
| no-conditional-empty-object-spread | 42 | `...(cond ? { x } : {})` hides property omission |
| no-shape-in-symbol-names | 42 | Symbol/identifier encodes a shape name |
| no-chained-type-assertions | 35 | `x as A as B` chains |
| no-unknown-returns | 26 | `unknown`-returning boundary without parse |
| no-array-filter-map | 23 | `.filter().map()` instead of `flatMap` |
| prefer-effect-match | 14 | Manual Option/Result branching instead of `Effect` match helpers |
| no-manual-tagged-construction | 9 | Manual tagged-union construction |
| no-manual-tag-comparison | 4 | Manual discriminant comparison |
| no-object-parameters | 3 | Object-typed parameter instead of named fields |
| no-reduce-accumulator-copy | 2 | Reduce with accumulator copying |
| no-unknown-type-aliases | 1 | `unknown` type alias |
| no-reflect-get | 1 | `Reflect.get` usage |

Interpretation for auditors: the two biggest buckets (spacing 563, safety-comments 409) are mechanical/style; the remaining ~600 are the repo's own structural-intent rules (boundary parsing, inference preservation, Effect idioms). These warnings are **non-blocking** by design — `check` exits 0 — so they indicate drift hotspots rather than failures.

## Files with the most lint warnings (top 35 of 306)

| File | Warnings |
|------|----------|
| packages/app/src/new-session/pin-board.tsx | 133 |
| packages/app/src/new-session/wordmark.tsx | 103 |
| packages/app/src/new-session/brick-breaker.tsx | 69 |
| packages/app/src/runtime/persistence/drafts.ts | 50 |
| packages/desktop/script/profile-by-source.ts | 39 |
| packages/app/src/new-session/pin-quads.ts | 36 |
| packages/app/src/usage/dialog.tsx | 34 |
| packages/app/e2e/utils/app.ts | 25 |
| packages/app/src/runtime/server/errors.ts | 23 |
| packages/app/src/runtime/server/health.test.ts | 22 |
| packages/desktop/script/bench-startup.ts | 21 |
| packages/ui/src/data-display/project-avatar/procedural-world.ts | 21 |
| packages/app/src/new-session/pin-sound.ts | 21 |
| packages/app/src/usage/limits.ts | 20 |
| packages/ui/src/theme/resolve.ts | 17 |
| packages/ui/src/components/scroll-view.tsx | 15 |
| packages/ui/src/theme/context.tsx | 15 |
| packages/session-ui/src/message/current-tool-state.ts | 15 |
| packages/ui/src/components/spinner-radar.ts | 13 |
| packages/session-ui/src/pierre/file-find.ts | 13 |
| packages/ui/src/components/spinner-radar.test.ts | 13 |
| packages/app/e2e/regression/settings.spec.ts | 13 |
| packages/app/e2e/performance/timeline/session-timeline-benchmark.fixture.ts | 13 |
| packages/session-ui/src/pierre/media.ts | 13 |
| packages/gui-plugins/src/terminal/serialize.ts | 12 |
| packages/app/e2e/utils/sse-transport.ts | 12 |
| packages/app/e2e/performance/unit/mock-server.test.ts | 12 |
| packages/app/e2e/utils/session-fixture.ts | 12 |
| packages/session-ui/src/timeline/research-and-agents.stories.tsx | 11 |
| packages/ui/src/components/text-reveal.tsx | 11 |
| packages/ui/src/data-display/project-avatar/procedural-craft.ts | 11 |
| packages/app/src/voice/tools.test.ts | 11 |
| packages/gui-plugins/src/terminal/runtime-adapters.ts | 10 |
| packages/session-ui/src/components/apply-patch-file.ts | 10 |
| packages/app/src/runtime/i18n/desktop-native.ts | 10 |

Cluster pattern: the top three files are all in `packages/app/src/new-session/` (a decorative "critter"/pin-board feature) and together hold 341 warnings — the densest single warning cluster in the repo.

## Typecheck detail (turbo, cached)

Per-package result lines replayed from cache (all "No type errors"):

- `www` (astro check): 34 files, 0 errors/0 warnings/0 hints
- `stats-core` 27 files · `update` 1 · `util` 66 · `plugin-figma` 167 · `changelog` 6 · `httpapi-codegen` 12 · `theme` 14 · `files` 1 · `schema` 128 · `http-recorder` 14+19 (incl. test tsconfig) · `posts` (astro, 8 files, 0/0/0) · `codemode` 85 · `stats-server` 16 · `ui` 208 · `protocol` 146 · `ai` 322+304 (incl. types tsconfig) · `console-app` 104 · `stats-app` 83 · `client` 173 · `plugin` 311 · `session-ui` 277 · `merman` 151 · `latex` 76 · `plugin-browser` 204 (test tsconfig) · `core` 1,782 files across 2 projects (incl. tsconfig.tests.json) · `gui-plugins` 1,176 · `simulation` 1,214 across 2 projects · `app` 1,862 · `server` 1,370 across 2 projects · `tui` 1,790 across 2 projects · `desktop` 2,915 across 2 projects · `sdk` 1,383 across 2 projects · `cli` 1,948 across 2 projects · `patchmark` (`tsc --noEmit`; result line inside truncated raw output — task counted successful in the 35/35 total)

Tasks: 35 successful, 35 total. Cached: 35. (Per-file repetition of lint findings is truncated in this report; full per-finding output is in `static-analysis-raw.txt`.)

## Other checks observed in the output

- One unused `ast-grep-ignore` directive flagged (advisory `help[unused-suppression]`): `packages/util/src/cross-spawn-spawner.ts:15` (`// ast-grep-ignore: no-star-import` no longer needed).
- Repo also defines `lint:effect-patterns` and `lint:effect-simplifications` ast-grep rule sets (not part of `check`; run separately).

## Method notes / honesty caveats

- oxlint and ast-grep executed fresh on this machine; the typecheck stage was a full turbo cache replay (see Summary row for implications).
- The captured raw output is the complete stdout/stderr of `bun run check` (24,180 lines), copied verbatim to `static-analysis-raw.txt`; nothing was deleted.
- Test execution was out of scope for this scout phase (tests are never run from repo root per AGENTS.md; each package runs `bun test` from its own directory).
