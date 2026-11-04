import { SessionID } from "@opencode/schema/session-id"
import { Task } from "@opencode/schema/task"
import { TaskReport } from "@opencode/core/telemetry/report"
import { TaskStore } from "@opencode/core/telemetry/task"
import { SessionNotFoundError, TaskNotFoundError } from "@opencode/protocol/errors"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Api } from "../api"

/**
 * Task routes are cold paths. They read stored Sessions and acceptance rows; none of them
 * touches the model, the prompt, or the execution loop.
 */
export const TaskHandler = HttpApiBuilder.group(Api, "server.task", (handlers) =>
  Effect.succeed(
    handlers
      .handle(
        "task.list",
        Effect.fn("server.task.list")(function* (input: { readonly query: { readonly limit?: number } }) {
          const store = yield* TaskStore.Service
          return [...(yield* store.list({ ...(input.query.limit === undefined ? {} : { limit: input.query.limit }) }))]
        }),
      )
      .handle(
        "task.ensure",
        Effect.fn("server.task.ensure")(function* (input: {
          readonly payload: {
            readonly sessionID: SessionID
            readonly label?: string
            readonly policy?: string
          }
        }) {
          const store = yield* TaskStore.Service
          return yield* store.ensure(input.payload).pipe(
            Effect.mapError(
              (error) => new SessionNotFoundError({ sessionID: error.sessionID, message: "Session not found" }),
            ),
          )
        }),
      )
      .handle(
        "task.get",
        Effect.fn("server.task.get")(function* (input: { readonly params: { readonly taskID: Task.ID } }) {
          const report = yield* TaskReport.Service
          return yield* report.build(input.params.taskID).pipe(
            Effect.mapError((error) => new TaskNotFoundError({ taskID: error.taskID, message: "Task not found" })),
          )
        }),
      )
      .handle(
        "task.record",
        Effect.fn("server.task.record")(function* (input: {
          readonly params: { readonly taskID: Task.ID }
          readonly payload: {
            readonly outcome: Task.Outcome
            readonly source?: Task.Source
            readonly note?: string
            readonly evidence?: Task.Evidence
          }
        }) {
          const store = yield* TaskStore.Service
          return yield* store.record({ taskID: input.params.taskID, ...input.payload }).pipe(
            Effect.mapError((error) => new TaskNotFoundError({ taskID: error.taskID, message: "Task not found" })),
          )
        }),
      )
      .handle(
        "task.export",
        Effect.fn("server.task.export")(function* (input: {
          readonly query: { readonly format: Task.ExportFormat; readonly limit?: number }
        }) {
          const report = yield* TaskReport.Service
          return yield* report.export({
            format: input.query.format,
            ...(input.query.limit === undefined ? {} : { limit: input.query.limit }),
          })
        }),
      ),
  ),
)
