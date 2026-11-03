# Six TUI fixes: status strip, MCP autostart, tab close, cost accuracy, Mistral routing, document links

Date: 2026-11-03
Status: draft — awaiting approval
Branch: `dev`

## Intent

Five independent complaints, all about the terminal TUI (confirmed with the user; none are about the desktop app).

1. A small readout on the home screen showing AI-gateway spend and whether DeepSeek's peak-pricing window is active right now.
2. context7 should already be connected when opencode starts.
3. The tab close "✕" often does nothing when clicked.
4. The cost number in the bottom rail does not reflect real spend.
5. The medium tier should run on the Mistral API instead of the Vercel AI Gateway.
6. Any document a message points at should be openable directly from the session, without hunting for the path.

## Evidence gathered

- **context7 is configured, but disabled.** `Y:\CodingProjects\opencode_fife\.opencode\opencode.jsonc:20-24` defines `mcp.servers.context7` with `"disabled": true`. Connecting it from `/mcps` calls the runtime `experimental.mcp.connect` endpoint (`packages/tui/src/component/dialog-mcp.tsx:113-132`), which is not persisted, so it is connected for this session only.
- **MCP servers already connect at startup.** `packages/core/src/mcp/index.ts:705-737` creates an entry for every configured, non-disabled server and forks a connection per server, in parallel, without blocking startup.
- **The tab close target is one character cell.** `packages/tui/src/component/session-tabs.tsx:1075-1098` renders the glyph as `<text position="absolute" right={1} width={1}>`, shows it only while the tab is hovered, and closes on `onMouseUp` only if `hovered() === tab.sessionID`. A click one cell away hits the tab body, which selects the tab — on an already-active tab that looks like nothing happened.
- **Cost misses DeepSeek peak pricing, on estimated steps only.** The catalog carries the rule (`packages/core/src/models-dev.ts:64` decode; live catalog for provider `deepseek`): weekdays, UTC 01:00–04:00 and 06:00–10:00, factor 2, excluding Chinese holidays. `multipliers` is only implemented for `service_tier` at `packages/core/src/models-dev.ts:360-368`; the estimator prices every step at the flat rate. A provider-reported amount is used verbatim and never consults the catalog (`packages/core/src/session/usage.ts:55-61`), so the fix and any backfill apply to `estimated` provenance only. `packages/schema/src/model.ts:93-104` (`Model.Cost`) has no multiplier field, so the rule cannot reach the cost calculation today.
- **The predicate language has no evaluator.** `When` is `Schema.Record(Schema.String, Schema.Unknown)` (`packages/core/src/models-dev.ts:32`) and the single consumer requires a one-key `when` holding `service_tier` (`models-dev.ts:358-370`). Other catalog entries use predicate trees (`{"not":{"region":{"equals":"global"}}}`). Time, weekday, and holiday predicates are handled nowhere, so the rule carries an untyped predicate that must be matched.
- **Provenance is not exposed to the TUI.** `costProvenance` appears only under `packages/schema` and `packages/core`; the prompt footer reads a plain number from `data.session.cost(sessionID)` (`packages/tui/src/feature-plugins/prompt/footer.tsx:46`). Distinguishing "unpriced" from "zero" needs new client-data surface.
- **Cost is stored at two layers.** Step events carry cost and provenance (`packages/schema/src/session-event.ts:183`); `SessionUsage.add` folds them into the message aggregate the rail reads (`packages/core/src/session/usage.ts:78-90`). A backfill that touches only one layer leaves the displayed total stale.
- **Measured impact on real data** (`~/.local/share/opencode/opencode.db`, 4,596 assistant steps, $6.28 recorded): `deepseek/deepseek-flash` recorded $4.63 against $5.30 true — a 14.5% undercount on the dominant model, about 11% of total recorded spend. Gateway-routed models are unaffected.
- **Unpriced usage is invisible.** `SessionUsage.estimate` returns zero with `{unpriced: 1}` provenance (`packages/core/src/session/usage.ts:48-52`), and the rail hides any zero (`packages/tui/src/feature-plugins/prompt/footer.tsx:46-50`). 343 zai-plan steps show no figure at all.
- **Mistral serves the model.** `https://docs.mistral.ai/models/deepseek-v4-flash-1017`: API id `deepseek-v4-1-flash-1017`, 1M context, 128k output, $0.30 input / $0.007 cached input / $1.20 output per million, OpenAI-compatible `/v1/chat/completions`, reasoning effort `none|low|high|max`, prefix caching. Live catalog entry exists under `mistral` with identical prices to `vercel/deepseek/deepseek-v4.1-flash-1017`.
- **The home footer has a status slot.** `packages/tui/src/feature-plugins/home/footer.tsx:95` renders `<Slot path="home.footer.status" />` between the MCP/plugins indicators and the version.
- **The TUI already renders hyperlinks.** `packages/tui/src/ui/link.tsx:21-33` renders `<text><a href={url}>…</a></text>`, opens it through `openUrl` from `@opencode/util/open`, and detects the link under the pointer with `renderer.getLinkAt(x, y)` (`link.tsx:46`). Mouse handlers on text spans are used elsewhere (`routes/session/form.tsx:1161`). Theme tokens `markdownLink`/`markdownLinkText` already exist (`theme/system.ts:76-77`).
- **Unconfirmed:** whether the built-in markdown renderer turns `[label](url)` into a hyperlink already, and whether `openUrl` accepts a `file://` path on Windows.

