import { expect, test } from "bun:test"
import { pricingStatus, totalSpend } from "../../src/util/home-status"

const deepseek = [
  {
    window: {
      days: ["mon", "tue", "wed", "thu", "fri"],
      ranges: [{ from: "01:00", to: "04:00" }],
      skipHolidays: false,
    },
    factor: 2,
  },
]

const monday = (hour: number) => Date.UTC(2026, 10, 2, hour)

test("reports peak inside the window", () => {
  expect(pricingStatus([deepseek], monday(2))).toEqual({ peak: true, label: "Peak" })
})

test("reports off-peak outside the window", () => {
  expect(pricingStatus([deepseek], monday(5))).toEqual({ peak: false, label: "Off-peak" })
})

test("sums root sessions only, because a root total already includes its children", () => {
  const sessions = [{ id: "root" }, { id: "child", parentID: "root" }, { id: "other" }]
  const costs: Record<string, number> = { root: 1, child: 0.5, other: 2 }
  expect(totalSpend(sessions, (id) => costs[id] ?? 0)).toBe(3)
})

test("returns zero for no sessions", () => {
  expect(totalSpend([], () => 1)).toBe(0)
})

test("reports nothing when the models in play disagree about peak", () => {
  const evening = [
    {
      window: { days: [], ranges: [{ from: "06:00", to: "10:00" }], skipHolidays: false },
      factor: 2,
    },
  ]
  expect(pricingStatus([deepseek, evening], monday(2))).toBeUndefined()
})

test("reports the shared state when every model agrees", () => {
  expect(pricingStatus([deepseek, deepseek], monday(2))).toEqual({ peak: true, label: "Peak" })
})
