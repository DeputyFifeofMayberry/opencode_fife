# Session stability implementation plan

Baseline: dev at a2e29605ffe12257e7583c4b13607526a84961a7. Preserve unrelated changes and running services.

## Outcome

An unanswered shell approval must not prevent another session from running a command. Workspace-changing execution and verifier evidence must remain ordered. An inaccessible document reference must not crash the terminal interface.

## Tasks

1. Reproduce the observed cross-session stall in an isolated test: session A awaits a shell permission; session B's shell command must finish without resolving A's permission. Establish that the test fails before the fix.
2. Move permission waiting outside the shared execution gate while retaining ordering around actual workspace mutations, verification and their evidence. Cover approval, denial, interruption, queued work and concurrent sessions; preserve existing authorization and plugin hooks.
3. Carry the existing document-link exception fix into this worktree. Test failed file checks in both message link generation and document lookup, plus a terminal rendering regression. Investigate synchronous file checks separately; do not claim the error handler fixes slow I/O.
4. Run focused core and TUI tests, package typechecks, root check as feasible, and a service-isolated end-to-end test. Inspect the diff and document remaining failures.
5. Commit only task files. Integrate into an idle, clean dev checkout only; preserve other work. Do not install or restart services without a separate explicit update request.

## Evidence and risks

The live tester has a pending shell approval. Two unrelated diagnostic sessions requested git status and stalled before their shell processes started. The location-scoped runner holds a gate during tool execution, including approval waits. This is strong evidence, but a live release-and-retry comparison has not been performed.

Verification command identity is the exact command, and a successful result must not clear a failure after an intervening workspace mutation. Permission checks, hook behavior, and cancellation must not be bypassed or weakened.

The separate experimental client MCP connection failure is not established as a cause and is outside this fix.
