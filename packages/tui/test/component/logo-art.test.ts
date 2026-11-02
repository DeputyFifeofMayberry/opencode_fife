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
    for (const row of logoArt.full.slice(10, 17)) {
      expect(row.slice(10, 31)).toContain("F")
      expect(row.slice(32, 55)).toContain("C")
    }
  })

  test("all eight letters sit on row 16", () => {
    const baseline = logoArt.full[16]
    for (const column of [12, 17, 22, 27]) expect(baseline[column]).toBe("F")
    for (const column of [33, 39, 45, 51]) expect(baseline[column]).toBe("C")
  })

  test("the star is drawn from pixels, not characters", () => {
    for (const rows of [logoArt.full, logoArt.compact]) {
      expect(rows.join("")).not.toContain("★")
      expect(rows.join("")).toContain("S")
    }
  })

  test("the pre-existing exports are untouched", () => {
    expect(logo.left.length).toBe(4)
    expect(logo.right.length).toBe(4)
    expect(go.left.length).toBe(4)
  })
})

describe("logoMode", () => {
  test("picks the tier from measured cells", () => {
    expect(logoMode(80, 24)).toBe("full")
    expect(logoMode(logoSize.full, 16)).toBe("full")
    expect(logoMode(logoSize.full - 1, 24)).toBe("compact")
    expect(logoMode(logoSize.compact, 16)).toBe("compact")
    expect(logoMode(logoSize.compact - 1, 24)).toBe("minimal")
    expect(logoMode(400, 15)).toBe("minimal")
    expect(logoMode(400, 11)).toBeNull()
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
      expect(row.length).toBeLessThan(40)
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
