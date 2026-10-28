/** @jsxImportSource @opentui/solid */
import { testRender } from "@opentui/solid"
import { Keymap } from "../../src/context/keymap"
import { resolve } from "../../src/config"
import { expect, test } from "bun:test"
import { createSignal } from "solid-js"
import { RunFooterView } from "../../src/mini/footer.view"
import { RUN_THEME_FALLBACK } from "../../src/mini/theme"
import type { FooterState, FooterView, RunPrompt } from "../../src/mini/types"

async function renderFooter(history: RunPrompt[]) {
  const [state] = createSignal<FooterState>({
    phase: "idle",
    status: "",
    notice: "",
    model: "gpt-5",
    usage: undefined,
    first: false,
    interrupt: 0,
    exit: 0,
  })
  const [view] = createSignal<FooterView>({ type: "prompt" })
  const [entries] = createSignal<RunPrompt[]>(history)
  const config = resolve({}, { terminalSuspend: true })

  function Harness() {
    return (
      <Keymap.Provider config={config}>
        <RunFooterView
          directory={() => "/tmp"}
          findFiles={async () => []}
          agents={() => []}
          references={() => []}
          commands={() => []}
          providers={() => undefined}
          currentAgent={() => "Build"}
          currentAgentID={() => "build"}
          currentModel={() => undefined}
          variants={() => []}
          currentVariant={() => undefined}
          state={state}
          view={view}
          theme={() => RUN_THEME_FALLBACK}
          tuiConfig={config}
          miniSettings={() => ({
            thinking: "hide",
            tools: "show",
            shell_output: "hide",
            turn_summary: "show",
            footer: "show",
            splash: "show",
            work_spinner: "block-soft-slide",
            mono: false,
          })}
          mono={false}
          history={entries}
          onSubmit={() => true}
          onPermissionReply={() => {}}
          onFormReply={() => {}}
          onFormCancel={() => {}}
          onCycle={() => {}}
          onInterrupt={() => false}
          onEditorOpen={async () => undefined}
          onInputClear={() => {}}
          onExit={() => {}}
          onAgentSelect={() => {}}
          onModelSelect={() => {}}
          onVariantSelect={() => {}}
          onRows={() => {}}
          onLayout={() => {}}
          onStatus={() => {}}
          onMiniSettingChange={() => {}}
        />
      </Keymap.Provider>
    )
  }

  const app = await testRender(() => <Harness />, { width: 100, height: 8, kittyKeyboard: true })
  await app.renderOnce()
  return app
}

const editor = (app: Awaited<ReturnType<typeof renderFooter>>) => app.renderer.currentFocusedEditor!

test("recall lands the cursor at the end of the recalled text", async () => {
  const app = await renderFooter([{ text: "recorded", parts: [] }])
  try {
    app.mockInput.pressArrow("up")
    await app.renderOnce()
    expect(editor(app).plainText).toBe("recorded")
    await app.mockInput.typeText("x")
    expect(editor(app).plainText).toBe("recordedx")
  } finally {
    app.renderer.currentFocusedRenderable?.blur()
    app.renderer.currentFocusedEditor?.blur()
    app.renderer.destroy()
  }
})

test("up engages history from a typed draft and down restores it at the end", async () => {
  const app = await renderFooter([{ text: "recorded", parts: [] }])
  try {
    await app.mockInput.typeText("typed")
    app.mockInput.pressArrow("up")
    await app.renderOnce()
    expect(editor(app).plainText).toBe("recorded")
    app.mockInput.pressArrow("down")
    await app.renderOnce()
    expect(editor(app).plainText).toBe("typed")
    await app.mockInput.typeText("!")
    expect(editor(app).plainText).toBe("typed!")
  } finally {
    app.renderer.currentFocusedRenderable?.blur()
    app.renderer.currentFocusedEditor?.blur()
    app.renderer.destroy()
  }
})

test("up moves the cursor inside multi-line text without engaging history", async () => {
  const app = await renderFooter([{ text: "recorded", parts: [] }])
  try {
    app.mockInput.pasteBracketedText("a\nb")
    await app.renderOnce()
    expect(editor(app).plainText).toBe("a\nb")
    app.mockInput.pressArrow("up")
    await app.renderOnce()
    expect(editor(app).plainText).toBe("a\nb")
    expect(editor(app).cursorOffset).toBe(1)
  } finally {
    app.renderer.currentFocusedRenderable?.blur()
    app.renderer.currentFocusedEditor?.blur()
    app.renderer.destroy()
  }
})
