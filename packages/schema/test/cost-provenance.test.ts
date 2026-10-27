import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { CostProvenance } from "../src/cost-provenance.js"
import { Money } from "../src/money.js"
import { SessionMessage } from "../src/session-message.js"

const tokens = { input: 10, output: 4, reasoning: 2, cache: { read: 3, write: 1 } }
const assistant = {
  id: "msg_assistant",
  type: "assistant",
  agent: "build",
  model: { providerID: "provider", id: "model" },
  content: [],
  cost: 0.5,
  tokens,
  time: { created: 1 },
} as const
const compaction = {
  id: "msg_compaction",
  type: "compaction",
  status: "completed",
  reason: "manual",
  summary: "summary",
  cost: 1,
  tokens,
  time: { created: 1 },
} as const

describe("cost provenance", () => {
  test("round-trips each origin, including authoritative zeros", () => {
    expect(Schema.decodeUnknownSync(CostProvenance.Info)({ provider: Money.USD.zero })).toEqual({
      provider: Money.USD.zero,
    })
    expect(Schema.decodeUnknownSync(CostProvenance.Info)({ estimated: Money.USD.zero })).toEqual({
      estimated: Money.USD.zero,
    })
    expect(Schema.decodeUnknownSync(CostProvenance.Info)({ unpriced: 2 })).toEqual({ unpriced: 2 })
  })

  test("decodes legacy assistant messages without provenance", () => {
    const decoded = Schema.decodeUnknownSync(SessionMessage.Info)(assistant)
    expect(decoded).not.toHaveProperty("costProvenance")
    expect(Schema.encodeSync(SessionMessage.Info)(decoded)).toEqual(assistant)
  })

  test("decodes legacy compaction messages without provenance", () => {
    const decoded = Schema.decodeUnknownSync(SessionMessage.Info)(compaction)
    expect(decoded).not.toHaveProperty("costProvenance")
    expect(Schema.encodeSync(SessionMessage.Info)(decoded)).toEqual(compaction)
  })

  test("round-trips a compaction that mixes origins across its requests", () => {
    const withProvenance = {
      ...compaction,
      costProvenance: { provider: Money.USD.zero, estimated: Money.USD.make(1), unpriced: 1 },
    }
    const decoded = Schema.decodeUnknownSync(SessionMessage.Info)(withProvenance)
    expect(decoded).toMatchObject({ costProvenance: withProvenance.costProvenance })
    expect(Schema.encodeSync(SessionMessage.Info)(decoded)).toEqual(withProvenance)
  })
})
