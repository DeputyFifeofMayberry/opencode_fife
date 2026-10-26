import { describe, expect, it } from "bun:test"
import { EFFORT_POLICY_PROTOCOL_VERSION } from "@opencode/core/effort/policy/index"
import { EffortAdapter } from "@opencode/core/effort/adapter"
import { Model } from "@opencode/schema/model"
import { Provider } from "@opencode/schema/provider"

function modelWith(...ids: string[]): Model.Info {
  return {
    ...Model.Info.default(Provider.ID.make("test"), Model.ID.make("test-model")),
    variants: ids.map((id) => ({ id: Model.VariantID.make(id) })),
  }
}

/** The phantom default entry the adapter inserts; see EffortAdapter.capability. */
const DEFAULT = "standard"

describe("EffortAdapter.capability", () => {
  it("advertises effort variants least expensive first, with the default stand-in between them", () => {
    expect(EffortAdapter.capability(modelWith("max", "low", "high")).efforts).toEqual([
      "low",
      DEFAULT,
      "high",
      "max",
    ])
    expect(EffortAdapter.capability(modelWith("max", "low", "high")).defaultEffort).toBe(DEFAULT)
  })

  it("ignores non-effort variants and leaves degenerate routes untouched", () => {
    expect(EffortAdapter.capability(modelWith("none", "thinking")).efforts).toEqual([])
    expect(EffortAdapter.capability(modelWith("minimal", "thinking")).efforts).toEqual([])
  })
})

describe("EffortAdapter.decideFor", () => {
  const full = modelWith("none", "low", "high", "max")

  it("decides nothing to write for an auto session at the default base", () => {
    expect(EffortAdapter.decideFor(full, { baseLevel: "standard" })).toEqual({ rule: "base", level: "standard" })
  })

  it("writes the base effort for a low auto session", () => {
    expect(EffortAdapter.decideFor(full, { baseLevel: "low" })).toEqual({ rule: "base", level: "low", effort: "low" })
  })

  it("escalates a low base to standard, which means the model default", () => {
    const openFailure = { verifier: "pwsh\0pnpm typecheck\0/work", sequence: 4, revision: 7 }
    expect(EffortAdapter.decideFor(full, { baseLevel: "low", openFailure })).toEqual({
      rule: "escalated",
      level: "standard",
    })
  })

  it("escalates a standard base to the max variant", () => {
    const openFailure = { verifier: "pwsh\0pnpm typecheck\0/work", sequence: 4, revision: 7 }
    expect(EffortAdapter.decideFor(full, { baseLevel: "standard", openFailure })).toEqual({
      rule: "escalated",
      level: "deep",
      effort: "max",
    })
  })

  it("resolves deep to the most expensive advertised effort when max is absent", () => {
    const openFailure = { verifier: "pwsh\0pnpm typecheck\0/work", sequence: 4, revision: 7 }
    expect(EffortAdapter.decideFor(modelWith("low", "high"), { baseLevel: "standard", openFailure })).toEqual({
      rule: "escalated",
      level: "deep",
      effort: "high",
    })
  })

  it("writes an exact pick verbatim and ignores non-effort picks", () => {
    expect(EffortAdapter.decideFor(full, { baseLevel: "low", variant: "high" })).toEqual({
      rule: "exact-base",
      effort: "high",
    })
    expect(EffortAdapter.decideFor(modelWith("none", "thinking"), { baseLevel: "low", variant: "thinking" })).toEqual({
      rule: "untouched",
    })
  })

  it("pins plan-mode sessions to deep", () => {
    expect(EffortAdapter.decideFor(full, { baseLevel: "low", agent: "plan" })).toEqual({
      rule: "mode-pin",
      level: "deep",
      effort: "max",
    })
  })

  it("leaves routes without reasoning untouched in every state", () => {
    const bare = modelWith()
    expect(EffortAdapter.decideFor(bare, { baseLevel: "deep" })).toEqual({ rule: "untouched" })
    expect(
      EffortAdapter.decideFor(bare, {
        baseLevel: "low",
        openFailure: { verifier: "v", sequence: 1, revision: 0 },
      }),
    ).toEqual({ rule: "untouched" })
  })

  it("pins the supported protocol version pairing", () => {
    expect(EffortAdapter.SUPPORTED_PROTOCOL_VERSION).toBe(EFFORT_POLICY_PROTOCOL_VERSION)
  })
})
