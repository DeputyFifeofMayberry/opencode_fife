import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Database } from "@opencode/core/database/database"
import { ProjectTable } from "@opencode/core/project/sql"
import { SessionTable } from "@opencode/core/session/sql"
import { TaskStore } from "@opencode/core/telemetry/task"
import { Project } from "@opencode/schema/project"
import { AbsolutePath } from "@opencode/schema/schema"
import { SessionID } from "@opencode/schema/session-id"
import { Task } from "@opencode/schema/task"
import { Global } from "@opencode/util/global"
import { testEffect } from "../lib/effect"

const DatabaseLayer = Database.layer({ path: ":memory:" }).pipe(
  Layer.provide(Layer.succeed(Global.Service, Global.make({ data: process.cwd() }))),
)

const it = testEffect(Layer.mergeAll(DatabaseLayer, TaskStore.layer.pipe(Layer.provide(DatabaseLayer))))

const worktree = AbsolutePath.make("/work")

const seedSession = Effect.fn(function* (id: SessionID, parentID?: SessionID) {
  const database = yield* Database.Service
  yield* database.db
    .insert(ProjectTable)
    .values({ id: Project.ID.global, worktree, sandboxes: [] })
    .onConflictDoNothing()
    .run()
  yield* database.db
    .insert(SessionTable)
    .values({
      id,
      project_id: Project.ID.global,
      directory: worktree,
      slug: "task",
      version: "test",
      ...(parentID === undefined ? {} : { parent_id: parentID }),
    })
    .run()
})

describe("TaskStore", () => {
  it.effect("creates a task once and returns the same row on repeat", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore.Service
      const id = SessionID.make("ses_task_ensure")
      yield* seedSession(id)

      const first = yield* store.ensure({ sessionID: id, label: "first" })
      const second = yield* store.ensure({ sessionID: id })

      expect(second.id).toBe(first.id)
      expect(second.root_session_id).toBe(id)
      expect(second.label).toBe("first")
      expect(yield* store.list()).toHaveLength(1)
    }),
  )

  it.effect("anchors a child session to its root", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore.Service
      const root = SessionID.make("ses_task_root")
      const child = SessionID.make("ses_task_child")
      yield* seedSession(root)
      yield* seedSession(child, root)

      const task = yield* store.ensure({ sessionID: child })

      expect(task.root_session_id).toBe(root)
      expect(yield* store.findByRootSession(root)).toMatchObject({ id: task.id })
      expect(yield* store.findByRootSession(child)).toBeUndefined()
    }),
  )

  it.effect("rejects an unknown session instead of writing a dangling task", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore.Service
      const error = yield* store.ensure({ sessionID: SessionID.make("ses_task_missing") }).pipe(Effect.flip)
      expect(error._tag).toBe("Task.SessionNotFoundError")
    }),
  )

  it.effect("keeps acceptance append-only and reports the latest as current", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore.Service
      const id = SessionID.make("ses_task_accept")
      yield* seedSession(id)
      const task = yield* store.ensure({ sessionID: id })

      expect(yield* store.history(task.id)).toHaveLength(0)

      yield* store.record({ taskID: task.id, outcome: "rejected", note: "tests failed" })
      yield* store.record({ taskID: task.id, outcome: "accepted", source: "test", note: "suite green" })

      const history = yield* store.history(task.id)
      expect(history.map((entry) => entry.outcome)).toEqual(["rejected", "accepted"])
      expect(history[1]).toMatchObject({ source: "test", note: "suite green" })

      // A later unverified row resets the current outcome without erasing the history.
      yield* store.record({ taskID: task.id, outcome: "unverified" })
      expect((yield* store.history(task.id)).map((entry) => entry.outcome)).toEqual([
        "rejected",
        "accepted",
        "unverified",
      ])
    }),
  )

  it.effect("rejects acceptance for an unknown task", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore.Service
      const error = yield* store
        .record({ taskID: Task.ID.make("tsk_missing"), outcome: "accepted" })
        .pipe(Effect.flip)
      expect(error._tag).toBe("Task.NotFoundError")
    }),
  )

  it.effect("lists newest first and honours the limit", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore.Service
      for (const suffix of ["a", "b", "c"]) {
        const id = SessionID.make(`ses_task_list_${suffix}`)
        yield* seedSession(id)
        yield* store.ensure({ sessionID: id, label: suffix })
      }
      const all = yield* store.list()
      expect(all).toHaveLength(3)
      expect(yield* store.list({ limit: 2 })).toHaveLength(2)
    }),
  )

  it.effect("deletes the task with its session", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore.Service
      const database = yield* Database.Service
      const id = SessionID.make("ses_task_cascade")
      yield* seedSession(id)
      const task = yield* store.ensure({ sessionID: id })
      yield* database.db.delete(SessionTable).run()
      expect(yield* store.get(task.id)).toBeUndefined()
    }),
  )
})
