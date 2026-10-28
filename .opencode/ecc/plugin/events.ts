import type { Context } from "@opencode/plugin/promise/plugin"
import type { Runtime } from "./state.ts"
import { audit } from "./tool-hooks.ts"
import { diagnostic, sameDirectory } from "./state.ts"
import path from "node:path"

type Event = ReturnType<Context["event"]["subscribe"]> extends AsyncIterable<infer Value> ? Value : never

export async function consume(state: Runtime) {
  try {
    for await (const event of state.ctx.event.subscribe({ signal: state.controller.signal })) {
      if (state.controller.signal.aborted) break
      await dispatch(state, event)
    }
  } catch (error) {
    if (!state.controller.signal.aborted)
      diagnostic(`Event stream unavailable: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function dispatch(state: Runtime, event: Event) {
  if (event.location && !sameDirectory(event.location.directory, state.ctx.location.directory)) return
  if (event.type === "filesystem.changed") {
    if (!event.location) return
    const absolute = path.resolve(state.ctx.location.directory, event.data.file)
    const file = path.relative(state.root, absolute).replaceAll(path.sep, "/")
    state.sessions.forEach((current) => {
      const known = current.files.get(file)
      if (known)
        known.type = event.data.event === "unlink" ? "deleted" : known.type === "deleted" ? "modified" : known.type
    })
    return
  }
  if (event.type === "session.deleted") {
    state.sessions.delete(event.data.sessionID)
    return
  }
  if (event.type === "session.execution.interrupted" && event.data.reason === "shutdown") return
  if (
    event.type === "session.execution.succeeded" ||
    event.type === "session.execution.failed" ||
    event.type === "session.execution.interrupted"
  ) {
    if (!state.sessions.has(event.data.sessionID)) return
    const outcome = event.type.slice("session.execution.".length)
    await audit(state, event.data.sessionID, outcome)
  }
}
