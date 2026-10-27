import { describe, expect, it } from "bun:test"
import { EffortBenchmark } from "@opencode/core/effort/benchmark"
import { Model } from "@opencode/schema/model"
import { Provider } from "@opencode/schema/provider"
import { Session } from "@opencode/schema/session"

function modelWith(...ids: string[]): Model.Info {
  return {
    ...Model.Info.default(Provider.ID.make("test"), Model.ID.make("test-model")),
    variants: ids.map((id) => ({ id: Model.VariantID.make(id) })),
  }
}

const suite = (overrides: Partial<Record<string, unknown>> = {}) =>
  JSON.stringify({
    version: 1,
    provider: "test",
    model: "test-model",
    seed: "suite-seed",
    repetitions: 2,
    arms: allArms.map((policy) => ({ policy })),
    cache_conditions: ["cold", "warm"],
    stages: [
      { stage: "smoke", ceiling_usd: 5, run_ceiling_usd: 0.5, approved: true },
      { stage: "screening", ceiling_usd: 40, run_ceiling_usd: 1, approved: true },
    ],
    tasks: [
      { id: "task-one", class: "implementation", prompt: "fix the imports" },
      { id: "task-two", class: "review", prompt: "review the patch" },
    ],
    ...overrides,
  })

const allArms = ["efficiency", "balanced", "quality"] as const

describe("EffortBenchmark.parseManifest", () => {
  it("accepts a valid suite manifest", () => {
    const parsed = EffortBenchmark.parseManifest(suite())
    expect(parsed.provider).toBe("test")
    expect(parsed.arms.map((arm) => arm.policy)).toEqual([...allArms])
    expect(parsed.stages).toHaveLength(2)
  })

  it("rejects duplicate arms", () => {
    expect(() =>
      EffortBenchmark.parseManifest(
        suite({ arms: [{ policy: "efficiency" }, { policy: "efficiency" }] }),
      ),
    ).toThrow()
  })

  it("rejects unknown policies", () => {
    expect(() => EffortBenchmark.parseManifest(suite({ arms: [{ policy: "turbo" }] }))).toThrow()
  })

  it("rejects unknown task classes", () => {
    expect(() =>
      EffortBenchmark.parseManifest(suite({ tasks: [{ id: "t", class: "vibes", prompt: "p" }] })),
    ).toThrow()
  })

  it("rejects non-positive ceilings", () => {
    expect(() =>
      EffortBenchmark.parseManifest(
        suite({ stages: [{ stage: "smoke", ceiling_usd: 0, run_ceiling_usd: 1, approved: true }] }),
      ),
    ).toThrow()
  })

  it("rejects suites without tasks or arms", () => {
    expect(() => EffortBenchmark.parseManifest(suite({ tasks: [] }))).toThrow()
    expect(() => EffortBenchmark.parseManifest(suite({ arms: [] }))).toThrow()
  })
})

describe("EffortBenchmark.expand", () => {
  const parsed = () => EffortBenchmark.parseManifest(suite())

  it("expands one run per task, arm, cache condition, and repetition", () => {
    const runs = EffortBenchmark.expand(parsed(), "smoke")
    expect(runs).toHaveLength(2 * 3 * 2 * 2)
    expect(runs.every((run) => run.stage === "smoke")).toBe(true)
  })

  it("derives each arm's base level from its policy", () => {
    const runs = EffortBenchmark.expand(parsed(), "smoke")
    const bases = new Map(runs.map((run) => [run.policy, run.base]))
    expect(bases.get("efficiency")).toBe("low")
    expect(bases.get("balanced")).toBe("standard")
    expect(bases.get("quality")).toBe("deep")
  })

  it("is deterministic for a seed and differs across seeds", () => {
    const first = EffortBenchmark.expand(parsed(), "smoke")
    const second = EffortBenchmark.expand(parsed(), "smoke")
    expect(first.map((run) => run.seed)).toEqual(second.map((run) => run.seed))
    expect(first.map((run) => run.task_id)).toEqual(second.map((run) => run.task_id))

    const reseeded = EffortBenchmark.parseManifest(suite({ seed: "other-seed" }))
    const other = EffortBenchmark.expand(reseeded, "smoke")
    expect(first.map((run) => run.seed)).not.toEqual(other.map((run) => run.seed))
    expect([...first.map((run) => run.task_id)].sort()).toEqual([...other.map((run) => run.task_id)].sort())
  })

  it("refuses a stage the suite does not declare", () => {
    expect(() => EffortBenchmark.expand(parsed(), "confirmatory")).toThrow()
  })
})

