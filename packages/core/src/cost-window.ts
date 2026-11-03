import type { Model } from "@opencode/schema/model"
import { isPeak, multiplierAt } from "@opencode/util/cost-window"

/**
 * Compiles a catalog price predicate into the window the pricing code evaluates.
 * A rule the compiler cannot read is dropped instead of guessed at, so an
 * unrecognised predicate can never change a price.
 */

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

type Predicate = Readonly<Record<string, unknown>>

type Draft = {
  days: string[]
  ranges: { from: string; to: string }[]
  skipHolidays: boolean
  from?: string
  to?: string
}

function compileNode(node: Predicate): Draft | undefined {
  const draft: Draft = { days: [], ranges: [], skipHolidays: false }

  for (const [key, raw] of Object.entries(node)) {
    if (key === "all") {
      if (!Array.isArray(raw)) return undefined
      for (const child of raw) {
        if (!isRecord(child)) return undefined
        const inner = compileNode(child)
        if (!inner) return undefined
        draft.days.push(...inner.days)
        draft.ranges.push(...inner.ranges)
        draft.skipHolidays ||= inner.skipHolidays
        draft.from = inner.from ?? draft.from
        draft.to = inner.to ?? draft.to
      }
      continue
    }
    if (key === "any") {
      if (!Array.isArray(raw)) return undefined
      for (const child of raw) {
        if (!isRecord(child)) return undefined
        const inner = compileNode(child)
        if (!inner) return undefined
        draft.days.push(...inner.days)
        draft.ranges.push(...inner.ranges)
        draft.skipHolidays ||= inner.skipHolidays
      }
      continue
    }
    if (key === "not") {
      if (!isRecord(raw) || !("holiday" in raw)) return undefined
      draft.skipHolidays = true
      continue
    }
    if (key === "utc_days") {
      const days =
        isRecord(raw) && Array.isArray(raw.in) ? raw.in.filter((day): day is string => typeof day === "string") : []
      if (!days.length) return undefined
      draft.days.push(...days)
      continue
    }
    if (key === "utc_hours") {
      if (!isRecord(raw)) return undefined
      if (typeof raw.gte === "string") draft.from = raw.gte
      if (typeof raw.lt === "string") draft.to = raw.lt
      continue
    }
    return undefined
  }

  if (draft.from && draft.to) draft.ranges.push({ from: draft.from, to: draft.to })
  return draft
}

/** The compiled window for a predicate, or undefined when it is not a time rule. */
export function compileWindow(node: Predicate): Model.CostWindow | undefined {
  const draft = compileNode(node)
  if (!draft) return undefined
  if (!draft.ranges.length) return undefined
  return {
    days: [...new Set(draft.days)],
    ranges: draft.ranges,
    skipHolidays: draft.skipHolidays,
  }
}

export { isPeak, multiplierAt }
