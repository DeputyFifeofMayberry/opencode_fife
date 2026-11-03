import { describe, expect, test } from "bun:test"
import { preferredStep, stepLabel } from "../../src/mini/step-label"

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

  test("falls back to the resolved level when no variant was written", () => {
    expect(stepLabel({ sessionID: "s", agent: "build", providerID: "p", modelID: "m", level: "standard" }, fallback))
      .toEqual({ agent: "build", model: "m", variant: "standard" })
  })
})

describe("preferred step", () => {
  const parent = { sessionID: "ses_root", agent: "build", providerID: "p", modelID: "root" }
  const child = { sessionID: "ses_child", agent: "medium", providerID: "q", modelID: "child", variant: "max" }

  test("prefers a running child over the parent", () => {
    expect(preferredStep({ parent, tabs: [{ status: "running", step: child }] })).toEqual(child)
  })

  test("ignores a finished child's last step", () => {
    expect(preferredStep({ parent, tabs: [{ status: "completed", step: child }] })).toEqual(parent)
  })

  test("falls back when a running child has no step yet", () => {
    expect(preferredStep({ parent, tabs: [{ status: "running" }] })).toEqual(parent)
  })

  test("uses tab order, which is most recently active first", () => {
    const second = { ...child, sessionID: "ses_child_2", agent: "fast" }
    expect(preferredStep({ parent, tabs: [{ status: "running", step: child }, { status: "running", step: second }] }))
      .toEqual(child)
  })
})
