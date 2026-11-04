import { describe, expect } from "bun:test"
import { DateTime, Effect, Layer, Schema } from "effect"
import { Agent } from "@opencode/schema/agent"
import { AbsolutePath } from "@opencode/schema/schema"
import { Event } from "@opencode/schema/event"
import { Money } from "@opencode/schema/money"
import { Model } from "@opencode/schema/model"
import { Project } from "@opencode/schema/project"
import { Provider } from "@opencode/schema/provider"
import { Session } from "@opencode/schema/session"
import { SessionEvent } from "@opencode/schema/session-event"
import { SessionMessage } from "@opencode/schema/session-message"
import { SessionID } from "@opencode/schema/session-id"
import { Task } from "@opencode/schema/task"
import { TokenUsage } from "@opencode/schema/token-usage"
import { Global } from "@opencode/util/global"
import { Database } from "@opencode/core/database/database"
import { EventSequenceTable, EventTable } from "@opencode/core/event/sql"
import { ProjectTable } from "@opencode/core/project/sql"
import { NotFoundError } from "@opencode/core/session/error"
import { SessionTable } from "@opencode/core/session/sql"
import { SessionTransfer } from "@opencode/core/session/transfer"
import { TaskReport } from "@opencode/core/telemetry/report"
import { TaskStore } from "@opencode/core/telemetry/task"
import { testEffect } from "../lib/effect"

const fixtures = new Map<string, SessionTransfer.Data>()

const DatabaseLayer = Database.layer({ path: ":memory:" }).pipe(
  Layer.provide(Layer.succeed(Global.Service, Global.make({ data: process.cwd() }))),
)
const StoreLayer = TaskStore.layer.pipe(Layer.provide(DatabaseLayer))
const TransferLayer = Layer.succeed(
  SessionTransfer.Service,
  SessionTransfer.Service.of({
    export: ({ sessionID }) => {
      const data = fixtures.get(sessionID)
      return data === undefined ? Effect.fail(new NotFoundError({ sessionID })) : Effect.succeed(data)
    },
    import: () => Effect.die("import is not used by the task report"),
  }),
)
const ReportLayer = TaskReport.layer.pipe(Layer.provide(Layer.mergeAll(DatabaseLayer, StoreLayer, TransferLayer)))

const it = testEffect(Layer.mergeAll(DatabaseLayer, StoreLayer, TransferLayer, ReportLayer))

const worktree = AbsolutePath.make("/work")

const tokens = (input = 0, output = 0, reasoning = 0, read = 0, write = 0): TokenUsage.Info => ({
  input,
  output,
  reasoning,
  cache: { read, write },
})

const model = Model.Ref.make({ providerID: Provider.ID.make("fake"), id: Model.ID.make("fake-model") })

const seedSession = Effect.fn(function* (input: {
  id: string
  parentID?: string
  fork?: string
  resume?: number
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
      ...(input.resume === undefined ? {} : { resume_attempts: input.resume }),
    })
    .run()
})

function info(input: {
  id: string
  parentID?: string
  created: number
  updated: number
  idle?: number
  outcome?: "succeeded" | "failed" | "interrupted"
  cost?: number
  tokens?: TokenUsage.Info
}) {
  return Session.Info.make({
    id: Session.ID.make(input.id),
    ...(input.parentID === undefined ? {} : { parentID: Session.ID.make(input.parentID) }),
    projectID: Project.ID.global,
    cost: Money.USD.make(input.cost ?? 0),
    tokens: input.tokens ?? tokens(),
    ...(input.outcome === undefined ? {} : { outcome: input.outcome }),
    time: {
      created: DateTime.makeUnsafe(input.created),
      updated: DateTime.makeUnsafe(input.updated),
      ...(input.idle === undefined ? {} : { idle: DateTime.makeUnsafe(input.idle) }),
    },
    location: { directory: worktree },
  })
}

function assistant(input: {
  id: string
  created: number
  completed?: number
  cost?: number
  tokens?: TokenUsage.Info
  retry?: number
}) {
  return SessionMessage.Assistant.make({
    id: SessionMessage.ID.make(input.id),
    type: "assistant",
    agent: Agent.ID.make("build"),
    model,
    content: [],
    ...(input.cost === undefined ? {} : { cost: Money.USD.make(input.cost) }),
    ...(input.tokens === undefined ? {} : { tokens: input.tokens }),
    ...(input.retry === undefined
      ? {}
      : {
          retry: {
            attempt: input.retry,
            at: DateTime.makeUnsafe(input.created + 10),
            error: { type: "provider", message: "retry" },
          },
        }),
    time: {
      created: DateTime.makeUnsafe(input.created),
      ...(input.completed === undefined ? {} : { completed: DateTime.makeUnsafe(input.completed) }),
    },
  })
}