## Goals

- Show gateway spend and a live peak/off-peak indicator on the home screen.
- context7 connected at startup, in this project, without repeating `/mcps`.
- The tab ✕ accepts a click reliably, with no new always-visible control.
- Stored and displayed cost includes DeepSeek peak pricing, and unpriced usage is visible instead of silent.
- The medium tier routes through Mistral and works with the existing key.
- File references in assistant messages resolve to something you can open without leaving the session.

## Non-goals

- No balance claim we cannot substantiate: there is no confirmed Vercel AI Gateway credit-balance API.
- No always-visible ✕, no redesign of the tab bar.
- No change to the fast or heavy tiers.
- No repricing of non-`deepseek` providers beyond the price the catalog already states.
- No file browser. Links are for things a message already named, not for exploring the filesystem.

## Anti-goals (would count as failure even if it works)

- A peak indicator that can disagree with the price actually applied to cost.
- A cost fix that silently rewrites history without a way to restore it.
- A Mistral switch that breaks tool calling or reasoning on the medium tier.

## Constraints

- `Model.Cost` is a public schema contract; adding an optional field is additive, but it must follow the Schema package rules (optional via the package `optional()` helper, same-name interface, stable identifier).
- Cost is stored per step at call time. Applying a time-dependent rule means the calculation needs the step's timestamp.
- The router preset lives outside the repo at `C:\Users\barne\.config\opencode\opencode-model-router.overrides.jsonc`, so item 5 is a config edit, not a code change.
- Theme tokens only; no raw colours. All new user-visible copy goes through `language.t(...)`.

## Approaches

### Cost: where the multiplier is applied

- **A. Carry multipliers on `Model.Cost` and apply in `calculateCost`.** Extend the schema with an optional `multipliers` array, pass it through the model resolver untouched, match the predicate against the step timestamp, and apply the factor. Pros: one source of truth, generalises to any provider, and the same evaluator feeds the peak badge. Cons: touches a public schema, the estimator signature and its six call sites, and requires writing the predicate matcher the catalog never needed before.
- **B. Hardcode DeepSeek's window in `session/usage.ts`.** Pros: smallest diff, no evaluator. Cons: duplicates catalog data, drifts when DeepSeek changes it, and the badge would need its own copy — two places to disagree.
- **C. Pre-scale the rate in the model resolver.** Rejected: rates would freeze at resolve time and differ per model instance for the same model.

**Chosen: A.** It is the only option where the number shown and the number charged come from the same rule.

### Balance: what the number means

- **A. Sum of recorded session cost** from the sessions the client already has. No network, no key, includes every provider, and is already peak-correct after item 4.
- **B. Vercel API balance.** No public endpoint confirmed; would need a token and would fail silently when offline.
- **C. Omit the number, show only peak.**

**Chosen: A**, labelled as spend. The user accepted this. B is a later addition if an endpoint exists.

### Tab close: how to widen the target

- **A. Widen the interactive `<text>` to 3 cells and give it its own hover signal.** Pros: a 1-cell miss becomes a hit; the glyph stays in place. Cons: the title's width maths reserves exactly one cell today (`session-tabs.tsx:747-749`), so the reservation and the detail row's right padding must change with it.
- **B. Make the whole tab-height right edge the target.** Pros: biggest target. Cons: an easier accidental close and it competes with the tab's own click.
- **C. Keep 1 cell, add a dead zone.** Rejected: the user's problem is a target that is too small, not one that is too eager.

**Chosen: A**, three cells wide and the full tab row height, with the glyph rendered centred and the hover colour change kept on the glyph.

### Document links: how a path becomes openable

- **A. OSC 8 hyperlink only.** Wrap the path in `<a href="file:///…">`. Pros: near-zero code, terminal-native Ctrl+click. Cons: hands the file to Windows, leaves the session, and depends on terminal support.
- **B. Click handler that opens an in-session viewer.** Detect the path, attach `onMouseUp`, open a scrollable dialog. Pros: never leaves the session; works regardless of hyperlink support. Cons: ignores terminal-native link affordances, and needs the viewer.
- **C. Both.** Emit the hyperlink for terminals that support Ctrl+click, and route a plain click to the in-session viewer with a key to open externally.

**Chosen: C.** A plain click gives the in-session read; the terminal keeps its own affordance for anyone who prefers it.

## Decisions

