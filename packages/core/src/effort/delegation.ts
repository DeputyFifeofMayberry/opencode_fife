export * as EffortDelegation from "./delegation.js"

import { Effect } from "effect"
import type { ConfigEffort } from "@opencode/schema/config/effort"
import type { SessionSchema } from "../session/schema.js"
import type { EffortLevel } from "./policy/types.js"
import { operationStart } from "./policy/index.js"
import { EffortStore } from "./store.js"

const DEFAULT_OPERATIONS: Readonly<Record<string, ConfigEffort.Operation>> = {
  plan: "plan",
  review: "review",
  explore: "explore",
  general: "general",
  build: "implement",
}

/** The delegation operation a subagent performs: config override, then built-in defaults, then general. */
export function operationFor(
  agent: string,
  overrides?: Readonly<Record<string, ConfigEffort.Operation>>,
): ConfigEffort.Operation {
  const override = overrides?.[agent]
  if (override !== undefined) return override
  return DEFAULT_OPERATIONS[agent] ?? "general"
}

/**
 * The level an interactive session seeds at in adaptive mode. Explore reads as
 * read-only work here, one step cheaper than the delegation minimum a child
 * with the same operation receives; the operation minimum governs subagent
 * starting effort, this ladder governs the session's own controller level.
 */
export function sessionSeed(operation: ConfigEffort.Operation): EffortLevel {
  switch (operation) {
    case "plan":
    case "review":
      return "deep"
    case "mechanical":
    case "explore":
      return "low"
    case "general":
    case "implement":
      return "standard"
  }
}

/**
 * Seeds a created subagent's policy state with its operation's start level as
 * the base. The child's own policy then writes the variant through the normal
 * transition path, so the operation level is an escalatable base, not an
 * exact pick. Explicit or inherited picks — any variant on the model
 * override, the agent's configured model, or the inherited model — win
 * verbatim and keep the policy inert as exact picks; the operation minimum
 * never floors them.
 */
export const seed = Effect.fn("EffortDelegation.seed")(function* (
  deps: {
    readonly efforts: EffortStore.Interface
    readonly overrides?: Readonly<Record<string, ConfigEffort.Operation>>
  },
  input: {
    readonly sessionID: SessionSchema.ID
    readonly agent: string
    readonly inheritedVariants: readonly (string | undefined)[]
  },
) {
  if (input.inheritedVariants.some((variant) => variant !== undefined)) return
  const row = yield* deps.efforts.get(input.sessionID)
  if (row !== undefined) return
  const level = operationStart(operationFor(input.agent, deps.overrides))
  yield* deps.efforts.set({ sessionID: input.sessionID, baseLevel: level, revision: 0 })
})
