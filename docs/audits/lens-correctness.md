# Lens: Correctness & Logic - Findings

**Scope:** Full repo, prioritized per audit focus: session engine (inbox/delivery, execution claims, runner state machine), tool execution path, shell scanning, server handlers, codemode interpreter.
**Baseline:** `bun run check` passed (0 type errors), so all findings are logic-level. Evidence rule applied: each finding names the concrete input/condition that triggers it.
**Intent baseline:** AGENTS.md "Session Core" invariants (write-ahead execution claims; "terminal completion, failure, or user interruption releases it"; admission idempotency; steer/queue boundaries).

---

## Finding: Tool-permission decline is terminalized as a "shutdown" interrupt, leaking the durable execution claim

- **Location:** `packages/core/src/session/runner/step.ts:294-297` + `packages/core/src/session/execution.ts:47-51,125-133` + `packages/core/src/session/execution/restart.ts:92-98,221-228`
- **Evidence:** A user declining a tool permission fails the tool fiber with a typed `Permission.DeclinedError` (recovered from the defect channel in `model-request.ts:446-461`). `step.ts:294-297` then deliberately self-interrupts the step:
  ```ts
  if (tools.declines.length > 0) {
    if (input.isLocationClosed()) return Outcome.Completed({ needsContinuation: true })
    return yield* Effect.interrupt
  }
  ```

  The interruption propagates uncaught through `runStep`/`drain` to the run-coordinator execution fiber. `execution.ts:49` classifies any exit that has interrupts but no explicit `interruptionReason` as shutdown:

  ```ts
  if (Cause.hasInterrupts(exit.cause)) return { type: "interrupted" as const, reason: reason ?? "shutdown" }
  ```

  `interruptionReason` is only set by an explicit `coordinator.interrupt(key, reason)` call (the HTTP interrupt endpoint passes `"user"`; shutdown passes `"shutdown"`). A decline never goes through that path. The pinned unit test (`core/test/session-execution.test.ts:49-53`) confirms owner-scope interrupts default to `"shutdown"`, and the runner test (`core/test/session-runner.test.ts:5214-5273`) confirms the decline exit is interrupts-only.
  The misclassification matters because `settled` (`execution.ts:125-133`) treats the two reasons oppositely, exactly as its comment documents ("Deliberate stops release the claim; shutdown keeps it for restart continuity"):

  ```ts
  if (outcome.reason !== "shutdown") yield* jobs.cancel(sessionID)
  yield* bus.publish(
    SessionEvent.Execution.Interrupted,
    { sessionID, reason: outcome.reason },
    outcome.reason === "shutdown" ? undefined : releaseOnCommit(sessionID),
  )
  ```

  For a decline: (a) `store.release` never runs, so `time_suspended` stays set - the write-ahead claim leaks; (b) `jobs.cancel(sessionID)` never runs, so background jobs of the stopped turn keep running; (c) the projector skips the idle message and `message-updater.ts:150` only clears retry state; (d) clients ignore shutdown interrupts for working-state (`client/src/solid/data.ts:1127`), so the session can read as still working until the next event.
  The leaked claim is exactly the signature `resumeSuspendedSessions` sweeps at boot (`restart.ts:36-43`): the next server start finds the session in `listSuspended()` (`store.ts:207-217`), injects the synthetic message "The server restarted while you were working. Continue from where you left off without repeating completed work." (`restart.ts:92-97`), and auto-resumes the turn (`restart.ts:221-228`) - consuming one of the 10 durable resume attempts per turn.

- **Impact:** Trigger: user declines a tool permission (a routine, fully supported action), then the server restarts (a daily occurrence for the managed server). The turn the user deliberately stopped is auto-continued after restart under a fabricated "server restarted" pretext, and the declined turn's background jobs (shells, subagents) keep running instead of being cancelled - diverging from the documented AGENTS.md invariant "user interruption releases [the claim]". Repeated decline+restart cycles on one turn can exhaust the resume budget and terminalize with `RESUME_EXHAUSTED`. Fix direction: distinguish self-interrupts from shutdown - e.g. thread an explicit interrupt reason through the step (the decline site knows it is a deliberate user stop), settle the decline with reason `"user"`, or return a typed outcome from the drain for declines instead of `Effect.interrupt`.
- **Severity suggestion:** P1
- **Category:** correctness (state machine / intent match)

---

## Finding: Worktree session-adoption range bound excludes astral-plane directory characters

