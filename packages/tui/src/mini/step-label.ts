import type { StepIdentity } from "./types"

/**
 * The agent, model and level to show for the most recent step, falling back to
 * the session's next-request identity before the first step runs.
 */
export function stepLabel(
  step: StepIdentity | undefined,
  fallback: { agent: string; model: string; variant?: string },
): { agent: string; model: string; variant?: string } {
  if (step === undefined) return fallback
  return { agent: step.agent, model: step.modelID, variant: step.variant }
}
