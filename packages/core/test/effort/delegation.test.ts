import { describe, expect, it as bunIt } from "bun:test"
import { Effect, Layer } from "effect"
import { Config } from "@opencode/core/config"
import { Database } from "@opencode/core/database/database"
import { EffortDelegation, operationFor } from "@opencode/core/effort/delegation"
import { EffortStore } from "@opencode/core/effort/store"
import { ProjectTable } from "@opencode/core/project/sql"
import { SessionTable } from "@opencode/core/session/sql"
import { ConfigEffort } from "@opencode/schema/config/effort"
import { Document, Info } from "@opencode/schema/config"
import { Project } from "@opencode/schema/project"
import { AbsolutePath } from "@opencode/schema/schema"
import { SessionID } from "@opencode/schema/session-id"
import { Global } from "@opencode/util/global"
import { testEffect } from "../lib/effect"

const overrides = { reviewer: "mechanical", planner: "plan" } as const

const DatabaseLayer = Database.layer({ path: ":memory:" }).pipe(
  Layer.provide(Layer.succeed(Global.Service, Global.make({ data: process.cwd() }))),
)

const it = testEffect(
  Layer.mergeAll(
    DatabaseLayer,
    EffortStore.layer.pipe(Layer.provide(DatabaseLayer)),
    Config.testLayer([
      new Document({
        type: "document",
        info: new Info({
          effort_policy: new ConfigEffort.Info({ agent_operations: { ...overrides } }),
        }),
      }),
    ]),
  ),
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
    .values({ id: sessionID, project_id: Project.ID.global, directory: worktree, slug: "effort", version: "test" })
})

describe("operationFor", () => {
  bunIt("maps built-in agents and honors config overrides", () => {
    expect(operationFor("plan")).toBe("plan")
    expect(operationFor("review")).toBe("review")
    expect(operationFor("explore")).toBe("explore")
    expect(operationFor("general")).toBe("general")
    expect(operationFor("build")).toBe("implement")
    expect(operationFor("reviewer", overrides)).toBe("mechanical")
    expect(operationFor("planner", overrides)).toBe("plan")
    expect(operationFor("custom", overrides)).toBe("general")
  })
})

describe("EffortDelegation.seed", () => {
  it.effect("seeds the operation start level as the child's base", () => {
    return Effect.gen(function* () {
      const efforts = yield* EffortStore.Service
      const config = yield* Config.Service
      const policy = Config.latest(yield* config.entries(), "effort_policy")
      const id = SessionID.make("ses_delegation_reviewer")
      yield* seedSession(id)
      // reviewer maps through config overrides to mechanical: low.
      yield* EffortDelegation.seed(
        { efforts, overrides: policy?.agent_operations },
        { sessionID: id, agent: "reviewer", inheritedVariants: [] },
      )
      expect((yield* efforts.get(id))?.baseLevel).toBe("low")

      const id2 = SessionID.make("ses_delegation_plan")
      yield* seedSession(id2)
      // Without overrides the built-in map applies: plan starts deep.
      yield* EffortDelegation.seed({ efforts }, { sessionID: id2, agent: "plan", inheritedVariants: [] })
      expect((yield* efforts.get(id2))?.baseLevel).toBe("deep")
    })
  })

  it.effect("never floors an explicit or inherited pick", () => {
    return Effect.gen(function* () {
      const efforts = yield* EffortStore.Service
      const config = yield* Config.Service
      const policy = Config.latest(yield* config.entries(), "effort_policy")
      const id = SessionID.make("ses_delegation_inherited")
      yield* seedSession(id)
      yield* EffortDelegation.seed(
        { efforts, overrides: policy?.agent_operations },
        { sessionID: id, agent: "plan", inheritedVariants: [undefined, undefined, "low"] },
      )
      expect(yield* efforts.get(id)).toBeUndefined()
    })
  })

  it.effect("keeps existing state", () => {
    return Effect.gen(function* () {
      const efforts = yield* EffortStore.Service
      const id = SessionID.make("ses_delegation_existing")
      yield* seedSession(id)
      yield* efforts.set({ sessionID: id, baseLevel: "low", revision: 3 })
      yield* EffortDelegation.seed({ efforts }, { sessionID: id, agent: "plan", inheritedVariants: [] })
      const row = yield* efforts.get(id)
      expect(row?.baseLevel).toBe("low")
      expect(row?.revision).toBe(3)
    })
  })
})
