# Z.ai Usage Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show Z.ai GLM Coding Plan usage (5h window, weekly window, monthly MCP tool budget, plan tier/name) as an opt-in experiment in the TUI session sidebar.

**Architecture:** A core namespace module (`ProviderUsage`) resolves the provider's credential exactly like model resolution does, calls Z.ai's monitor API server-side, normalizes the response into a typed snapshot (with a 4-minute TTL cache), and serves it via a new always-200 `GET /api/provider/:providerID/usage` endpoint. A TUI sidebar plugin fetches that snapshot through the generated SDK client and renders states; an experiment gate plus a coding-plan visibility rule keep it hidden otherwise.

**Tech Stack:** Effect v4 (Effect.fn, Schema, HttpClient via `effect/http`), Bun, Solid-js TUI plugins, HttpApi protocol groups, generated SDK client.

**Spec:** `docs/superpowers/specs/2026-10-13-zai-usage-sidebar-design.md` (executors read both; the spec explains WHY, this plan pins the HOW)

## Global Constraints

- Snapshot contract: the endpoint always returns 200 with a `state` field; upstream failures never become HTTP errors. Declared protocol errors only: `ProviderNotFoundError` (unknown providerID), `ServiceUnavailableError` (declared, unused).
- Auth: raw API key in `Authorization` (no Bearer prefix); on HTTP 401 retry ONCE with `Bearer <key>`; still 401/403 → `key_rejected`.
- Timeout 10s per upstream request. Cache TTL 4 min; force-refresh short TTL 15s; client poll cadence 5 min; `Retry-After` default 300_000ms, floor 60_000ms.
- Monitor origin by provider family, NEVER by configured `baseURL`: `zai-coding-plan`/`zai` → `https://api.z.ai`; `zhipuai-coding-plan`/`zhipuai` → `https://open.bigmodel.cn`; anything else → `unsupported_endpoint` state.
- Envelope gate: `success === true && code === 200` required; `200 + success:false` → `key_rejected` (usually auth), never empty data. Empty/missing `limits` → `no_plan`, not 0%.
- Window mapping: match on `unit` only — `{unit:3, number:5}` → `five_hour`; `{unit:6}` → `weekly` (number varies 1|7); `{unit:5}` on `TIME_LIMIT` → monthly tool budget; unknown units ignored.
- `percentage` is server-rounded: prefer `currentValue/usage`, clamp to [0,100]. `nextResetTime` is epoch ms; values < 10^12 are seconds → multiply by 1000.
- Visibility: only when the session's active model providerID is `zai-coding-plan` or `zhipuai-coding-plan`.
- Experiment id: `zai_usage` (snake_case to match `portable_shell_scanner`). Registry entry in `dialog-experiments.tsx`; do not modify the Experiments infrastructure.
- Theme: `theme.text.base` / `theme.text.muted` only; `theme.text.feedback.warning` (match the nesting shape of `theme.text.feedback.error.base`) allowed only for windows > 90% used. No new theme tokens.
- Never edit generated client files; run `bun run generate` from repo root after protocol changes.
- Tests run from package directories (`bun run test test/<file>.ts` from `packages/core`), never repo root. Fixture JSON, not mocks.
- Conventional commits (`feat(schema):`, `feat(protocol):`, `feat(core):`, `feat(server):`, `feat(tui):`). Work in an isolated worktree/branch (using-git-worktrees) created from the current HEAD — this checkout tracks `main` with unrelated local modifications; do not touch those files.

## Review Focus

1. A stored credential that is not an API key (e.g. oauth-typed) or a provider with no key at all → `not_signed_in` state, never a crash or a 500. Pinned by the `pickKey` unit test in Task 3.
2. Z.ai returning HTTP 200 with a non-JSON body (HTML error page) → `unavailable` state with last-known data, never a thrown parse error. Pinned by the `classify` garbage-body test in Task 3.
3. Z.ai shipping a new limit `type`/`unit` combination → unknown windows ignored, known windows still render, no crash. Pinned by the `normalize` unknown-unit fixture test in Task 3.
4. A fresh session with no active model → sidebar item hidden and no client fetch fired. Pinned by the `Show when` guard structure in Task 5 (manual check in Task 6).
5. Cache/retry timing after server restart or rate-limit → a rate-limited snapshot is served until `retryAfter`, then refetched; a cached `ok` snapshot past TTL refetches on next request. Pinned by the `shouldRefetch` test in Task 3.

