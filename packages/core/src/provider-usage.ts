export * as ProviderUsage from "./provider-usage.js"

import { Predicate } from "effect"
import type { UsageWindow } from "@opencode/schema/provider"

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
