import path from "path"
import { describe, expect, test } from "bun:test"
import { Environment } from "@opencode/core/environment/index"
import { FileAccess } from "@opencode/core/file-access"
import { AbsolutePath } from "@opencode/core/schema"
import { ReadToolFileSystem } from "@opencode/core/tool/read-filesystem"
import { CrossSpawnSpawner } from "@opencode/util/cross-spawn-spawner"
import { LayerNodePlatform } from "@opencode/util/effect/app-node-platform"
import { LayerNode } from "@opencode/util/effect/layer-node"
import { Effect } from "effect"
import { ChildProcessSpawner } from "effect/process"
import { testEffect } from "./lib/effect"

const root = path.resolve(import.meta.dir, "../../..")
const guidePaths = [
  ".opencode/references/coding-style.md",
  ".opencode/references/session-core.md",
  ".opencode/references/local-updates.md",
  ".opencode/references/live-tui-and-desktop.md",
  ".opencode/references/technical-communication.md",
]
const it = testEffect(LayerNode.compile(LayerNode.group([CrossSpawnSpawner.node, LayerNodePlatform.filesystem])))

describe("Cold context guidance routes", () => {
  test("root instructions identify guide paths and resolve readable guides from root and subdirectory sessions", async () => {
    const instructions = await Bun.file(path.join(root, "AGENTS.md")).text()
    expect(instructions).toContain("resolve them against the repository root to an absolute path")
    for (const guide of guidePaths) {
      expect(instructions).toContain(guide)
      const absolute = path.resolve(root, guide)
      for (const directory of [root, path.join(root, "packages/core")]) {
        const target = FileAccess.resolvePath(directory, absolute)
        expect(target).toBe(absolute)
        expect((await Bun.file(target).text()).length).toBeGreaterThan(0)
      }
    }
  })

  test("retains the non-edit session and local status instructions", async () => {
    const instructions = await Bun.file(path.join(root, "AGENTS.md")).text()
    expect(instructions).toContain("investigating or explaining Session")
    expect(instructions).toContain("Never write \"provider turn\"")
    expect(instructions).toContain("If `bun run local:status` shows `dev` ahead of the installed build, say so")
  })

  it.live("reads every repository-root guide through the native read filesystem from both session locations", () =>
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const files = Environment.makeFiles(Environment.makeLocalDriver(spawner))
      for (const guide of guidePaths) {
        for (const directory of [root, path.join(root, "packages/core")]) {
          const target = AbsolutePath.make(FileAccess.resolvePath(directory, path.resolve(root, guide)))
          const result = yield* ReadToolFileSystem.read(files, target, guide, {})
          expect(result.content).toMatchObject({ type: "file", encoding: "utf8" })
          if (result.content.type !== "file" || result.content.encoding !== "utf8") throw new Error("Expected text")
          expect(result.content.content).toContain("# Task-specific repository guidance")
        }
      }
    }),
  )
})
