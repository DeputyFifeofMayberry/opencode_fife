import { OpenCode } from "@opencode/client"
import { Service } from "@opencode/client/effect/service"
import { Task } from "@opencode/schema/task"
import { Effect, Schema } from "effect"
import { EOL } from "node:os"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { ServerConnection } from "../../../services/server-connection"
import { errorMessage } from "../../../util/error"

const seconds = (milliseconds: number) => `${(milliseconds / 1000).toFixed(2)}s`

const describeEvidence = (evidence: Task.Evidence) =>
  [
    evidence.result,
    ...(evidence.executed ? ["executed"] : []),
    ...(evidence.duration_ms === undefined ? [] : [`${evidence.duration_ms}ms`]),
  ].join(", ")

export default Runtime.handler(Commands.commands.task.commands.show, (input) =>
  Effect.gen(function* () {
    const server = yield* ServerConnection.resolve()
    const client = OpenCode.make({ baseUrl: server.endpoint.url, headers: Service.headers(server.endpoint) })
    const summary = yield* Effect.tryPromise({
      try: () => client.experimental.task.get({ taskID: input.taskID }),
      catch: (cause) => cause,
    })
    if (input.format === "json") {
      // The promise client returns encoded JSON, so decode first to restore the DateTime values that encoding
      // turns back into wire-format millisecond numbers.
      const encoded = Schema.encodeUnknownSync(Task.Summary)(Schema.decodeUnknownSync(Task.Summary)(summary))
      process.stdout.write(JSON.stringify(encoded, null, 2) + EOL)
      return
    }
    const acceptance = summary.acceptance
    const evidence = acceptance?.evidence
    const requests = summary.usage.requests
    const lines = [
      `Task: ${summary.task.id}${summary.task.label === undefined ? "" : `  ${summary.task.label}`}`,
      `Root session: ${summary.task.root_session_id}`,
      `Created: ${new Date(summary.task.time_created).toISOString()}`,
      `Acceptance: ${acceptance === undefined ? "unverified (not recorded)" : `${acceptance.outcome} (${acceptance.source})${acceptance.note === undefined ? "" : ` - ${acceptance.note}`}`}`,
      `Verification: ${acceptance?.verification ?? "unverified"}`,
      ...(evidence === undefined
        ? []
        : [`Evidence: ${evidence.kind} ${evidence.reference} (${describeEvidence(evidence)})`]),
      `Acceptance history: ${summary.history.length} recorded`,
      `Sessions: ${summary.sessions.length}`,
      ...summary.sessions.map(
        (session) =>
          `  ${session.id}  ${session.outcome ?? "no terminal"}  turns ${session.turns.succeeded}/${session.turns.total} ok  resumes ${session.resume_attempts}`,
      ),
      `Requests: ${requests.observed} observed, ${requests.provider_attempts ?? "?"} provider attempts, ${requests.retries ?? "?"} retries, ${requests.unreconciled ?? "?"} unreconciled, ${requests.settled} settled, ${requests.unsettled} unsettled, ${requests.failed} failed`,
      `Tokens: input ${summary.usage.tokens.input}, output ${summary.usage.tokens.output}, reasoning ${summary.usage.tokens.reasoning}, cache read ${summary.usage.tokens.cache.read}, cache write ${summary.usage.tokens.cache.write} (gross ${summary.usage.gross_tokens}, unattributed ${summary.usage.unattributed_tokens})`,
      `Cost: $${summary.usage.cost.total.toFixed(6)} (provider $${summary.usage.cost.provider.toFixed(6)}, estimated $${summary.usage.cost.estimated.toFixed(6)}, legacy $${summary.usage.cost.legacy_unknown.toFixed(6)}, unattributed $${summary.usage.cost.unattributed.toFixed(6)})`,
      `Timing: wall ${seconds(summary.timing.wall_ms)}, active ${seconds(summary.timing.active_ms)}, turns ${seconds(summary.timing.turn_ms)}`,
      `Complete: sessions ${summary.completeness.sessions ? "yes" : "no"}, requests ${summary.completeness.requests ? "yes" : "no"}, usage ${summary.completeness.usage ? "yes" : "no"}, cost ${summary.completeness.cost ? "yes" : "no"}`,
      `Measured: ${summary.completeness.measured ? "yes" : "no"}`,
    ]
    process.stdout.write(lines.join(EOL) + EOL)
  }).pipe(
    Effect.catch((error) =>
      Effect.sync(() => {
        process.stderr.write(errorMessage(error) + EOL)
        process.exitCode = 1
      }),
    ),
  ),
)
