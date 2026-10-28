import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { parse as parseJsonc } from "jsonc-parser"
import { ConfigNormalize } from "@opencode/core/config/normalize"
import { SkillFile } from "@opencode/core/config/plugin/skill-file"
import { Permission } from "@opencode/core/permission"
import { Skill } from "@opencode/core/skill"
import { isRecord } from "@opencode/util/record"

const root = path.resolve(import.meta.dir, "../../../..")
const openCode = path.join(root, ".opencode")

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("expected an object")
  return value
}

const config = record(parseJsonc(await fs.readFile(path.join(openCode, "opencode.jsonc"), "utf8")))
const installation = record(JSON.parse(await fs.readFile(path.join(openCode, "ecc", "installation.json"), "utf8")))
const normalized = ConfigNormalize.normalize(config)

function fileReferences(value: unknown): Set<string> {
  const refs = new Set<string>()
  const visit = (input: unknown): void => {
    if (typeof input === "string") {
      for (const match of input.matchAll(/\{file:([^}]+)\}/g)) refs.add(match[1]!)
      return
    }
    if (Array.isArray(input)) {
      input.forEach(visit)
      return
    }
    if (typeof input === "object" && input !== null) Object.values(input).forEach(visit)
  }
  visit(value)
  return refs
}

const parseSkill = async (id: string) => {
  const filepath = path.join(openCode, "skills", id, "SKILL.md")
  const parsed = SkillFile.parse(path.dirname(filepath), filepath, await fs.readFile(filepath, "utf8"))
  if (parsed._tag !== "Parsed") throw new Error(`expected skill ${id} to parse`)
  return parsed.skill
}

const ruleInstructionSources = (instructions: unknown): string[] =>
  (Array.isArray(instructions) ? instructions.map(String) : []).filter((source) => source.includes("ecc/rules/"))

const suffixTemplates = (commands: unknown): string[] =>
  Object.values(record(commands))
    .map((entry) => String(record(entry).template))
    .filter((template) => template.endsWith("\n\n$ARGUMENTS"))

test("the installed project config normalizes without invalid diagnostics", () => {
  if (normalized.type === "rejected") throw new Error(`config rejected: ${JSON.stringify(normalized.diagnostics)}`)
  expect(normalized.diagnostics.filter((diagnostic) => diagnostic.kind === "invalid")).toEqual([])
})

test("every configured agent and command file reference resolves under .opencode", async () => {
  const refs = [...fileReferences(config.agents), ...fileReferences(config.commands)]
  expect(refs.length).toBeGreaterThan(0)
  // Like config/variable.ts, relative references resolve against the config file's directory.
  await Promise.all(refs.map((ref) => fs.access(path.resolve(openCode, ref))))
})

test("configured agents and commands match the installation manifest", () => {
  const commands = record(config.commands)
  const agents = record(config.agents)
  expect(Object.keys(commands).toSorted()).toEqual((installation.commands as readonly string[]).toSorted())
  expect(Object.keys(agents).toSorted()).toEqual((installation.agents as readonly string[]).toSorted())
})

test("the installed skill manifest matches the project skill directory", async () => {
  const entries = await fs.readdir(path.join(openCode, "skills"), { withFileTypes: true })
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).toSorted()
  const manifest = [...(installation.skills as readonly string[]), ...(installation.preservedSkills as readonly string[])]
    .toSorted()
  expect(directories).toEqual(manifest)
  await Promise.all(manifest.map((id) => fs.access(path.join(openCode, "skills", id, "SKILL.md"))))
})

test("exactly one enabled native plugin entry is configured", () => {
  expect(Array.isArray(config.plugins)).toBe(true)
  expect(config.plugins).toHaveLength(1)
  const plugin = record((config.plugins as unknown[])[0])
  expect(plugin.package).toBe("./ecc/plugin")
  expect(record(plugin.options).enabled).toBe(true)
})

test("command templates carry no wrapper argument suffix", () => {
  expect(Object.keys(record(config.commands)).length).toBe(35)
  expect(suffixTemplates(config.commands)).toEqual([])
})

