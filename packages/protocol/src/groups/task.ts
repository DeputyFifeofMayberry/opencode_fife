import { SessionID } from "@opencode/schema/session-id"
import { Task } from "@opencode/schema/task"
import { NonNegativeInt, optional } from "@opencode/schema/schema"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { SessionNotFoundError, TaskNotFoundError } from "../errors.js"

const EnsureInput = Schema.Struct({
  sessionID: SessionID,
  label: Schema.String.pipe(optional),
  policy: Schema.String.pipe(optional),
}).annotate({ identifier: "Task.EnsureInput" })

const ListQuery = Schema.Struct({
  limit: Schema.NumberFromString.pipe(Schema.decodeTo(NonNegativeInt), Schema.optional).annotate({
    description: "Maximum number of tasks to return. Defaults to 50; values above 500 are clamped.",
  }),
}).annotate({ identifier: "Task.ListQuery" })

const RecordInput = Schema.Struct({
  outcome: Task.Outcome,
  source: Task.Source.pipe(optional),
  note: Schema.String.pipe(optional),
  evidence: Task.Evidence.pipe(optional),
}).annotate({ identifier: "Task.RecordInput" })

const ExportQuery = Schema.Struct({
  format: Task.ExportFormat,
  limit: Schema.NumberFromString.pipe(Schema.decodeTo(NonNegativeInt), Schema.optional).annotate({
    description: "Maximum number of tasks to export. Defaults to 50; values above 500 are clamped.",
  }),
}).annotate({ identifier: "Task.ExportQuery" })

const params = { taskID: Task.ID }

const annotations = (method: string, summary: string, description: string) =>
  OpenApi.annotations({ identifier: `experimental.task.${method}`, summary, description })

/**
 * Task-level measurement. Every route is a cold path: it reads stored Sessions and
 * acceptance rows, never a model. Recording an outcome is the only write, and it never
 * happens automatically when a Session finishes.
 */
export const TaskGroup = HttpApiGroup.make("server.task")
  .add(
    HttpApiEndpoint.get("task.list", "/api/experimental/task", {
      query: ListQuery,
      success: Schema.Array(Task.Info),
    }).annotateMerge(
      annotations("list", "List tasks", "List measured tasks, newest first. Use limit to cap the page size."),
    ),
    HttpApiEndpoint.post("task.ensure", "/api/experimental/task", {
      payload: EnsureInput,
      success: Task.Info,
      error: SessionNotFoundError,
    }).annotateMerge(
      annotations(
        "ensure",
        "Create or return a task",
        "Anchor a task to the root of the given Session. Idempotent; a child Session resolves to its root.",
      ),
    ),
    HttpApiEndpoint.get("task.get", "/api/experimental/task/:taskID", {
      params,
      success: Task.Summary,
      error: TaskNotFoundError,
    }).annotateMerge(
      annotations(
        "get",
        "Read a task summary",
        "Aggregate the task's Sessions, usage, cost, timing and acceptance history from stored data.",
      ),
    ),
    HttpApiEndpoint.post("task.record", "/api/experimental/task/:taskID/acceptance", {
      params,
      payload: RecordInput,
      success: Task.Info,
      error: TaskNotFoundError,
    }).annotateMerge(
      annotations(
        "record",
        "Record an acceptance outcome",
        "Append an explicit accepted, rejected or unverified outcome. Completion never records acceptance. Evidence is optional and determines the derived verification level.",
      ),
    ),
    HttpApiEndpoint.get("task.export", "/api/experimental/task/export", {
      query: ExportQuery,
      success: Task.Export,
    }).annotateMerge(
      annotations("export", "Export task rows", "Serialize task summaries as JSON or one CSV row per task. Use limit to cap the export."),
    ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "task",
      description: "Experimental task-level measurement routes.",
    }),
  )
