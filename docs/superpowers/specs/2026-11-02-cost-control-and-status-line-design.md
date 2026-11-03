# Cost control and live model transparency — design

Date: 2026-11-02
Status: Proposed — awaiting approval
Size: Project (schema + core policy + TUI + config)
Companion: `docs/superpowers/notes/2026-11-02-model-router-efficiency-analysis.md`

## 1. Intent

Three things, in priority order:

1. Stop automatic effort changes. Reasoning depth should be a number the
   operator sets, not something the system raises and lowers on its own. Cost
   must be predictable before it is optimised.
2. Make the terminal status line honest about what is running *right now*:
   which agent, which model, and which reasoning level. Today it shows a
   placeholder (`auto`) next to the model and a separate, redundant
   `effort default` row from the router plugin.
3. Produce an evidence-based view of whether the `fast` / `medium` / `heavy`
   brain spends money efficiently. That lives in the companion document; this
   design covers only the two behaviour changes above.

## 2. What exists today

- **Effort has three modes** in `packages/schema/src/config/effort.ts`:
  `static` and `adaptive`. `static` still raises one level while a verification
  failure is open (`packages/core/src/effort/policy/policy.ts:143`), so it is
  not a freeze. `adaptive` seeds a level per operation, raises it on a failing
  verification, and lowers it after `clean_passes` clean passes
  (`policy.ts:76-111`).
- **A pinned variant already freezes effort.** A tier or agent that carries
  `model.variant` is treated as an exact pick: it is written verbatim and never
  escalated (`packages/core/src/effort/adapter.ts:41-43`, `policy.ts:131-135`).
  The three router tiers are pinned, so freezing currently affects the
  *unpinned* agents — chiefly `build`, the orchestrator that accounts for 65%
  of spend.
- **The terminal footer already has a variant slot.** `RunFooterView`
  (`packages/tui/src/mini/footer.view.tsx:129`) renders `agent <name>` and
  `<model> <variant>`. When no variant is picked it prints `auto`
  (`footer.view.tsx:238-239`) and delegates the real decision to the effort
  policy.
- **The router plugin prints its own row** in the same footer slot:
  `effort ${value}`, falling back to the literal `default`
  (`opencode-model-router/src/tui/plugin.ts:680-690`). It is redundant only in
  part: when the applied effort matches the current model it shows the real
  level, which the fork's `auto` does not. The two also diverge for a model with
  no variants — the fork omits the slot, the plugin can still print
  `effort default`. Removing either alone leaves a gap; this design removes both
  and replaces them with one truthful value.

## 3. Goals, non-goals, anti-goals

**Goals**

- One durable, explicit effort level per session and per delegated agent.
- No raise or lowering caused by verification outcomes.
- A status line that never says `auto` or `default`, and that follows the step
  actually running.
- Remove the duplicate plugin row.
- Keep `static` and `adaptive` behaviour byte-identical for anyone using them.

**Non-goals**

- Changing which model backs each tier.
- Changing the router's engine mode (`shadow` stays).
- Removing the `plan` agent or its deep pin — the operator chose to leave both.
- Reworking the orchestrator's delegation instructions. That is an efficiency
  item in the companion document, not part of this build.
- Making the line show historical totals or spend.

**Anti-goals** (this would count as failure even if shipped)

- A freeze that silently turns effort off, leaving every request at provider
  default.
- A status line that shows a level the request is not using.
- A second configuration language for effort. `frozen` must be a mode of the
  existing policy, not a parallel setting.

## 4. Approaches considered

### 4.1 Freezing effort

1. **Empty `verification_commands` and set `mode: "static"`.** Config only. But
   it removes verification-driven retries wholesale, and `static` still raises a
   level while a failure is open, so it is not actually frozen. Rejected: it
   disables a mechanism instead of governing it.
2. **Add `effort_policy.mode: "frozen"`** (chosen). One new mode that the policy
   understands: explicit pins apply, everything else is held at `base_level`,
   and evidence never changes the level. Small, named, visible in config, and
   the status line can state the level truthfully because it is fixed.
