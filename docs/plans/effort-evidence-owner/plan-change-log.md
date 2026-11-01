# Plan Change Log — One owner for verification evidence

Based on `docs/plans/effort-evidence-owner-plan.md`. The original draft is unchanged.

| Change ID | Original section | Change in final plan | Reason / finding ID | Requirement impact | Approval needed? |
| --- | --- | --- | --- | --- | --- |
| C1 | Decisions table, "Store interface" row | "One composite evidence write replaces two setters; session-scoped bump deleted" becomes two methods: `claimSequence` plus `recordEvidence`, with the transaction moved into the owner | F2: the order number must exist before `applyEvidence` runs, so one write cannot both allocate and use it | Changes the store surface from six methods to seven. No change to observable behavior | Yes — the open decision |
| C2 | Task 3, acceptance criterion 1 | "One observation produces exactly one store write" becomes "one transaction containing one claim and one state write" | F7: the original criterion contradicted its own design | None; the criterion now matches the design | No |
| C3 | Task 2, description | Adds that the generator emits only the schema diff, that the backfill is appended by hand, and that the index and snapshot are regenerated afterwards | F4: a regenerated migration would silently drop the backfill | None; prevents a data-recovery regression | No |
| C4 | Task 2, acceptance criteria | Adds the exact backfill statement and a case proving a seeded open failure clears after one pass | F5: no backfill SQL and no recovery test existed | Strengthens the acceptance bar | No |
| C5 | Task 3, description and criteria | Explicitly deletes the two `Bus.latestSequence` / `Bus.reserveSequence` calls and adds a rollback criterion | F3: leaving them would keep consuming event-bus sequence numbers for effort evidence | Removes an existing defect the draft only mentioned in passing | No |
| C6 | Task 4, description | Enumerates the fixture substitutions: nine `bumpRevision` call sites become `bumpWorkspaceRevision`, and `setLevel` becomes `set` | F6: deleting the methods without the fixtures leaves the suite uncompilable | None; makes the deletion safe | No |
| C7 | Decisions table, "Tests" row | "Delete path-specific suites" becomes "remove superseded cases inside `evidence.test.ts` and `verify.test.ts`; do not delete those files" | Verified: both files test behavior the plan still needs, so wholesale deletion would remove valid coverage | Narrows the deletion to the intended scope | No |
| C8 | Task 5, description | Names the glossary location (repository root) and the five terms | F9: the draft gave no location and the repo has none | None | No |
| C9 | Risks table, row 2 | "Nested transaction semantics in Effect SQLite" becomes the specific assumption that store calls inside `db.transaction` join it, proven by concurrency and rollback tests | F10: the original risk was stated too vaguely to test | Adds a concrete test requirement | No |
| C10 | Whole document | Adds "Evidence and assumptions" and "Release and recovery" sections | Skill deliverable: the plan must stand alone with its baseline and its recovery path | None; additive | No |
| C11 | Whole document | Adds a header with status, review depth, baseline revision, and required approvals | Skill deliverable | None; additive | No |
| C12 | Task 4, harness selection | "Picks the first valid configured command" becomes four ordered rules that prefer the failing verifier, then the first simple configured entry, then warn-and-stop | F12: the policy only clears a failure for the same verifier, so the original wording could never recover from a failure opened by a later configured command | Restores a behavior the draft would have removed. Adds two acceptance cases | No |
| C13 | Task 3, test work | All fixture edits for the deleted methods and the settlement bump move into Task 3, including `verify.test.ts` | F11: Task 3's own verification would have failed with the fixtures deferred to Task 4 | None; makes each task independently green | No |
| C14 | Evidence and assumptions | Corrected counts: `bumpRevision` eight test sites, `setLevel` five, `setOpenFailure` one; every site enumerated | F13 | None; factual accuracy | No |
| C15 | Task 2, backfill | The backfill is shown as `yield* tx.run(...)` inside `up`, not as raw SQL text | F14: generated migrations are TypeScript modules, so raw SQL would not parse | None | No |
| C16 | Task 3, work | "Move the transaction into the owner" becomes "keep the transaction in the owner and claim the sequence inside it" | F15: the transaction is already in the owner at `evidence.ts:45` | None; removes a false instruction | No |
| C17 | Technical approach, owner interface | Names three exports: classification, `matchVerifier`, `warnUnmatchable`, and explains why `matchVerifier` stays | F16: it survives at two call sites, so "one entry point" was inaccurate | None | No |
| C18 | Header, required approvals | Seven methods is the plan of record, recorded as decided; compare-and-swap is a documented alternative that would change only Task 3 | F17: the header offered six or seven while Task 3 acceptance asserted seven, so the document contradicted itself | Removes the contradiction. The alternative remains available | No |
| C19 | Technical approach and Task 3 | States that the eight-claim test proves atomicity on the store's single connection, and that cross-process concurrency is out of scope | F18: a single-connection test cannot prove cross-connection behaviour | Narrows a claim to what is actually proven | No |
| C20 | Technical approach, ordering | States that `evidence_sequence` is internal, `claimSequence` returns the number, and `Info` is unchanged | Reviewer gap: adding the column to `Info` would break `transition.ts`, `delegation.ts` and every `set({ ... })` literal | Avoids ripple into three modules and the test fixtures | No |
| C21 | Task 5 | Adds `packages/schema/src/config/effort.ts:37` to the touched files | Reviewer gap: the schema description still says the revision advances on successful settlement | Keeps the published description truthful | No |
| C22 | Task 2, acceptance | States that the recovery fixture must seed `event_sequence` at or above the failure sequence | Reviewer gap: otherwise the backfill is 0 and the pass is correctly judged stale, so the test would fail for the wrong reason | None; makes the test meaningful | No |
| C23 | Task 3, test work | Replaces the cwd-qualified verifier fixture in `store.test.ts:44` with a bare command | Reviewer gap: it predates the identity decision | Aligns fixtures with settled behavior | No |
| C24 | Out of scope | Names the other `Bus.latestSequence` and `Bus.reserveSequence` callers and states they stay untouched | Reviewer gap: the plan removed two calls without saying the rest are correct | Prevents scope creep | No |

