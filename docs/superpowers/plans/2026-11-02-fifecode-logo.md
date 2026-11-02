# FiFeCode Monument Logo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the TUI home-screen wordmark with the approved `fifecode` pixel wordmark framed by a courthouse monument, in three width tiers.

**Architecture:** One square-pixel canvas per tier, authored as layer-code strings (two pixel rows per text row). A pure function turns each pair of pixel rows into half-block cells, and a second pure function groups adjacent identical cells into runs. The component maps each layer to an existing theme token and renders one `<text>` per run. No new dependency, no renderer change, no change to any other surface.

**Tech Stack:** TypeScript, Bun test, Solid, OpenTUI (`@opentui/solid`, `@opentui/core`).

**Spec:** `docs/superpowers/specs/2026-11-02-fifecode-logo-design.md`

## Global Constraints

- Art grids use only the characters `.` `F` `C` `S` `o` `i`.
- Rendered glyphs are only `" "`, `▀`, `▄`. Never `★`, `█`, or any ambiguous-width character.
- Colours come only from `theme.text.base`, `theme.text.muted`, `theme.text.faint`. No hex literals.
- No shadow (`tint()`), gradient, border, or animation.
- Do not modify `logo.left`, `logo.right`, `go`, or their consumers (`util/presentation.ts`, `component/go-upsell-art.ts`, `mini/splash.ts`, `routes/home.tsx`).
- No new dependencies. No `any`.
- Tests run from `packages/tui`, never from the repo root.
- Conventional commits: `feat(tui): …`, `docs(tui): …`.

## Review Focus

- **A 70-column terminal** — the common case. The home screen supplies 66 content columns there (terminal width − 4), below the compact tier's 71, so the plain wordmark is shown and nothing may wrap. The full mark is 87 content cells and needs 87 available columns once the home screen's padding is subtracted.
- **A 24-row terminal** — the 12-row full mark must not push the prompt off the bottom. Tier height rule plus the manual check in Task 3.
- **Monochrome or `faint`-equals-`muted` themes** — the mark must still read from structure alone.
- **A mistyped art character** — must fail a test rather than render a stray glyph.
- **The frozen plain-text logo** — `util/presentation.ts` output must stay byte-identical.

---

### Task 1: Logo art data and pure helpers

**Files:**
- Modify: `packages/tui/src/logo.ts`
- Test: `packages/tui/test/component/logo-art.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, all from `packages/tui/src/logo.ts`:
  - `type LogoLayer = "F" | "C" | "S" | "o" | "i"`
  - `type LogoTier = "full" | "compact" | "minimal"`
  - `const logoArt: Record<"full" | "compact", string[]>`
  - `const logoWidth: { full: 87; compact: 71; minimal: 8 }`
  - `const logoHeight: { full: 12; compact: 7; minimal: 1 }`
  - `const logoSize = logoWidth` — minimum available content width per tier (87 / 71 / 8); the home screen supplies terminal width − 4, or − 2 below 44 columns
  - `function logoMode(width: number, height: number): LogoTier | null`
  - `function logoColor(layer: LogoLayer): "base" | "muted" | "faint"`
  - `type LogoRun = { glyph: " " | "▀" | "▄"; top: LogoLayer | null; bottom: LogoLayer | null; text: string }`
  - `function logoRuns(rows: string[]): LogoRun[][]`

- [ ] **Step 1: Write the failing test**

Create `packages/tui/test/component/logo-art.test.ts`:

```ts
import { describe, expect, test } from "bun:test"
import { go, logo, logoArt, logoColor, logoHeight, logoMode, logoRuns, logoSize, logoWidth } from "../../src/logo"

const allowed = new Set([".", "F", "C", "S", "o", "i"])

