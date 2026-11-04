export * as TaskReport from "./report.js"

import { and, inArray } from "drizzle-orm"
import { Context, DateTime, Effect, Exit, Layer, Schema } from "effect"
import { Event } from "@opencode/schema/event"
import { SessionEvent } from "@opencode/schema/session-event"
import { SessionID } from "@opencode/schema/session-id"
import { Task } from "@opencode/schema/task"
import { TokenUsage } from "@opencode/schema/token-usage"
import { makeGlobalNode } from "@opencode/util/effect/app-node"
import { Database } from "../database/database.js"
import { EventTable } from "../event/sql.js"
import { SessionTable } from "../session/sql.js"
import { SessionTransfer } from "../session/transfer.js"
import { SessionUsageReport } from "../session/usage-report.js"
import { TaskStore } from "./task.js"

/**
 * Builds a task-level ledger from data the runtime already stores.
 *
 * Nothing here runs during a step. Aggregation reads the Session rollups, the settled
 * messages and the turn markers on demand, so the execution path pays nothing and no
 * model request is made. Timing is derived, never inferred: `wall_ms` spans the task,
 * `active_ms` sums settled assistant spans, and `turn_ms` sums idle-to-idle spans.
 */
export interface Interface {
  readonly build: (taskID: Task.ID) => Effect.Effect<Task.Summary, TaskStore.NotFoundError>
  readonly export: (input: {
    readonly taskIDs?: ReadonlyArray<Task.ID>
    readonly format: Task.ExportFormat
    readonly limit?: number
  }) => Effect.Effect<Task.Export>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/TaskReport") {}

const MAX_DEPTH = 8

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const tasks = yield* TaskStore.Service
    const transfer = yield* SessionTransfer.Service

    /** Root plus descendants, forks excluded so a forked copy never double counts. */
    const collect = Effect.fnUntraced(function* (root: SessionID) {
      const order: SessionID[] = [root]
      const seen = new Set<string>([root])
      let frontier: SessionID[] = [root]
      for (let depth = 0; depth < MAX_DEPTH && frontier.length > 0; depth++) {
        const children = yield* db
          .select({ id: SessionTable.id, fork: SessionTable.fork_session_id })
          .from(SessionTable)
          .where(inArray(SessionTable.parent_id, frontier))
          .all()
          .pipe(Effect.orDie)
        const next: SessionID[] = []
        for (const child of children) {
          if (seen.has(child.id)) continue
          seen.add(child.id)
          if (child.fork !== null) continue
          order.push(child.id)
          next.push(child.id)
        }
        frontier = next
      }
      return { ids: order, truncated: frontier.length > 0 }
    })

