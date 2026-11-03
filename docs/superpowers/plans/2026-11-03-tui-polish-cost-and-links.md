# TUI Polish, Cost Accuracy and Document Links — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect context7 at startup, move the medium tier to Mistral, make the tab close button reliable, make referenced documents openable from the session, make cost include DeepSeek peak pricing, and show spend plus peak state on the home screen.

**Architecture:** Two config-only changes, two TUI interaction changes, and one pricing pipeline change. Pricing converges on a single predicate matcher in `@opencode/core` that both the cost calculation and the home-screen badge call, so the number shown and the number charged cannot disagree.

**Tech Stack:** TypeScript, Effect, SolidJS, OpenTUI, bun:test, Drizzle/SQLite.

**Spec:** `docs/superpowers/specs/2026-11-03-tui-status-mcp-tabs-cost-mistral-design.md`

## Global Constraints

- Run tests from the package directory, never the repo root. `bun test` in `packages/core`, `packages/tui`, `packages/schema`, `packages/util`.
- `bun typecheck` in the affected package; `bun run check` from the repo root before finishing.
- No `any`. No `else` branches. Prefer `const`, early returns, and functional array methods.
- No aliased imports, no star imports, no `import("...")` type positions.
- User-visible copy goes through `language.t(...)`; theme colours come from tokens, never literals.
- Never weaken a check to make it pass. A failing pre-existing test is reported, not edited.
- Before writing or changing a TUI test, read the `tui-tests` skill.
- Config files outside the repo (`~/.config/opencode`, `~/.local/share/opencode`) are edited, never regenerated.

## Review Focus

- **A path containing spaces or a closing parenthesis** appears in a message: it must still become one correct link, not a broken markdown fragment.
- **A path inside a fenced code block** appears: it must stay plain text, because commands and flags resemble paths.
- **A URL that is not `file:`** is clicked: it must keep opening externally exactly as today, not be captured by the new file branch.
- **A pricing predicate with a field the matcher does not know** appears: it must not match, so an unknown rule never silently applies a discount or a surcharge.
- **A mixed session (some rows priced, some unpriced)** is shown in the rail: it must not render as free.
- **A tab in compact/narrow mode** is clicked near its right edge: it must behave the same as a wide tab.

---

### Task 1: Enable context7 at startup

**Files:**
- Modify: `Y:\CodingProjects\opencode_fife\.opencode\opencode.jsonc:20-24`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Flip the flag**

Change `"disabled": true` to `"disabled": false` on the `context7` server entry. Leave `chrome-devtools` disabled. Update the comment above it: it currently says "Opt in by flipping disabled to false"; replace that sentence with "Enabled: connects at startup with the other MCP servers."

- [ ] **Step 2: Verify in a fresh session**

Run the TUI from this directory. Before sending any prompt, run `/mcps`. Expected: `context7` shows `Connected ✓`, not `Disabled ○` or `Connecting …`.

- [ ] **Step 3: Verify the tools exist**

In that session, confirm a `context7_resolve-library-id` tool is available (the tool list or a trivial lookup call). Expected: the tool is present without any per-session connect step.

- [ ] **Step 4: Commit**

```bash
git add .opencode/opencode.jsonc
git commit -m "chore(config): connect context7 at startup"
```

---

### Task 2: Move the medium tier to Mistral

**Files:**
- Modify: `C:\Users\barne\.config\opencode\opencode-model-router.overrides.jsonc:11-15`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Confirm the credential exists**

Run `opencode auth list` (or open `/mcps`-equivalent provider list). Expected: `mistral` is listed as connected. If it is not, stop: `MISTRAL_API_KEY` must be present or `opencode auth login` must be run first.

- [ ] **Step 2: Confirm the model id resolves**

The Mistral catalog id is `deepseek-v4-1-flash-1017` (dashes, not dots), distinct from the gateway's `deepseek/deepseek-v4.1-flash-1017`. Before editing, confirm the id appears in the resolved model list for provider `mistral`, e.g. by opening the model picker and searching `deepseek`. Expected: exactly one entry. If it is absent, stop — the catalog fetch has not caught up and the switch will fail at request time.

