import type { Context } from "@opencode/plugin/promise/plugin"
import type { Options } from "./options.ts"
import path from "node:path"
import { realpath } from "node:fs/promises"

export type Change = "added" | "modified" | "deleted"
export interface SessionState {
  files: Map<string, { type: Change; revision: number }>
  pending: Map<string, string[]>
  calls: Set<string>
  revision: number
  audited: number
}

export interface Runtime {
  ctx: Context
  options: Options
  eccRoot: string
  root: string
  canonicalRoot: string
  sessions: Map<string, SessionState>
  controller: AbortController
  checks: Set<Promise<unknown>>
}

export async function runtime(ctx: Context, options: Options, eccRoot: string): Promise<Runtime> {
  const root = path.resolve(ctx.location.project.directory)
  return {
    ctx,
    options,
    eccRoot,
    root,
    canonicalRoot: await realpath(root),
    sessions: new Map(),
    controller: new AbortController(),
    checks: new Set(),
  }
}

export function session(state: Runtime, id: string): SessionState {
  const current = state.sessions.get(id)
  if (current) return current
  const value: SessionState = { files: new Map(), pending: new Map(), calls: new Set(), revision: 0, audited: 0 }
  state.sessions.set(id, value)
  return value
}

export function inside(root: string, file: string) {
  const relative = path.relative(root, file)
  return relative === "" || (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative))
}

export function sameDirectory(left: string, right: string) {
  const a = path.resolve(left)
  const b = path.resolve(right)
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b
}

export function record(state: Runtime, current: SessionState, file: string, type: Change) {
  const absolute = path.resolve(state.ctx.location.directory, file)
  if (!inside(state.root, absolute)) return
  const key = path.relative(state.root, absolute).replaceAll(path.sep, "/")
  current.files.set(key, { type, revision: ++current.revision })
  if (current.files.size > 1000) current.files.delete(current.files.keys().next().value!)
}

export function diagnostic(message: string) {
  console.warn(`[ECC] ${message.slice(0, 2000)}`)
}
