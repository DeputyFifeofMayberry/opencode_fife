# Design: GLM Coding Plan usage in the session sidebar

Date: 2026-10-13
Status: draft (pre-plan)

## Intent

Show the Z.ai GLM Coding Plan usage numbers in the TUI session sidebar (the
right-side panel), so checking "how much of my quota window is left" happens
without leaving the editor. The user chose the full scope: both rolling
windows, the monthly MCP tool budget, and the plan name/tier.

Feasibility was investigated first; this document encodes what the
investigation established. The data source is real and working (used by
Z.ai's own official plugin and ~10 independent OSS implementations), and the
sidebar is plugin-slot based, so this is a small, well-bounded feature.

## Goals

- A sidebar item showing, for the GLM Coding Plan:
  - 5-hour rolling window: percent used, used/total, reset countdown
  - weekly window: percent used, used/total, reset countdown
  - monthly MCP tool budget: used out of limit
  - plan tier and name (e.g. "GLM Pro")
- All provider interaction server-side; the TUI never sees the API key.
- Graceful degraded states: no plan, invalid key, rate-limited, unreachable.
- Ship as an opt-in experiment; graduate to unconditional later.

## Non-goals

- No per-model usage charts or time series (the `model-usage` endpoint stays
  unused).
- No CN pay-as-you-go balance (`query-customer-account-report`).
- No team-plan scope (org/project headers, `type=2/3` params) — personal
  plans only, matching Z.ai's official plugin.
- No provider-generic usage framework. Build for the zai family; generalize
  when a second provider with a usage API shows up.
- No subscription-management writes of any kind.
- No new theme tokens (see Constraints).

## Anti-goals (failure modes that would make this a bad feature)

- Rendering a `200` response with `success:false` as "no usage" or "0%".
  It is an error (usually auth) and must surface as one.
- Polling per keystroke or on any sub-minute cadence.
- Letting usage fetches block, delay, or break session streaming, or logging
  the raw API key anywhere (sanitize errors).
- Silently showing another provider's panel item, or showing this one when
  the active model isn't on the zai family.

## Data source

### Primary: quota windows

```
GET {monitor-origin}/api/monitor/usage/quota/limit
Authorization: <raw API key>        # NO "Bearer" prefix (official plugin convention)
Accept-Language: en-US,en
Content-Type: application/json
Timeout: 10s
```

- `{monitor-origin}` derives from the provider's inference base URL host:
  `api.z.ai` → `https://api.z.ai`, `open.bigmodel.cn` →
  `https://open.bigmodel.cn`. A key only works on its own platform's host.
- This endpoint is NOT in Z.ai's public API reference. The de-facto contract
  is pinned by Z.ai's official plugin (`zai-org/zai-coding-plugins`,
  `plugins/glm-plan-usage/.../query-usage.mjs`). It has already migrated once
  (legacy `TOKENS_LIMIT` plans → `CREDIT_LIMIT`, July 2026) — parse both.

Response envelope and one possible body:

```json
{
  "code": 200, "success": true, "msg": "...",
  "data": {
    "level": "pro",
    "limits": [
      { "type": "CREDIT_LIMIT", "unit": 3, "number": 5,
        "usage": 12000, "currentValue": 1438, "remaining": 10562,
        "percentage": 11, "nextResetTime": 1770648402389 },
      { "type": "TIME_LIMIT", "unit": 5, "number": 1,
        "usage": 4000, "currentValue": 1828, "remaining": 2172, "percentage": 45,
        "usageDetails": [{ "modelCode": "search-prime", "usage": 1433 }] }
    ]
  }
}
```

Field semantics (cross-checked across the official plugin, CodexBar, and
oh-my-pi parsers):

