import { describe, expect, test } from "bun:test"
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  AGENT_IDS,
  GLOBAL_SKILLS,
  PROJECT_SKILLS,
  buildManifest,
  collectManifestFiles,
  installableFiles,
  repoRoot,
  validateManifest,
} from "./lib"
import { checkManifest } from "./manifest"

function temporaryRoot() {
  return mkdtempSync(join(tmpdir(), "agent-system-manifest-"))
}

function copyRepository(root: string) {
  cpSync(join(repoRoot(), ".opencode"), join(root, ".opencode"), { recursive: true })
  cpSync(join(repoRoot(), "agent-system"), join(root, "agent-system"), { recursive: true })
}

describe("manifest", () => {
  test("collects the approved role and skill inventory", async () => {
    const files = await collectManifestFiles()
    const agents = files.filter((file) => file.kind === "agent")
    const globalSkills = new Set(files.filter((file) => file.kind === "skill" && file.scope === "global").map((file) => file.name))
    const projectSkills = new Set(files.filter((file) => file.kind === "skill" && file.scope === "project").map((file) => file.name))
    expect(agents.map((file) => file.name).sort()).toEqual([...AGENT_IDS].sort())
    expect(globalSkills.size).toBe(GLOBAL_SKILLS.length)
    expect(projectSkills.size).toBe(PROJECT_SKILLS.length)
    expect(files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true)
  })

  test("installable files exclude project-scoped skills", async () => {
    const manifest = buildManifest(await collectManifestFiles())
    const installable = installableFiles(manifest)
    expect(installable.some((file) => file.scope === "project")).toBe(false)
    expect(installable.filter((file) => file.kind === "agent").length).toBe(AGENT_IDS.length)
  })

  test("checked-in manifest validates against the schema and hashes", async () => {
    const result = await checkManifest()
    expect(result.errors).toEqual([])
    expect(result.agents).toBe(AGENT_IDS.length)
    expect(result.globalSkills).toBe(GLOBAL_SKILLS.length)
    expect(result.projectSkills).toBe(PROJECT_SKILLS.length)
  })

  test("tampering with a managed file is reported by name", async () => {
    const root = temporaryRoot()
    try {
      copyRepository(root)
      const target = join(root, ".opencode/agents/spec-writer.md")
      writeFileSync(target, `${readFileSync(target, "utf8")}\ntampered\n`)
      const result = await checkManifest(root)
      expect(result.errors.some((error) => error.includes(".opencode/agents/spec-writer.md"))).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("schema rejects a wrong scope and a short hash", () => {
    const schema = JSON.parse(readFileSync(join(repoRoot(), "agent-system/manifest.schema.json"), "utf8")) as unknown
    const manifest = {
      schemaVersion: 1,
      agentSystemVersion: "2.0.0",
      roleContentVersion: "1.1.1",
      plugin: "opencode-model-router@2.9.1",
      lineEndings: "lf",
      files: [
        {
          kind: "skill",
          name: "example",
          source: ".opencode/skills/example/SKILL.md",
          target: "skills/example/SKILL.md",
          scope: "everywhere",
          sha256: "abc",
        },
      ],
    }
    expect(() => validateManifest(manifest, schema)).toThrow()
  })
})