- **Location:** `packages/core/src/session/projector.ts:561-571`
- **Evidence:** The `Worktree.Event.Resolved` projection re-parents sessions from the previous project identity using a string-range prefix match:

  ```ts
  or(
    event.data.adopted?.length ? inArray(SessionTable.project_id, event.data.adopted) : undefined,
    and(
      gte(SessionTable.directory, event.data.directory),
      lte(SessionTable.directory, AbsolutePath.make(event.data.directory + "\uffff")),
    ),
  ),
  ```

  `directory <= prefix + "\uffff"` only covers code points at or below U+FFFF. SQLite's BINARY collation compares UTF-8 bytes, so any supplementary-plane character (emoji such as the U+1F600 code point) sorts above `\uffff`. A session directory whose path first diverges from the worktree prefix with such a character - e.g. worktree `Y:\repo` and a session adopted from project directory `Y:\repo\<emoji-dir>` - is excluded by the SQL `rows` query, so the later in-memory `FSUtil.contains` filter (line 578) never sees it and the session is not re-adopted. Same for a path containing a literal U+FFFF followed by more characters (`X\uffffabc > X\uffff`).
- **Impact:** Trigger: resolving a worktree whose newly identified project contains subdirectory-nested sessions with an astral character at the first differing path position. Those sessions keep the stale `project_id`/`path` projection. Low likelihood (exotic path), genuine boundary bug.
- **Severity suggestion:** P3
- **Category:** correctness (boundary values)

---

## Finding: Basic-auth password comparison is not constant-time (session tokens are)

- **Location:** `packages/server/src/auth.ts:33-37`
- **Evidence:** `authorized()` compares the presented password with `===` (`password === config.password.value`) while `verifySession()` on the next line correctly uses `timingSafeEqual` for session tokens. The direct-password branch is the one holding the long-lived secret.
- **Impact:** Theoretical timing side channel on the password comparison. Practically negligible for a localhost-bound dev server (network jitter dominates), and the security lens owns this class - logged here only because this file was in the audit focus; informational.
- **Severity suggestion:** P3
- **Category:** correctness (adjacent: security hygiene)

---

## Areas examined with no findings

- **`packages/core/src/session/inbox.ts`** - `promote` steer/queue boundary logic, `pendingSteers` compaction-before-steers reorder (never crosses a move), `reconcile` first-admission-wins, and `projectAdmitted`/`projectDelivered`/`projectCancelled`/`projectDeliveryChanged` row-state guards (each conditioned on exact prior delivery state, defecting `LifecycleConflict` on divergence) all match the documented invariants.
- **`packages/core/src/session/run-coordinator.ts`** - doorbell/settle/successor interplay, settlement-window `interrupt` (clears `pendingWake` so settle cannot start a dead-intent successor), widest-scope wake coalescing, trampolined drain loop: no lost-wake or double-settle window found; self-waking failure restarts are documented and stack-safe.
- **`packages/core/src/session/runner/llm.ts`** - `advanceToStep` state resets (`entering`/`step`/`continuing`), steer-scoped early Complete, control-item delivery inside the inbox lock, output-limit streak query (synthetic continuations correctly do not break the streak; user input correctly does; 3 = current + 2 continuations), stale compaction/tool settlement on drain entry.
- **`packages/core/src/session/runner/step.ts`** - overflow recovery gating, interrupt-preserving settlement of tool/step events inside `uninterruptibleMask`, `classifyToolExits` index alignment with `Fiber.awaitAll` order, unknown-finish handling.
- **`packages/core/src/session/projector.ts`** - fork batching/cursor/keepID rewrite, fork title counter, monotone `time_idle`/`time_viewed` watermarks, revert-committed delete window, inbox delivery-to-message same-transaction projection (idempotency rests on the bus watermark, consistent with the `Created`/`Forked` conflict guards).
- **`packages/core/src/session/prompt.ts`** - attachment size bounds (including directory listings), data-URL canonical-base64 rejection, line-range slicing (`slice(start-1, end)` inclusive end), `positiveInt` handling of empty/garbage params.
- **`packages/server/src/handlers/session.ts`** - handlers delegate to core typed errors; conflict paths (`Session.InboxConflictError`) are mapped, not swallowed; `input.id` reaching `Event.ID.make` is protocol-validated as `SessionMessage.ID` (`protocol/src/groups/session.ts:427`), so the `msg_`-to-`evt_` rewrite cannot produce an invalid event ID.
- **`packages/codemode/src/interpreter/interpreter.ts`** (targeted) - `loopExit` label propagation, `usesArguments` arrow-vs-nested-function traversal, `instanceofValue` OrdinaryHasInstance order of checks, program-result extraction of the trailing expression, `MAX_CALL_DEPTH`.
- **`packages/core/src/shell/scan.ts`** (structure + entry budget only) - scan budget (`MAX_INPUT_LENGTH * MAX_SUBSTITUTION_DEPTH`) and dialect precommand/builtin tables reviewed at signature level; the parser body is covered by dedicated suites and was not line-audited in this pass.
