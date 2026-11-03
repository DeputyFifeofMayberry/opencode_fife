import { describe, expect, test } from "bun:test"
import { stepIdentity } from "../../src/mini/step-identity"

describe("step identity", () => {
  test("keeps agent, model and variant from a step-start event", () => {
    expect(
      stepIdentity({
        sessionID: "ses_1",
        agent: "fast",
        model: { providerID: "vercel", id: "minimax/m3", variant: "medium" },
      }),
    ).toEqual({ sessionID: "ses_1", agent: "fast", providerID: "vercel", modelID: "minimax/m3", variant: "medium" })
  })

  test("omits an absent variant rather than inventing one", () => {
    expect(stepIdentity({ sessionID: "ses_1", agent: "build", model: { providerID: "p", id: "m" } })).toEqual({
      sessionID: "ses_1",
      agent: "build",
      providerID: "p",
      modelID: "m",
    })
  })
})
