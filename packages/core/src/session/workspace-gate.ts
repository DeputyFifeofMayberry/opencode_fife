export * as WorkspaceGate from "./workspace-gate.js"

import { Context, Effect } from "effect"

/** Shell authorization can yield the gate while no command is running. */
export const Current = Context.Reference<{
  readonly enter: Effect.Effect<void>
  readonly leave: Effect.Effect<void>
}>("@opencode/WorkspaceGate", {
  defaultValue: () => ({ enter: Effect.void, leave: Effect.void }),
})
