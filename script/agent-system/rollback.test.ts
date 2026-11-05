import { describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { backupDirectories, readBackupManifest } from "./backup"
import { installAgentSystem } from "./install"
import { RollbackError, rollbackAgents } from "./rollback"
import { readStatus, statusExitCode } from "./status"

function temporaryRoot() {
  return mkdtempSync(join(tmpdir(), "agent-system-rollback-"))
}

function firstBackup(root: string) {
  const backup = backupDirectories(root)[0]
  if (!backup) throw new Error("expected a backup directory")
  return backup
}

describe("agent-system rollback", () => {
  test("restores the previous file content from the most recent backup", async () => {
    const root = temporaryRoot()
    try {
      await installAgentSystem({ configRoot: root, runtimeVerify: false })
      const target = join(root, "agents/spec-writer.md")
      const edited = `${readFileSync(target, "utf8")}\nlocal edit\n`
      writeFileSync(target, edited)
      await installAgentSystem({ configRoot: root, runtimeVerify: false, force: true })
      const backup = firstBackup(root)
      const manifest = readBackupManifest(backup)
      const entry = manifest.files.find((file) => file.path === "agents/spec-writer.md")
      expect(entry?.existed).toBe(true)
      const result = await rollbackAgents(root)
      expect(result.backupPath).toBe(backup)
      expect(readFileSync(target, "utf8")).toBe(edited)
      expect(result.restored).toContain("agents/spec-writer.md")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("a clean-install rollback removes install-created files and the installed manifest", async () => {
    const root = temporaryRoot()
    try {
      await installAgentSystem({ configRoot: root, runtimeVerify: false })
      const result = await rollbackAgents(root)
      expect(result.removed).toContain("agents/spec-writer.md")
      expect(existsSync(join(root, "agents/spec-writer.md"))).toBe(false)
      expect(existsSync(join(root, "agent-system.installed.json"))).toBe(false)
      const report = await readStatus(undefined, root)
      expect(statusExitCode(report)).toBe(2)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("preserves and reports unmanaged files created after the backup", async () => {
    const root = temporaryRoot()
    try {
      await installAgentSystem({ configRoot: root, runtimeVerify: false })
      writeFileSync(join(root, "agents/custom.md"), "custom\n")
      const result = await rollbackAgents(root)
      expect(existsSync(join(root, "agents/custom.md"))).toBe(true)
      expect(result.preserved).toContain("agents/custom.md")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("exits 2 when no backup exists", async () => {
    const root = temporaryRoot()
    try {
      await expect(rollbackAgents(root)).rejects.toThrow(RollbackError)
      try {
        await rollbackAgents(root)
      } catch (error) {
        expect(error instanceof RollbackError ? error.exitCode : 0).toBe(2)
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