## Preserved decisions and scope

These were settled during the grilling session and are carried forward unchanged:

- Verifier identity is a bare command with an exact match and no cwd.
- Observation order is a durable per-session column, claimed inside the transaction.
- The revision rises when a file-changing tool starts, for every session in the same directory.
- The settlement-time bump and `startedMutation` are deleted.
- An invalid configured command warns once and the harness uses the first valid entry.
- The owner classifies and persists; callers keep scheduling.
- Settings are resolved by the callers and passed in.
- The module keeps the name `effort/evidence.ts` and the export `EffortEvidence`.
- Tests are a table test at the interface, one concurrency case, and a fake process runner.
- Landing is one change, tests first.
- Existing sessions are backfilled from their latest event sequence.
- A harness run that overlaps a change discards its verdict, stays dirty, and retries.
- No protocol version bump.
- Out of scope: the status/transition duplication and the `packages/ai` findings.

## Changes not made

- **Compare-and-swap instead of a claimed sequence.** Proposed as the alternative that keeps six store methods. Not adopted as the plan of record because it moves the retry into the store and still needs a conditional update plus a re-read, so the saving is one method at the cost of a retry loop. It is recorded under "Technical approach" as a documented alternative.
- **Keeping the harness at the first configured command.** Rejected on evidence: the policy clears a failure only when the same verifier passes (`policy/policy.ts:92`), so a failure opened by a later configured command would never clear and every idle pass would re-run command one. This was an outright defect in the first revision of the final plan, not a preference.
- **Splitting the test work away from the deletions.** Rejected because deleting a method in Task 3 and fixing its fixtures in Task 4 leaves the suite red at the end of Task 3, which breaks the plan's own verification step.
- **Splitting this into two landings (ordering first, ownership second).** Rejected because the ordering fix without the ownership fix leaves two writers on the same column, which is the defect being removed.
- **Deleting `matchVerifier` in favour of a schema-validated config field.** Rejected as scope expansion: it would change settings validation, which is out of scope for this change.
- **Renaming `effort/evidence.ts` to `effort/observation.ts`.** Rejected because the grilling session settled on keeping the current names and adding a glossary instead.
- **Adding an ADR directory.** Rejected because the repository has none and the spec plus glossary cover the decision record for this size of change.
