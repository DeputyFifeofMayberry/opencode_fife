import { describe, expect } from "bun:test"
import { LanguageModel } from "@opencode/ai/effect"
import { OpenAIChat } from "@opencode/ai/protocols/openai-chat"
import { TestLLM } from "@opencode/ai/testing"
import { Effect, Layer, Queue, Stream } from "effect"
import { Bus } from "@opencode/core/bus"
import { Config } from "@opencode/core/config"
import { Database } from "@opencode/core/database/database"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { EffortStatus } from "@opencode/core/effort/status"
import { EffortStore } from "@opencode/core/effort/store"
import { EffortTransition } from "@opencode/core/effort/transition"
import { Model } from "@opencode/core/model"
import { Provider } from "@opencode/schema/provider"
import { ConfigEffort } from "@opencode/schema/config/effort"
import { Document, Info } from "@opencode/schema/config"
import { ProjectTable } from "@opencode/core/project/sql"
import { SessionRunnerModel } from "@opencode/core/session/runner/model"
import { SessionProjector } from "@opencode/core/session/projector"
import { SessionStore } from "@opencode/core/session/store"
import { SessionTable } from "@opencode/core/session/sql"
import { SessionEvent } from "@opencode/schema/session-event"
import { Project } from "@opencode/schema/project"
import { AbsolutePath } from "@opencode/schema/schema"
import { SessionID } from "@opencode/schema/session-id"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { testEffect } from "../lib/effect"

const effortModel = Model.Info.default(Provider.ID.make("fake"), Model.ID.make("fake-model"))

const testLayers = (variants: string[] | undefined, policy?: ConfigEffort.Info) =>
  testEffect(
    Layer.merge(
      AppNodeBuilder.build(
        LayerNode.group([Database.node, Bus.node, SessionStore.node, EffortStore.node, SessionProjector.node]),
        [Bus.node.replace(Bus.configured({ persist: true }))],
      ),
      Layer.merge(
        TestLLM.testLayer(),
        Layer.merge(
          Layer.mock(Model.Service, {
            get: () =>
              Effect.succeed(
                variants === undefined
                  ? undefined
                  : { ...effortModel, variants: variants.map((id) => ({ id: Model.VariantID.make(id) })) },
              ),
          }),
          Config.testLayer(
            policy ? [new Document({ type: "document", info: new Info({ effort_policy: policy }) })] : [],
          ),
        ),
      ),
    ),
  )

const it = testLayers(["low", "high", "max"])
const degenerateIt = testLayers(["thinking"])
const adaptiveIt = testLayers(["low", "high", "max"], new ConfigEffort.Info({ mode: "adaptive", clean_passes: 2 }))
const noModelIt = testLayers(undefined)

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
  const transitions = yield* Queue.unbounded<SessionEvent.EffortTransitioned["data"]>()
  yield* d.bus.subscribe(SessionEvent.EffortTransitioned).pipe(
    Stream.filter((event) => event.data.sessionID === sessionID),
    Stream.runForEach((event) => Queue.offer(transitions, event.data)),
    Effect.forkScoped({ startImmediately: true }),
  )
  const switched = yield* EffortTransition.apply(d, { sessionID, agent, resolved: resolved() })
  // apply switches exactly when the decided target differs from the selected
  // variant — including a clear to the model default, whose decision carries no
  // effort — and never for an exact pick or an untouched route.
  const target = expectedNext.effort ?? "default"
  const current = before.selectedVariant ?? "default"
  expect(switched).toBe(
    expectedNext.rule !== "exact-base" && expectedNext.rule !== "untouched" && target !== current,
  )
  if (switched) {
    // The published decision must be the one describe reported for this snapshot.
    // Write rules always carry a level; exact-base and untouched never switch.
    if (before.next === undefined || before.next.rule === "exact-base" || before.next.rule === "untouched") {
      throw new Error("a switched transition must decide a write rule")
    }
    const event = yield* Queue.take(transitions)
    expect(event.decision).toEqual({
      rule: before.next.rule,
      level: before.next.level!,
      effort: before.next.effort,
    })
  } else {
    expect(yield* Queue.isFull(transitions)).toBe(false)
  }  const expectedVariant = expectedNext.effort ?? "default"
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

  it.effect("an open failure clears a policy-written low variant back to the model default", () => {
    return Effect.gen(function* () {
      const d = yield* deps()
      const id = SessionID.make("ses_consistency_escalate_clear")
      yield* seedSession(id, "low")
      yield* d.efforts.set({
        sessionID: id,
        baseLevel: "low",
        revision: 1,
        lastAppliedVariant: "low",
        openFailure: { verifier: "bun test", sequence: 1, revision: 1 },
      })
      yield* expectConsistent(d, id, "build", { rule: "escalated", level: "standard" })
      const row = yield* d.efforts.get(id)
      expect(row?.openFailure).toBeDefined()
      expect(row?.lastAppliedVariant).toBeUndefined()
    })
  })

  adaptiveIt.effect("an adaptive session above its base reports a step-down while holding the raised variant", () => {
    return Effect.gen(function* () {
      const d = yield* deps()
      const id = SessionID.make("ses_consistency_step_down")
      yield* seedSession(id, "max")
      yield* d.efforts.set({ sessionID: id, baseLevel: "low", revision: 1, level: "deep", cleanPasses: 0, lastAppliedVariant: "max" })
      yield* expectConsistent(d, id, "build", { rule: "step-down", level: "deep", effort: "max" })
    })
  })

  adaptiveIt.effect("an adaptive session without a row reports and writes its ladder seed", () => {
    return Effect.gen(function* () {
      const d = yield* deps()
      const id = SessionID.make("ses_consistency_adaptive_seed")
      yield* seedSession(id, undefined)
      yield* expectConsistent(d, id, "explore", { rule: "base", level: "low", effort: "low" })
      const row = yield* d.efforts.get(id)
      expect(row?.baseLevel).toBe("low")
      expect(row?.level).toBe("low")
    })
  })

  adaptiveIt.effect("an adaptive escalation to the model default clears the variant", () => {
    return Effect.gen(function* () {
      const d = yield* deps()
      const id = SessionID.make("ses_consistency_adaptive_clear")
      yield* seedSession(id, "low")
      yield* d.efforts.set({
        sessionID: id,
        baseLevel: "low",
        revision: 1,
        level: "standard",
        cleanPasses: 0,
        lastAppliedVariant: "low",
        openFailure: { verifier: "bun test", sequence: 1, revision: 1 },
      })
      yield* expectConsistent(d, id, "build", { rule: "escalated", level: "standard" })
      const row = yield* d.efforts.get(id)
      expect(row?.level).toBe("standard")
      expect(row?.openFailure).toBeDefined()
    })
  })

  noModelIt.effect("a missing model skips the transition without writing state", () => {
    return Effect.gen(function* () {
      const d = yield* deps()
      const id = SessionID.make("ses_consistency_no_model")
      yield* seedSession(id, undefined)
      expect(yield* EffortTransition.apply(d, { sessionID: id, agent: "build", resolved: resolved() })).toBe(false)
      expect(yield* d.efforts.get(id)).toBeUndefined()
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
