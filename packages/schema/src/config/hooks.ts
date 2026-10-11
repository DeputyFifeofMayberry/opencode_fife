export * as ConfigHooks from "./hooks.js"

import { Schema } from "effect"
import { optional } from "../schema.js"

export interface Entry extends Schema.Schema.Type<typeof Entry> {}
export const Entry = Schema.Struct({
  matcher: optional(Schema.String).annotate({
    description: "Regular expression matched against the tool name; omitted runs on every tool call",
  }),
  command: Schema.String.annotate({
    description: "Shell command run with the pending tool call as JSON on stdin",
  }),
}).annotate({ identifier: "Config.Hooks.Entry" })

export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Array(Entry).annotate({ identifier: "Config.Hooks" })
