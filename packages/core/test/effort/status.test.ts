import { describe, expect, test } from "bun:test"
import { EffortStatus } from "@opencode/core/effort/status"
import { Model } from "@opencode/schema/model"
import { Provider } from "@opencode/schema/provider"
import { ConfigEffort } from "@opencode/schema/config/effort"
import { SessionID } from "@opencode/schema/session-id"

const model = { ...Model.Info.default(Provider.ID.make("test"), Model.ID.make("model")), variants: ["low", "high", "max"].map((id) => ({ id: Model.VariantID.make(id) })) }
const selection = { providerID: Provider.ID.make("test"), id: Model.ID.make("model"), variant: Model.VariantID.make("max") }
const state = { sessionID: SessionID.make("ses_status"), baseLevel: "standard" as const, revision: 2, level: "deep" as const, lastAppliedVariant: "max", cleanPasses: 1, openFailure: { verifier: "bun test", sequence: 1, revision: 2 } }

describe("effort status", () => {
  test("distinguishes the applied variant from the next adaptive decision", () => {
    const result = EffortStatus.describe({ policy: new ConfigEffort.Info({ mode: "adaptive", verification_commands: ["bun test"] }), model, selection, state, agent: "build" })
    expect(result).toMatchObject({ mode: "adaptive", support: "supported", control: "automatic", selectedVariant: "max", currentLevel: "deep", cleanPasses: 1, cleanPassesNeeded: 2, openFailure: "bun test", next: { rule: "escalated", level: "deep", effort: "max" } })
  })
  test("identifies manual picks and an unavailable route", () => {
    expect(EffortStatus.describe({ model, selection: { ...selection, variant: Model.VariantID.make("high") }, state, agent: "build" })).toMatchObject({ control: "manual", next: { rule: "exact-base", effort: "high" } })
    expect(EffortStatus.describe({ model: { ...model, variants: [] }, agent: "build" })).toMatchObject({ mode: "static", support: "unsupported", next: { rule: "untouched" } })
    expect(EffortStatus.describe({ agent: "build" })).toMatchObject({ support: "unknown", initialized: false, next: undefined })
  })
  test("seeds adaptive explore and shows the provider default without inventing a variant", () => {
    expect(EffortStatus.describe({ policy: new ConfigEffort.Info({ mode: "adaptive" }), model, agent: "explore" })).toMatchObject({ baseLevel: "low", currentLevel: undefined, selectedVariant: undefined, next: { rule: "base", level: "low", effort: "low" } })
  })
})
