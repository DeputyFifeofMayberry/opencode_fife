import type { ProviderUsageSnapshot } from "@opencode/client"
import { Plugin } from "@opencode/plugin/tui"
import { For, Match, Show, Switch, createMemo, createResource, onCleanup, onMount } from "solid-js"
import { useConfig } from "../../config"

const CODING_PLAN_IDS = new Set(["zai-coding-plan", "zhipuai-coding-plan"])
const REFRESH_MS = 5 * 60_000

const WINDOW_LABELS: Record<ProviderUsageSnapshot["windows"][number]["kind"], string> = {
  five_hour: "5h",
  weekly: "Week",
}

// Generated client types widen JSON numbers with "Infinity"/"NaN" sentinels; coerce back for math.
function numeric(value: number | string) {
  return typeof value === "number" ? value : Number(value)
}

function percent(value: number | string) {
  const n = numeric(value)
  return Number.isFinite(n) ? `${Math.round(n)}%` : "—"
}

// Compact countdown, e.g. "2h 13m" or "4d".
function duration(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "now"
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return "<1m"
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`
  if (hours > 0) return minutes % 60 > 0 ? `${hours}h ${minutes % 60}m` : `${hours}h`
  return `${minutes % 60}m`
}

function planLabel(plan: ProviderUsageSnapshot["plan"]) {
  const label = plan.name ?? plan.level
  return label ? `Usage — ${label}` : "Usage"
}

export function SidebarUsage(props: { context: Plugin.Context; sessionID: string }) {
  const config = useConfig()
  const theme = props.context.theme

  const enabled = createMemo(() => config.data.experimental?.zai_usage === true)
  const providerID = createMemo(() => props.context.data.session.get(props.sessionID)?.model?.providerID)
  // The resource source carries the whole visibility rule, so an ineligible
  // session renders nothing AND never fires the request.
  const source = createMemo(() => {
    if (!enabled()) return
    const id = providerID()
    return id !== undefined && CODING_PLAN_IDS.has(id) ? id : undefined
  })

  const [snapshot, { refetch }] = createResource(source, (id) =>
    props.context.client.provider.usage({ providerID: id }),
  )

  // One gate for render and polling: no item while ineligible, before the
  // first success, or while the latest fetch failed (the next poll retries).
  // unsupported_endpoint renders nothing rather than a dead entry.
  const data = createMemo(() => {
    if (source() === undefined) return
    if (snapshot.error) return
    const value = snapshot.latest
    if (!value || value.data.state === "unsupported_endpoint") return
    return value.data
  })

  onMount(() => {
    const timer = setInterval(() => {
      // Sessions that became ineligible since the last poll skip the refetch.
      if (source() !== undefined) void refetch()
    }, REFRESH_MS)
    onCleanup(() => clearInterval(timer))
  })

  // Window lines double as last-known data: the rate_limited and unavailable
  // states carry the server's stale snapshot in their windows.
  const windowLines = (value: ProviderUsageSnapshot) => (
    <For each={value.windows}>
      {(w) => (
        <text fg={numeric(w.percent) > 90 ? theme.text.feedback.warning.base : theme.text.muted}>
          {`${WINDOW_LABELS[w.kind]}  ${percent(w.percent)}`}
          {w.resetsAt !== undefined ? ` · resets in ${duration(numeric(w.resetsAt) - Date.now())}` : ""}
        </text>
      )}
    </For>
  )

  return (
    <Show when={data()} keyed>
      {(value) => (
        <box>
          <Switch>
            <Match when={value.state === "ok"}>
              <text fg={theme.text.base}>
                <b>{planLabel(value.plan)}</b>
              </text>
              {windowLines(value)}
              <Show when={value.tools}>
                {(tools) => (
                  <text fg={theme.text.muted}>
                    {`Tools ${numeric(tools().used)} / ${numeric(tools().limit)} this month`}
                  </text>
                )}
              </Show>
            </Match>
            <Match when={value.state === "no_plan"}>
              <text fg={theme.text.muted}>No active GLM Coding Plan</text>
            </Match>
            <Match when={value.state === "not_signed_in"}>
              <text fg={theme.text.muted}>Not signed in to Z.ai</text>
            </Match>
            <Match when={value.state === "key_rejected"}>
              <text fg={theme.text.muted}>Z.ai rejected this API key</text>
            </Match>
            <Match when={value.state === "rate_limited"}>
              {windowLines(value)}
              <text fg={theme.text.muted}>
                {value.retryAfter !== undefined
                  ? `rate limited · retry in ${duration(numeric(value.retryAfter) - Date.now())}`
                  : "rate limited"}
              </text>
            </Match>
            <Match when={value.state === "unavailable"}>
              {windowLines(value)}
              <text fg={theme.text.muted}>usage unavailable</text>
            </Match>
          </Switch>
        </box>
      )}
    </Show>
  )
}

export default Plugin.define({
  id: "opencode.sidebar.usage",
  setup(context) {
    context.ui.slot({
      append: "sidebar.content",
      render: (props) => <SidebarUsage context={context} sessionID={props.sessionID} />,
    })
  },
})
