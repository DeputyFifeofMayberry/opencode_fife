import { OpenCode } from "@opencode/client"
import { Service } from "@opencode/client/effect/service"
import { Effect, Option } from "effect"
import { EOL } from "node:os"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { ServerConnection } from "../../../services/server-connection"
import { errorMessage } from "../../../util/error"

export default Runtime.handler(Commands.commands.task.commands.export, (input) =>
  Effect.gen(function* () {
    const server = yield* ServerConnection.resolve()
    const client = OpenCode.make({ baseUrl: server.endpoint.url, headers: Service.headers(server.endpoint) })
    const limit = Option.getOrUndefined(input.limit)
    const result = yield* Effect.tryPromise({
      try: () => client.experimental.task.export({ format: input.format, limit }),
      catch: (cause) => cause,
    })
    const out = Option.getOrUndefined(input.out)
    const skipped = result.skipped > 0 ? `, ${result.skipped} skipped` : ""
    const truncated = result.truncated ? ", truncated" : ""
    if (out === undefined) {
      process.stdout.write(result.data + EOL)
      if (result.truncated) process.stderr.write(`export truncated to ${result.count} task(s)` + EOL)
      if (result.skipped > 0) process.stderr.write(`skipped ${result.skipped} task(s)` + EOL)
      return
    }
    yield* Effect.promise(() => Bun.write(out, result.data))
    process.stdout.write(`${out}  ${input.format}  ${result.count} rows${skipped}${truncated}` + EOL)
  }).pipe(
    Effect.catch((error) =>
      Effect.sync(() => {
        process.stderr.write(errorMessage(error) + EOL)
        process.exitCode = 1
      }),
    ),
  ),
)
