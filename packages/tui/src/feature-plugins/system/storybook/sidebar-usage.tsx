import type { Plugin } from "@opencode/plugin/tui"
import type { ProviderUsageSnapshot, ProviderUsageWindow, SessionInfo } from "@opencode/client"
import { useTerminalDimensions } from "@opentui/solid"
import { createSignal, Show } from "solid-js"
import { ConfigProvider, resolve as resolveConfig } from "../../../config"
import { SESSION_SIDEBAR_WIDTH } from "../../../ui/layout"
import { SidebarUsage } from "../../sidebar/usage"
import { StoryFooter } from "./footer"
import type { Story } from "./index"

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const SESSION_ID = "storybook-sidebar-usage"

// The real SidebarUsage gate reads useConfig(); a nested ConfigProvider wins
// over the app's provider, so the story exercises the true gate path with the
// experiment on instead of bypassing or duplicating the check.
const fixtureConfig = resolveConfig({ experimental: { zai_usage: true } }, { terminalSuspend: true })

const fixtureSession: SessionInfo = {
  id: SESSION_ID,
  projectID: "storybook",
  model: { providerID: "zai-coding-plan", id: "glm-4.6" },
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: 0, updated: 0 },
  location: { directory: "/storybook" },
}

type UsageState = Exclude<ProviderUsageSnapshot["state"], "unsupported_endpoint">

const STATES: UsageState[] = ["ok", "no_plan", "not_signed_in", "key_rejected", "rate_limited", "unavailable"]

// Countdowns are computed from Date.now() at fixture build time so they read
// like live data; values are static after that, which is fine for a story.
function fixtureWindow(
  kind: ProviderUsageWindow["kind"],
  used: number,
  total: number,
  resetsIn?: number,
): ProviderUsageWindow {
  return {
    kind,
    percent: Math.round((used / total) * 100),
    used,
    total,
    ...(resetsIn === undefined ? {} : { resetsAt: Date.now() + resetsIn }),
  }
}

function fixtureSnapshot(state: UsageState): ProviderUsageSnapshot {
  switch (state) {
    case "ok":
      return {
        providerID: "zai-coding-plan",
        state: "ok",
        plan: { level: "pro", name: "GLM Coding Plan" },
        windows: [
          fixtureWindow("five_hour", 210, 500, 2 * HOUR + 13 * MINUTE),
          fixtureWindow("weekly", 5041, 7100, 4 * DAY + 3 * HOUR),
        ],
        tools: { used: 128, limit: 600 },
        fetchedAt: Date.now() - MINUTE,
      }
    case "no_plan":
      return {
        providerID: "zai-coding-plan",
        state: "no_plan",
        plan: {},
        windows: [],
        fetchedAt: Date.now() - MINUTE,
      }
    case "not_signed_in":
      return {
        providerID: "zai-coding-plan",
        state: "not_signed_in",
        plan: {},
        windows: [],
        fetchedAt: Date.now() - MINUTE,
      }
    case "key_rejected":
      return {
        providerID: "zai-coding-plan",
        state: "key_rejected",
        plan: {},
        windows: [],
        fetchedAt: Date.now() - 5 * MINUTE,
      }
    case "rate_limited":
      return {
        providerID: "zai-coding-plan",
        state: "rate_limited",
        plan: { level: "pro", name: "GLM Coding Plan" },
        windows: [
          fixtureWindow("five_hour", 480, 500, 2 * HOUR + 13 * MINUTE),
          fixtureWindow("weekly", 6300, 7100, 4 * DAY + 3 * HOUR),
        ],
        retryAfter: Date.now() + 13 * MINUTE + 40_000,
        fetchedAt: Date.now() - 30_000,
      }
    case "unavailable":
      return {
        providerID: "zai-coding-plan",
        state: "unavailable",
        plan: { level: "pro", name: "GLM Coding Plan" },
        // The server carries last-known windows in this state; fetchedAt is
        // hours old to make the staleness visible.
        windows: [fixtureWindow("five_hour", 270, 500, 45 * MINUTE), fixtureWindow("weekly", 4400, 7100)],
        fetchedAt: Date.now() - 2 * HOUR,
      }
  }
}

function SidebarUsageStory(props: { context: Plugin.Context }) {
  const dimensions = useTerminalDimensions()
  const theme = props.context.theme
  const [state, setState] = createSignal<UsageState>("ok")
  // Every command bumps the generation so the real component remounts and
  // refetches through the fixture client; re-selecting the same state refreshes
  // the countdowns rather than keeping a stale snapshot.
  const [generation, setGeneration] = createSignal(1)
  const apply = (next: UsageState) => {
    setState(next)
    setGeneration((value) => value + 1)
  }

  // The real context with only the two data sources the component reads
  // replaced by fixtures; nothing here performs I/O.
  const fixtureContext: Plugin.Context = {
    ...props.context,
    client: {
      ...props.context.client,
      provider: {
        ...props.context.client.provider,
        usage: async () => ({ location: { directory: "/storybook" }, data: fixtureSnapshot(state()) }),
      },
    },
    data: {
      ...props.context.data,
      session: {
        ...props.context.data.session,
        get: (sessionID: string) =>
          sessionID === SESSION_ID ? fixtureSession : props.context.data.session.get(sessionID),
      },
    },
  }

  props.context.keymap.layer(() => ({
    commands: [
      {
        bind: "escape",
        title: "Back to storybook",
        group: "Storybook",
        run: () => props.context.ui.router.navigate({ type: "plugin", name: "storybook" }),
      },
      ...STATES.map((value, index) => ({
        bind: String(index + 1),
        title: `State: ${value}`,
        group: "Storybook",
        run: () => apply(value),
      })),
      { bind: "r", title: "Reset to ok state", group: "Storybook", run: () => apply("ok") },
    ],
  }))

  return (
    <box
      width={dimensions().width}
      height={dimensions().height}
      flexDirection="column"
      backgroundColor={theme.background.base}
    >
      <ConfigProvider config={fixtureConfig}>
        {/* Keyed remount is the story's reset valve: the component's resource source
            (providerID) never changes, so state switches must go through a fresh mount
            to refetch from the fixture client. The callback param is required by
            Solid's Show typing but carries nothing the child needs. */}
        <Show when={generation()} keyed>
          {(mount) => (
            <box
              width={SESSION_SIDEBAR_WIDTH}
              paddingTop={1}
              paddingBottom={1}
              paddingLeft={2}
              paddingRight={2}
              backgroundColor={theme.background.raised.base}
            >
              <box paddingRight={1}>
                <SidebarUsage context={fixtureContext} sessionID={SESSION_ID} />
              </box>
            </box>
          )}
        </Show>
      </ConfigProvider>
      <box flexGrow={1} backgroundColor={theme.background.base} />
      <StoryFooter
        context={props.context}
        title="storybook / Sidebar usage"
        details={[`state: ${state()}`, `${SESSION_SIDEBAR_WIDTH} cols`]}
        controls={[
          { shortcut: "1", label: "ok" },
          { shortcut: "2", label: "no plan" },
          { shortcut: "3", label: "not signed in" },
          { shortcut: "4", label: "key rejected" },
          { shortcut: "5", label: "rate limited" },
          { shortcut: "6", label: "unavailable" },
          { shortcut: "r", label: "reset" },
          { shortcut: "esc", label: "back" },
        ]}
      />
    </box>
  )
}

export const sidebarUsageStory: Story = {
  id: "sidebar-usage",
  title: "Sidebar usage",
  render: (context) => <SidebarUsageStory context={context} />,
}
