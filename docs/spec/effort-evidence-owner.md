# Spec: Verification Evidence Ownership

Status: Merged — behavior text now lives in `docs/spec/effort-policy.md`
Amends: `docs/spec/effort-policy.md` (sections "Escalation loop" and "Harness verification")
Plan: `docs/plans/effort-evidence-owner/implementation-plan.final.md`
Protocol version: unchanged (2)

The behavior text below has been merged into the two amended sections of the
domain spec, which is now the single record of current behavior. This file stays
as the change record: why the rules moved, and which reversals were deliberate.
Read the domain spec for what the system does today.

## Objective

Make one module the sole authority on what counts as a verifier run.

Today three places decide it: the pre-execution path in `session/runner/step.ts`,
the settlement path in `effort/evidence.ts`, and the idle harness in
`effort/verify.ts`. They disagree about verifier identity, about when the
workspace revision moves, and about what order observations happened in.

The user-visible consequences of that disagreement:

- Evidence ordering is borrowed from the session's event log, so every verifier
  observation consumes an event sequence number and leaves a gap in the event
  history.
- The workspace revision advances when a mutation *settles*, which is late
  enough that a pass arriving during the mutation can be accepted, and late
  enough that a mutation through the shell never advances it at all.
- A verifier run is classified by three implementations that can drift apart.

Success: from identical facts, the model path and the idle harness produce
identical effort state, and no other module decides what a verifier run is.

## Definitions

- **Verifier.** A configured command (`effort_policy.verification_commands`)
  whose process exit describes the verification result for the session.
- **Settlement.** One finished tool call, with its tool name, input, and
  outcome metadata.
- **Observation order.** A durable per-session counter that orders
  settlements. It is independent of the event log and never consumes an event
  sequence number.
- **Revision.** A durable per-session counter that advances when the workspace
  may have changed. A pass at an older revision cannot clear a newer failure.
- **Escalation.** The state that raises a session's effort level because a
  verifier is failing.

## Behavior

### Verifier identity

Identity is the bare command string, matched exactly, with the working
directory ignored.

- `pnpm typecheck` matches a configured `pnpm typecheck`.
- `pnpm typecheck --pretty=false` does not match. Neither does
  `build && pnpm typecheck`, a piped command, a redirected command, a command
  containing shell quoting or substitution, or a command containing a newline.
- Leading and trailing whitespace is trimmed on both sides before comparison.
- Empty configured entries are ignored.

A command that is not simple cannot have its own exit attributed, because a
shell reports one status for the whole expression. Such a command is never a
verifier, whether it appears in a tool call or in configuration.

### Classification

Given one settlement and the resolved settings, the owner answers one of three
things.

| Settlement | Result | Effect |
| --- | --- | --- |
| Command matches a configured verifier, exit `0` | pass | May clear a failure |
| Command matches a configured verifier, exit non-zero | failure | Opens or confirms a failure |
| Command matches, but the exit is missing, timed out, or signalled | infrastructure | No state change |
| Command does not match any configured verifier | not a verifier | No state change |
| Tool is not a shell and not the harness | not a verifier | No state change |

Infrastructure outcomes never open, clear, or reset anything. The same rule
applies whether the settlement came from the model or from the harness.

### Observation order

Ordering is durable and per session.

- Each qualifying settlement claims exactly one number, inside the same
  transaction that records its effect.
- Two settlements that occur at the same moment receive different numbers.
- A settlement discarded for being stale does not consume a number.
- An error after the claim leaves no increment, because the transaction rolls
  back.
- No part of the evidence path reads or writes the session's event sequence.

### Revision

The revision advances when a file-changing tool **starts**, not when it
settles, and it advances for every session in the same directory.

- A tool named in `effort_policy.mutating_tools` (default `write`, `edit`,
  `patch`) advances the revision when it dispatches.
- A shell command that is not a verifier advances the revision when it
  dispatches, because it may change files.
- A shell command that is a verifier does not advance the revision. Running a
  verifier is not a mutation.
- `mutating_tools` is consulted only at dispatch. Settlement no longer reads
  it.
- This removes the known v1 limitation that shell-mediated file mutations did
  not advance the revision.

### Clearing

A pass clears an open failure only when all three hold:

1. The verifier is the same one that opened the failure.
2. The pass's observation order is strictly newer than the failure's.
3. The pass's revision is not older than the failure's revision.

Otherwise the pass changes nothing. A pass with no open failure counts as a
clean pass for adaptive mode.

### Harness command selection

The idle harness runs one command per idle boundary, chosen in this order:

1. The verifier named by the open failure, when it is still configured.
2. Otherwise the first configured entry that is a simple command.
3. If the failing verifier is still configured but is not a simple command,
   warn once and run nothing. No other command can clear that failure, so
   running one would spend a verifier run per idle pass and never recover.
4. If the failing verifier is no longer configured at all, run nothing, for the
   same reason.
5. If no configured entry is a simple command, warn once per distinct invalid
   entry and run nothing.

### Overlap

A harness verdict is discarded when the session revision changed while the
verifier ran. The session stays dirty, and the next idle pass tries again. Any
evidence the run already recorded stands; only the verdict is skipped.

