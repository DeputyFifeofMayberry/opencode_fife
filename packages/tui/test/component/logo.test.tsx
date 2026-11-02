/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { mkdtempSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { Logo } from "../../src/component/logo"
import { ConfigProvider } from "../../src/config"
import { Keymap } from "../../src/context/keymap"
import { ThemeProvider } from "../../src/context/theme"
import { emptyThemeSource } from "../fixture/fixture"
import { TestTuiContexts } from "../fixture/tui-environment"
import { createTuiResolvedConfig } from "../fixture/tui-runtime"

const root = mkdtempSync(path.join(os.tmpdir(), "fifecode-logo-"))

async function render(width: number, height: number) {
  return testRender(
    () => (
      <TestTuiContexts directory={root} paths={{ home: root, state: root, worktree: root }}>
        <ConfigProvider config={createTuiResolvedConfig()}>
          <Keymap.Provider>
            <ThemeProvider mode="dark" source={emptyThemeSource}>
              <box width="100%" height="100%" flexDirection="column">
                <Logo />
              </box>
            </ThemeProvider>
          </Keymap.Provider>
        </ConfigProvider>
      </TestTuiContexts>
    ),
    { width, height },
  )
}

const rows = (frame: string) => frame.split("\n").filter((line) => line.trim().length > 0)
const widest = (frame: string) => Math.max(...rows(frame).map((line) => line.trimEnd().length))

test("renders the full monument on a wide window", async () => {
  const app = await render(100, 24)
  try {
    await app.renderOnce()
    await app.renderOnce()
    const frame = app.captureCharFrame()
    expect(rows(frame).length).toBe(12)
    expect(frame).toContain("▀")
    expect(widest(frame)).toBe(87)
  } finally {
    app.renderer.destroy()
  }
})

test("drops the columns at 80 columns", async () => {
  const app = await render(80, 24)
  try {
    await app.renderOnce()
    await app.renderOnce()
    const frame = app.captureCharFrame()
    expect(rows(frame).length).toBe(7)
    expect(widest(frame)).toBe(71)
  } finally {
    app.renderer.destroy()
  }
})

test("shows the plain lowercase wordmark when too narrow for the artwork", async () => {
  const app = await render(60, 24)
  try {
    await app.renderOnce()
    await app.renderOnce()
    const frame = app.captureCharFrame()
    expect(rows(frame).length).toBe(1)
    expect(frame).toContain("fifecode")
  } finally {
    app.renderer.destroy()
  }
})

test("renders nothing on a window too short to hold it", async () => {
  const app = await render(80, 10)
  try {
    await app.renderOnce()
    await app.renderOnce()
    expect(rows(app.captureCharFrame()).length).toBe(0)
  } finally {
    app.renderer.destroy()
  }
})
