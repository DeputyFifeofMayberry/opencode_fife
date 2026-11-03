const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

/**
 * The rail's cost segment. A `~` marks a subtotal that leaves out steps the
 * catalog could not price; a dash means nothing in the session could be priced.
 */
export function costLabel(cost: number, unpriced: boolean) {
  if (unpriced) return cost > 0 ? `~${money.format(cost)}` : "—"
  return cost > 0 ? money.format(cost) : undefined
}
