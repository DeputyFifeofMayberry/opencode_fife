import { describe, expect, test } from "bun:test"
import { ProviderUsage } from "@opencode/core/provider-usage"

describe("ProviderUsage.monitorOrigin", () => {
  test("maps the four known family ids and rejects others", () => {
    expect(ProviderUsage.monitorOrigin("zai-coding-plan")).toBe("https://api.z.ai")
    expect(ProviderUsage.monitorOrigin("zai")).toBe("https://api.z.ai")
    expect(ProviderUsage.monitorOrigin("zhipuai-coding-plan")).toBe("https://open.bigmodel.cn")
    expect(ProviderUsage.monitorOrigin("zhipuai")).toBe("https://open.bigmodel.cn")
    expect(ProviderUsage.monitorOrigin("anthropic")).toBeUndefined()
  })
})

describe("ProviderUsage.classify", () => {
  test("200 + success:true + code:200 is ok", () => {
    const body = { code: 200, success: true, data: { limits: [] } }
    expect(ProviderUsage.classify(200, undefined, body)).toEqual({ kind: "ok", data: body.data })
  })
  test("200 + success:false is key_rejected, never empty-ok", () => {
    expect(ProviderUsage.classify(200, undefined, { code: 401, success: false, data: null })).toEqual({
      kind: "key_rejected",
    })
  })
  test("non-JSON garbage body at 200 is unavailable", () => {
    expect(ProviderUsage.classify(200, undefined, "<html>oops</html>")).toEqual({ kind: "unavailable" })
  })
  test("401 is a bearer-retry candidate, 403 is terminal", () => {
    expect(ProviderUsage.classify(401, undefined, {})).toEqual({ kind: "unauthorized" })
    expect(ProviderUsage.classify(403, undefined, {})).toEqual({ kind: "key_rejected" })
  })
  test("429 uses Retry-After with default 300000ms and floor 60000ms", () => {
    expect(ProviderUsage.classify(429, undefined, {})).toEqual({ kind: "rate_limited", retryAfterMs: 300_000 })
    expect(ProviderUsage.classify(429, "120", {})).toEqual({ kind: "rate_limited", retryAfterMs: 120_000 })
    expect(ProviderUsage.classify(429, "5", {})).toEqual({ kind: "rate_limited", retryAfterMs: 60_000 })
  })
  test("5xx is unavailable", () => {
    expect(ProviderUsage.classify(502, undefined, {})).toEqual({ kind: "unavailable" })
  })
})

describe("ProviderUsage.normalize", () => {
  const fetchedAt = 1_770_648_402_389

  test("maps credit 5h + weekly windows and the monthly tool budget", () => {
    const result = ProviderUsage.normalize(
      {
        level: "pro",
        limits: [
          {
            type: "CREDIT_LIMIT",
            unit: 3,
            number: 5,
            usage: 12000,
            currentValue: 1438,
            percentage: 11,
            nextResetTime: fetchedAt,
          },
          {
            type: "CREDIT_LIMIT",
            unit: 6,
            number: 1,
            usage: 60000,
            currentValue: 6000,
            percentage: 10,
            nextResetTime: fetchedAt,
          },
          { type: "TIME_LIMIT", unit: 5, number: 1, usage: 4000, currentValue: 1828, percentage: 45 },
        ],
      },
      fetchedAt,
    )
    expect(result.level).toBe("pro")
    expect(result.windows).toEqual([
      { kind: "five_hour", percent: (1438 / 12000) * 100, used: 1438, total: 12000, resetsAt: fetchedAt },
      { kind: "weekly", percent: 10, used: 6000, total: 60000, resetsAt: fetchedAt },
    ])
    expect(result.tools).toEqual({ used: 1828, limit: 4000 })
  })

  test("legacy TOKENS_LIMIT windows still map", () => {
    const result = ProviderUsage.normalize(
      {
        limits: [
          {
            type: "TOKENS_LIMIT",
            unit: 3,
            number: 5,
            usage: 800,
            currentValue: 800,
            percentage: 100,
            nextResetTime: fetchedAt,
          },
        ],
      },
      fetchedAt,
    )
    expect(result.windows).toHaveLength(1)
    expect(result.windows[0].kind).toBe("five_hour")
  })

  test("nextResetTime in seconds is coerced to ms", () => {
    const result = ProviderUsage.normalize(
      {
        limits: [{ type: "CREDIT_LIMIT", unit: 3, number: 5, usage: 100, currentValue: 1, nextResetTime: 1770648402 }],
      },
      fetchedAt,
    )
    expect(result.windows[0].resetsAt).toBe(1_770_648_402_000)
  })

  test("percentage prefers currentValue/usage and clamps to [0,100]", () => {
    const result = ProviderUsage.normalize(
      {
        limits: [
          { type: "CREDIT_LIMIT", unit: 3, number: 5, usage: 100, currentValue: 250, percentage: 11 },
          { type: "CREDIT_LIMIT", unit: 6, number: 7, usage: 100, currentValue: -5, percentage: 0 },
        ],
      },
      fetchedAt,
    )
    expect(result.windows[0].percent).toBe(100)
    expect(result.windows[1].percent).toBe(0)
  })

  test("weekly number variance (1 vs 7) and unknown units are handled by unit alone", () => {
    const result = ProviderUsage.normalize(
      {
        limits: [
          { type: "CREDIT_LIMIT", unit: 6, number: 7, usage: 100, currentValue: 1 },
          { type: "CREDIT_LIMIT", unit: 9, number: 3, usage: 100, currentValue: 99 },
        ],
      },
      fetchedAt,
    )
    expect(result.windows).toHaveLength(1)
    expect(result.windows[0].kind).toBe("weekly")
  })

  test("empty limits is reported for the no_plan state", () => {
    const result = ProviderUsage.normalize({ limits: [] }, fetchedAt)
    expect(result.windows).toEqual([])
    expect(result.tools).toBeUndefined()
  })
})

