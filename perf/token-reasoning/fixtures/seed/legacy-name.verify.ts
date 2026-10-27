import { expect, test } from "bun:test"
// Fails until the run renames LEGACY_NAME to MODERN_NAME in legacy-name.ts.
import { MODERN_NAME } from "./legacy-name"

test("exports the renamed constant", () => {
  expect(MODERN_NAME).toBe(1)
})
