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
  return { agent: step.agent, model: step.modelID, variant: step.variant ?? step.level }
}

/**
 * The step to show: a running delegated step wins over the parent's own, since
 * that is the work currently spending money. A finished child's last step is
 * not "running now".
 *
 * Tab order is load-bearing: `snapshot()` sorts running children first, then by
 * most recent activity, so the first running tab with a step is the one that
 * just did something.
 */
export function preferredStep(input: {
  parent?: StepIdentity
  tabs: ReadonlyArray<{ status: string; step?: StepIdentity }>
}): StepIdentity | undefined {
  return input.tabs.find((tab) => tab.status === "running" && tab.step !== undefined)?.step ?? input.parent
}
