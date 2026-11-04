export * as TaskStore from "./task.js"

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import { Context, DateTime, Effect, Layer, Schema } from "effect"
import { ascending } from "@opencode/schema/identifier"
import { SessionID } from "@opencode/schema/session-id"
import { Task } from "@opencode/schema/task"
import { makeGlobalNode } from "@opencode/util/effect/app-node"
import { Database } from "../database/database.js"
import { SessionTable } from "../session/sql.js"
import { TaskAcceptanceTable, TaskTable } from "./sql.js"

/** A task row no longer exists, or never did. */
export class NotFoundError extends Schema.TaggedError<NotFoundError>()("Task.NotFoundError", {
  taskID: Task.ID,
}) {}

/** The Session a task would anchor to does not exist. */
export class SessionNotFoundError extends Schema.TaggedError<SessionNotFoundError>()(
  "Task.SessionNotFoundError",
  { sessionID: SessionID },
) {}

/**
 * Discovery identity: `tsk_` + the root Session ID. A manual ID is `tsk_` plus 26
 * alphanumerics whose first 12 are hex, so the `s` of a Session ID cannot collide.
 */
export function deterministicID(root: SessionID): Task.ID {
  return Task.ID.make("tsk_" + root)
}

export interface Interface {
  /**
   * Returns the task anchored to the Session's root, creating it on first use.
   *
   * The row is created lazily so a Session nobody measures costs nothing and the
   * execution path never touches task storage. A child Session resolves to its root, so
   * a subagent's Session always lands on the task that spawned it.
   */
  readonly ensure: (input: {
    readonly sessionID: SessionID
    readonly label?: string
    readonly policy?: string
  }) => Effect.Effect<Task.Info, SessionNotFoundError>
  /**
   * Creates a task row for every eligible root Session that lacks one, then returns the
   * discovered tasks. Existing rows are never rewritten, so a manual label, policy, or
   * acceptance history survives.
   */
  readonly discover: (input?: { readonly limit?: number }) => Effect.Effect<ReadonlyArray<Task.Info>>
  /** Eligible root Sessions, ignoring any limit, so an export can report truncation. */
  readonly countRoots: () => Effect.Effect<number>
  /** Appends one acceptance outcome. The latest row is current; earlier rows are history. */
  readonly record: (input: {
    readonly taskID: Task.ID
    readonly outcome: Task.Outcome
    readonly source?: Task.Source
    readonly note?: string
    readonly evidence?: Task.Evidence
  }) => Effect.Effect<Task.Info, NotFoundError>
  readonly get: (taskID: Task.ID) => Effect.Effect<Task.Info | undefined>
  readonly findByRootSession: (sessionID: SessionID) => Effect.Effect<Task.Info | undefined>
  readonly list: (input?: { readonly limit?: number }) => Effect.Effect<ReadonlyArray<Task.Info>>
  /** Every acceptance row for a task, oldest first. */
  readonly history: (taskID: Task.ID) => Effect.Effect<ReadonlyArray<Task.Acceptance>>
  /** The root Session of any Session, following parent links; absent when the Session is unknown. */
  readonly rootOf: (sessionID: SessionID) => Effect.Effect<SessionID | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/TaskStore") {}

const DEFAULT_LIMIT = 50
export const MAX_LIMIT = 500
const MAX_DEPTH = 32

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service

    /** Discovery and truncation counting must agree, so both use this predicate. */
    const eligibleRoot = and(
      isNull(SessionTable.parent_id),
      isNull(SessionTable.fork_session_id),
      isNull(SessionTable.time_archived),
    )

    const fromRow = (row: typeof TaskTable.$inferSelect): Task.Info => ({
      id: row.id,
      root_session_id: row.root_session_id,
      ...(row.label === null ? {} : { label: row.label }),
      ...(row.policy === null ? {} : { policy: row.policy }),
      time_created: DateTime.makeUnsafe(row.time_created),
      time_updated: DateTime.makeUnsafe(row.time_updated),
    })

