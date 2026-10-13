export * as FileStamp from "./file-stamp.js"

import { makeLocationNode } from "@opencode/util/effect/app-node"
import { Context, Effect, Layer } from "effect"
import { Environment, type FileInfo } from "./environment/index.js"
import type { Session } from "@opencode/schema/session"

interface Stamp {
  readonly mtimeMs: number
  readonly size: number
  readonly hash: string
}

export interface Interface {
  /** Record the caller's read result as the session's read stamp. */
  readonly record: (
    sessionID: Session.ID,
    absolute: string,
    read: { readonly info: FileInfo; readonly bytes: Uint8Array },
  ) => Effect.Effect<void>
  /** True when the file is unchanged since the stamp; true when the session never recorded one. */
  readonly check: (sessionID: Session.ID, absolute: string) => Effect.Effect<boolean>
  /** Re-record the stamp from disk after a successful mutation. */
  readonly refresh: (sessionID: Session.ID, absolute: string) => Effect.Effect<void>
  /** Drop the stamp after a mutation removed the file, so a later write to the path is fresh. */
  readonly clear: (sessionID: Session.ID, absolute: string) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/FileStamp") {}

const fingerprint = (bytes: Uint8Array) => new Bun.CryptoHasher("sha256").update(bytes).digest("hex")

/**
 * Per-session in-memory read stamps backing the stale-edit write guard. Sessions are
 * process-local, so a plain Map keyed by session and absolute path dies correctly with
 * the Location graph.
 */
const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const environment = yield* Environment.Service
    const stamps = new Map<string, Stamp>()
    const key = (sessionID: Session.ID, absolute: string) => `${sessionID}\0${absolute}`

    // Stat equality (mtimeMs+size) is the cheap fresh path in `check`; on mismatch a
    // sha256 content comparison keeps a touch-without-change fresh.
    const capture = Effect.fn("FileStamp.capture")(function* (absolute: string) {
      const { info, bytes } = yield* environment.files.read(absolute)
      return { mtimeMs: info.mtimeMs, size: info.size, hash: fingerprint(bytes) } satisfies Stamp
    })

    const record: Interface["record"] = (sessionID, absolute, read) =>
      Effect.sync(() => {
        stamps.set(key(sessionID, absolute), {
          mtimeMs: read.info.mtimeMs,
          size: read.info.size,
          hash: fingerprint(read.bytes),
        })
      })

    const check: Interface["check"] = (sessionID, absolute) =>
      Effect.gen(function* () {
        const stamp = stamps.get(key(sessionID, absolute))
        if (!stamp) return true
        const info = yield* environment.files.stat(absolute).pipe(Effect.orElseSucceed(() => undefined))
        if (!info) return false
        if (info.mtimeMs === stamp.mtimeMs && info.size === stamp.size) return true
        const current = yield* capture(absolute).pipe(Effect.orElseSucceed(() => undefined))
        return current !== undefined && current.hash === stamp.hash
      })

    const refresh: Interface["refresh"] = (sessionID, absolute) =>
      Effect.map(capture(absolute).pipe(Effect.orElseSucceed(() => undefined)), (stamp) => {
        if (stamp) stamps.set(key(sessionID, absolute), stamp)
      })

    const clear: Interface["clear"] = (sessionID, absolute) =>
      Effect.sync(() => {
        stamps.delete(key(sessionID, absolute))
      })

    return Service.of({ record, check, refresh, clear })
  }),
)

export const node = makeLocationNode({ service: Service, layer, deps: [Environment.node] })
