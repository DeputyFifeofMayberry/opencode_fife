import { isPeak, type CostMultiplier } from "@opencode/util/cost-window"

/**
 * Peak/off-peak state, but only when every price window in play agrees. Models
 * in the catalog carry different windows, so a single badge that picked one of
 * them could label a request it does not govern.
 */
export function pricingStatus(
  windows: readonly (readonly CostMultiplier[] | undefined)[],
  at: number,
): { peak: boolean; label: string } | undefined {
  const states = windows.map((multipliers) => isPeak(multipliers, at))
  if (!states.length) return undefined
  if (states.some((state) => state !== states[0])) return undefined
  return states[0] ? { peak: true, label: "Peak" } : { peak: false, label: "Off-peak" }
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