### Invalid configuration

An unusable configured command produces one warning per distinct command, not
one per resolution. It does not prevent a later valid entry from running, and
it does not block the session from functioning without effort escalation.

## Behavior changes from shipped v1

These are deliberate reversals. Each is visible to a user.

| Shipped behavior | Target behavior | Why |
| --- | --- | --- |
| Matching tolerates compound commands, appended flags and redirection | Exact bare-command match only | A shell reports one exit for a compound expression; attributing it to a verifier was never sound, and the shipped tolerance did not match the shipped code either |
| Verifier identity included the working directory | Identity ignores the working directory | Sessions in the same directory share a verifier; including cwd silently disabled escalation after a directory change |
| The revision advanced on successful settlement of a mutating tool | The revision advances at dispatch, and shell mutations advance it too | Settlement is too late to reject a pass that ran during the mutation, and the shell path never bumped at all |
| Evidence ordering used the session's event sequence | Evidence ordering uses its own durable counter | Observations were consuming event sequence numbers and leaving gaps in the event log |
| Harness selection was "failing verifier, else the first configured command" | Same preference, but invalid entries are skipped with one warning, and an unmatchable failing verifier stops the harness instead of running a command that cannot clear it | Avoids repeated pointless runs |

## Commands

```bash
# Full check from the repository root
bun run check

# Package-scoped iteration
cd packages/core && bun test test/effort
cd packages/core && bun typecheck

# Migration generation and drift check
cd packages/core && bun run migration --name add_session_effort_sequence
cd packages/core && bun run migration --check
```

## Project structure

```
packages/core/src/effort/evidence.ts   → classification and the single owner
packages/core/src/effort/store.ts      → durable state access
packages/core/src/effort/verify.ts     → idle harness: scheduling only
packages/core/src/effort/policy/       → vendored rules; not modified
packages/core/src/session/runner/       → dispatch path; scheduling only
packages/core/src/session/sql.ts       → session_effort columns
docs/spec/effort-policy.md             → domain spec, amended on landing
docs/intent/effort-policy.md           → design history, marked superseded
GLOSSARY.md                            → shared terms
```

## Code style

Follow `AGENTS.md`. The rules that matter here:

- The owner takes resolved settings as an argument and imports no configuration.
- Validate at the boundary once; pass typed values inward.
- Prefer early returns over nested conditionals in the classifier.
- No `any`, no aliased imports, no star imports.
- Comments explain non-obvious constraints only, such as why a compound command
  cannot be a verifier.

## Testing strategy

- **Classification.** One table test at the owner's interface covering pass,
  fail, infrastructure, not-a-verifier, compound command, quoted command, and
  invalid configuration. No database and no process.
- **Ordering and concurrency.** One case that claims eight numbers in parallel
  and asserts they are distinct, plus one that proves a rolled-back
  transaction leaves the counter unchanged. Run against a temp-file database.
- **Revision.** One case that proves a pass at an older revision cannot clear a
  newer failure, and one that proves a shell mutation advances the revision.
- **Harness selection.** A fake process runner. Cases: failure opened by the
  second configured command is cleared on the next pass; invalid first entry is
  skipped and a later valid entry runs; unmatchable failing verifier warns once
  and runs nothing; revision change during a run discards the verdict.
- **Migration.** A case that seeds a populated `session_effort` row with an open
  failure and proves one qualifying pass clears it after the backfill.
- Tests run from the package directory, never the repository root.

## Boundaries

**Always**

- Preserve the vendored policy rules and `EFFORT_POLICY_PROTOCOL_VERSION`.
- Keep the model path and the harness producing identical state from identical
  facts.
- Warn once per distinct invalid command, never repeatedly.
- Run the affected package's tests before claiming a change works.

**Ask first**

- Any change to the vendored rules or the protocol version.
- Any change to the verifier identity rule after this spec is approved.
- Any change that would make the evidence path touch the event log again.

**Never**

- Let a module other than the owner classify a verifier run.
- Consume event sequence numbers for evidence.
- Advance the revision at settlement.
- Delete a failing test without approval.
- Commit secrets or credentials.

## Success criteria

1. From identical facts, the model path and the harness produce identical effort
   state; the harness additionally records a verdict.
2. A pass clears a failure only when it is from the same verifier, strictly
   newer in observation order, and not older in revision.
3. A failure opened by any configured verifier, not only the first, is clearable
   by the harness.
4. Two settlements at the same moment receive different observation orders.
5. A session with an existing open failure still clears after one pass following
   the migration.
6. No evidence observation reads or writes the session's event sequence.
7. A shell command that is not a verifier advances the revision at dispatch; a
   verifier does not.
8. An invalid configured command warns once and does not prevent a later valid
   entry from running.
9. The spec, the intent, the glossary, and the schema field description all
   describe the behavior above.
10. `bun run check` passes and so do the core effort tests.

## Open questions

None. The identity reversal in "Behavior changes" was decided during design and
is recorded there rather than left open. If you want decorated invocations
matched again, that is a change to this spec before implementation, not a
detail inside it.
