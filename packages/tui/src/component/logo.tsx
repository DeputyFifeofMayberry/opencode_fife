import { For, Show } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { logoArt, logoColor, logoMode, logoRunColors, logoRuns, type LogoLayer } from "../logo"

export function Logo() {
  const theme = useTheme()
  const dimensions = useTerminalDimensions()

  const tier = () => logoMode(dimensions().width, dimensions().height)
  const art = () => {
    const mode = tier()
    return mode === "full" || mode === "compact" ? logoArt[mode] : undefined
  }
  const paint = (layer: LogoLayer | null) => (layer === null ? undefined : theme.text[logoColor(layer)])

  return (
    <>
      <Show when={tier() === "minimal"}>
        <box flexDirection="row">
          <text fg={theme.text.muted} selectable={false}>
            fife
          </text>
          <text fg={theme.text.base} selectable={false}>
            code
          </text>
        </box>
      </Show>
      <Show when={art()}>
        {(rows) => (
          <box flexDirection="column">
            <For each={logoRuns(rows())}>
              {(row) => (
                <box flexDirection="row">
                  <For each={row}>
                    {(run) => {
                      const colors = logoRunColors(run)
                      return (
                        <text fg={paint(colors.fg)} bg={paint(colors.bg)} selectable={false}>
                          {run.text}
                        </text>
                      )
                    }}
                  </For>
                </box>
              )}
            </For>
          </box>
        )}
      </Show>
    </>
  )
}
