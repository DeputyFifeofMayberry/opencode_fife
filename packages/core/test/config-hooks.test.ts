import { describe, expect } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Effect } from "effect"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { AppProcess } from "@opencode/util/process"
import { ConfigHooks } from "../src/config-hooks"
import { withTempDir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(AppProcess.node))

const base = { tool: "Bash", toolInput: { command: "git push" }, sessionID: "ses_test", cwd: "/tmp" }
const allow = { decision: "allow" } as const

// cmd.exe mangles nested quotes in inline `bun -e "..."` scripts, so fixture scripts
// are written to real .js files and invoked via the running bun binary (plain `exit N`
// stays inline). process.execPath keeps the fixtures independent of PATH.
const script = async (tmp: { readonly path: string }, name: string, code: string) => {
  const file = path.join(tmp.path, name)
  await fs.writeFile(file, code)
  return `"${process.execPath}" "${file}"`
}

describe("ConfigHooks", () => {
  it.live("runs no commands when no entry matches", () =>
    Effect.gen(function* () {
      const processes = yield* AppProcess.Service
      const verdict = yield* ConfigHooks.run(processes, {
        ...base,
        entries: [
          { matcher: "Read", command: "exit 2" },
          { matcher: "^Glob$", command: "exit 49" },
        ],
      })
      expect(verdict).toEqual(allow)
    }),
  )

  it.live("allows on exit 0 with empty stdout", () =>
    Effect.gen(function* () {
      const processes = yield* AppProcess.Service
      const verdict = yield* ConfigHooks.run(processes, { ...base, entries: [{ command: "exit 0" }] })
      expect(verdict).toEqual(allow)
    }),
  )

  it.live("blocks with stderr as the reason on exit 2", () =>
    withTempDir((tmp) =>
      Effect.gen(function* () {
        const processes = yield* AppProcess.Service
        const command = yield* Effect.promise(() =>
          script(
            tmp,
            "deny-force-push.js",
            `const s = JSON.parse(await Bun.stdin.text())
if (s.tool_input.command.includes("push --force")) {
  process.stderr.write("never force push")
  process.exit(2)
}`,
          ),
        )
        const verdict = yield* ConfigHooks.run(processes, {
          ...base,
          toolInput: { command: "git push --force" },
          entries: [{ command }],
        })
        expect(verdict).toEqual({ decision: "deny", reason: "never force push" })
      }),
    ),
  )

  it.live("halts the turn on exit 49", () =>
    Effect.gen(function* () {
      const processes = yield* AppProcess.Service
      const verdict = yield* ConfigHooks.run(processes, { ...base, entries: [{ command: "exit 49" }] })
      expect(verdict).toEqual({ decision: "halt" })
    }),
  )

  it.live("blocks with the envelope deny reason", () =>
    withTempDir((tmp) =>
      Effect.gen(function* () {
        const processes = yield* AppProcess.Service
        const command = yield* Effect.promise(() =>
          script(
            tmp,
            "deny-envelope.js",
            `await Bun.stdin.text()
console.log(JSON.stringify({ decision: "deny", reason: "hook said no" }))`,
          ),
        )
        const verdict = yield* ConfigHooks.run(processes, { ...base, entries: [{ command }] })
        expect(verdict).toEqual({ decision: "deny", reason: "hook said no" })
      }),
    ),
  )

  it.live("blocks a reason-less silent deny envelope with the fallback reason", () =>
    withTempDir((tmp) =>
      Effect.gen(function* () {
        const processes = yield* AppProcess.Service
        const command = yield* Effect.promise(() =>
          script(tmp, "deny-silent.js", `await Bun.stdin.text()\nconsole.log(JSON.stringify({ decision: "deny" }))`),
        )
        const verdict = yield* ConfigHooks.run(processes, { ...base, entries: [{ command }] })
        expect(verdict).toEqual({ decision: "deny", reason: "Blocked by a config hook" })
      }),
    ),
  )

  it.live("shallow-merges envelope updatedInput over the original input", () =>
    withTempDir((tmp) =>
      Effect.gen(function* () {
        const processes = yield* AppProcess.Service
        const first = yield* Effect.promise(() =>
          script(tmp, "patch-command.js", `console.log(JSON.stringify({ updatedInput: { command: "git push --dry-run" } }))`),
        )
        const second = yield* Effect.promise(() => script(tmp, "patch-extra.js", `console.log(JSON.stringify({ updatedInput: { extra: 1 } }))`))
        const verdict = yield* ConfigHooks.run(processes, {
          ...base,
          toolInput: { command: "git push", force: true },
          entries: [
            { command: first },
            { command: second },
          ],
        })
        expect(verdict).toEqual({
          decision: "allow",
          updatedInput: { command: "git push --dry-run", force: true, extra: 1 },
        })
      }),
    ),
  )

  it.live("accumulates envelope context and applies it on allow", () =>
    withTempDir((tmp) =>
      Effect.gen(function* () {
        const processes = yield* AppProcess.Service
        const first = yield* Effect.promise(() => script(tmp, "context-first.js", `console.log(JSON.stringify({ context: "first" }))`))
        const second = yield* Effect.promise(() => script(tmp, "context-second.js", `console.log(JSON.stringify({ context: "second" }))`))
        const verdict = yield* ConfigHooks.run(processes, {
          ...base,
          entries: [{ command: first }, { command: "exit 0" }, { command: second }],
        })
        expect(verdict).toEqual({ decision: "allow", context: "first\nsecond" })
      }),
    ),
  )

  it.live("treats exit 1, spawn failure, and timeouts as non-blocking", () =>
    withTempDir((tmp) =>
      Effect.gen(function* () {
        const processes = yield* AppProcess.Service
        const sleeping = yield* Effect.promise(() => script(tmp, "sleep.js", `await Bun.sleep(60000)`))
        for (const command of ["exit 1", "definitely-not-a-real-command-opencode-hooks", sleeping]) {
          const verdict = yield* ConfigHooks.run(processes, { ...base, entries: [{ command }] }, { timeout: "50 millis" })
          expect(verdict).toEqual(allow)
        }
      }),
    ),
  )

  it.live("sends the Claude Code stdin payload", () =>
    withTempDir((tmp) =>
      Effect.gen(function* () {
        const processes = yield* AppProcess.Service
        const command = yield* Effect.promise(() =>
          script(
            tmp,
            "echo-payload.js",
            `const s = JSON.parse(await Bun.stdin.text())
if (
  s.hook_event_name !== "PreToolUse" ||
  s.tool_name !== "Bash" ||
  s.tool_input.command !== "hi" ||
  typeof s.session_id !== "string" ||
  typeof s.cwd !== "string"
)
  process.exit(1)`,
          ),
        )
        const verdict = yield* ConfigHooks.run(processes, {
          ...base,
          toolInput: { command: "hi" },
          entries: [{ command }],
        })
        expect(verdict).toEqual(allow)
      }),
    ),
  )

  it.live("deny wins over halt and other verdicts", () =>
    withTempDir((tmp) =>
      Effect.gen(function* () {
        const processes = yield* AppProcess.Service
        const patch = yield* Effect.promise(() => script(tmp, "patch.js", `console.log(JSON.stringify({ updatedInput: { extra: 1 } }))`))
        const block = yield* Effect.promise(() =>
          script(tmp, "block.js", `process.stderr.write("last word")\nprocess.exit(2)`),
        )
        const verdict = yield* ConfigHooks.run(processes, {
          ...base,
          entries: [{ command: patch }, { command: "exit 49" }, { command: block }],
        })
        expect(verdict).toEqual({ decision: "deny", reason: "last word" })
      }),
    ),
  )
})
