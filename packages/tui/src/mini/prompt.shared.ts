// Pure helpers for the prompt input: command recognition, history policy, and
// prompt text helpers. All functions are pure -- they take state in and return
// new state out, with no side effects.
//
// History navigation itself lives in src/prompt/history-machine.ts; this module
// supplies the mini-specific significance and equality policy it uses.
export { mentionTriggerIndex, slashTriggerIndex } from "../prompt/display"
import { measureEditText, type WidthMethod } from "@opentui/core"
import type { PromptHistoryPolicy } from "../prompt/history-machine"
import type { RunPrompt } from "./types"

export function promptCopy(prompt: RunPrompt): RunPrompt {
  return {
    text: prompt.text,
    parts: structuredClone(prompt.parts),
    ...(prompt.mode ? { mode: prompt.mode } : {}),
    ...(prompt.command ? { command: prompt.command } : {}),
  }
}

// Part ranges are textarea offsets, so shift by the measured offset rather than string length.
export function promptAppend(prompt: RunPrompt, following: RunPrompt, widthMethod: WidthMethod): RunPrompt {
  const text = prompt.text ? `${prompt.text}\n\n` : ""
  const offset = measureEditText(text, { widthMethod })
  const shift = <T extends { start: number; end: number }>(range: T) => ({
    ...range,
    start: range.start + offset,
    end: range.end + offset,
  })
  const command = prompt.text ? prompt.command : following.command
  return {
    text: text + following.text,
    parts: [
      ...structuredClone(prompt.parts),
      ...structuredClone(following.parts).map((part) => {
        if (!part.source) return part
        if (part.type === "file") return { ...part, source: { ...part.source, text: shift(part.source.text) } }
        return { ...part, source: shift(part.source) }
      }),
    ],
    ...(command ? { command } : {}),
  }
}

export function promptSame(a: RunPrompt, b: RunPrompt): boolean {
  return (
    a.mode === b.mode &&
    a.text === b.text &&
    JSON.stringify(a.parts) === JSON.stringify(b.parts) &&
    JSON.stringify(a.command) === JSON.stringify(b.command)
  )
}

export const promptHistoryPolicy: PromptHistoryPolicy<RunPrompt> = {
  significant: (prompt) => prompt.text.trim().length > 0 || prompt.parts.some((part) => part.type === "file"),
  same: promptSame,
}

export const EXIT_COMMANDS = ["exit", "quit", "q"]

export function isExitCommand(input: string): boolean {
  const text = input.trim().toLowerCase()
  return text === ":q" || EXIT_COMMANDS.some((name) => text === `/${name}`)
}

export function isNewCommand(input: string): boolean {
  return input.trim().toLowerCase() === "/new"
}

export function isCompactCommand(input: string): boolean {
  return input.trim().toLowerCase() === "/compact"
}
