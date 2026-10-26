import { describe, expect, it } from "bun:test"
import {
  applyEvidence,
  decide,
  effectiveBase,
  operationMinimum,
  operationStart,
} from "../../src/effort/policy/policy.js"
import type { EffortState, EvidenceObservation } from "../../src/effort/policy/types.js"

const CAPABILITY = { efforts: ["off", "low", "high", "max"], defaultEffort: "high" }

function observation(
  kind: EvidenceObservation["kind"],
  overrides: Partial<EvidenceObservation> = {},
): EvidenceObservation {
  return { kind, verifier: "pwsh::npm test", sequence: 1, revision: 0, ...overrides }
}

describe("decision precedence", () => {
  it("records the level but writes nothing when it resolves to the adapter default", () => {
    expect(decide(CAPABILITY, { base: "standard" })).toEqual({ rule: "base", level: "standard" })
  })

  it("writes the low effort for a low base", () => {
    expect(decide(CAPABILITY, { base: "low" })).toEqual({ rule: "base", level: "low", effort: "low" })
  })

  it("raises the base by a mode pin", () => {
    expect(decide(CAPABILITY, { base: "low", pin: "deep" }))
      .toEqual({ rule: "mode-pin", level: "deep", effort: "max" })
  })

  it("writes an exact base verbatim, including off", () => {
    expect(decide(CAPABILITY, { base: "low", exact: "off" }))
      .toEqual({ rule: "exact-base", effort: "off" })
  })

  it("leaves a route untouched when the exact base is not advertised", () => {
    expect(decide(CAPABILITY, { base: "low", exact: "minimal" })).toEqual({ rule: "untouched" })
  })

  it("leaves a route without reasoning untouched", () => {
    expect(decide({ efforts: [] }, { base: "deep" })).toEqual({ rule: "untouched" })
  })
})

describe("evidence transitions", () => {
  it("escalates one level above the effective base on failure", () => {
    const failed = applyEvidence({ base: "low" }, observation("verification-failure"))
    expect(decide(CAPABILITY, failed)).toEqual({ rule: "escalated", level: "standard" })
  })

  it("escalates above a mode pin rather than the raw base", () => {
    const failed = applyEvidence({ base: "low", pin: "standard" }, observation("verification-failure"))
    expect(decide(CAPABILITY, failed)).toEqual({ rule: "escalated", level: "deep", effort: "max" })
  })

  it("ignores infrastructure observations", () => {
    const state: EffortState = { base: "low" }
    expect(applyEvidence(state, observation("infrastructure"))).toBe(state)
  })

  it("clears when the same verifier passes later at the same or newer revision", () => {
    const failed = applyEvidence({ base: "low" }, observation("verification-failure", { sequence: 4, revision: 7 }))
    const cleared = applyEvidence(failed, observation("verification-pass", { sequence: 9, revision: 7 }))
    expect(cleared.openFailure).toBeUndefined()
    expect(decide(CAPABILITY, cleared)).toEqual({ rule: "base", level: "low", effort: "low" })
  })

  it("keeps the escalation when the pass precedes the failure", () => {
    const failed = applyEvidence({ base: "low" }, observation("verification-failure", { sequence: 4 }))
    const stale = applyEvidence(failed, observation("verification-pass", { sequence: 3 }))
    expect(stale.openFailure).toBeDefined()
  })

  it("keeps the escalation when the pass predates a later mutation", () => {
    const failed = applyEvidence({ base: "low" }, observation("verification-failure", { sequence: 4, revision: 8 }))
    const stale = applyEvidence(failed, observation("verification-pass", { sequence: 9, revision: 7 }))
    expect(stale.openFailure).toBeDefined()
  })

  it("keeps the escalation when another verifier passes", () => {
    const failed = applyEvidence({ base: "low" }, observation("verification-failure"))
    const other = applyEvidence(failed, observation("verification-pass", { verifier: "pwsh::npm run lint", sequence: 9 }))
    expect(other.openFailure).toBeDefined()
  })

  it("ignores a pass when nothing is open", () => {
    const state: EffortState = { base: "low" }
    expect(applyEvidence(state, observation("verification-pass"))).toBe(state)
  })
})

describe("operation table", () => {
  it("starts reasoning delegations deep", () => {
    expect(operationStart("plan")).toBe("deep")
    expect(operationStart("review")).toBe("deep")
  })

  it("starts ordinary delegations standard", () => {
    expect(operationStart("general")).toBe("standard")
    expect(operationStart("explore")).toBe("standard")
    expect(operationStart("implement")).toBe("standard")
  })

  it("starts a bounded mechanical delegation low", () => {
    expect(operationStart("mechanical")).toBe("low")
  })

  it("applies the operation minimum", () => {
    expect(operationMinimum("mechanical")).toBe("low")
    expect(operationMinimum("review")).toBe("deep")
  })
})

describe("effective base", () => {
  it("takes the higher of base and pin", () => {
    expect(effectiveBase({ base: "low", pin: "standard" })).toBe("standard")
    expect(effectiveBase({ base: "deep", pin: "low" })).toBe("deep")
  })
})