    const build = Effect.fn("TaskReport.build")(function* (taskID: Task.ID) {
      const task = yield* tasks.get(taskID)
      if (task === undefined) return yield* new TaskStore.NotFoundError({ taskID })
      const history = yield* tasks.history(taskID)
      const acceptance = history.at(-1)

      const tree = yield* collect(task.root_session_id)
      const exported = yield* Effect.forEach(
        tree.ids,
        (sessionID) => transfer.export({ sessionID }).pipe(Effect.catch(() => Effect.succeed(undefined))),
        { concurrency: 4 },
      )
      const present = exported.filter((value): value is NonNullable<typeof value> => value !== undefined)
      const skipped = tree.ids.length - present.length

      const ledger = SessionUsageReport.build({
        runs: [
          {
            task_id: task.id,
            policy: task.policy ?? "unspecified",
            root_session_id: task.root_session_id,
            ...(acceptance === undefined ? {} : { correctness: correctness(acceptance.outcome) }),
          },
        ],
        exports: present,
      }).runs[0]!

      const resume = yield* db
        .select({ id: SessionTable.id, resume_attempts: SessionTable.resume_attempts })
        .from(SessionTable)
        .where(inArray(SessionTable.id, tree.ids))
        .all()
        .pipe(Effect.orDie)
      const resumeByID = new Map(resume.map((row) => [row.id, row.resume_attempts]))

      const stepStartedType = Event.versionedType(
        SessionEvent.Step.Started.type,
        SessionEvent.Step.Started.durable.version,
      )
      const retryScheduledType = Event.versionedType(
        SessionEvent.RetryScheduled.type,
        SessionEvent.RetryScheduled.durable.version,
      )
      const events = yield* db
        .select({ type: EventTable.type })
        .from(EventTable)
        .where(
          and(
            inArray(EventTable.aggregate_id, tree.ids),
            inArray(EventTable.type, [stepStartedType, retryScheduledType]),
          ),
        )
        .all()
        .pipe(Effect.orDie)
      const requests = requestFacts({
        observed: ledger.attempts.steps,
        settled: ledger.attempts.settled_steps,
        unsettled: ledger.attempts.unsettled_steps,
        failed: failedSteps(present),
        stepStarted: events.filter((row) => row.type === stepStartedType).length,
        retryScheduled: events.filter((row) => row.type === retryScheduledType).length,
      })
      const unattributedTokens = Math.max(0, sessionGross(present) - messageGross(present))

      const timing = measure(present)
      const sessions = present
        .map((session) => {
          const turns = turnCounts(session.messages)
          return {
            id: session.info.id,
            ...(session.info.parentID === undefined ? {} : { parent_id: session.info.parentID }),
            ...(session.info.outcome === undefined ? {} : { outcome: session.info.outcome }),
            resume_attempts: resumeByID.get(session.info.id) ?? 0,
            turns,
            time: {
              created: session.info.time.created,
              updated: session.info.time.updated,
              ...(session.info.time.busy === undefined ? {} : { busy: session.info.time.busy }),
              ...(session.info.time.idle === undefined ? {} : { idle: session.info.time.idle }),
            },
          }
        })
        .sort((left, right) => left.time.created.pipe(DateTime.toEpochMillis) - right.time.created.pipe(DateTime.toEpochMillis))

      const sessionsComplete = !tree.truncated && skipped === 0
      const requestsComplete = ledger.attempts.unsettled_steps === 0 && sessionsComplete
      const usageComplete = ledger.completeness.usage_complete && requestsComplete
      const costComplete =
        ledger.cost.unpriced_records === 0 &&
        ledger.cost.provenance_mismatches === 0 &&
        ledger.cost.unattributed >= 0 &&
        ledger.attempts.unsettled_steps === 0 &&
        !ledger.completeness.reverted_activity &&
        ledger.sessions.missing.length === 0 &&
        !tree.truncated &&
        skipped === 0

      return Task.Summary.make({
        version: 2,
        task,
        ...(acceptance === undefined ? {} : { acceptance }),
        history: [...history],
        sessions,
        timing,
        usage: {
          requests,
          tokens: ledger.tokens,
          gross_tokens: ledger.tokens.gross,
          unattributed_tokens: unattributedTokens,
          cost: {
            total: ledger.cost.total,
            provider: ledger.cost.provider,
            estimated: ledger.cost.estimated,
            legacy_unknown: ledger.cost.legacy_unknown,
            unattributed: ledger.cost.unattributed,
            unpriced_records: ledger.cost.unpriced_records,
            provenance_mismatches: ledger.cost.provenance_mismatches,
          },
        },
        completeness: {
          sessions: sessionsComplete,
          requests: requestsComplete,
          usage: usageComplete,
          cost: costComplete,
          reconciled: costComplete && ledger.cost.unattributed === 0,
          billing_verified: false,
          reverted: ledger.completeness.reverted_activity,
          measured: ledger.attempts.steps > 0,
        },
      })
    })