describe("logo art", () => {
  test("every row of every tier is exactly the declared width", () => {
    expect(logoArt.full.every((row) => row.length === logoWidth.full)).toBe(true)
    expect(logoArt.compact.every((row) => row.length === logoWidth.compact)).toBe(true)
    expect(logoArt.full.length).toBe(logoHeight.full * 2)
    expect(logoArt.compact.length).toBe(logoHeight.compact * 2)
  })

  test("only declared layer codes appear", () => {
    for (const rows of [logoArt.full, logoArt.compact]) {
      for (const row of rows) for (const char of row) expect(allowed.has(char)).toBe(true)
    }
  })

  test("fife and code both occupy every x-height row", () => {
    for (const row of logoArt.full.slice(12, 22)) {
      expect(row.slice(10, 41)).toContain("F")
      expect(row.slice(42, 77)).toContain("C")
    }
  })

  test("all eight letters sit on row 21", () => {
    const baseline = logoArt.full[21]
    for (const column of [12, 20, 26, 35]) expect(baseline[column]).toBe("F")
    for (const column of [44, 53, 62, 71]) expect(baseline[column]).toBe("C")
  })

  test("the star is drawn from pixels, not characters", () => {
    for (const rows of [logoArt.full, logoArt.compact]) expect(rows.join("")).not.toContain("★")
    expect(logoArt.full.join("")).toContain("S")
    expect(logoArt.compact.join("")).not.toContain("S")
  })

  test("the pre-existing exports are untouched", () => {
    expect(logo.left).toEqual([
      " ▄▄   ★    ▄▄      ",
      "█     █   █    █▀▀█",
      "█^^^  █   █^^^ █^^^",
      "█     █   █    ▀▀▀▀",
    ])
    expect(logo.right).toEqual([
      "             ▄     ",
      "█▀▀▀ █▀▀█ █▀▀█ █▀▀█",
      "█___ █__█ █__█ █^^^",
      "▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀",
    ])
    expect(go.left.length).toBe(4)
  })

  test("the wordmark decodes to f, i, f, e, c, o, d, e", () => {
    const art = logoArt.full
    // f and d rise above the x-height; i keeps its dot with a gap beneath.
    expect(art[10].slice(13, 18)).toBe("FFFFF")
    expect(art[10][20]).toBe("F")
    expect(art[12][20]).toBe(".")
    expect(art[10].slice(27, 32)).toBe("FFFFF")
    expect(art[10][66]).toBe("C")
    expect(art[11][66]).toBe("C")
    // c is open on the right, o is closed — the only difference between them.
    expect(art[16][47]).toBe(".")
    expect(art[16][57]).toBe("C")
    // e carries a full-width crossbar; d leaves its bowl open.
    expect(art[16].slice(33, 41)).toBe("FFFFFFFF")
    expect(art[16].slice(60, 68)).toBe("CC....CC")
  })
})

describe("logoMode", () => {
  test("picks the tier from measured cells", () => {
    expect(logoMode(100, 24)).toBe("full")
    expect(logoMode(logoSize.full, 20)).toBe("full")
    expect(logoMode(logoSize.full - 1, 24)).toBe("compact")
    expect(logoMode(logoSize.compact, 16)).toBe("compact")
    expect(logoMode(logoSize.compact - 1, 24)).toBe("minimal")
    expect(logoMode(400, 15)).toBe("minimal")
    expect(logoMode(400, 11)).toBeNull()
  })

  test("thresholds follow the artwork width plus the home screen's padding", () => {
    expect(logoSize.full - logoWidth.full).toBe(4)
    expect(logoSize.compact - logoWidth.compact).toBe(4)
    expect(logoSize.minimal - logoWidth.minimal).toBe(2)
  })

  test("hides the mark when the window cannot hold even the plain wordmark", () => {
    expect(logoMode(logoSize.minimal, 24)).toBe("minimal")
    expect(logoMode(logoSize.minimal - 1, 24)).toBeNull()
  })
})

describe("logoColor", () => {
  test("maps each layer to its semantic theme slot", () => {
    expect(logoColor("F")).toBe("muted")
    expect(logoColor("C")).toBe("base")
    expect(logoColor("S")).toBe("base")
    expect(logoColor("o")).toBe("faint")
    expect(logoColor("i")).toBe("muted")
  })
})

