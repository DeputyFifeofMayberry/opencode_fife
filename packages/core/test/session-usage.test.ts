import { expect, test } from "bun:test"
import { Usage } from "@opencode/ai/effect"
import { Money } from "@opencode/schema/money"
import { SessionUsage } from "@opencode/core/session/usage"

// $1 per million fresh input tokens, so a million of them price at $1 from the catalog.
const costs = [
  {
    input: Money.USDPerMillionTokens.make(1),
    output: Money.USDPerMillionTokens.make(2),
    cache: { read: Money.USDPerMillionTokens.zero, write: Money.USDPerMillionTokens.zero },
  },
]

const free = [
  {
    input: Money.USDPerMillionTokens.zero,
    output: Money.USDPerMillionTokens.zero,
    cache: { read: Money.USDPerMillionTokens.zero, write: Money.USDPerMillionTokens.zero },
  },
]

const millionInput = { input: 1_000_000, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }

test("prices the tokens from the catalog when the endpoint reports no cost", () => {
  const recorded = SessionUsage.record(new Usage({ nonCachedInputTokens: 1_000_000 }), costs)
  expect(recorded.cost).toBe(Money.USD.make(1))
  expect(recorded.costProvenance).toEqual({ estimated: Money.USD.make(1) })
})

test("records the cost the endpoint reports instead of the catalog price", () => {
  const recorded = SessionUsage.record(new Usage({ nonCachedInputTokens: 1_000_000, cost: 0.25 }), costs)
  expect(recorded.cost).toBe(Money.USD.make(0.25))
  expect(recorded.costProvenance).toEqual({ provider: Money.USD.make(0.25) })
})

test("keeps a reported zero cost, as for a request a subscription covered", () => {
  expect(SessionUsage.record(new Usage({ nonCachedInputTokens: 1_000_000, cost: 0 }), costs)).toEqual({
    tokens: millionInput,
    cost: Money.USD.zero,
    costProvenance: { provider: Money.USD.zero },
  })
})

test("keeps a matched zero catalog rate as an estimated zero", () => {
  expect(SessionUsage.record(new Usage({ nonCachedInputTokens: 1_000_000 }), free)).toEqual({
    tokens: millionInput,
    cost: Money.USD.zero,
    costProvenance: { estimated: Money.USD.zero },
  })
})

test("counts a record the catalog cannot price instead of calling it free", () => {
  expect(SessionUsage.record(new Usage({ nonCachedInputTokens: 1_000_000 }), [])).toEqual({
    tokens: millionInput,
    cost: Money.USD.zero,
    costProvenance: { unpriced: 1 },
  })
})

test("sums amounts of the same origin", () => {
  const estimated = SessionUsage.record(new Usage({ nonCachedInputTokens: 1_000_000 }), costs)
  const total = SessionUsage.add(estimated, estimated)
  expect(total).toEqual({
    tokens: { input: 2_000_000, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    cost: Money.USD.make(2),
    costProvenance: { estimated: Money.USD.make(2) },
  })
})

test("keeps both origins when a total mixes them", () => {
  const provider = SessionUsage.record(new Usage({ nonCachedInputTokens: 1_000_000, cost: 0.25 }), costs)
  const estimated = SessionUsage.record(new Usage({ nonCachedInputTokens: 1_000_000 }), costs)
  expect(SessionUsage.add(provider, estimated).costProvenance).toEqual({
    provider: Money.USD.make(0.25),
    estimated: Money.USD.make(1),
  })
})

test("counts unpriced records alongside priced amounts", () => {
  const unpriced = SessionUsage.record(new Usage({ nonCachedInputTokens: 1_000_000 }), [])
  const estimated = SessionUsage.record(new Usage({ nonCachedInputTokens: 1_000_000 }), costs)
  expect(SessionUsage.add(unpriced, estimated)).toEqual({
    tokens: { input: 2_000_000, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    cost: Money.USD.make(1),
    costProvenance: { estimated: Money.USD.make(1), unpriced: 1 },
  })
})
