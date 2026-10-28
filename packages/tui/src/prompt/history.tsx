import path from "path"
import { measureEditText, type WidthMethod } from "@opentui/core"
import { onMount } from "solid-js"
import { createStore, unwrap } from "solid-js/store"
import type { PromptInput } from "@opencode/schema"
import type { Types } from "effect"
import { createSimpleContext } from "../context/helper"
import { useTuiPaths } from "../context/runtime"
import { appendText, readText, writeText } from "../util/persistence"
import { createPromptHistory, movePromptHistory, pushPromptHistory, type PromptHistoryPolicy } from "./history-machine"

export type PastedText = {
  text: string
  source: {
    start: number
    end: number
    text: string
  }
}

export type PromptInfo = Types.DeepMutable<Pick<PromptInput.Prompt, "text" | "files" | "agents" | "skills">> & {
  pasted: PastedText[]
  mode?: "normal" | "shell"
}

export type PromptPartRef = {
  type: "file" | "agent" | "skill" | "pasted"
  index: number
}

export const emptyPrompt = (): PromptInfo => ({ text: "", files: [], agents: [], skills: [], pasted: [] })

// Part ranges are textarea offsets, so shift by the measured offset rather than string length.
export function appendPrompt(prompt: PromptInfo, following: PromptInfo, widthMethod: WidthMethod): PromptInfo {
  const text = prompt.text ? `${prompt.text}\n\n` : ""
  const offset = measureEditText(text, { widthMethod })
  const shift = <T extends { start: number; end: number }>(range: T, by: number) => ({
    ...range,
    start: range.start + by,
    end: range.end + by,
  })
  const mentions = <T extends { mention?: { start: number; end: number } }>(
    items: T[] | undefined,
    next: T[] | undefined,
  ) => [
    ...(items ?? []).map((item) => ({ ...item, mention: item.mention && shift(item.mention, 0) })),
    ...(next ?? []).map((item) => ({ ...item, mention: item.mention && shift(item.mention, offset) })),
  ]
  return {
    text: text + following.text,
    files: mentions(prompt.files, following.files),
    agents: mentions(prompt.agents, following.agents),
    skills: mentions(prompt.skills, following.skills),
    pasted: [
      ...prompt.pasted.map((part) => ({ ...part, source: shift(part.source, 0) })),
      ...following.pasted.map((part) => ({ ...part, source: shift(part.source, offset) })),
    ],
  }
}

export const MAX_HISTORY_ENTRIES = 50

export function parsePromptHistory(text: string) {
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return parsePromptInfo(JSON.parse(line))
      } catch {
        return undefined
      }
    })
    .filter((line): line is PromptInfo => line !== undefined)
    .slice(-MAX_HISTORY_ENTRIES)
}

export function isDuplicateEntry(previous: PromptInfo | undefined, next: PromptInfo): boolean {
  if (!previous) return false
  return JSON.stringify(previous) === JSON.stringify(next)
}

export function parsePromptInfo(value: unknown): PromptInfo | undefined {
  if (!value || typeof value !== "object") return
  const input = value as Record<string, unknown>
  if (typeof input.text !== "string" || !Array.isArray(input.pasted)) return
  return input as PromptInfo
}

const historyPolicy: PromptHistoryPolicy<PromptInfo> = {
  significant: (prompt) =>
    prompt.text.trim().length > 0 ||
    (prompt.files?.length ?? 0) > 0 ||
    (prompt.agents?.length ?? 0) > 0 ||
    (prompt.skills?.length ?? 0) > 0 ||
    prompt.pasted.length > 0,
  same: isDuplicateEntry,
}

// Persistence writes are fire-and-forget but must land in call order, or a
// trim rewrite can race a straggling append and corrupt the file tail.
let writeQueue: Promise<void> = Promise.resolve()
function persist(write: () => Promise<unknown>) {
  writeQueue = writeQueue
    .then(write)
    .catch(() => {})
    .then(() => {})
  return writeQueue
}

export const { use: usePromptHistory, provider: PromptHistoryProvider } = createSimpleContext({
  name: "PromptHistory",
  init: () => {
    const paths = useTuiPaths()
    const historyPath = path.join(paths.state, "prompt-history.jsonl")
    const [store, setStore] = createStore({ history: createPromptHistory<PromptInfo>(undefined, historyPolicy) })

    onMount(async () => {
      const lines = parsePromptHistory(await readText(historyPath).catch(() => ""))
      setStore("history", createPromptHistory(lines, historyPolicy))

      // Rewrite valid retained entries to self-heal corruption and enforce the limit.
      if (lines.length > 0)
        persist(() =>
          writeText(historyPath, lines.map((line) => JSON.stringify(line)).join("\n") + "\n"),
        ).catch(() => {})
    })

    return {
      // Recalls the neighboring history entry, or restores the stashed draft
      // when moving forward past the newest item. `current` is the live prompt:
      // the first backward move stashes it, and the caller decides when a move
      // may engage history (the cursor on the first or last visual row).
      move(direction: 1 | -1, current: PromptInfo, widthMethod: WidthMethod) {
        const next = movePromptHistory(unwrap(store.history), direction, unwrap(current), widthMethod)
        const prompt = next.apply ? next.prompt : undefined
        if (!prompt || next.cursor === undefined) return undefined
        setStore("history", next.state)
        // Clone so later edits to the live prompt (extmark sync mutates part
        // objects in place) can never reach the stored history entries.
        return { prompt: structuredClone(prompt), cursor: next.cursor }
      },
      append(item: PromptInfo) {
        const entry = structuredClone(unwrap(item))
        const previous = store.history.items.at(-1)
        setStore("history", pushPromptHistory(store.history, entry, historyPolicy))
        if (previous && isDuplicateEntry(previous, entry)) return

        if (store.history.items.length > MAX_HISTORY_ENTRIES) {
          const retained = store.history.items.slice(-MAX_HISTORY_ENTRIES)
          setStore("history", "items", retained)
          persist(() =>
            writeText(historyPath, retained.map((line) => JSON.stringify(line)).join("\n") + "\n"),
          ).catch(() => {})
          return
        }
        persist(() => appendText(historyPath, JSON.stringify(entry) + "\n")).catch(() => {})
      },
    }
  },
})
