# Plan Review Report — One owner for verification evidence

## Verdict

**READY.** The design is sound, the two High defects found in the second round are fixed, and every approved requirement has a task and a measurable check. The store surface grows from eight methods to seven, not six, because the observation order must be claimed before the policy runs. That follows from the ordering decision already made, so it is recorded as decided rather than as an open question.

## Review scope and evidence

**Review depth:** Standard. The change touches one subsystem, adds a nullable-defaulted column with a backfill, and removes three store methods. It is not a production data migration of unbounded blast radius, but the ordering fix changes how concurrent settlements are serialized, which is where the depth was spent.

**Evidence baseline:** branch `dev` at `f102f3a59e`.

Inspected:

- `packages/core/src/effort/{evidence,store,verify,transition,status,delegation}.ts`
- `packages/core/src/effort/policy/{index,types,levels,policy}.ts`
- `packages/core/src/session/runner/{step,llm}.ts`
- `packages/core/src/session/sql.ts`, `packages/core/src/event/sql.ts`
- `packages/core/src/bus.ts` (sequence helpers)
- `packages/core/src/database/migration.ts`, `packages/core/script/migration.ts`
- `packages/core/src/database/migration/20261029205453_add_session_effort_adaptive.ts`
- `packages/core/test/effort/*` (14 files)
- `docs/spec/effort-policy.md`, `docs/intent/effort-policy.md`

Not inspected: the vendored policy rule bundle beyond `applyEvidence`'s signature, and any downstream consumer of `EffortStore.Interface` outside `packages/core`. Neither affects this change.

## Findings

| ID | Severity | Evidence status | Finding | Evidence/reference | Resolution | State |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | High | Verified | The draft miscounted the store surface. It stated eight methods shrinking to six; the current interface has eight (`get`, `set`, `recordSelection`, `setOpenFailure`, `setLevel`, `setVerdict`, `bumpRevision`, `bumpWorkspaceRevision`), and the corrected design needs seven, not six. | `effort/store.ts:36-51`; verified by reading the interface block and the service implementation at `store.ts:72-160` | Final plan states the current eight and the target seven, and names each method. Task 3 acceptance lists all seven. | Resolved |
| F2 | High | Verified | A single composite evidence write cannot allocate the observation order and use it. `applyEvidence` takes `sequence` as an input (`evidence.ts:62-70`), so the number must exist before the policy runs. The draft's "one composite write replaces two setters" was therefore not implementable as written. | `effort/evidence.ts:62-70`; `effort/policy/index.ts` signature | Final plan splits the persistence into `claimSequence` (conditional increment plus read) and `recordEvidence` (state write), both inside one transaction. Task 3 acceptance changed from "one store write" to "one transaction containing one claim and one state write". The seven-method surface follows from the approved ordering rule. | Resolved |
| F3 | High | Verified | The current code fabricates its observation order from the session's event-bus counter: it reads `Bus.latestSequence` and then calls `Bus.reserveSequence`, which writes to `event_sequence`. Every evidence observation therefore advances the session's event sequence, leaving gaps in the event log and making effort ordering depend on event-bus state. The draft mentioned the fabrication but never said the two bus calls must be deleted. | `effort/evidence.ts:48-49`; `bus.ts:22-47`; `event/sql.ts:4-8` | Final plan Task 2 adds `evidence_sequence`; Task 3 states that both `Bus.latestSequence` and `Bus.reserveSequence` are deleted from the evidence path, and the acceptance criteria include "no evidence observation writes to `event_sequence`". | Resolved |
| F4 | Medium | Verified | The migration generator emits only `up(tx)` and derives its content from the schema diff. It will not emit the backfill, and there is no `down` to restore. The draft said "generate the migration and backfill" without saying the backfill is a deliberate hand edit to a generated file, which invites a later `--check` run to be "fixed" by regenerating and silently dropping the backfill. | `script/migration.ts:29-40`; `migration/20261029205453_add_session_effort_adaptive.ts:4-12` | Final plan states that the generator produces only the schema diff, that the backfill is appended by hand, and that the index and schema snapshot are regenerated afterwards. | Resolved |
| F5 | Medium | Verified | The draft specified no backfill SQL and no test proving an existing escalated session can recover. Without a backfill, every existing row starts at the column default, and an open failure recorded under the old fabricated counter may never be cleared by a later pass. | `session/sql.ts:131-152`; `effort/policy` clearing rule | Final plan gives the exact statement: `max(0, coalesce((SELECT seq FROM event_sequence WHERE aggregate_id = session_effort.session_id), -1))`, and adds the acceptance case "a session seeded with an open failure at the old sequence clears it after one qualifying pass". | Resolved |
| F6 | Medium | Verified | The draft listed `test/effort/verify.test.ts` as a touched file but did not enumerate the fixture breakage, so deleting the methods would have left the suite uncompilable. The counts were wrong in the first revision of this report and are corrected here: `bumpRevision` has eight test call sites, `setLevel` has five, and `setOpenFailure` has one. | `bumpRevision`: `verify.test.ts` 111, 128, 150, 188, 233, 271 and `store.test.ts` 93, 107. `setLevel`: `verify.test.ts:149`, `store.test.ts` 64, 109, `evidence.test.ts` 191, 208. `setOpenFailure`: `store.test.ts:108`. | Final plan Task 3 carries every fixture edit, including `verify.test.ts`, so the suite compiles at the end of each task. | Resolved |
| F7 | Medium | Verified | The draft's Task 3 acceptance said "one observation produces exactly one store write", which contradicts the two-statement design it was describing. A reviewer checking the criteria against the code would have found a false failure. | Draft Task 3, acceptance criterion 1 | Final plan restates it as one transaction with one claim and one state write, and adds a separate criterion that an error after the claim leaves no increment. | Resolved |
| F8 | Low | Verified | The draft did not note that `EffortStore.Interface` is embedded in `EffortVerification.Deps` and in `EffortEvidence.observe`'s dependency object, so removing methods ripples into `llm.ts`'s call site and the test layers. The plan's verification covers this, but the touched-files list understated it. | `effort/verify.ts:17-25`; `effort/evidence.ts:23-27`; `session/runner/llm.ts:549` | Final plan's Task 3 verification runs `bun typecheck`, and Task 4 lists `llm.ts`. No further change. | Risk accepted |
| F9 | Low | Verified | The draft chose to "add `GLOSSARY.md`" without a location, and the repository has none at any path. | Repository root listing; no `GLOSSARY.md` exists | Final plan places it at the repository root and names the five terms. | Resolved |
| F10 | Low | Verified | The draft's risk table named "nested transaction semantics in Effect SQLite" as the risk. The actual unproven assumption is narrower: whether store methods invoked inside `db.transaction` join that transaction rather than opening their own. | `database/drizzle/effect-sqlite/session.ts:240`; `effort/evidence.ts:45-75` | Final plan restates the assumption precisely and requires both a concurrency test and a rollback test to prove it. | Resolved in plan; proof deferred to implementation |

