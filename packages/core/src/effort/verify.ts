export * as EffortVerification from "./verify.js"

import { ChildProcess } from "effect/process"
import { Duration, Effect } from "effect"
import { AppProcessError, type RunOptions, type RunResult } from "@opencode/util/process"
import type { Database } from "../database/database.js"
import { EffortEvidence } from "./evidence.js"
import { EffortStore } from "./store.js"
import type { SessionSchema } from "../session/schema.js"
import type { ConfigEffort } from "@opencode/schema/config/effort"

const DEFAULT_TIMEOUT_MS = 120_000
const DIGEST_TIMEOUT = Duration.seconds(10)
const OUTPUT_BYTES = 16 * 1024 * 1024
const ERROR_BYTES = 1024 * 1024

export interface Deps {
  readonly db: Database.Interface["db"]
  readonly efforts: EffortStore.Interface
  /** Resolved by the caller, so the harness reads no configuration itself. */
  readonly settings: ConfigEffort.Info | undefined
  readonly runProcess: (
    command: ChildProcess.Command,
    options?: RunOptions,
  ) => Effect.Effect<RunResult, AppProcessError>
}

/**
 * Runs one configured verifier when the session's state is dirty and records the verdict
 * through the same evidence path the model's own settlements use.
 *
 * This is the adaptive loop's guaranteed signal: it does not depend on the model choosing
 * to run a verification command, on the shape of its invocation, or on pipeline exit-code
 * semantics. A harness verdict is discarded if the session revision changes while it runs.
 *
 * Spawn failures and timeouts are infrastructure: they change nothing, matching the
 * model-initiated classification.
 */
export const runIfDirty = Effect.fn("EffortVerification.runIfDirty")(function* (
  deps: Deps,
  input: { readonly sessionID: SessionSchema.ID; readonly directory: string },
) {
  const settings = deps.settings
  yield* EffortEvidence.warnUnmatchable(settings)
  if (settings?.mode !== "adaptive") return
  const configured = (settings.verification_commands ?? [])
    .map((command) => command.trim())
    .filter((command) => command.length > 0)
  if (configured.length === 0) return
  const row = yield* deps.efforts.get(input.sessionID)
  if (!row) return

  const digest = yield* workspaceDigest(deps, input.directory)
  const dirty =
    row.openFailure !== undefined ||
    (row.level !== undefined && row.level !== row.baseLevel) ||
    (row.verdictRevision ?? 0) !== row.revision ||
    (digest !== undefined && row.verdictDigest !== undefined && digest !== row.verdictDigest)
  if (!dirty) return

  // A failure clears only for its own verifier, so that verifier has to run. When it is no
  // longer configured, nothing the harness can run would recover the session: running the
  // first usable entry instead would spend a verifier run on every idle pass, forever.
  const failing = row.openFailure?.verifier
  if (failing !== undefined && !configured.includes(failing)) return
  const command =
    failing ?? configured.find((candidate) => EffortEvidence.matchVerifier(candidate, [candidate]) !== undefined)

  // An unattributable command has no exit that belongs to a verifier, so there is nothing
  // to record. `warnUnmatchable` has already said which entries are unusable.
  if (command === undefined || EffortEvidence.matchVerifier(command, [command]) === undefined) return

  const result = yield* deps
    .runProcess(ChildProcess.make(command, [], { shell: true, cwd: input.directory, extendEnv: true }), {
      timeout: Duration.millis(settings.verification_timeout ?? DEFAULT_TIMEOUT_MS),
      maxOutputBytes: OUTPUT_BYTES,
      maxErrorBytes: ERROR_BYTES,
    })
    .pipe(
      Effect.catch((cause) =>
        Effect.logWarning("harness verification failed to run", {
          sessionID: input.sessionID,
          command,
          cause,
        }).pipe(Effect.as(undefined)),
      ),
    )
  if (result === undefined) return

  yield* Effect.logInfo("harness verification settled", {
    sessionID: input.sessionID,
    command,
    exit: result.exitCode,
  })
  yield* EffortEvidence.observe(
    { db: deps.db, efforts: deps.efforts },
    settings,
    input.sessionID,
    { tool: EffortEvidence.HARNESS_TOOL, input: { command }, metadata: { exit: result.exitCode }, expectedRevision: row.revision },
  )
  const current = yield* deps.efforts.get(input.sessionID)
  if (current?.revision !== row.revision) return
  yield* deps.efforts.setVerdict(input.sessionID, {
    revision: row.revision,
    ...(digest !== undefined ? { digest } : {}),
  })
})

/** A stable digest of the workspace's changed-file set; absent outside a repository. */
const workspaceDigest = Effect.fnUntraced(function* (deps: Deps, directory: string) {
  const result = yield* deps
    .runProcess(ChildProcess.make("git", ["status", "--porcelain"], { cwd: directory, extendEnv: true }), {
      timeout: DIGEST_TIMEOUT,
      maxOutputBytes: OUTPUT_BYTES,
      maxErrorBytes: ERROR_BYTES,
    })
    .pipe(Effect.catch(() => Effect.succeed(undefined)))
  if (result === undefined || result.exitCode !== 0) return undefined
  const status = result.stdout.toString("utf8")
  return status.trim().length === 0 ? "clean" : Bun.hash(status).toString(16)
})