1. context7: remove `"disabled": true` in the project config. Keep it project-scoped; do not add a key. It will connect in parallel at startup with every other server.
2. Cost: apply peak multipliers at calculation time through one shared matcher. Surface unpriced usage as `—` instead of hiding it.
3. Backfill: recompute `estimated` rows in both storage layers, keep provider-reported amounts and provider rows untouched, snapshot the affected columns first.
4. Tabs: widen the target to three cells and the tab row height, and move the title's one-cell reservation with it; keep hover-only visibility.
5. Status strip: append to `home.footer.status` — peak state first, then all-provider tracked spend, labelled as spend.
6. Matcher scope: support the predicate subset the catalog actually uses — equality, membership, negation, all/any, UTC hours and days, holiday exclusion — shared by cost and the badge.
7. Mixed sessions: show the priced subtotal with a `~` marker rather than hiding the figure.
8. Mistral: point the medium tier at `mistral/deepseek-v4-1-flash-1017`, variant `max`. Same price as the gateway entry, so `costRatio: 3` stays.
9. Links: every path in message prose or inline code that resolves to an existing file becomes clickable. Paths inside fenced code blocks stay plain, because commands and flags resemble paths.
10. A plain click opens the in-session viewer; a keybind opens the same document in the OS default app. A second keybind reopens the most recently referenced document from anywhere in the session.
11. Relative paths resolve against the session's working directory; existence is checked once and cached per path.

## Implementation outline

1. `packages/schema/src/model.ts`: add optional `multipliers` to `Model.Cost` — `when` typed as `Schema.Json`, `factor` as a suspended recursive type, private nested schemas, `optional(...)` helper.
2. `packages/core/src/models-dev.ts`: keep the decoded multipliers on the cost entries the catalog already produces.
3. New predicate matcher in `packages/core`: evaluate `when` against a timestamp — `equals`, `in`, `not`, `all`/`any`, `utc_hours` ranges, `utc_days`, and holiday exclusion. Used by both cost and the badge, so they cannot disagree.
4. `packages/core/src/session/usage.ts`: `estimate` and `calculateCost` take an optional `at` (default off-peak), apply the first matching factor. Update the six production call sites (`compaction.ts:594,822,886`, `title.ts:83`, `suggestion.ts:89`, `runner/step.ts:301`) and the three test calls.
5. New client-data surface for per-session provenance, if the mixed-session display is wanted; the prompt footer renders `—` from it (`prompt/footer.tsx:46-50`).
6. Optional one-off backfill, `estimated` rows only, both layers (step events and message aggregates), after a snapshot of the affected columns.
7. `packages/tui/src/feature-plugins/home/footer.tsx`: status item — peak/off-peak with countdown, then tracked spend, cached on the session revision; add a width threshold to `homeFooterVisibility`.
8. `packages/tui/src/component/session-tabs.tsx:747-749,1073-1098,1116`: three-cell target and full row height, glyph centred, `restingTitleWidth`/`titleWidth` reservations updated, detail row padding adjusted.
9. `C:\Users\barne\.config\opencode\opencode-model-router.overrides.jsonc`: medium → `mistral/deepseek-v4-1-flash-1017`; verify the id resolves and `max` is accepted before saving.
10. `.opencode/opencode.jsonc`: context7 `disabled: false`.
11. Link detection: a resolver that finds candidate paths in prose and inline code, checks existence once per path, and resolves relative paths against the session directory. Skip fenced code blocks.
12. Render: wrap each resolved path in `<a href="file:///…">` using the existing `ui/link.tsx` pattern, with `onMouseUp` routed to the viewer instead of `openUrl`.
13. New `DialogDocument`: a scrollable markdown viewer, opened by click; one keybind opens the same file externally through `openUrl`, another reopens the most recently referenced document.

## Verification

- Unit test the predicate matcher: peak timestamp, off-peak timestamp, weekend, holiday, and a non-matching provider.
- Unit test `calculateCost` with and without a multiplier; assert provider-reported amounts are untouched.
- Backfill dry run: recompute a known `estimated` session and compare with the stored number before writing.
- TUI test for the widened close target: a click at the target's edge closes; a click two cells further does not.
- Unit test path detection: prose path, inline-code path, path inside a fenced block (must not link), nonexistent path, relative path.
- Manual: `/mcps` shows context7 `Connected ✓` immediately after a fresh start.
- Manual: a medium-tier request succeeds on Mistral with tool calls and reasoning.
- Manual: click a design-doc path in a message, read it in the dialog, then open it externally with the keybind.
- `bun run check` from the repo root; `bun typecheck` from `packages/schema`, `packages/core`, `packages/tui`.

## Open items

Answered in this round:

- Where context7 lives, and why `/mcps` does not persist.
- The tab close mechanism and the width-maths consequence.
- Mistral pricing parity with the gateway.
- That provenance is unavailable to the TUI today.
- Backfill scope, spend scope, matcher scope, and the mixed-session display.

Deferred by design:

- A real remaining-credit figure needs a Vercel AI Gateway balance endpoint; none is confirmed. If one appears, the strip can carry it beside the spend figure.
- The holiday calendar is the one input the matcher cannot derive; it needs a source or an explicit "no holiday data" fallback.


