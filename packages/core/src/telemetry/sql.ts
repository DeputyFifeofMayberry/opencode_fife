import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import { SessionID } from "@opencode/schema/session-id"
import { Task } from "@opencode/schema/task"
import { Timestamps } from "../database/schema.sql.js"
import { SessionTable } from "../session/sql.js"

/**
 * One row per root Session. The row is created lazily by the first task operation, so a
 * Session that nobody measures costs nothing and the execution path stays untouched.
 */
export const TaskTable = sqliteTable(
  "task",
  {
    id: text().$type<Task.ID>().primaryKey(),
    root_session_id: text()
      .$type<SessionID>()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    label: text(),
    policy: text(),
    ...Timestamps,
  },
  (table) => [
    uniqueIndex("task_root_session_idx").on(table.root_session_id),
    index("task_time_created_idx").on(table.time_created),
  ],
)

/**
 * Append-only acceptance history. The latest row is the current outcome; earlier rows stay
 * so rework and repeated verification attempts remain visible instead of being overwritten.
 */
export const TaskAcceptanceTable = sqliteTable(
  "task_acceptance",
  {
    id: text().primaryKey(),
    task_id: text()
      .$type<Task.ID>()
      .notNull()
      .references(() => TaskTable.id, { onDelete: "cascade" }),
    outcome: text().$type<Task.Outcome>().notNull(),
    source: text().$type<Task.Source>().notNull(),
    note: text(),
    evidence_kind: text().$type<Task.EvidenceKind>(),
    evidence_reference: text(),
    evidence_result: text().$type<Task.EvidenceResult>(),
    evidence_executed: integer({ mode: "boolean" }),
    evidence_duration_ms: integer(),
    ...Timestamps,
  },
  (table) => [index("task_acceptance_task_idx").on(table.task_id, table.time_created, table.id)],
)
