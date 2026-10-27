import { describe, expect } from "bun:test"
import { LanguageModel } from "@opencode/ai/effect"
import { OpenAIChat } from "@opencode/ai/protocols/openai-chat"
import { TestLLM } from "@opencode/ai/testing"
import { Effect, Layer, Queue, Stream } from "effect"
import { Bus } from "@opencode/core/bus"
import { Config } from "@opencode/core/config"
import { Database } from "@opencode/core/database/database"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { EffortStore } from "@opencode/core/effort/store"
import { EffortTransition } from "@opencode/core/effort/transition"
import { Model } from "@opencode/core/model"
import { Provider } from "@opencode/schema/provider"
import { ProjectTable } from "@opencode/core/project/sql"
import { SessionRunnerModel } from "@opencode/core/session/runner/model"
import { SessionStore } from "@opencode/core/session/store"
import { SessionTable } from "@opencode/core/session/sql"
import { SessionEvent } from "@opencode/schema/session-event"
import { Project } from "@opencode/schema/project"
import { AbsolutePath } from "@opencode/schema/schema"
import { SessionID } from "@opencode/schema/session-id"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { testEffect } from "../lib/effect"

const effortModel = Model.Info.default(Provider.ID.make("fake"), Model.ID.make("fake-model"))

const TestModels = () =>
  Layer.mock(Model.Service, {
    get: () => Effect.succeed({ ...effortModel, variants: ["low", "high", "max"].map((id) => ({ id: Model.VariantID.make(id) })) }),
  })

const it = testEffect(
  Layer.merge(
    AppNodeBuilder.build(
      LayerNode.group([Database.node, Bus.node, SessionStore.node, EffortStore.node]),
      [Bus.node.replace(Bus.configured({ persist: true }))],
    ),
    Layer.merge(TestLLM.testLayer(), Layer.merge(TestModels(), Config.testLayer([]))),
  ),
)

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

const deps = Effect.fn(function* () {
  const bus = yield* Bus.Service
  const store = yield* SessionStore.Service
  const efforts = yield* EffortStore.Service
  const config = yield* Config.Service
  const models = yield* Model.Service
  return { bus, store, efforts, config, models }
})

describe("EffortTransition restart recovery", () => {
  it.effect("honors escalated state without re-transitioning", () => {
    return Effect.gen(function* () {
      const d = yield* deps()
      const id = SessionID.make("ses_recovery_escalated")
      yield* seedSession(id, "max")
      yield* d.efforts.set({
        sessionID: id,
        baseLevel: "standard",
        openFailure: { verifier: "pnpm typecheck", sequence: 4, revision: 2 },
        revision: 2,
        lastAppliedVariant: "max",
      })
      const seen = yield* Queue.unbounded<SessionEvent.EffortTransitioned>()
      yield* d.bus.subscribe(SessionEvent.EffortTransitioned).pipe(
        Stream.runForEach((event) => Queue.offer(seen, event)),
        Effect.forkScoped({ startImmediately: true }),
      )

      const switched = yield* EffortTransition.apply(d, {
        sessionID: id,
        agent: "build",
        resolved: resolved(),
      })
      expect(switched).toBe(false)
      expect((yield* d.efforts.get(id))?.openFailure).toBeDefined()
      expect(yield* Queue.isFull(seen)).toBe(false)
    })
  })

  it.effect("a pick made while stopped wins after recovery", () => {
    return Effect.gen(function* () {
      const d = yield* deps()
      const id = SessionID.make("ses_recovery_pick")
      yield* seedSession(id, "high")
      yield* d.efforts.set({ sessionID: id, baseLevel: "standard", revision: 1, lastAppliedVariant: "low" })

      const switched = yield* EffortTransition.apply(d, {
        sessionID: id,
        agent: "build",
        resolved: resolved(),
      })
      expect(switched).toBe(false)
      // The user's pick is the baseline now: the stale policy marker is dropped.
      expect((yield* d.efforts.get(id))?.lastAppliedVariant).toBeUndefined()
      expect((yield* d.efforts.get(id))?.revision).toBe(1)
    })
  })
})
