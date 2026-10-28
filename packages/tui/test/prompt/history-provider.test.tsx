/** @jsxImportSource @opentui/solid */
import { testRender } from "@opentui/solid"
import { expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { TuiPathsProvider } from "../../src/context/runtime"
import {
  MAX_HISTORY_ENTRIES,
  PromptHistoryProvider,
  emptyPrompt,
  usePromptHistory,
  type PromptInfo,
} from "../../src/prompt/history"
import { tmpdir } from "../fixture/fixture"

const widthMethod = "wcwidth" as const

function info(text: string): PromptInfo {
  return { ...emptyPrompt(), text }
}

test("down past the newest item restores the stashed draft", async () => {
  await using tmp = await tmpdir()
  const setup = await renderHistory(tmp.path)
  try {
    setup.history.append(info("previous"))

    expect(setup.history.move(1, info(""), widthMethod)).toBeUndefined()
    const up = setup.history.move(-1, info(""), widthMethod)
    expect(up?.prompt.text).toBe("previous")
    expect(up?.cursor).toBeGreaterThan(0)
    const down = setup.history.move(1, info("previous"), widthMethod)
    expect(down?.prompt.text).toBe("")
    expect(down?.cursor).toBe(0)
  } finally {
    setup.app.renderer.destroy()
  }
})

test("recalling returns a prompt decoupled from stored history", async () => {
  await using tmp = await tmpdir()
  const setup = await renderHistory(tmp.path)
  try {
    setup.history.append({
      ...emptyPrompt(),
      text: "@helper",
      files: [{ uri: "file:///h", name: "helper", mention: { start: 0, end: 7, text: "@helper" } }],
    })
    const up = setup.history.move(-1, info(""), widthMethod)
    expect(up?.prompt.text).toBe("@helper")

    // Extmark sync mutates the live prompt's parts in place; the recalled copy
    // must not leak those writes into the stored entry.
    const recalled = up!.prompt
    recalled.text = "edited"
    const mention = recalled.files?.[0]?.mention
    if (!mention) throw new Error("expected the recalled mention part")
    mention.start = 3

    expect(setup.history.move(1, recalled, widthMethod)?.prompt.text).toBe("")
    const back = setup.history.move(-1, info(""), widthMethod)
    expect(back?.prompt.text).toBe("@helper")
    expect(back?.prompt.files?.[0]?.mention).toEqual({ start: 0, end: 7, text: "@helper" })
  } finally {
    setup.app.renderer.destroy()
  }
})

test("append suppresses duplicate writes and trims the file to the cap", async () => {
  await using tmp = await tmpdir()
  const state = path.join(tmp.path, "state")
  await mkdir(state, { recursive: true })
  const file = path.join(state, "prompt-history.jsonl")
  const setup = await renderHistory(tmp.path)
  try {
    const storedLines = async () => {
      const text = await Bun.file(file).text().catch(() => "")
      return text.split("\n").filter(Boolean)
    }
    // appendText/writeText fire without await; poll for the expected file state.
    const waitForLines = async (count: number) => {
      const deadline = Date.now() + 2000
      for (;;) {
        const current = await storedLines()
        if (current.length === count || Date.now() > deadline) return current
        await Bun.sleep(5)
      }
    }

    setup.history.append(info("a"))
    setup.history.append(info("a"))
    expect((await waitForLines(1)).length).toBe(1)

    for (let index = 0; index < MAX_HISTORY_ENTRIES; index++) {
      setup.history.append(info(`filler-${index}`))
    }
    const lines = await waitForLines(MAX_HISTORY_ENTRIES)
    expect(lines).toHaveLength(MAX_HISTORY_ENTRIES)
    expect(JSON.parse(lines[0]!).text).toBe("filler-0")
    expect(setup.history.move(-1, info(""), widthMethod)?.prompt.text).toBe(`filler-${MAX_HISTORY_ENTRIES - 1}`)
  } finally {
    setup.app.renderer.destroy()
  }
})

test("shares prompt history across sessions and the home composer", async () => {
  await using tmp = await tmpdir()
  const setup = await renderHistory(tmp.path)
  try {
    setup.history.append(info("a-one"))
    setup.history.append(info("b-one"))
    setup.history.append(info("a-two"))

    expect(setup.history.move(-1, info(""), widthMethod)?.prompt.text).toBe("a-two")
    expect(setup.history.move(-1, info("a-two"), widthMethod)?.prompt.text).toBe("b-one")
    expect(setup.history.move(-1, info("b-one"), widthMethod)?.prompt.text).toBe("a-one")
  } finally {
    setup.app.renderer.destroy()
  }
})

test("keeps legacy unscoped history on the home composer", async () => {
  await using tmp = await tmpdir()
  const legacy = JSON.stringify({ text: "legacy", files: [], agents: [], pasted: [] }) + "\n"
  const setup = await renderHistory(tmp.path, legacy)
  try {
    expect((await waitForHistory(setup.history))?.prompt.text).toBe("legacy")

    expect(setup.history.move(1, info("legacy"), widthMethod)?.prompt.text).toBe("")
  } finally {
    setup.app.renderer.destroy()
  }
})

async function renderHistory(root: string, persisted?: string) {
  const state = path.join(root, "state")
  await mkdir(state, { recursive: true })
  if (persisted) await Bun.write(path.join(state, "prompt-history.jsonl"), persisted)
  let history: ReturnType<typeof usePromptHistory>

  function Consumer() {
    history = usePromptHistory()
    return <box />
  }

  const app = await testRender(() => (
    <TuiPathsProvider value={{ cwd: root, home: root, state, worktree: root }}>
      <PromptHistoryProvider>
        <Consumer />
      </PromptHistoryProvider>
    </TuiPathsProvider>
  ))
  await app.renderOnce()
  return { app, history: history! }
}

async function waitForHistory(history: ReturnType<typeof usePromptHistory>) {
  for (const _ of Array.from({ length: 100 })) {
    const item = history.move(-1, info(""), widthMethod)
    if (item) return item
    await Bun.sleep(1)
  }
}
