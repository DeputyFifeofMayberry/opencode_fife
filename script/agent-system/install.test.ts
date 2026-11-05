import { describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  GLOBAL_SKILLS,
  PROJECT_SKILLS,
  installableFiles,
  loadManifest,
  readInstalledManifest,
  readJsonFile,
  repoRoot,
  sha256File,
  writeJsonAtomic,
} from "./lib"
import { backupDirectories, readBackupManifest } from "./backup"
import { InstallError, installAgentSystem } from "./install"

function temporaryRoot() {
  return mkdtempSync(join(tmpdir(), "agent-system-install-"))
}

function firstBackup(root: string) {
  const backup = backupDirectories(root)[0]
  if (!backup) throw new Error("expected a backup directory")
  return backup
}

describe("agent-system install", () => {
  test("clean install creates agents, global skills, configuration, and the installed manifest", async () => {
    const root = temporaryRoot()
    try {
      const result = await installAgentSystem({ configRoot: root, runtimeVerify: false })
      expect(result.inSync).toBe(false)
      for (const id of ["spec-writer", "implementer", "tester", "qa"]) {
        expect(existsSync(join(root, "agents", `${id}.md`))).toBe(true)
      }
      const skillDirectories = (await Array.fromAsync(new Bun.Glob("skills/*").scan({ cwd: root, onlyFiles: false }))).map((path) =>
        path.replaceAll("\\", "/").split("/")[1],
      )
      expect(new Set(skillDirectories).size).toBe(GLOBAL_SKILLS.length)
      for (const projectSkill of PROJECT_SKILLS) {
        expect(existsSync(join(root, "skills", projectSkill))).toBe(false)
      }
      expect(existsSync(join(root, "opencode.json"))).toBe(true)
      expect(existsSync(join(root, "opencode-model-router.overrides.jsonc"))).toBe(true)
      expect(existsSync(join(root, "agent-system.installed.json"))).toBe(true)
      expect(existsSync(join(root, "cli.json"))).toBe(false)

      const manifest = await loadManifest()
      const installed = readInstalledManifest(root)
      expect(installed).not.toBeNull()
      expect(installed?.agentSystemVersion).toBe("2.0.0")
      expect(installed?.roleContentVersion).toBe("1.1.1")
      expect(installed?.files.length).toBe(installableFiles(manifest).length)
      for (const file of installed?.files ?? []) {
        expect(await sha256File(join(root, file.target))).toBe(file.sha256)
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("a second identical install is in sync and creates no backup", async () => {
    const root = temporaryRoot()
    try {
      await installAgentSystem({ configRoot: root, runtimeVerify: false })
      const backups = backupDirectories(root).length
      const second = await installAgentSystem({ configRoot: root, runtimeVerify: false })
      expect(second.inSync).toBe(true)
      expect(second.changed).toEqual([])
      expect(backupDirectories(root).length).toBe(backups)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("refuses a locally modified managed file and force replaces it after backup", async () => {
    const root = temporaryRoot()
    try {
      await installAgentSystem({ configRoot: root, runtimeVerify: false })
      const target = join(root, "agents/spec-writer.md")
      const canonical = readFileSync(join(repoRoot(), ".opencode/agents/spec-writer.md"), "utf8")
      writeFileSync(target, `${canonical}\nlocal edit\n`)
      await expect(installAgentSystem({ configRoot: root, runtimeVerify: false })).rejects.toThrow(InstallError)
      expect(readFileSync(target, "utf8")).toContain("local edit")
      const forced = await installAgentSystem({ configRoot: root, runtimeVerify: false, force: true })
      expect(forced.changed).toContain("agents/spec-writer.md")
      expect(readFileSync(target, "utf8")).toBe(canonical)
      const manifest = readBackupManifest(firstBackup(root))
      expect(manifest.files.some((entry) => entry.path === "agents/spec-writer.md" && entry.existed)).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("preserves and reports unmanaged files", async () => {
    const root = temporaryRoot()
    try {
      await installAgentSystem({ configRoot: root, runtimeVerify: false })
      writeFileSync(join(root, "agents/custom.md"), "custom agent\n")
      mkdirSync(join(root, "skills/custom-skill"), { recursive: true })
      writeFileSync(join(root, "skills/custom-skill/SKILL.md"), "custom skill\n")
      const result = await installAgentSystem({ configRoot: root, runtimeVerify: false })
      expect(existsSync(join(root, "agents/custom.md"))).toBe(true)
      expect(existsSync(join(root, "skills/custom-skill/SKILL.md"))).toBe(true)
      expect(result.unmanaged).toContain("agents/custom.md")
      expect(result.unmanaged).toContain("skills/custom-skill/SKILL.md")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("backs up a pre-existing file when no installed manifest exists", async () => {
    const root = temporaryRoot()
    try {
      mkdirSync(join(root, "agents"), { recursive: true })
      writeFileSync(join(root, "agents/spec-writer.md"), "stale role\n")
      await installAgentSystem({ configRoot: root, runtimeVerify: false })
      const backup = firstBackup(root)
      const manifest = readBackupManifest(backup)
      const entry = manifest.files.find((file) => file.path === "agents/spec-writer.md")
      expect(entry?.existed).toBe(true)
      expect(readFileSync(join(backup, entry?.backup ?? ""), "utf8")).toBe("stale role\n")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("treats an unmanaged collision as a local modification when a manifest exists", async () => {
    const root = temporaryRoot()
    try {
      await installAgentSystem({ configRoot: root, runtimeVerify: false })
      const installed = readInstalledManifest(root)
      if (!installed) throw new Error("installed manifest missing")
      installed.files = installed.files.filter((file) => file.target !== "agents/spec-writer.md")
      writeJsonAtomic(join(root, "agent-system.installed.json"), installed)
      writeFileSync(join(root, "agents/spec-writer.md"), "collision\n")
      await expect(installAgentSystem({ configRoot: root, runtimeVerify: false })).rejects.toThrow(/unmanaged file collides/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("records the KeepAutoAccept opt-out and warns", async () => {
    const root = temporaryRoot()
    try {
      writeFileSync(join(root, "cli.json"), `${JSON.stringify({ session: { permissions: "autoaccept", tps: true } }, null, 2)}\n`)
      const result = await installAgentSystem({ configRoot: root, runtimeVerify: false, keepAutoAccept: true })
      expect(result.permissionMode).toBe("autoaccept")
      expect(result.keepAutoAccept).toBe(true)
      expect(result.warnings.some((warning) => warning.includes("suppresses ask prompts"))).toBe(true)
      const installed = readInstalledManifest(root)
      expect(installed?.permissionMode).toBe("autoaccept")
      expect(installed?.keepAutoAccept).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("changes autoaccept to prompt by default and backs up cli.json", async () => {
    const root = temporaryRoot()
    try {
      writeFileSync(join(root, "cli.json"), `${JSON.stringify({ session: { permissions: "autoaccept", tps: true } }, null, 2)}\n`)
      const result = await installAgentSystem({ configRoot: root, runtimeVerify: false })
      expect(result.permissionMode).toBe("prompt")
      const cli = readJsonFile(join(root, "cli.json")) as { session: { permissions: string; tps: boolean } }
      expect(cli.session).toEqual({ permissions: "prompt", tps: true })
      const manifest = readBackupManifest(firstBackup(root))
      expect(manifest.files.some((entry) => entry.path === "cli.json" && entry.existed)).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("merges canonical keys without destroying unrelated configuration", async () => {
    const root = temporaryRoot()
    try {
      writeFileSync(
        join(root, "opencode.json"),
        `${JSON.stringify(
          {
            update: "disable",
            provider: { example: { apiKey: "placeholder" } },
            effort_policy: { mode: "frozen", agent_operations: { fast: "old" } },
            plugins: ["other-plugin"],
          },
          null,
          2,
        )}\n`,
      )
      writeFileSync(
        join(root, "opencode-model-router.overrides.jsonc"),
        `{
          // user comment
          "activePreset": "other",
          "activeMode": "normal",
          "presets": {
            "other": { "fast": { "model": "other/model" } },
            "fife": { "fast": { "model": "stale/model" } }
          },
          "enforcement": { "mode": "advisory" }
        }\n`,
      )
      await installAgentSystem({ configRoot: root, runtimeVerify: false })
      const opencode = readJsonFile(join(root, "opencode.json")) as Record<string, unknown>
      expect(opencode.update).toBe("disable")
      expect(opencode.provider).toEqual({ example: { apiKey: "placeholder" } })
      expect(opencode.plugins).toEqual(["other-plugin", "opencode-model-router@2.9.1"])
      expect((opencode.effort_policy as Record<string, unknown>).agent_operations).toEqual({
        fast: "explore",
        medium: "implement",
        heavy: "review",
      })
      const router = readJsonFile(join(root, "opencode-model-router.overrides.jsonc")) as Record<string, unknown>
      expect(router.activePreset).toBe("other")
      expect(router.activeMode).toBe("normal")
      expect(router.enforcement).toEqual({ mode: "advisory" })
      expect((router.presets as Record<string, unknown>).other).toEqual({ fast: { model: "other/model" } })
      expect(((router.presets as Record<string, unknown>).fife as Record<string, unknown>).fast).toEqual({
        model: "vercel/minimax/minimax-m3.1-flash",
        variant: "medium",
        costRatio: 1,
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("refuses malformed configuration and keeps a backup", async () => {
    const root = temporaryRoot()
    try {
      writeFileSync(join(root, "opencode.json"), "{ not json\n")
      await expect(installAgentSystem({ configRoot: root, runtimeVerify: false })).rejects.toThrow(/Cannot parse or merge/)
      const backups = backupDirectories(root)
      expect(backups.length).toBe(1)
      const manifest = readBackupManifest(firstBackup(root))
      expect(manifest.files.some((entry) => entry.path === "opencode.json" && entry.existed)).toBe(true)
      expect(readFileSync(join(root, "opencode.json"), "utf8")).toBe("{ not json\n")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
