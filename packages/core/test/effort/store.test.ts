import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { eq } from "drizzle-orm"
import { Database } from "@opencode/core/database/database"
import { EffortStore } from "@opencode/core/effort/store"
import { ProjectTable } from "@opencode/core/project/sql"
import { SessionTable } from "@opencode/core/session/sql"
import { Project } from "@opencode/schema/project"
import { AbsolutePath } from "@opencode/schema/schema"
import { SessionID } from "@opencode/schema/session-id"
import { Global } from "@opencode/util/global"
import path from "node:path"
import { tmpdir } from "../fixture/tmpdir"
import { Config } from "@opencode/core/config"
import { EffortEvidence } from "@opencode/core/effort/evidence"
import { ConfigEffort } from "@opencode/schema/config/effort"
import { Document, Info } from "@opencode/schema/config"
import { testEffect } from "../lib/effect"

const DatabaseLayer = Database.layer({ path: ":memory:" }).pipe(
  Layer.provide(Layer.succeed(Global.Service, Global.make({ data: process.cwd() }))),
)

const it = testEffect(Layer.mergeAll(DatabaseLayer, EffortStore.layer.pipe(Layer.provide(DatabaseLayer))))

const seed = Effect.fn(function* (sessionID: SessionID) {
  const database = yield* Database.Service
  const worktree = AbsolutePath.make("/work")
  yield* database.db.insert(ProjectTable).values({ id: Project.ID.global, worktree, sandboxes: [] }).run()
  yield* database.db
    .insert(SessionTable)
    .values({ id: sessionID, project_id: Project.ID.global, directory: worktree, slug: "effort", version: "test" })
    .run()
})

describe("EffortStore", () => {
  it.effect("round-trips state and reports absent sessions as undefined", () => {
    return Effect.gen(function* () {
      const store = yield* EffortStore.Service
      const id = SessionID.make("ses_effort_roundtrip")
      yield* seed(id)
      expect(yield* store.get(id)).toBeUndefined()

      const openFailure = { verifier: "pwsh\0pnpm typecheck\0/work", sequence: 4, revision: 7 }
      yield* store.set({
        sessionID: id,
        baseLevel: "low",
        openFailure,
        revision: 7,
        lastAppliedVariant: "high",
        level: "standard",
        cleanPasses: 1,
      })
      expect(yield* store.get(id)).toEqual({
        sessionID: id,
        baseLevel: "low",
        openFailure,
        revision: 7,
        lastAppliedVariant: "high",
        level: "standard",
        cleanPasses: 1,
      })

      yield* store.setLevel(id, "low", 0)
      const stepped = yield* store.get(id)
      expect(stepped?.level).toBe("low")
      expect(stepped?.cleanPasses).toBe(0)

      yield* store.setVerdict(id, { revision: 7, digest: "abc123" })
      const verdict = yield* store.get(id)
      expect(verdict?.verdictRevision).toBe(7)
      expect(verdict?.verdictDigest).toBe("abc123")

      yield* store.set({ sessionID: id, baseLevel: "standard", revision: 7 })
      const cleared = yield* store.get(id)
      expect(cleared?.openFailure).toBeUndefined()
      expect(cleared?.lastAppliedVariant).toBeUndefined()
      expect(cleared?.level).toBeUndefined()
      expect(cleared?.cleanPasses).toBe(0)
      // The verdict columns survive a baseline rewrite; only a new verdict replaces them.
      expect(cleared?.verdictRevision).toBe(7)
      expect(cleared?.verdictDigest).toBe("abc123")
    })
  })

  it.effect("counts every concurrent revision bump", () => {
    return Effect.gen(function* () {
      const store = yield* EffortStore.Service
      const id = SessionID.make("ses_effort_revision")
      yield* seed(id)
      yield* store.set({ sessionID: id, baseLevel: "standard", revision: 0 })
      yield* Effect.all(
        Array.from({ length: 8 }, () => store.bumpRevision(id)),
        { concurrency: "unbounded", discard: true },
      )
      expect((yield* store.get(id))?.revision).toBe(8)
    })
  })

  it.effect("invalidates all sessions in the same workspace", () =>
    Effect.gen(function* () {
      const db = (yield* Database.Service).db
      const store = yield* EffortStore.Service
      const first = SessionID.make("ses_effort_workspace_first")
      const second = SessionID.make("ses_effort_workspace_second")
      const other = SessionID.make("ses_effort_workspace_other")
      yield* seed(first)
      yield* db.insert(SessionTable).values([
        { id: second, project_id: Project.ID.global, directory: AbsolutePath.make("/work"), slug: "second", version: "test" },
        { id: other, project_id: Project.ID.global, directory: AbsolutePath.make("/other"), slug: "other", version: "test" },
      ]).run()
      for (const sessionID of [first, second, other])
        yield* store.set({ sessionID, baseLevel: "standard", level: "deep", cleanPasses: 1, revision: 0 })
      yield* store.bumpWorkspaceRevision(first)
      expect((yield* store.get(first))?.revision).toBe(1)
      expect((yield* store.get(second))?.revision).toBe(1)
      expect((yield* store.get(second))?.cleanPasses).toBe(0)
      expect((yield* store.get(other))?.revision).toBe(0)
      expect((yield* store.get(other))?.cleanPasses).toBe(1)
    }),
  )

  it.effect("removes state with its session", () => {
    return Effect.gen(function* () {
      const database = yield* Database.Service
      const store = yield* EffortStore.Service
      const id = SessionID.make("ses_effort_cascade")
      yield* seed(id)
      yield* store.set({ sessionID: id, baseLevel: "low", revision: 1 })
      yield* database.db.delete(SessionTable).where(eq(SessionTable.id, id)).run()
      expect(yield* store.get(id)).toBeUndefined()
    })
  })
})


