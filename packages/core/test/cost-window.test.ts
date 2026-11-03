import { expect, test } from "bun:test"
import { compileWindow, isPeak, multiplierAt } from "@opencode/core/cost-window"

const deepseek = [
  {
    window: {
      days: ["mon", "tue", "wed", "thu", "fri"],
      ranges: [
        { from: "01:00", to: "04:00" },
        { from: "06:00", to: "10:00" },
      ],
      skipHolidays: true,
    },
    factor: 2,
  },
]

// 2026-11-02 is a Monday.
const monday = (hour: number, minute = 0) => Date.UTC(2026, 10, 2, hour, minute)

test("compiles a weekday, two-window holiday-aware predicate", () => {
  expect(
    compileWindow({
      utc_days: { in: ["mon", "tue", "wed", "thu", "fri"] },
      any: [
        { all: [{ utc_hours: { gte: "01:00" } }, { utc_hours: { lt: "04:00" } }] },
        { all: [{ utc_hours: { gte: "06:00" } }, { utc_hours: { lt: "10:00" } }] },
      ],
      not: { holiday: { equals: "CN" } },
    }),
  ).toEqual(deepseek[0]!.window)
})

test("drops a predicate the compiler does not understand", () => {
  expect(compileWindow({ region: { equals: "eu" } })).toBeUndefined()
})

test("drops an any-branch rule whose branches cover different days", () => {
  expect(
    compileWindow({
      any: [
        { utc_days: { in: ["mon"] }, utc_hours: { gte: "01:00", lt: "04:00" } },
        { utc_days: { in: ["fri"] }, utc_hours: { gte: "06:00", lt: "10:00" } },
      ],
    }),
  ).toBeUndefined()
})

test("applies the factor inside the first weekday window", () => {
  expect(multiplierAt(deepseek, monday(2))).toBe(2)
})

test("does not apply the factor at the window's upper bound", () => {
  expect(multiplierAt(deepseek, monday(4))).toBe(1)
})

test("applies the factor inside the second weekday window", () => {
  expect(multiplierAt(deepseek, monday(6, 30))).toBe(2)
})

test("does not apply the factor on a Saturday", () => {
  expect(multiplierAt(deepseek, Date.UTC(2026, 10, 7, 2))).toBe(1)
})

test("does not apply the factor on a Sunday", () => {
  expect(multiplierAt(deepseek, Date.UTC(2026, 10, 8, 7))).toBe(1)
})

test("does not apply the factor on a listed holiday", () => {
  expect(multiplierAt(deepseek, monday(2), { holidays: new Set(["2026-11-02"]) })).toBe(1)
})

test("returns 1 when the model carries no multipliers", () => {
  expect(multiplierAt(undefined, monday(2))).toBe(1)
})

test("reports peak only when the factor exceeds one", () => {
  expect(isPeak(deepseek, monday(2))).toBe(true)
  expect(isPeak(deepseek, monday(4))).toBe(false)
})
