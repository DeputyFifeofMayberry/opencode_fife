import { OpenCode } from "@opencode/client"
import { Service } from "@opencode/client/effect/service"
import { Effect, Option } from "effect"
import { EOL } from "node:os"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { ServerConnection } from "../../../services/server-connection"
import { errorMessage } from "../../../util/error"

export default Runtime.handler(Commands.commands.task.commands.list, (input) =>
  Effect.gen(function* () {
    const server = yield* ServerConnection.resolve()
    const client = OpenCode.make({ baseUrl: server.endpoint.url, headers: Service.headers(server.endpoint) })
    const limit = Option.getOrUndefined(input.limit)
    const tasks = yield* Effect.tryPromise({
      try: () => client.experimental.task.list({ limit }),
      catch: (cause) => cause,
    })
    if (input.format === "json") {
      process.stdout.write(JSON.stringify(tasks, null, 2) + EOL)
      return
    }
    if (tasks.length === 0) {
      process.stdout.write("No tasks recorded." + EOL)
      return
    }
    process.stdout.write(
      tasks.map((task) => `${task.id}  ${task.label ?? "-"}  ${task.root_session_id}`).join(EOL) + EOL,
    )
  }).pipe(
    Effect.catch((error) =>
      Effect.sync(() => {
        process.stderr.write(errorMessage(error) + EOL)
        process.exitCode = 1
      }),
    ),
  ),
)
