import { Plugin } from "@opencode/plugin/tui"
import { createEffect, createSignal, onCleanup, Show } from "solid-js"
import { useConfig } from "../../config"
import { useThemes } from "../../context/theme"
import { AintsLine, HartleyGood, JazzFuneral, Touchdown } from "./celebrate"
import { beadOrder, brand, THEME_NAME } from "./brand"
import { FirstDownPulse, TwoMinuteDrill, WorkingLine } from "./drive"
import { Audible, FleurIdle, HitchFleur, SnapCadence } from "./snap"

const BEAD_STEP_MS = 900
const TWO_MINUTE_MS = 60_000

// One staged moment in the footer theater. Durations live here so the
// theater clears the stage; the effect components only perform.
const MOMENT_MS = {
  snap: 1300,
  audible: 1100,
  "first-down": 1400,
  "two-minute": 1600,
  touchdown: 3500,
  "field-goal": 2000,
  aints: 2200,
  funeral: 4200,
} as const
type MomentKind = keyof typeof MOMENT_MS

// Repeated outcomes replay badly, so only they are rate-limited; in-drive
// beats stay ungated because plays already pace them.
const COOLDOWN_MS: Partial<Record<MomentKind, number>> = {
  touchdown: 8000,
  "field-goal": 6000,
  aints: 8000,
  funeral: 15000,
}

const FIRST_DOWN_EVERY = 4
// A short drive caps in a field goal; everything else gets the touchdown.
const FIELD_GOAL_PLAYS = 4
const FIELD_GOAL_MS = 15_000

type DriveState = {
  plays: number
  startedAt: number | undefined
  hurryUp: boolean
  hitchAt: number
  moment: Moment | undefined
}
type Moment = { kind: MomentKind; seq: number; variant: boolean }
type TheaterState = { sessions: Record<string, DriveState | undefined> }

// The slices of plugin state the mounted footers read and write. Events fire
// for every session, but only the theater whose sessionID matches renders,
// so background sessions accumulate invisible state harmlessly.
type Theater = {
  readonly state: TheaterState
  readonly touch: (sessionID: string, mutation: (draft: DriveState) => void) => void
  readonly setMoment: (sessionID: string, kind: MomentKind, variant?: boolean) => void
}

export default Plugin.define({
  id: "opencode.saints",
  setup(context) {
    const [state, mutate] = context.storage.memory("theater", { initial: { sessions: {} } as TheaterState })
    const cooldowns = new Map<string, number>()
    let snapCount = 0

    const ensure = (draft: TheaterState, sessionID: string) =>
      (draft.sessions[sessionID] ??= { plays: 0, startedAt: undefined, hurryUp: false, hitchAt: 0, moment: undefined })

    const touch = (sessionID: string, mutation: (draft: DriveState) => void) =>
      mutate((draft) => mutation(ensure(draft, sessionID)))

    const setMoment = (sessionID: string, kind: MomentKind, variant = false) => {
      const cooldown = COOLDOWN_MS[kind]
      if (cooldown !== undefined) {
        const now = Date.now()
        if (now - (cooldowns.get(kind) ?? 0) < cooldown) return
        cooldowns.set(kind, now)
      }
      touch(sessionID, (draft) => {
        draft.moment = { kind, seq: (draft.moment?.seq ?? 0) + 1, variant }
      })
    }

    const dispose = [
      // Your prompt is the snap; the cadence bridges admission to kickoff.
      // Brees mixed his calls, so every sixth snap checks with RED 80.
      context.data.on("session.inbox.enqueued", (event) => {
        if (event.data.item.type !== "user") return
        snapCount += 1
        setMoment(event.data.sessionID, "snap", snapCount % 6 === 0)
      }),
      // A new drive resets the counters but lets a running cadence finish.
      context.data.on("session.execution.started", (event) =>
        touch(event.data.sessionID, (draft) => {
          draft.plays = 0
          draft.startedAt = Date.now()
          draft.hurryUp = false
        }),
      ),
      // Every tool call is a play; every fourth moves the chains. The event
      // deduplicates per call, and `executed` only marks provider-hosted
      // tools — local runs arrive as `executed: false` and still count.
      context.data.on("session.tool.called", (event) => {
        const sessionID = event.data.sessionID
        const plays = (state.sessions[sessionID]?.plays ?? 0) + 1
        touch(sessionID, (draft) => {
          draft.plays = plays
        })
        if (plays % FIRST_DOWN_EVERY === 0) setMoment(sessionID, "first-down")
      }),
      // Cap the drive: short ones get Hartley, real ones get the bead toss.
      context.data.on("session.execution.succeeded", (event) => {
        const sessionID = event.data.sessionID
        const drive = state.sessions[sessionID]
        const plays = drive?.plays ?? 0
        const elapsed = drive?.startedAt !== undefined ? Date.now() - drive.startedAt : 0
        setMoment(sessionID, plays <= FIELD_GOAL_PLAYS && elapsed <= FIELD_GOAL_MS ? "field-goal" : "touchdown")
      }),
      // A dead drive gets the jazz funeral.
      context.data.on("session.execution.failed", (event) => setMoment(event.data.sessionID, "funeral")),
      // Killing a run is an audible, not a failure.
      context.data.on("session.execution.interrupted", (event) => {
        if (event.data.reason === "user" || event.data.reason === "superseded")
          setMoment(event.data.sessionID, "audible")
      }),
      // A retry is bag-era weather: wry, brief, survivable.
      context.data.on("session.retry.scheduled", (event) => setMoment(event.data.sessionID, "aints")),
      // Text landing in the composer is the center tapping the ball.
      context.data.on("tui.prompt.append", () => {
        const route = context.ui.router.current()
        if (route.type !== "session") return
        touch(route.sessionID, (draft) => {
          draft.hitchAt = Date.now()
        })
      }),
    ]

    const theater: Theater = { state, touch, setMoment }

    context.ui.slot({
      append: "prompt.footer.status",
      render: (input) => <SessionTheater context={context} theater={theater} sessionID={input.sessionID} />,
    })
    context.ui.slot({
      append: "home.footer.status",
      render: () => <MardiBeads />,
    })

    return () => dispose.reverse().forEach((off) => off())
  },
})

