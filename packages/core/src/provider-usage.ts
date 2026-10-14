export * as ProviderUsage from "./provider-usage.js"

import { Deferred, Effect, Predicate, Schema } from "effect"
import { HttpClient, HttpClientRequest } from "effect/http"
import type { UsageSnapshot, UsageWindow } from "@opencode/schema/provider"
import { Integration } from "./integration.js"
import { Provider } from "./provider.js"

export const CACHE_TTL_MS = 240_000
export const FORCE_TTL_MS = 15_000
export const REQUEST_TIMEOUT = "10 seconds"
export const RETRY_AFTER_DEFAULT_MS = 300_000
export const RETRY_AFTER_FLOOR_MS = 60_000

export type FetchOutcome =
  | { kind: "ok"; data: unknown }
  | { kind: "unauthorized" }
  | { kind: "key_rejected" }
  | { kind: "rate_limited"; retryAfterMs: number }
  | { kind: "unavailable" }

const ORIGINS: Readonly<Record<string, string>> = {
  "zai-coding-plan": "https://api.z.ai",
  zai: "https://api.z.ai",
  "zhipuai-coding-plan": "https://open.bigmodel.cn",
  zhipuai: "https://open.bigmodel.cn",
}

/** The monitor API origin for known Z.ai provider families; the configured baseURL is deliberately never used. */
export const monitorOrigin = (providerID: string): string | undefined => ORIGINS[providerID]

export function classify(status: number, retryAfterHeader: string | undefined, body: unknown): FetchOutcome {
  if (status === 200) {
    if (!Predicate.isObject(body)) return { kind: "unavailable" }
    if (body.success === true && body.code === 200) return { kind: "ok", data: body.data }
    return { kind: "key_rejected" }
  }
  if (status === 401) return { kind: "unauthorized" }
  if (status === 403) return { kind: "key_rejected" }
  if (status === 429) {
    const seconds = Number.parseFloat(retryAfterHeader ?? "")
    const retryAfterMs =
      Number.isFinite(seconds) && seconds > 0 ? Math.max(seconds * 1_000, RETRY_AFTER_FLOOR_MS) : RETRY_AFTER_DEFAULT_MS
    return { kind: "rate_limited", retryAfterMs }
  }
  return { kind: "unavailable" }
}

export function normalize(
  data: unknown,
  fetchedAt: number,
): { windows: UsageWindow[]; tools?: { used: number; limit: number }; level?: string } {
  const envelope = Predicate.isObject(data) ? data : undefined
  const limits = envelope !== undefined && Array.isArray(envelope.limits) ? envelope.limits : []
  const level = typeof envelope?.level === "string" ? envelope.level : undefined
  const toolLimit = limits.find((limit) => Predicate.isObject(limit) && limit.type === "TIME_LIMIT" && limit.unit === 5)
  return {
    windows: limits.flatMap(window),
    ...(level === undefined ? {} : { level }),
    ...(toolLimit === undefined
      ? {}
      : { tools: { used: numberOr(toolLimit.currentValue), limit: numberOr(toolLimit.usage) } }),
  }
}

/** Verified unit pairs: unit 3 is the 5h window, unit 6 the weekly window (its `number` varies); other units are ignored. */
function window(limit: unknown): UsageWindow[] {
  if (!Predicate.isObject(limit)) return []
  if (limit.type !== "CREDIT_LIMIT" && limit.type !== "TOKENS_LIMIT") return []
  const kind = limit.unit === 3 ? "five_hour" : limit.unit === 6 ? "weekly" : undefined
  if (kind === undefined) return []
  const total = finiteOr(limit.usage)
  const used = finiteOr(limit.currentValue)
  const percent =
    total !== undefined && total > 0 && used !== undefined
      ? Math.min(100, Math.max(0, (used / total) * 100))
      : finiteOr(limit.percentage) ?? 0
  const reset = finiteOr(limit.nextResetTime)
  return [
    {
      kind,
      percent,
      used: used ?? 0,
      total: total ?? 0,
      ...(reset === undefined ? {} : { resetsAt: reset < 1e12 ? reset * 1_000 : reset }),
    },
  ]
}

