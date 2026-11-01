# Research: Z.ai plan detection / selection — findings and outcome

Date: 2026-10-29 (research + live probe completed)
Status: final for this session. Inference on Start Plan credits is parked
(blocked by active risk control). Detection and usage display remain
viable follow-ups.

## The problem

"Sometimes coding plans get additional credits that can't be used in
the current opencode auth." Root causes, both verified:

1. **The 2026-10-16 key-type split.** Z.ai now issues separate keys per
   wallet — Standard (pay-as-you-go balance + usage bundles/resource
   packages), Personal Coding Plan, Team Plan. The key type, not the
   endpoint, determines billing for new keys; opencode stores one pasted
   key, so the wrong key type silently strands a wallet.
2. **Start Plan / promo credits are not API-key reachable.** They live
   as per-model token buckets behind ZCode's own gateway and credential
   (see below).

## The billing pools

| Pool | Credential | Gateway | Usable in opencode today |
|---|---|---|---|
| Coding Plan subscription (credits per 5h + weekly) | API key from "Personal Coding Plan" console entry (or pre-10-16 Compatible key) | `https://api.z.ai/api/coding/paas/v4` (+ `/api/anthropic`, `/api/v1`) | Yes — `zai-coding-plan` |
| PAYG balance + usage bundles | Standard API Key | `https://api.z.ai/api/paas/v4` | Yes — `zai` |
| Start Plan / promo grants (per-model token buckets) | ZCode JWT (OAuth via zcode.z.ai) | `https://zcode.z.ai/api/v1/zcode-plan/...` | **No** |
| Platform promo credits ("Invite Friends") | Console only | n/a | No |

## Live probe findings (2026-10-29, verified on a real account)

- **`GET https://zcode.z.ai/api/v1/zcode-plan/billing/balance?app_version=<ver>`
  works from any HTTP client** with the JWT (`Authorization: Bearer`).
  Returns `plans[]` (name, plan_id, status, ends_at) and `balances[]`
  (show_name, unit_type "token", total/used/remaining_units,
  capabilities like `model:glm-5.3-flash`, epoch expires_at). Example
  observed: promo plan "ZCODE GLOBAL BUILD" (`zcode-v3-start-plan-1029`),
  300M-token GLM-5.3-Flash bucket. **This endpoint is the contract for
  usage display and account detection.** It does NOT require captcha.
- **OAuth login flow (works, no app ID needed):**
  `POST https://zcode.z.ai/api/v1/oauth/cli/init`
  `{"provider":"zai"}` + `Authorization: Bearer <client-random-hex>` +
  full ZCode source headers → `authorize_url` + `flow_id` (+5 min TTL);
  browser sign-in at chat.z.ai; poll
  `GET /api/v1/oauth/cli/poll/{flowId}` → `data.token` (ZCode JWT),
  `data.zai.access_token` (business token), user info. **The
  `X-ZCode-App-Version` header must match the real installed version**
  (stale version → `3001 parameter error`). pi-zcode's `refresh_token`
  grant against `/api/v1/oauth/token` is documented in its source.
