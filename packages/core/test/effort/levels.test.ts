import { describe, expect, it } from "bun:test"
import { higherLevel, higherOf, resolveLevelEffort } from "../../src/effort/policy/levels.js"

describe("resolveLevelEffort", () => {
  const full = { efforts: ["off", "low", "high", "max"], defaultEffort: "high" }

  it("maps each level onto the advertised vocabulary", () => {
    expect(resolveLevelEffort(full, "low")).toBe("low")
    expect(resolveLevelEffort(full, "standard")).toBe("high")
    expect(resolveLevelEffort(full, "deep")).toBe("max")
  })

  it("uses the least non-off effort when low is not advertised", () => {
    const capability = { efforts: ["off", "high", "max"], defaultEffort: "high" }
    expect(resolveLevelEffort(capability, "low")).toBe("high")
  })

  it("falls back to off on an off-only route", () => {
    const capability = { efforts: ["off"], defaultEffort: "off" }
    expect(resolveLevelEffort(capability, "low")).toBe("off")
    expect(resolveLevelEffort(capability, "standard")).toBe("off")
    expect(resolveLevelEffort(capability, "deep")).toBe("off")
  })

  it("returns undefined when the route advertises no reasoning", () => {
    expect(resolveLevelEffort({ efforts: [] }, "deep")).toBeUndefined()
  })

  it("returns undefined when the default is not advertised", () => {
    expect(resolveLevelEffort({ efforts: ["low", "high"], defaultEffort: "max" }, "standard")).toBeUndefined()
  })

  it("uses the highest effort when max is not advertised", () => {
    expect(resolveLevelEffort({ efforts: ["low", "high"], defaultEffort: "high" }, "deep")).toBe("high")
  })
})

describe("level ordering", () => {
  it("raises one level and caps at deep", () => {
    expect(higherLevel("low")).toBe("standard")
    expect(higherLevel("standard")).toBe("deep")
    expect(higherLevel("deep")).toBe("deep")
  })

  it("compares levels by cost", () => {
    expect(higherOf("low", "deep")).toBe("deep")
    expect(higherOf("standard", "low")).toBe("standard")
    expect(higherOf("deep", "deep")).toBe("deep")
  })
})
