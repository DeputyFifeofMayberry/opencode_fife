import { expect, test } from "bun:test"
// Fails until parseBytes implements the human-readable byte-size contract above.
import { parseBytes } from "./parse-bytes"

test("parses plain bytes and SI units", () => {
  expect(parseBytes("512 B")).toBe(512)
  expect(parseBytes("1 KB")).toBe(1000)
  expect(parseBytes("3 MB")).toBe(3_000_000)
})

test("parses binary units and case-insensitive spellings", () => {
  expect(parseBytes("2 KiB")).toBe(2048)
  expect(parseBytes("4 MiB")).toBe(4_194_304)
  expect(parseBytes("5kb")).toBe(5000)
})

test("accepts fractional values that land on whole bytes", () => {
  expect(parseBytes("1.5 KiB")).toBe(1536)
  expect(parseBytes("0.5 KB")).toBe(500)
})

test("rejects malformed sizes and non-integer results", () => {
  expect(() => parseBytes("-1 KB")).toThrow(RangeError)
  expect(() => parseBytes("1 TB")).toThrow(RangeError)
  expect(() => parseBytes("0.1 B")).toThrow(RangeError)
  expect(() => parseBytes("many")).toThrow(RangeError)
})
