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
  or if the full tier needs more than 12 rows.

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

Terminal canvas: **87 cells wide × 24 pixels tall = 12 text rows.**

| Band | Pixels | Rows | Contents |
|---|---|---|---|
| Pediment | 9 | 4.5 | stepped roofline, 7×5 star centred, cornice bar with end tabs |
| Gap | 1 | 0.5 | breathing space between cornice and letters |
| Wordmark | 13 | 6.5 | `fifecode`, x-height 10 px (rows 12-21), ascenders and dot from row 10, baseline at 21, letter pixels continue through row 22 |
| Foundations | 1 | 0.5 | horizontal lines under each column, stepping outward |

Horizontal, left to right: foundation overhang 3 · fluted column 5 · gap 2 ·
wordmark 67 · gap 2 · column 5 · overhang 3 = 87. The cornice bar spans the inner
81; pediment apex at x=43 (centre).

Letters: 8 cells wide (4 for `i`), 1 cell apart, 2-pixel strokes, x-height 10 px.
Eight cells per glyph is the floor for readable counters — at five or six cells
wide the `e`, `c`, `o` and `d` collapse into texture, which is why the earlier,
narrower draft was rejected.

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
so every row stays under 55 elements instead of 87 cells. This drops the `tint()` shadow and the
`_ ^ ~ ,` shorthand: both existed to fake depth, and the design forbids shadows.
The mark, not the letters, is now solid, so no per-character shadow is needed.

### Tiers (measured cell width, after the home screen's 2-cell padding each side)

| Tier | Needs | Content |
|---|---|---|
| full | width ≥ 91, height ≥ 20 | complete monument, 87 wide × 12 rows |
| compact | width ≥ 75, height ≥ 16 | wordmark under a cornice lintel, no columns, no pediment, 71 wide × 7 rows |
| minimal | otherwise | one line, `fife` muted + `code` bright, 8 wide × 1 row |
| hidden | height < 12 or width < 10 | nothing (existing guard, plus a floor so the plain wordmark cannot wrap) |

Full and compact trade different things. At 91 columns and above the whole monument
fits; between 75 and 90 the wordmark keeps its resolution and loses the columns and
pediment, because shrinking the glyphs to keep the architecture is what produced the
unreadable first draft. Short windows fall through to minimal instead of a squashed
emblem. Breakpoints are computed in code from the art's declared width plus the home
screen's padding, never from mockup pixels, and the tests assert the tier constants
rather than the literals.

`minimal` replaces the old `go` branch in the logo component. `go` stays exported and
untouched for `go-upsell-art.ts` and `mini/splash.ts`, so the upsell art is unchanged.

### Files

| File | Change |
|---|---|
| `packages/tui/src/logo.ts` | Add `logoArt` (the two monument grids), `logoWidth` / `logoHeight` / `logoSize`, `logoMode`, `logoColor`, and the pure `logoRuns` cell converter. Leave `logo {left, right}` and `go` byte-for-byte unchanged. |
| `packages/tui/src/component/logo.tsx` | Choose tier from `useTerminalDimensions()` + `useTheme()`, render grouped cells. Remove shadow/shorthand logic. |
| `packages/tui/test/component/logo-art.test.ts` | New: art invariants, wordmark decode, tier boundaries, frozen exports. |
| `packages/tui/test/component/logo.test.tsx` | New: tier rendering at widths 100 / 80 / 60 and height 10. |

`home.tsx` and `presentation.ts` need no changes. One other surface reuses the
component: `component/stats.tsx` renders `<Logo />` and already hides it below 38
rows, so it inherits the new mark unchanged; that is accepted, not an oversight.

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
  baseline row 21;
- the cell converter behind `logoRuns` maps the four top/bottom combinations
  correctly and never emits the `★` character;
- run-length grouping keeps every row under 55 `<text>` elements;
- the wordmark decodes to `f, i, f, e, c, o, d, e` — `c` open on the right, `o`
  closed, `d` carrying an ascender stem, `e` carrying a middle bar;
- the frozen `logo.left` / `logo.right` arrays are untouched by the new code.

Render tests reuse the existing `testRender` + `@jsxImportSource @opentui/solid`
pattern and provider wrapper already used across `packages/tui/test/component`; no
new harness. At width 100 the full tier mounts with 12 rows and 87 cells; at width
80 the compact tier is 7 rows and 71 cells; at width 60 the minimal tier renders the
literal text `fifecode`; at height 10 nothing renders.

## Differences from the reference (deliberate)

1. **Stroke anti-aliasing** is absent; edges are hard 1-px steps. Unavoidable.
2. **Star is proportionally larger, and the roof is a single stepped chevron.**
   The star is 7×5 px in a 9-px pediment; a five-point star below about 7 px wide
   collapses into a diamond or a blob (5×5 was tried and read as noise). A stepped
   roofline cannot hold a parallel inner line at this slope — shifting one row down
   and five columns inward lands on the same staircase — and nested chevrons at
   different slopes cross near the apex. The cornice bar supplies the depth the
   reference gets from its extra outlines.
3. **Foundations are shorter** than the reference's long outward lines, to keep the
   full tier at 87 cells rather than ~100 so it still fits a 120-column terminal with
   margin.
4. **No gradient/shading on `fife`.** The reference shows a soft vertical shade; the
   brief rules it out, so `fife` is one flat muted tone.
5. **No drop shadow** anywhere, unlike the current implementation.
6. **`★` is drawn from pixels**, not the character, because U+2605 is
   ambiguous-width and can occupy two cells in some terminals.
7. **Total height grows from 4 to 12 rows.** The glyphs needed 12 px of letter height
   at 8 cells wide to stop reading as texture; the pediment is compressed to 9 px so
   the whole mark stays inside 12 rows. Compact is 7 rows.

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

Exact pixel placement of the roofline steps, column flutes, and star points, and
the final letter silhouettes inside the 8 × 10 x-height box, were settled in the
drafted art. The tier thresholds are now fixed by it at 91 / 75 / 10 columns
(87 / 71 / 8 cells plus padding).
