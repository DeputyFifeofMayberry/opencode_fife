import { describe, expect, test } from "bun:test"
import { finiteNumber, recordValue, stringValue } from "./boundary.js"

describe("stringValue", () => {
  test("returns strings and undefined for everything else", () => {
    expect(stringValue("keep")).toBe("keep")
    expect(stringValue("")).toBe("")
    expect(stringValue(1)).toBeUndefined()
    expect(stringValue(null)).toBeUndefined()
    expect(stringValue(undefined)).toBeUndefined()
    expect(stringValue({})).toBeUndefined()
  })
})

describe("recordValue", () => {
  test("returns plain records and undefined for arrays and primitives", () => {
    const record = { key: "value" }
    expect(recordValue(record)).toBe(record)
    expect(recordValue([1])).toBeUndefined()
    expect(recordValue("text")).toBeUndefined()
    expect(recordValue(null)).toBeUndefined()
    expect(recordValue(undefined)).toBeUndefined()
  })
})

describe("finiteNumber", () => {
  test("returns finite numbers and undefined for NaN, Infinity, and non-numbers", () => {
    expect(finiteNumber(0)).toBe(0)
    expect(finiteNumber(-1.5)).toBe(-1.5)
    expect(finiteNumber(Number.NaN)).toBeUndefined()
    expect(finiteNumber(Number.POSITIVE_INFINITY)).toBeUndefined()
    expect(finiteNumber("1")).toBeUndefined()
    expect(finiteNumber(null)).toBeUndefined()
    expect(finiteNumber(undefined)).toBeUndefined()
  })
})
