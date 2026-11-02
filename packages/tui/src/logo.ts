// "fife" / "code", with a sheriff's star badge over the i.
export const logo = {
  left: [" ▄▄   ★    ▄▄      ", "█     █   █    █▀▀█", "█^^^  █   █^^^ █^^^", "█     █   █    ▀▀▀▀"],
  right: ["             ▄     ", "█▀▀▀ █▀▀█ █▀▀█ █▀▀█", "█___ █__█ █__█ █^^^", "▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀"],
}

export const go = {
  left: ["    ", "█▀▀▀", "█_^█", "▀▀▀▀"],
  right: ["    ", "█▀▀█", "█__█", "▀▀▀▀"],
}

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
  full: [
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
  ],
  compact: [
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
  ],
}

export const logoWidth = { full: 87, compact: 71, minimal: 8 } as const
export const logoHeight = { full: 12, compact: 7, minimal: 1 } as const

// Thresholds are the artwork widths themselves; callers pass available content
// columns, so a padded container subtracts its padding before asking.
export const logoSize = logoWidth

// The full stack is 3 spacer + 12 logo + 1 + prompt (4) + footer (1); 20 rows lets
// the spacer give one row back. Compact needs 16 for its 7 rows. Width is
// available content columns, not terminal columns.
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

// Upper half is the foreground, lower half the background; a lone pixel is
// always the foreground because the other half stays transparent.
export const logoRunColors = (run: LogoRun): { readonly fg: LogoLayer | null; readonly bg: LogoLayer | null } => {
  if (run.glyph === "▀") return { fg: run.top, bg: run.bottom }
  if (run.glyph === "▄") return { fg: run.bottom, bg: null }
  return { fg: null, bg: null }
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
