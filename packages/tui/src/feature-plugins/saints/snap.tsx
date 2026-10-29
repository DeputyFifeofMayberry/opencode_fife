import { TextAttributes } from "@opentui/core"
import { createSignal, onCleanup, Show } from "solid-js"
import { FadeText } from "../../component/fade-text"
import { useThemes } from "../../context/theme"
import { brand } from "./brand"

// The snap count: sending a prompt starts the play, so it gets the cadence.
// The staged call mirrors Brees at the line — color number twice, set, hut —
// and the timing lands HUT! about when execution takes the ball.
const CADENCE_STEP_MS = 340

export function SnapCadence(props: { variant: boolean }) {
  const themes = useThemes()
  const [phase, setPhase] = createSignal(0)
  const timers = [1, 2, 3].map((step) => setTimeout(() => setPhase(step), step * CADENCE_STEP_MS))
  onCleanup(() => timers.forEach(clearTimeout))
  const palette = () => brand[themes.mode()]
  const call = props.variant ? "RED 80!" : "BLUE 80!"
  const lines = [`⚜ ${call}`, `⚜ ${call} ${call}`, "⚜ SET…", "⚜ HUT! HUT!"]
  return (
    <text
      fg={phase() === 3 ? palette().goldBright : palette().gold}
      attributes={TextAttributes.BOLD}
    >
      {lines[Math.min(phase(), 3)]}
    </text>
  )
}

// The audible: killing a run checks out of the play at the line, like Brees
// screaming KILL KILL to dump a bad call. A decision, never a failure.
export function Audible() {
  const themes = useThemes()
  const palette = () => brand[themes.mode()]
  return (
    <FadeText fg={palette().gold} fade={palette().goldBright} duration={450} attributes={TextAttributes.BOLD}>
      ⚜ KILL! KILL! — checking out
    </FadeText>
  )
}

// The line of scrimmage: the composer is where every play starts, so the
// idle footer keeps a fleur-de-lis breathing gold while the Dome waits.
export function FleurIdle() {
  const themes = useThemes()
  const palette = () => brand[themes.mode()]
  return <FadeText fg={palette().gold} fade={palette().goldBright} duration={2600}>⚜</FadeText>
}

// Text landing in the composer is the center tapping the ball: one short
// bright hitch, then back to the breathing emblem.
export function HitchFleur() {
  const themes = useThemes()
  const [hitched, setHitched] = createSignal(true)
  const timer = setTimeout(() => setHitched(false), 350)
  onCleanup(() => clearTimeout(timer))
  const palette = () => brand[themes.mode()]
  return (
    <Show when={hitched()} fallback={<FleurIdle />}>
      <text fg={palette().goldBright} attributes={TextAttributes.BOLD}>⚜</text>
    </Show>
  )
}
