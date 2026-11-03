import { expect, test } from "bun:test"
import { reprice } from "../src/backfill-cost"

const catalog = {
  deepseek: {
    models: {
      "deepseek-flash": {
        cost: {
          text: { input: { price: 0.15, cache: { read: 0.003 } }, output: { price: 0.6 } },
          multipliers: [
            {
              when: {
                utc_days: { in: ["mon", "tue", "wed", "thu", "fri"] },
                any: [
                  { all: [{ utc_hours: { gte: "01:00" } }, { utc_hours: { lt: "04:00" } }] },
                  { all: [{ utc_hours: { gte: "06:00" } }, { utc_hours: { lt: "10:00" } }] },
                ],
              },
              factor: 2,
            },
          ],
        },
      },
    },
  },
}

const monday = (hour: number) => Date.UTC(2026, 10, 2, hour)
const row = (at: number, costProvenance: Record<string, number>) => ({
  providerID: "deepseek",
  modelID: "deepseek-flash",
  tokens: { input: 1_000_000, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  at,
  cost: 0.15,
  costProvenance,
})

test("doubles an estimated row recorded inside a peak window", () => {
  expect(reprice(row(monday(2), { estimated: 0.15 }), catalog)).toEqual({ cost: 0.3, changed: true })
})

test("leaves an estimated row recorded outside a peak window alone", () => {
  expect(reprice(row(monday(5), { estimated: 0.15 }), catalog)).toEqual({ cost: 0.15, changed: false })
})

test("never rewrites a row the endpoint priced", () => {
  expect(reprice(row(monday(2), { provider: 0.15 }), catalog)).toEqual({ cost: 0.15, changed: false })
})

test("skips a row whose model is not in the catalog", () => {
  expect(reprice({ ...row(monday(2), { estimated: 0.15 }), modelID: "gone" }, catalog)).toBe("skipped")
})

test("skips a message that mixes provider and estimated costs", () => {
  expect(reprice(row(monday(2), { estimated: 0.1, provider: 0.05 }), catalog)).toBe("skipped")
})
