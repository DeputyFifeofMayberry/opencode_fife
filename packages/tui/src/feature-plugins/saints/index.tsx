import { Plugin } from "@opencode/plugin/tui"
import { RGBA, TextAttributes } from "@opentui/core"
import { createEffect, createSignal, onCleanup, Show } from "solid-js"
import { ShimmerText } from "../../component/shimmer-text"
import { useConfig } from "../../config"
import { useThemes } from "../../context/theme"

const THEME_NAME = "new-orleans-saints"

const CELEBRATION_FRAME_MS = 160
const CELEBRATION_TOTAL_MS = 2400
// Repeated tool turns each end in a running -> idle flip; the cooldown keeps
// one answer with many steps from strobing the banner.
const CELEBRATION_COOLDOWN_MS = 8000
const BEAD_STEP_MS = 900

// Brand colors, not semantic tokens: these effects render only while the
// Saints theme is selected and exist to paint its identity, so they carry no
// role in any other theme and have no honest token to borrow.
const brand = {
  dark: {
    gold: RGBA.fromHex("#d3bc8d"),
    goldBright: RGBA.fromHex("#f5e6bd"),
    purple: RGBA.fromHex("#a78bd6"),
    green: RGBA.fromHex("#4fa96b"),
  },
  light: {
    gold: RGBA.fromHex("#7a5e14"),
    goldBright: RGBA.fromHex("#a8842e"),
    purple: RGBA.fromHex("#5b3e91"),
    green: RGBA.fromHex("#1f7a46"),
  },
}
const beadOrder = ["purple", "green", "gold"] as const

export default Plugin.define({
  id: "opencode.saints",
  setup(context) {
    context.ui.slot({
      append: "prompt.footer.status",
      render: (input) => <SessionTheater context={context} sessionID={input.sessionID} />,
    })
    context.ui.slot({
      append: "home.footer.status",
      render: () => <MardiBeads />,
    })
  },
})

// The session footer stages both working and celebration effects so they
// alternate in place instead of shifting the layout around the composer.
function SessionTheater(props: { context: Plugin.Context; sessionID?: string }) {
  const themes = useThemes()
  const config = useConfig().data
  const [celebrating, setCelebrating] = createSignal(false)
  const active = () => themes.selected === THEME_NAME && (config.animations ?? true)
  const working = () =>
    props.sessionID !== undefined && props.context.data.session.status(props.sessionID) === "running"

  // Only a run that started and finished while this footer was mounted may
  // celebrate, so restoring a finished session never replays an old touchdown.
  const previous = new Map<string, "idle" | "running">()
  let lastCelebration = 0
  createEffect(() => {
    const sessionID = props.sessionID
    if (sessionID === undefined) return
    const status = props.context.data.session.status(sessionID)
    const was = previous.get(sessionID)
    previous.set(sessionID, status)
    if (was !== "running" || status !== "idle") return
    const now = Date.now()
    if (now - lastCelebration < CELEBRATION_COOLDOWN_MS) return
    lastCelebration = now
    setCelebrating(true)
  })
  createEffect(() => {
    if (!celebrating()) return
    const timer = setTimeout(() => setCelebrating(false), CELEBRATION_TOTAL_MS)
    onCleanup(() => clearTimeout(timer))
  })

  return (
    <Show when={active()}>
      <Show when={celebrating()} fallback={<Show when={working()}><SecondLine /></Show>}>
        <box flexShrink={0}>
          <WhoDat />
        </box>
      </Show>
    </Show>
  )
}

// Effect 1: one-shot "Who Dat!" touchdown banner when a run completes.
function WhoDat() {
  const themes = useThemes()
  const [tick, setTick] = createSignal(0)
  createEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), CELEBRATION_FRAME_MS)
    onCleanup(() => clearInterval(timer))
  })
  const color = () => {
    const palette = brand[themes.mode()]
    return [palette.gold, palette.purple, palette.green][tick() % 3]
  }
  return (
    <text fg={color()} attributes={TextAttributes.BOLD}>
      ⚜ WHO DAT! ⚜
    </text>
  )
}

// Effect 2: a gold second-line shimmer while the session is working.
function SecondLine() {
  const themes = useThemes()
  const palette = () => brand[themes.mode()]
  return (
    <box flexShrink={0}>
      <ShimmerText fg={palette().gold} shimmer={palette().goldBright}>
        ⚜ second line
      </ShimmerText>
    </box>
  )
}

// Effect 3: three slow fleur-de-lis beads cycling Mardi Gras colors on the
// home footer.
function MardiBeads() {
  const themes = useThemes()
  const config = useConfig().data
  const [tick, setTick] = createSignal(0)
  createEffect(() => {
    if (!(config.animations ?? true)) return
    const timer = setInterval(() => setTick((value) => value + 1), BEAD_STEP_MS)
    onCleanup(() => clearInterval(timer))
  })
  const bead = (index: number) => {
    const palette = brand[themes.mode()]
    return palette[beadOrder[(tick() + index) % beadOrder.length]]
  }
  return (
    <Show when={themes.selected === THEME_NAME && (config.animations ?? true)}>
      <box flexShrink={0} gap={1}>
        <text fg={bead(0)}>⚜</text>
        <text fg={bead(1)}>⚜</text>
        <text fg={bead(2)}>⚜</text>
      </box>
    </Show>
  )
}
