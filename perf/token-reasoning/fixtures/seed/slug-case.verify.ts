import { expect, test } from "bun:test"
// Fails until slugCase keeps digit words attached without splitting them from their term.
import { slugCase } from "./slug-case"

test("word boundaries slug on case and separators", () => {
  expect(slugCase("  Fix: Import-Order Bug! ")).toBe("fix-import-order-bug")
})

test("digit words stay attached to their term", () => {
  expect(slugCase("release v2 notes")).toBe("release-v2-notes")
})

test("digit runs stay attached to their term", () => {
  expect(slugCase("RFC 4627 and UTF8")).toBe("rfc-4627-and-utf8")
})
