import { describe, expect } from "bun:test"
import { Effect, Schema } from "effect"
import { Agent } from "@opencode/schema/agent"
import { Model } from "@opencode/schema/model"
import { Money } from "@opencode/schema/money"
import { Provider } from "@opencode/schema/provider"
import { Session } from "@opencode/schema/session"
import { SessionMessage } from "@opencode/schema/session-message"
import { SessionTransfer } from "@opencode/schema/session-transfer"
import type { TokenUsage } from "@opencode/schema/token-usage"
import { AbsolutePath } from "@opencode/core/schema"
import { EffortBenchmark } from "@opencode/core/effort/benchmark"
import { SessionUsageReport } from "@opencode/core/session/usage-report"
import { SessionInbox } from "@opencode/core/session/inbox"
import { SessionEvent } from "@opencode/core/session/event"
import { Bus } from "@opencode/core/bus"
import { Database } from "@opencode/core/database/database"
import { Project } from "@opencode/core/project"
import { SessionProjector } from "@opencode/core/session/projector"
import { SessionStore } from "@opencode/core/session/store"
import { Session as SessionService } from "@opencode/core/session"
import { SessionTransfer as SessionTransferService } from "@opencode/core/session/transfer"
import { InstructionEntry } from "@opencode/core/session/instruction-entry"
import { SessionExecution } from "@opencode/core/session/execution"
import { LocationServiceMap } from "@opencode/core/location-service-map"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { testEffect } from "../lib/effect"
import { globalProjectNode } from "../lib/project"
import { promptLocationNode } from "../fixture/prompt-location"
import { tmpdirScoped } from "../fixture/tmpdir"

function tokens(input = 0, output = 0, reasoning = 0, read = 0, write = 0): TokenUsage.Info {
  return { input, output, reasoning, cache: { read, write } }
}

const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([
      Database.node,
      Bus.node,
      SessionProjector.node,
      SessionStore.node,
      SessionService.node,
      SessionTransferService.node,
      InstructionEntry.node,
    ]),
    [
      Bus.node.replace(Bus.configured({ persist: true })),
      Project.node.replace(globalProjectNode),
      LocationServiceMap.node.replace(promptLocationNode),
      SessionExecution.node.replace(SessionExecution.noopLayer),
    ],
  ),
)

describe("EffortBenchmark run integration", () => {
  it.effect("records an arm run whose settled effort and provenance reconcile in the ledger", () =>
    Effect.gen(function* () {
      yield* tmpdirScoped()
      const session = yield* SessionService.Service
      const transfer = yield* SessionTransferService.Service
      const bus = yield* Bus.Service
      const { db } = yield* Database.Service
      const source = yield* session.create({ location: { directory: AbsolutePath.make("/bench-project") } })
      yield* session.prompt({ sessionID: source.id, text: "SECRET BENCH PROMPT", resume: false })
      yield* SessionInbox.promote(db, bus, source.id, "steer")

      // The runner settles one step whose model ref carries the effort the policy wrote.
      const assistantID = SessionMessage.ID.create()
      const stepModel = Model.Ref.make({
        id: Model.ID.make("model-a"),
        providerID: Provider.ID.make("provider-a"),
        variant: Model.VariantID.make("low"),
      })
      yield* bus.publish(SessionEvent.Step.Started, {
        sessionID: source.id,
        assistantMessageID: assistantID,
        agent: Agent.ID.make("build"),
        model: stepModel,
        started: 0,
      })
      yield* bus.publish(SessionEvent.Step.Ended, {
        sessionID: source.id,
        assistantMessageID: assistantID,
        finish: "stop",
        cost: Money.USD.make(0.25),
        costProvenance: { estimated: Money.USD.make(0.25) },
        tokens: tokens(10, 4, 2, 3, 1),
      })

      // The runner exports before any revert; the CLI writes the encoded wire form, so round-trip it.
      const exported = yield* transfer.export({ sessionID: source.id })
      const wire = JSON.stringify(Schema.encodeSync(SessionTransfer.Data)(exported))
      const parsed = SessionUsageReport.parseExports(wire)

      const spec: EffortBenchmark.RunSpec = {
        stage: "smoke",
        task_id: "task-one",
        policy: "efficiency",
        base: "low",
        cache_condition: "cold",
        repetition: 1,
        seed: "seed-1",
      }
      const entry = EffortBenchmark.runEntry({ spec, root: source.id, resolved: "low", provider_requests: 1 })
      const value = SessionUsageReport.build({ runs: [entry], exports: parsed })
      const row = value.runs[0]!

      expect(row.requested_variant).toBe("low")
      expect(row.messages.included).toBe(2)
      expect(row.tokens.gross).toBe(10 + 4 + 2 + 3 + 1)
      expect(row.cost).toMatchObject({
        provider: 0,
        estimated: 0.25,
        legacy_unknown: 0,
        unattributed: 0,
        total: 0.25,
        mixed: false,
      })
      expect(row.completeness).toMatchObject({
        usage_complete: true,
        cost_complete: true,
        cost_reconciled: true,
      })
      expect(row.attempts.complete).toBe(true)

      const settled = parsed[0]?.messages.find((message: SessionMessage.Info) => message.type === "assistant")
      expect(settled?.model.variant).toBe("low")
      expect(JSON.stringify(value)).not.toContain("SECRET BENCH PROMPT")
    }),
  )

  it.effect("preflight resolution names the tier the arm records", () => {
    const model = {
      ...Model.Info.default(Provider.ID.make("provider-a"), Model.ID.make("model-a")),
      variants: ["low", "high", "max"].map((id) => ({ id: Model.VariantID.make(id) })),
    }
    const report = EffortBenchmark.preflight(model, ["efficiency", "balanced", "quality"])
    expect(report.comparison.map((arm) => arm.resolved)).toEqual(["low", "standard", "max"])
    const spec: EffortBenchmark.RunSpec = {
      stage: "smoke",
      task_id: "task-one",
      policy: "quality",
      base: "deep",
      cache_condition: "cold",
      repetition: 1,
      seed: "seed-1",
    }
    const entry = EffortBenchmark.runEntry({
      spec,
      root: Session.ID.make("ses_preflight"),
      resolved: report.comparison[2]?.resolved,
    })
    expect(entry.requested_variant).toBe("max")
    return Effect.void
  })
})