test("helper command bodies reference installed paths and supported flags only", async () => {
  await fs.access(path.join(openCode, "scripts", "harness-audit.js"))
  await fs.access(path.join(openCode, "skills", "continuous-learning-v2", "scripts", "instinct-cli.py"))
  const helperNames = [
    "harness-audit",
    "evolve",
    "projects",
    "promote",
    "instinct-status",
    "instinct-export",
    "instinct-import",
  ]
  const bodies = await Promise.all(
    helperNames.map(async (name) => ({
      name,
      body: await fs.readFile(path.join(openCode, "ecc", "commands", `${name}.md`), "utf8"),
    })),
  )
  for (const helper of bodies) {
    expect(helper.body).not.toContain("CLAUDE_PLUGIN_ROOT")
    expect(helper.body).not.toContain("/instinct-import @teammate") // usage form must go; the limitation note may stay
    expect(helper.body).not.toContain("--category")
    expect(helper.body).not.toContain("homunculus/projects/<project-id>") // legacy ~/.claude path shape
  }
  const exporter = bodies.find((helper) => helper.name === "instinct-export")
  expect(exporter?.body).toContain("--domain")
})

test("deprecated learning v1 is manual-only while v2 stays advertised", async () => {
  const v1 = await parseSkill("continuous-learning")
  expect(v1.autoinvoke).toBe(false)
  const v2 = await parseSkill("continuous-learning-v2")
  expect(v2.autoinvoke).toBeUndefined()
})

test("docs-lookup stays source-backed without growing its advertised description", () => {
  const docsLookup = record(record(config.agents)["docs-lookup"])
  // The description entered the audit's context reconstruction at 110 chars; growth needs a new estimate.
  expect(String(docsLookup.description).length).toBeLessThanOrEqual(110)
  expect(String(docsLookup.description)).not.toContain("MCP to fetch")
  expect(docsLookup.mode).toBe("subagent")
  expect(String(docsLookup.system)).toBe("{file:ecc/prompts/agents/docs-lookup.txt}")
  const denies = (docsLookup.permissions as ReadonlyArray<Record<string, unknown>>).some(
    (rule) => rule.action === "edit" && rule.resource === "*" && rule.effect === "deny",
  )
  expect(denies).toBe(true)
})

test("automatic ECC instructions are the bridge only, within its char budget", async () => {
  expect(ruleInstructionSources(config.instructions)).toEqual([])
  expect(config.instructions).toEqual([".opencode/ecc/INSTRUCTIONS.md"])
  const bridge = await fs.readFile(path.join(openCode, "ecc", "INSTRUCTIONS.md"), "utf8")
  // The bridge replaces 15 always-loaded rule files; a larger budget requires a new explicit policy decision.
  expect(bridge.length).toBeLessThanOrEqual(800)
})

test("the contract detects reintroduced rule globs and argument suffixes", () => {
  const driftedConfig = structuredClone(config) as Record<string, unknown>
  driftedConfig.instructions = [...(driftedConfig.instructions as string[]), ".opencode/ecc/rules/common/*.md"]
  expect(ruleInstructionSources(driftedConfig.instructions).length).toBe(1)

  const driftedCommands = structuredClone(config.commands)
  const first = Object.keys(record(driftedCommands))[0]!
  const template = record(record(driftedCommands)[first])
  template.template = `${String(template.template)}\n\n$ARGUMENTS`
  expect(suffixTemplates(driftedCommands).length).toBe(1)
})

test("installation provenance distinguishes snapshot, stable tag, and package version", () => {
  const provenance = record(installation.provenance)
  expect(provenance.sourceBranch).toBe("main")
  expect(provenance.stableCommit).not.toBe(installation.commit)
  expect(provenance.packageVersion).toBe(installation.version)
  expect(String(provenance.note)).toContain("not the stable tag payload")
  expect((provenance.localPatches as unknown[]).length).toBeGreaterThanOrEqual(5)
})

test("reference-protected skills survive the configured skill permission ruleset", async () => {
  expect(normalized.type).toBe("normalized")
  if (normalized.type !== "normalized") return
  const ruleset = (normalized.encoded.permissions as Permission.Ruleset | undefined) ?? []
  const protectedIds = ["django-tdd", "tdd-workflow", "continuous-learning-v2"]
  const skills = await Promise.all(protectedIds.map(parseSkill))
  const available = Skill.available(skills, ruleset)
  expect(available.map((skill) => String(skill.id)).toSorted()).toEqual([...protectedIds].toSorted())
})
