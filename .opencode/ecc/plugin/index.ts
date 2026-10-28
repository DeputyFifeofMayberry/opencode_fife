import type { Plugin } from "@opencode/plugin/promise/plugin"
import type { Registration } from "@opencode/plugin/promise/registration"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { options } from "./options.ts"
import { diagnostic, runtime } from "./state.ts"
import { shellEnvironment } from "./shell-env.ts"
import { before, after } from "./tool-hooks.ts"
import { compaction } from "./compaction.ts"
import { consume } from "./events.ts"

export default {
  id: "ecc.fife",
  setup: async (ctx) => {
    const configuration = options(ctx.options)
    if (!configuration.enabled) return
    const state = await runtime(ctx, configuration, path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."))
    const registrations: Registration[] = []
    const stream = { task: Promise.resolve() }
    const cleanup = async () => {
      state.controller.abort()
      const disposed = await Promise.allSettled(
        registrations
          .splice(0)
          .reverse()
          .map((registration) => registration.dispose()),
      )
      disposed
        .filter((result) => result.status === "rejected")
        .forEach(() => diagnostic("A hook registration could not be disposed."))
      await Promise.allSettled([stream.task, ...state.checks])
      state.sessions.clear()
    }
    try {
      const environment = await shellEnvironment(state)
      registrations.push(await ctx.shell.hook("create.before", environment))
      registrations.push(await ctx.tool.hook("execute.before", (event) => before(state, event)))
      registrations.push(await ctx.tool.hook("execute.after", (event) => after(state, event)))
      registrations.push(await ctx.session.hook("compaction", (event) => compaction(state, event)))
      stream.task = consume(state)
      return cleanup
    } catch (error) {
      await cleanup()
      throw error
    }
  },
} satisfies Plugin