    return Service.of({
      build,
      export: Effect.fn("TaskReport.export")(function* (input) {
        const ids =
          input.taskIDs ??
          (yield* tasks.list({ limit: input.limit ?? TaskStore.MAX_LIMIT })).map((task) => task.id)
        const truncated = input.taskIDs === undefined ? (yield* tasks.countRoots()) > ids.length : false
        const results = yield* Effect.forEach(ids, (id) => build(id).pipe(Effect.exit), { concurrency: 4 })
        const present = results.flatMap((result) => (Exit.isSuccess(result) ? [result.value] : []))
        return {
          format: input.format,
          data:
            input.format === "csv"
              ? csv(present)
              : JSON.stringify(Schema.encodeUnknownSync(Schema.Array(Task.Summary))(present), null, 2),
          count: present.length,
          skipped: results.length - present.length,
          truncated,
        }
      }),
    })
  }),
)

function correctness(outcome: Task.Outcome): "pass" | "fail" | undefined {
  if (outcome === "accepted") return "pass"
  if (outcome === "rejected") return "fail"
  return undefined
}

function turnCounts(messages: ReadonlyArray<{ readonly type: string; readonly outcome?: string }>) {
  const turns = { total: 0, succeeded: 0, failed: 0, interrupted: 0 }
  for (const message of messages) {
    if (message.type !== "idle") continue
    turns.total++
    if (message.outcome === "succeeded") turns.succeeded++
    else if (message.outcome === "failed") turns.failed++
    else if (message.outcome === "interrupted") turns.interrupted++
  }
  return turns
}

function failedSteps(exports: ReadonlyArray<SessionTransfer.Data>) {
  return exports.reduce(
    (count, session) =>
      count + session.messages.filter((message) => message.type === "assistant" && message.error !== undefined).length,
    0,
  )
}

/** Session rollup total, which includes retry attempts and auxiliary spend the messages cannot attribute. */
function sessionGross(exports: ReadonlyArray<SessionTransfer.Data>) {
  return exports.reduce((sum, session) => sum + TokenUsage.total(session.info.tokens), 0)
}

function messageGross(exports: ReadonlyArray<SessionTransfer.Data>) {
  return exports.reduce(
    (sum, session) =>
      sum +
      session.messages.reduce(
        (inner, message) =>
          inner + (message.type === "assistant" && message.tokens !== undefined ? TokenUsage.total(message.tokens) : 0),
        0,
      ),
    0,
  )
}

/**
 * Retries cannot be read from messages because a retried attempt reuses its row, so they
 * come from the durable event log. A log that misses an observed step is reported as null
 * rather than as a false zero.
 */
function requestFacts(input: {
  observed: number
  settled: number
  unsettled: number
  failed: number
  stepStarted: number
  retryScheduled: number
}): Task.Usage["requests"] {
  const base = {
    observed: input.observed,
    settled: input.settled,
    unsettled: input.unsettled,
    failed: input.failed,
  }
  const unusable = { provider_attempts: null, retries: null, unreconciled: null }
  if (input.stepStarted < input.observed) return { ...base, ...unusable }
  // A retry scheduled but interrupted during backoff is never dispatched, so `retries` can
  // exceed dispatched attempts and the residual clamps at zero.
  return {
    ...base,
    provider_attempts: input.stepStarted,
    retries: input.retryScheduled,
    unreconciled: Math.max(0, input.stepStarted - input.observed - input.retryScheduled),
  }
}

