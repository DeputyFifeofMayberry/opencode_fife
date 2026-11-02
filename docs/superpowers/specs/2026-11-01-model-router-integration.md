# Spec: OpenCode Model Router Integration

Status: Implemented in `shadow`; `advise` rejected by the matched comparison; enforce not enabled.
Date: 2026-11-01
Baseline revision: `dev` at `385df1511406d00c7e7bdc5164bcf6da01bd1732`
Plan: `docs/superpowers/plans/2026-11-01-model-router-integration.md`
Upstream: [marco-jardim/opencode-model-router](https://github.com/marco-jardim/opencode-model-router) `v2.9.1` (npm), commit `6b1af2b5ab981b666fb5df2f7262f6437ca5b5e8` inspected

## Objective

Delegate suitable work automatically to faster, cheaper models while the main session keeps a capable model, without changing the fork's source or weakening its automatic reasoning-effort policy. Improve cost and latency per successfully completed task, keep explicit user choices authoritative, and make every routed decision inspectable.

Success is measured by cost per successfully completed task across matched workloads, not by the plugin loading or by token prices in isolation.

## Selected approach

**Configuration-only integration (Option A).** Install the upstream plugin unchanged at a pinned version, configure it with a user-scope overrides file, and change no repository source.

Evidence for the choice:

- The plugin's v2 adapter targets the same plugin API family (`@opencode/plugin`; typechecked against 2.0.22 while the fork ships 2.2.5). Every host surface it uses exists here: `Plugin.Context`, `ctx.agent.transform/list/reload`, `ctx.tool.transform/list/hook`, `ctx.session.hook/get/prompt/synthetic/interrupt/move/remove`, `ctx.command.transform`, `ctx.permission.hook`, `ctx.model.list/default`, `ctx.provider.list`, `ctx.mcp.list`, `ctx.rpc.register`, `ctx.location`. The remaining risk is behavioral drift between 2.0.22 and 2.2.5, gated by the load check before any routing rollout.
- Tier agents are registered with `editor.update(id, ...)`, and this fork's agent editor creates an agent from `Agent.Info.default(id)` when the id is absent, so new tier agents are admitted.
- Router tools pass zod 4 schemas as `input`. The fork's `Tool.ValueSchema` accepts `StandardSchemaV1`, and its runtime recognizes zod 4 schemas through `$ZodType`'s trait-name `Symbol.hasInstance`, then converts them with `toJSONSchema` from `zod/v4/core`. That path tolerates a plugin-local zod copy (the plugin pins 4.1.8; the fork uses 4.6.7), but converting a 4.1.8 schema with the 4.6.7 converter is the one runtime unknown, so the load gate includes a request that lists tools.
- Rollback is a configuration change, and no GPL-3.0-only code enters this MIT repository.

Options B (compatibility adapter), C (selective vendoring), and D (native implementation) are rejected unless the compatibility gate in Task 3 fails. C also carries a licence conflict. See the integration assessment in the delivery report.

## Scope

In scope:

- Pinned plugin installation through the fork's existing `opencode plugin add` command.
- One global router overrides file: a three-tier preset, routing engine mode, enforcement policy.
- The fork's existing `effort_policy.agent_operations` mapping for tier agents.
- Verification, measurement with existing tooling, rollout, rollback, and an operator runbook.
- A repository doc recording the adopted configuration and its rationale.

Explicitly excluded:

- Any change to `packages/core/src/effort/**`, the model resolver, the session runner, the subagent tool, or protocol/schema code.
- Roles mode (`routing.delegation: "roles"`), the plan executor (`/plan run`), role agents, and `router_run`.
- Custom router agents (`agents` in the overrides file), classifier backends other than `rules`, and any AI-based classification.
- Project-local overrides. Routing must not be configurable by a cloned repository.
- A custom cost dashboard, database, scheduler, or background service.
- Vercel-specific code. `vercel-ai-gateway` remains an optional provider reachable through the existing catalog.
- Public release work.

## Architecture

```
root session (user-selected model, unchanged)
  └─ subagent tool (fork, unchanged)
       └─ tier agent fast | medium | heavy  (router registers; model chosen by router)
            ├─ model + provider: router (tier agent model; engine may rewrite in enforce)
            ├─ reasoning variant: fork effort policy (tier carries no variant/effort)
            └─ verification: router's acceptance gate (its own processes, own verdicts)
```

Two independent control loops exist and must not be conflated:

1. **Router loop.** Injects a delegation protocol, registers tier agents, classifies each dispatch, records a decision, optionally rewrites `agent`/`model`, verifies completed work, records outcomes, and escalates on failed verification.
2. **Effort loop.** The fork's durable per-session policy decides only the reasoning variant of the model already selected, from configured verification commands, plan mode, and delegation operation.

Decision ownership:

| Responsibility | Owner | Mechanism |
|---|---|---|
| Root session model | User / existing config | Unchanged |
| Delegated model and provider | Router | Tier agent model; optional engine rewrite |
| Reasoning variant within a model | Fork effort policy | `ModelSelected` with `metadata.source: "effort-policy"` |
| Model-level escalation after failure | Router ladder | `enforcement.escalate`, bounded |
| Effort-level escalation after failure | Fork effort policy | Existing evidence loop |
| Durable session model state | Fork session infrastructure | Existing `ModelSelected` event |
| User-visible model and effort | Fork TUI/CLI | Existing surfaces plus router `/router`, `/tiers` |

The candidate architecture is technically feasible because the router exposes independent switches: `escalate.variantSteps: "none"` disables same-model variant retries, and `escalate.effortBump: false` disables effort raises. A tier preset that omits `variant`, `effort`, `thinking`, and `reasoning` registers no reasoning knob, leaving the fork's policy as the only writer of child variants.

## Configuration model

Installed by `opencode plugin add opencode-model-router@2.9.1`, which appends the spec to `plugins` in the global `opencode.json`.

New file `~/.config/opencode/opencode-model-router.overrides.jsonc`:

```jsonc
{
  "activePreset": "fife",
  "activeMode": "normal",
  "presets": {
    "fife": {
      "fast":   { "model": "<fast provider/model>",     "costRatio": 1 },
      "medium": { "model": "<balanced provider/model>", "costRatio": 5 },
      "heavy":  { "model": "<advanced provider/model>", "costRatio": 20 }
    }
  },
  "enforcement": {
    "mode": "advisory",
    "verify": {
      "require": "whenDoDPresent",
      "defaultVerify": "deferred",
      "background": false,
      "requireExplicitDoD": false,
      "strictUnverifiable": false
    },
    "escalate": {
      "effortBump": false,
      "variantSteps": "none",
      "maxAttemptsPerTier": 1,
      "maxTotalAttempts": 3,
      "costCeiling": { "multiple": 4 }
    }
  },
  "routing": {
    "engine": "static",
    "profile": "balanced",
    "margin": 0.2,
    "roles": {},
    "background": { "mode": "off" },
    "outcomes": { "path": "~/.local/share/opencode/model-router" }
  }
}
```

`background.mode: "off"` keeps every delegation in the foreground so a routed task completes before the parent returns; it is required for deterministic measurement and for complete child-session exports.

Global `opencode.json` addition for effort ownership:

```jsonc
{
  "effort_policy": {
    "agent_operations": {
      "fast": "explore",
      "medium": "implement",
      "heavy": "review"
    }
  }
}
```

Precedence, lowest to highest: bundled `tiers.json` → global overrides → project overrides (not used) → `~/.config/opencode/opencode-model-router.state.json` (written by `/preset`, `/budget`, `/router enforce`). Runtime state wins over the overrides file; a stale state file must be deleted or reset before rollout so the written defaults apply. `routing.outcomes.path` is honoured only from the global file; it keeps decision and outcome logs outside the temporary directory.

Model ids are operator-supplied, never hardcoded in source or docs. The operator selects them from `opencode models` using the criteria in the plan: chat-capable, tool-capable, available under a configured provider, and an honest cost ladder where `fast` is materially cheaper than `medium`, which is materially cheaper than `heavy`. Subscription-funded models are valid choices even at zero marginal cost, but the cost comparison must then use time/limits rather than token price: report zero marginal cost, token consumption as a share of the plan limit where the provider exposes it, and wall time; otherwise report tokens and time only.

## Manual override behavior

- The root session's model is never changed by the router.
- A subagent call without `model` runs on its tier agent's configured model.
- A subagent call with an explicit `model` runs on that model; in `shadow` and `advise` the engine only records what it would do. In `enforce` the engine may rewrite the orchestrator's choice unless the dispatch carries `[route … pin]`.
- An explicit session variant is never escalated by the fork policy (`exact-base`).
- `/bypass on` disables the router for the session without a restart; `routing.engine: "static"` restores taxonomy-only behavior; `static` still switches `variantSteps` to `auto` when a `routing` block exists, so `variantSteps: "none"` must remain explicit.

Because enforce can rewrite a model the orchestrator named, the initial release does not enable enforce. Enforce is a separate, evidence-gated decision; before it is enabled, the design accepts that a user instruction to use a particular model for a delegated task is only advisory.

## Model compatibility rules

- A tier model must exist in the local catalog for the active provider and be chat-capable.
- A tier that omits `variant` and `effort` produces no reasoning keys; the fork policy then controls effort where the model advertises at least two `ReasoningEfforts` variants. Models with fewer than two stay untouched.
- Do not configure tier `variant` or `effort` while the fork policy owns effort: a tier variant becomes an exact pick and makes the policy inert for every routed child.
- Do not configure `thinking`, `reasoning`, or `escalate.effortBump` for the same reason.
- With no `fallback` configured (this plan), an unavailable or misconfigured tier model surfaces as a subagent failure naming the model id; the plugin's provider fallback chain is not enabled.

## Vercel and other gateways

`vercel-ai-gateway` is already a first-class provider in this fork (`packages/ai/src/providers/vercel-ai-gateway.ts`, provider id `vercel-ai-gateway`, routes `chat`, `messages`, `responses`). If the operator authenticates it, its models appear in `opencode models` and can be used in a tier exactly like any other provider. No plugin-specific gateway support, routing code, or fallback chain is added. Evaluate its metered prices against any subscription capacity in Task 2, and record the choice; a gateway is never assumed to be cheaper.

## Verification and escalation behavior

- The router's gate runs only for dispatches whose prompt carries an `[acceptance]` block (`require: "whenDoDPresent"`), and defers by default (`defaultVerify: "deferred"`). No gate runs when no Definition of Done is present.
- Router verification runs its own processes; its verdicts feed router outcomes and result annotations. It is not visible to the fork's effort evidence.
- The fork's effort evidence continues to come from configured `verification_commands` settled through the `shell` tool or its own idle harness.
- Escalation is bounded: one attempt per tier, three total attempts, four-times cost ceiling. Same-model variant steps and effort bumps are disabled.
- A failed inexpensive attempt cannot loop: the ladder either advances one tier or stops.
- High-risk work is protected by the taxonomy, by `risk == high` never-down rules in the engine, and by `[route … pin]`; enforce is additionally gated on observed evidence.

## Data persistence

- Plugin version and `plugins` entry: global `opencode.json`.
- Routing defaults: global overrides file.
- Runtime routing state (`/preset`, `/budget`, `/router enforce`): `~/.config/opencode/opencode-model-router.state.json`.
- Decision log, outcome store, scorecard side logs: `~/.local/share/opencode/model-router` (JSON/JSONL, rotated by the plugin).
- Fork effort state: existing `session_effort` row; unchanged.
- Session model and child relationships: existing durable session records; unchanged.

## Security and permission constraints

- No authentication secret is written to a tracked file.
- The plugin is installed at runtime, not vendored; its GPL-3.0-only licence must not be copied into this MIT repository.
- Tier `fast` is read-only by default (read, glob, grep, git inspection, optional Context7). Mechanical edits belong to `medium`.
- Routing never broadens a child's permissions; the router's read-only policy and the fork's `Permission.evaluate` both apply.
- No project override is created for this integration. A repository that supplies its own project override is untrusted input: global-only keys (outcomes path, plugin agents, role agents) are stripped, but routing keys it is allowed to set still apply. Do not clone-and-run an untrusted repository with routing enabled; use `routing.engine: "static"` or `/bypass on` for that session.
- The router's verification executes commands from the dispatch's acceptance block. Only run it in repositories whose prompts and tooling are trusted; it is not an OS sandbox.

## Failure and rollback behavior

| Failure | Behavior | Recovery |
|---|---|---|
| Plugin fails to load | Fork continues; plugin absent | Remove the `plugins` entry, restart |
| Invalid overrides file | Plugin drops the invalid layer and keeps the last valid config. The observed malformed-engine test printed no `config notice` line on this build. | Fix or delete the file; confirm `/router` shows the expected engine and preset, not the absence of a notice |
| Tier model unavailable | Subagent call fails with the model id | Correct the preset; no silent fallback |
| Router gate times out | Verdict `unverifiable`; no fabricated pass | Inspect `/router`; adjust timeouts or DoD |
| Router misroutes | Only in enforce; decision log records why | `/bypass on`, set `engine: "static"`, report upstream |
| Effort regression | Policy is untouched by this integration | Remove `agent_operations`; tier models have no variant |
| Cost regression | Measured per task | Return to baseline by removing the plugin entry |

Rollback levels, cheapest first: `/bypass on` (session), `engine: "static"` (config), remove the plugin entry and delete the override (full), each followed by a server restart where required. No source revert is needed at any level. Session history and effort rows are retained.

## Measurable acceptance criteria

Proposed thresholds, not confirmed requirements:

| Criterion | Threshold |
|---|---|
| Tier registration | `fast`, `medium`, `heavy` listed as subagents with the configured models |
| Routing correctness | ≥ 90% of the 10 sampled shadow dispatches land on the tier the taxonomy predicts; 0 unknown-agent errors |
| Explicit control | An explicit session variant remains exact; an explicit subagent model is unchanged in shadow/advise |
| Effort compatibility | `packages/core` effort tests pass; fast/medium/heavy children report base levels low/standard/deep; a standard session resumed as `plan` reports `mode-pin` deep (a fresh plan-agent session seeds base deep) |
| Permission safety | 0 permission broadenings; `fast` cannot edit or run shell |
| Retry safety | No ladder run exceeds 3 attempts or 4× the start tier's cost |
| Overhead | Local classification p95 < 5 ms; no provider call for classification; protocol overhead within upstream's measured range (3,249–6,357 characters, ≈0.8–1.8k tokens). Not separately measured in this screening run. |
| Cost | Median cost per successful task at least 15% lower than baseline over ≥ 12 matched tasks, with no increase in intervention rate |
| Speed | Median wall-clock per successful task not worse by more than 10% |
| Reliability | Successful-task rate not lower than baseline by more than 5 percentage points |
| Observability | Every dispatch has a decision row with chosen, best and reason; `/router stats` reports the window |

Enforce is enabled only when the advise window meets the cost/success thresholds and the router's decision log shows no accidental rewriting of dispatch arguments.

## Material unresolved decisions

1. **Tier model ids.** Operator input, verified against `opencode models`. Blocks final configuration, not the architecture.
2. **Billing mix.** Whether each tier is subscription-funded or metered changes the economic comparison. The measurement method covers both; the conclusion is deferred to real data.
3. **Enforce adoption.** A separate gate after the advise window; default outcome is to stay in advise if evidence is insufficient.
4. **TUI status entry.** The plugin ships a TUI part; this fork's TUI plugin API may differ. Whether it loads is verified during the compatibility gate; if it errors, disable it with the documented selector and record the decision.
