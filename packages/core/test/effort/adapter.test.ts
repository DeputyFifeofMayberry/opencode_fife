import { describe, expect, it } from "bun:test"
import { EFFORT_POLICY_PROTOCOL_VERSION } from "@opencode/core/effort/policy/index"
import { EffortAdapter } from "@opencode/core/effort/adapter"
import { Model } from "@opencode/schema/model"
import { Provider } from "@opencode/schema/provider"
import { ConfigEffort } from "@opencode/schema/config/effort"
import { SessionID } from "@opencode/schema/session-id"

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

describe("EffortAdapter.resolve", () => {
  const full = modelWith("none", "low", "high", "max")
  const selection = { providerID: Provider.ID.make("test"), id: Model.ID.make("test-model"), variant: Model.VariantID.make("max") }

  it("treats a default-variant selection as Auto with the default base", () => {
    expect(
      EffortAdapter.resolve({ model: full, selection: { ...selection, variant: Model.VariantID.make("default") }, agent: "build" }),
    ).toEqual({
      mode: "static",
      baseLevel: "standard",
      support: "supported",
      decision: { rule: "base", level: "standard" },
    })
  })

  it("filters the policy's own echo out of the exact pick", () => {
    const row = { sessionID: SessionID.make("ses_adapter"), baseLevel: "low" as const, revision: 1, lastAppliedVariant: "max" }
    const echoed = EffortAdapter.resolve({ model: full, state: row, agent: "build", selection })
    expect(echoed.selectedVariant).toBe(Model.VariantID.make("max"))
    expect(echoed.exact).toBeUndefined()
    expect(echoed.decision).toEqual({ rule: "base", level: "low", effort: "low" })
    expect(EffortAdapter.resolve({ model: full, state: row, agent: "build", selection: { ...selection, variant: Model.VariantID.make("high") } })).toMatchObject({
      selectedVariant: "high",
      exact: "high",
      decision: { rule: "exact-base", effort: "high" },
    })
  })

  it("seeds the base from the adaptive ladder only without a row", () => {
    const adaptive = new ConfigEffort.Info({ mode: "adaptive" })
    expect(EffortAdapter.resolve({ policy: adaptive, model: full, agent: "explore" })).toMatchObject({
      mode: "adaptive",
      baseLevel: "low",
      decision: { rule: "base", level: "low", effort: "low" },
    })
    const staticPolicy = new ConfigEffort.Info({ verification_commands: ["bun test"], base_level: "low" })
    expect(EffortAdapter.resolve({ policy: staticPolicy, model: full, agent: "build" })).toMatchObject({
      mode: "static",
      baseLevel: "low",
      decision: { rule: "base", level: "low", effort: "low" },
    })
  })

  it("decides from the durable adaptive state, including an open failure", () => {
    const row = {
      sessionID: SessionID.make("ses_adapter"),
      baseLevel: "standard" as const,
      revision: 2,
      level: "deep" as const,
      cleanPasses: 1,
      lastAppliedVariant: "max",
      openFailure: { verifier: "bun test", sequence: 1, revision: 2 },
    }
    expect(EffortAdapter.resolve({ policy: new ConfigEffort.Info({ mode: "adaptive", verification_commands: ["bun test"] }), model: full, state: row, agent: "build", selection })).toMatchObject({
      mode: "adaptive",
      baseLevel: "standard",
      decision: { rule: "escalated", level: "deep", effort: "max" },
    })
  })

  it("keeps the missing-model and degenerate-route outcomes honest", () => {
    expect(EffortAdapter.resolve({ agent: "build" })).toEqual({ mode: "static", baseLevel: "standard", support: "unknown" })
    expect(EffortAdapter.resolve({ model: modelWith("none", "thinking"), agent: "build" })).toEqual({
      mode: "static",
      baseLevel: "standard",
      support: "unsupported",
      decision: { rule: "untouched" },
    })
  })
})

describe("EffortAdapter frozen mode", () => {
  const full = modelWith("none", "low", "high", "max")

  it("reports frozen and does not seed from the agent operation", () => {
    const result = EffortAdapter.resolve({
      policy: new ConfigEffort.Info({ mode: "frozen", base_level: "standard", agent_operations: { build: "explore" } }),
      agent: "build",
      model: full,
    })
    expect(result.mode).toBe("frozen")
    expect(result.baseLevel).toBe("standard")
    expect(result.decision).toEqual({ rule: "base", level: "standard" })
  })

  it("keeps a stored base over the configured base", () => {
    const state = { sessionID: SessionID.make("ses_frozen"), baseLevel: "deep" as const, revision: 0 }
    expect(EffortAdapter.resolve({
      policy: new ConfigEffort.Info({ mode: "frozen", base_level: "low" }),
      state,
      agent: "build",
      model: full,
    })).toMatchObject({ mode: "frozen", baseLevel: "deep", decision: { rule: "base", level: "deep", effort: "max" } })
  })

  it("keeps the plan pin under frozen", () => {
    expect(EffortAdapter.resolve({
      policy: new ConfigEffort.Info({ mode: "frozen", base_level: "low" }),
      agent: "plan",
      model: full,
    })).toMatchObject({ mode: "frozen", decision: { rule: "mode-pin", level: "deep", effort: "max" } })
  })

  it("does not escalate while a failure is open", () => {
    const state = {
      sessionID: SessionID.make("ses_frozen"),
      baseLevel: "low" as const,
      revision: 1,
      openFailure: { verifier: "bun test", sequence: 1, revision: 1 },
    }
    expect(EffortAdapter.resolve({
      policy: new ConfigEffort.Info({ mode: "frozen", base_level: "low", verification_commands: ["bun test"] }),
      state,
      agent: "build",
      model: full,
    })).toMatchObject({ mode: "frozen", decision: { rule: "base", level: "low", effort: "low" } })
  })
})