3. **Pin a variant on every agent in the router preset.** Works today, but only
   for agents the router knows about, and it puts effort control in an external
   package rather than the fork that owns effort. Rejected as the primary
   mechanism, though it remains the right way to set a tier's level.

### 4.2 Live status line

1. **Fix the plugin's row.** It is external, GPL, cached, and overwritten on
   update. Rejected as the place to build.
2. **Replace the `auto` placeholder in the fork's footer with the resolved
   effort** (chosen), and turn the plugin row off. One line, maintained here.
3. **Add a second line for delegated steps.** Redundant; the line can carry the
   running step instead.

## 5. Chosen design — frozen effort

### 5.1 Semantics

`mode: "frozen"` means: the effort level for a session is determined once, from
explicit configuration, and never changes during the session.

| Situation | Result |
|---|---|
| Session has an exact variant pick (user or agent pin) | used verbatim |
| Agent carries a mode pin (e.g. `plan` → `deep`) | pin applied verbatim |
| Neither | the session's effective base: `base_level`, or the durable base it already had |
| A verification fails | level unchanged; the failure is still recorded for status |
| `clean_passes` are reached | level unchanged |
| `agent_operations` is configured | ignored in frozen mode (no seeding) |
| Model advertises fewer than two real efforts | policy stays inert (`untouched`), as today |

`frozen` differs from `static` in exactly one way: `static` still escalates one
step while a failure is open; `frozen` never does.

**Existing sessions keep their durable base.** The adapter prefers the base
level already stored for a session over the config value
(`packages/core/src/effort/adapter.ts:123-124`). A session created before the
mode change therefore freezes at the base it already had, not at the new
`base_level`. That is safe, but it must be documented: "frozen did not apply"
is the expected reading for an old session, and a new session is the test.

### 5.2 Implementation shape

- `packages/schema/src/config/effort.ts`: add `"frozen"` to the mode literal.
- `packages/core/src/effort/policy/policy.ts`: `decide` returns the pinned or
  exact level; if neither, the effective base. No `escalated` branch in frozen
  mode.
- `packages/core/src/effort/adapter.ts`: skip `sessionSeed` and
  `cleanPassesNeeded` when frozen. Ignore `agent_operations`.
- `packages/protocol/src/groups/session.ts:43`: widen the mode literal on the
  `session.effort` response, then run `bun run generate` from the repo root.
  Without this the server cannot serialize `mode: "frozen"`.
- `packages/core/src/effort/transition.ts`: unchanged — it applies a decision,
  and the decision no longer moves.
- Global config: `C:\Users\barne\.config\opencode\opencode.json` sets
  `effort_policy.mode: "frozen"`.

Touched areas: `packages/schema`, `packages/core`, `packages/protocol`, the
generated client, tests, and the runbook. No router package changes.

### 5.3 Why this also fixes the line

A frozen level is knowable before the request is sent. That removes the only
reason the footer prints `auto`: the placeholder exists because the policy owns
the decision. Once the policy cannot change its mind mid-session, the footer can
print the real level and be right.

## 6. Chosen design — truthful status line

### 6.1 What it shows

One status line, in the existing footer, of the form:

```
agent build · deepseek-flash high
```

During a delegated step:

```
agent fast · minimax-m3.1 medium
```

Rules:

- The model and level are those of the **most recent step**, not the session's
  next request. This matches the operator's choice: whichever step is running.
  It is a deliberate departure from the footer's other slots, which describe the
  request about to be sent. The line is allowed to lag reality by one step.
- The level is the resolved effort actually written on the request. There is no
  `auto` and no `default` state; if the model advertises no variants, the level
  segment is omitted rather than faked.
- When idle, the line keeps the last step's identity rather than blanking. A
  stale-but-labelled line is more useful than an empty one.

### 6.2 Data path

- **Primary source: the assistant message.** It carries `providerID`, `modelID`,
  `agent` and an optional `variant` (`packages/schema/src/v1/session.ts:462-463`,
  `:465`, `:483`). This describes the request that actually ran, which is exactly
  what the line should show. The earlier citation to `:348-350` was the *user*
  message struct and is wrong.
