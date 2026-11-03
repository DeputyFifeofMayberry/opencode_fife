/** Evaluates compiled price windows. Shared by server pricing and the client badge. */

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const

export type CostWindow = {
  readonly days: readonly string[]
  readonly ranges: readonly { readonly from: string; readonly to: string }[]
  readonly skipHolidays: boolean
}

export type CostMultiplier = {
  readonly window: CostWindow
  readonly factor: number
}

export type Options = { holidays?: ReadonlySet<string> }

const toMinutes = (value: string) => {
  const [hours, minutes] = value.split(":")
  return Number(hours) * 60 + Number(minutes ?? 0)
}

/** The factor of the first multiplier whose window contains this instant, or 1. */
export function multiplierAt(
  multipliers: readonly CostMultiplier[] | undefined,
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
  multipliers: readonly CostMultiplier[] | undefined,
  at: number,
  options: Options = {},
): boolean {
  return multiplierAt(multipliers, at, options) > 1
}