---

### Task 1: Schema — usage snapshot + experimental key

**Files:**
- Modify: `packages/schema/src/provider.ts` (append after `Provider.Info`, ~line 96)
- Modify: `packages/schema/src/config/experimental.ts` (inside `ConfigExperimental.Info`, after `portable_shell_scanner`)

**Interfaces:**
- Produces: `Provider.UsageSnapshot` (schema + `interface UsageSnapshot extends Schema.Schema.Type<typeof UsageSnapshot>`) used by Task 2 (protocol), Task 3 (core), Task 5 (via generated client types).
- Produces: `zai_usage` key on `ConfigExperimental.Info`.

- [ ] **Step 1: Add the snapshot schema to `packages/schema/src/provider.ts`**

Append at end of file (same style as `Info` above it):

```ts
export interface UsageWindow extends Schema.Schema.Type<typeof UsageWindow> {}
export const UsageWindow = Schema.Struct({
  kind: Schema.Literal("five_hour", "weekly"),
  percent: Schema.Number,
  used: Schema.Number,
  total: Schema.Number,
  resetsAt: Schema.optional(Schema.Number), // epoch ms
}).annotate({ identifier: "Provider.UsageWindow" })

export interface UsageSnapshot extends Schema.Schema.Type<typeof UsageSnapshot> {}
export const UsageSnapshot = Schema.Struct({
  providerID: ID,
  state: Schema.Literal(
    "ok",
    "no_plan",
    "key_rejected",
    "rate_limited",
    "unavailable",
    "not_signed_in",
    "unsupported_endpoint",
  ),
  plan: Schema.Struct({
    level: Schema.optional(Schema.String),
    name: Schema.optional(Schema.String),
  }),
  windows: Schema.Array(UsageWindow),
  tools: Schema.optional(Schema.Struct({ used: Schema.Number, limit: Schema.Number })),
  fetchedAt: Schema.Number, // epoch ms of the upstream data; may be older than the request when served from cache
  retryAfter: Schema.optional(Schema.Number), // epoch ms; present only for "rate_limited"
}).annotate({ identifier: "Provider.UsageSnapshot" })
```

- [ ] **Step 2: Add the experiment key to `packages/schema/src/config/experimental.ts`**

Inside `ConfigExperimental.Info`, mirroring the `portable_shell_scanner` entry:

```ts
  zai_usage: Schema.Boolean.pipe(optional).annotate({
    description: "Show Z.ai GLM Coding Plan usage in the session sidebar. Defaults to false.",
  }),
```

- [ ] **Step 3: Verify**

Run: `bun typecheck` (from `packages/schema`)
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/schema/src/provider.ts packages/schema/src/config/experimental.ts
git commit -m "feat(schema): add provider usage snapshot and zai_usage experiment key"
```

### Task 2: Protocol — `provider.usage` endpoint + regenerate client

**Files:**
- Modify: `packages/protocol/src/groups/provider.ts` (add a third `.add(...)` to `ProviderGroup`, after `provider.get`)

**Interfaces:**
- Consumes: `Provider.UsageSnapshot` from Task 1.
- Produces: generated client method `client.provider.usage({ providerID, location? })` returning `{ location, data: UsageSnapshot }` — used by Task 5.

- [ ] **Step 1: Add the endpoint to `ProviderGroup`**

Clone the `provider.get` template already in the file:

```ts
  .add(
    HttpApiEndpoint.get("provider.usage", "/api/provider/:providerID/usage", {
      params: { providerID: Provider.ID },
      query: LocationQuery,
      success: Location.response(Provider.UsageSnapshot),
      error: [ProviderNotFoundError, ServiceUnavailableError],
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "provider.usage",
          summary: "Get provider usage",
          description:
            "Return the provider's coding-plan usage snapshot. Upstream fetch problems are encoded in the snapshot state, not as HTTP errors.",
        }),
      ),
  )