- [ ] **Step 3: Edit the preset**

In `presets.fife.medium`, change `"model"` from `"vercel/deepseek/deepseek-v4.1-flash-1017"` to `"mistral/deepseek-v4-1-flash-1017"`. Keep `"variant": "max"` and `"costRatio": 3`.

- [ ] **Step 4: Verify a real request**

Start a fresh session and send a prompt that needs a tool (e.g. "list the files in packages/tui"). Expected: the request completes, the tool call runs, and the footer shows a non-zero cost. A 404 or "model not found" means the id is wrong; revert before continuing.

- [ ] **Step 5: Verify reasoning is accepted**

Send a prompt that produces visible reasoning. Expected: no provider error about `reasoning_effort` or `variant`. If Mistral rejects `max`, drop `"variant"` and re-test; record the change in the commit message.

- [ ] **Step 6: Commit**

This file is outside the repo, so commit nothing here. Record the change in the next repo commit's message body instead.

---

### Task 3: Widen the tab close target

**Files:**
- Modify: `packages/tui/src/component/session-tabs.tsx:744-751` (width maths) and `:1075-1098` (close block)
- Test: `packages/tui/test/component/session-tabs-close.test.tsx`

**Interfaces:**
- Consumes: `tabs.close(sessionID)` from `SessionTabsController`.
- Produces: no exported API change.

- [ ] **Step 1: Read the TUI test conventions**

Open the `tui-tests` skill. Use its renderer fixture and frame-wait helpers; do not invent a new harness.

- [ ] **Step 2: Write the failing test**

Name: `closes the tab when the pointer lands one cell before the glyph`.

Render a tab strip with two sessions, hover the first tab so the glyph appears, then dispatch a left-button mouse-up at the cell immediately left of the glyph. Assert `tabs.close` was called once with that session id. Current code fails because only the glyph cell carries the handler.

```tsx
// shapes only; use the skill's renderer fixture
const close = mock(() => {})
renderTabs({ tabs: [{ sessionID: "ses_a" }, { sessionID: "ses_b" }], close })
mouse.move(glyph.x - 1, glyph.y)
mouse.up()
expect(close).toHaveBeenCalledTimes(1)
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `bun test test/component/session-tabs-close.test.tsx` in `packages/tui`.
Expected: FAIL — `close` not called.

- [ ] **Step 4: Widen the glyph box and reserve the space**

In `session-tabs.tsx`:
- `restingTitleWidth` subtracts 1 for the close glyph; subtract `CLOSE_WIDTH` instead, where `const CLOSE_WIDTH = 3`.
- `hoveredTitleWidth` stays `restingTitleWidth() - 1` (the hover shrink is independent).
- The close `<text>` becomes `right={1}` with `width={CLOSE_WIDTH}`, `height={2}` (the non-compact row height), `justifyContent="center"` equivalent for text (centre by padding the single glyph with one leading space), and keeps `onMouseUp`/`onMouseDown`.
- The detail row already has `paddingRight={2}`; change it to `paddingRight={CLOSE_WIDTH}` so the second line does not run under the target.
- Keep the existing guards: `suppressClick`, `hovered() !== tab.sessionID`, right-button.

- [ ] **Step 5: Run the test and confirm it passes**

Run: `bun test test/component/session-tabs-close.test.tsx` in `packages/tui`.
Expected: PASS.

- [ ] **Step 6: Add the two neighbouring cases**

Add to the same file:
- `does not close when the pointer lands two cells before the glyph` — dispatch at `glyph.x - 2`, expect `close` not called.
- `closes in compact mode` — render with a width below `SESSION_TABS_COMPACT_BREAKPOINT`, repeat the one-cell-left case.

Run the file again. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/tui/src/component/session-tabs.tsx packages/tui/test/component/session-tabs-close.test.tsx
git commit -m "fix(tui): widen the tab close target"
```

---

### Task 4: Make referenced documents openable