    const fromAcceptance = (row: typeof TaskAcceptanceTable.$inferSelect): Task.Acceptance => {
      const evidence = fromEvidence(row)
      return {
        outcome: row.outcome,
        source: row.source,
        ...(row.note === null ? {} : { note: row.note }),
        ...(evidence === undefined ? {} : { evidence }),
        verification: verificationOf(evidence, row.source),
        time_created: DateTime.makeUnsafe(row.time_created),
      }
    }

    const byRoot = Effect.fnUntraced(function* (sessionID: SessionID) {
      const row = yield* db
        .select()
        .from(TaskTable)
        .where(eq(TaskTable.root_session_id, sessionID))
        .get()
        .pipe(Effect.orDie)
      return row === undefined ? undefined : fromRow(row)
    })

    const get = Effect.fnUntraced(function* (taskID: Task.ID) {
      const row = yield* db.select().from(TaskTable).where(eq(TaskTable.id, taskID)).get().pipe(Effect.orDie)
      return row === undefined ? undefined : fromRow(row)
    })

    const rootOf = Effect.fnUntraced(function* (sessionID: SessionID) {
      let current: SessionID | undefined = sessionID
      for (let depth = 0; depth < MAX_DEPTH && current !== undefined; depth++) {
        const row: { id: SessionID; parent_id: SessionID | null } | undefined = yield* db
          .select({ id: SessionTable.id, parent_id: SessionTable.parent_id })
          .from(SessionTable)
          .where(eq(SessionTable.id, current))
          .get()
          .pipe(Effect.orDie)
        if (row === undefined) return undefined
        if (row.parent_id === null) return row.id
        current = row.parent_id
      }
      return undefined
    })

    const discover = Effect.fn("TaskStore.discover")(function* (input?: { readonly limit?: number }) {
      const limit = clampLimit(input?.limit)
      const roots = yield* db
        .select({ id: SessionTable.id, time_created: SessionTable.time_created })
        .from(SessionTable)
        .where(eligibleRoot)
        .orderBy(desc(SessionTable.time_created), desc(SessionTable.id))
        .limit(limit)
        .all()
        .pipe(Effect.orDie)
      if (roots.length === 0) return []
      const rootIDs = roots.map((root) => root.id)
      const existing = yield* db
        .select({ root_session_id: TaskTable.root_session_id })
        .from(TaskTable)
        .where(inArray(TaskTable.root_session_id, rootIDs))
        .all()
        .pipe(Effect.orDie)
      const known = new Set(existing.map((row) => row.root_session_id))
      const missing = roots.filter((root) => !known.has(root.id))
      if (missing.length > 0)
        yield* db
          .insert(TaskTable)
          .values(
            missing.map((root) => ({
              id: deterministicID(root.id),
              root_session_id: root.id,
              label: null,
              policy: null,
              time_created: root.time_created,
              time_updated: root.time_created,
            })),
          )
          .onConflictDoNothing()
          .run()
          .pipe(Effect.orDie)
      const rows = yield* db
        .select()
        .from(TaskTable)
        .where(inArray(TaskTable.root_session_id, rootIDs))
        .all()
        .pipe(Effect.orDie)
      const position = new Map(roots.map((root, index) => [root.id, index]))
      return rows
        .toSorted(
          (left, right) =>
            (position.get(left.root_session_id) ?? Number.MAX_SAFE_INTEGER) -
            (position.get(right.root_session_id) ?? Number.MAX_SAFE_INTEGER),
        )
        .map(fromRow)
    })

    const countRoots = Effect.fn("TaskStore.countRoots")(function* () {
      const row = yield* db
        .select({ count: sql<number>`count(*)` })
        .from(SessionTable)
        .where(eligibleRoot)
        .get()
        .pipe(Effect.orDie)
      return row?.count ?? 0
    })