export function pickKey(
  credential: { type: string; key?: string } | undefined,
  settings: Readonly<Record<string, unknown>> | undefined,
): string | undefined {
  if (credential?.type === "key" && credential.key) return credential.key
  const apiKey = settings?.apiKey
  return typeof apiKey === "string" && apiKey.length > 0 ? apiKey : undefined
}

export function pickPlanName(body: unknown): string | undefined {
  if (!Predicate.isObject(body) || !Array.isArray(body.data)) return undefined
  const subscription = body.data[0]
  if (!Predicate.isObject(subscription)) return undefined
  const name =
    typeof subscription.productName === "string"
      ? subscription.productName
      : typeof subscription.product_name === "string"
        ? subscription.product_name
        : undefined
  const trimmed = name?.trim()
  return trimmed === undefined || trimmed === "" ? undefined : trimmed
}

export function shouldRefetch(
  cached: { fetchedAt: number; retryAfter?: number } | undefined,
  now: number,
  force: boolean,
): boolean {
  if (cached === undefined) return true
  // A retryAfter marker is authoritative: hold the degraded snapshot until it passes, then refetch even inside the TTL.
  if (cached.retryAfter !== undefined) return now >= cached.retryAfter
  return now - cached.fetchedAt >= (force ? FORCE_TTL_MS : CACHE_TTL_MS)
}

