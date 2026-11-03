import { expect, test } from "bun:test"
import { costLabel } from "../../src/util/cost-label"

test("formats a fully priced session", () => {
  expect(costLabel(0.42, false)).toBe("$0.42")
})

test("marks a subtotal that excludes unpriced steps", () => {
  expect(costLabel(0.42, true)).toBe("~$0.42")
})

test("shows a dash when every step is unpriced", () => {
  expect(costLabel(0, true)).toBe("—")
})

test("omits the segment when nothing has been spent or counted", () => {
  expect(costLabel(0, false)).toBeUndefined()
})