**Files:**
- Create: `packages/tui/src/util/document-path.ts`
- Create: `packages/tui/src/component/dialog-document.tsx`
- Modify: `packages/tui/src/routes/session/message-parts.tsx:186-196`
- Modify: `packages/tui/src/app.tsx:1418-1422`
- Modify: `packages/tui/src/config/keybind.ts` (two new entries)
- Test: `packages/tui/test/util/document-path.test.ts`

**Interfaces:**
- Consumes: `openPath` from `@opencode/util/open`; `renderer.getLinkAt(x, y)`; `dialog.replace(fn)`.
- Produces:
  - `linkifyDocumentPaths(content: string, options: { cwd: string; exists: (path: string) => boolean }): string`
  - `lastDocumentPath(messages: readonly { text: string }[], options: { cwd: string; exists: (path: string) => boolean }): string | undefined`
  - `openDocument(dialog, path)` — internal to the TUI.

- [ ] **Step 1: Write the failing tests for path detection**

File `packages/tui/test/util/document-path.test.ts`. Import `linkifyDocumentPaths` and `lastDocumentPath`.

Cases:
1. Prose path that exists becomes `[docs/plan.md](file:///abs/docs/plan.md)`.
2. Prose path that does not exist is unchanged.
3. A path inside a fenced code block is unchanged.
4. A path inside inline code is linkified.
5. A path containing a space, written in backticks, linkifies as one link.
6. Windows absolute path `Y:\CodingProjects\opencode_fife\docs\a.md` linkifies with forward slashes in the href.
7. `lastDocumentPath` returns the last existing path across messages, scanning newest first.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `bun test test/util/document-path.test.ts` in `packages/tui`.
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `document-path.ts`**

`linkifyDocumentPaths` splits the content into fenced and non-fenced segments, rewrites only the non-fenced ones, and leaves existing markdown links alone. A candidate is a token that:
- matches `(?:[A-Za-z]:\\|\.{0,2}/)[^\s`"'()<>]+` or a relative path with a file extension and a `/`,
- resolves against `cwd` when relative,
- passes `exists(resolved)`.

Href form: `file:///` + the absolute path with `\` → `/` and each segment percent-encoded.

`lastDocumentPath` walks messages newest-first, applies the same candidate rule, returns the first hit.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `bun test test/util/document-path.test.ts` in `packages/tui`.
Expected: PASS.

- [ ] **Step 5: Create the viewer dialog**

`dialog-document.tsx`, modelled on `packages/tui/src/component/dialog-error-details.tsx`:
- `DialogLayout` + `DialogHeader` with the file's basename as title and its directory as a muted subtitle.
- A `scrollbox` with `maxHeight={20}` and the same `useKeyboard` scrolling map.
- `<markdown content={text} syntaxStyle={syntax()} reveal... fg={theme.markdown.text} />` using the same props as `message-parts.tsx` minus `streaming` and `conceal`.
- `Keymap.createLayer` with `escape` → back, `o` → `openPath(absolute)`, `c` → copy path.
- Reads the file with `Bun.file(path).text()`; on a read error, render the error text instead of throwing.
- Refuses a directory: if `stat` reports a directory, render "This is a folder." and offer `o` to open it externally.

- [ ] **Step 6: Linkify assistant text**

In `message-parts.tsx`, replace `content={props.part.text.trim()}` with the memoised result of `linkifyDocumentPaths(props.part.text.trim(), { cwd: ctx.directory(), exists })`. Reuse one `exists` closure per render scope, backed by a `Map<string, boolean>`.

- [ ] **Step 7: Intercept `file:` links at the root**

In `app.tsx`, replace the `onMouseUp` body:

```tsx
onMouseUp={(event) => {
  const url = clickedLink(renderer, event)
  if (url?.startsWith("file://")) {
    const path = fileURLToPath(url)
    dialog.replace(() => <DialogDocument path={path} />)
    return
  }
  if (url) return void openUrl(url).catch(toast.error)
  if (copyOnSelectEnabled()) Selection.copyOnSelectRelease(event, renderer, toast, clipboard)
}}
```

Non-`file:` URLs keep today's behaviour exactly.

- [ ] **Step 8: Add the two keybinds**

In `config/keybind.ts`:
- `"docs.open.external": keybind("ctrl+shift+o", "Open the last referenced document externally")`
- `"docs.open.last": keybind("ctrl+y", "Open the last referenced document")`

`ctrl+o` is already `open.menu`; do not reuse it. Wire both through the keymap layer in `app.tsx`, using `lastDocumentPath(messages, { cwd, exists })` over the current session's messages.

- [ ] **Step 9: Verify manually**

Click a design-doc path in a transcript. Expected: the viewer opens, the document scrolls, `escape` returns. Press `o` inside it. Expected: the file opens in the OS default app. Press `ctrl+y` from the transcript. Expected: the same document reopens.

- [ ] **Step 10: Verify the non-file path is untouched**

Click a normal `https://` link in a transcript. Expected: it still opens in the browser, with no viewer.

