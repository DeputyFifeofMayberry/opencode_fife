import { Plugin } from "@opencode/plugin/tui"
import { createMemo, createSignal, Match, onCleanup, onMount, Show, Switch } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { usePlugin } from "../../plugin/context"
import { Slot } from "../../plugin/render"
import { costLabel } from "../../util/cost-label"
import { pricingStatus, totalSpend } from "../../util/home-status"

export function homeFooterVisibility(width: number) {
  return {
    mcpCommand: width >= 64,
    pluginCommand: width >= 80,
    version: width >= 64,
    pricing: width >= 96,
  }
}

function Mcp(props: { context: Plugin.Context }) {
  const dimensions = useTerminalDimensions()
  const visibility = createMemo(() => homeFooterVisibility(dimensions().width))
  const list = createMemo(() => props.context.data.location.mcp.server.list(props.context.location) ?? [])
  const failed = createMemo(() => list().filter((item) => item.status.status === "failed").length)
  const count = createMemo(() => list().filter((item) => item.status.status === "connected").length)

  return (
    <Show when={list().length}>
      <box gap={1} flexDirection="row" flexShrink={0} onMouseUp={() => props.context.keymap.dispatch("mcp.list")}>
        <text fg={props.context.theme.text.base}>
          <Switch>
            <Match when={failed()}>
              <span style={{ fg: props.context.theme.text.feedback.error.base }}>⊙ </span>
              {failed()} MCP failed
            </Match>
            <Match when={true}>
              <span
                style={{
                  fg:
                    count() > 0 ? props.context.theme.text.feedback.success.base : props.context.theme.text.muted,
                }}
              >
                ⊙{" "}
              </span>
              {count()} MCP
            </Match>
          </Switch>
        </text>
        <Show when={visibility().mcpCommand}>
          <text fg={props.context.theme.text.muted}>/mcps</text>
        </Show>
      </box>
    </Show>
  )
}

function Plugins(props: { context: Plugin.Context }) {
  const dimensions = useTerminalDimensions()
  const visibility = createMemo(() => homeFooterVisibility(dimensions().width))
  const plugins = usePlugin()
  const failed = createMemo(
    () =>
      plugins.list().filter((item) => item.status === "failed").length +
      plugins.server().filter((item) => item.state.status === "failed").length,
  )

  return (
    <Show when={failed()}>
      <box gap={1} flexDirection="row" flexShrink={0} onMouseUp={() => props.context.keymap.dispatch("plugins.list")}>
        <text fg={props.context.theme.text.base}>
          <span style={{ fg: props.context.theme.text.feedback.error.base }}>⊙ </span>
          {failed()} plugin{failed() === 1 ? "" : "s"} failed
        </text>
        <Show when={visibility().pluginCommand}>
          <text fg={props.context.theme.text.muted}>/plugins</text>
        </Show>
      </box>
    </Show>
  )
}

function Pricing(props: { context: Plugin.Context }) {
  const dimensions = useTerminalDimensions()
  const visibility = createMemo(() => homeFooterVisibility(dimensions().width))
  const [now, setNow] = createSignal(Date.now())
  onMount(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    onCleanup(() => clearInterval(timer))
  })
  // The badge and the charged price read the same compiled window, so they cannot disagree.
  const multipliers = createMemo(() => {
    const models = props.context.data.location.model.list(props.context.location) ?? []
    for (const model of models) {
      for (const cost of model.cost) if (cost.multipliers?.length) return cost.multipliers
    }
    return undefined
  })
  const status = createMemo(() => {
    const value = multipliers()
    return value ? pricingStatus(value, now()) : undefined
  })
  const spend = createMemo(() =>
    totalSpend(props.context.data.session.list(), (id) => props.context.data.session.cost(id)),
  )

  return (
    <Show when={visibility().pricing && status()}>
      {(value) => (
        <box gap={1} flexDirection="row" flexShrink={0}>
          <text
            fg={
              value().peak
                ? props.context.theme.text.feedback.warning.base
                : props.context.theme.text.muted
            }
          >
            ⊙ {value().label}
          </text>
          <Show when={costLabel(spend(), false)}>
            {(label) => <text fg={props.context.theme.text.muted}>{label()} spend</text>}
          </Show>
        </box>
      )}
    </Show>
  )
}

function View(props: { context: Plugin.Context }) {
  const dimensions = useTerminalDimensions()
  const visibility = createMemo(() => homeFooterVisibility(dimensions().width))

  return (
    <Show when={dimensions().height >= 14 && dimensions().width >= 44}>
      <box
        width="100%"
        paddingTop={dimensions().height < 16 ? 0 : 1}
        paddingBottom={dimensions().height < 16 ? 0 : 1}
        paddingLeft={2}
        paddingRight={2}
        flexDirection="row"
        flexShrink={0}
        gap={2}
      >
        <Mcp context={props.context} />
        <Plugins context={props.context} />
        <Slot path="home.footer.status" />
        <Pricing context={props.context} />
        <box flexGrow={1} />
        <Show when={visibility().version}>
          <box flexShrink={0}>
            <text fg={props.context.theme.text.muted}>{props.context.app.version}</text>
          </box>
        </Show>
      </box>
    </Show>
  )
}

export default Plugin.define({
  id: "opencode.home.footer",
  setup(context) {
    // Root takeover: an external plugin replacing home.footer wins (last-
    // enabled) and this builtin shows as suppressed, not silently gone.
    // Append keeps the path open to additive plugin claims; an external
    // replace still takes the boundary over.
    context.ui.slot({ append: "home.footer", render: () => <View context={context} /> })
  },
})
