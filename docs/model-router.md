# Model Router Integration Runbook

This document describes the local `opencode-model-router` integration. It is an operator runbook, not a fork feature: the plugin is installed at runtime and no file under `packages/**` was changed.

## 1. What is integrated

- Plugin: `opencode-model-router@2.9.1` (pinned), GPL-3.0-only. It is installed with `opencode plugin add` and loaded by the server from `server.ts`. It is never vendored or copied into this MIT repository.
- Host: the fork's OpenCode v2 plugin API. The plugin supplies its own v2 adapter; the fork supplies the agent, subagent, effort, and permission machinery.
- Current state: routing engine `shadow`, enforcement `advisory`. The matched twelve-task comparison rejected `advise`; see `docs/superpowers/notes/2026-11-01-model-router-rollout.md` for the evidence.

Why no source change: the plugin registers three subagents (`fast`, `medium`, `heavy`) and a set of commands through its host `config` hook. The fork's existing `subagent` tool, effort policy, and permissions already provide everything those agents need. The integration is configuration plus the plugin package.

## 2. Decision ownership

Two systems own two different decisions:

- **Router owns the model.** A tier entry names a provider/model. The router's routing engine may also log or change a dispatch when the engine leaves `static`.
- **Fork effort policy owns the reasoning variant.** `effort_policy.agent_operations` maps each tier name to a delegation operation; that operation seeds the child's base level, and the fork writes the provider variant.

The configuration keeps them separate:

- Tier entries carry `model` and `costRatio` only. They never carry `variant`, `effort`, `thinking`, or `reasoning`.
- `enforcement.escalate.variantSteps` is `"none"` and `enforcement.escalate.effortBump` is `false`, so the router never retries a higher variant on the same model or bumps effort.

The operation mapping used here:

| Tier | Operation | Seed | Resolves to |
|---|---|---|---|
| `fast` | `explore` | `low` | `low` |
| `medium` | `implement` | `standard` | the provider's default effort |
| `heavy` | `review` | `deep` | `max` |

`fast` is read-only by default. Never dispatch an edit to it.

## 3. Configuration paths and precedence

Global files:

- `~/.config/opencode/opencode.json` — fork config: plugin list and `effort_policy`.
- `~/.config/opencode/opencode-model-router.overrides.jsonc` — router overrides: preset, engine, enforcement, outcomes path.
- `~/.config/opencode/opencode-model-router.state.json` — runtime state written by `/preset` and `/budget` (for example the active preset and mode).

Scratch/project files (not used by this integration):

- `<project>/.opencode/opencode-model-router.overrides.jsonc` — optional project override. Do not create one for this integration.

Precedence, highest first:

1. Runtime state file for the active preset and mode.
2. Global override file.
3. Bundled `tiers.json` from the package.
4. Project override, where the key is allowed at project scope.

If a change in the overrides file appears to have no effect, run `/router` and read the active preset/mode; a stale state file wins. Delete `opencode-model-router.state.json` only when the state is wrong, then restart or run `/router-reload`.

The decision log and outcome store live under the `routing.outcomes.path` directory:

- `decisions.jsonl` — one row per routing decision.
- `outcomes.json` and scorecard logs — verdict history used by the engine.

## 4. Configuration snippets

Router overrides, with placeholders:

```jsonc
{
  "activePreset": "fife",
  "activeMode": "normal",
  "presets": {
    "fife": {
      "fast":   { "model": "<fast-provider/model>",   "costRatio": 1 },
      "medium": { "model": "<medium-provider/model>", "costRatio": 3 },
      "heavy":  { "model": "<heavy-provider/model>",  "costRatio": 6 }
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
    "engine": "shadow",
    "profile": "balanced",
    "margin": 0.2,
    "roles": {},
    "background": { "mode": "off" },
    "outcomes": { "path": "~/.local/share/opencode/model-router" }
  }
}
```

Fork config, inside the existing `effort_policy` object:

```jsonc
"agent_operations": {
  "fast": "explore",
  "medium": "implement",
  "heavy": "review"
}
```

Keep `mode`, `base_level`, `verification_commands`, and `clean_passes` unchanged when adding the mapping.

`costRatio` is an estimated token-spend multiplier for the engine's comparison, not a dollar price. A subscription or free route can report zero dollars while still consuming tokens and limits.

## 5. Daily commands