- [ ] **Step 11: Commit**

```bash
git add packages/tui/src/util/document-path.ts packages/tui/src/component/dialog-document.tsx \
  packages/tui/src/routes/session/message-parts.tsx packages/tui/src/app.tsx \
  packages/tui/src/config/keybind.ts packages/tui/test/util/document-path.test.ts
git commit -m "feat(tui): open referenced documents from the session"
```

---

### Task 5: Carry pricing multipliers on the model cost

**Files:**
- Modify: `packages/schema/src/model.ts:92-104`
- Modify: `packages/core/src/models-dev.ts:307-349`, `:359-384`, `:451`
- Test: `packages/core/test/models.test.ts`

**Interfaces:**
- Consumes: `SourceCost["multipliers"]`.
- Produces: `Model.Cost["multipliers"]: readonly { when: Record<string, unknown>; factor: number | Record<string, unknown> }[] | undefined`.

- [ ] **Step 1: Write the failing test**

In `packages/core/test/models.test.ts`, add a case next to the existing `maps per-token text prices, context tiers, and mode multipliers onto cost`:

`keeps time-of-day multipliers on the model cost and drops service-tier ones`

Fixture catalog: one model with `cost.multipliers` containing `{ when: { utc_hours: { gte: "01:00", lt: "04:00" }, utc_days: { in: ["mon"] } }, factor: 2 }` and `{ when: { service_tier: { equals: "priority" } }, factor: { text: 2 } }`.
Assert: the resolved `Model.Info.cost` entries each carry exactly one multiplier, and it is the time-of-day one.

- [ ] **Step 2: Run it and confirm it fails**

Run: `bun test test/models.test.ts` in `packages/core`.
Expected: FAIL — `multipliers` is `undefined`.

- [ ] **Step 3: Add the schema field**

In `packages/schema/src/model.ts`:

```ts
export interface MultiplierFactor extends Schema.Schema.Type<typeof MultiplierFactor> {}
export const MultiplierFactor: Schema.Codec<number | { readonly [key: string]: MultiplierFactor }> = Schema.Union([
  Schema.Finite,
  Schema.Record(Schema.String, Schema.suspend((): Schema.Codec<MultiplierFactor> => MultiplierFactor)),
]).annotate({ identifier: "Model.MultiplierFactor" })

export const CostMultiplier = Schema.Struct({
  when: Schema.Json,
  factor: MultiplierFactor,
}).annotate({ identifier: "Model.CostMultiplier" })
```

Add to `Cost`: `multipliers: Schema.Array(CostMultiplier).pipe(optional)`.

- [ ] **Step 4: Carry them in `models-dev.ts`**

In `cost()`:
```ts
const multipliers = (input?.multipliers ?? []).filter((item) => !("service_tier" in item.when))
```
Attach `multipliers` to `base` and to every tier entry, and to the zero-price early return. In `modeCost`, attach the same filtered list to the entry it rebuilds when it scales for a service tier.

- [ ] **Step 5: Run the test**

Run: `bun test test/models.test.ts` in `packages/core`. Expected: PASS.

