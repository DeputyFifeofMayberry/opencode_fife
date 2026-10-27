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
 * tools advance the workspace revision their settlement observed, which is what
 * makes a later pass stale when it predates the failing state. Command matching
 * is exact per segment, so compound commands (`a && typecheck`) match on any
 * segment; the verifier identity is the matched configured command. The v1
 * identity omits the working directory: escalation state is per session, and
 * the configured command is the stable part of the core's opaque identity.
 */
export const observe = Effect.fn("EffortEvidence.observe")(function* (
  deps: {
    readonly db: Database.Interface["db"]
    readonly efforts: EffortStore.Interface
    readonly config: Config.Interface
  },
  sessionID: SessionSchema.ID,
  settlement: { readonly tool: string; readonly input: unknown; readonly metadata: unknown },
) {
  const settings = Config.latest(yield* deps.config.entries(), "effort_policy")
  const verifiers = settings?.verification_commands ?? []
  const mutating = settings?.mutating_tools ?? ["write", "edit", "patch"]

  if (mutating.includes(settlement.tool)) yield* deps.efforts.bumpRevision(sessionID)

  const command = commandOf(settlement.input)
  const exit = exitOf(settlement.metadata)
  if (command === undefined || exit === undefined) return
  const verifier = matchVerifier(command, verifiers)
  if (verifier === undefined) return

  const sequence = (yield* Bus.latestSequence(deps.db, sessionID)) + 1
  yield* Bus.reserveSequence(deps.db, sessionID, sequence)
  const row = yield* deps.efforts.get(sessionID)
  const next = applyEvidence(
    {
      base: row?.baseLevel ?? "standard",
      ...(row?.openFailure === undefined ? {} : { openFailure: row.openFailure }),
      ...(row?.lastAppliedVariant === undefined ? {} : { lastAppliedVariant: row.lastAppliedVariant }),
    },
    {
      kind: exit === 0 ? "verification-pass" : "verification-failure",
      verifier,
      sequence,
      revision: row?.revision ?? 0,
    },
  )
  yield* deps.efforts.setOpenFailure(sessionID, next.openFailure)
})

/** The configured command a settled call matches, or undefined for unconfigured calls. */
export function matchVerifier(command: string, verifiers: readonly string[]): string | undefined {
  const configured = verifiers.map((verifier) => verifier.trim())
  for (const segment of command.split(/&&|;/).map((part) => part.trim())) {
    if (segment.length === 0) continue
    const match = configured.find((verifier) => verifier === segment)
    if (match !== undefined) return match
  }
  return undefined
}

function commandOf(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null) return undefined
  const command = (input as { readonly command?: unknown }).command
  return typeof command === "string" ? command : undefined
}

function exitOf(metadata: unknown): number | undefined {
  if (typeof metadata !== "object" || metadata === null) return undefined
  const exit = (metadata as { readonly exit?: unknown }).exit
  return typeof exit === "number" ? exit : undefined
}
