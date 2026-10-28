import { expect, test } from "bun:test"
import { packageName, start } from "./index.js"

test("start returns the local app package name", () => {
  expect(start()).toBe(packageName)
})
