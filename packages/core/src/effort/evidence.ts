export * as EffortEvidence from "./evidence.js"

import { Effect } from "effect"
import { Bus } from "../bus.js"
import { Config } from "../config.js"
import type { Database } from "../database/database.js"
import type { SessionSchema } from "../session/schema.js"
import { applyEvidence } from "./policy/index.js"
import { EffortStore } from "./store.js"

/**
 * Observes one settled tool call and applies it to the session's durable state.
 *
 * Only configured verification commands classify: a non-zero exit opens an
 * escalation, a zero exit clears one, and everything else — spawn failures,
 * cancels, timeouts, unconfigured commands — changes nothing. File-mutating
 * tools advance the workspace revision their settlement observed. Only direct,
 * simple verifier invocations are attributed: a shell exit belongs to the whole
 * command, so pipelines, redirects, shell expansions and compound expressions
 * cannot establish the verifier's own result. The verifier identity omits cwd.
 */
export const observe = Effect.fn("EffortEvidence.observe")(function* (
  deps: {
    readonly db: Database.Interface["db"]
    readonly efforts: EffortStore.Interface
    readonly config: Config.Interface
  },
  sessionID: SessionSchema.ID,
  settlement: { readonly tool: string; readonly input: unknown; readonly metadata: unknown; readonly startedMutation?: boolean; readonly expectedRevision?: number },
) {
  const settings = Config.effortPolicy(yield* deps.config.entries())
  const verifiers = settings?.verification_commands ?? []
  const mutating = settings?.mutating_tools ?? ["write", "edit", "patch"]
  const adaptive = settings?.mode === "adaptive"

  if (mutating.includes(settlement.tool) && !settlement.startedMutation) yield* deps.efforts.bumpRevision(sessionID)

  if (settlement.tool !== "shell" && settlement.tool !== "harness-verifier") return
  const command = commandOf(settlement.input)
  const exit = exitOf(settlement.metadata)
  if (command === undefined || exit === undefined) return
  const verifier = matchVerifier(command, verifiers)
  if (verifier === undefined) return

  yield* deps.db.transaction(() => Effect.gen(function* () {
    const row = yield* deps.efforts.get(sessionID)
    if (settlement.expectedRevision !== undefined && row?.revision !== settlement.expectedRevision) return
    const sequence = (yield* Bus.latestSequence(deps.db, sessionID)) + 1
    yield* Bus.reserveSequence(deps.db, sessionID, sequence)
    const state = {
      base: row?.baseLevel ?? ("standard" as const),
      ...(row?.openFailure === undefined ? {} : { openFailure: row.openFailure }),
      ...(row?.lastAppliedVariant === undefined ? {} : { lastAppliedVariant: row.lastAppliedVariant }),
      ...(adaptive && row !== undefined
        ? {
            level: row.level ?? row.baseLevel,
            cleanPasses: row.cleanPasses ?? 0,
            cleanPassesNeeded: settings?.clean_passes ?? 2,
          }
        : {}),
    }
    const next = applyEvidence(
      state,
      {
        kind: exit === 0 ? "verification-pass" : "verification-failure",
        verifier,
        sequence,
        revision: row?.revision ?? 0,
      },
    )
    yield* deps.efforts.setOpenFailure(sessionID, next.openFailure)
    // The evidence loop owns the adaptive level: a failure raises it, clean passes decay it.
    if (next.level !== state.level || (next.cleanPasses ?? 0) !== (state.cleanPasses ?? 0))
      yield* deps.efforts.setLevel(sessionID, next.level ?? state.base, next.cleanPasses ?? 0)
  })).pipe(Effect.orDie)
})

/** Match only a simple command whose process exit can belong to the verifier. */
export function matchVerifier(command: string, verifiers: readonly string[]): string | undefined {
  const value = command.trim()
  // Reject shell syntax conservatively, including quoting and substitutions. The
  // shell reports one status for a complete expression, never per segment.
  const simple = /^[\w\s.\/\\:=@+,-]+$/
  if (!simple.test(value) || /[\r\n]/.test(value)) return undefined
  return verifiers.map((verifier) => verifier.trim()).find((verifier) =>
    verifier.length > 0 && simple.test(verifier) && !/[\r\n]/.test(verifier) &&
    (value === verifier || value.startsWith(`${verifier} `)),
  )
}

function commandOf(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null) return undefined
  const command = (input as { readonly command?: unknown }).command
  return typeof command === "string" ? command : undefined
}

function exitOf(metadata: unknown): number | undefined {
  if (typeof metadata !== "object" || metadata === null) return undefined
  const outcome = metadata as { readonly exit?: unknown; readonly timeout?: unknown; readonly signal?: unknown }
  if (outcome.timeout === true || outcome.signal !== undefined) return undefined
  const exit = outcome.exit
  return typeof exit === "number" ? exit : undefined
}