Run `bun typecheck` in `packages/schema` and `packages/core`. Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/schema/src/model.ts packages/core/src/models-dev.ts packages/core/test/models.test.ts
git commit -m "feat(core): carry time-based price multipliers on model cost"
```

---

### Task 6: Add the price-rule matcher

**Files:**
- Create: `packages/core/src/cost-window.ts`
- Test: `packages/core/test/cost-window.test.ts`

**Interfaces:**
- Consumes: `Model.Cost["multipliers"]`.
- Produces:
  - `multiplierAt(multipliers, at: number, options?: { holidays?: ReadonlySet<string> }): number` — returns the factor of the first matching multiplier, or `1`.
  - `isPeak(multipliers, at: number, options?): boolean` — `multiplierAt(...) > 1`.

- [ ] **Step 1: Write the failing tests**

File `packages/core/test/cost-window.test.ts`, `bun:test` style with bare `test(...)`.

Fixtures: the DeepSeek rule
```ts
const deepseek = [{
  when: {
    utc_days: { in: ["mon", "tue", "wed", "thu", "fri"] },
    any: [
      { all: [{ utc_hours: { gte: "01:00" } }, { utc_hours: { lt: "04:00" } }] },
      { all: [{ utc_hours: { gte: "06:00" } }, { utc_hours: { lt: "10:00" } }] },
    ],
    not: { holiday: { equals: "CN" } },
  },
  factor: 2,
}]
```

Cases (use fixed UTC timestamps built with `Date.UTC`):
1. Monday 02:00 UTC → `2`.
2. Monday 04:00 UTC → `1` (upper bound exclusive).
3. Monday 06:30 UTC → `2`.
4. Saturday 02:00 UTC → `1`.
5. Sunday 07:00 UTC → `1`.
6. Monday 02:00 UTC with `holidays: new Set(["2026-11-02"])` → `1`.
7. `undefined` multipliers → `1`.
8. `[{ when: { region: { equals: "eu" } }, factor: 3 }]` → `1` (unknown field never matches).
9. `[{ when: { utc_hours: { gte: "01:00", lt: "04:00" }, utc_days: { in: ["mon"] } }, factor: 1.5 }]` on Monday 02:00 → `1.5`.

- [ ] **Step 2: Run and confirm failure**

Run: `bun test test/cost-window.test.ts` in `packages/core`.
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the matcher**

`cost-window.ts`:
- `matches(when: Record<string, unknown>, at: Date, holidays: ReadonlySet<string>): boolean`
- An object's own keys are ANDed. `all` ANDs children; `any` ORs children; `not` negates one child. Any other key is a field predicate matched against a value derived from `at` (`utc_days` → lowercase 3-letter weekday, `utc_hours` → `HH:MM`, `holiday` → the UTC `YYYY-MM-DD` and only if the set is non-empty). A predicate is `{ equals?, in?, gte?, lt? }`; an unrecognised field or operator returns `false`.
- `utc_hours` compares as minutes, not strings, so `"0:30"` would still be correct.
- `multiplierAt` returns the first matching `factor` when it is a `number`, else `1`.

- [ ] **Step 4: Run and confirm pass**

Run: `bun test test/cost-window.test.ts` in `packages/core`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/cost-window.ts packages/core/test/cost-window.test.ts
git commit -m "feat(core): add price-window predicate matcher"
```

---

### Task 7: Apply the multiplier when pricing a step

**Files:**
- Modify: `packages/core/src/session/usage.ts:25-63`
- Test: `packages/core/test/session-usage.test.ts`

**Interfaces:**
- Consumes: `multiplierAt` from Task 6.
- Produces:
  - `calculateCost(costs: Model.Info["cost"], usage: TokenUsage.Info, at?: number): Money.USD | undefined`
  - `estimate(tokens: TokenUsage.Info, costs: Model.Info["cost"], at?: number): Recorded`
  - `record(usage: Usage | undefined, costs: Model.Info["cost"], at?: number): Recorded`

- [ ] **Step 1: Write the failing tests**