/** Wall clock, settled assistant spans, and idle-to-idle turn spans, all from stored timestamps. */
function measure(exports: ReadonlyArray<SessionTransfer.Data>) {
  let start = Number.POSITIVE_INFINITY
  let end = Number.NEGATIVE_INFINITY
  let active = 0
  let turn = 0
  for (const session of exports) {
    const created = DateTime.toEpochMillis(session.info.time.created)
    const updated = DateTime.toEpochMillis(session.info.time.updated)
    const idle = session.info.time.idle === undefined ? undefined : DateTime.toEpochMillis(session.info.time.idle)
    start = Math.min(start, created)
    end = Math.max(end, idle ?? updated)
    let boundary = created
    for (const message of session.messages) {
      if (message.type === "assistant") {
        const began = DateTime.toEpochMillis(message.time.created)
        if (message.time.completed !== undefined) {
          active += Math.max(0, DateTime.toEpochMillis(message.time.completed) - began)
        }
      }
      if (message.type === "idle") {
        const at = DateTime.toEpochMillis(message.time.created)
        turn += Math.max(0, at - boundary)
        boundary = at
      }
    }
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { wall_ms: 0, active_ms: 0, turn_ms: 0 }
  return { wall_ms: Math.max(0, end - start), active_ms: active, turn_ms: turn }
}

const CSV_HEADER = [
  "task_id",
  "root_session_id",
  "label",
  "policy",
  "acceptance",
  "acceptance_source",
  "acceptance_verification",
  "evidence_kind",
  "evidence_result",
  "sessions",
  "requests_observed",
  "requests_provider_attempts",
  "requests_settled",
  "requests_unsettled",
  "requests_failed",
  "requests_retries",
  "requests_unreconciled",
  "tokens_input",
  "tokens_output",
  "tokens_reasoning",
  "tokens_cache_read",
  "tokens_cache_write",
  "gross_tokens",
  "unattributed_tokens",
  "cost_total",
  "cost_provider",
  "cost_estimated",
  "cost_legacy_unknown",
  "cost_unattributed",
  "unpriced_records",
  "provenance_mismatches",
  "sessions_complete",
  "requests_complete",
  "usage_complete",
  "cost_complete",
  "measured",
  "wall_ms",
  "active_ms",
  "turn_ms",
  "root_outcome",
] as const

function csv(summaries: ReadonlyArray<Task.Summary>) {
  const lines = [CSV_HEADER.join(",")]
  for (const summary of summaries) {
    lines.push(
      [
        summary.task.id,
        summary.task.root_session_id,
        summary.task.label ?? "",
        summary.task.policy ?? "",
        summary.acceptance?.outcome ?? "unverified",
        summary.acceptance?.source ?? "",
        summary.acceptance?.verification ?? "unverified",
        summary.acceptance?.evidence?.kind ?? "",
        summary.acceptance?.evidence?.result ?? "",
        summary.sessions.length,
        summary.usage.requests.observed,
        summary.usage.requests.provider_attempts ?? "",
        summary.usage.requests.settled,
        summary.usage.requests.unsettled,
        summary.usage.requests.failed,
        summary.usage.requests.retries ?? "",
        summary.usage.requests.unreconciled ?? "",
        summary.usage.tokens.input,
        summary.usage.tokens.output,
        summary.usage.tokens.reasoning,
        summary.usage.tokens.cache.read,
        summary.usage.tokens.cache.write,
        summary.usage.gross_tokens,
        summary.usage.unattributed_tokens,
        summary.usage.cost.total,
        summary.usage.cost.provider,
        summary.usage.cost.estimated,
        summary.usage.cost.legacy_unknown,
        summary.usage.cost.unattributed,
        summary.usage.cost.unpriced_records,
        summary.usage.cost.provenance_mismatches,
        summary.completeness.sessions,
        summary.completeness.requests,
        summary.completeness.usage,
        summary.completeness.cost,
        summary.completeness.measured,
        summary.timing.wall_ms,
        summary.timing.active_ms,
        summary.timing.turn_ms,
        rootOutcome(summary),
      ]
        .map(cell)
        .join(","),
    )
  }
  return lines.join("\n")
}

/** The task's outcome is its root Session's, not whichever session was enumerated last. */
function rootOutcome(summary: Task.Summary) {
  return summary.sessions.find((session) => session.id === summary.task.root_session_id)?.outcome ?? ""
}

function cell(value: string | number | boolean) {
  const text = String(value)
  // A leading formula character would be executed by spreadsheet software, so force text.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

/** Instance-graph node so the server layer can require the report service. */
export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node, TaskStore.node, SessionTransfer.node] })