- **Inference on the zcode-plan gateway is blocked for third-party
  clients by active risk control.** The correct contract is known —
  `POST .../zcode-plan/anthropic/v1/messages`, Anthropic wire format,
  SSE, model `GLM-5.3-Flash`, `Authorization: Bearer <JWT>`, ZCode
  source headers, and the official ZCode system blocks (the gateway
  inspects system-prompt origin; pi-zcode's `buildZCodeStartPlanSystem`
  replicates it) — yet requests fail with `3001 parameter error`
  (curl) or HTTP 405 `3012 "unusual activity"` (Bun fetch, and real
  Chromium via Playwright) while the ZCode desktop app succeeds
  minutes apart with the same JWT and draws the bucket down. Captcha is
  currently not required for model requests
  (`client/configs` → `captcha: {skip_model_request: true}`), but
  behavioral risk control (device-mid rotation → 3012) blocks
  replay-style clients. **Verdict: do not build Start Plan inference;
  it is an arms race against a defended edge (Aliyun ESA) plus ToS
  exposure.** August 2026 state was a captcha wall (oh-my-pi #8802);
  the defense has since evolved.
- **Desktop credential storage decoded** (for future needs):
  `~\.zcode\v2\credentials.json`, each value `enc:v1:` =
  AES-256-GCM, base64url(iv[12]).base64url(tag[16]).base64url(ciphertext),
  key = `sha256(env.ZCODE_CREDENTIAL_SECRET ||
  "zcode-credential-fallback:<platform>:<homedir>:<username>")`.
  Holds the ZCode JWT, z.ai business token, and a minted `id.secret`
  coding-plan API key. JWT claims: `user_id`/`sub`/`token_version`/`iat`,
  no `exp` (desktop re-runs OAuth to refresh).
- Desktop plan model (from app config): `account:zai-{start-plan,
  individual-coding-plan, team-coding-plan, offpeak-idle-plan,
  highspeed-card}` (+ bigmodel twins); a z.ai account can hold several
  at once (the probe account had individual plan + start promo
  simultaneously).

## Detection signals for a plain API key (undocumented but stable)

- `GET {origin}/api/monitor/usage/quota/limit` — plan windows +
  `data.level` (`lite`/`pro`/`max`); "当前用户不存在coding plan" when none.
  Already implemented in `packages/core/src/provider-usage.ts`.
- `GET {origin}/api/biz/subscription/list` — subscription product names.
- `GET {origin}/api/biz/account/query-customer-account-report` — PAYG
  report (`balance`, `availableBalance`, `giveAmount` granted credits);
  verified live on `open.bigmodel.cn`, international-host use reported
  but unverified.
- **Limit:** these are account-level. Post-2026-10-16, no API identifies
  which key *type* a given key is — that lives only in the console, so
  login-time intent selection ("which wallet?") stays necessary.

## Relevant error codes

`1113` insufficient balance/no resource package; `1308/1310` 5h/weekly
limit; `1309` plan expired; `1311` plan lacks model; `1315` key type
does not match the product; `1316–1321` plan-limit-plus-extra-usage
balance/spend limits. 1113/1308-1311/1314 are already mapped to
QuotaExceeded in `classifyProviderFailure` (packages/ai); 1315 and
1316–1321 are not.

## Current repo state

- `zai` / `zai-coding-plan` are models.dev providers with generic key
  auth; no Z.ai entry in `packages/core/src/plugin/provider.ts`.
- `packages/core/src/provider-usage.ts` already implements the
  quota/limit + subscription/list probes (auth retry, classify, TTL
  cache, per-credential scope); `config.experimental.zai_usage` gates
  the sidebar rendering those snapshots.
- The integration method system supports forms with select options and
  `when` conditions; multiple credentials per integration exist.

## Recommendation (next session)

1. **Login-time account detection** (`ZaiPlugin` overlaying the zai
   integrations): after key entry, classify the account via the probes
   above and print plan/balance/mismatch guidance. Reuses
   ProviderUsage internals; no schema/protocol changes.
2. **Bucket-aware usage sidebar**: extend ProviderUsage with the
   zcode `billing/balance` endpoint for Start Plan / promo buckets
   (token-denominated, per-model, expiring — read `unit_type`, never
   hardcode). Requires the OAuth polling login for the JWT; captcha
   never touches billing GETs.
3. **Runtime guidance**: map `1315` and `1316–1321` to actionable
   messages.
4. **Parked**: Start Plan inference (this session's outcome above).

## Sources

- Official: docs.z.ai — API Key Management Guide (2026-10-16), Errors
  (1113, 1308–1321), Devpack Quick Start / Tool Integration, Plan
  Update Announcement (2026-07-30).
- Start Plan internals: oh-my-pi #8802; pi-zcode npm 0.1.4 (oauth.ts,
  client.ts, captcha.ts, stream.ts, system-prompt.ts, models.ts);
  zcode-provider npm; vibe-coding-labs zcodeReverseEngineering.
- Balance endpoint: CodexBar PR #3109 (bigmodel.cn live verification);
  pi-footer-template `balance.ts`; go-z-ai roadmap.
- Live verification: probes run 2026-10-29 on the user's machine and
  account (transcripts in session log; secrets not persisted).