Extend `packages/core/test/session-usage.test.ts`:
1. Estimated cost at a peak timestamp is exactly twice the off-peak cost for the same tokens and the DeepSeek cost entries.
2. A provider-reported cost (`usage.cost`) is identical at peak and off-peak — untouched.
3. `calculateCost` with no multipliers is unchanged from today's expected value.

- [ ] **Step 2: Run and confirm failure**

Run: `bun test test/session-usage.test.ts` in `packages/core`.
Expected: FAIL — peak and off-peak totals are equal.

- [ ] **Step 3: Apply the factor**

In `calculateCost`, after selecting `cost`:
```ts
const multiplier = multiplierAt(cost.multipliers, at ?? Date.now(), {})
return Money.USD.make((sum * multiplier) / 1_000_000)
```
`estimate` and `record` forward `at`. `record` still returns the provider amount verbatim before reaching the estimator.

Using a defaulted `at` rather than a parameter on all six call sites is deliberate: the step has just finished, so wall-clock time is the correct instant, and the default keeps the diff to one file.

- [ ] **Step 4: Run and confirm pass**

Run: `bun test test/session-usage.test.ts` in `packages/core`. Expected: PASS.
Run: `bun test test/session-runner.test.ts` in `packages/core`. Expected: PASS (no call-site changes required).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/session/usage.ts packages/core/test/session-usage.test.ts
git commit -m "fix(core): price DeepSeek peak hours in session cost"
```

---

### Task 8: Show unpriced usage in the rail

**Files:**
- Modify: `packages/tui/src/feature-plugins/prompt/footer.tsx:37-51`
- Test: `packages/tui/test/component/prompt-footer-cost.test.tsx`

**Interfaces:**
- Consumes: `data.session.message.list(sessionID)` message objects carrying `costProvenance?: { provider?; estimated?; unpriced? }`.
- Produces: no exported API.

- [ ] **Step 1: Write the failing tests**

Render the footer with a session whose messages are:
1. all priced and estimated → `$0.42`
2. some unpriced, some priced → `~$0.42`
3. all unpriced → `—`
4. no usage at all → no cost segment

- [ ] **Step 2: Run and confirm failure**

Run: `bun test test/component/prompt-footer-cost.test.tsx` in `packages/tui`.
Expected: FAIL — the unpriced cases render `$0.42` or nothing.

- [ ] **Step 3: Implement the label**

Compute `unpriced = messages.some((m) => m.costProvenance?.unpriced)` once per render. Then:
- `usage && cost === 0 && unpriced` → `"—"`
- `usage && cost > 0 && unpriced` → `` `~${money.format(cost)}` ``
- `usage && cost > 0` → `money.format(cost)`
- otherwise no segment.

- [ ] **Step 4: Run and confirm pass**

Run: `bun test test/component/prompt-footer-cost.test.tsx` in `packages/tui`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/tui/src/feature-plugins/prompt/footer.tsx packages/tui/test/component/prompt-footer-cost.test.tsx
git commit -m "fix(tui): show unpriced session usage instead of hiding it"
```

---

### Task 9: Backfill historical estimated costs

**Files:**
- Create: `packages/core/script/backfill-cost.ts`
- Create: `packages/core/script/backfill-cost.test.ts`

**Interfaces:**
- Consumes: `multiplierAt` (Task 6); `packages/core/src/models-dev/snapshot.txt`.
- Produces: a CLI script with `--apply` and `--dry-run` (default).

- [ ] **Step 1: Write the failing test**

Test the pure part: `reprice(row, catalog, holidays)` returns the corrected `{ cost, provenance }` for one message JSON.
- An `estimated` row for `deepseek/deepseek-flash` at a peak timestamp reprices to 2× the recorded cost.
- The same row off-peak is unchanged.
- A `provider` row is returned unchanged.
- A row whose model is absent from the catalog is returned as `skipped`.

- [ ] **Step 2: Run and confirm failure**

Run: `bun test script/backfill-cost.test.ts` in `packages/core`.
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the reprice function and the script**

