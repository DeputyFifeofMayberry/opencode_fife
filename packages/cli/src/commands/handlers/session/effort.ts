import { OpenCode } from "@opencode/client"
import { Service } from "@opencode/client/effect/service"
import { Effect } from "effect"
import { EOL } from "node:os"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { ServerConnection } from "../../../services/server-connection"
import { errorMessage } from "../../../util/error"

export default Runtime.handler(Commands.commands.session.commands.effort, (input) =>
  Effect.gen(function* () {
    const server = yield* ServerConnection.resolve()
    const client = OpenCode.make({ baseUrl: server.endpoint.url, headers: Service.headers(server.endpoint) })
    const result = yield* Effect.tryPromise({
      try: () => client.session.effort({ sessionID: input.sessionID }),
      catch: (cause) => cause,
    })
    if (input.format === "json") {
      process.stdout.write(JSON.stringify(result, null, 2) + EOL)
      return
    }
    const status = result
    const lines = [
      `Mode: ${status.mode}`,
      `Agent: ${status.agent}`,
      `Model: ${status.model ? `${status.model.providerID}/${status.model.id}` : "not selected"}`,
      `Selected variant: ${status.selectedVariant ?? "provider default"} (${status.control})`,
      `Automatic effort support: ${status.support}`,
      `Current adaptive level: ${status.currentLevel ?? "not initialized or static"}`,
      `Base level: ${status.baseLevel}`,
      `Next decision: ${status.next ? `${status.next.rule}${status.next.level ? `, level ${status.next.level}` : ""}${status.next.effort ? `, variant ${status.next.effort}` : ""}` : "unknown until model is available"}`,
      `Verifier: ${status.verificationCommands.join(", ") || "none configured"}`,
      ...(status.openFailure ? [`Open verification failure: ${status.openFailure}`] : []),
      ...(status.cleanPassesNeeded === undefined ? [] : [`Clean passes: ${status.cleanPasses}/${status.cleanPassesNeeded}`]),
    ]
    process.stdout.write(lines.join(EOL) + EOL)
  }).pipe(Effect.catch((error) => Effect.sync(() => {
    process.stderr.write(errorMessage(error) + EOL)
    process.exitCode = 1
  }))),
)
