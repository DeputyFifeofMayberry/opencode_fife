import { describe, expect } from "bun:test"
import { LanguageModel } from "@opencode/ai/effect"
import { OpenAIChat } from "@opencode/ai/protocols/openai-chat"
import { TestLLM } from "@opencode/ai/testing"
import { Effect, Layer } from "effect"
import { Bus } from "@opencode/core/bus"
import { Config } from "@opencode/core/config"
import { Database } from "@opencode/core/database/database"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { EffortStatus } from "@opencode/core/effort/status"
import { EffortStore } from "@opencode/core/effort/store"
import { EffortTransition } from "@opencode/core/effort/transition"
import { Model } from "@opencode/core/model"
import { Provider } from "@opencode/schema/provider"
import { ProjectTable } from "@opencode/core/project/sql"
import { SessionRunnerModel } from "@opencode/core/session/runner/model"
import { SessionProjector } from "@opencode/core/session/projector"
import { SessionStore } from "@opencode/core/session/store"
import { SessionTable } from "@opencode/core/session/sql"
import { Project } from "@opencode/schema/project"
import { AbsolutePath } from "@opencode/schema/schema"
import { SessionID } from "@opencode/schema/session-id"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { testEffect } from "../lib/effect"

const effortModel = Model.Info.default(Provider.ID.make("fake"), Model.ID.make("fake-model"))

const TestModels = (variants: string[]) =>
  Layer.mock(Model.Service, {
    get: () => Effect.succeed({ ...effortModel, variants: variants.map((id) => ({ id: Model.VariantID.make(id) })) }),
  })

const testLayers = (variants: string[]) =>
  testEffect(
    Layer.merge(
      AppNodeBuilder.build(
        LayerNode.group([Database.node, Bus.node, SessionStore.node, EffortStore.node, SessionProjector.node]),
        [Bus.node.replace(Bus.configured({ persist: true }))],
      ),
      Layer.merge(
        TestLLM.testLayer(),
        Layer.merge(TestModels(variants), Config.testLayer([])),
      ),
    ),
  )

const it = testLayers(["low", "high", "max"])
const degenerateIt = testLayers(["thinking"])

const worktree = AbsolutePath.make("/work")

const seedSession = Effect.fn(function* (sessionID: SessionID, variant: string | undefined) {
  const database = yield* Database.Service
  yield* database.db
    .insert(ProjectTable)
    .values({ id: Project.ID.global, worktree, sandboxes: [] })
    .onConflictDoNothing()
    .run()
  yield* database.db
    .insert(SessionTable)
    .values({
      id: sessionID,
      project_id: Project.ID.global,
      directory: worktree,
      slug: "effort",
      version: "test",
      model: {
        id: Model.ID.make("fake-model"),
        providerID: Provider.ID.make("fake"),
        ...(variant === undefined ? {} : { variant: Model.VariantID.make(variant) }),
      },
    })
    .run()
})

const resolved = () =>
  SessionRunnerModel.resolved(LanguageModel.make({ id: "fake-model", provider: "fake", route: OpenAIChat.route }), {
    capabilities: Model.Capabilities.default(),
    cost: [],
    limit: { context: 200_000, output: 32_000 },
  })

interface Deps {
  readonly bus: Bus.Interface
  readonly store: SessionStore.Interface
  readonly efforts: EffortStore.Interface
  readonly config: Config.Interface
  readonly models: Model.Interface
}

const deps = Effect.fn(function* () {
  const bus = yield* Bus.Service
  const store = yield* SessionStore.Service
  const efforts = yield* EffortStore.Service
  const config = yield* Config.Service
  const models = yield* Model.Service
  return { bus, store, efforts, config, models }
})

/** The same snapshot the server handler assembles for GET /session/:id/effort. */
const describeFor = Effect.fn(function* (d: Deps, sessionID: SessionID, agent: string) {
  const session = yield* d.store.get(sessionID)
  const policy = Config.effortPolicy(yield* d.config.entries())
  const state = yield* d.efforts.get(sessionID)
  const model = session?.model ? yield* d.models.get(session.model.providerID, session.model.id) : undefined
  return EffortStatus.describe({ policy, state, agent, model, selection: session?.model })
})

