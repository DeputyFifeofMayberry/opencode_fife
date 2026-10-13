export * as Provider from "./provider.js"

import { Effect, Schema } from "effect"
import { Integration } from "./integration.js"
import { ProviderCompatibility } from "./model-compatibility.js"
import { optional, statics } from "./schema.js"
import { ephemeral, inventory } from "./event.js"

export const ID = Schema.String.pipe(
  Schema.brand("Provider.ID"),
  Schema.annotate({ identifier: "Provider.ID" }),
  statics((schema) => ({
    opencode: schema.make("opencode"),
    anthropic: schema.make("anthropic"),
    openai: schema.make("openai"),
    google: schema.make("google"),
    googleVertex: schema.make("google-vertex"),
    githubCopilot: schema.make("github-copilot"),
    amazonBedrock: schema.make("amazon-bedrock"),
    azure: schema.make("azure"),
    openrouter: schema.make("openrouter"),
    mistral: schema.make("mistral"),
    gitlab: schema.make("gitlab"),
  })),
)
export type ID = typeof ID.Type

const Updated = ephemeral({ type: "provider.updated", schema: {} })
export const Event = { Updated, Definitions: inventory(Updated) }

export const Package = Schema.String
export type Package = typeof Package.Type

export const Activation = Schema.Literals(["auto", "enabled", "disabled"])
export type Activation = typeof Activation.Type

export const Compaction = Schema.Union([
  Schema.Struct({ type: Schema.Literal("summary") }),
  Schema.Struct({ type: Schema.Literal("native") }),
])
  .pipe(Schema.toTaggedUnion("type"))
  .annotate({ identifier: "Provider.Compaction" })
export type Compaction = typeof Compaction.Type

/** "websocket" on a route without a WebSocket channel warns and falls back to HTTP. */
export const Transport = Schema.Literals(["http", "websocket"]).annotate({ identifier: "Provider.Transport" })
export type Transport = typeof Transport.Type

/** HTTP request body compression; only endpoints known to decode it should enable it. */
export const Encoding = Schema.Literals(["zstd", "gzip", "none"]).annotate({ identifier: "Provider.Encoding" })
export type Encoding = typeof Encoding.Type

export const Settings = Schema.StructWithRest(
  Schema.Struct({
    timeout: Schema.Union([Schema.Finite, Schema.Literal(false)]).pipe(optional),
    headerTimeout: Schema.Union([Schema.Finite, Schema.Literal(false)]).pipe(optional),
    chunkTimeout: Schema.Union([Schema.Finite, Schema.Literal(false)]).pipe(optional),
    compaction: Compaction.pipe(optional),
    transport: Transport.pipe(optional),
    encoding: Encoding.pipe(optional),
  }),
  [Schema.Record(Schema.String, Schema.Any)],
).annotate({ identifier: "Provider.Settings" })
export type Settings = typeof Settings.Type

export const Overlays = {
  settings: Settings.pipe(optional),
  headers: Schema.Record(Schema.String, Schema.String).pipe(optional),
  body: Schema.Record(Schema.String, Schema.Any).pipe(optional),
}

export interface Request extends Schema.Schema.Type<typeof Request> {}
export const Request = Schema.Struct({
  settings: Settings.pipe(Schema.withConstructorDefault(Effect.succeed({}))),
  headers: Schema.Record(Schema.String, Schema.String),
  body: Schema.Record(Schema.String, Schema.Any),
}).annotate({ identifier: "Provider.Request" })

export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  id: ID,
  canonical: ID.pipe(optional),
  integrationID: Integration.ID.pipe(optional),
  name: Schema.String,
  activation: Activation,
  package: Package,
  /** Inherited by every model of this provider; model compatibility overrides individual fields. */
  compatibility: ProviderCompatibility.pipe(optional),
  ...Overlays,
})
  .annotate({ identifier: "Provider.Info" })
  .pipe(
    statics(() => ({
      empty: (id: ID): Info => ({ id, name: id, activation: "auto", package: "" }),
    })),
  )

export interface UsageWindow extends Schema.Schema.Type<typeof UsageWindow> {}
export const UsageWindow = Schema.Struct({
  kind: Schema.Literals(["five_hour", "weekly"]),
  percent: Schema.Number,
  used: Schema.Number,
  total: Schema.Number,
  resetsAt: Schema.optional(Schema.Number), // epoch ms
}).annotate({ identifier: "Provider.UsageWindow" })

export interface UsageSnapshot extends Schema.Schema.Type<typeof UsageSnapshot> {}
export const UsageSnapshot = Schema.Struct({
  providerID: ID,
  state: Schema.Literals([
    "ok",
    "no_plan",
    "key_rejected",
    "rate_limited",
    "unavailable",
    "not_signed_in",
    "unsupported_endpoint",
  ]),
  plan: Schema.Struct({
    level: Schema.optional(Schema.String),
    name: Schema.optional(Schema.String),
  }),
  windows: Schema.Array(UsageWindow),
  tools: Schema.optional(Schema.Struct({ used: Schema.Number, limit: Schema.Number })),
  fetchedAt: Schema.Number, // epoch ms of the upstream data; may be older than the request when served from cache
  retryAfter: Schema.optional(Schema.Number), // epoch ms; present only for "rate_limited"
}).annotate({ identifier: "Provider.UsageSnapshot" })