function idle(input: { id: string; created: number; outcome: "succeeded" | "failed" | "interrupted" }) {
  return SessionMessage.Idle.make({
    id: SessionMessage.ID.make(input.id),
    type: "idle",
    outcome: input.outcome,
    time: { created: DateTime.makeUnsafe(input.created) },
  })
}

function publish(input: { info: Session.Info; messages: ReadonlyArray<SessionMessage.Info> }) {
  fixtures.set(input.info.id, SessionTransfer.Data.make({ info: input.info, messages: input.messages }))
}

const stepStarted = Event.versionedType(SessionEvent.Step.Started.type, SessionEvent.Step.Started.durable.version)
const retryScheduled = Event.versionedType(
  SessionEvent.RetryScheduled.type,
  SessionEvent.RetryScheduled.durable.version,
)

const seedEvent = Effect.fn(function* (input: { sessionID: string; seq: number; type: string }) {
  const database = yield* Database.Service
  yield* database.db
    .insert(EventSequenceTable)
    .values({ aggregate_id: input.sessionID, seq: input.seq })
    .onConflictDoNothing()
    .run()
  yield* database.db
    .insert(EventTable)
    .values({
      id: Event.ID.create(),
      aggregate_id: input.sessionID,
      seq: input.seq,
      created: 0,
      type: input.type,
      data: {},
    })
    .run()
})

const taskFor = (sessionID: string) =>
  Effect.gen(function* () {
    const store = yield* TaskStore.Service
    return yield* store.ensure({ sessionID: SessionID.make(sessionID), label: "fixture", policy: "test" })
  })

const build = (taskID: Parameters<TaskReport.Interface["build"]>[0]) =>
  Effect.gen(function* () {
    const service = yield* TaskReport.Service
    return yield* service.build(taskID)
  })

