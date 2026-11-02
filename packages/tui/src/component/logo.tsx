import { For, Show } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import { useTheme } from "../context/theme"
import { logoArt, logoColor, logoMode, logoRuns, type LogoLayer, type LogoRun } from "../logo"

export function Logo() {
  const theme = useTheme()
  const dimensions = useTerminalDimensions()

  const tier = () => logoMode(dimensions().width, dimensions().height)
  const art = () => {
    const mode = tier()
    return mode === "full" || mode === "compact" ? logoArt[mode] : undefined
  }
  const color = (layer: LogoLayer) => theme.text[logoColor(layer)]
  const foreground = (run: LogoRun) => (run.glyph === "▄" ? color(run.bottom!) : run.glyph === "▀" ? color(run.top!) : undefined)
  const background = (run: LogoRun) => (run.glyph === "▀" && run.bottom ? color(run.bottom) : undefined)

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
                    {(run) => (
                      <text fg={foreground(run)} bg={background(run)} selectable={false}>
                        {run.text}
                      </text>
                    )}
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
