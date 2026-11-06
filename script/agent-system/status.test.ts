import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { installAgentSystem } from "./install"
import { readStatus, statusExitCode } from "./status"

function temporaryRoot() {
  return mkdtempSync(join(tmpdir(), "agent-system-status-"))
}

describe("agent-system status", () => {
  test("reports an in-sync install with both versions", async () => {
    const root = temporaryRoot()
    try {
      await installAgentSystem({ configRoot: root, runtimeVerify: false })
      const report = await readStatus(undefined, root)
      expect(report.installed).toBe(true)
      expect(report.agentSystemVersion).toBe("2.1.0")
      expect(report.roleContentVersion).toBe("1.2.0")
      expect(report.files.drifted).toEqual([])
      expect(report.files.missing).toEqual([])
      expect(report.config.opencode).toBe("in-sync")
      expect(report.config.router).toBe("in-sync")
      expect(statusExitCode(report)).toBe(0)
      expect(JSON.parse(JSON.stringify(report)).agentSystemVersion).toBe("2.1.0")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("reports drift after a managed file is edited", async () => {
    const root = temporaryRoot()
    try {
      await installAgentSystem({ configRoot: root, runtimeVerify: false })
      const target = join(root, "agents/spec-writer.md")
      writeFileSync(target, `${readFileSync(target, "utf8")}\nedit\n`)
      const report = await readStatus(undefined, root)
      expect(report.files.drifted).toContain("agents/spec-writer.md")
      expect(statusExitCode(report)).toBe(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("reports configuration drift", async () => {
    const root = temporaryRoot()
    try {
      await installAgentSystem({ configRoot: root, runtimeVerify: false })
      const path = join(root, "opencode.json")
      const config = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>
      const effort = config.effort_policy as Record<string, unknown>
      effort.agent_operations = { fast: "wrong" }
      writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`)
      const report = await readStatus(undefined, root)
      expect(report.config.opencode).toBe("drift")
      expect(statusExitCode(report)).toBe(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("reports unmanaged files without treating them as managed drift", async () => {
    const root = temporaryRoot()
    try {
      await installAgentSystem({ configRoot: root, runtimeVerify: false })
      writeFileSync(join(root, "agents/custom.md"), "custom\n")
      const report = await readStatus(undefined, root)
      expect(report.files.unmanaged).toContain("agents/custom.md")
      expect(statusExitCode(report)).toBe(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("exits 2 when the installed manifest is missing", async () => {
    const root = temporaryRoot()
    try {
      await installAgentSystem({ configRoot: root, runtimeVerify: false })
      rmSync(join(root, "agent-system.installed.json"))
      const report = await readStatus(undefined, root)
      expect(report.installed).toBe(false)
      expect(statusExitCode(report)).toBe(2)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("exits 2 when the installed manifest is unreadable", async () => {
    const root = temporaryRoot()
    try {
      await installAgentSystem({ configRoot: root, runtimeVerify: false })
      writeFileSync(join(root, "agent-system.installed.json"), "{ broken\n")
      const report = await readStatus(undefined, root)
      expect(report.installed).toBe(false)
      expect(report.errors.length).toBeGreaterThan(0)
      expect(statusExitCode(report)).toBe(2)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
