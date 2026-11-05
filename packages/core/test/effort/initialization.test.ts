import { describe, expect } from "bun:test"
import { LanguageModel } from "@opencode/ai/effect"
import { OpenAIChat } from "@opencode/ai/protocols/openai-chat"
import { TestLLM } from "@opencode/ai/testing"
import { Effect, Layer } from "effect"
import { Bus } from "@opencode/core/bus"
import { Config } from "@opencode/core/config"
import { Database } from "@opencode/core/database/database"
import { AppNodeBuilder } from "@opencode/core/effect/app-node-builder"
import { EffortEvidence } from "@opencode/core/effort/evidence"
import { EffortStore } from "@opencode/core/effort/store"
import { EffortTransition } from "@opencode/core/effort/transition"
import { Model } from "@opencode/core/model"
import { ProjectTable } from "@opencode/core/project/sql"
import { SessionRunnerModel } from "@opencode/core/session/runner/model"
import { SessionProjector } from "@opencode/core/session/projector"
import { SessionStore } from "@opencode/core/session/store"
import { SessionTable } from "@opencode/core/session/sql"
import { ConfigEffort } from "@opencode/schema/config/effort"
import { Document, Info } from "@opencode/schema/config"
import { Project } from "@opencode/schema/project"
import { Provider } from "@opencode/schema/provider"
import { AbsolutePath } from "@opencode/schema/schema"
import { SessionID } from "@opencode/schema/session-id"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { testEffect } from "../lib/effect"

const effortModel = Model.Info.default(Provider.ID.make("fake"), Model.ID.make("fake-model"))

const testLayers = (variants: string[], policy: ConfigEffort.Info) =>
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
              Effect.succeed({
                ...effortModel,
                variants: variants.map((id) => ({ id: Model.VariantID.make(id) })),
              }),
          }),
          Config.testLayer([new Document({ type: "document", info: new Info({ effort_policy: policy }) })]),
        ),
      ),
    ),
  )

const staticIt = testLayers(
  ["low", "high", "max"],
  new ConfigEffort.Info({ verification_commands: ["pnpm typecheck"] }),
)
const adaptiveIt = testLayers(
  ["low", "high", "max"],
  new ConfigEffort.Info({ verification_commands: ["pnpm typecheck"], mode: "adaptive", clean_passes: 2 }),
)
const unsupportedIt = testLayers(
  ["thinking"],
  new ConfigEffort.Info({ verification_commands: ["pnpm typecheck"] }),
)

const worktree = AbsolutePath.make("/work")

const seedSession = Effect.fn(function* (sessionID: SessionID) {
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
      model: { id: Model.ID.make("fake-model"), providerID: Provider.ID.make("fake") },
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

/** One settled configured verifier, classified and recorded through the real evidence path. */
const settle = (sessionID: SessionID, exit: number) =>
  Effect.gen(function* () {
    const database = yield* Database.Service
    const efforts = yield* EffortStore.Service
    const config = yield* Config.Service
    yield* EffortEvidence.observe(
      { db: database.db, efforts },
      Config.effortPolicy(yield* config.entries()),
      sessionID,
      { tool: "shell", input: { command: "pnpm typecheck" }, metadata: { exit } },
    )
  })

/**
 * A session reaches its first step with no `session_effort` row. The step
 * preparation path owns initialization, so the row must exist before any
 * settlement arrives; otherwise the evidence path has nowhere to write and a
 * verifier failure is silently dropped, leaving escalation unreachable.
 */
describe("EffortTransition row initialization", () => {
  staticIt.effect("records verifier evidence for a session that never transitioned", () =>
    Effect.gen(function* () {
      const d = yield* deps()
      const id = SessionID.make("ses_init_static")
      yield* seedSession(id)
      expect(yield* d.efforts.get(id)).toBeUndefined()

      yield* EffortTransition.apply(d, { sessionID: id, agent: "build", resolved: resolved() })

      const seeded = yield* d.efforts.get(id)
      expect(seeded?.baseLevel).toBe("standard")
      expect(seeded?.revision).toBe(0)

      yield* settle(id, 1)
      expect((yield* d.efforts.get(id))?.openFailure?.verifier).toBe("pnpm typecheck")

      yield* settle(id, 0)
      expect((yield* d.efforts.get(id))?.openFailure).toBeUndefined()
    }),
  )

  adaptiveIt.effect("seeds the adaptive level so a first failure can raise it", () =>
    Effect.gen(function* () {
      const d = yield* deps()
      const id = SessionID.make("ses_init_adaptive")
      yield* seedSession(id)
      expect(yield* d.efforts.get(id)).toBeUndefined()

      yield* EffortTransition.apply(d, { sessionID: id, agent: "build", resolved: resolved() })

      const seeded = yield* d.efforts.get(id)
      expect(seeded?.level).toBe("standard")
      expect(seeded?.cleanPasses).toBe(0)

      yield* settle(id, 1)
      const raised = yield* d.efforts.get(id)
      expect(raised?.level).toBe("deep")
      expect(raised?.openFailure?.verifier).toBe("pnpm typecheck")
    }),
  )

  unsupportedIt.effect("leaves a route without an effort knob uninitialized", () =>
    Effect.gen(function* () {
      const d = yield* deps()
      const id = SessionID.make("ses_init_unsupported")
      yield* seedSession(id)

      yield* EffortTransition.apply(d, { sessionID: id, agent: "build", resolved: resolved() })

      // The route advertises no reasoning effort, so escalation is meaningless
      // and no durable state is created. A settlement must stay a no-op.
      expect(yield* d.efforts.get(id)).toBeUndefined()
      yield* settle(id, 1)
      expect(yield* d.efforts.get(id)).toBeUndefined()
    }),
  )
})
