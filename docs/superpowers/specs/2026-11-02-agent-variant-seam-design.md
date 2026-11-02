# Agent variant seam — design

Date: 2026-11-02
Status: Awaiting approval
Size: Small change

## Intent

A tier preset should be able to say which reasoning variant it runs at, and
have that hold. Today it cannot: the router writes `agent.<name>.variant`, the
fork's agent config schema has no top-level `variant`, and schema decoding drops
it silently. The effort policy then seeds its own level and the pin never lands.

The goal is a soft pin: the tier's variant is the default for its delegations,
and an explicit `model="provider/model#variant"` on one call still overrides it.

## What exists

- `opencode-model-router@2.9.1` tier entries accept `variant` and write it as a
  top-level field on the agent definition (`index.ts:3301-3303`).
- `ConfigAgent.Info` (`packages/schema/src/config/agent.ts:11-26`) has no
  top-level `variant`; unknown keys are dropped by schema decoding.
- The accepted home for a variant is `model.variant`
  (`packages/schema/src/config/model.ts:12-16`), produced by parsing the short
  form `provider/model#variant` (`packages/schema/src/model.ts:30-39`).
- `packages/core/src/config/normalize.ts:628-646` only diagnoses a top-level
  `variant` when there is no valid model string to carry it. It never folds it.
- The effort policy treats `agent.model.variant` as an exact pick: seeding is
  skipped and the resolved effort is used verbatim, never escalated
  (`packages/core/src/effort/delegation.ts:50-75`).
- Per-delegation override already works today: the `subagent` tool's `model`
  parameter accepts `#variant`, and an explicit caller model is never replaced
  by the router's tier default.

## Approaches considered

1. **Fold a plugin agent's top-level `variant` into `model.variant`** (chosen).
   Localized, matches an idiom already used by markdown agents and the model ref
   parser, fixes every plugin rather than one, and needs no new config key.
2. **Add `effort_policy.agent_levels`.** Pins in the fork's level vocabulary,
   but adds a permanent second way to say effort and still leaves the router's
   `variant` field broken.
3. **Router `reasoning.effort` per tier.** Config only, but leaves two writers:
   a failed verification can still raise the level over the pin, and the option
   is sent raw to providers that may reject it.
4. **Do nothing; rely on per-delegation overrides.** Already possible, but every
   call must repeat the model string and literals go stale when a tier's model
   changes.

Rejected: `model: "provider/model#variant"` in the router's tier config. It
passes validation but breaks the router's catalog and cost lookups, which key on
the raw model id.

## Chosen design

The fork accepts a top-level `variant` on an agent definition as a compatibility
alias for `model.variant`.

Semantics:

- Nested `model.variant` wins over a top-level `variant` when both are present.
- A top-level `variant` with no model is still reported as unsupported; a
  variant means nothing without a route.
- The fold happens before the runtime agent definition is built, so every
  consumer (delegation seeding, model resolution, status reporting) sees one
  canonical `model.variant`.
- A pinned tier is inert for the effort policy. That is the point of a pin: no
  adaptive raising on failed verification, no operation floor.
- A caller's `model=".../#variant"` still wins, because the override variant is
  checked before the agent's own (soft pin).

## Implementation sketch

- `packages/schema/src/config/agent.ts`: accept optional top-level `variant`,
  documented as a compatibility alias.
- Agent config normalization: fold `variant` into the model selection when the
  model does not already carry one; leave nested variants untouched.
- `packages/core/src/config/normalize.ts`: keep the "variant without model"
  diagnostic, adjusted for the new alias path.

Touched areas: `packages/schema`, `packages/core`, plus tests and the router
runbook. No router package changes.

## Tests

- A plugin/JSON agent with `model: "provider/id"` and `variant: "max"` resolves
  to `model.variant === "max"`.
- Nested `model.variant` is not overwritten by a differing top-level `variant`.
- `variant` with no model still produces the unsupported diagnostic.
- Delegation seeding stays inert when the agent carries a variant.
- A caller override variant still replaces the agent's pinned variant.

## Rollout and rollback

The fix alone changes no tier behaviour: no tier currently sets `variant`.
Pins are added afterwards in the router overrides file, one tier at a time.
Rollback is removing the pin; reverting the commit restores the old drop.

Both tier models advertise `low`, `high`, and `max`, so all three pins above
are valid. An unknown variant fails loudly at model resolution rather than
falling back.

## Pin mapping

| Tier | Requested | Model efforts available | Expressed as |
|------|-----------|-------------------------|--------------|
| `fast` | — | `low`, `high`, `max` | no pin |
| `medium` | medium, else high | `low`, `high`, `max` | `variant: "high"` |
| `heavy` | max | `low`, `high`, `max` | `variant: "max"` |

Neither model advertises `medium`, so the requested fallback rule applies:
`medium` pins `high`. This is resolved at configuration time, not at runtime; an
unknown variant still fails loudly at model resolution.

`fast` stays unpinned so it keeps the adaptive step-down to `low` after clean
passes. It is the highest-volume tier and the one where a fixed `high` would
cost the most in tokens and latency.

Effects to accept:

- `deepseek-flash` already defaults to `high`, so the `medium` pin changes
  nothing about the first request. What changes is that the policy can no longer
  raise it to `max` after a failed verification, because the pin is an exact
  pick.
- `heavy` already reaches `max` through review → `deep` → `max`. The pin makes
  that explicit and independent of the policy mapping.

## Open points

- Whether the router should eventually register `model.variant` directly
  instead of relying on this compat alias.
