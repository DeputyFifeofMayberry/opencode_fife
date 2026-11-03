import type { Model } from "@opencode/schema/model"

/**
 * Compiles a catalog price predicate into the window the pricing code evaluates.
 * A rule the compiler cannot read is dropped instead of guessed at, so an
 * unrecognised predicate can never change a price.
 */

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const

type Predicate = Readonly<Record<string, unknown>>
export type Options = { holidays?: ReadonlySet<string> }

const isRecord = (value: unknown): value is Predicate =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const toMinutes = (value: string) => {
  const [hours, minutes] = value.split(":")
  return Number(hours) * 60 + Number(minutes ?? 0)
}

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
      const days = isRecord(raw) && Array.isArray(raw.in) ? raw.in.filter((day): day is string => typeof day === "string") : []
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

/** The factor of the first multiplier whose window contains this instant, or 1. */
export function multiplierAt(
  multipliers: readonly Model.CostMultiplier[] | undefined,
  at: number,
  options: Options = {},
): number {
  const date = new Date(at)
  const day = DAYS[date.getUTCDay()]!
  const clock = date.getUTCHours() * 60 + date.getUTCMinutes()
  const holidays = options.holidays ?? new Set<string>()
  const stamp = date.toISOString().slice(0, 10)

  for (const multiplier of multipliers ?? []) {
    const window = multiplier.window
    if (window.days.length && !window.days.includes(day)) continue
    if (window.skipHolidays && holidays.has(stamp)) continue
    if (!window.ranges.some((range) => clock >= toMinutes(range.from) && clock < toMinutes(range.to))) continue
    return multiplier.factor
  }
  return 1
}

/** True when a request made at this instant is priced above the base rate. */
export function isPeak(
  multipliers: readonly Model.CostMultiplier[] | undefined,
  at: number,
  options: Options = {},
): boolean {
  return multiplierAt(multipliers, at, options) > 1
}
