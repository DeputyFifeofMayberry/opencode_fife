export * as ConfigEffort from "./effort.js"

import { Schema } from "effect"
import { optional, PositiveInt } from "../schema.js"

/** Automatic effort levels, least to most expensive; mirrors the decision core. */
export const Level = Schema.Literals(["low", "standard", "deep"])
export type Level = Schema.Schema.Type<typeof Level>

/** What a delegated agent is being asked to do; it fixes the agent's start level. */
export const Operation = Schema.Literals(["general", "explore", "implement", "plan", "review", "mechanical"])
export type Operation = Schema.Schema.Type<typeof Operation>

export class Info extends Schema.Class<Info>("Config.Effort")({
  verification_commands: Schema.String.pipe(Schema.Array).pipe(optional).annotate({
    description:
      "Shell commands treated as verifications: a non-zero exit raises session effort one level until the same command exits zero. The policy is inert while empty.",
  }),
  mode: Schema.Literals(["static", "adaptive"]).pipe(optional).annotate({
    description:
      "static (default) seeds sessions from base_level and escalates on verification failures. adaptive seeds the session level from its agent's operation ladder, raises on failures, and steps down after consecutive clean passes.",
  }),
  base_level: Level.pipe(optional).annotate({
    description:
      "Automatic effort level for sessions without a selected effort in static mode (default: standard); adaptive mode seeds from the agent operation ladder instead",
  }),
  clean_passes: PositiveInt.pipe(optional).annotate({
    description:
      "Adaptive mode: consecutive qualifying clean verification passes before the session level steps down one level (default: 2)",
  }),
  mutating_tools: Schema.String.pipe(Schema.Array).pipe(optional).annotate({
    description:
      "Tool names whose successful settlement advances the workspace revision used to discard stale verification passes (default: write, edit, patch)",
  }),
  agent_operations: Schema.Record(Schema.String, Operation).pipe(optional).annotate({
    description: "Maps agent ids to delegation operations that fix subagent starting effort",
  }),
}) {}
