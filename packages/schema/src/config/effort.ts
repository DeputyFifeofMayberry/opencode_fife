export * as ConfigEffort from "./effort.js"

import { Schema } from "effect"
import { optional } from "../schema.js"

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
  base_level: Level.pipe(optional).annotate({
    description: "Automatic effort level for sessions without a selected effort (default: standard)",
  }),
  mutating_tools: Schema.String.pipe(Schema.Array).pipe(optional).annotate({
    description:
      "Tool names whose successful settlement advances the workspace revision used to discard stale verification passes (default: write, edit, multiedit, patch)",
  }),
  agent_operations: Schema.Record(Schema.String, Operation).pipe(optional).annotate({
    description: "Maps agent ids to delegation operations that fix subagent starting effort",
  }),
}) {}
