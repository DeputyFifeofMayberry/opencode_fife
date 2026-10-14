export * as AutoBackground from "./auto-background.js"

import type { Entry } from "@opencode/schema/config"
import { Duration, Effect, Fiber, type Scope } from "effect"
import { Config } from "../config.js"
import type { Job } from "../job.js"
import type { Session } from "../session.js"
import { SessionSchema } from "./schema.js"

/**
 * Default delay before blocking work (shell commands, foreground subagents) is
 * moved to the background automatically. Overridable via the
 * `auto_background_ms` config option; `0` disables auto-backgrounding.
 */
export const DEFAULT_THRESHOLD_MS = 2000

export const threshold = (entries: readonly Entry[]) => Config.latest(entries, "auto_background_ms") ?? DEFAULT_THRESHOLD_MS

/**
 * Blocks on a job like `Job.block`, but automatically moves the session's
 * blocking work to the background (the `Session.background` flow) once the
 * block outlives `thresholdMs`. A threshold of `0` disables the watchdog.
 */
export const block = (input: {
  jobs: Pick<Job.Interface, "block">
  sessions: Pick<Session.Interface, "background">
  scope: Scope.Scope
  sessionID: SessionSchema.ID
  jobID: string
  thresholdMs: number
}) => {
  const wait = input.jobs.block({ id: input.jobID, sessionID: input.sessionID })
  if (input.thresholdMs <= 0) return wait
  return Effect.gen(function* () {
    // Uninterruptible: once the watchdog fires, `Session.background` must run to
    // completion (it delivers the synthetic notification), even though the
    // unblocked tool call interrupts this fiber on its way out.
    const watchdog = yield* Effect.sleep(Duration.millis(input.thresholdMs)).pipe(
      Effect.flatMap(() => Effect.uninterruptible(input.sessions.background(input.sessionID, { reason: "auto" }))),
      Effect.forkIn(input.scope, { startImmediately: true }),
    )
    return yield* wait.pipe(Effect.onExit(() => Fiber.interrupt(watchdog).pipe(Effect.ignore)))
  })
}
