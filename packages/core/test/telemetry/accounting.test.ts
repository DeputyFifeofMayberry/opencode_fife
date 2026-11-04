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

const seedSession = Effect.fn(function* (input: { id: string; parentID?: string; fork?: string }) {
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
    })
    .run()
})

function info(input: {
  id: string
  parentID?: string
  created: number
  updated: number
  cost?: number
  tokens?: TokenUsage.Info
}) {
  return Session.Info.make({
    id: Session.ID.make(input.id),
    ...(input.parentID === undefined ? {} : { parentID: Session.ID.make(input.parentID) }),
    projectID: Project.ID.global,
    cost: Money.USD.make(input.cost ?? 0),
    tokens: input.tokens ?? tokens(),
    time: { created: DateTime.makeUnsafe(input.created), updated: DateTime.makeUnsafe(input.updated) },
    location: { directory: worktree },
  })
}

function assistant(input: {
  id: string
  created: number
  completed?: number
  cost?: number
  tokens?: TokenUsage.Info
  error?: { type: string; message: string }
}) {
  return SessionMessage.Assistant.make({
    id: SessionMessage.ID.make(input.id),
    type: "assistant",
    agent: Agent.ID.make("build"),
    model,
    content: [],
    ...(input.cost === undefined ? {} : { cost: Money.USD.make(input.cost) }),
    ...(input.tokens === undefined ? {} : { tokens: input.tokens }),
    ...(input.error === undefined ? {} : { error: input.error }),
    time: {
      created: DateTime.makeUnsafe(input.created),
      ...(input.completed === undefined ? {} : { completed: DateTime.makeUnsafe(input.completed) }),
    },
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

const build = (taskID: Task.ID) =>
  Effect.gen(function* () {
    const service = yield* TaskReport.Service
    return yield* service.build(taskID)
  })

describe("TaskReport request accounting", () => {
  it.effect("counts a failed step as observed, unsettled, and failed", () =>
    Effect.gen(function* () {
      fixtures.clear()
      yield* seedSession({ id: "ses_account_failed" })
      publish({
        info: info({ id: "ses_account_failed", created: 1_000, updated: 2_000 }),
        messages: [
          assistant({
            id: "msg_failed",
            created: 1_000,
            completed: 1_200,
            error: { type: "provider", message: "boom" },
          }),
        ],
      })

      const task = yield* taskFor("ses_account_failed")
      const report = yield* build(task.id)

      expect(report.usage.requests).toMatchObject({ observed: 1, settled: 0, unsettled: 1, failed: 1 })
    }),
  )

  it.effect("reconciles provider attempts and retries from the durable event log", () =>
    Effect.gen(function* () {
      fixtures.clear()
      yield* seedSession({ id: "ses_account_reconciled" })
      publish({
        info: info({ id: "ses_account_reconciled", created: 1_000, updated: 2_000, cost: 0.5, tokens: tokens(10) }),
        messages: [assistant({ id: "msg_reconciled", created: 1_000, completed: 1_200, cost: 0.5, tokens: tokens(10) })],
      })

      // One observed step, one initial dispatch and two retries: attempts = observed + retries.
      yield* Effect.forEach(
        [stepStarted, stepStarted, stepStarted, retryScheduled, retryScheduled],
        (type, index) => seedEvent({ sessionID: "ses_account_reconciled", seq: index + 1, type }),
        { discard: true },
      )

      const task = yield* taskFor("ses_account_reconciled")
      const report = yield* build(task.id)

      expect(report.usage.requests.provider_attempts).toBe(3)
      expect(report.usage.requests.retries).toBe(2)
      expect(report.usage.requests.unreconciled).toBe(0)
    }),
  )

  it.effect("clamps an interrupted retry backoff instead of discarding the whole log", () =>
    Effect.gen(function* () {
      fixtures.clear()
      yield* seedSession({ id: "ses_account_unusable" })
      publish({
        info: info({ id: "ses_account_unusable", created: 1_000, updated: 2_000 }),
        messages: [
          assistant({ id: "msg_unusable_a", created: 1_000, completed: 1_100 }),
          assistant({ id: "msg_unusable_b", created: 1_200, completed: 1_300 }),
        ],
      })
      yield* Effect.forEach(
        [stepStarted, stepStarted, stepStarted, retryScheduled, retryScheduled],
        (type, index) => seedEvent({ sessionID: "ses_account_unusable", seq: index + 1, type }),
        { discard: true },
      )

      const task = yield* taskFor("ses_account_unusable")
      const report = yield* build(task.id)

      expect(report.usage.requests.provider_attempts).toBe(3)
      expect(report.usage.requests.retries).toBe(2)
      expect(report.usage.requests.unreconciled).toBe(0)
    }),
  )

  it.effect("reports null for every event-derived count when the log is empty", () =>
    Effect.gen(function* () {
      fixtures.clear()
      yield* seedSession({ id: "ses_account_no_events" })
      publish({
        info: info({ id: "ses_account_no_events", created: 1_000, updated: 2_000, cost: 0.5, tokens: tokens(10) }),
        messages: [assistant({ id: "msg_no_events", created: 1_000, completed: 1_200, cost: 0.5, tokens: tokens(10) })],
      })

      const task = yield* taskFor("ses_account_no_events")
      const report = yield* build(task.id)

      expect(report.usage.requests.provider_attempts).toBeNull()
      expect(report.usage.requests.retries).toBeNull()
      expect(report.usage.requests.unreconciled).toBeNull()
    }),
  )

  it.effect("counts a duplicated message id once", () =>
    Effect.gen(function* () {
      fixtures.clear()
      yield* seedSession({ id: "ses_account_duplicate" })
      const message = assistant({ id: "msg_duplicate", created: 1_000, completed: 1_200, cost: 0.5, tokens: tokens(10) })
      publish({
        info: info({ id: "ses_account_duplicate", created: 1_000, updated: 2_000, cost: 0.5, tokens: tokens(10) }),
        messages: [message, message],
      })

      const task = yield* taskFor("ses_account_duplicate")
      const report = yield* build(task.id)

      expect(report.usage.requests.observed).toBe(1)
      expect(report.sessions).toHaveLength(1)
    }),
  )

  it.effect("excludes a forked child from aggregation", () =>
    Effect.gen(function* () {
      fixtures.clear()
      yield* seedSession({ id: "ses_account_fork_root" })
      yield* seedSession({ id: "ses_account_fork_child", parentID: "ses_account_fork_root", fork: "ses_account_fork_root" })
      publish({
        info: info({ id: "ses_account_fork_root", created: 1_000, updated: 2_000, cost: 1, tokens: tokens(10) }),
        messages: [assistant({ id: "msg_fork_root", created: 1_000, completed: 1_100, cost: 1, tokens: tokens(10) })],
      })
      publish({
        info: info({ id: "ses_account_fork_child", created: 2_000, updated: 3_000, cost: 100, tokens: tokens(1_000) }),
        messages: [
          assistant({ id: "msg_fork_child", created: 2_000, completed: 2_100, cost: 100, tokens: tokens(1_000) }),
        ],
      })

      const task = yield* taskFor("ses_account_fork_root")
      const report = yield* build(task.id)

      expect(report.sessions.map((session) => String(session.id))).toEqual(["ses_account_fork_root"])
      expect(report.usage.requests.observed).toBe(1)
    }),
  )

  it.effect("counts a root and its child once each", () =>
    Effect.gen(function* () {
      fixtures.clear()
      yield* seedSession({ id: "ses_account_tree_root" })
      yield* seedSession({ id: "ses_account_tree_child", parentID: "ses_account_tree_root" })
      publish({
        info: info({ id: "ses_account_tree_root", created: 1_000, updated: 2_000, cost: 1, tokens: tokens(10) }),
        messages: [assistant({ id: "msg_tree_root", created: 1_000, completed: 1_100, cost: 1, tokens: tokens(10) })],
      })
      publish({
        info: info({
          id: "ses_account_tree_child",
          parentID: "ses_account_tree_root",
          created: 2_000,
          updated: 3_000,
          cost: 2,
          tokens: tokens(20),
        }),
        messages: [assistant({ id: "msg_tree_child", created: 2_000, completed: 2_100, cost: 2, tokens: tokens(20) })],
      })

      const task = yield* taskFor("ses_account_tree_root")
      const report = yield* build(task.id)

      expect(report.sessions).toHaveLength(2)
      expect(report.usage.requests.observed).toBe(2)
    }),
  )

  it.effect("reports the session rollup residual as unattributed tokens", () =>
    Effect.gen(function* () {
      fixtures.clear()
      yield* seedSession({ id: "ses_account_residual" })
      publish({
        info: info({ id: "ses_account_residual", created: 1_000, updated: 2_000, cost: 1, tokens: tokens(60, 40) }),
        messages: [assistant({ id: "msg_residual", created: 1_000, completed: 1_200, cost: 1, tokens: tokens(20, 20) })],
      })

      const task = yield* taskFor("ses_account_residual")
      const report = yield* build(task.id)

      expect(report.usage.gross_tokens).toBe(100)
      expect(report.usage.unattributed_tokens).toBe(60)
    }),
  )

  it.effect("marks requests incomplete when an observed step is unsettled", () =>
    Effect.gen(function* () {
      fixtures.clear()
      yield* seedSession({ id: "ses_account_unsettled" })
      publish({
        info: info({ id: "ses_account_unsettled", created: 1_000, updated: 2_000, cost: 0.5, tokens: tokens(10) }),
        messages: [
          assistant({ id: "msg_settled", created: 1_000, completed: 1_100, cost: 0.5, tokens: tokens(10) }),
          assistant({ id: "msg_unsettled", created: 1_200, completed: 1_300 }),
        ],
      })

      const task = yield* taskFor("ses_account_unsettled")
      const report = yield* build(task.id)

      expect(report.usage.requests).toMatchObject({ observed: 2, settled: 1, unsettled: 1 })
      expect(report.completeness.requests).toBe(false)
    }),
  )

  it.effect("marks sessions incomplete when the tree exceeds the depth limit", () =>
    Effect.gen(function* () {
      fixtures.clear()
      const chain = Array.from({ length: 9 }, (_, index) => `ses_account_depth_${index + 1}`)
      yield* seedSession({ id: "ses_account_depth_root" })
      yield* Effect.forEach(
        chain,
        (id, index) =>
          seedSession({ id, parentID: index === 0 ? "ses_account_depth_root" : chain[index - 1]! }),
        { discard: true },
      )
      // The report walks eight levels below the root, so the ninth descendant is never reached.
      const tree = ["ses_account_depth_root", ...chain.slice(0, 8)]
      yield* Effect.forEach(
        tree,
        (id, index) =>
          Effect.sync(() =>
            publish({
              info: info({
                id,
                ...(index === 0 ? {} : { parentID: tree[index - 1]! }),
                created: 1_000 + index * 10,
                updated: 2_000 + index * 10,
              }),
              messages: [],
            }),
          ),
        { discard: true },
      )

      const task = yield* taskFor("ses_account_depth_root")
      const report = yield* build(task.id)

      expect(report.sessions).toHaveLength(9)
      expect(report.completeness.sessions).toBe(false)
    }),
  )

  it.effect("exports numeric millisecond timestamps that decode back as summaries", () =>
    Effect.gen(function* () {
      fixtures.clear()
      yield* seedSession({ id: "ses_account_export" })
      publish({
        info: info({ id: "ses_account_export", created: 1_000, updated: 2_000, cost: 0.5, tokens: tokens(10) }),
        messages: [assistant({ id: "msg_export", created: 1_000, completed: 1_200, cost: 0.5, tokens: tokens(10) })],
      })
      const task = yield* taskFor("ses_account_export")
      const reportService = yield* TaskReport.Service

      const json = yield* reportService.export({ taskIDs: [task.id], format: "json" })
      const parsed = JSON.parse(json.data) as ReadonlyArray<{ task: { time_created: unknown } }>

      expect(typeof parsed[0]!.task.time_created).toBe("number")
      const decoded = Schema.decodeUnknownSync(Schema.Array(Task.Summary))(JSON.parse(json.data))
      expect(decoded).toHaveLength(1)
      expect(decoded[0]!.task.id).toBe(task.id)
    }),
  )
})
