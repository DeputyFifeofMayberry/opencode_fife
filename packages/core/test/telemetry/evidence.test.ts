import { describe, expect } from "bun:test"
import { eq } from "drizzle-orm"
import { Effect, Layer, Schema } from "effect"
import { Database } from "@opencode/core/database/database"
import { ProjectTable } from "@opencode/core/project/sql"
import { SessionTable } from "@opencode/core/session/sql"
import { TaskAcceptanceTable } from "@opencode/core/telemetry/sql"
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

const seedSession = Effect.fn(function* (id: SessionID) {
  const database = yield* Database.Service
  yield* database.db
    .insert(ProjectTable)
    .values({ id: Project.ID.global, worktree, sandboxes: [] })
    .onConflictDoNothing()
    .run()
  yield* database.db
    .insert(SessionTable)
    .values({ id, project_id: Project.ID.global, directory: worktree, slug: "task", version: "test" })
    .run()
})

const taskFor = (id: SessionID) =>
  Effect.gen(function* () {
    const store = yield* TaskStore.Service
    yield* seedSession(id)
    return yield* store.ensure({ sessionID: id })
  })

const latest = (taskID: Task.ID) =>
  Effect.gen(function* () {
    const store = yield* TaskStore.Service
    const history = yield* store.history(taskID)
    return history.at(-1)!
  })

describe("TaskStore acceptance verification", () => {
  it.effect("verifies a command the recorder executed and saw pass", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore.Service
      const task = yield* taskFor(SessionID.make("ses_evidence_command"))

      yield* store.record({
        taskID: task.id,
        outcome: "accepted",
        source: "command",
        evidence: { kind: "command", reference: "bun test", result: "passed", executed: true },
      })

      expect((yield* latest(task.id)).verification).toBe("verified")
    }),
  )

  it.effect("declares artifact evidence that was not executed", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore.Service
      const task = yield* taskFor(SessionID.make("ses_evidence_artifact"))

      yield* store.record({
        taskID: task.id,
        outcome: "accepted",
        evidence: { kind: "artifact", reference: "reports/qa.json", result: "unknown", executed: false },
      })

      expect((yield* latest(task.id)).verification).toBe("declared")
    }),
  )

  it.effect("declares artifact evidence even when it claims to be executed", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore.Service
      const task = yield* taskFor(SessionID.make("ses_evidence_artifact_executed"))

      yield* store.record({
        taskID: task.id,
        outcome: "accepted",
        evidence: { kind: "artifact", reference: "reports/qa.json", result: "passed", executed: true },
      })

      expect((yield* latest(task.id)).verification).toBe("declared")
    }),
  )

  it.effect("marks a command the recorder executed but saw fail as executed", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore.Service
      const task = yield* taskFor(SessionID.make("ses_evidence_command_failed"))

      yield* store.record({
        taskID: task.id,
        outcome: "rejected",
        source: "command",
        evidence: { kind: "command", reference: "bun test", result: "failed", executed: true },
      })

      expect((yield* latest(task.id)).verification).toBe("executed")
    }),
  )

  it.effect("rejects an empty evidence reference at the wire boundary", () =>
    Effect.sync(() => {
      expect(() =>
        Schema.decodeUnknownSync(Task.Evidence)({
          kind: "artifact",
          reference: "",
          result: "unknown",
          executed: false,
        }),
      ).toThrow()
    }),
  )

  it.effect("attests user evidence", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore.Service
      const task = yield* taskFor(SessionID.make("ses_evidence_user"))

      yield* store.record({
        taskID: task.id,
        outcome: "accepted",
        evidence: { kind: "user", reference: "reviewed by hand", result: "unknown", executed: false },
      })

      expect((yield* latest(task.id)).verification).toBe("attested")
    }),
  )

  it.effect("attests a user source with no evidence", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore.Service
      const task = yield* taskFor(SessionID.make("ses_evidence_user_source"))

      yield* store.record({ taskID: task.id, outcome: "accepted", source: "user" })

      expect((yield* latest(task.id)).verification).toBe("attested")
    }),
  )

  it.effect("leaves a test source with no evidence unverified", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore.Service
      const task = yield* taskFor(SessionID.make("ses_evidence_test_source"))

      yield* store.record({ taskID: task.id, outcome: "accepted", source: "test" })

      expect((yield* latest(task.id)).verification).toBe("unverified")
    }),
  )

  it.effect("reads a legacy row with null evidence columns as unverified", () =>
    Effect.gen(function* () {
      const database = yield* Database.Service
      const task = yield* taskFor(SessionID.make("ses_evidence_legacy"))
      yield* database.db
        .insert(TaskAcceptanceTable)
        .values({
          id: "tac_legacy",
          task_id: task.id,
          outcome: "accepted",
          source: "test",
          note: "written before evidence existed",
        })
        .run()

      const row = yield* database.db
        .select()
        .from(TaskAcceptanceTable)
        .where(eq(TaskAcceptanceTable.id, "tac_legacy"))
        .get()
      expect(row).toMatchObject({
        evidence_kind: null,
        evidence_reference: null,
        evidence_result: null,
        evidence_executed: null,
        evidence_duration_ms: null,
      })
      expect((yield* latest(task.id)).verification).toBe("unverified")
    }),
  )

  it.effect("keeps two outcomes in history with the latest current", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore.Service
      const task = yield* taskFor(SessionID.make("ses_evidence_history"))

      yield* store.record({ taskID: task.id, outcome: "rejected", note: "first pass" })
      yield* store.record({
        taskID: task.id,
        outcome: "accepted",
        source: "command",
        evidence: { kind: "command", reference: "bun test", result: "passed", executed: true },
      })

      const history = yield* store.history(task.id)
      expect(history.map((entry) => entry.outcome)).toEqual(["rejected", "accepted"])
      expect(history.at(-1)).toMatchObject({ outcome: "accepted", verification: "verified" })
    }),
  )

  it.effect("persists every concurrent record call", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore.Service
      const task = yield* taskFor(SessionID.make("ses_evidence_concurrent"))

      yield* Effect.forEach(
        Array.from({ length: 6 }, (_, index) => index),
        (index) => store.record({ taskID: task.id, outcome: "accepted", note: `run ${index}` }),
        { concurrency: "unbounded" },
      )

      expect(yield* store.history(task.id)).toHaveLength(6)
    }),
  )

  it.effect("round-trips duration_ms only when it is present", () =>
    Effect.gen(function* () {
      const store = yield* TaskStore.Service
      const task = yield* taskFor(SessionID.make("ses_evidence_duration"))

      yield* store.record({
        taskID: task.id,
        outcome: "accepted",
        evidence: { kind: "command", reference: "bun test", result: "passed", executed: true, duration_ms: 1_234 },
      })
      yield* store.record({
        taskID: task.id,
        outcome: "accepted",
        evidence: { kind: "command", reference: "bun test", result: "passed", executed: true },
      })

      const history = yield* store.history(task.id)
      expect(history[0]!.evidence?.duration_ms).toBe(1_234)
      expect(history[1]!.evidence?.duration_ms).toBeUndefined()
    }),
  )
})
