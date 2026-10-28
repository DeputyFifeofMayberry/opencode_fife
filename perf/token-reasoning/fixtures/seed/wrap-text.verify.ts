import { expect, test } from "bun:test"
// Fails until wrapText implements the greedy word-wrap contract above.
import { wrapText } from "./wrap-text"

test("wraps greedily at spaces", () => {
  expect(wrapText("the quick brown fox", 10)).toBe("the quick\nbrown fox")
  expect(wrapText("one two three", 8)).toBe("one two\nthree")
})

test("preserves explicit newlines", () => {
  expect(wrapText("a b\nc d", 5)).toBe("a b\nc d")
  expect(wrapText("alpha beta\ngamma", 6)).toBe("alpha\nbeta\ngamma")
})

test("keeps words longer than the width intact", () => {
  expect(wrapText("abcdefgh ij", 4)).toBe("abcdefgh\nij")
})

test("rejects non-positive widths", () => {
  expect(() => wrapText("text", 0)).toThrow(RangeError)
  expect(() => wrapText("text", -2)).toThrow(RangeError)
})
