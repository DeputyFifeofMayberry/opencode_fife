import { expect, test } from "bun:test"
// Fails until toRoman is implemented per the contract above.
import { toRoman } from "./to-roman"

test("maps units and fives", () => {
  expect(toRoman(1)).toBe("I")
  expect(toRoman(4)).toBe("IV")
  expect(toRoman(5)).toBe("V")
  expect(toRoman(9)).toBe("IX")
})

test("maps tens and hundreds subtractively", () => {
  expect(toRoman(14)).toBe("XIV")
  expect(toRoman(40)).toBe("XL")
  expect(toRoman(90)).toBe("XC")
  expect(toRoman(400)).toBe("CD")
  expect(toRoman(900)).toBe("CM")
})

test("maps the full range and rejects out-of-range values", () => {
  expect(toRoman(1987)).toBe("MCMLXXXVII")
  expect(toRoman(3999)).toBe("MMMCMXCIX")
  expect(() => toRoman(0)).toThrow(RangeError)
  expect(() => toRoman(4000)).toThrow(RangeError)
})