- `/router` — status: enforcement mode, engine and build line, cost doctor, decision-log explanation.
- `/tiers` — active preset, tier models, delegation rules.
- `/router stats [--since <ISO>]` — dispatches, agreement, switches, savings estimate, verdict rates.
- `/bypass on` / `/bypass off` — disable or restore the delegation protocol for one session. Bypass does not stop the shadow engine from logging decisions.
- `/preset <name>` — switch preset; persisted to the state file.
- `/budget <mode>` — switch routing mode (`normal`, `budget`, `quality`, `deep`).
- `/router-reload` — reload tiers, overrides, and state without a server restart.

## 6. Observability

- `~/.local/share/opencode/model-router/decisions.jsonl` — check `mode`, `chosen`, `best`, `switched`, `pinned`, `facts.class`, and `reason`.
- `outcomes.json` and scorecard logs — accumulated verdicts; the engine uses these for candidate confidence.
- `/router stats` — summarized view of the same data.
- `opencode session effort <sessionID> --format json` — the fork's effort view for one session: agent, model, selected variant, base level, next rule, verification commands.

In `shadow` the engine logs but never changes a dispatch. A `switched: true` row is a real behavior change and should be treated as such.

## 7. Verification

Run these from the repository:

```powershell
# From packages/core
bun test test/effort
bun typecheck

# From the repository root
bun run check
```

For a matched cost comparison, keep a manifest of root sessions and export both roots and every child, then run:

```powershell
bun script/session-usage-report.ts <manifest.json> `
  --export <root.json> --export <child.json> `
  --format csv --out <report.csv>
```

The report joins descendants through `parentID`. An unexported child silently understates the run. `cost_complete` also requires provider attempt counts, which exports do not contain; treat dollar figures as estimated unless the provider reconciles them.

## 8. Upgrade procedure

1. Read the plugin changelog for `routing`, `enforcement`, `verify`, or tier-agent changes.
2. Install the new exact version, never `latest`: `opencode plugin add opencode-model-router@<version>`.
3. Restart the server: `opencode service restart`.
4. Re-run the tier and effort checks:
   - `opencode debug agents` shows the three tiers with the expected models.
   - `/tiers` shows the active preset and no variant fields.
   - `/router` shows the expected engine and no unexpected config notice.
   - A `fast` dispatch refuses an edit.
   - A `medium`/`heavy` dispatch reports the expected base level and next rule.
5. Re-run the twelve-task comparison before changing the engine from `shadow`.

Do not upgrade while a long session is running; the restart interrupts it.

## 9. Rollback levels

1. **Session only:** `/bypass on`, then `/bypass off` to restore.
2. **Stop routing changes, keep observation:** set `"engine": "static"` in the overrides file. It hot-reloads. `static` is the instant kill switch.
3. **Stop enforcement:** `/router enforce off`, or set `"enforcement": { "mode": "off" }`.
4. **Remove the plugin:**
   ```powershell
   opencode plugin remove opencode-model-router@<version>
   opencode service restart
   opencode debug agents
   ```
   Expect no `fast`, `medium`, or `heavy`; `general` and `explore` remain. Sessions stay readable.
5. **Reinstall:**
   ```powershell
   opencode plugin add opencode-model-router@<version>
   opencode service restart
   ```

Removing the overrides file while the plugin remains installed falls back to the bundled presets; set `activePreset` to a bundled name or remove the plugin instead.

## 10. Known interactions

- **Resume can clear a variant.** A router-driven model switch may leave the child with the provider default variant. The fork re-applies the durable level on the next step. This was observed: a `heavy` child moved to another model and still reported variant `max`.
- **Two command runners.** Router verification and the fork's effort harness can both run commands. Keep router verification deferred and `background: false`; do not let both run the same suite concurrently.
- **Enforce can rewrite an unpinned explicit model.** In `enforce`, an explicit `model` is authoritative only when the dispatch carries a `[route ... pin]`. Keep `shadow` for now; pin high-risk work before considering enforce.
- **`fast` is read-only.** It has no write, edit, patch, or shell. A mechanical task dispatched there fails by policy.
- **High-risk work must not go below `medium`.** The advise arm routed a security audit to `fast`; that is one reason enforce was not enabled.
- **Auto-background.** `background: false` blocks only when `auto_background_ms` is `0`; the default two-second watchdog moves long children to the background and lets the root finish early. This matters for benchmarks, not normal use.
- **Free routes are unpriced or subscription-priced.** The engine compares them in `costRatio` units and reports no meaningful dollar figure.
- **Every `routing` block turns variant steps on by default on v2.** This configuration sets `"variantSteps": "none"` explicitly to keep the fork as the only variant writer.

## Evidence

The integration record, including the baseline, shadow, advise, enforce decision, and rollback drill, is in `docs/superpowers/notes/2026-11-01-model-router-rollout.md`.
