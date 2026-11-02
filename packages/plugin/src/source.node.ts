import * as NodeModule from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { localSource } from "./source.js"
import { missingPackageTarget } from "./source.package.js"
import { Host } from "./host.js"

// module.registerHooks ships in Node >= 23.5 and Bun >= 1.2, but the ambient node:module
// types predate it, so the hook carries its own minimal shape.
const registerHooks = (NodeModule as unknown as {
  registerHooks: (hooks: {
    resolve: (
      specifier: string,
      context: { parentURL?: string },
      nextResolve: (specifier: string, context?: { parentURL?: string }) => { url: string },
    ) => { url: string }
  }) => { deregister: () => void }
}).registerHooks

let generation = Date.now()

export async function prepareSource(entrypoint: string, track: (file: string, directory?: boolean) => void) {
  const version = String(++generation)
  const fresh = (specifier: string) => {
    const url = new URL(specifier)
    url.searchParams.set("__opencode_reload", version)
    return url.href
  }
  const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (!context.parentURL || new URL(context.parentURL).searchParams.get("__opencode_reload") !== version)
        return nextResolve(specifier, context)
      const local =
        specifier.startsWith("./") || specifier.startsWith("../")
          ? new URL(specifier, context.parentURL)
          : localSource(specifier, path.dirname(fileURLToPath(context.parentURL)))
      if (!local) {
        try {
          return nextResolve(specifier, context)
        } catch (error) {
          const target = missingPackageTarget(specifier, fileURLToPath(context.parentURL))
          if (target) track(target, true)
          throw error
        }
      }
      if (fileURLToPath(local).split(path.sep).includes("node_modules")) return nextResolve(specifier, context)
      const resolved = (() => {
        try {
          return nextResolve(specifier, context)
        } catch (error) {
          track(path.dirname(fileURLToPath(local)), true)
          throw error
        }
      })()
      if (!resolved.url.startsWith("file:")) return resolved
      const file = fileURLToPath(resolved.url)
      if (file.split(path.sep).includes("node_modules")) return resolved
      track(file)
      return { ...resolved, url: fresh(resolved.url) }
    },
  })
  const specifier = fresh(entrypoint)
  return { version: specifier, load: () => Host.load(specifier), dispose: () => hook.deregister() }
}
