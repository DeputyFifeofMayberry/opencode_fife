# Model Router Integration Runbook

This document describes the local `opencode-model-router` integration. It is an operator runbook, not a fork feature: the plugin is installed at runtime and no file under `packages/**` was changed.

## 1. What is integrated

- Plugin: `opencode-model-router@2.9.1` (pinned), GPL-3.0-only. It is installed with `opencode plugin add` and loaded by the server from `server.ts`. It is never vendored or copied into this MIT repository.
- Host: the fork's OpenCode v2 plugin API. The plugin supplies its own v2 adapter; the fork supplies the agent, subagent, effort, and permission machinery.
- Current state: routing engine `shadow`, enforcement `advisory`. The matched twelve-task comparison rejected `advise`; see `docs/superpowers/notes/2026-11-01-model-router-rollout.md` for the evidence.

Why no source change: the plugin registers three subagents (`fast`, `medium`, `heavy`) and a set of commands through its host `config` hook. The fork's existing `subagent` tool, effort policy, and permissions already provide everything those agents need. The integration is configuration plus the plugin package.

### Fresh install

1. `opencode plugin add opencode-model-router@2.9.1`
2. Create `~/.config/opencode/opencode-model-router.overrides.jsonc` from the snippet in section 4, with your own tier models.
3. Add the `effort_policy.agent_operations` block from section 4 to `~/.config/opencode/opencode.json`.
4. `opencode service restart`
5. Check `opencode debug agents` for `fast`, `medium`, and `heavy`, then `/tiers` for the preset and `/router` for the engine.
6. Run the tier and effort checks in section 8 before trusting routing.

Upstream: [marco-jardim/opencode-model-router](https://github.com/marco-jardim/opencode-model-router). Read its changelog before any upgrade.

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

Because the fork has no explicit `high` level, `medium` runs at the provider's default effort. Confirm that default is acceptable for your provider. A guaranteed high variant would require giving the router a `variant`, which breaks the single-owner rule; do not do that without changing the design.

`fast` is read-only by default. Never dispatch an edit to it.

## 3. Configuration paths and precedence

Global files:

- `~/.config/opencode/opencode.json` — fork config: plugin list and `effort_policy`.
- `~/.config/opencode/opencode-model-router.overrides.jsonc` — router overrides: preset, engine, enforcement, outcomes path.
- `~/.config/opencode/opencode-model-router.state.json` — runtime state written by `/preset` and `/budget` (for example the active preset and mode).

Scratch/project files (not used by this integration):

- `<project>/.opencode/opencode-model-router.overrides.jsonc` — optional project override. Do not create one for this integration.

Precedence, highest first:

1. Runtime state file for the active preset and mode (`/preset`, `/budget`).
2. Project override (`.opencode/opencode-model-router.overrides.jsonc`), for keys allowed at project scope. It is deep-merged after the global file and wins for those keys.
3. Global override file.
4. Bundled `tiers.json` from the package.

Some keys are global-only: a project file cannot set them, and the router drops them with a notice. Do not rely on a project file for `outcomes.path`, plugin agents, or role agents.

A project override is untrusted input, because cloning a repository brings its `.opencode/` directory with it. Global-only keys are stripped, but routing keys a project layer is allowed to set still apply. Do not clone-and-run an untrusted repository with routing enabled; prefer `routing.engine: "static"` or `/bypass on` for that session.

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

`costRatio` is an estimated token-spend multiplier for the engine's comparison, not a dollar price. The values `3` and `6` reflect high and max effort on the same model; adjust them if your tiers use different models. A subscription or free route can report zero dollars while still consuming tokens and limits.

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
   - `/router` shows the expected engine and preset. Do not rely on a `config notice` line: this build dropped an invalid `engine` value without printing one.
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

Plugin removal alone leaves the overrides file and the `agent_operations` block in place. They are inert without the plugin, but a later reinstall adopts them. For a true full rollback, also delete `~/.config/opencode/opencode-model-router.overrides.jsonc`, remove the `agent_operations` block from `opencode.json`, and restart. Removing the overrides file while the plugin remains installed falls back to the bundled presets; set `activePreset` to a bundled name or remove the plugin instead.

## 10. Known interactions

- **Global verification commands are repository-specific.** The global `~/.config/opencode/opencode.json` lists `bun typecheck`, `bun run typecheck`, `bun check`, and `bun test test/effort`. The last exists only under `packages/core`; a child in another project can run it from that project's root, fail, and trigger the fork's effort escalation. This repository masks the problem with a project override in `.opencode/opencode.jsonc` (`verification_commands: ["bun run check"]`). For any other project, set a project-local list of commands that exist there, or remove the global list. Verify each command from that project's root before enabling routing.
- **Resume from the original parent.** The fork's subagent tool only resumes a child from the conversation that spawned it. A new root session is rejected with `Session ... is not a child of the current session`.
- **A malformed override value can drop silently.** This build ignored `"engine": "banana"`, kept the last valid engine, and printed no `config notice` line. Trust the `/router` engine and preset lines, not the absence of a notice.
- **The TUI status entry is unverified.** `/router` and `/tiers` were validated through the server command API, not a rendered TUI. If the status entry errors, disable it in `~/.config/opencode/cli.json` with the selector `"-opencode-model-router.status"`; routing is unaffected.
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
