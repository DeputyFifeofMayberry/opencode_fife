# FiFeCode terminal wordmark — design

Approved reference: `Fifecode Courthouse Terminal Splash.png` (user-supplied, 1688×924).
Target: the TUI home screen (`packages/tui/src/routes/home.tsx` → `packages/tui/src/component/logo.tsx`).

## Intent

Replace the existing 4-row block wordmark with the approved identity: lowercase
`fifecode` in a bold pixel face, `fife` muted and `code` bright, framed by a
restrained courthouse monument (stepped pediment, sheriff's star, two columns,
foundations). The mark is the first thing on the home screen; it must read as one
integrated emblem, not a logo plus decoration.

Why now: the current art is a placeholder-style block wordmark whose `★` sits over
the `i`. It carries none of the approved proportions or the monument.

## Goals

- Visible name is exactly `fifecode`, all lowercase, one baseline.
- `fife` visually muted relative to `code`.
- Symmetrical monument: pediment with a star, two columns, foundations.
- Three responsive presentations chosen from measured cell width.
- Renders from the existing theme tokens, so it follows light, dark, and custom themes.
- No new dependencies, no animation, no gradients, no shadows.

## Non-goals / anti-goals

- Not touching the prompt, model/agent line, directory line, effort indicator,
  key hints, footer, or any command.
- Not re-branding non-TUI surfaces (web, desktop, docs, `go` upsell art).
- Not matching the reference pixel-for-pixel: a terminal cannot express its
  anti-aliased strokes. Fidelity is proportional and structural.
- Failing if the mark becomes a heavy silhouette that competes with the wordmark,
  or if it needs more than ~9 rows.

## Constraints found in the codebase

- `logo.tsx` renders one `<text>` per character with `theme.text.muted` for the
  first half and `theme.text.base` + bold for the second. A `_ ^ ~ ,` shorthand
  maps to half-block glyphs and a `tint()` drop shadow.
- `logo.ts` exports `logo {left, right}` and `go`. `logo` is also consumed by
  `src/util/presentation.ts` (plain ANSI rendering); `go` by `go-upsell-art.ts`
  and `mini/splash.ts`.
- Existing tiers: hidden below height 12, `go` mark below width 22, stacked halves
  below 44, side-by-side above.
- Home layout centers everything; a 3-row spacer sits above the logo and 1 row
  below it. `home.tsx` measures the logo box width for the update notice.
- Theme tokens available for text: `text.base`, `text.muted`, `text.faint`.
- No committed snapshot contains logo art. One test touches logo art
  (`test/component/go-upsell-art.test.tsx`).

## Approaches considered

**A. One square-pixel canvas rendered with half-height blocks (chosen).**
Author the whole mark once on a grid of square pixels; each terminal cell holds two
stacked pixels via `▀` with `fg` = top pixel and `bg` = bottom pixel. Because a cell
is roughly twice as tall as it is wide, one pixel is one cell wide and half a cell
tall — geometrically square. That makes 1-px strokes uniform in thickness, gives
clean 45° roof edges instead of staircases, and lets thin architecture and bold
letters share one grid. Cost: the art is the bulk of the code.

**B. Line characters for architecture, blocks for letters.** Less art, hairline
roof. Rejected: `╱╲` have a fixed 2:1 slope, so the roof comes out flatter and wider
than the reference, and the star has to be aligned across two different resolutions.

**C. Full-cell blocks only.** Smallest. Rejected: letters barely 3 rows tall, `e`
and `c` become nearly identical, and the monument turns into a solid silhouette.

## Design

### Canvas and proportions

Reference measurements (px): monument 1060×255, wordmark 630×126, pediment 840 wide
× 113 tall, columns ~60 wide, bar-to-baseline box ≈ 3.4:1.

Terminal canvas: **65 cells wide × 18 pixels tall = 9 text rows.**

