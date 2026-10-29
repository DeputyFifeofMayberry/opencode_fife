import { TextAttributes } from "@opentui/core"
import { createEffect, createSignal, onCleanup } from "solid-js"
import { ShimmerText } from "../../component/shimmer-text"
import { useThemes } from "../../context/theme"
import { brand } from "./brand"

// Down and distance for the drive: every four tool plays reaches a new first
// down, the chain-moving identity Saints football is built on. Each play in
// the group burns roughly three yards of the ten.
const ordinal = ["1st", "2nd", "3rd", "4th"] as const

export function downAndDistance(plays: number) {
  const down = (plays % 4) + 1
  return `${ordinal[down - 1]} & ${10 - 3 * (plays % 4)}`
}

// The between-plays baseline while the offense works: the second line keeps
// playing and the tracker keeps down and distance. Past the two-minute
// warning the shimmer shifts purple for the no-huddle pace.
export function WorkingLine(props: { plays: number; hurryUp: boolean }) {
  const themes = useThemes()
  const palette = () => brand[themes.mode()]
  return (
    <ShimmerText fg={palette().gold} shimmer={props.hurryUp ? palette().purple : palette().goldBright}>
      {`⚜ second line — ${downAndDistance(props.plays)}${props.hurryUp ? " · no huddle" : ""}`}
    </ShimmerText>
  )
}

// The Superdome scoreboard flash when the chains move.
export function FirstDownPulse() {
  const themes = useThemes()
  const [tick, setTick] = createSignal(0)
  createEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 180)
    onCleanup(() => clearInterval(timer))
  })
  const palette = () => brand[themes.mode()]
  return (
    <text
      fg={[palette().gold, palette().green, palette().goldBright][tick() % 3]}
      attributes={TextAttributes.BOLD}
    >
      ⚑ FIRST DOWN ⚜ moving the chains
    </text>
  )
}

// The hurry-up offense: a long drive shifts gears, no huddle, faster tempo.
export function TwoMinuteDrill() {
  const themes = useThemes()
  const [tick, setTick] = createSignal(0)
  createEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 240)
    onCleanup(() => clearInterval(timer))
  })
  const palette = () => brand[themes.mode()]
  return (
    <text
      fg={tick() % 2 === 0 ? palette().gold : palette().purple}
      attributes={TextAttributes.BOLD}
    >
      ⚑ TWO-MINUTE DRILL — no huddle
    </text>
  )
}