```

- [ ] **Step 2: Regenerate the client**

Run: `bun run generate` (from repo root)
Expected: no errors; `packages/client/src/promise/generated/client.ts` and `packages/client/src/effect/generated/client.ts` gain a `usage` sibling next to `provider.list`/`provider.get`.

- [ ] **Step 3: Verify generation**

Run: `grep -n "usage" packages/client/src/promise/generated/client.ts`
Expected: a `usage: (input: ProviderUsageInput, ...)` entry under `provider:`.

- [ ] **Step 4: Verify types**

Run: `bun typecheck` (from `packages/protocol`)
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/protocol/src/groups/provider.ts packages/client packages/protocol/openapi.json
git commit -m "feat(protocol): add provider usage endpoint"
```

### Task 3: Core — `ProviderUsage` module (TDD: pure logic first, then orchestration)

**Files:**
- Create: `packages/core/src/provider-usage.ts` (first line: `export * as ProviderUsage from "./provider-usage.js"`)
- Test: `packages/core/test/provider-usage.test.ts`

**Interfaces:**
- Consumes: ambient `Provider.Service` (location graph), `Integration.Service`, `HttpClient.HttpClient` — same ambient style as `SessionStats` needing `Database.Service` (see `packages/core/src/session/stats.ts`).
- Produces (all consumed by Task 4):
  - `snapshot(providerID: Provider.ID, options?: { force?: boolean }): Effect.Effect<Provider.UsageSnapshot, ProviderNotFoundError>` — Effect.fn named `"ProviderUsage.snapshot"`.
  - Pure, individually tested: `monitorOrigin(providerID: string): string | undefined`; `classify(status: number, retryAfterHeader: string | undefined, body: unknown): FetchOutcome`; `normalize(data: unknown, fetchedAt: number): { windows: Provider.UsageWindow[]; tools?: { used: number; limit: number }; level?: string }`; `pickKey(credential: { type: string; key?: string } | undefined, settings: Readonly<Record<string, unknown>> | undefined): string | undefined`; `pickPlanName(body: unknown): string | undefined`; `shouldRefetch(cached: { fetchedAt: number; retryAfter?: number } | undefined, now: number, force: boolean): boolean`.

- [ ] **Step 1: Write the failing tests in `packages/core/test/provider-usage.test.ts`**

```ts
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

describe("ProviderUsage.normalize", () => {
  const fetchedAt = 1_770_648_402_389

  test("maps credit 5h + weekly windows and the monthly tool budget", () => {
    const result = ProviderUsage.normalize(
      {
        level: "pro",
        limits: [
          { type: "CREDIT_LIMIT", unit: 3, number: 5, usage: 12000, currentValue: 1438, percentage: 11, nextResetTime: fetchedAt },
          { type: "CREDIT_LIMIT", unit: 6, number: 1, usage: 60000, currentValue: 6000, percentage: 10, nextResetTime: fetchedAt },
          { type: "TIME_LIMIT", unit: 5, number: 1, usage: 4000, currentValue: 1828, percentage: 45 },
        ],
      },
      fetchedAt,
    )
    expect(result.level).toBe("pro")
    expect(result.windows).toEqual([
      { kind: "five_hour", percent: 1438 / 12000 * 100, used: 1438, total: 12000, resetsAt: fetchedAt },
      { kind: "weekly", percent: 10, used: 6000, total: 60000, resetsAt: fetchedAt },
    ])
    expect(result.tools).toEqual({ used: 1828, limit: 4000 })
  })

  test("legacy TOKENS_LIMIT windows still map", () => {
    const result = ProviderUsage.normalize(
      { limits: [{ type: "TOKENS_LIMIT", unit: 3, number: 5, usage: 800, currentValue: 800, percentage: 100, nextResetTime: fetchedAt }] },
      fetchedAt,
    )
    expect(result.windows).toHaveLength(1)
    expect(result.windows[0].kind).toBe("five_hour")
  })

  test("nextResetTime in seconds is coerced to ms", () => {
    const result = ProviderUsage.normalize(
      { limits: [{ type: "CREDIT_LIMIT", unit: 3, number: 5, usage: 100, currentValue: 1, nextResetTime: 1770648402 }] },
      fetchedAt,
    )
    expect(result.windows[0].resetsAt).toBe(1_770_648_402_000)
  })

  test("percentage prefers currentValue/usage and clamps to [0,100]", () => {
    const result = ProviderUsage.normalize(
      { limits: [
        { type: "CREDIT_LIMIT", unit: 3, number: 5, usage: 100, currentValue: 250, percentage: 11 },
        { type: "CREDIT_LIMIT", unit: 6, number: 7, usage: 100, currentValue: -5, percentage: 0 },
      ] },
      fetchedAt,
    )
    expect(result.windows[0].percent).toBe(100)
    expect(result.windows[1].percent).toBe(0)
  })

  test("weekly number variance (1 vs 7) and unknown units are handled by unit alone", () => {
    const result = ProviderUsage.normalize(
      { limits: [
        { type: "CREDIT_LIMIT", unit: 6, number: 7, usage: 100, currentValue: 1 },
        { type: "CREDIT_LIMIT", unit: 9, number: 3, usage: 100, currentValue: 99 },
      ] },
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test test/provider-usage.test.ts` (from `packages/core`)
Expected: FAIL — cannot resolve `@opencode/core/provider-usage`.