test("adaptive failure and clean-pass state survives closing and reopening the database", async () => {
  await using tmp = await tmpdir()
  const file = path.join(tmp.path, "effort.db")
  const database = Database.layer({ path: file }).pipe(Layer.provide(Layer.succeed(Global.Service, Global.make({ data: tmp.path }))))
  const layer = Layer.mergeAll(database, EffortStore.layer.pipe(Layer.provide(database)), Config.testLayer([
    new Document({ type: "document", info: new Info({ effort_policy: new ConfigEffort.Info({ mode: "adaptive", clean_passes: 2, verification_commands: ["bun test"] }) }) }),
  ]))
  const id = SessionID.make("ses_effort_reopen")
  const phase = (run: Effect.Effect<void, unknown, Database.Service | EffortStore.Service | Config.Service>) =>
    Effect.runPromise(run.pipe(Effect.provide(layer), Effect.scoped))
  const observe = (exit: number) => Effect.gen(function* () {
    yield* EffortEvidence.observe({ db: (yield* Database.Service).db, efforts: yield* EffortStore.Service, config: yield* Config.Service }, id,
      { tool: "shell", input: { command: "bun test" }, metadata: { exit } })
  })
  await phase(Effect.gen(function* () {
    yield* seed(id)
    const store = yield* EffortStore.Service
    yield* store.set({ sessionID: id, baseLevel: "standard", revision: 0, level: "standard", cleanPasses: 0 })
    yield* observe(1)
    expect((yield* store.get(id))?.level).toBe("deep")
  }))
  await phase(Effect.gen(function* () {
    const store = yield* EffortStore.Service
    expect((yield* store.get(id))?.openFailure?.verifier).toBe("bun test")
    yield* observe(0)
    expect((yield* store.get(id))?.cleanPasses).toBe(1)
  }))
  await phase(Effect.gen(function* () {
    const store = yield* EffortStore.Service
    expect((yield* store.get(id))?.level).toBe("deep")
    expect((yield* store.get(id))?.cleanPasses).toBe(1)
    yield* observe(0)
    expect((yield* store.get(id))?.level).toBe("standard")
  }))
})