// The session footer stages every effect in one line so moments replace the
// baseline in place instead of shifting the layout around the composer.
function SessionTheater(props: { context: Plugin.Context; theater: Theater; sessionID?: string }) {
  const themes = useThemes()
  const config = useConfig().data
  const active = () => themes.selected === THEME_NAME && (config.animations ?? true)
  const drive = () =>
    props.sessionID !== undefined ? props.theater.state.sessions[props.sessionID] : undefined
  const working = () =>
    props.sessionID !== undefined && props.context.data.session.status(props.sessionID) === "running"

  // Moments own fixed durations; the theater clears its own stage so the
  // baseline can return without each effect keeping a clock.
  createEffect(() => {
    const moment = drive()?.moment
    const sessionID = props.sessionID
    if (moment === undefined || sessionID === undefined) return
    const timer = setTimeout(
      () =>
        props.theater.touch(sessionID, (draft) => {
          if (draft.moment?.seq === moment.seq) draft.moment = undefined
        }),
      MOMENT_MS[moment.kind],
    )
    onCleanup(() => clearTimeout(timer))
  })

  // Past the two-minute mark the drive shifts to the hurry-up offense.
  createEffect(() => {
    const sessionID = props.sessionID
    if (sessionID === undefined || !working()) return
    const timer = setInterval(() => {
      const current = props.theater.state.sessions[sessionID]
      if (current?.startedAt === undefined || current.hurryUp) return
      if (Date.now() - current.startedAt < TWO_MINUTE_MS) return
      props.theater.touch(sessionID, (draft) => {
        draft.hurryUp = true
      })
      props.theater.setMoment(sessionID, "two-minute")
    }, 1000)
    onCleanup(() => clearInterval(timer))
  })

  return (
    <Show when={active()}>
      <Show
        keyed
        when={drive()?.moment}
        fallback={
          <Show
            when={working()}
            fallback={<IdleEmblem theater={props.theater} sessionID={props.sessionID} />}
          >
            <box flexShrink={0}>
              <WorkingLine plays={drive()?.plays ?? 0} hurryUp={drive()?.hurryUp ?? false} />
            </box>
          </Show>
        }
      >
        {(moment) => <box flexShrink={0}>{renderMoment(moment)}</box>}
      </Show>
    </Show>
  )
}

function renderMoment(moment: Moment) {
  switch (moment.kind) {
    case "snap":
      return <SnapCadence variant={moment.variant} />
    case "audible":
      return <Audible />
    case "first-down":
      return <FirstDownPulse />
    case "two-minute":
      return <TwoMinuteDrill />
    case "touchdown":
      return <Touchdown />
    case "field-goal":
      return <HartleyGood />
    case "aints":
      return <AintsLine />
    case "funeral":
      return <JazzFuneral />
  }
}

// The idle emblem is the line of scrimmage: a breathing fleur-de-lis that
// hitches bright when the center taps the ball.
function IdleEmblem(props: { theater: Theater; sessionID?: string }) {
  const hitchAt = () =>
    (props.sessionID !== undefined ? props.theater.state.sessions[props.sessionID]?.hitchAt : undefined) ?? 0
  return (
    <Show keyed when={hitchAt()} fallback={<FleurIdle />}>
      {(_at: number) => <HitchFleur />}
    </Show>
  )
}

// Effect: three slow fleur-de-lis beads cycling Mardi Gras colors on the
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