function finiteOr(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function numberOr(value: unknown): number {
  return finiteOr(value) ?? 0
}

export class ProviderNotFoundError extends Schema.TaggedError<ProviderNotFoundError>()(
  "ProviderUsage.ProviderNotFound",
  {
    providerID: Provider.ID,
    message: Schema.String,
  },
) {}

type CacheEntry = { fetchedAt: number; retryAfter?: number; snapshot: UsageSnapshot }

// Cache/in-flight identity: one credential's quota snapshot must never serve another's.
// Two locations (or a key rotation) can hold different credentials for the same providerID,
// so the resolved key is part of the map key, not just the providerID. The pair is JSON-encoded
// so an id containing the separator cannot impersonate a longer id.
export function cacheScope(providerID: string, credential: string): string {
  return JSON.stringify([providerID, credential])
}

const cache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Deferred.Deferred<UsageSnapshot>>()

export const snapshot = Effect.fn("ProviderUsage.snapshot")(
  function* (providerID: Provider.ID, options?: { force?: boolean }) {
    const origin = monitorOrigin(providerID)
    if (origin === undefined) return bare(providerID, "unsupported_endpoint", Date.now())

    const providers = yield* Provider.Service
    const provider = yield* providers.get(providerID)
    if (provider === undefined)
      return yield* new ProviderNotFoundError({ providerID, message: `Provider not found: ${providerID}` })

    const integrations = yield* Integration.Service
    const connection = yield* integrations.connection.active(
      provider.integrationID ?? Integration.ID.make(providerID),
    )
    const credential = connection
      ? yield* integrations.connection.resolve(connection).pipe(Effect.orElseSucceed(() => undefined))
      : undefined
    const key = pickKey(credential, provider.settings)
    if (key === undefined) return bare(providerID, "not_signed_in", Date.now())

    const scope = cacheScope(providerID, key)
    const cached = cache.get(scope)
    if (cached !== undefined && !shouldRefetch(cached, Date.now(), options?.force === true)) return cached.snapshot

    const running = inFlight.get(scope)
    if (running !== undefined) return yield* Deferred.await(running)

    // One upstream fetch per burst: the winner publishes its exit through the deferred, joiners await it.
    // makeUnsafe keeps the get/set pair synchronous, so concurrent callers cannot both claim the slot.
    const deferred = Deferred.makeUnsafe<UsageSnapshot>()
    inFlight.set(scope, deferred)
    return yield* fetchSnapshot(providerID, origin, key, scope).pipe(
      Effect.onExit((exit) =>
        Effect.sync(() => {
          if (inFlight.get(scope) === deferred) inFlight.delete(scope)
          Deferred.doneUnsafe(deferred, exit)
        }),
      ),
    )
  },
)

function bare(providerID: Provider.ID, state: UsageSnapshot["state"], fetchedAt: number): UsageSnapshot {
  return { providerID, state, plan: {}, windows: [], fetchedAt }
}

const fetchSnapshot = Effect.fnUntraced(function* (providerID: Provider.ID, origin: string, key: string, scope: string) {
  const http = yield* HttpClient.HttpClient
  const last = cache.get(scope)
  const quota = yield* quotaWithAuth(http, origin, key)
  const now = Date.now()

  if (quota.outcome.kind === "ok") {
    const data = normalize(quota.outcome.data, now)
    const name = yield* planName(http, origin, quota.authorization)
    const snapshot: UsageSnapshot = {
      providerID,
      state: data.windows.length === 0 && data.tools === undefined ? "no_plan" : "ok",
      plan: {
        ...(data.level === undefined ? {} : { level: data.level }),
        ...(name === undefined ? {} : { name }),
      },
      windows: data.windows,
      ...(data.tools === undefined ? {} : { tools: data.tools }),
      fetchedAt: now,
    }
    cache.set(scope, { snapshot, fetchedAt: now })
    return snapshot
  }

  if (quota.outcome.kind === "rate_limited") {
    const retryAfter = now + quota.outcome.retryAfterMs
    const snapshot: UsageSnapshot =
      last === undefined
        ? { ...bare(providerID, "rate_limited", now), retryAfter }
        : { ...last.snapshot, state: "rate_limited", retryAfter }
    cache.set(scope, { snapshot, fetchedAt: now, retryAfter })
    return snapshot
  }

  if (quota.outcome.kind === "unavailable") {
    const snapshot: UsageSnapshot =
      last === undefined ? bare(providerID, "unavailable", now) : { ...last.snapshot, state: "unavailable" }
    cache.set(scope, { snapshot, fetchedAt: now })
    return snapshot
  }

  return bare(providerID, "key_rejected", now)
})

/** Raw key first; a 401 retries once with the Bearer scheme, and a second 401 is terminal. */
function quotaWithAuth(
  http: HttpClient.HttpClient,
  origin: string,
  key: string,
): Effect.Effect<{ outcome: FetchOutcome; authorization: string }> {
  return Effect.gen(function* () {
    const first = yield* attemptQuota(http, origin, key)
    if (first.kind !== "unauthorized") return { outcome: first, authorization: key }
    const authorization = `Bearer ${key}`
    const retry = yield* attemptQuota(http, origin, authorization)
    if (retry.kind === "unauthorized") return { outcome: { kind: "key_rejected" }, authorization }
    return { outcome: retry, authorization }
  })
}

const attemptQuota = (http: HttpClient.HttpClient, origin: string, authorization: string) =>
  http
    .execute(
      HttpClientRequest.get(`${origin}/api/monitor/usage/quota/limit`).pipe(
        HttpClientRequest.setHeader("Authorization", authorization),
        HttpClientRequest.setHeader("Accept-Language", "en-US,en"),
      ),
    )
    .pipe(
      Effect.timeout(REQUEST_TIMEOUT),
      Effect.flatMap((response) =>
        response.json.pipe(
          Effect.orElseSucceed(() => undefined),
          Effect.map((body) => classify(response.status, response.headers["retry-after"], body)),
        ),
      ),
      // Transport failures and timeouts degrade to unavailable instead of failing the snapshot.
      Effect.catch(() => Effect.succeed<FetchOutcome>({ kind: "unavailable" })),
    )

/** Best-effort plan name; any failure keeps `plan.name` absent without touching meters or state. */
const planName = (http: HttpClient.HttpClient, origin: string, authorization: string) =>
  http
    .execute(
      HttpClientRequest.get(`${origin}/api/biz/subscription/list`).pipe(
        HttpClientRequest.setHeader("Authorization", authorization),
      ),
    )
    .pipe(
      Effect.timeout(REQUEST_TIMEOUT),
      Effect.flatMap((response) => response.json.pipe(Effect.orElseSucceed(() => undefined))),
      Effect.map(pickPlanName),
      Effect.catch(() => Effect.succeed<string | undefined>(undefined)),
    )

