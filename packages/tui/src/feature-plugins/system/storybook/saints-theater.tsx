import type { Plugin } from "@opencode/plugin/tui"
import { useTerminalDimensions } from "@opentui/solid"
import { batch, createSignal, For, Show } from "solid-js"
import { AintsLine, HartleyGood, JazzFuneral, Touchdown } from "../../saints/celebrate"
import { downAndDistance, FirstDownPulse, TwoMinuteDrill, WorkingLine } from "../../saints/drive"
import { Audible, FleurIdle, HitchFleur, SnapCadence } from "../../saints/snap"
import { StoryFooter } from "./footer"
import type { Story } from "./index"

type StoryMoment = { kind: keyof typeof moments; seq: number }

// Each entry pairs a keybinding with the production component it stages.
const moments = {
  snap: (variant: () => boolean) => <SnapCadence variant={variant()} />,
  audible: () => <Audible />,
  "first-down": () => <FirstDownPulse />,
  "two-minute": () => <TwoMinuteDrill />,
  touchdown: () => <Touchdown />,
  "field-goal": () => <HartleyGood />,
  aints: () => <AintsLine />,
  funeral: () => <JazzFuneral />,
  hitch: () => <HitchFleur />,
} as const

export const saintsTheaterStory: Story = {
  id: "saints-theater",
  title: "Saints theater",
  render: (context) => <SaintsTheaterStory context={context} />,
}

function SaintsTheaterStory(props: { context: Plugin.Context }) {
  const dimensions = useTerminalDimensions()
  const theme = props.context.theme
  const [running, setRunning] = createSignal(false)
  const [plays, setPlays] = createSignal(0)
  const [hurryUp, setHurryUp] = createSignal(false)
  const [variant, setVariant] = createSignal(false)
  const [hitchAt, setHitchAt] = createSignal(0)
  const [moment, setMoment] = createSignal<StoryMoment>()

  const fire = (kind: keyof typeof moments) =>
    setMoment({ kind, seq: (moment()?.seq ?? 0) + 1 })
  const nextPlay = () => {
    const next = plays() + 1
    batch(() => {
      setPlays(next)
      if (next % 4 === 0) fire("first-down")
    })
  }
  const reset = () =>
    batch(() => {
      setRunning(false)
      setPlays(0)
      setHurryUp(false)
      setVariant(false)
      setHitchAt(0)
      setMoment(undefined)
    })

  props.context.keymap.layer(() => ({
    commands: [
      {
        bind: "escape",
        title: "Back to storybook",
        group: "Storybook",
        run: () => props.context.ui.router.navigate({ type: "plugin", name: "storybook" }),
      },
      { bind: "w", title: "Toggle idle / working", group: "Saints", run: () => setRunning((value) => !value) },
      { bind: "p", title: "Run one play", group: "Saints", run: nextPlay },
      { bind: "s", title: "Snap cadence", group: "Saints", run: () => fire("snap") },
      { bind: "v", title: "Toggle RED 80 cadence", group: "Saints", run: () => setVariant((value) => !value) },
      { bind: "k", title: "Audible (steer)", group: "Saints", run: () => fire("audible") },
      {
        bind: "2",
        title: "Two-minute drill",
        group: "Saints",
        run: () =>
          batch(() => {
            setHurryUp(true)
            fire("two-minute")
          }),
      },
      { bind: "t", title: "Touchdown", group: "Saints", run: () => fire("touchdown") },
      { bind: "f", title: "Field goal", group: "Saints", run: () => fire("field-goal") },
      { bind: "a", title: "Aints one-liner", group: "Saints", run: () => fire("aints") },
      { bind: "j", title: "Jazz funeral", group: "Saints", run: () => fire("funeral") },
      {
        bind: "h",
        title: "Composer hitch",
        group: "Saints",
        run: () => {
          setMoment(undefined)
          setHitchAt(Date.now())
        },
      },
      { bind: "r", title: "Reset", group: "Storybook", run: reset },
    ],
  }))

  return (
    <box width={dimensions().width} height={dimensions().height} flexDirection="column" backgroundColor={theme.background.base}>
      <box paddingTop={1} paddingLeft={2} flexDirection="column">
        <text fg={theme.text.base}>saints theater</text>
        <text fg={theme.text.muted}>the new-orleans-saints footer effects — pick the theme for full effect</text>
        <box height={1} />
        <text fg={theme.text.muted} wrapMode="none">
          ⚜ your prompt is the snap · tools are plays · every fourth moves the chains
        </text>
        <text fg={theme.text.muted} wrapMode="none">
          ⚜ short drives kick a field goal · long drives get the touchdown · dead drives get the band
        </text>
      </box>
      <box flexGrow={1} paddingLeft={2} flexDirection="column">
        <For each={["…", "…", "…"]}>
          {(line) => <text fg={theme.text.muted}>{line}</text>}
        </For>
      </box>
      <box height={1} paddingLeft={1}>
        <Show
          keyed
          when={moment()}
          fallback={
            <Show
              when={running()}
              fallback={
                <Show keyed when={hitchAt()} fallback={<FleurIdle />}>
                  {(_at: number) => <HitchFleur />}
                </Show>
              }
            >
              <WorkingLine plays={plays()} hurryUp={hurryUp()} />
            </Show>
          }
        >
          {(current) => moments[current.kind](variant)}
        </Show>
      </box>
      <StoryFooter
        context={props.context}
        title="saints-theater"
        status={running() ? downAndDistance(plays()) : "idle"}
        message={hurryUp() ? "no huddle" : undefined}
        controls={[
          { shortcut: "w", label: "idle/working" },
          { shortcut: "p", label: "play" },
          { shortcut: "s", label: "snap" },
          { shortcut: "v", label: "RED 80" },
          { shortcut: "k", label: "audible" },
          { shortcut: "2", label: "two-minute" },
          { shortcut: "t", label: "touchdown" },
          { shortcut: "f", label: "field goal" },
          { shortcut: "a", label: "aints" },
          { shortcut: "j", label: "funeral" },
          { shortcut: "h", label: "hitch" },
          { shortcut: "r", label: "reset" },
          { shortcut: "esc", label: "storybook" },
        ]}
      />
    </box>
  )
}
