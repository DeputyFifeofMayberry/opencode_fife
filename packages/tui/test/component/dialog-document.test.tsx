/** @jsxImportSource @opentui/solid */
import { TextRenderable, type Renderable } from "@opentui/core"
import { testRender } from "@opentui/solid"
import { afterAll, beforeEach, expect, mock, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { onMount, type JSX } from "solid-js"
import { ConfigProvider } from "../../src/config"
import { ClientProvider } from "../../src/context/client"
import type { ClipboardService } from "../../src/context/clipboard"
import { DataProvider } from "../../src/context/data"
import { Keymap } from "../../src/context/keymap"
import { LocationProvider } from "../../src/context/location"
import { RouteProvider } from "../../src/context/route"
import { ThemeProvider } from "../../src/context/theme"
import { DialogProvider, useDialog } from "../../src/ui/dialog"
import { Toast, ToastProvider, useToast, type ToastContext } from "../../src/ui/toast"
import { emptyThemeSource, tmpdir } from "../fixture/fixture"
import { createApi, createEventStream, createFetch } from "../fixture/tui-client"
import { TestTuiContexts } from "../fixture/tui-environment"
import { createTuiResolvedConfig } from "../fixture/tui-runtime"

const opened: string[] = []
let failure: Error | undefined

mock.module("@opencode/util/open", () => ({
  openPath: async (value: string) => {
    opened.push(value)
    if (failure) throw failure
  },
  openUrl: async () => {},
}))

const { DialogDocument } = await import("../../src/component/dialog-document")

afterAll(() => mock.restore())

beforeEach(() => {
  failure = undefined
})

function Harness(props: { file: string; onToast?: (toast: ToastContext) => void }) {
  const dialog = useDialog()
  const toast = useToast()
  props.onToast?.(toast)
  onMount(() => dialog.replace(() => <DialogDocument path={props.file} />))
  return <Toast />
}

function SizedDialog(props: { size: "large" }) {
  const dialog = useDialog()
  dialog.setSize(props.size)
  return <text>{props.size}</text>
}

function OpenSized(props: { size: "large" }) {
  const dialog = useDialog()
  onMount(() => dialog.replace(() => <SizedDialog size={props.size} />))
  return null
}

async function render(options: {
  width: number
  height: number
  directory: string
  clipboard?: ClipboardService
  children: () => JSX.Element
}) {
  const api = createApi(createFetch(() => undefined, createEventStream()).fetch)
  const app = await testRender(
    () => (
      <TestTuiContexts
        directory={options.directory}
        paths={{ state: options.directory }}
        clipboard={options.clipboard}
      >
        <ConfigProvider config={createTuiResolvedConfig()}>
          <RouteProvider initialRoute={{ type: "home" }}>
            <ClientProvider api={api}>
              <DataProvider directory={options.directory}>
                <LocationProvider>
                  <ThemeProvider mode="dark" source={emptyThemeSource}>
                    <Keymap.Provider>
                      <ToastProvider>
                        <DialogProvider>{options.children()}</DialogProvider>
                      </ToastProvider>
                    </Keymap.Provider>
                  </ThemeProvider>
                </LocationProvider>
              </DataProvider>
            </ClientProvider>
          </RouteProvider>
        </ConfigProvider>
      </TestTuiContexts>
    ),
    { width: options.width, height: options.height, kittyKeyboard: true },
  )
  app.renderer.start()
  return app
}

function findText(node: Renderable, predicate: (text: string) => boolean): TextRenderable | undefined {
  if (node instanceof TextRenderable && predicate(node.plainText)) return node
  return node
    .getChildren()
    .map((child) => findText(child, predicate))
    .find((found) => found !== undefined)
}

test("open reports success and failure while copy still works", async () => {
  await using temporary = await tmpdir()
  const file = path.join(temporary.path, "document.md")
  await Bun.write(file, "# Document\n\nHello")
  const copied: string[] = []
  let toast!: ToastContext
  opened.length = 0

  const app = await render({
    width: 100,
    height: 30,
    directory: temporary.path,
    clipboard: { read: async () => undefined, write: async (text) => void copied.push(text) },
    children: () => <Harness file={file} onToast={(value) => (toast = value)} />,
  })

  try {
    await app.waitForFrame((frame) => frame.includes("document.md"))

    app.mockInput.pressKey("o")
    await app.waitFor(() => opened.length === 1)
    expect(opened[0]).toBe(file)
    await app.waitFor(() => toast.currentToast?.variant === "success")
    expect(toast.currentToast?.message).toContain("document.md")
    await app.waitForFrame((frame) => frame.includes("Opened document.md"))

    app.mockInput.pressKey("c")
    await app.waitFor(() => copied.length === 1)
    expect(copied[0]).toBe(file)

    failure = new Error("launcher exploded")
    app.mockInput.pressKey("o")
    await app.waitFor(() => toast.currentToast?.variant === "error")
    expect(toast.currentToast?.message).toContain("launcher exploded")
    await app.waitForFrame((frame) => frame.includes("launcher exploded"))
  } finally {
    app.renderer.destroy()
  }
})

test("document dialog fills about 75% of the terminal and reflows on resize", async () => {
  await using temporary = await tmpdir()
  const directory = path.join(temporary.path, "a".repeat(30))
  await mkdir(directory, { recursive: true })
  const file = path.join(directory, "document.md")
  await Bun.write(file, "# Document\n\nHello")

  const app = await render({
    width: 100,
    height: 30,
    directory: temporary.path,
    children: () => <Harness file={file} />,
  })
  try {
    const panel = () => app.renderer.root.findDescendantById("dialog-panel")
    await app.waitFor(() => panel()?.width === 75 && (panel()?.height ?? 0) > 0)
    expect(panel()!.height).toBeGreaterThanOrEqual(19)
    expect(panel()!.height).toBeLessThanOrEqual(25)

    const filePath = findText(
      app.renderer.root,
      (text) => text.includes("document.md") && text.includes(path.sep),
    )
    expect(filePath).toBeDefined()
    expect(filePath!.plainText.length).toBeGreaterThan(60)

    app.resize(60, 20)
    await app.waitFor(() => panel()?.width === 58 && (panel()?.height ?? 0) > 0)
    expect(panel()!.width).toBeGreaterThanOrEqual(58)
    expect(panel()!.height).toBeLessThanOrEqual(20)

    app.resize(100, 30)
    await app.waitFor(() => panel()?.width === 75 && (panel()?.height ?? 0) > 0)
  } finally {
    app.renderer.destroy()
  }
})

test("other dialogs keep their size tier width", async () => {
  await using temporary = await tmpdir()
  const app = await render({
    width: 100,
    height: 30,
    directory: temporary.path,
    children: () => <OpenSized size="large" />,
  })
  try {
    const panel = () => app.renderer.root.findDescendantById("dialog-panel")
    await app.waitFor(() => panel()?.width === 88)
    expect(panel()!.width).toBe(88)
  } finally {
    app.renderer.destroy()
  }
})