/**
 * What describe reports as `next` must be what apply acts on for the same
 * snapshot: apply switches exactly when the decision carries a write, and the
 * durable variant afterwards is the decided effort (or "default" when the
 * decision clears the variant or never writes). The ModelSelected projection
 * updates the session row asynchronously, so a switched variant is awaited.
 */
const eventually = Effect.fnUntraced(function* (condition: Effect.Effect<boolean>) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (yield* condition) return
    yield* Effect.sleep("10 millis")
  }
  return yield* Effect.die("Timed out waiting for the effort variant projection")
})

const expectConsistent = Effect.fn(function* (
  d: Deps,
  sessionID: SessionID,
  agent: string,
  expectedNext: { rule: string; level?: string; effort?: string },
) {
  const before = yield* describeFor(d, sessionID, agent)
  expect(before.next).toMatchObject(expectedNext)
  const switched = yield* EffortTransition.apply(d, { sessionID, agent, resolved: resolved() })
  expect(switched).toBe(expectedNext.effort !== undefined && expectedNext.rule !== "exact-base")
  const expectedVariant = expectedNext.effort ?? "default"
  yield* eventually(
    d.store.get(sessionID).pipe(Effect.map((session) => (session?.model?.variant ?? "default") === expectedVariant)),
  )
  const session = yield* d.store.get(sessionID)
  expect(session?.model?.variant ?? "default").toBe(expectedVariant)
})

describe("EffortTransition and EffortStatus decision consistency", () => {
  it.effect("an at-rest auto session reports its decision and materializes the seed row without switching", () => {
    return Effect.gen(function* () {
      const d = yield* deps()
      const id = SessionID.make("ses_consistency_rest")
      yield* seedSession(id, undefined)
      yield* expectConsistent(d, id, "build", { rule: "base", level: "standard" })
      const row = yield* d.efforts.get(id)
      expect(row?.baseLevel).toBe("standard")
    })
  })

  it.effect("an auto session at a low base reports the write apply performs, and the policy echo stays automatic", () => {
    return Effect.gen(function* () {
      const d = yield* deps()
      const id = SessionID.make("ses_consistency_low")
      yield* seedSession(id, undefined)
      yield* d.efforts.set({ sessionID: id, baseLevel: "low", revision: 0 })
      yield* expectConsistent(d, id, "build", { rule: "base", level: "low", effort: "low" })
      const after = yield* describeFor(d, id, "build")
      expect(after).toMatchObject({ control: "automatic", selectedVariant: "low", next: { rule: "base", level: "low", effort: "low" } })
      expect(yield* EffortTransition.apply(d, { sessionID: id, agent: "build", resolved: resolved() })).toBe(false)
    })
  })

  it.effect("a user pick reports exact-base and never switches", () => {
    return Effect.gen(function* () {
      const d = yield* deps()
      const id = SessionID.make("ses_consistency_pick")
      yield* seedSession(id, "high")
      const before = yield* describeFor(d, id, "build")
      expect(before).toMatchObject({ control: "manual", next: { rule: "exact-base", effort: "high" } })
      yield* expectConsistent(d, id, "build", { rule: "exact-base", effort: "high" })
      expect(yield* d.efforts.get(id)).toBeUndefined()
    })
  })

  it.effect("a plan agent reports the mode pin and apply writes it", () => {
    return Effect.gen(function* () {
      const d = yield* deps()
      const id = SessionID.make("ses_consistency_plan")
      yield* seedSession(id, undefined)
      yield* expectConsistent(d, id, "plan", { rule: "mode-pin", level: "deep", effort: "max" })
    })
  })

  degenerateIt.effect("a route without effort variants reports untouched and never switches", () => {
    return Effect.gen(function* () {
      const d = yield* deps()
      const id = SessionID.make("ses_consistency_degenerate")
      yield* seedSession(id, undefined)
      const before = yield* describeFor(d, id, "build")
      expect(before).toMatchObject({ support: "unsupported", next: { rule: "untouched" } })
      expect(yield* EffortTransition.apply(d, { sessionID: id, agent: "build", resolved: resolved() })).toBe(false)
      expect(yield* d.efforts.get(id)).toBeUndefined()
    })
  })
})
