import { OpenCode } from "@opencode/client"
import { Service } from "@opencode/client/effect/service"
import { Task } from "@opencode/schema/task"
import { Effect, Option } from "effect"
import { EOL } from "node:os"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { ServerConnection } from "../../../services/server-connection"
import { errorMessage } from "../../../util/error"

const outcomes = ["accepted", "rejected", "unverified"] as const
type Outcome = (typeof outcomes)[number]

const parse = (value: string): Outcome | undefined =>
  (outcomes as ReadonlyArray<string>).includes(value) ? (value as Outcome) : undefined

const execute = async (command: string): Promise<Task.Evidence> => {
  const started = performance.now()
  const shell = process.platform === "win32" ? [process.env.COMSPEC ?? "cmd.exe", "/c"] : ["/bin/sh", "-c"]
  const child = Bun.spawn([...shell, command], { stdin: "inherit", stdout: "inherit", stderr: "inherit" })
  const exitCode = await child.exited
  return {
    kind: "command",
    reference: command,
    result: exitCode === 0 ? "passed" : "failed",
    executed: true,
    duration_ms: Math.round(performance.now() - started),
  }
}

export default Runtime.handler(Commands.commands.task.commands.outcome, (input) =>
  Effect.gen(function* () {
    const outcome = parse(input.outcome)
    if (outcome === undefined)
      return yield* Effect.fail(new Error(`Unknown outcome "${input.outcome}". Use accepted, rejected, or unverified.`))
    const evidenceKind = Option.getOrUndefined(input.evidenceKind)
    const evidenceRef = Option.getOrUndefined(input.evidenceRef)
    const evidenceResult = Option.getOrUndefined(input.evidenceResult)
    const run = Option.getOrUndefined(input.run)
    if (run !== undefined && (evidenceKind !== undefined || evidenceRef !== undefined))
      return yield* Effect.fail(
        new Error("--run records its own command evidence; do not pass --evidence-kind or --evidence-ref."),
      )
    if (run !== undefined && evidenceResult !== undefined)
      return yield* Effect.fail(new Error("--run derives the result from the exit code; do not pass --evidence-result."))
    if ((evidenceKind === undefined) !== (evidenceRef === undefined))
      return yield* Effect.fail(new Error("--evidence-kind and --evidence-ref must be provided together."))
    if (evidenceResult !== undefined && evidenceKind === undefined)
      return yield* Effect.fail(new Error("--evidence-result requires --evidence-kind and --evidence-ref."))
    const declared =
      evidenceKind === undefined || evidenceRef === undefined
        ? undefined
        : {
            kind: evidenceKind,
            reference: evidenceRef,
            result: evidenceResult ?? "unknown",
            executed: false,
          }
    const server = yield* ServerConnection.resolve()
    const client = OpenCode.make({ baseUrl: server.endpoint.url, headers: Service.headers(server.endpoint) })
    const note = Option.getOrUndefined(input.note)
    const evidence = run === undefined ? declared : yield* Effect.promise(() => execute(run))
    yield* Effect.tryPromise({
      try: () =>
        client.experimental.task.record({
          taskID: input.taskID,
          outcome,
          source: input.source,
          ...(note === undefined ? {} : { note }),
          ...(evidence === undefined ? {} : { evidence }),
        }),
      catch: (cause) => cause,
    })
    const summary = yield* Effect.tryPromise({
      try: () => client.experimental.task.get({ taskID: input.taskID }),
      catch: (cause) => cause,
    })
    process.stdout.write(`${input.taskID}  ${outcome}  ${summary.acceptance?.verification ?? "unverified"}` + EOL)
  }).pipe(
    Effect.catch((error) =>
      Effect.sync(() => {
        process.stderr.write(errorMessage(error) + EOL)
        process.exitCode = 1
      }),
    ),
  ),
)