describe("logoRuns", () => {
  test("groups cells into far fewer runs than the grid is wide", () => {
    const runs = logoRuns(logoArt.full)
    expect(runs.length).toBe(logoHeight.full)
    for (const row of runs) {
      expect(row.map((run) => run.text).join("").length).toBe(logoWidth.full)
      expect(row.length).toBeLessThan(55)
      for (const run of row) expect([" ", "▀", "▄"]).toContain(run.glyph)
    }
  })

  test("merges neighbouring cells that share a layer pair", () => {
    const row = "o".repeat(logoWidth.full)
    const runs = logoRuns([row, row])
    expect(runs[0].length).toBe(1)
    expect(runs[0][0]).toMatchObject({ glyph: "▀", top: "o", bottom: "o" })
    expect(runs[0][0].text.length).toBe(logoWidth.full)
  })

  test("renders the top and bottom pixel as foreground and background", () => {
    const runs = logoRuns(["F..", ".C.", "...", "..."])
    expect(runs[0][0]).toMatchObject({ glyph: "▀", top: "F", bottom: null })
    expect(runs[0][1]).toMatchObject({ glyph: "▄", top: null, bottom: "C" })
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run from `packages/tui`: `bun test test/component/logo-art.test.ts`
Expected: FAIL — `logoArt` / `logoColor` / `logoMode` / `logoRuns` are not exported.

- [ ] **Step 3: Add the art and helpers to `packages/tui/src/logo.ts`**

Append below the existing `logo` and `go` exports, leaving both untouched:

```ts
export type LogoLayer = "F" | "C" | "S" | "o" | "i"
export type LogoTier = "full" | "compact" | "minimal"

export function logoColor(layer: LogoLayer): "base" | "muted" | "faint" {
  if (layer === "C" || layer === "S") return "base"
  if (layer === "o") return "faint"
  return "muted"
}

// Two pixel rows per terminal row, one pixel per cell. `.` empty, `F`/`C` the two
// wordmark tones, `S` the star, `o`/`i` the outer and inner monument tones.
// Glyphs are 8 cells wide with 2-pixel strokes over a 10-pixel x-height.
export const logoArt: Record<"full" | "compact", string[]> = {
  // (paste the validated grids, below)
}
```

Use exactly these rows, as shipped. `full` (87 cells × 24 pixel rows):

```
"...........................................o...........................................",
"......................................ooooo.ooooo......................................",
".................................ooooo...........ooooo.................................",
"............................ooooo..........S..........ooooo............................",
".......................ooooo..............SSS..............ooooo.......................",
"..................ooooo.................SSSSSSS.................ooooo..................",
".............ooooo.......................SSSSS.......................ooooo.............",
"........ooooo.............................S.S.............................ooooo........",
"...ooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooo...",
".......................................................................................",
"...iiiii.....FFFFF..FF.....FFFFF..................................CC...........iiiii...",
"...i.i.i....FF......FF....FF......................................CC...........i.i.i...",
"...i.i.i....FF............FF.......FFFF.....CCCC.....CCCC.....CCCCCC...CCCC....i.i.i...",
"...i.i.i....FF......FF....FF......FF..FF...CC..CC...CC..CC...CC...CC..CC..CC...i.i.i...",
"...i.i.i..FFFFFFFF..FF..FFFFFFFF.FF....FF.CC....CC.CC....CC.CC....CC.CC....CC..i.i.i...",
"...i.i.i....FF......FF....FF.....FF.......CC.......CC....CC.CC....CC.CC........i.i.i...",
"...i.i.i....FF......FF....FF.....FFFFFFFF.CC.......CC....CC.CC....CC.CCCCCCCC..i.i.i...",
"...i.i.i....FF......FF....FF.....FF.......CC.......CC....CC.CC....CC.CC........i.i.i...",
"...i.i.i....FF......FF....FF.....FF.......CC.......CC....CC.CC....CC.CC........i.i.i...",
"...i.i.i....FF......FF....FF.....FF.......CC.......CC....CC.CC....CC.CC........i.i.i...",
"...i.i.i....FF......FF....FF......FF..FF...CC..CC...CC..CC...CC...CC..CC..CC...i.i.i...",
"...iiiii....FF......FF....FF.......FFFF.....CCCC.....CCCC.....CCCCCC...CCCC....iiiii...",
".......................................................................................",
"ooooooooooo.................................................................ooooooooooo",
```

`compact` (71 cells × 14 pixel rows):

```
"ooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooo",
".......................................................................",
".....FFFFF..FF.....FFFFF..................................CC...........",
"....FF......FF....FF......................................CC...........",
"....FF............FF.......FFFF.....CCCC.....CCCC.....CCCCCC...CCCC....",
"....FF......FF....FF......FF..FF...CC..CC...CC..CC...CC...CC..CC..CC...",
"..FFFFFFFF..FF..FFFFFFFF.FF....FF.CC....CC.CC....CC.CC....CC.CC....CC..",
"....FF......FF....FF.....FF.......CC.......CC....CC.CC....CC.CC........",
"....FF......FF....FF.....FFFFFFFF.CC.......CC....CC.CC....CC.CCCCCCCC..",
"....FF......FF....FF.....FF.......CC.......CC....CC.CC....CC.CC........",
"....FF......FF....FF.....FF.......CC.......CC....CC.CC....CC.CC........",
"....FF......FF....FF.....FF.......CC.......CC....CC.CC....CC.CC........",
"....FF......FF....FF......FF..FF...CC..CC...CC..CC...CC...CC..CC..CC...",
"....FF......FF....FF.......FFFF.....CCCC.....CCCC.....CCCCCC...CCCC....",
```

Then:

```ts
export const logoWidth = { full: 87, compact: 71, minimal: 8 } as const
export const logoHeight = { full: 12, compact: 7, minimal: 1 } as const

// The home screen pads 2 cells each side for the artwork tiers, and 1 each side
// below 44 columns, where the plain wordmark is the only thing that fits.
const ART_PADDING = 4
const MINIMAL_PADDING = 2

export const logoSize = {
  full: logoWidth.full + ART_PADDING,
  compact: logoWidth.compact + ART_PADDING,
  minimal: logoWidth.minimal + MINIMAL_PADDING,
} as const

// The full stack is 3 spacer + 12 logo + 1 + prompt (4) + footer (1); 20 rows lets
// the spacer give one row back. Compact needs 16 for its 7 rows.
export function logoMode(width: number, height: number): LogoTier | null {
  if (height < 12 || width < logoSize.minimal) return null
  if (height >= 20 && width >= logoSize.full) return "full"
  if (height >= 16 && width >= logoSize.compact) return "compact"
  return "minimal"
}

export type LogoRun = {
  glyph: " " | "▀" | "▄"
  top: LogoLayer | null
  bottom: LogoLayer | null
  text: string
}

export function logoRuns(rows: string[]): LogoRun[][] {
  return Array.from({ length: Math.ceil(rows.length / 2) }, (_, index) => {
    const top = rows[index * 2]
    const bottom = rows[index * 2 + 1] ?? ""
    const runs: LogoRun[] = []
    for (let column = 0; column < top.length; column++) {
      const cell = logoCell(top[column], bottom[column])
      const last = runs.at(-1)
      if (last && last.glyph === cell.glyph && last.top === cell.top && last.bottom === cell.bottom) last.text += cell.glyph
      else runs.push({ ...cell, text: cell.glyph })
    }
    return runs
  })
}

function logoCell(top: string | undefined, bottom: string | undefined): Omit<LogoRun, "text"> {
  const above = isLayer(top) ? top : null
  const below = isLayer(bottom) ? bottom : null
  if (above && below) return { glyph: "▀", top: above, bottom: below }
  if (above) return { glyph: "▀", top: above, bottom: null }
  if (below) return { glyph: "▄", top: null, bottom: below }
  return { glyph: " ", top: null, bottom: null }
}

function isLayer(value: string | undefined): value is LogoLayer {
  return value === "F" || value === "C" || value === "S" || value === "o" || value === "i"
}
```

Width comes from `top.length`, so the same function serves both grids.

- [ ] **Step 4: Run the test and make it pass**

Run from `packages/tui`: `bun test test/component/logo-art.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/tui/src/logo.ts packages/tui/test/component/logo-art.test.ts
git commit -m "feat(tui): add fifecode monument logo art"
```

---

### Task 2: Render the tiers in the logo component

**Files:**
- Modify: `packages/tui/src/component/logo.tsx`
- Test: `packages/tui/test/component/logo.test.tsx`

**Interfaces:**
- Consumes: `logoArt`, `logoHeight`, `logoMode`, `logoRuns` from Task 1.
- Produces: `<Logo />`, unchanged props, same export name from `packages/tui/src/component/logo.tsx`.

- [ ] **Step 1: Write the failing test**

Create `packages/tui/test/component/logo.test.tsx`, mirroring the mount pattern in `packages/tui/test/component/go-upsell-art.test.tsx` (read it first; it shows the `@jsxImportSource` pragma and the `testRender` call to copy). Assert:

```tsx
// at width 100 / height 24 the mark renders 12 text rows of 87 cells
// at width 80 / height 24 it renders 7 rows of 71 cells (compact: no pediment, no columns)
// at width 60 / height 24 it renders the literal string "fifecode"
// at width 80 / height 10 it renders nothing
```

- [ ] **Step 2: Run it and confirm it fails**

Run from `packages/tui`: `bun test test/component/logo.test.tsx`
Expected: FAIL — the component still renders the old art.

- [ ] **Step 3: Rewrite `packages/tui/src/component/logo.tsx`**

Structure:
- `const tier = () => logoMode(dimensions().width, dimensions().height)`
- `const color = (layer: LogoLayer) => theme.text[logoColor(layer)]`, mapping `F` → `text.muted`, `C` and `S` → `text.base`, `o` → `text.faint`, `i` → `text.muted`
- When `tier()` is `null`, return nothing.
- When `tier()` is `"minimal"`, return one `<box flexDirection="row">` with `<text fg={theme.text.muted}>fife</text>` and `<text fg={theme.text.base}>code</text>`.
- Otherwise map `logoRuns(logoArt[tier()])` to rows of `<box flexDirection="row">`, each run a `<text>` with `fg` from `run.top` for `▀` and `run.bottom` for `▄`, `bg` from `run.bottom` only when the glyph is `▀`, and `selectable={false}`.

Delete the `tint` import, the `renderLine` shadow logic, the `_ ^ ~ ,` shorthand handling, and the `go` import if it becomes unused. The file keeps exporting `Logo` as a named export, with the same (empty) props signature.

- [ ] **Step 4: Run the tests and make them pass**

Run from `packages/tui`: `bun test test/component/logo.test.tsx test/component/logo-art.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run from `packages/tui`: `bun typecheck`
Expected: no errors. Fix any unused-import or type narrowing complaint in place.

- [ ] **Step 6: Commit**

```bash
git add packages/tui/src/component/logo.tsx packages/tui/test/component/logo.test.tsx
git commit -m "feat(tui): render fifecode logo in width tiers"
```

---

### Task 3: Verify on a real terminal and record limitations

**Files:**
- Modify: `docs/superpowers/specs/2026-11-02-fifecode-logo-design.md` (only if a limitation changes)

**Interfaces:**
- Consumes: the rendered logo from Task 2.
- Produces: nothing for later tasks; the screenshot and the recorded limitations.

- [ ] **Step 1: Run the package's checks**

From `packages/tui`: `bun test`, then `bun typecheck`, then from the repo root `bun run check`.
Expected: all pass. Report exact output; never claim a check that was not run.

- [ ] **Step 2: Render it in a real terminal**

Launch the home screen from the development worktree (`bun run dev:live`, or the TUI storybook if a home fixture exists) at 80×24 and at 60×24. Capture a screenshot of each at true colour.

- [ ] **Step 3: Check the failure modes from Review Focus**

- confirm the compact mark does not wrap at 80 columns and the prompt stays visible at 24 rows, and that the full mark appears at 100 columns;
- re-run with a monochrome or 16-colour `TERM` and confirm the mark still reads;
- confirm the minimal tier shows `fifecode` at 40 columns.

- [ ] **Step 4: Compare the screenshot to the approved reference**

Check, in this order: roof is thin and stepped; star centred in the opening; columns sit outside the wordmark and stop at the baseline; `fife` visibly dimmer than `code`; eight letters share one baseline. Record any deliberate difference in the spec's Differences section rather than silently accepting it.

- [ ] **Step 5: Commit whatever the comparison changed**

```bash
git add -A
git commit -m "docs(tui): record fifecode logo verification"
```

---

## Self-review

Spec coverage: wordmark (`logoArt` letters + Task 2 tiers), monument (grid), colour (layer→token map, Task 2), responsive (three tiers, Task 1 `logoMode`), integration (no `home.tsx` change; prompt untouched), validation (Task 3), tests (Task 1 pure, Task 2 render).

Left open deliberately: exact letter silhouettes and roof tread widths may be nudged in Task 3 step 4 as long as Task 1's width, baseline, and allowed-character tests still pass.
