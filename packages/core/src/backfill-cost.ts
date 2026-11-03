import { compileWindow, multiplierAt } from "./cost-window.js"

/** Recomputes a stored cost from recorded tokens, catalog prices, and the price window. */

export type TokenCounts = {
  input: number
  output: number
  reasoning: number
  cache: { read: number; write: number }
}

export type StoredCost = {
  readonly providerID: string
  readonly modelID: string
  readonly tokens: TokenCounts
  /** Epoch milliseconds the step finished. */
  readonly at: number
  readonly cost: number
  readonly costProvenance: { provider?: number; estimated?: number; unpriced?: number }
}

type Price = { price: number; cache?: { read?: number; write?: number } }
type ModelCost = {
  text?: { input?: Price & { overrides?: unknown }; output?: { price: number; overrides?: unknown } }
  multipliers?: readonly { when: Record<string, unknown>; factor: unknown }[]
}
export type Catalog = Record<string, { models?: Record<string, { cost?: ModelCost }> } | undefined>

function prices(model: ModelCost | undefined) {
  const input = model?.text?.input
  const output = model?.text?.output
  // Tiered pricing is not reconstructed here; such a row is left as recorded.
  if (!input || !output || input.overrides || output.overrides) return undefined
  return { input: input.price, output: output.price, read: input.cache?.read ?? 0, write: input.cache?.write ?? 0 }
}

/** The corrected cost for one stored step, or `skipped` when it cannot be rebuilt. */
export function reprice(stored: StoredCost, catalog: Catalog) {
  if (stored.costProvenance.estimated === undefined) return { cost: stored.cost, changed: false }
  const model = catalog[stored.providerID]?.models?.[stored.modelID]?.cost
  const rate = prices(model)
  if (!rate) return "skipped" as const

  const tokens = stored.tokens
  const base =
    (tokens.input * rate.input +
      (tokens.output + tokens.reasoning) * rate.output +
      tokens.cache.read * rate.read +
      tokens.cache.write * rate.write) /
    1_000_000

  const multipliers = (model?.multipliers ?? []).flatMap((item) => {
    if (typeof item.factor !== "number") return []
    const window = compileWindow(item.when)
    return window ? [{ window, factor: item.factor }] : []
  })
  const cost = base * multiplierAt(multipliers, stored.at)
  return { cost, changed: Math.abs(cost - stored.cost) > 1e-12 }
}