describe("ProviderUsage.pickKey", () => {
  test("prefers the resolved connection key", () => {
    expect(ProviderUsage.pickKey({ type: "key", key: "stored" }, { apiKey: "config" })).toBe("stored")
  })
  test("falls back to config settings.apiKey", () => {
    expect(ProviderUsage.pickKey(undefined, { apiKey: "config" })).toBe("config")
    expect(ProviderUsage.pickKey(undefined, { apiKey: "" })).toBeUndefined()
  })
  test("non-key credential shapes yield no key", () => {
    expect(ProviderUsage.pickKey({ type: "oauth" }, undefined)).toBeUndefined()
    expect(ProviderUsage.pickKey(undefined, undefined)).toBeUndefined()
  })
})

describe("ProviderUsage.pickPlanName", () => {
  test("trims productName and tolerates the snake_case variant", () => {
    expect(ProviderUsage.pickPlanName({ data: [{ productName: " Pro " }] })).toBe("Pro")
    expect(ProviderUsage.pickPlanName({ data: [{ product_name: "Max" }] })).toBe("Max")
  })
  test("anything unexpected yields no name", () => {
    expect(ProviderUsage.pickPlanName({ data: [] })).toBeUndefined()
    expect(ProviderUsage.pickPlanName("<html>err</html>")).toBeUndefined()
    expect(ProviderUsage.pickPlanName(undefined)).toBeUndefined()
  })
})

describe("ProviderUsage.shouldRefetch", () => {
  test("no cache refetches; fresh cache does not; force past short TTL does", () => {
    const now = 1_000_000
    expect(ProviderUsage.shouldRefetch(undefined, now, false)).toBe(true)
    expect(ProviderUsage.shouldRefetch({ fetchedAt: now - 60_000 }, now, false)).toBe(false)
    expect(ProviderUsage.shouldRefetch({ fetchedAt: now - 240_000 }, now, false)).toBe(true)
    expect(ProviderUsage.shouldRefetch({ fetchedAt: now - 5_000 }, now, true)).toBe(false)
    expect(ProviderUsage.shouldRefetch({ fetchedAt: now - 30_000 }, now, true)).toBe(true)
  })
  test("rate_limited cache is kept until retryAfter passes", () => {
    const now = 1_000_000
    expect(ProviderUsage.shouldRefetch({ fetchedAt: now - 60_000, retryAfter: now + 60_000 }, now, true)).toBe(false)
    expect(ProviderUsage.shouldRefetch({ fetchedAt: now - 60_000, retryAfter: now - 1 }, now, false)).toBe(true)
  })
})

describe("ProviderUsage.cacheScope", () => {
  test("cache identity includes the resolved credential, not just the providerID", () => {
    // Two locations (or a key rotation) can hold different credentials for the same
    // providerID; one credential's quota snapshot must never be served to the other.
    expect(ProviderUsage.cacheScope("zai-coding-plan", "key-a")).toBe(ProviderUsage.cacheScope("zai-coding-plan", "key-a"))
    expect(ProviderUsage.cacheScope("zai-coding-plan", "key-a")).not.toBe(ProviderUsage.cacheScope("zai-coding-plan", "key-b"))
  })
  test("the separator is unconditional, so id/key pairs cannot collide", () => {
    expect(ProviderUsage.cacheScope("a", "b:c")).not.toBe(ProviderUsage.cacheScope("a:b", "c"))
    expect(ProviderUsage.cacheScope("a", "")).not.toBe(ProviderUsage.cacheScope("", "a"))
  })
})
