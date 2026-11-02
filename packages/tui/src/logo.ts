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

// Two pixel rows per terminal row, one pixel per cell. `.` empty, `F`/`C` the two
// wordmark tones, `S` the star, `o`/`i` the outer and inner monument tones.
export const logoArt: Record<"full" | "compact", string[]> = {
  full: [
    "................................o................................",
    "...........................ooooo.ooooo...........................",
    "......................ooooo.....S.....ooooo......................",
    ".................ooooo.........SSS.........ooooo.................",
    "............ooooo.............SSSSS.............ooooo............",
    ".......ooooo...................S.S...................ooooo.......",
    "..ooooo.......................S...S.......................ooooo..",
    "ooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooooo",
    "...iiii.....FFF..F....FFF.......................C.........iiii...",
    "...i..i.....F.........F.........................C.........i..i...",
    "...i..i...FFFFF..F..FFFFF..FFF...CCC...CCC...CCCC..CCC....i..i...",
    "...i..i.....F....F....F...F.....C...C.C...C.C...C.C.......i..i...",
    "...i..i.....F....F....F...F.....C.....C...C.C...C.C.......i..i...",
    "...i..i.....F....F....F...FFFF..C.....C...C.C...C.CCCC....i..i...",
    "...i..i.....F....F....F...F.....C.....C...C.C...C.C.......i..i...",
    "...iiii.....F....F....F...F.....C...C.C...C.C...C.C.......iiii...",
    "...iiii.....F....F....F....FFF...CCC...CCC...CCCC..CCC....iiii...",
    ".oooooooooo...........................................oooooooooo.",
  ],
  compact: [
    ".........................o.........................",
    ".....................oooo.oooo.....................",
    ".................oooo....S....oooo.................",
    ".............oooo.......SSS.......oooo.............",
    ".........oooo..........SSSSS..........oooo.........",
    ".....oooo...............S.S...............oooo.....",
    ".oooo..................S...S..................oooo.",
    "ooooooooooooooooooooooooooooooooooooooooooooooooooo",
    ".....FFF..F....FFF.......................C.........",
    ".....F.........F.........................C.........",
    "...FFFFF..F..FFFFF..FFF...CCC...CCC...CCCC..CCC....",
    ".....F....F....F...F.....C...C.C...C.C...C.C.......",
    ".....F....F....F...F.....C.....C...C.C...C.C.......",
    ".....F....F....F...FFFF..C.....C...C.C...C.CCCC....",
    ".....F....F....F...F.....C.....C...C.C...C.C.......",
    ".....F....F....F...F.....C...C.C...C.C...C.C.......",
    ".....F....F....F....FFF...CCC...CCC...CCCC..CCC....",
    "...................................................",
  ],
}

export const logoWidth = { full: 65, compact: 51, minimal: 8 } as const
export const logoHeight = { full: 9, compact: 9, minimal: 1 } as const
// Art width plus the home screen's 2 cells of padding on each side.
export const logoSize = { full: 69, compact: 55 } as const

export function logoMode(width: number, height: number): LogoTier | null {
  if (height < 12) return null
  if (height >= 16 && width >= logoSize.full) return "full"
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