describe("TaskReport timing and usage", () => {
  it.effect("derives requests, tokens, cost, and timing from stored data", () =>
    Effect.gen(function* () {
      fixtures.clear()
      yield* seedSession({ id: "ses_report_single" })
      publish({
        info: info({
          id: "ses_report_single",
          created: 1_000,
          updated: 5_000,
          idle: 5_000,
          outcome: "succeeded",
          cost: 0.75,
          tokens: tokens(100, 40, 10, 20, 5),
        }),
        messages: [
          assistant({ id: "msg_a1", created: 1_000, completed: 1_500, cost: 0.25, tokens: tokens(40, 20, 5, 10, 2) }),
          assistant({ id: "msg_a2", created: 2_000, completed: 3_000, cost: 0.5, tokens: tokens(60, 20, 5, 10, 3) }),
          idle({ id: "msg_i1", created: 5_000, outcome: "succeeded" }),
        ],
      })

      const task = yield* taskFor("ses_report_single")
      const report = yield* build(task.id)

      expect(report.usage.requests.observed).toBe(2)
      expect(report.usage.requests.retries).toBeNull()
      expect(report.usage.requests.provider_attempts).toBeNull()
      expect(report.usage.unattributed_tokens).toBe(0)
      expect(report.usage.tokens).toEqual(tokens(100, 40, 10, 20, 5))
      expect(report.usage.gross_tokens).toBe(175)
      expect(report.usage.cost.total).toBeCloseTo(0.75, 8)
      expect(report.usage.cost.unattributed).toBeCloseTo(0, 8)
      expect(report.timing).toEqual({ wall_ms: 4_000, active_ms: 1_500, turn_ms: 4_000 })
      expect(report.sessions).toHaveLength(1)
      expect(report.sessions[0]!.turns).toEqual({ total: 1, succeeded: 1, failed: 0, interrupted: 0 })
      expect(report.completeness.usage).toBe(true)
      expect(report.completeness.cost).toBe(true)
    }),
  )

  it.effect("aggregates a subagent once and never double counts", () =>
    Effect.gen(function* () {
      fixtures.clear()
      yield* seedSession({ id: "ses_report_root" })
      yield* seedSession({ id: "ses_report_child", parentID: "ses_report_root" })
      publish({
        info: info({ id: "ses_report_root", created: 1_000, updated: 2_000, cost: 1, tokens: tokens(10, 5, 1, 2, 1) }),
        messages: [assistant({ id: "msg_r", created: 1_000, completed: 1_500, cost: 1, tokens: tokens(10, 5, 1, 2, 1) })],
      })
      publish({
        info: info({
          id: "ses_report_child",
          parentID: "ses_report_root",
          created: 2_000,
          updated: 3_000,
          cost: 2,
          tokens: tokens(20, 10, 2, 4, 2),
        }),
        messages: [assistant({ id: "msg_c", created: 2_000, completed: 2_500, cost: 2, tokens: tokens(20, 10, 2, 4, 2) })],
      })

      const task = yield* taskFor("ses_report_root")
      const report = yield* build(task.id)

      expect(report.sessions.map((session) => String(session.id))).toEqual(["ses_report_root", "ses_report_child"])
      expect(report.usage.tokens).toEqual(tokens(30, 15, 3, 6, 3))
      expect(report.usage.cost.total).toBeCloseTo(3, 8)
      expect(report.usage.requests.observed).toBe(2)
      expect(report.timing.wall_ms).toBe(2_000)
    }),
  )

  it.effect("excludes a forked descendant so its spend is not attributed twice", () =>
    Effect.gen(function* () {
      fixtures.clear()
      yield* seedSession({ id: "ses_report_fork_root" })
      yield* seedSession({ id: "ses_report_fork_child", parentID: "ses_report_fork_root", fork: "ses_report_fork_root" })
      publish({
        info: info({ id: "ses_report_fork_root", created: 1_000, updated: 2_000, cost: 1, tokens: tokens(10) }),
        messages: [assistant({ id: "msg_fr", created: 1_000, completed: 1_100, cost: 1, tokens: tokens(10) })],
      })
      publish({
        info: info({ id: "ses_report_fork_child", created: 2_000, updated: 3_000, cost: 100, tokens: tokens(1_000) }),
        messages: [assistant({ id: "msg_fc", created: 2_000, completed: 2_100, cost: 100, tokens: tokens(1_000) })],
      })

      const task = yield* taskFor("ses_report_fork_root")
      const report = yield* build(task.id)

      expect(report.sessions.map((session) => String(session.id))).toEqual(["ses_report_fork_root"])
      expect(report.usage.cost.total).toBeCloseTo(1, 8)
    }),
  )

  it.effect("counts retries and resumed executions", () =>
    Effect.gen(function* () {
      fixtures.clear()
      yield* seedSession({ id: "ses_report_retry", resume: 2 })
      publish({
        info: info({ id: "ses_report_retry", created: 1_000, updated: 2_000, cost: 0.3, tokens: tokens(10) }),
        messages: [
          assistant({ id: "msg_retry", created: 1_000, completed: 1_200, cost: 0.3, tokens: tokens(10), retry: 3 }),
        ],
      })

      const task = yield* taskFor("ses_report_retry")
      // One dispatch plus two retries, all recorded in the durable event log.
      yield* Effect.forEach(
        [stepStarted, stepStarted, stepStarted, retryScheduled, retryScheduled],
        (type, index) => seedEvent({ sessionID: "ses_report_retry", seq: index + 1, type }),
        { discard: true },
      )
      const report = yield* build(task.id)

      expect(report.usage.requests.observed).toBe(1)
      expect(report.usage.requests.provider_attempts).toBe(3)
      expect(report.usage.requests.retries).toBe(2)
      expect(report.usage.requests.unreconciled).toBe(0)
      expect(report.sessions[0]!.resume_attempts).toBe(2)
    }),
  )

  it.effect("marks missing usage as incomplete instead of reporting a valid zero", () =>
    Effect.gen(function* () {
      fixtures.clear()
      yield* seedSession({ id: "ses_report_missing" })
      publish({
        info: info({ id: "ses_report_missing", created: 1_000, updated: 2_000 }),
        messages: [assistant({ id: "msg_missing", created: 1_000 })],
      })

      const task = yield* taskFor("ses_report_missing")
      const report = yield* build(task.id)

      expect(report.usage.requests.observed).toBe(1)
      expect(report.usage.tokens).toEqual(tokens())
      expect(report.completeness.usage).toBe(false)
      expect(report.completeness.cost).toBe(false)
    }),
  )

  it.effect("reports a session whose export is unavailable as incomplete", () =>
    Effect.gen(function* () {
      fixtures.clear()
      yield* seedSession({ id: "ses_report_gap_root" })
      yield* seedSession({ id: "ses_report_gap_child", parentID: "ses_report_gap_root" })
      publish({
        info: info({ id: "ses_report_gap_root", created: 1_000, updated: 2_000, cost: 1, tokens: tokens(10) }),
        messages: [assistant({ id: "msg_gap", created: 1_000, completed: 1_100, cost: 1, tokens: tokens(10) })],
      })
      // The child has no fixture, so its export fails and must not be invented.

      const task = yield* taskFor("ses_report_gap_root")
      const report = yield* build(task.id)

      expect(report.sessions).toHaveLength(1)
      expect(report.completeness.usage).toBe(false)
      expect(report.completeness.cost).toBe(false)
    }),
  )
})