| Field | Meaning |
|---|---|
| `type` | `CREDIT_LIMIT` (current plans), `TOKENS_LIMIT` (legacy), `TIME_LIMIT` (monthly MCP tool calls) |
| `usage` / `currentValue` / `remaining` | window total / consumed / left |
| `percentage` | server-**rounded** integer — prefer `currentValue/usage` when both present; clamp to [0,100] |
| `nextResetTime` | epoch **milliseconds** (tolerate seconds: values < 10^12) |
| `unit`/`number` | window size, see mapping below |
| `usageDetails` | per-tool breakdown, `TIME_LIMIT` only |
| `data.level` | plan tier string (`lite`/`pro`/`max`), optional |

Window mapping — only these pairs are verified across implementations; match
on `unit`, ignore unknown units (don't crash, don't guess):

- `{unit: 3, number: 5}` → 5-hour rolling window (the primary coding quota)
- `{unit: 6, number: 1|7}` → weekly window (`number` varies; `unit` is the marker)
- `{unit: 5, number: 1}` on `TIME_LIMIT` → monthly MCP budget (no `nextResetTime`)

### Secondary: plan name (best-effort)

```
GET {monitor-origin}/api/biz/subscription/list
Authorization: <raw API key>
```

Returns `data: [{ productName: " Pro " }]` (field may alternatively be
`product_name`; value may carry padding whitespace — trim). A failure here
must never blank the quota meters; render tier from `data.level` as fallback
and omit the name.

### Error taxonomy

| Condition | Handling |
|---|---|
| HTTP 401 | retry **once** with `Authorization: Bearer <key>` (some surfaces only accept Bearer); if still 401/403 → "key rejected" state |
| HTTP 200 + `success:false` | treat as an error (usually auth), never as empty data |
| HTTP 429 | honor `Retry-After` header (default 300s, floor 60s); show last-known data with retry time |
| 5xx / network / timeout | transient; keep last-known data with a stale hint |
| `data.limits` empty/missing | valid key, no active Coding Plan → "No active GLM Coding Plan" state, not 0% |

### Reference plan limits (context only; panel reads server numbers)

Lite 2,000 / Pro 12,000 / Max 28,000 credits per 5h; 10k/60k/140k weekly.
The 5h window rolls (resets 5h after consumption), weekly resets 7 days from
subscription. Peak Mon–Fri 14:00–18:00 UTC+8 burns credits at 1× vs 0.5×
off-peak — the panel shows server-reported numbers and does no math on
pricing.

## UI

Sidebar item appended to the `sidebar.content` slot (same mechanism as the
Context and MCP items). Terminal rendering is the builder's call; intent:

```
Usage — GLM Pro
5h    ███████░░░░░░  45%  ·  resets in 2h 13m
Week  ██░░░░░░░░░░  12%  ·  resets in 4d
Tools 8 / 100 this month
```

States to cover: loading (skeleton or brief omission), normal, no-plan,
key-rejected, rate-limited (with retry time), stale/transient error (with
last-known data). State colors: default `theme.text.base`/`theme.text.muted`;
a near-exhausted window (e.g. >90%) may use `theme.text.feedback.warning`
(status feedback is the sanctioned role for that token). No new theme
tokens; no `text.feedback` usage for plain informational lines.

Visibility rule (my call): render only when the session's active model
provider is in the zai family (`zai-coding-plan`; `zhipu` acceptable). Hidden
otherwise — no cross-provider noise.

Polling (my call): fetch on mount + every 5 minutes while the session route
is active; one in-flight request at a time; immediate refetch when the
experiment is toggled on. Backoff per the error taxonomy. Manual refresh is
optional (builder may add a palette command).

## Architecture

Data flows server-side; the TUI consumes a normalized snapshot through the
generated SDK client, following the existing one-shot RPC pattern
(`feature-plugins/system/stats.tsx` is the canonical example).

