import { describe, expect } from "bun:test"
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
