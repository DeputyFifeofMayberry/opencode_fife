export * as EffortStatus from "./status.js"

import type { ConfigEffort } from "@opencode/schema/config/effort"
import type { Model } from "@opencode/schema/model"
import type { EffortStore } from "./store.js"
import { EffortAdapter } from "./adapter.js"
import { operationFor, sessionSeed } from "./delegation.js"

/** A read-only snapshot. `next` is a decision for the next step, not a claim about a past request. */
export function describe(input: {
  policy?: ConfigEffort.Info
  state?: EffortStore.Info
  agent: string
  model?: Model.Info
  selection?: Model.Ref
}) {
  const mode = input.policy?.mode ?? "static"
  const selected = input.selection?.variant === "default" ? undefined : input.selection?.variant
  const exact = selected !== undefined && selected !== input.state?.lastAppliedVariant ? selected : undefined
  const base = input.state?.baseLevel ?? (mode === "adaptive"
    ? sessionSeed(operationFor(input.agent, input.policy?.agent_operations))
    : (input.policy?.base_level ?? "standard"))
  const support = input.model === undefined ? "unknown" as const
    : EffortAdapter.capability(input.model).efforts.length === 0 ? "unsupported" as const : "supported" as const
  const decision = input.model === undefined ? undefined : EffortAdapter.decideFor(input.model, {
    variant: exact,
    baseLevel: base,
    agent: input.agent,
    openFailure: input.state?.openFailure,
    ...(mode === "adaptive" ? {
      level: input.state?.level ?? base,
      cleanPasses: input.state?.cleanPasses ?? 0,
      cleanPassesNeeded: input.policy?.clean_passes ?? 2,
    } : {}),
  })
  return {
    mode,
    agent: input.agent,
    support,
    control: exact !== undefined ? "manual" as const : "automatic" as const,
    model: input.selection ? { providerID: input.selection.providerID, id: input.selection.id } : undefined,
    selectedVariant: selected,
    baseLevel: base,
    currentLevel: mode === "adaptive" ? input.state?.level : undefined,
    initialized: input.state !== undefined,
    verificationCommands: input.policy?.verification_commands ?? [],
    cleanPasses: input.state?.cleanPasses ?? 0,
    cleanPassesNeeded: mode === "adaptive" ? (input.policy?.clean_passes ?? 2) : undefined,
    openFailure: input.state?.openFailure?.verifier,
    next: decision,
  }
}