```
Z.ai monitor API
  └─ core usage service (packages/core, Effect HttpClient + credential store;
       outbound provider-API precedent: core/plugin/provider/chatgpt.ts)
       └─ normalizes to a typed snapshot so the TUI stays dumb
           └─ protocol: GET /api/provider/:providerID/usage
                (packages/protocol/src/groups/provider.ts; LocationQuery like
                 sibling endpoints; success: new Usage snapshot schema in
                 @opencode/schema/provider; errors: ProviderNotFoundError,
                 ServiceUnavailableError)
               └─ server handler (packages/server/src/handlers/provider.ts,
                   delegates to the core service)
                   └─ bun run generate from repo root (never edit generated
                       client files)
                       └─ TUI plugin packages/tui/src/feature-plugins/sidebar/usage.tsx
                           (clone shape of sidebar/context.tsx;
                            Plugin.define + ui.slot append "sidebar.content")
                           + registration in packages/tui/src/plugin/builtins.ts
```

Normalized snapshot shape (suggested; builder may refine): plan tier/name,
windows as `{kind: "five_hour"|"weekly", percent, used, total, resetsAt?}`,
tool budget `{used, limit} | null`, `fetchedAt`, and a `state` field from the
error taxonomy so the TUI never re-derives errors.

### Experiment gating

Per `packages/tui/AGENTS.md`: registry entry in
`packages/tui/src/component/dialog-experiments.tsx` plus a
`config.experimental` key (suggest `zaiUsage`). Behavior gated on the key;
graduating = removing the registry entry and the gate. Do not touch the
Experiments infrastructure itself.

## Constraints (repo rules that bind the builder)

- Effect v4 code in this repo — follow the `effect` skill conventions; bind
  services to named variables in generators; no nested service yields.
- No `any`, no star/aliased imports, prefer `Bun.file()`/Bun APIs, avoid
  `try/catch` where Effect idioms suffice, avoid `else` (early returns).
- Never edit generated client files; regenerate via `bun run generate` after
  protocol changes.
- Tests run from package directories (e.g. `packages/core`), never repo
  root; minimal mocks — parser tests should use captured/fixture JSON.
- Canonical verification: `bun run check` from repo root; focused iteration:
  `bun typecheck` from the affected package.
- Optional but idiomatic: a fixture-driven TUI story under
  `packages/tui/src/feature-plugins/system/storybook` exercising the state
  matrix (normal/no-plan/error/rate-limited/stale) with a reset command.

## Suggested tests

- Parser/normalizer unit tests (core): valid `CREDIT_LIMIT` + `TIME_LIMIT`;
  legacy `TOKENS_LIMIT`; `200` + `success:false`; empty `limits`;
  `nextResetTime` in seconds; unknown `unit`; percentage rounding/clamping;
  weekly `number` variance (1 vs 7).
- Auth fallback: 401 → Bearer retry → terminal state.
- Backoff: 429 with and without `Retry-After`.

## Decisions

Decided with the partner:

- Scope is "everything": both windows + tool budget + plan name/tier.

My calls (rejectable):

- Ship experiment-gated; graduate later.
- Server-side fetch + normalized snapshot endpoint, per the keyless-TUI rule.
- Provider-family visibility gate.
- 5-minute cadence; raw-key auth with one Bearer retry.

## Left to the builder

- Exact ASCII rendering/widths and whether to include a manual refresh
  command; whether to poll only while visible.
- Whether to persist last-known usage across restarts (nice-to-have, not
  required).
- Naming of the core service, schema module, and experimental config key.
- The reset-plausibility guard (e.g. "a 5h window can't reset >5h out") is
  optional defensiveness — include only if cheap.

## Reference implementations

- Official contract: `zai-org/zai-coding-plugins` (query-usage.mjs)
- Parsers: CodexBar `Sources/CodexBarCore/Providers/Zai/zai.js`;
  oh-my-pi `packages/ai/src/usage/zai.ts`
- Error handling/Retry-After: codeburn `src/quota/zai.ts`
- opencode-specific precedent: `opencode-glm-quota` (npm),
  `opencode-bar` `scripts/query-zai-coding-plan.sh` (reads legacy auth.json —
  this fork stores credentials in SQLite; use the credential service)
- Regression pinning `200 + success:false` as error: ai-usagebar `src/zai/`