describe("EffortBenchmark.preflight", () => {
  it("classifies three distinct arms and runs the full comparison", () => {
    const report = EffortBenchmark.preflight(modelWith("low", "high", "max"), allArms)
    expect(report.arms.map((arm) => [arm.policy, arm.resolved, arm.status])).toEqual([
      ["efficiency", "low", "distinct"],
      ["balanced", "standard", "distinct"],
      ["quality", "max", "distinct"],
    ])
    expect(report.comparison.map((arm) => arm.policy)).toEqual([...allArms])
    expect(report.valid).toBe(true)
  })

  it("runs the largest valid two-arm comparison when Stage 0 tiers alias two arms", () => {
    const report = EffortBenchmark.preflight(
      modelWith("low", "high"),
      allArms,
      new Map([
        ["balanced", "high"],
        ["quality", "high"],
      ]),
    )
    expect(report.arms.map((arm) => [arm.policy, arm.resolved, arm.status])).toEqual([
      ["efficiency", "low", "distinct"],
      ["balanced", "high", "distinct"],
      ["quality", "high", "converged"],
    ])
    expect(report.comparison.map((arm) => arm.policy)).toEqual(["efficiency", "balanced"])
    expect(report.valid).toBe(true)
  })

  it("refuses the static comparison when the route has no effort knob", () => {
    const report = EffortBenchmark.preflight(modelWith("none", "thinking"), allArms)
    expect(report.arms.every((arm) => arm.resolved === null && arm.status === "unavailable")).toBe(true)
    expect(report.comparison).toEqual([])
    expect(report.valid).toBe(false)
  })
})

describe("EffortBenchmark.runEntry", () => {
  const spec = {
    stage: "smoke",
    task_id: "task-one",
    policy: "efficiency",
    base: "low",
    cache_condition: "cold",
    repetition: 2,
    seed: "seed-1",
  } as const

  it("maps a run spec into the ledger manifest entry", () => {
    const entry = EffortBenchmark.runEntry({
      spec,
      root: Session.ID.make("ses_root"),
      resolved: "low",
      provider_requests: 3,
      correctness: "pass",
    })
    expect(entry).toMatchObject({
      task_id: "task-one",
      policy: "efficiency",
      requested_variant: "low",
      cache_condition: "cold",
      repetition: 2,
      root_session_id: "ses_root",
      provider_requests: 3,
      correctness: "pass",
    })
  })

  it("labels the base level as the requested variant when no tier was resolved", () => {
    const entry = EffortBenchmark.runEntry({ spec, root: Session.ID.make("ses_root") })
    expect(entry.requested_variant).toBe("low")
    expect(entry.correctness).toBeUndefined()
  })
})

describe("EffortBenchmark.budget", () => {
  it("refuses admission when the ceiling is not approved", () => {
    const guard = EffortBenchmark.budget({ ceiling_usd: 5, run_ceiling_usd: 1, approved: false })
    expect(guard.admit("run-one", 0.5)).toEqual({ admitted: false, reason: "ceiling-not-approved" })
  })

  it("refuses admission without ceilings", () => {
    const guard = EffortBenchmark.budget({ ceiling_usd: 0, run_ceiling_usd: 1, approved: true })
    expect(guard.admit("run-one", 0.5)).toEqual({ admitted: false, reason: "ceiling-not-approved" })
  })

  it("rejects a single run above the per-run ceiling", () => {
    const guard = EffortBenchmark.budget({ ceiling_usd: 5, run_ceiling_usd: 1, approved: true })
    expect(guard.admit("run-one", 1.5)).toEqual({ admitted: false, reason: "run-ceiling-exceeded" })
  })

  it("admits runs up to the stage ceiling and refuses the run that crosses it", () => {
    const guard = EffortBenchmark.budget({ ceiling_usd: 1, run_ceiling_usd: 1, approved: true })
    expect(guard.admit("run-one", 0.4)).toEqual({ admitted: true })
    expect(guard.admit("run-two", 0.4)).toEqual({ admitted: true })
    expect(guard.admit("run-three", 0.4)).toEqual({ admitted: false, reason: "stage-ceiling-exceeded" })
    expect(guard.total).toBe(0.8)
  })

  it("ignores double admission of the same run", () => {
    const guard = EffortBenchmark.budget({ ceiling_usd: 1, run_ceiling_usd: 1, approved: true })
    expect(guard.admit("run-one", 0.4)).toEqual({ admitted: true })
    expect(guard.admit("run-one", 0.4)).toEqual({ admitted: true })
    expect(guard.total).toBe(0.4)
  })
})
