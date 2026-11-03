import type { StepIdentity } from "./types"

/** Map a `session.step.started` payload onto the footer's step identity. */
export function stepIdentity(input: {
  sessionID: string
  agent: string
  model: { providerID: string; id: string; variant?: string | null }
}): StepIdentity {
  return {
    sessionID: input.sessionID,
    agent: input.agent,
    providerID: input.model.providerID,
    modelID: input.model.id,
    ...(input.model.variant ? { variant: input.model.variant } : {}),
  }
}
