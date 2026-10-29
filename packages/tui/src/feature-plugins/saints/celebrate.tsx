import { TextAttributes } from "@opentui/core"
import { For, Show, createEffect, createSignal, onCleanup } from "solid-js"
import { FadeText } from "../../component/fade-text"
import { ShimmerText } from "../../component/shimmer-text"
import { useThemes } from "../../context/theme"
import { beadOrder, brand } from "./brand"

// The touchdown payoff, staged like a Dome score: scoreboard flash, a Mardi
// Gras bead toss arcing through the crowd, then the chant.
const TOUCHDOWN_STEP_MS = 80
const BEAD_START_MS = 900
const CHANT_START_MS = 2600
const BEAD_REVEAL_MS = 90
const beads = [..."·⚜· ⚜ ·⚜· ⚜ ·⚜·"]

export function Touchdown() {
  const themes = useThemes()
  const [tick, setTick] = createSignal(0)
  createEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), TOUCHDOWN_STEP_MS)
    onCleanup(() => clearInterval(timer))
  })
  const palette = () => brand[themes.mode()]
  const elapsed = () => tick() * TOUCHDOWN_STEP_MS
  return (
    <Show
      when={elapsed() < BEAD_START_MS}
      fallback={
        <Show when={elapsed() < CHANT_START_MS} fallback={<WhoDat />}>
          <BeadToss elapsed={elapsed()} />
        </Show>
      }
    >
      <ShimmerText fg={palette().gold} shimmer={palette().goldBright} attributes={TextAttributes.BOLD}>
        ⚜ TOUCHDOWN SAINTS ⚜
      </ShimmerText>
    </Show>
  )
}

// Beads arc through the crowd: glyphs land left to right while the throw
// cycles the Mardi Gras colors.
function BeadToss(props: { elapsed: number }) {
  const themes = useThemes()
  const palette = () => brand[themes.mode()]
  const visible = () =>
    Math.min(beads.length, Math.floor((props.elapsed - BEAD_START_MS) / BEAD_REVEAL_MS) + 1)
  const colorPhase = () => Math.floor(props.elapsed / 240)
  return (
    <box flexShrink={0}>
      <For each={beads.slice(0, visible())}>
        {(bead, index) => (
          <text fg={palette()[beadOrder[(index() + colorPhase()) % beadOrder.length]]}>{bead}</text>
        )}
      </For>
    </box>
  )
}

// The chant that closes every celebration.
const CHANT_FRAME_MS = 160

export function WhoDat() {
  const themes = useThemes()
  const [tick, setTick] = createSignal(0)
  createEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), CHANT_FRAME_MS)
    onCleanup(() => clearInterval(timer))
  })
  const palette = () => brand[themes.mode()]
  return (
    <text
      fg={[palette().gold, palette().purple, palette().green][tick() % 3]}
      attributes={TextAttributes.BOLD}
    >
      ⚜ WHO DAT! ⚜
    </text>
  )
}

// The chip shot: a short drive caps in a field goal — NFC championship,
// overtime, Hartley from 40, "we're going to Miami".
const KICK_STEP_MS = 550

export function HartleyGood() {
  const themes = useThemes()
  const [kicked, setKicked] = createSignal(false)
  const timer = setTimeout(() => setKicked(true), KICK_STEP_MS)
  onCleanup(() => clearTimeout(timer))
  const palette = () => brand[themes.mode()]
  return (
    <Show
      when={kicked()}
      fallback={
        <text fg={palette().gold} attributes={TextAttributes.BOLD}>
          ⚜ HARTLEY…
        </text>
      }
    >
      <text fg={palette().goldBright} attributes={TextAttributes.BOLD}>
        ⟨ ‖ ⟩ <span style={{ fg: palette().green }}>GOOD.</span>
      </text>
    </Show>
  )
}

// Small failures get bag-era self-deprecation: you lived through 1–15, a
// retry is nothing. Kraft tan, like the paper bag.
export function AintsLine() {
  const themes = useThemes()
  const palette = () => brand[themes.mode()]
  return (
    <FadeText fg={palette().kraft} fade={palette().kraftDim} duration={1100}>
      ⚜ Aints. We've seen worse.
    </FadeText>
  )
}

// A dead drive gets a jazz funeral: a slow dirge on the way to the grave,
// then the band strikes up and the second line dances back.
const DIRGE_MS = 2100

export function JazzFuneral() {
  const themes = useThemes()
  const [dirge, setDirge] = createSignal(true)
  const timer = setTimeout(() => setDirge(false), DIRGE_MS)
  onCleanup(() => clearTimeout(timer))
  const palette = () => brand[themes.mode()]
  return (
    <Show
      when={dirge()}
      fallback={
        <FadeText fg={palette().gold} fade={palette().goldBright} duration={2100}>
          ⚜ the band plays on
        </FadeText>
      }
    >
      <FadeText fg={palette().dirge} fade={palette().dirgeDim} duration={2100}>
        ♩ ♪ a dirge for the drive…
      </FadeText>
    </Show>
  )
}
