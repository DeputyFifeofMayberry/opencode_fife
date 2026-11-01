# Implementation Plan: One owner for verification evidence

## Overview

Effort escalation currently depends on three modules that each decide what a verifier run is: the pre-execution path in `session/runner/step.ts`, the settlement path in `effort/evidence.ts`, and the idle harness in `effort/verify.ts`. They disagree about verifier identity, mutation scope, and observation order. This change makes `EffortEvidence` the single owner: it classifies one finished tool call, stamps the verifier, order and revision, and writes the resulting effort state in one transaction. Both callers hand it raw facts and keep their own scheduling.

Scope is evidence classification only. The status/transition duplication and the `packages/ai` candidates from the architecture review are out of scope.

## Decisions

Recorded during the grilling session. These are settled.

| Decision | Choice |
| --- | --- |
| Verifier identity | Bare command, exact match, cwd ignored |
| Observation order | Durable `evidence_sequence` column, incremented per observation in the same transaction |
| Revision | Raised when a file-changing tool starts, for every session in the same directory |
| Settlement revision bump | Deleted, along with `startedMutation` |
| Invalid configured command | Warn once when settings resolve; harness picks the first valid entry |
| Owner boundary | Classifies and persists in one transaction; callers schedule |
| Existing sessions | Backfill `evidence_sequence` from the session's latest event sequence |
| Harness during a change | Discard the verdict, stay dirty, retry on the next idle pass |
| Store interface | One composite evidence write replaces two setters; session-scoped bump deleted |
| Settings | Resolved by the caller once per step and once per idle pass, then passed in |
| Naming | Keep `effort/evidence.ts` and `EffortEvidence`; add `GLOSSARY.md` |
| Tests | Table test at the interface, one concurrency case, fake process runner; delete path-specific suites |
| Landing | One change, tests first |

No protocol version bump: the vendored policy rules do not change.

## Dependency order

```
Migration (evidence_sequence)
        │
        ▼
Composite store write ──► Owner persistence ──► Callers (step, harness)
                                                        │
                                                        ▼
                                              Docs, deletions, glossary
```

## Tasks

### Task 1: Classification core, test first

**Description:** Add the settlement and verdict types plus a pure classification function in `effort/evidence.ts`. It answers not-a-verifier, pass, or fail, and returns the matched verifier. No database access in this task.

**Acceptance criteria:**
- [ ] A table test covers model path, harness, pass, fail, infrastructure, and an invalid command.
- [ ] Classification reads no config and performs no I/O.
- [ ] A command containing shell operators returns not-a-verifier.
- [ ] An exit that is missing, timed out, or signalled returns not-a-verifier.

**Verification:**
- [ ] `cd packages/core && bun test test/effort/evidence.test.ts`
- [ ] `cd packages/core && bun typecheck`

**Dependencies:** None

**Files likely touched:** `src/effort/evidence.ts`, `test/effort/evidence.test.ts`

**Estimated scope:** Small

### Task 2: Ordering column and migration

**Description:** Add `evidence_sequence` to `SessionEffortTable`, generate the migration, and backfill each row from the session's latest event sequence so an existing open failure can still be cleared.

**Acceptance criteria:**
- [ ] The migration applies to a database that already has `session_effort` rows.
- [ ] Every row is backfilled to its session's latest event sequence, or 0 when the session has no events.
- [ ] Generated schema and migration index are regenerated, not hand-edited.
- [ ] A session with an open failure clears it after one qualifying pass.

**Verification:**
- [ ] `cd packages/core && bun run migration --check`
- [ ] `cd packages/core && bun test test/effort/store.test.ts`
- [ ] `cd packages/core && bun typecheck`

**Dependencies:** Task 1

**Files likely touched:** `src/session/sql.ts`, `src/database/migration/<generated>.ts`, `src/database/migration.gen.ts`, `src/database/schema.gen.ts`, `schema.json`

**Estimated scope:** Medium

### Task 3: Owner persistence and composite store write

**Description:** Replace `setOpenFailure` and `setLevel` with one `recordEvidence` write that sets the open failure, level, clean passes and next order number together. Delete `bumpRevision`. Move the transaction into the owner: read state, increment the sequence, apply the policy, write once.

