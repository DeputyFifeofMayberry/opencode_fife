import { describe, expect, it } from "bun:test"
import { DateTime, Schema } from "effect"
import { Agent } from "@opencode/schema/agent"
import { Model } from "@opencode/schema/model"
import { Money } from "@opencode/schema/money"
import { Project } from "@opencode/schema/project"
import { Provider } from "@opencode/schema/provider"
import { Session } from "@opencode/schema/session"
import { SessionMessage } from "@opencode/schema/session-message"
import { SessionTransfer } from "@opencode/schema/session-transfer"
import { AbsolutePath } from "@opencode/core/schema"
import { EffortBenchmark } from "@opencode/core/effort/benchmark"
import { EffortBenchmarkRunner } from "@opencode/core/effort/benchmark-runner"

const model = () => ({
  ...Model.Info.default(Provider.ID.make("provider-a"), Model.ID.make("model-a")),
  variants: ["low", "high", "max"].map((id) => ({ id: Model.VariantID.make(id) })),
})

const suiteText = (overrides: Partial<Record<string, unknown>> = {}) =>
  JSON.stringify({
    version: 1,
    provider: "provider-a",
    model: "model-a",
    seed: "runner-seed",
    repetitions: 1,
    arms: [{ policy: "efficiency" }, { policy: "balanced" }],
    cache_conditions: ["cold"],
    stages: [{ stage: "smoke", ceiling_usd: 2, run_ceiling_usd: 1, approved: true }],
    tasks: [
      { id: "task-one", class: "implementation", prompt: "p1" },
      { id: "task-two", class: "review", prompt: "p2" },
    ],
    ...overrides,
  })

const outcome = (index: number, correctness: "pass" | "fail" = "pass") => {
  const root = Session.ID.make(`ses_runner_${index}`)
  const info = Session.Info.make({
    id: root,
    projectID: Project.ID.make("project_runner"),
    cost: Money.USD.make(0.5),
    tokens: { input: 10, output: 5, reasoning: 1, cache: { read: 2, write: 1 } },
    time: { created: DateTime.makeUnsafe(1), updated: DateTime.makeUnsafe(1) },
    title: "runner run",
    location: { directory: AbsolutePath.make("/bench") },
  })
  const message = SessionMessage.Assistant.make({
    id: SessionMessage.ID.make(`msg_runner_${index}`),
    type: "assistant",
    agent: Agent.ID.make("build"),
    model: Model.Ref.make({
      id: Model.ID.make("model-a"),
      providerID: Provider.ID.make("provider-a"),
      variant: Model.VariantID.make("low"),
    }),
    content: [],
    cost: Money.USD.make(0.5),
    costProvenance: { estimated: Money.USD.make(0.5) },
    tokens: { input: 10, output: 5, reasoning: 1, cache: { read: 2, write: 1 } },
    time: { created: DateTime.makeUnsafe(1) },
  })
  return {
    root,
    exportJson: JSON.stringify(
      Schema.encodeSync(SessionTransfer.Data)(SessionTransfer.Data.make({ info, messages: [message] })),
    ),
    wall_ms: 1_000,
    resolved: "low",
    provider_requests: 1,
    correctness,
  }
}

describe("EffortBenchmarkRunner.execute", () => {
  it("refuses to start when the stage ceiling is not approved", async () => {
    let calls = 0
    const result = EffortBenchmarkRunner.execute({
      suite: EffortBenchmark.parseManifest(suiteText({ stages: [{ stage: "smoke", ceiling_usd: 2, run_ceiling_usd: 1, approved: false }] })),
      stage: "smoke",
      model: model(),
      run: async () => {
        calls++
        return outcome(1)
      },
    })
    await expect(result).rejects.toThrow(/ceiling/)
    expect(calls).toBe(0)
  })

  it("refuses to start when fewer than two arms are distinct", async () => {
    const result = EffortBenchmarkRunner.execute({
      suite: EffortBenchmark.parseManifest(suiteText()),
      stage: "smoke",
      model: { ...model(), variants: [{ id: Model.VariantID.make("thinking") }] },
      run: async () => outcome(1),
    })
    await expect(result).rejects.toThrow(/preflight/)
  })

  it("executes the seeded order, stops at the stage ceiling, and assembles the report", async () => {
    const suite = EffortBenchmark.parseManifest(suiteText())
    const expectedOrder = EffortBenchmark.expand(suite, "smoke")
    const executed: Array<{ spec: EffortBenchmark.RunSpec; root: string }> = []
    const result = await EffortBenchmarkRunner.execute({
      suite,
      stage: "smoke",
      model: model(),
      run: async (spec) => {
        const completed = outcome(executed.length + 1)
        executed.push({ spec, root: String(completed.root) })
        return completed
      },
    })

    expect(executed.map((entry) => entry.spec)).toEqual([expectedOrder[0], expectedOrder[1]])
    expect(result.not_started).toHaveLength(2)
    expect(result.not_started.every((entry) => entry.reason === "stage-ceiling-exceeded")).toBe(true)

    expect(result.entries).toHaveLength(2)
    expect(result.entries[0]).toMatchObject({ correctness: "pass", wall_ms: 1_000, requested_variant: "low" })
    expect(result.entries.map((entry) => String(entry.root_session_id))).toEqual(executed.map((entry) => entry.root))
    expect(result.report.summary.runs).toBe(2)
    expect(result.report.summary.cost).toBe(1)
    expect(result.report.summary.cost_complete).toBe(2)
  })

  it("keeps a thrown run visible without inventing a session", async () => {
    const suite = EffortBenchmark.parseManifest(
      suiteText({ stages: [{ stage: "smoke", ceiling_usd: 4, run_ceiling_usd: 1, approved: true }] }),
    )
    const expectedOrder = EffortBenchmark.expand(suite, "smoke")
    let calls = 0
    const result = await EffortBenchmarkRunner.execute({
      suite,
      stage: "smoke",
      model: model(),
      run: async () => {
        calls++
        if (calls === 1) throw new Error("backend exploded")
        return outcome(calls)
      },
    })

    expect(result.errored).toHaveLength(1)
    expect(result.errored[0]).toMatchObject({
      task_id: expectedOrder[0]!.task_id,
      policy: expectedOrder[0]!.policy,
    })
    expect(result.entries).toHaveLength(3)
    expect(result.exports).toHaveLength(3)
    expect(result.report.summary.runs).toBe(3)
  })
})
