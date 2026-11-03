import { describe, expect, test } from "bun:test"
import { stepLabel } from "../../src/mini/step-label"

const fallback = { agent: "build", model: "deepseek-flash", variant: undefined as string | undefined }

describe("step label", () => {
  test("prefers the running step", () => {
    expect(
      stepLabel({ sessionID: "s", agent: "fast", providerID: "vercel", modelID: "minimax/m3", variant: "medium" }, fallback),
    ).toEqual({ agent: "fast", model: "minimax/m3", variant: "medium" })
  })

  test("falls back before the first step", () => {
    expect(stepLabel(undefined, fallback)).toEqual(fallback)
  })

  test("never invents a level when the model has no variants", () => {
    expect(stepLabel({ sessionID: "s", agent: "build", providerID: "p", modelID: "m" }, fallback)).toEqual({
      agent: "build",
      model: "m",
      variant: undefined,
    })
  })
})
