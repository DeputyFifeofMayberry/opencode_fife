export * as SessionUsage from "./usage.js"

import type { Usage } from "@opencode/ai/effect"
import type { CostProvenance } from "@opencode/schema/cost-provenance"
import { Money } from "@opencode/schema/money"
import type { TokenUsage } from "@opencode/schema/token-usage"
import type { Model } from "@opencode/schema/model"

const finite = (value: number) => (Number.isFinite(value) ? value : 0)
const safe = (value: number | undefined) => Math.max(0, finite(value ?? 0))

export const tokens = (usage: Usage | undefined): TokenUsage.Info => ({
  input: safe(usage?.nonCachedInputTokens),
  output: safe(usage?.visibleOutputTokens),
  reasoning: safe(usage?.reasoningTokens),
  cache: {
    read: safe(usage?.cacheReadInputTokens),
    write: safe(usage?.cacheWriteInputTokens),
  },
})

// Catalog pricing is the fallback for endpoints that don't report what they charged (`Usage.cost`).
// TODO(#35765): Normalize Copilot's reported billed amount into `Usage.cost`.
// Undefined when no rate applies, so the record counts as unpriced rather than free.
export function calculateCost(costs: Model.Info["cost"], usage: TokenUsage.Info): Money.USD | undefined {
  const context = usage.input + usage.cache.read + usage.cache.write
  const tier = costs
    .filter((cost) => cost.tier?.type === "context" && context > cost.tier.size)
    .toSorted((a, b) => (b.tier?.size ?? 0) - (a.tier?.size ?? 0))[0]
  const cost = tier ?? costs.find((cost) => cost.tier === undefined)
  if (!cost) return undefined
  return Money.USD.make(
    (usage.input * finite(cost.input) +
      (usage.output + usage.reasoning) * finite(cost.output) +
      usage.cache.read * finite(cost.cache.read) +
      usage.cache.write * finite(cost.cache.write)) /
      1_000_000,
  )
}

export type Recorded = {
  readonly tokens: TokenUsage.Info
  readonly cost: Money.USD
  readonly costProvenance: CostProvenance.Info
}

/** Prices tokens that only a hook reported, with no endpoint amount to prefer. */
export const estimate = (tokens: TokenUsage.Info, costs: Model.Info["cost"]): Recorded => {
  const cost = calculateCost(costs, tokens)
  if (cost === undefined) return { tokens, cost: Money.USD.zero, costProvenance: { unpriced: 1 } }
  return { tokens, cost, costProvenance: { estimated: cost } }
}

export const record = (usage: Usage | undefined, costs: Model.Info["cost"]): Recorded => {
  const normalized = tokens(usage)
  // What an endpoint says it charged beats the catalog, which can't see its peak pricing, subscriptions or routing.
  // A reported zero is authoritative.
  if (usage?.cost !== undefined) {
    const cost = Money.USD.make(usage.cost)
    return { tokens: normalized, cost, costProvenance: { provider: cost } }
  }
  return estimate(normalized, costs)
}

const sum = (a: Money.USD | undefined, b: Money.USD | undefined) =>
  a === undefined ? b : b === undefined ? a : Money.USD.make(a + b)

const addProvenance = (a: CostProvenance.Info, b: CostProvenance.Info): CostProvenance.Info => {
  const provider = sum(a.provider, b.provider)
  const estimated = sum(a.estimated, b.estimated)
  const unpriced = (a.unpriced ?? 0) + (b.unpriced ?? 0)
  return {
    ...(provider === undefined ? {} : { provider }),
    ...(estimated === undefined ? {} : { estimated }),
    ...(unpriced === 0 ? {} : { unpriced }),
  }
}

export const add = (a: Recorded, b: Recorded): Recorded => ({
  cost: Money.USD.make(a.cost + b.cost),
  costProvenance: addProvenance(a.costProvenance, b.costProvenance),
  tokens: {
    input: a.tokens.input + b.tokens.input,
    output: a.tokens.output + b.tokens.output,
    reasoning: a.tokens.reasoning + b.tokens.reasoning,
    cache: {
      read: a.tokens.cache.read + b.tokens.cache.read,
      write: a.tokens.cache.write + b.tokens.cache.write,
    },
  },
})