| Band | Pixels | Rows | Contents |
|---|---|---|---|
| Pediment | 8 | 4 | stepped roofline, 7×5 star centred, cornice bar with end tabs |
| Wordmark | 9 | 4.5 | `fifecode`, x-height 7 px, ascenders to row 8, baseline 16 |
| Foundations | 1 | 0.5 | thin lines under each column, stepping outward |

Horizontal, left to right: foundation overhang 3 · column 4 · gap 2 · wordmark 47 ·
gap 2 · column 4 · overhang 3 = 65. The cornice bar spans the inner 59; pediment
apex at x=32 (centre).

Letters: 5 px wide, 1 px gap, 8 letters = 47. Lowercase only, 1 px strokes. Band
widths follow the reference ratio (pediment height ≈ 0.9 × wordmark height); the
star is proportionally larger than in the reference because a 5-point star needs at
least 5 px to read at all — see Differences.

### Layer codes

The art is authored as rows of single-character layer codes, two rows per text row.

| Code | Meaning | Colour |
|---|---|---|
| ` ` | empty | — |
| `F` | wordmark `fife` | `theme.text.muted` |
| `C` | wordmark `code` | `theme.text.base` |
| `S` | star | `theme.text.base` |
| `o` | outer roofline, cornice, foundations | `theme.text.faint` |
| `i` | inner roofline, column shafts | `theme.text.muted` |

`text.base` / `text.muted` / `text.faint` are the existing semantic slots: primary
lettering, secondary lettering, and the dimmest structural tone. Nothing hardcodes
a hex value, so light, dark, and custom themes keep their own contrast. If
`text.faint` is ever unavailable on the resolved theme type, the outer tone falls
back to `tint(theme.text.muted, theme.background.base, 0.45)`, the pattern already
used in `component/diff-viewer-file-tree.tsx`.

### Rendering

Cell from two stacked pixels:

| Top | Bottom | Glyph | fg | bg |
|---|---|---|---|---|
| empty | empty | `" "` | — | — |
| colour | empty | `▀` | top | — |
| empty | colour | `▄` | bottom | — |
| colour | colour | `▀` | top | bottom |

Consecutive cells with the same glyph+fg+bg are grouped into one `<text>` element,
so the densest row is 37 elements instead of 65. This drops the `tint()` shadow and the
`_ ^ ~ ,` shorthand: both existed to fake depth, and the design forbids shadows.
The mark, not the letters, is now solid, so no per-character shadow is needed.

### Tiers (measured cell width, after the home screen's 2-cell padding each side)

| Tier | Needs | Content |
|---|---|---|
| full | width ≥ 69, height ≥ 16 | complete monument, 65 wide × 9 rows |
| compact | width ≥ 55, height ≥ 16 | wordmark + stepped pediment and star, no columns, no foundations, 51 wide × 9 rows |
| minimal | otherwise | one line, `fife` muted + `code` bright, 8 wide × 1 row |
| hidden | height < 12 | nothing (existing guard) |

Full and compact share a height: at 55 columns what stops fitting is the columns, not
the rows, so compact drops the columns, the foundations, and 14 columns of roof while
keeping the pediment, the star, and the same wordmark. Short windows fall through to
minimal instead of a squashed emblem: the stack is 3 spacer + 9 logo + 1 + prompt (4)
+ footer (1), so 16 rows is the point below which the prompt starts to be squeezed.
Breakpoints are computed in code from the art's declared width plus the home screen's
padding, never from mockup pixels, and the tests assert the tier constants rather
than the literals.

The prompt caps at 75 cells, so the 65-cell mark stays narrower than the prompt at
80 columns and does not become the widest element on screen.

`minimal` replaces the old `go` branch in the logo component. `go` stays exported and
untouched for `go-upsell-art.ts` and `mini/splash.ts`, so the upsell art is unchanged.

### Files

