import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { Database } from "@opencode/core/database/database"
import { ProjectTable } from "@opencode/core/project/sql"
import { SessionTable } from "@opencode/core/session/sql"
import { TaskAcceptanceTable, TaskTable } from "@opencode/core/telemetry/sql"
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

const seedSession = Effect.fn(function* (input: {
  id: string
  parentID?: string
  fork?: string
  archived?: boolean
  created?: number
}) {
  const database = yield* Database.Service
  yield* database.db
    .insert(ProjectTable)
    .values({ id: Project.ID.global, worktree, sandboxes: [] })
    .onConflictDoNothing()
    .run()
  yield* database.db
    .insert(SessionTable)
    .values({
      id: SessionID.make(input.id),
      project_id: Project.ID.global,
      directory: worktree,
      slug: "task",
      version: "test",
      ...(input.parentID === undefined ? {} : { parent_id: SessionID.make(input.parentID) }),
      ...(input.fork === undefined ? {} : { fork_session_id: SessionID.make(input.fork) }),
      ...(input.archived === undefined ? {} : { time_archived: input.archived ? 1_000 : null }),
      ...(input.created === undefined ? {} : { time_created: input.created }),
    })
    .run()
})

describe("TaskStore.discover", () => {
  it.effect("discovers an eligible root with a deterministic id", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore.Service
      const id = SessionID.make("ses_discover_root")
      yield* seedSession({ id })

      const tasks = yield* store.discover()

      expect(tasks).toHaveLength(1)
      expect(String(tasks[0]!.id)).toBe(`tsk_${id}`)
      expect(tasks[0]!.root_session_id).toBe(id)
    }),
  )

  it.effect("counts every eligible root regardless of the discovery limit", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore.Service
      yield* seedSession({ id: "ses_count_root" })
      yield* seedSession({ id: "ses_count_child", parentID: "ses_count_root" })
      yield* seedSession({ id: "ses_count_fork", fork: "ses_count_root" })
      yield* seedSession({ id: "ses_count_archived", archived: true })

      expect(yield* store.countRoots()).toBe(1)
    }),
  )

  it.effect("returns identical ids on repeat and never duplicates a row", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore.Service
      yield* seedSession({ id: "ses_discover_repeat" })

      const first = yield* store.discover()
      const second = yield* store.discover()

      expect(second.map((task) => task.id)).toEqual(first.map((task) => task.id))
      expect(yield* store.list()).toHaveLength(1)
    }),
  )

  it.effect("skips child sessions", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore.Service
      yield* seedSession({ id: "ses_discover_parent" })
      yield* seedSession({ id: "ses_discover_child", parentID: "ses_discover_parent" })

      const tasks = yield* store.discover()

      expect(tasks.map((task) => String(task.root_session_id))).toEqual(["ses_discover_parent"])
      expect(yield* store.findByRootSession(SessionID.make("ses_discover_child"))).toBeUndefined()
    }),
  )

  it.effect("skips forks that have no parent", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore.Service
      yield* seedSession({ id: "ses_discover_fork", fork: "ses_discover_origin" })

      expect(yield* store.discover()).toHaveLength(0)
    }),
  )

  it.effect("skips archived sessions", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore.Service
      yield* seedSession({ id: "ses_discover_archived", archived: true })

      expect(yield* store.discover()).toHaveLength(0)
    }),
  )

  it.effect("preserves a manually registered task and its acceptance history", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore.Service
      const database = yield* Database.Service
      const root = SessionID.make("ses_discover_manual")
      const manual = Task.ID.make("tsk_manual_keep")
      yield* seedSession({ id: root })
      yield* database.db
        .insert(TaskTable)
        .values({
          id: manual,
          root_session_id: root,
          label: "manual",
          policy: "custom",
          time_created: 5,
          time_updated: 5,
        })
        .run()
      yield* database.db
        .insert(TaskAcceptanceTable)
        .values({ id: "tac_manual_keep", task_id: manual, outcome: "accepted", source: "user", note: "kept" })
        .run()

      const tasks = yield* store.discover()

      expect(tasks).toHaveLength(1)
      expect(tasks[0]).toMatchObject({ id: manual, label: "manual", policy: "custom" })
      expect(yield* store.history(manual)).toHaveLength(1)
    }),
  )

  it.effect("converges on one row per root under concurrent discovery", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore.Service
      const roots = ["ses_concurrent_a", "ses_concurrent_b", "ses_concurrent_c", "ses_concurrent_d"]
      yield* Effect.forEach(roots, (id) => seedSession({ id }), { discard: true })

      const runs = yield* Effect.forEach(Array.from({ length: 8 }), () => store.discover(), {
        concurrency: "unbounded",
      })

      expect(runs.every((tasks) => tasks.length === roots.length)).toBe(true)
      const listed = yield* store.list()
      expect(listed).toHaveLength(roots.length)
      expect(new Set(listed.map((task) => task.id)).size).toBe(roots.length)
    }),
  )

  it.effect("orders by root session recency and honours the limit", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore.Service
      yield* seedSession({ id: "ses_order_a", created: 1_000 })
      yield* seedSession({ id: "ses_order_b", created: 2_000 })
      yield* seedSession({ id: "ses_order_c", created: 3_000 })

      const all = yield* store.discover()
      expect(all.map((task) => String(task.root_session_id))).toEqual([
        "ses_order_c",
        "ses_order_b",
        "ses_order_a",
      ])

      const limited = yield* store.discover({ limit: 2 })
      expect(limited.map((task) => String(task.root_session_id))).toEqual(["ses_order_c", "ses_order_b"])
    }),
  )

  it.effect("deletes the task and its acceptance rows with the root session", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore.Service
      const database = yield* Database.Service
      const root = SessionID.make("ses_discover_cascade")
      yield* seedSession({ id: root })
      const task = yield* store.ensure({ sessionID: root })
      yield* store.record({ taskID: task.id, outcome: "accepted" })

      yield* database.db.delete(SessionTable).run()

      expect(yield* store.get(task.id)).toBeUndefined()
      expect(yield* store.history(task.id)).toHaveLength(0)
      expect(yield* database.db.select().from(TaskTable).all()).toHaveLength(0)
      expect(yield* database.db.select().from(TaskAcceptanceTable).all()).toHaveLength(0)
    }),
  )

  it.effect("anchors ensure to the root for a child and to itself for a fork", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore.Service
      const root = SessionID.make("ses_anchor_root")
      const child = SessionID.make("ses_anchor_child")
      const fork = SessionID.make("ses_anchor_fork")
      yield* seedSession({ id: root })
      yield* seedSession({ id: child, parentID: root })
      yield* seedSession({ id: fork, fork: root })

      const childTask = yield* store.ensure({ sessionID: child })
      expect(childTask.root_session_id).toBe(root)

      const forkTask = yield* store.ensure({ sessionID: fork })
      expect(forkTask.root_session_id).toBe(fork)
      expect(String(forkTask.id)).toBe(`tsk_${fork}`)
    }),
  )
})