    return Service.of({
      rootOf,
      get,
      findByRootSession: byRoot,
      ensure: Effect.fn("TaskStore.ensure")(function* (input) {
        const root = yield* rootOf(input.sessionID)
        if (root === undefined) return yield* new SessionNotFoundError({ sessionID: input.sessionID })

        const existing = yield* byRoot(root)
        if (existing !== undefined) {
          const label = input.label ?? existing.label
          const policy = input.policy ?? existing.policy
          if (label === existing.label && policy === existing.policy) return existing
          yield* db
            .update(TaskTable)
            .set({ label: label ?? null, policy: policy ?? null })
            .where(eq(TaskTable.id, existing.id))
            .run()
            .pipe(Effect.orDie)
          return { ...existing, ...(label === undefined ? {} : { label }), ...(policy === undefined ? {} : { policy }) }
        }

        const id = deterministicID(root)
        yield* db
          .insert(TaskTable)
          .values({
            id,
            root_session_id: root,
            label: input.label ?? null,
            policy: input.policy ?? null,
          })
          .onConflictDoNothing()
          .run()
          .pipe(Effect.orDie)
        const created = yield* byRoot(root)
        if (created === undefined) return yield* Effect.die("task row vanished after insert")
        return created
      }),
      record: Effect.fn("TaskStore.record")(function* (input) {
        const task = yield* get(input.taskID)
        if (task === undefined) return yield* new NotFoundError({ taskID: input.taskID })
        const evidence = input.evidence
        yield* db
          .insert(TaskAcceptanceTable)
          .values({
            id: "tac_" + ascending(),
            task_id: task.id,
            outcome: input.outcome,
            source: input.source ?? "user",
            note: input.note ?? null,
            evidence_kind: evidence?.kind ?? null,
            evidence_reference: evidence?.reference ?? null,
            evidence_result: evidence?.result ?? null,
            evidence_executed: evidence?.executed ?? null,
            evidence_duration_ms: evidence?.duration_ms ?? null,
          })
          .run()
          .pipe(Effect.orDie)
        return task
      }),
      discover,
      countRoots,
      list: Effect.fn("TaskStore.list")(function* (input) {
        return yield* discover(input)
      }),
      history: Effect.fn("TaskStore.history")(function* (taskID) {
        const rows = yield* db
          .select()
          .from(TaskAcceptanceTable)
          .where(eq(TaskAcceptanceTable.task_id, taskID))
          .orderBy(asc(TaskAcceptanceTable.time_created), asc(TaskAcceptanceTable.id))
          .all()
          .pipe(Effect.orDie)
        return rows.map(fromAcceptance)
      }),
    })
  }),
)

/** Instance-graph node so the server layer can require the store. */
export const node = makeGlobalNode({ service: Service, layer, deps: [Database.node] })

function clampLimit(limit: number | undefined) {
  return Math.min(MAX_LIMIT, Math.max(1, limit ?? DEFAULT_LIMIT))
}

function fromEvidence(row: typeof TaskAcceptanceTable.$inferSelect): Task.Evidence | undefined {
  if (
    row.evidence_kind === null ||
    row.evidence_reference === null ||
    row.evidence_result === null ||
    row.evidence_executed === null
  )
    return undefined
  return {
    kind: row.evidence_kind,
    reference: row.evidence_reference,
    result: row.evidence_result,
    executed: row.evidence_executed,
    ...(row.evidence_duration_ms === null ? {} : { duration_ms: row.evidence_duration_ms }),
  }
}

/**
 * A legacy row has no evidence columns, so it can never become `verified`. Only a
 * command this subsystem executed and saw pass reaches that level; a command it ran
 * that failed is `executed`, not `declared`, because the run did happen.
 */
function verificationOf(evidence: Task.Evidence | undefined, source: Task.Source): Task.Verification {
  if (evidence === undefined) return source === "user" ? "attested" : "unverified"
  if (evidence.kind === "user") return "attested"
  if (evidence.kind === "command" && evidence.executed) return evidence.result === "passed" ? "verified" : "executed"
  return "declared"
}
