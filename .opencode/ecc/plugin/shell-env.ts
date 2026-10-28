import { access, readFile } from "node:fs/promises"
import path from "node:path"
import { Option, Schema } from "effect"
import type { ShellCreateBefore } from "@opencode/plugin/promise/shell"
import type { Runtime } from "./state.ts"

const Package = Schema.fromJsonString(
  Schema.Struct({
    version: Schema.optionalKey(Schema.String),
    packageManager: Schema.optionalKey(Schema.String),
  }),
)

async function packageInfo(directory: string) {
  const text = await readFile(path.join(directory, "package.json"), "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })
  if (!text) return undefined
  return Option.getOrUndefined(Schema.decodeUnknownOption(Package)(text))
}

export async function shellEnvironment(state: Runtime) {
  const [ecc, project] = await Promise.all([packageInfo(state.eccRoot), packageInfo(state.root)])
  const detected = [
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["package-lock.json", "npm"],
  ] as const
  const files = await Promise.all(
    detected.map(
      async ([file, manager]) =>
        await access(path.join(state.root, file)).then(
          () => manager,
          () => undefined,
        ),
    ),
  )
  const manager = project?.packageManager?.split("@")[0] || files.find(Boolean)
  const languages = await Promise.all(
    [
      ["tsconfig.json", "typescript"],
      ["go.mod", "go"],
      ["pyproject.toml", "python"],
      ["Cargo.toml", "rust"],
    ].map(
      async ([file, language]) =>
        await access(path.join(state.root, file!)).then(
          () => language,
          () => undefined,
        ),
    ),
  )
  const values = {
    ECC_VERSION: ecc?.version ?? "unknown",
    ECC_PLUGIN: "true",
    ECC_HOOK_PROFILE: state.options.profile,
    ECC_DISABLED_HOOKS: [...state.options.disabled].join(","),
    PROJECT_ROOT: state.root,
    ...(manager ? { PACKAGE_MANAGER: manager } : {}),
    ...(languages.some(Boolean)
      ? { DETECTED_LANGUAGES: languages.filter(Boolean).join(","), PRIMARY_LANGUAGE: languages.find(Boolean)! }
      : {}),
  }
  return (event: ShellCreateBefore) => {
    if (state.controller.signal.aborted || !state.options.allows("shell:env", "minimal")) return
    Object.assign(event.env, values)
    if (!event.env.CLAUDE_PLUGIN_ROOT?.trim() && !process.env.CLAUDE_PLUGIN_ROOT?.trim()) {
      event.env.CLAUDE_PLUGIN_ROOT = state.eccRoot
    }
  }
}
