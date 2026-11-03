export type Verdict =
  | "local-overstates"
  | "local-understates"
  | "aggregate-within-tolerance"
  | "inconclusive"

/**
 * Decide the billing verdict from the two figures that can be missing.
 *
 * A null deltaPct means the local or billed side was unavailable. It must not fall through
 * to "aggregate-within-tolerance": that would report agreement between a number and nothing.
 */
export const verdictFor = (deltaPct: number | null, billedUSD: number | null): Verdict => {
  if (billedUSD === null || billedUSD <= 0) return "inconclusive"
  if (deltaPct === null) return "inconclusive"
  if (deltaPct > 15) return "local-overstates"
  if (deltaPct < -15) return "local-understates"
  return "aggregate-within-tolerance"
}
