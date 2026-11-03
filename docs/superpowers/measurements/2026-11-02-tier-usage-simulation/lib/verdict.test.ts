import { expect, test } from "bun:test"
import { verdictFor } from "./verdict"

test("no invoice is inconclusive", () => {
  expect(verdictFor(null, null)).toBe("inconclusive")
})

test("a zero invoice is inconclusive", () => {
  expect(verdictFor(50, 0)).toBe("inconclusive")
})

test("a missing local figure is inconclusive even with a positive invoice", () => {
  // The defect: a null deltaPct previously fell through to aggregate-within-tolerance.
  expect(verdictFor(null, 12.5)).toBe("inconclusive")
})

test("local above invoice overstates", () => {
  expect(verdictFor(20, 10)).toBe("local-overstates")
})

test("local below invoice understates", () => {
  expect(verdictFor(-20, 10)).toBe("local-understates")
})

test("agreement within the tolerance is aggregate-within-tolerance", () => {
  expect(verdictFor(0, 10)).toBe("aggregate-within-tolerance")
})

test("the boundaries at plus and minus 15 are inside the tolerance", () => {
  expect(verdictFor(15, 10)).toBe("aggregate-within-tolerance")
  expect(verdictFor(-15, 10)).toBe("aggregate-within-tolerance")
})
