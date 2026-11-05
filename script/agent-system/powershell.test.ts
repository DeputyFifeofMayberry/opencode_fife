import { describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { readInstalledManifest, repoRoot } from "./lib"

const testWindows = test.skipIf(process.platform !== "win32")

function temporaryRoot() {
  return mkdtempSync(join(tmpdir(), "agent-system-powershell-"))
}

function runInstaller(arguments_: string[]) {
  return Bun.spawnSync(
    ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "script/install-local.ps1", ...arguments_],
    {
      cwd: repoRoot(),
      env: { ...process.env, OPENCODE_AGENT_SYSTEM_SKIP_RUNTIME_VERIFY: "1" },
      stdout: "pipe",
      stderr: "pipe",
    },
  )
}

describe("PowerShell installer", () => {
  testWindows("-AgentsOnly with -ConfigRoot creates the complete asset tree", () => {
    const root = temporaryRoot()
    try {
      const result = runInstaller(["-AgentsOnly", "-ConfigRoot", root])
      expect(result.exitCode).toBe(0)
      expect(existsSync(join(root, "agents/spec-writer.md"))).toBe(true)
      expect(existsSync(join(root, "skills/code-review-and-quality/SKILL.md"))).toBe(true)
      expect(existsSync(join(root, "skills/unit-tests"))).toBe(false)
      expect(existsSync(join(root, "skills/humanizer_fife"))).toBe(false)
      expect(existsSync(join(root, "opencode.json"))).toBe(true)
      expect(existsSync(join(root, "opencode-model-router.overrides.jsonc"))).toBe(true)
      const installed = readInstalledManifest(root)
      expect(installed?.agentSystemVersion).toBe("2.0.0")
      expect(installed?.roleContentVersion).toBe("1.1.1")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  testWindows("-AgentsOnly and -SkipAgents together install nothing", () => {
    const root = temporaryRoot()
    try {
      const result = runInstaller(["-AgentsOnly", "-SkipAgents", "-ConfigRoot", root])
      expect(result.exitCode).not.toBe(0)
      expect(result.stderr.toString()).toContain("install nothing")
      expect(existsSync(join(root, "agents/spec-writer.md"))).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  testWindows("-KeepAutoAccept records the opt-out", () => {
    const root = temporaryRoot()
    try {
      writeFileSync(join(root, "cli.json"), `${JSON.stringify({ session: { permissions: "autoaccept" } }, null, 2)}\n`)
      const result = runInstaller(["-AgentsOnly", "-ConfigRoot", root, "-KeepAutoAccept"])
      expect(result.exitCode).toBe(0)
      expect(result.stdout.toString()).toContain("suppresses ask prompts")
      const installed = readInstalledManifest(root)
      expect(installed?.permissionMode).toBe("autoaccept")
      expect(installed?.keepAutoAccept).toBe(true)
      expect((JSON.parse(readFileSync(join(root, "cli.json"), "utf8")) as { session: { permissions: string } }).session.permissions).toBe(
        "autoaccept",
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  testWindows("-Force replaces a locally modified managed file", () => {
    const root = temporaryRoot()
    try {
      expect(runInstaller(["-AgentsOnly", "-ConfigRoot", root]).exitCode).toBe(0)
      const target = join(root, "agents/spec-writer.md")
      writeFileSync(target, `${readFileSync(target, "utf8")}\nLOCAL-EDIT-MARKER\n`)
      const refused = runInstaller(["-AgentsOnly", "-ConfigRoot", root])
      expect(refused.exitCode).not.toBe(0)
      expect(refused.stderr.toString()).toContain("spec-writer.md")
      const forced = runInstaller(["-AgentsOnly", "-ConfigRoot", root, "-Force"])
      expect(forced.exitCode).toBe(0)
      expect(readFileSync(target, "utf8")).not.toContain("LOCAL-EDIT-MARKER")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