## Traceability and verification

| Requirement | Planned work | Acceptance check |
| --- | --- | --- |
| One owner classifies and persists evidence | Tasks 1 and 3 | Table test at the owner's interface; model path and harness produce identical state |
| Observation order is durable and per-session | Task 2 | Migration applies to populated tables; rows backfill to the session's latest event sequence |
| Concurrent settlements get distinct order numbers | Task 3 | Eight parallel claims return eight distinct numbers |
| A stale settlement changes nothing | Task 3 | Expected-revision mismatch leaves counter and state unchanged |
| Revision rises when a file changes, once | Task 4 | `mutating_tools` read only at dispatch; settlement bump deleted |
| Invalid configured command does not block verification | Tasks 1 and 4 | One warning per distinct command; a later valid entry still runs |
| Existing escalated sessions recover | Task 2 | Seeded open failure clears after one qualifying pass |
| A failure opened by any configured verifier is clearable | Task 4 | The harness prefers the failing verifier, not the first entry |
| Evidence no longer consumes event-log sequence numbers | Task 3 | No `Bus.latestSequence` or `Bus.reserveSequence` call remains in the evidence path |
| Documentation matches behavior | Task 5 | Spec rewritten; intent marked superseded; glossary added; schema description updated |

Every approved decision from the grilling session appears in at least one task. The "bare command, no cwd" identity is preserved by keeping `matchVerifier` as the single predicate. The "callers resolve settings" decision is preserved: the owner takes settings as an argument and imports no config.

## Second review round (independent verification)

A fresh-context reviewer with no access to this session's reasoning checked the revised plan against the repository. It confirmed the store surface, the migration mechanics, the backfill's correctness, and the transaction-joining mechanism, and it found two defects the first pass missed. Both are now fixed in the final plan.

The backfill was independently confirmed correct, not merely plausible: the old open-failure sequence was `latestSequence + 1`, `latestSequence` returns `-1` when no row exists, and `reserveSequence` keeps the larger value. So the latest `event_sequence.seq` is always at or above the recorded failure sequence, the backfilled value is at or above it, and the next claimed number is strictly greater. Revision never decreases, so the policy's revision guard also holds. A later pass clears.

