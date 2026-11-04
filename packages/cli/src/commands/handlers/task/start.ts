import { OpenCode } from "@opencode/client"
import { Service } from "@opencode/client/effect/service"
import { Effect, Option } from "effect"
import { EOL } from "node:os"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { ServerConnection } from "../../../services/server-connection"
import { errorMessage } from "../../../util/error"

export default Runtime.handler(Commands.commands.task.commands.start, (input) =>
  Effect.gen(function* () {
    const server = yield* ServerConnection.resolve()
    const client = OpenCode.make({ baseUrl: server.endpoint.url, headers: Service.headers(server.endpoint) })
    const label = Option.getOrUndefined(input.label)
    const policy = Option.getOrUndefined(input.policy)
    const task = yield* Effect.tryPromise({
      try: () =>
        client.experimental.task.ensure({
          sessionID: input.sessionID,
          ...(label === undefined ? {} : { label }),
          ...(policy === undefined ? {} : { policy }),
        }),
      catch: (cause) => cause,
    })
    process.stdout.write(`${task.id}  ${task.root_session_id}` + EOL)
  }).pipe(
    Effect.catch((error) =>
      Effect.sync(() => {
        process.stderr.write(errorMessage(error) + EOL)
        process.exitCode = 1
      }),
    ),
  ),
)