- [ ] **Step 3: Implement the pure functions in `packages/core/src/provider-usage.ts`**

Module constants (exact values): `CACHE_TTL_MS = 240_000`, `FORCE_TTL_MS = 15_000`, `REQUEST_TIMEOUT = "10 seconds"`, `RETRY_AFTER_DEFAULT_MS = 300_000`, `RETRY_AFTER_FLOOR_MS = 60_000`. Implement `monitorOrigin`, `classify` (parse body defensively — a non-object body is `unavailable`; only `success === true && code === 200` is `ok`), `normalize` (the verified unit pairs from Global Constraints; percentage via `currentValue/usage * 100` clamped, falling back to the server `percentage` field when `usage` is unusable), `pickKey`, `pickPlanName` (spec's Secondary endpoint contract: `data[0]` field `productName` or `product_name`, trimmed; anything malformed → undefined), `shouldRefetch` (TTL/FORCE_TTL/retryAfter logic from Global Constraints). Types: `export type FetchOutcome = { kind: "ok"; data: unknown } | { kind: "unauthorized" } | { kind: "key_rejected" } | { kind: "rate_limited"; retryAfterMs: number } | { kind: "unavailable" }`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test test/provider-usage.test.ts` (from `packages/core`)
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/provider-usage.ts packages/core/test/provider-usage.test.ts
git commit -m "feat(core): add provider usage parsing and normalization"
```

- [ ] **Step 6: Implement `snapshot` orchestration in the same module**

Effect.fn requiring ambient `Provider.Service`, `Integration.Service`, `HttpClient.HttpClient`. Algorithm (pinned):
1. `monitorOrigin(providerID)` → undefined ⇒ return `unsupported_endpoint` snapshot immediately (no fetch).
2. `providers.get(providerID)` → undefined ⇒ `yield* new ProviderNotFoundError({ providerID, message: ... })` (mirror `packages/server/src/handlers/provider.ts:24-30` payload shape).
3. Credential, mirroring `packages/core/src/model-resolver.ts:374-379`: `integrations.connection.active(provider.integrationID ?? Integration.ID.make(providerID))` → `integrations.connection.resolve(connection)`; then `pickKey(credential, provider.settings)`. No key ⇒ `not_signed_in` snapshot.
4. Cache check via `shouldRefetch` (module-level `Map<string, entry>`); fresh cache returns the stored snapshot as-is. Concurrent requests share one upstream fetch: keep the in-flight `Effect` per providerID in a module-level map and join it instead of starting a second fetch.
5. Fetch `${origin}/api/monitor/usage/quota/limit` with `HttpClientRequest.get(...)` + `setHeader("Authorization", key)` + `setHeader("Accept-Language", "en-US,en")`, wrapped in `Effect.timeout("10 seconds")` (see `wellknown.ts:65-73` for the timeout/error-wrap idiom). On `unauthorized` outcome, retry ONCE with `setHeader("Authorization", \`Bearer ${key}\`)`.
6. `classify` the final attempt: `ok` → `normalize`; `normalize` returning zero windows and no tools ⇒ `no_plan` (plan level still rendered if present); `key_rejected` ⇒ `key_rejected`; `rate_limited` ⇒ serve last-known windows (if any) with `state: "rate_limited"` + `retryAfter: now + retryAfterMs`, else a bare `rate_limited` snapshot; `unavailable` ⇒ last-known windows with `state: "unavailable"`, else bare.
6b. Plan name (best-effort): `GET ${origin}/api/biz/subscription/list` with the same auth header, short timeout; `pickPlanName` the body; any failure ⇒ `plan.name` stays absent. Never let this fetch affect the meters or the state.
7. Store `{ snapshot, fetchedAt }` in the cache for `ok`; store rate-limited/unavailable entries with their `retryAfter` so `shouldRefetch` governs them. Every returned snapshot carries `providerID` and the data's `fetchedAt`.

Do not add a Layer/node — ambient-context namespace module, like `SessionStats`.

- [ ] **Step 7: Verify types**

Run: `bun typecheck` (from `packages/core`)
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/provider-usage.ts
git commit -m "feat(core): add provider usage snapshot orchestration"
```

### Task 4: Server — handle `provider.usage`

**Files:**
- Modify: `packages/server/src/handlers/provider.ts` (add a `.handle(...)` to `ProviderHandler`)

**Interfaces:**
- Consumes: `ProviderUsage.snapshot` from Task 3 (ambient context — the handler's location graph provides `Provider.Service`, and `Integration.Service`/`HttpClient` arrive transitively the same way model-resolver consumes them).

- [ ] **Step 1: Add the handler**

Inside the existing `handlers.handle("provider.get", ...).handle(...)` chain:

```ts
      .handle(
        "provider.usage",
        Effect.fn(function* (ctx) {
          return yield* response(ProviderUsage.snapshot(ctx.params.providerID))
        }),
      )
```

Import: `import { ProviderUsage } from "@opencode/core/provider-usage"`. Do not add error mapping — `ProviderNotFoundError` flows through like `provider.get`.

- [ ] **Step 2: Verify types (this is the ambient-context proof)**

Run: `bun typecheck` (from `packages/server`)
Expected: no errors. If `Integration.Service` or `HttpClient` is missing from the handler's R, check how `packages/core/src/model-resolver.ts` obtains them (top of file) and mirror that requirement — do NOT add a Layer.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/handlers/provider.ts
git commit -m "feat(server): handle provider usage endpoint"
```

### Task 5: TUI — sidebar plugin + experiment registration

**Files:**
- Create: `packages/tui/src/feature-plugins/sidebar/usage.tsx`
- Modify: `packages/tui/src/component/dialog-experiments.tsx` (`experiments` array, ~line 18)
- Modify: `packages/tui/src/plugin/builtins.ts` (import + array entry)

**Interfaces:**
- Consumes: `client.provider.usage({ providerID })` → `{ location, data: UsageSnapshot }` from Task 2; `context.data.session.get(sessionID)` whose `.model.providerID` identifies the active provider; `config.data.experimental?.zai_usage` gate (dialog-experiments.tsx:25 idiom).

- [ ] **Step 1: Register the experiment in `dialog-experiments.tsx`**

```ts
  {
    id: "zai_usage",
    title: "Z.ai usage in sidebar",
    description: "Show GLM Coding Plan quota windows and tool budget in the session sidebar.",
  },
```

- [ ] **Step 2: Create `usage.tsx`**

Structure (clone `sidebar/context.tsx` for the plugin wrapper; clone `system/stats.tsx:140-148` for the fetch). Pinned structure:

```tsx
import { Plugin } from "@opencode/plugin/tui"
import { createMemo, createResource, Show } from "solid-js"
import { useConfig } from "../../config"

const CODING_PLAN_IDS = new Set(["zai-coding-plan", "zhipuai-coding-plan"])
const REFRESH_MS = 5 * 60_000
```

Component behavior (bodies are the implementer's, following `context.tsx` style):
- `enabled = createMemo(() => config.data.experimental?.zai_usage === true)`; when false render nothing.
- `providerID = createMemo(() => props.context.data.session.get(props.sessionID)?.model.providerID)`; when not in `CODING_PLAN_IDS`, render nothing AND do not fetch (guard the resource source, not just the render).
- `createResource(providerID, (id) => props.context.client.provider.usage({ providerID: id }))`; refetch on an interval of `REFRESH_MS` registered so it disposes with the component.
- Render per `data.state`: `ok` → the spec's mockup (plan label from `plan.name`/`plan.level`, one line per window: `5h` / `Week` with percent and a reset countdown from `resetsAt`, one line for `tools`); `no_plan` → muted "No active GLM Coding Plan"; `not_signed_in` → muted "Not signed in to Z.ai"; `key_rejected` → muted "Z.ai rejected this API key"; `rate_limited` → last-known windows plus muted retry time from `retryAfter`; `unavailable` → last-known windows (stale, per `fetchedAt`) plus muted "usage unavailable"; `unsupported_endpoint` → render nothing.
- Window percent > 90 → `theme.text.feedback.warning` (match the nesting shape of `theme.text.feedback.error.base`); everything else `theme.text.base`/`theme.text.muted`.
- Countdown formatting: a small local `duration(ms)` helper (e.g. `2h 13m`, `4d`).

Plugin definition:

```tsx
export default Plugin.define({
  id: "opencode.sidebar.usage",
  setup(context) {
    context.ui.slot({
      append: "sidebar.content",
      render: (props) => <SidebarUsage context={context} sessionID={props.sessionID} />,
    })
  },
})
```

- [ ] **Step 3: Register the builtin in `builtins.ts`**

`import SidebarUsage from "../feature-plugins/sidebar/usage"` and add `SidebarUsage` next to `SidebarContext`.

- [ ] **Step 4: Verify types**

Run: `bun typecheck` (from `packages/tui`)
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/tui/src/feature-plugins/sidebar/usage.tsx packages/tui/src/component/dialog-experiments.tsx packages/tui/src/plugin/builtins.ts
git commit -m "feat(tui): zai usage sidebar experiment"
```

### Task 6: Full verification

- [ ] **Step 1: Canonical check**

Run: `bun run check` (from repo root)
Expected: passes.

- [ ] **Step 2: Core test suite**

Run: `bun run test` (from `packages/core`)
Expected: all pass, including the new `provider-usage.test.ts`.

- [ ] **Step 3: Manual live check**

Run: `bun run dev:live` (from the worktree). In the TUI: open the Experiments dialog, enable "Z.ai usage in sidebar", open a session whose model is on `zai-coding-plan`. Expected: a Usage item with real 5h/weekly/tool numbers. Toggle the experiment off → item disappears. Switch to a non-zai model → item hidden. A fresh empty session → item hidden, no errors in the log.

- [ ] **Step 4: Fixups**

Any fix from Steps 1-3 gets its own conventional commit. When clean, report done.

### Task 7 (optional, only if time permits): storybook story

**Files:**
- Create: `packages/tui/src/feature-plugins/system/storybook/sidebar-usage.tsx`
- Modify: the storybook `index.tsx` registration

Fixture-driven story rendering `SidebarUsage` states (ok / no_plan / not_signed_in / key_rejected / rate_limited / unavailable) via story keybindings listed in `StoryFooter`, with a reset command; render the real component with a fixture client, submissions local. Verify with `OPENCODE_STORY=<story-id> bun run dev:live` at a narrow and a wide terminal size. Commit: `test(tui): add zai usage sidebar story`.