| ID | Severity | Evidence status | Finding | Evidence/reference | Resolution | State |
| --- | --- | --- | --- | --- | --- | --- |
| F11 | High | Verified | Task 3 could not pass its own verification. It deletes `bumpRevision`, `setLevel` and `setOpenFailure`, but the fixtures in `verify.test.ts` (six `bumpRevision`, one `setLevel`), `store.test.ts` (two `bumpRevision`, two `setLevel`, one `setOpenFailure`) and `evidence.test.ts` (two `setLevel`, plus two cases asserting the settlement bump) were deferred to Task 4. `bun test test/effort` and `bun typecheck` would have failed at the end of Task 3. | `verify.test.ts` 111, 128, 149, 150, 188, 233, 271; `store.test.ts` 64, 93, 107, 108, 109; `evidence.test.ts` 146-162, 186-201 | Task 3 now carries every fixture edit and states the acceptance condition explicitly: no deleted method still referenced. The settlement-bump assertions are rewritten to bump through `bumpWorkspaceRevision` before the settlement. | Resolved |
| F12 | High | Verified | "The harness picks the first valid configured command" would have silently broken recovery. The policy clears a failure only when `open.verifier === observation.verifier`, but the harness currently prefers the failing verifier when configured. Under the revised wording, a failure opened by a later configured command would never clear: every idle pass would run command one and stay dirty. | `policy/policy.ts:92`; `verify.ts:57-61`; contradicts the plan's own criterion "a session with an existing open failure still clears after one pass" | The plan now specifies four-step selection: prefer the failing verifier when configured; otherwise the first simple configured entry; warn and run nothing when the failing verifier is configured but compound; warn once per distinct invalid entry when none are simple. Task 4 gains the acceptance case and the acceptance-criteria list gains "a failure opened by any configured verifier is clearable". | Resolved |
| F13 | Medium | Verified | The evidence section's counts were wrong: `bumpRevision` has eight test sites, not nine; `setLevel` has five, not one; `setOpenFailure`'s single test site was omitted entirely. | Same lines as F11 | Counts corrected and every site enumerated. | Resolved |
| F14 | Low | Verified | The backfill was shown as raw SQL to "append to the generated file". Generated migrations are TypeScript modules containing only `up(tx)`, so the statement must be wrapped in `yield* tx.run(...)`; raw SQL would not parse. | `script/migration.ts:131-146`; `migration/20261029205453_add_session_effort_adaptive.ts:6-11` | Task 2 shows the wrapped statement. | Resolved |
| F15 | Low | Verified | "Move the transaction into the owner" was stale: the transaction is already in the owner at `evidence.ts:45`. | `evidence.ts:45-75` | Task 3 now says to keep it and claim the sequence inside it. | Resolved |
| F16 | Low | Verified | The owner-interface description claimed one classification entry point and one settings helper, which conflicts with `matchVerifier` surviving as a third export used at two call sites. | `step.ts:141-144`; `verify.ts:64` | The plan names three exports and explains why `matchVerifier` stays. | Resolved |
| F17 | Low | Verified | The decisions table allowed "keep six" while Task 3's acceptance asserted seven as final, an internal contradiction. | Plan "Decisions" versus Task 3 acceptance | Seven is now the plan of record with a named compare-and-swap alternative that changes only Task 3, so the criteria no longer contradict the decision. | Resolved |
| F18 | Low | Verified | "Proven by the eight-claim test" overstated what a single-connection test proves. | `sqlite.bun.ts:12` | The plan runs the test on the existing temp-file layer and states its scope: atomicity on the store's single connection. Cross-process concurrency is out of scope because the fork runs one process. | Resolved |

Reviewer gaps that the plan now closes:

- `Info` and `fromRow` ripple. Adding `evidence_sequence` to `Info` would break `transition.ts`, `delegation.ts` and every `set({ ... })` literal. The plan now states the column is internal, `claimSequence` returns the number, and `Info` is unchanged.
- `packages/schema/src/config/effort.ts:37` still describes `mutating_tools` as advancing the revision on successful settlement. Task 5 now updates that description.
- The other `Bus.latestSequence` and `Bus.reserveSequence` callers were unnamed. They are now listed as out of scope and explicitly correct for event sequencing.
- Task 2's recovery test needed a seeding rule, or the backfill would be 0 and the pass correctly judged stale. The plan now states the seed must be at or above the failure sequence.
- `store.test.ts:44` carried a cwd-qualified verifier fixture from before the identity decision. Task 3 replaces it.

## Open decisions and residual risks

| Item | Decision-maker | Impact | Required next action |
| --- | --- | --- | --- |
| Seven store methods with `claimSequence` | Decided | The ordering rule you approved requires the number to exist before the policy runs, so it cannot be allocated by the same write that uses it | None. The compare-and-swap variant is documented in the plan if you prefer six methods |
| Whether store calls join an open `db.transaction` | Implementation evidence | If they do not, the claim and the state write commit separately and a crash between them consumes a number without recording evidence | Mechanism confirmed in source; proved by the Task 3 concurrency and rollback tests |
| Harness evidence written just before a concurrent mutation bumps the revision | Accepted | The evidence stands, the verdict is skipped, and the session stays dirty for the next idle pass. Costs at most one extra verifier run | None; already the intended behavior |
| A verifier that opened a failure is later removed from the configuration | Accepted | The failure cannot be cleared, so the session stays dirty and the harness keeps re-running on idle passes | Recovery is restoring the command or opening a new failure with a configured one. Named in the plan's risk table |

## Review limitations

The review is source-based. No test was run and no migration was applied, because plan hardening is read-only. The transaction-joining mechanism and the concurrency behaviour are confirmed by reading the Effect SQL client and the Drizzle wrapper, not by execution; they remain labelled as assumptions proven by tests the plan specifies.

The second round was genuinely independent: a separate session that received only the plan, the repository, and a brief on the problem. Two revision cycles were used and no substantive issue remains open. The remaining limitation is that no implementation has been attempted, so the plan's feasibility is argued from source and not demonstrated.