describe("TaskReport acceptance", () => {
  it.effect("keeps acceptance independent of execution outcome and preserves history", () =>
    Effect.gen(function* () {
      fixtures.clear()
      yield* seedSession({ id: "ses_report_accept" })
      publish({
        info: info({
          id: "ses_report_accept",
          created: 1_000,
          updated: 2_000,
          idle: 2_000,
          outcome: "succeeded",
          cost: 1,
          tokens: tokens(10),
        }),
        messages: [assistant({ id: "msg_ok", created: 1_000, completed: 1_100, cost: 1, tokens: tokens(10) })],
      })

      const store = yield* TaskStore.Service
      const reportService = yield* TaskReport.Service
      const task = yield* taskFor("ses_report_accept")

      const before = yield* reportService.build(task.id)
      expect(before.acceptance).toBeUndefined()
      expect(before.history).toHaveLength(0)
      // The runtime says the turn succeeded, but that is not acceptance.
      expect(before.sessions[0]!.outcome).toBe("succeeded")

      yield* store.record({ taskID: task.id, outcome: "rejected", note: "missed a case" })
      const rejected = yield* reportService.build(task.id)
      expect(rejected.acceptance).toMatchObject({ outcome: "rejected", source: "user" })

      yield* store.record({ taskID: task.id, outcome: "accepted", source: "test", note: "suite green" })
      const accepted = yield* reportService.build(task.id)
      expect(accepted.acceptance).toMatchObject({ outcome: "accepted", source: "test" })
      expect(accepted.history.map((entry) => entry.outcome)).toEqual(["rejected", "accepted"])
    }),
  )
})

describe("TaskReport export", () => {
  it.effect("emits JSON and a CSV row with escaped values", () =>
    Effect.gen(function* () {
      fixtures.clear()
      yield* seedSession({ id: "ses_report_export" })
      publish({
        info: info({ id: "ses_report_export", created: 1_000, updated: 2_000, cost: 0.5, tokens: tokens(10, 2, 1, 3, 1) }),
        messages: [assistant({ id: "msg_export", created: 1_000, completed: 1_200, cost: 0.5, tokens: tokens(10, 2, 1, 3, 1) })],
      })
      const store = yield* TaskStore.Service
      const reportService = yield* TaskReport.Service
      const task = yield* store.ensure({ sessionID: SessionID.make("ses_report_export"), label: 'task, "quoted"' })
      yield* store.record({ taskID: task.id, outcome: "accepted" })

      const json = yield* reportService.export({ taskIDs: [task.id], format: "json" })
      const parsed = JSON.parse(json.data) as ReadonlyArray<{ task: { id: string }; acceptance?: { outcome: string } }>
      expect(parsed).toHaveLength(1)
      expect(parsed[0]!.task.id).toBe(task.id)
      expect(parsed[0]!.acceptance?.outcome).toBe("accepted")

      const csv = yield* reportService.export({ taskIDs: [task.id], format: "csv" })
      const rows = csv.data.trimEnd().split("\n")
      expect(rows[0]).toContain("task_id,root_session_id")
      expect(rows[1]).toContain('"task, ""quoted"""')
      expect(rows[1]).toContain(",accepted,user,")
      expect(rows[0]!.split(",")).toHaveLength(40)
      expect(rows[0]).toContain("measured")
      expect(rows[0]!.endsWith("root_outcome")).toBe(true)
    }),
  )

  it.effect("encodes export timestamps as epoch milliseconds", () =>
    Effect.gen(function* () {
      fixtures.clear()
      yield* seedSession({ id: "ses_report_json_time" })
      publish({
        info: info({ id: "ses_report_json_time", created: 1_000, updated: 2_000 }),
        messages: [],
      })
      const store = yield* TaskStore.Service
      const reportService = yield* TaskReport.Service
      const task = yield* store.ensure({ sessionID: SessionID.make("ses_report_json_time") })

      const json = yield* reportService.export({ taskIDs: [task.id], format: "json" })
      const parsed = JSON.parse(json.data) as ReadonlyArray<{ task: { time_created: unknown } }>
      expect(typeof parsed[0]!.task.time_created).toBe("number")
      expect(parsed[0]!.task.time_created).toBe(DateTime.toEpochMillis(task.time_created))
      expect(json.count).toBe(1)
      expect(json.skipped).toBe(0)

      const decoded = Schema.decodeUnknownSync(Schema.Array(Task.Summary))(JSON.parse(json.data))
      expect(decoded).toHaveLength(1)
      expect(decoded[0]!.task.id).toBe(task.id)
    }),
  )
})
