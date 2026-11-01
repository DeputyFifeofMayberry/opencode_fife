export * as EffortEvidence from "./evidence.js"

import { Effect } from "effect"
import type { Database } from "../database/database.js"
import type { ConfigEffort } from "@opencode/schema/config/effort"
import type { SessionSchema } from "../session/schema.js"
import { applyEvidence } from "./policy/index.js"
import { EffortStore } from "./store.js"

/**
 * Observes one settled tool call and applies it to the session's durable state.
 *
 * Classification is delegated to `classify`, so the model path and the idle harness
 * cannot disagree about what a verifier run is. Settings arrive already resolved, so this
 * module reads no configuration. The observation order is claimed and the policy's output
 * written in one transaction; a settlement whose expected revision no longer matches claims
 * nothing. The workspace revision is not touched here — it advances when a mutating tool
 * starts.
 */
export const observe = Effect.fn("EffortEvidence.observe")(function* (
  deps: {
    readonly db: Database.Interface["db"]
    readonly efforts: EffortStore.Interface
  },
  settings: ConfigEffort.Info | undefined,
  sessionID: SessionSchema.ID,
  settlement: Settlement & { readonly expectedRevision?: number },
) {
  const verdict = classify(settings, settlement)
  if (verdict.kind === "not-a-verifier" || verdict.kind === "infrastructure") return

  yield* deps.db.transaction(() =>
    Effect.gen(function* () {
      const sequence = yield* deps.efforts.claimSequence(sessionID, settlement.expectedRevision)
      if (sequence === undefined) return
      const row = yield* deps.efforts.get(sessionID)
      if (row === undefined) return
      const adaptive = settings?.mode === "adaptive"
      const state = {
        base: row.baseLevel,
        ...(row.openFailure === undefined ? {} : { openFailure: row.openFailure }),
        ...(row.lastAppliedVariant === undefined ? {} : { lastAppliedVariant: row.lastAppliedVariant }),
        ...(adaptive
          ? {
              level: row.level ?? row.baseLevel,
              cleanPasses: row.cleanPasses ?? 0,
              cleanPassesNeeded: settings?.clean_passes ?? 2,
            }
          : {}),
      }
      const next = applyEvidence(state, {
        kind: verdict.kind,
        verifier: verdict.verifier,
        sequence,
        revision: row.revision,
      })
      yield* deps.efforts.recordEvidence(sessionID, {
        openFailure: next.openFailure,
        ...(adaptive ? { level: next.level ?? state.base, cleanPasses: next.cleanPasses ?? 0 } : {}),
      })
    }),
  ).pipe(Effect.orDie)
})

/** One finished tool call, before anything has been decided about it. */
export interface Settlement {
  readonly tool: string
  readonly input: unknown
  readonly metadata: unknown
}

/** What one settlement means for the session's verification state. */
export type VerifierVerdict =
  | { readonly kind: "not-a-verifier" }
  | { readonly kind: "infrastructure" }
  | { readonly kind: "verification-pass"; readonly verifier: string }
  | { readonly kind: "verification-failure"; readonly verifier: string }

/** Tool name the idle harness uses for its settlements, so both paths agree it is a verifier. */
export const HARNESS_TOOL = "harness-verifier"

/**
 * Decide what one finished tool call means, given resolved settings.
 *
 * Pure: it reads no configuration and performs no I/O, so the model path and the idle
 * harness reach the same verdict from the same facts. Only a configured command's own
 * exit counts; infrastructure outcomes leave the state untouched.
 */
export function classify(settings: ConfigEffort.Info | undefined, settlement: Settlement): VerifierVerdict {
  if (settlement.tool !== "shell" && settlement.tool !== HARNESS_TOOL) return { kind: "not-a-verifier" }
  const command = commandOf(settlement.input)
  if (command === undefined) return { kind: "not-a-verifier" }
  const verifier = matchVerifier(command, settings?.verification_commands ?? [])
  if (verifier === undefined) return { kind: "not-a-verifier" }
  const exit = exitOf(settlement.metadata)
  if (exit === undefined) return { kind: "infrastructure" }
  return { kind: exit === 0 ? "verification-pass" : "verification-failure", verifier }
}

/** Configured commands that already produced a warning in this process. */
const warnedCommands = new Set<string>()

/**
 * Warn once per distinct configured command that can never be attributed.
 *
 * A compound or decorated entry silently disables escalation, so it is worth saying out
 * loud — but only once per process, not on every step.
 */
export const warnUnmatchable = Effect.fn("EffortEvidence.warnUnmatchable")(function* (
  settings: ConfigEffort.Info | undefined,
) {
  const configured = (settings?.verification_commands ?? []).map((command) => command.trim())
  const pending = [...new Set(configured)].filter(
    (command) =>
      command.length > 0 && matchVerifier(command, [command]) === undefined && !warnedCommands.has(command),
  )
  pending.forEach((command) => warnedCommands.add(command))
  yield* Effect.forEach(
    pending,
    (command) => Effect.logWarning("configured verification command is not a simple command", { command }),
    { discard: true },
  )
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
    value === verifier,
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
