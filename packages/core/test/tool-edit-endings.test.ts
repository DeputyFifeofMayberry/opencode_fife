import { describe, expect, it } from "bun:test"
import { EditTool } from "@opencode/core/tool/plugin/edit"
import { withRegionEndings } from "@opencode/core/tool/plugin/edit-endings"

describe("edit line endings", () => {
  it("joins a uniform CRLF region's replacement with CRLF", () => {
    expect(withRegionEndings("a\r\nb\r\nc", "a\nb\nc\nd", "\r\n")).toBe("a\r\nb\r\nc\r\nd")
  })

  it("joins a uniform LF region's replacement with LF", () => {
    expect(withRegionEndings("a\nb\nc", "x\ny\nz", "\n")).toBe("x\ny\nz")
  })

  it("falls through to alignment when a uniform region's fallback disagrees", () => {
    expect(withRegionEndings("a\r\nb\r\nc", "x\ny", "\n")).toBe("x\r\ny")
  })

  it("uses the fallback when the region has no line break", () => {
    expect(withRegionEndings("abc", "x\ny", "\r\n")).toBe("x\r\ny")
  })

  it("returns a replacement with no line break unchanged, even for a mixed region", () => {
    expect(withRegionEndings("a\r\nb\nc", "single", "\n")).toBe("single")
  })

  it("keeps a 1,000-line common prefix's own endings before aligning the changed core", () => {
    const prefix = Array.from({ length: 1_000 }, (_, index) => `keep ${index}`)
    const regionLines = [...prefix, "old one", "old two"]
    const replacementLines = [...prefix, "new one", "new two"]
    const endings = regionLines.slice(0, -1).map((_, index) => (index % 2 === 0 ? "\r\n" : "\n"))
    const region = regionLines
      .map((line, index) => (index === regionLines.length - 1 ? line : line + endings[index]!))
      .join("")
    const expected = replacementLines
      .map((line, index) => (index === replacementLines.length - 1 ? line : line + endings[index]!))
      .join("")
    expect(withRegionEndings(region, replacementLines.join("\n"), "\n")).toBe(expected)
  })

  it("does not trim a common suffix", () => {
    // before = ["A", "B", "A", ""], after = ["A", "X"]. A suffix trim would map "A" to the last
    // region line and give it LF; the traceback maps it to the first, which ends CRLF.
    expect(withRegionEndings("A\r\nB\nA\n", "A\nX", "\n")).toBe("A\r\nX")
  })

  it("aligns 10,000 uniform CRLF lines per side without a table", () => {
    const regionLines = Array.from({ length: 10_000 }, (_, index) => `line ${index}`)
    const replacementLines = Array.from({ length: 10_000 }, (_, index) => `changed ${index}`)
    expect(withRegionEndings(regionLines.join("\r\n"), replacementLines.join("\n"), "\r\n")).toBe(
      replacementLines.join("\r\n"),
    )
  })

  it("keeps EditTool's exported surface unchanged", () => {
    expect(Object.keys(EditTool).sort()).toEqual(["EditTool", "Input", "Output", "Plugin", "name"])
  })
})
