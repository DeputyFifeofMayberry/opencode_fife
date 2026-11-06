import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { createEffect, createMemo, createSignal, onMount, Show } from "solid-js"
import path from "node:path"
import { openPath } from "@opencode/util/open"
import { useConfig } from "../config"
import { useClipboard } from "../context/clipboard"
import { Keymap } from "../context/keymap"
import { useTheme, useThemes } from "../context/theme"
import { getScrollAcceleration } from "../util/scroll"
import { DIALOG_INSET, DialogFooter, DialogHeader, DialogLayout, dialogWidth, useDialog } from "../ui/dialog"
import { FilePath } from "../ui/file-path"
import { useToast } from "../ui/toast"

export function DialogDocument(props: { path: string; onBack?: () => void }) {
  const dialog = useDialog()
  const theme = useTheme().surface("dialog")
  const syntax = useThemes().currentSyntax
  const config = useConfig().data
  const clipboard = useClipboard()
  const toast = useToast()
  const dimensions = useTerminalDimensions()
  const [content, setContent] = createSignal<string>()
  const [failure, setFailure] = createSignal<string>()
  const [copied, setCopied] = createSignal(false)
  let scroll: ScrollBoxRenderable | undefined

  const title = createMemo(() => path.basename(props.path))
  const width = createMemo(() =>
    Math.min(dimensions().width - 2, Math.max(dialogWidth("medium"), Math.floor(dimensions().width * 0.75))),
  )
  // Fixed body height so short documents still fill the box; the dialog chrome is about 6 rows.
  const height = createMemo(() => Math.max(3, Math.floor(dimensions().height * 0.75) - 6))

  dialog.setCentered(true)
  createEffect(() => dialog.setWidth(width()))

  const back = () => {
    if (props.onBack) return props.onBack()
    dialog.clear()
  }

  onMount(() => {
    void Bun.file(props.path)
      .text()
      .then(setContent)
      .catch((error: unknown) => setFailure(error instanceof Error ? error.message : String(error)))
  })

  const open = () =>
    void openPath(props.path)
      .then(() => toast.show({ variant: "success", message: `Opened ${title()}` }))
      .catch(toast.error)
  const copy = () => {
    void clipboard
      .write(props.path)
      .then(() => setCopied(true))
      .catch(toast.error)
  }

  Keymap.createLayer(() => ({
    mode: "modal",
    commands: [
      { bind: "escape", title: "Back", group: "Dialog", run: back },
      { bind: "o", title: "Open in editor", group: "Dialog", run: open },
      { bind: "c", title: "Copy path", group: "Dialog", run: copy },
    ],
  }))

  useKeyboard((event) => {
    if (event.name === "up") return scroll?.scrollBy(-1)
    if (event.name === "down") return scroll?.scrollBy(1)
    if (event.name === "pageup") return scroll?.scrollBy(-20)
    if (event.name === "pagedown") return scroll?.scrollBy(20)
    if (event.name === "home") return scroll?.scrollTo(0)
    if (event.name === "end" && scroll) return scroll.scrollTo(scroll.scrollHeight)
  })

  const actions = () => [
    { title: "open in editor", key: "o", onTrigger: open },
    copied()
      ? { title: "✓ copied", color: theme.text.feedback.success.base, onTrigger: copy }
      : { title: "copy path", key: "c", onTrigger: copy },
  ]

  return (
    <DialogLayout
      header={
        <box>
          <DialogHeader
            gap={2}
            onClose={back}
            titleView={
              <text
                attributes={TextAttributes.BOLD}
                fg={theme.text.base}
                flexGrow={1}
                minWidth={0}
                wrapMode="none"
                truncate
              >
                {title()}
              </text>
            }
          />
          <FilePath value={props.path} maxWidth={width() - DIALOG_INSET * 2} fg={theme.text.muted} />
        </box>
      }
      footer={{ actions: { primary: actions() } }}
      legacyFooter={<DialogFooter actions={{ secondary: actions(), primary: [{ title: "scroll", key: "↑/↓" }] }} />}
    >
      <scrollbox
        ref={(element: ScrollBoxRenderable) => (scroll = element)}
        height={height()}
        contentOptions={{ minHeight: 0 }}
        scrollbarOptions={{ visible: false }}
        scrollAcceleration={getScrollAcceleration(config)}
      >
        <Show
          when={failure()}
          fallback={
            <Show when={content()} fallback={<text fg={theme.text.muted}>Loading…</text>}>
              {(text) => (
                <markdown
                  syntaxStyle={syntax()}
                  content={text()}
                  conceal
                  internalBlockMode="top-level"
                  tableOptions={{ style: "grid", cellPaddingX: 1 }}
                  fg={theme.markdown.text}
                  bg={theme.background.base}
                />
              )}
            </Show>
          }
        >
          {(message) => (
            <text fg={theme.text.feedback.error.base} wrapMode="word">
              {message()}
            </text>
          )}
        </Show>
      </scrollbox>
    </DialogLayout>
  )
}
