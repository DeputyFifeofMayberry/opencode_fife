export * as ConfigHooksPlugin from "./hooks.js"

import { define } from "@opencode/plugin/effect/plugin"
import { Effect } from "effect"
import { AppProcess } from "@opencode/util/process"
import { Config } from "../../config.js"
import { ConfigHooks } from "../../config-hooks.js"
import { normalizeContent } from "../../tool/runtime.js"
import { Tool } from "../../tool.js"
import { ConfigEntryObserver } from "./entry-observer.js"

export const Plugin = define({
  id: "opencode.config.hooks",
  effect: Effect.fn(function* (ctx) {
    const config = yield* Config.Service
    const processes = yield* AppProcess.Service
    const loaded = yield* ConfigEntryObserver.observe(config, ctx.event, Effect.void)
    // Context from a before-hook rides to the after-hook by call id.
    const contexts = new Map<string, string>()
    yield* ctx.tool.hook("execute.before", (event) =>
      Effect.gen(function* () {
        const entries = Config.latest(loaded.entries, "hooks") ?? []
        if (entries.length === 0) return
        const verdict = yield* ConfigHooks.run(processes, {
          entries,
          tool: event.tool,
          toolInput: event.input,
          sessionID: event.sessionID,
          cwd: ctx.location.directory,
        })
        if (verdict.decision === "deny") return yield* new Tool.Error({ message: verdict.reason })
        if (verdict.decision === "halt") return yield* Effect.die(new ConfigHooks.HaltError())
        if (verdict.updatedInput !== undefined) event.input = verdict.updatedInput
        if (verdict.context !== undefined) contexts.set(event.id, verdict.context)
      }),
    )
    yield* ctx.tool.hook("execute.after", (event) => {
      const text = contexts.get(event.id)
      if (text === undefined) return Effect.void
      contexts.delete(event.id)
      if (event.status !== "completed") return Effect.void
      return Effect.sync(() => {
        // Compute the model-visible content (an output-only tool stringifies its output),
        // then prepend the hook text so neither source is erased.
        const content = normalizeContent(event.result.content, event.result.output)
        event.result = { ...event.result, content: [{ type: "text", text }, ...content] }
      })
    })
  }),
})
