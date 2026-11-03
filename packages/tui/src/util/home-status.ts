import { isPeak, type CostMultiplier } from "@opencode/util/cost-window"

/** Peak/off-peak state for the price window that currently governs a model. */
export function pricingStatus(multipliers: readonly CostMultiplier[] | undefined, at: number) {
  return isPeak(multipliers, at) ? { peak: true, label: "Peak" } : { peak: false, label: "Off-peak" }
}

/**
 * Recorded spend across root sessions. `cost()` already folds a session's
 * children into its total, so summing children too would double count.
 */
export function totalSpend(
  sessions: readonly { readonly id: string; readonly parentID?: string }[],
  cost: (id: string) => number,
) {
  return sessions.filter((session) => session.parentID === undefined).reduce((total, session) => total + cost(session.id), 0)
}