| File | Change |
|---|---|
| `packages/tui/src/logo.ts` | Add `mark` (the monument grid), tier definitions with declared widths, and pure `logoRows(tier)` / `logoCells(rows)` helpers. Leave `logo {left, right}` and `go` byte-for-byte unchanged. |
| `packages/tui/src/component/logo.tsx` | Choose tier from `useTerminalDimensions()` + `useTheme()`, render grouped cells. Remove shadow/shorthand logic. |
| `packages/tui/test/component/logo-art.test.ts` | New: art invariants and cell conversion. |
| `packages/tui/test/component/logo.test.tsx` | New: tier selection at widths 80 / 60 / 40 and height 10. |

`home.tsx` and `presentation.ts` need no changes.

`util/presentation.ts` reads `logo.left` / `logo.right` positionally and decodes the
old `_ ^ ~ ,` shorthand with its own 256-colour escapes. Re-deriving those arrays
from the new grid would give that surface a half-width, mis-scaled wordmark, so they
stay frozen and the plain-text logo printed outside the interactive UI keeps its
current art. Bringing it onto the new identity is a separate, separately-approved
change.

### Tests

Pure-function tests (no renderer):
- every tier's pixel rows are equal length and equal to its declared width;
- only the allowed layer codes appear;
- tier widths strictly ordered full > compact > minimal;
- the wordmark band decodes to exactly eight letters, `fifecode`, all sharing
  baseline row 16;
- `logoCells` maps the four top/bottom combinations correctly and never emits the
  `★` character;
- run-length grouping keeps every row under 25 `<text>` elements;
- the frozen `logo.left` / `logo.right` arrays are untouched by the new code.

Render tests reuse the existing `testRender` + `@jsxImportSource @opentui/solid`
pattern and provider wrapper already used across `packages/tui/test/component`; no
new harness. At width 80 the full tier mounts and its row count is 9; at width 60
the compact tier is 5 rows; at width 40 the minimal tier renders the literal text
`fifecode`; at height 10 nothing renders.

## Differences from the reference (deliberate)

1. **Stroke anti-aliasing** is absent; edges are hard 1-px steps. Unavoidable.
2. **Star is proportionally larger, and the roof is a single stepped chevron.**
   The star is 7×5 px against the reference's 53%-of-pediment height; a five-point
   star below about 7 px wide collapses into a diamond or a blob (5×5 was tried and
   read as noise). A 4:1 staircase cannot hold a parallel inner line — shifting one
   row down and 4 px inward lands on the same staircase — and nested chevrons at
   different slopes cross near the apex at this size. The cornice bar supplies the
   depth the reference gets from its extra outlines.
3. **Foundations are shorter** than the reference's long outward lines, to keep the
   full tier at 65 cells instead of ~79 so it fits an 80-column terminal with margin.
4. **No gradient/shading on `fife`.** The reference shows a soft vertical shade; the
   brief rules it out, so `fife` is one flat muted tone.
5. **No drop shadow** anywhere, unlike the current implementation.
6. **`★` is drawn from pixels**, not the character, because U+2605 is
   ambiguous-width and can occupy two cells in some terminals.
7. **Total height grows from 4 to 9 rows.** Bands are compressed against the
   reference (pediment 0.9 × letters, letters 9 px, foundations 1 px) to keep the
   growth as small as the structure allows. Compact is 9 rows too, because it
   answers a narrow terminal, not a short one.

## Risks

- **Aspect assumptions.** The mark assumes cells ~1:2. At an unusual aspect (e.g.
  square-font terminals) letters look slightly wide or narrow. Nothing breaks.
- **Cell-per-element cost.** Grouping keeps this near the current count; if a
  terminal is slow, the fallback is to widen grouping across rows, not to shrink art.
- **Limited colour.** With 16 colours the three greys may collapse to two tones; the
  monument still reads because structure, not colour, carries it.
- **Ambiguous width.** All art characters (`█ ▀ ▄` and space) are width 1 in every
  common terminal font.

## Left to the builder

Exact pixel placement of the roofline steps, column flutes, and star points; the
final letter silhouettes inside the 5×7 x-height box; and the exact values of the
declared tier widths once the art is drafted, as long as the tier contract above
holds.
