export * as EffortStatus from "./status.js"

import type { ConfigEffort } from "@opencode/schema/config/effort"
import type { Model } from "@opencode/schema/model"
import type { EffortStore } from "./store.js"
import { EffortAdapter } from "./adapter.js"

/** A read-only snapshot. `next` is a decision for the next step, not a claim about a past request. */
export function describe(input: {
  policy?: ConfigEffort.Info
  state?: EffortStore.Info
  agent: string
  model?: Model.Info
  selection?: Model.Ref
}) {
  const resolution = EffortAdapter.resolve(input)
  return {
    mode: resolution.mode,
    agent: input.agent,
    support: resolution.support,
    control:
      resolution.exact !== undefined
        ? "manual" as const
        : resolution.mode === "frozen"
          ? "fixed" as const
          : "automatic" as const,
    model: input.selection ? { providerID: input.selection.providerID, id: input.selection.id } : undefined,
    selectedVariant: resolution.selectedVariant,
    baseLevel: resolution.baseLevel,
    currentLevel: resolution.mode === "adaptive" ? input.state?.level : undefined,
    initialized: input.state !== undefined,
    verificationCommands: input.policy?.verification_commands ?? [],
    cleanPasses: input.state?.cleanPasses ?? 0,
    cleanPassesNeeded: resolution.mode === "adaptive" ? (input.policy?.clean_passes ?? 2) : undefined,
    openFailure: input.state?.openFailure?.verifier,
    next: resolution.decision,
  }
}
