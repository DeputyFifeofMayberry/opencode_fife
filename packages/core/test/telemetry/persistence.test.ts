import { describe, expect } from "bun:test"
import path from "path"
import { DateTime, Effect, Layer } from "effect"
import { Database } from "@opencode/core/database/database"
import { ProjectTable } from "@opencode/core/project/sql"
import { SessionTable } from "@opencode/core/session/sql"
import { TaskStore } from "@opencode/core/telemetry/task"
import { Project } from "@opencode/schema/project"
import { AbsolutePath } from "@opencode/schema/schema"
import { SessionID } from "@opencode/schema/session-id"
import { Global } from "@opencode/util/global"
import { withTempDir } from "../fixture/tmpdir"
import { it } from "../lib/effect"

const worktree = AbsolutePath.make("/work")

// Builds the store over its own file connection and releases the connection when the
// body finishes, so the second call reopens the same file instead of reusing a handle.
const withStore = <A, E>(
  input: { readonly filename: string; readonly data: string },
  body: Effect.Effect<A, E, TaskStore.Service | Database.Service>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const database = Database.layer({ path: input.filename }).pipe(
        Layer.provide(Layer.succeed(Global.Service, Global.make({ data: input.data }))),
      )
      const context = yield* Layer.build(TaskStore.layer.pipe(Layer.provideMerge(database)))
      return yield* body.pipe(Effect.provide(context))
    }),
  )

describe("TaskStore persistence", () => {
  it.live("round-trips a task and its acceptance history through a file database", () =>
    withTempDir((tmp) =>
      Effect.gen(function* () {
        const filename = path.join(tmp.path, "telemetry.sqlite")
        const sessionID = SessionID.make("ses_persist_root")

        const written = yield* withStore(
          { filename, data: tmp.path },
          Effect.gen(function* () {
            const store = yield* TaskStore.Service
            const database = yield* Database.Service
            yield* database.db
              .insert(ProjectTable)
              .values({ id: Project.ID.global, worktree, sandboxes: [] })
              .onConflictDoNothing()
              .run()
            yield* database.db
              .insert(SessionTable)
              .values({ id: sessionID, project_id: Project.ID.global, directory: worktree, slug: "task", version: "test" })
              .run()
            const task = yield* store.ensure({ sessionID, label: "persisted", policy: "test" })
            yield* store.record({ taskID: task.id, outcome: "rejected", note: "first pass" })
            yield* store.record({
              taskID: task.id,
              outcome: "accepted",
              source: "command",
              note: "second pass",
              evidence: { kind: "command", reference: "bun test", result: "passed", executed: true },
            })
            return { id: task.id, created: DateTime.toEpochMillis(task.time_created) }
          }),
        )

        const reopened = yield* withStore(
          { filename, data: tmp.path },
          Effect.gen(function* () {
            const store = yield* TaskStore.Service
            return { task: yield* store.get(written.id), history: yield* store.history(written.id) }
          }),
        )

        expect(reopened.task).toMatchObject({
          id: written.id,
          root_session_id: sessionID,
          label: "persisted",
          policy: "test",
        })
        expect(DateTime.toEpochMillis(reopened.task!.time_created)).toBe(written.created)
        expect(reopened.history.map((entry) => entry.outcome)).toEqual(["rejected", "accepted"])
        expect(reopened.history.map((entry) => entry.verification)).toEqual(["attested", "verified"])
        expect(reopened.history.map((entry) => entry.note)).toEqual(["first pass", "second pass"])
      }),
    ),
  )
})