- Parse `snapshot.txt` once with `Bun.file(...).json()`.
- For each assistant message where `costProvenance.estimated` is present: resolve the model by `providerID` + `model`, take its `cost` entries, apply the existing tier selection and `multiplierAt`, and produce the new cost.
- Dry run prints: rows scanned, rows repriced, rows skipped, recorded total, corrected total, and the delta.
- `--apply` first writes `packages/core/script/.backfill-cost-backup.jsonl` containing the affected `(message id, data)` pairs, then updates `session_message.data` for those rows, then recomputes `session_v2.cost` for affected sessions as the sum of their message costs, inside one transaction.

- [ ] **Step 4: Run the tests**

Run: `bun test script/backfill-cost.test.ts` in `packages/core`. Expected: PASS.

- [ ] **Step 5: Dry run against the real database**

Run the script with no flags. Expected: a report where the corrected total is higher than the recorded total, skipped rows are named, and nothing is written. Compare the delta against the estimate from the design doc (about 11% of total spend).

- [ ] **Step 6: Apply, with the app closed**

Close the TUI first. Run with `--apply`. Expected: the backup file exists and is non-empty, and a second dry run reports zero rows to reprice.

- [ ] **Step 7: Commit**

```bash
git add packages/core/script/backfill-cost.ts packages/core/script/backfill-cost.test.ts
git commit -m "chore(core): backfill peak pricing on historical estimated costs"
```

---

### Task 10: Add the home status strip

**Files:**
- Modify: `packages/tui/src/feature-plugins/home/footer.tsx:7-13`, `:77-104`
- Create: `packages/tui/src/feature-plugins/home/status.tsx`
- Test: `packages/tui/test/util/home-status.test.ts`

**Interfaces:**
- Consumes: `isPeak` from Task 6; `data.session.list()` and `data.session.cost(id)` from `@opencode/client/solid`.
- Produces:
  - `pricingStatus(multipliers, at): { peak: boolean; label: string }`
  - `totalSpend(sessions, cost): number` — sums only sessions without `parentID`.

- [ ] **Step 1: Write the failing tests**

`home-status.test.ts`:
1. `pricingStatus(deepseekRule, mondayAt02)` → `{ peak: true, label: "Peak" }`.
2. Off-peak → `{ peak: false, label: "Off-peak" }`.
3. `totalSpend` ignores child sessions (a parent with one child counts the parent once).
4. `totalSpend([])` → `0`.

- [ ] **Step 2: Run and confirm failure**

Run: `bun test test/util/home-status.test.ts` in `packages/tui`. Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers**

`pricingStatus` delegates to `isPeak`. `totalSpend` filters `sessions.filter((s) => s.parentID === undefined)` and sums `cost(id)`.

- [ ] **Step 4: Render the strip**

In `home/footer.tsx`, before the `flexGrow` spacer:
- Find the first model in the current location's model list whose `cost` carries a non-empty `multipliers`; use it for the badge. If none exists, render nothing.
- Render `⊙ Peak` / `⊙ Off-peak` with `theme.text.feedback.warning.base` for peak and `theme.text.muted` for off-peak.
- Render the spend as `$X.XX spend`.
- Add `pricing: width >= 96` to `homeFooterVisibility` so the row does not squeeze out the version string.

- [ ] **Step 5: Run the tests and the UI check**

Run: `bun test test/util/home-status.test.ts` in `packages/tui`. Expected: PASS.
Open the home screen at a narrow width. Expected: the strip hides and the version string stays visible.

- [ ] **Step 6: Commit**

```bash
git add packages/tui/src/feature-plugins/home/footer.tsx packages/tui/src/feature-plugins/home/status.tsx \
  packages/tui/test/util/home-status.test.ts
git commit -m "feat(tui): show peak pricing state and tracked spend on home"
```

---

## Final verification

- [ ] `bun run check` from the repo root.
- [ ] `bun typecheck` in `packages/schema`, `packages/core`, `packages/tui`, `packages/util`.
- [ ] `bun test` in `packages/core`, `packages/tui`, `packages/schema`, `packages/util`.
- [ ] Manual pass: `/mcps` connected at startup; medium request on Mistral; tab close near-edge click; document viewer from a transcript; peak badge; a rail number that now includes peak pricing.
