import path from "node:path"
import { open, realpath } from "node:fs/promises"
import { Option, Schema } from "effect"
import type { Context } from "@opencode/plugin/promise/plugin"
import type { Result } from "@opencode/plugin/promise/tool"
import type { Runtime } from "./state.ts"
import { diagnostic, inside, record, session } from "./state.ts"
import { check } from "./checks.ts"

type ToolEvent = Parameters<Parameters<Context["tool"]["hook"]>[1]>[0]
const Write = Schema.Struct({
  operation: Schema.Literal("write"),
  target: Schema.String,
  resource: Schema.String,
  existed: Schema.Boolean,
})
const Files = Schema.Struct({
  files: Schema.Array(
    Schema.Struct({ file: Schema.String, status: Schema.Literals(["added", "modified", "deleted"]) }),
  ),
  applied: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        type: Schema.Literals(["add", "update", "delete"]),
        resource: Schema.String,
        target: Schema.String,
      }),
    ),
  ),
})
const Shell = Schema.Struct({ command: Schema.String })
const SCRIPT = /\.(?:[cm]?[jt]sx?)$/i

export function before(state: Runtime, event: ToolEvent) {
  if (state.controller.signal.aborted) return
  const current = session(state, event.sessionID)
  const shell = Option.getOrUndefined(Schema.decodeUnknownOption(Shell)(event.input))
  if (event.tool !== "shell" || !shell) return
  const notes: string[] = []
  if (state.options.allows("pre:bash:git-push-reminder", "strict") && /\bgit\s+push\b/.test(shell.command)) {
    notes.push("Review the task diff and the repo's push authorization before publishing.")
  }
  if (
    state.options.allows("pre:bash:tmux-reminder", "strict") &&
    /^(bun|npm|pnpm|yarn|cargo|go)\s+(run|test|build|install)\b/.test(shell.command)
  ) {
    notes.push("Long-running work can use the native shell tool's background option.")
  }
  if (notes.length) current.pending.set(event.id, notes)
}

export async function after(state: Runtime, event: ToolEvent) {
  if (!("status" in event) || state.controller.signal.aborted) return
  const current = session(state, event.sessionID)
  const pending = current.pending.get(event.id) ?? []
  current.pending.delete(event.id)
  if (event.status !== "completed" || current.calls.has(event.id)) return
  current.calls.add(event.id)
  if (current.calls.size > 512) current.calls.delete(current.calls.values().next().value!)
  const notes = [...pending]
  const changed: string[] = []
  if (event.tool === "write") {
    const output = Option.getOrUndefined(Schema.decodeUnknownOption(Write)(event.result.output))
    if (output) {
      record(state, current, output.target, output.existed ? "modified" : "added")
      changed.push(output.target)
    }
  }
  if (event.tool === "edit" || event.tool === "patch") {
    const output = Option.getOrUndefined(Schema.decodeUnknownOption(Files)(event.result.output))
    if (output) {
      output.files.forEach((file) => {
        record(state, current, file.file, file.status)
        if (file.status !== "deleted") changed.push(file.file)
      })
      output.applied
        ?.filter((file) => file.type === "update")
        .forEach((file) => {
          const from = path.resolve(state.ctx.location.directory, file.resource)
          const to = path.resolve(state.ctx.location.directory, file.target)
          if (from === to) return
          record(state, current, from, "deleted")
          record(state, current, to, "added")
        })
    }
  }
  if (state.options.allows("post:edit:console-warn")) {
    for (const file of [...new Set(changed)].filter((file) => SCRIPT.test(file)).slice(0, 20)) {
      const warning = await inspect(state, file)
      if (warning) notes.push(warning)
    }
  }
  if (
    changed.some((file) => /\.tsx?$/.test(file)) &&
    state.options.check &&
    state.options.allows("post:edit:typecheck", "strict")
  ) {
    const result = check(state, state.options.check)
    state.checks.add(result)
    try {
      notes.push(await result)
    } finally {
      state.checks.delete(result)
    }
  }
  if (!state.controller.signal.aborted && notes.length) event.result = append(event.result, notes)
}

export async function inspect(state: Runtime, file: string) {
  const absolute = path.resolve(state.ctx.location.directory, file)
  if (!inside(state.root, absolute)) return `Check unavailable outside this project: ${JSON.stringify(file)}`
  try {
    const target = await realpath(absolute)
    if (!inside(state.canonicalRoot, target)) return `Check unavailable for external link: ${JSON.stringify(file)}`
    const handle = await open(target, "r")
    try {
      const buffer = Buffer.alloc(256 * 1024)
      const [read, stat] = await Promise.all([handle.read(buffer, 0, buffer.length, 0), handle.stat()])
      const count = (buffer.toString("utf8", 0, read.bytesRead).match(/console\.log\s*\(/g) ?? []).length
      const name = JSON.stringify(path.relative(state.root, absolute))
      if (stat.size > read.bytesRead)
        return `Partial check for ${name}: first 256 KiB contain ${count} console.log call(s).`
      if (count) return `${name} contains ${count} console.log call(s); review debug output before finishing.`
    } finally {
      await handle.close()
    }
  } catch (error) {
    return `Check unavailable for ${JSON.stringify(file)}: ${error instanceof Error ? error.message : String(error)}`
  }
}

function append(result: Result, notes: string[]) {
  const text = `[ECC] ${notes.join("\n").slice(0, 2000)}`
  const original = result.content ?? (result.output === undefined ? [] : JSON.stringify(result.output))
  const content: Result["content"] =
    typeof original === "string" ? `${original}\n\n${text}` : [...original, { type: "text", text }]
  return { ...result, content }
}

export async function audit(state: Runtime, id: string, outcome: string) {
  const current = state.sessions.get(id)
  if (!current || current.revision <= current.audited) return
  const revision = current.revision
  const files = [...current.files].filter(
    ([file, change]) =>
      change.revision > current.audited &&
      change.revision <= revision &&
      change.type !== "deleted" &&
      SCRIPT.test(file),
  )
  current.audited = revision
  if (!state.options.allows("stop:check-console-log", "minimal")) return
  const warnings = await Promise.all(files.slice(0, 20).map(([file]) => inspect(state, path.join(state.root, file))))
  if (state.controller.signal.aborted) return
  diagnostic(
    `Session ${id} ${outcome}; ${files.length} changed script file(s).${files.length > 20 ? " Audit limited to 20 files." : ""}${warnings.some(Boolean) ? "\n" + warnings.filter(Boolean).join("\n") : ""}`,
  )
}