- **Live updates: the existing session event stream.** `SessionEvent.ModelSelected`
  already carries `model.variant` and is consumed by the TUI
  (`packages/tui/src/app.tsx:1347`). No new protocol surface is expected for the
  current session.
- **`EffortTransitioned`** (`packages/core/src/effort/transition.ts:107`) is not
  a per-step signal: `transition.ts:55,71` return early when the level does not
  change, so it fires at most once per level change. It is used only to label the
  rule, never to drive the line.
- **The plugin proves delegated steps are renderable**: it shows
  `<agent> · <model> · <effort>` for child sessions
  (`opencode-model-router/src/tui/plugin.ts:717`).

**Open engineering point, settled here as: verify before building.** Whether the
parent TUI already receives a child session's model metadata is unconfirmed. The
first implementation task is to prove it one way or the other. If it does, the
line needs no protocol change and the delegated step ships with the rest. If it
does not, the smallest option is one field on an existing event, not a new
endpoint — and that decision is made with the evidence in hand, not guessed now.
Re-deriving the level inside the TUI is rejected: it would duplicate the policy
and could disagree with the server.

### 6.3 Removing the duplicate row

The plugin's footer row is switched off through its own option: `footer`, which
defaults to `true` (`src/tui/status-model.ts:166-173`). Set it to `false` in the
overrides file. No plugin code is modified.

## 7. Tests

Frozen effort (unit, `packages/core/test/effort`):

- A verification failure in frozen mode leaves the level unchanged.
- `clean_passes` in frozen mode leaves the level unchanged.
- An exact variant pick is still written verbatim in frozen mode.
- A `plan` agent pin still applies in frozen mode.
- `agent_operations` does not seed in frozen mode.
- `static` and `adaptive` produce exactly their current results (regression).

Schema and protocol:

- `mode: "frozen"` decodes.
- An unknown mode still fails.
- `session.effort` serializes `mode: "frozen"` and returns the resolved level
  (added in `packages/core/test/effort/status.test.ts`). Without this, the
  protocol widening can ship silently broken.

TUI:

- The footer never renders `auto` or `default`.
- The footer shows the resolved level for the latest assistant message.
- A model with no variants omits the level segment.
- A running delegated step updates the line; on completion it settles to the
  last completed step.

## 8. Rollout and rollback

- Frozen effort: one config value. Roll back by setting `mode: "static"`; no
  code revert needed.
- Status line: the repo change is additive to the footer; roll back by reverting
  the commit.
- Plugin row: one config key. Roll back by deleting it.

Order: schema and policy first (with tests), then config, then the footer, then
the plugin row. Each step is independently reversible.

## 9. Left to the implementer

- Whether child-session model metadata is already available to the parent TUI,
  and if not, the smallest event addition that provides it.
- The frozen `base_level` for the orchestrator, once the operator picks a spend
  level (see §11).
- Whether the separator and ordering survive a narrow terminal; the existing
  layout policy already degrades groups by width.

## 10. Not in this design

The efficiency changes in the companion note (`readOnly` on fast, the heavy cap,
design routing, background verification, orchestrator context) each need their
own decision.

The note originally recorded "cheap retries vs freeze" as a conflict. That was
too broad. An in-tier **variant** retry raises effort and is incompatible with
`frozen`. A retry at the **same** level is not an effort change at all and is
compatible. The real choice is therefore: freeze plus same-level retries (extra
attempts, no extra effort), or freeze plus immediate escalation to the next
tier.

## 11. Decisions for the operator — resolved

1. **Orchestrator `base_level`: `standard`.** The provider's own default effort.
   The orchestrator is 65% of spend by context volume, so this stays the
   cheapest sane setting; re-check after one week of measured output tokens.
2. **Heavy tier level: keep `high`.** The tier-selection design's `xhigh` stays
   unapplied until a measured comparison exists, because heavy is already the
   worst value per dispatch.
3. **Same-level retry: one extra attempt per tier, no variant raise.** A
   transient failure no longer buys a bigger model. This is compatible with
   `frozen` because the effort level does not change.
4. **Design approved** on 2026-11-02. Next step is the implementation plan.
