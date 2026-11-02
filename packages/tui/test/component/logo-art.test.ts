import { describe, expect, test } from "bun:test"
import { go, logo, logoArt, logoColor, logoHeight, logoMode, logoRunColors, logoRuns, logoSize, logoWidth } from "../../src/logo"

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

  test("thresholds are the artwork widths, so one column less drops a tier", () => {
    expect(logoMode(logoWidth.full - 1, 24)).toBe("compact")
    expect(logoMode(logoWidth.compact - 1, 24)).toBe("minimal")
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

describe("logoRunColors", () => {
  test("paints the upper half as foreground and the lower half as background", () => {
    expect(logoRunColors({ glyph: "▀", top: "C", bottom: "F", text: "▀" })).toEqual({ fg: "C", bg: "F" })
  })

  test("keeps a lone upper pixel in the foreground", () => {
    expect(logoRunColors({ glyph: "▀", top: "C", bottom: null, text: "▀" })).toEqual({ fg: "C", bg: null })
  })

  test("keeps a lone lower pixel in the foreground", () => {
    expect(logoRunColors({ glyph: "▄", top: null, bottom: "S", text: "▄" })).toEqual({ fg: "S", bg: null })
  })

  test("leaves an empty cell unpainted", () => {
    expect(logoRunColors({ glyph: " ", top: null, bottom: null, text: " " })).toEqual({ fg: null, bg: null })
  })
})