**Acceptance criteria:**
- [ ] One observation produces exactly one store write.
- [ ] Two settlements at the same moment receive different order numbers.
- [ ] A settlement whose expected revision no longer matches changes nothing.
- [ ] The store interface has six methods: `get`, `set`, `recordSelection`, `recordEvidence`, `setVerdict`, `bumpWorkspaceRevision`.

**Verification:**
- [ ] `cd packages/core && bun test test/effort`
- [ ] `cd packages/core && bun typecheck`

**Dependencies:** Task 2

**Files likely touched:** `src/effort/store.ts`, `src/effort/evidence.ts`, `test/effort/store.test.ts`, `test/effort/evidence.test.ts`

**Estimated scope:** Medium

### Task 4: Callers

**Description:** Wire both callers to the owner. `step.ts` resolves settings once, passes them in, drops `startedMutation`, and keeps the dispatch-time revision bump. `verify.ts` receives resolved settings, picks the first valid configured command, keeps the expected-revision discard, and warns once per invalid command. `llm.ts` resolves settings once per idle pass.

**Acceptance criteria:**
- [ ] The model path and the harness produce identical state from identical facts.
- [ ] An invalid first entry warns once and does not prevent a later valid entry from running.
- [ ] A revision change during a harness run discards the verdict and leaves the session dirty.
- [ ] `mutating_tools` is read only at dispatch.

**Verification:**
- [ ] `cd packages/core && bun test test/effort`
- [ ] `cd packages/core && bun test test/session-runner.test.ts`
- [ ] `cd packages/core && bun typecheck`

**Dependencies:** Task 3

**Files likely touched:** `src/session/runner/step.ts`, `src/effort/verify.ts`, `src/session/runner/llm.ts`, `test/effort/verify.test.ts`

**Estimated scope:** Medium

### Task 5: Docs, deletions, glossary

**Description:** Rewrite the spec's escalation section to the settled identity and revision rules, mark the intent's proposed identity superseded, add `GLOSSARY.md`, and delete tests that reach past the owner's interface.

**Acceptance criteria:**
- [ ] The spec matches the implemented identity, ordering and revision rules.
- [ ] The intent points at the spec instead of restating a different identity.
- [ ] `GLOSSARY.md` defines verifier, settlement, revision, observation order and escalation.
- [ ] No test reaches into the three former paths.

**Verification:**
- [ ] `bun run check`
- [ ] `git diff --stat` shows no unrelated files

**Dependencies:** Task 4

**Files likely touched:** `docs/spec/effort-policy.md`, `docs/intent/effort-policy.md`, `GLOSSARY.md`, `test/effort/evidence.test.ts`, `test/effort/verify.test.ts`

**Estimated scope:** Small

## Checkpoints

**After Tasks 1-2:** classification is pure and tested; the migration applies and backfills; `bun run migration --check` is clean.

**After Task 3:** one writer exists; the concurrency test passes; the store has six methods.

**After Task 5:** `bun run check` passes; the spec, intent and glossary agree with the code; no path-specific tests remain.

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Backfill misses a row and leaves a session permanently escalated | High | Backfill in the migration; acceptance test covers an existing open failure |
| Nested transaction semantics in Effect SQLite | Medium | The increment is a single row `UPDATE ... + 1` followed by a read in the same transaction; the concurrency test proves it |
| Removing `startedMutation` changes the observe signature used by tests | Low | Signature change lands in Task 3 with its tests |
| Harness selection changes behavior for configs whose first entry is invalid | Low | Covered by Task 4 acceptance and the load-time warning |
| Warning repeats on every settings resolution | Low | Dedupe by command string in the effort module |

## Out of scope

- The status/transition duplication from the same review.
- Protocol lowering, provider facades, media routes.
- Any change to the vendored policy rules or `EFFORT_POLICY_PROTOCOL_VERSION`.
- Committing. The change lands on the current `dev` checkout and stays uncommitted until requested.

## Open questions

None. Remaining choices are routine implementation detail.
