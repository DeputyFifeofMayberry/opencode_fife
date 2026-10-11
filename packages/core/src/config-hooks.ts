export * as ConfigHooks from "./config-hooks.js"

import { Duration, Effect, Option, Predicate, Schema } from "effect"
import { ChildProcess } from "effect/process"
import type { Entry } from "@opencode/schema/config/hooks"
import { AppProcess } from "@opencode/util/process"

/**
 * Config hook (PreToolUse) runner honoring the Claude Code exit-code and JSON
 * envelope contract: exit 2 blocks with stderr as the model-facing reason,
 * exit 49 halts the turn, and a stdout envelope may deny, patch the input, or
 * add context. Any other failure is non-blocking and the tool proceeds.
 */

export class HaltError extends Schema.TaggedError<HaltError>()("ConfigHooks.HaltError", {}) {}

export type Verdict =
  | { readonly decision: "allow"; readonly updatedInput?: unknown; readonly context?: string }
  | { readonly decision: "deny"; readonly reason: string }
  | { readonly decision: "halt" }

export interface Input {
  readonly entries: ReadonlyArray<Entry>
  readonly tool: string
  readonly toolInput: unknown
  readonly sessionID: string
  readonly cwd: string
}

export const TIMEOUT = Duration.seconds(60)

// A blocked call must always carry a model-facing reason, even from a silent hook.
const BLOCKED = "Blocked by a config hook"
const OUTPUT_BYTES = 1024 * 1024
const ERROR_BYTES = 64 * 1024

const Envelope = Schema.Struct({
  decision: Schema.optional(Schema.Literals(["allow", "deny"])),
  reason: Schema.optional(Schema.String),
  updatedInput: Schema.optional(Schema.Unknown),
  context: Schema.optional(Schema.String),
})
const decodeJson = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown))
const decodeEnvelope = Schema.decodeUnknownOption(Envelope)

type Outcome = Verdict | undefined

export const run = Effect.fn("ConfigHooks.run")(function* (
  processes: AppProcess.Interface,
  input: Input,
  options?: { readonly timeout?: Duration.Input },
) {
  const matching = Effect.fnUntraced(function* (entry: Entry) {
    if (entry.matcher === undefined || entry.matcher === "") return [entry]
    try {
      return new RegExp(entry.matcher).test(input.tool) ? [entry] : []
    } catch (cause) {
      yield* Effect.logWarning("config hook matcher is not a valid regular expression", {
        matcher: entry.matcher,
        cause,
      })
      return []
    }
  })
  const matched = (yield* Effect.forEach(input.entries, matching)).flat()
  if (matched.length === 0) return { decision: "allow" as const }
  const payload = JSON.stringify({
    hook_event_name: "PreToolUse",
    session_id: input.sessionID,
    cwd: input.cwd,
    tool_name: input.tool,
    tool_input: input.toolInput ?? {},
  })
  // Entries run concurrently; verdicts combine over the original input in config order.
  const outcomes = yield* Effect.forEach(
    matched,
    (entry) => evaluate(processes, entry.command, payload, options?.timeout ?? TIMEOUT),
    { concurrency: "unbounded" },
  )
  return combine(input.toolInput, outcomes)
})

const evaluate = Effect.fnUntraced(function* (
  processes: AppProcess.Interface,
  command: string,
  payload: string,
  timeout: Duration.Input,
) {
  const result = yield* processes
    .run(ChildProcess.make(command, [], { shell: true, extendEnv: true }), {
      stdin: payload,
      timeout,
      maxOutputBytes: OUTPUT_BYTES,
      maxErrorBytes: ERROR_BYTES,
    })
    .pipe(
      Effect.catch((cause) => Effect.logWarning("config hook failed", { command, cause }).pipe(Effect.as(undefined))),
    )
  if (result === undefined) return undefined
  const stderr = result.stderr.toString("utf8").trim()
  const stdout = result.stdout.toString("utf8").trim()
  if (result.exitCode === 2) return { decision: "deny" as const, reason: stderr || BLOCKED }
  if (result.exitCode === 49) return { decision: "halt" as const }
  if (result.exitCode !== 0) {
    yield* Effect.logWarning("config hook failed", { command, exit: result.exitCode, stderr })
    return undefined
  }
  if (!stdout) return undefined
  const envelope = Option.getOrUndefined(Option.flatMap(decodeJson(stdout), decodeEnvelope))
  if (envelope === undefined) return undefined
  if (envelope.decision === "deny") return { decision: "deny" as const, reason: envelope.reason || stderr || BLOCKED }
  return {
    decision: "allow" as const,
    ...(envelope.updatedInput !== undefined ? { updatedInput: envelope.updatedInput } : {}),
    ...(envelope.context !== undefined ? { context: envelope.context } : {}),
  }
})

const combine = (toolInput: unknown, outcomes: ReadonlyArray<Outcome>): Verdict => {
  const deny = outcomes.find((outcome) => outcome?.decision === "deny")
  if (deny?.decision === "deny") return { decision: "deny", reason: deny.reason }
  if (outcomes.some((outcome) => outcome?.decision === "halt")) return { decision: "halt" }
  const patches = outcomes.flatMap((outcome) =>
    outcome?.decision === "allow" && Predicate.isObject(outcome.updatedInput) ? [outcome.updatedInput] : [],
  )
  const contexts = outcomes.flatMap((outcome) =>
    outcome?.decision === "allow" && outcome.context !== undefined && outcome.context !== ""
      ? [outcome.context]
      : [],
  )
  return {
    decision: "allow",
    ...(patches.length > 0
      ? { updatedInput: Object.assign(Predicate.isObject(toolInput) ? { ...toolInput } : {}, ...patches) }
      : {}),
    ...(contexts.length > 0 ? { context: contexts.join("\n") } : {}),
  }
}
