import { existsSync } from "node:fs"
import { join } from "node:path"
import {
  AGENT_IDS,
  AGENT_SYSTEM_VERSION,
  GLOBAL_SKILLS,
  MANIFEST_SCHEMA_VERSION,
  PLUGIN_PIN,
  PROJECT_SKILLS,
  ROLE_CONTENT_VERSION,
  buildManifest,
  collectManifestFiles,
  loadManifest,
  readJsonFile,
  repoRoot,
  writeJsonAtomic,
} from "./lib"

export type ManifestCheck = {
  errors: string[]
  agents: number
  globalSkills: number
  projectSkills: number
  files: number
}

export async function checkManifest(root = repoRoot()): Promise<ManifestCheck> {
  const errors: string[] = []
  const manifest = await loadManifest(root)
  const expected = await collectManifestFiles(root)

  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    errors.push(`schemaVersion is ${manifest.schemaVersion}; expected ${MANIFEST_SCHEMA_VERSION}.`)
  }
  if (manifest.agentSystemVersion !== AGENT_SYSTEM_VERSION) {
    errors.push(`agentSystemVersion is ${manifest.agentSystemVersion}; expected ${AGENT_SYSTEM_VERSION}.`)
  }
  if (manifest.roleContentVersion !== ROLE_CONTENT_VERSION) {
    errors.push(`roleContentVersion is ${manifest.roleContentVersion}; expected ${ROLE_CONTENT_VERSION}.`)
  }
  if (manifest.plugin !== PLUGIN_PIN) {
    errors.push(`plugin is ${manifest.plugin}; expected ${PLUGIN_PIN}.`)
  }

  const declared = new Map(manifest.files.map((file) => [file.source, file]))
  const expectedSources = new Set(expected.map((file) => file.source))
  for (const file of expected) {
    const entry = declared.get(file.source)
    if (!entry) {
      errors.push(`Manifest is missing managed file ${file.source}.`)
      continue
    }
    if (entry.sha256 !== file.sha256) {
      errors.push(`Hash mismatch for ${file.source}: manifest ${entry.sha256}, actual ${file.sha256}.`)
    }
    if (entry.target !== file.target) errors.push(`Target mismatch for ${file.source}.`)
    if (entry.scope !== file.scope) errors.push(`Scope mismatch for ${file.source}.`)
    if (entry.kind !== file.kind) errors.push(`Kind mismatch for ${file.source}.`)
  }
  for (const file of manifest.files) {
    if (!expectedSources.has(file.source)) errors.push(`Manifest declares unmanaged file ${file.source}.`)
    if (!existsSync(join(root, file.source))) errors.push(`Managed file is missing from the repository: ${file.source}`)
  }

  const agents = manifest.files.filter((file) => file.kind === "agent")
  const globalSkills = new Set(manifest.files.filter((file) => file.kind === "skill" && file.scope === "global").map((file) => file.name))
  const projectSkills = new Set(manifest.files.filter((file) => file.kind === "skill" && file.scope === "project").map((file) => file.name))
  if (agents.length !== AGENT_IDS.length) errors.push(`Manifest lists ${agents.length} agent files; expected ${AGENT_IDS.length}.`)
  if (globalSkills.size !== GLOBAL_SKILLS.length) {
    errors.push(`Manifest lists ${globalSkills.size} global skills; expected ${GLOBAL_SKILLS.length}.`)
  }
  if (projectSkills.size !== PROJECT_SKILLS.length) {
    errors.push(`Manifest lists ${projectSkills.size} project skills; expected ${PROJECT_SKILLS.length}.`)
  }
  for (const name of GLOBAL_SKILLS) {
    if (!globalSkills.has(name)) errors.push(`Global skill ${name} is not scoped global.`)
  }
  for (const name of PROJECT_SKILLS) {
    if (!projectSkills.has(name)) errors.push(`Project skill ${name} is not scoped project.`)
  }
  for (const name of globalSkills) {
    if ((PROJECT_SKILLS as readonly string[]).includes(name)) errors.push(`Skill ${name} is listed as both global and project.`)
  }

  return {
    errors,
    agents: agents.length,
    globalSkills: globalSkills.size,
    projectSkills: projectSkills.size,
    files: manifest.files.length,
  }
}

export async function writeManifest(root = repoRoot()) {
  const files = await collectManifestFiles(root)
  const manifest = buildManifest(files)
  writeJsonAtomic(join(root, "agent-system/manifest.json"), manifest)
  return manifest
}

export async function verifyManifestFile(root = repoRoot()) {
  const manifest = await loadManifest(root)
  const schema = readJsonFile(join(root, "agent-system/manifest.schema.json"))
  return { manifest, schema }
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const root = repoRoot()
  if (args.includes("--check")) {
    const result = await checkManifest(root)
    if (result.errors.length > 0) {
      console.error(`Manifest check failed with ${result.errors.length} error(s):`)
      for (const error of result.errors) console.error(`  - ${error}`)
      process.exit(1)
    }
    console.log(
      `Manifest OK: ${result.agents} agents, ${result.globalSkills} global skills, ${result.projectSkills} project skills, ${result.files} files.`,
    )
    process.exit(0)
  }
  const manifest = await writeManifest(root)
  const agents = manifest.files.filter((file) => file.kind === "agent").length
  const globalSkills = new Set(manifest.files.filter((file) => file.kind === "skill" && file.scope === "global").map((file) => file.name)).size
  const projectSkills = new Set(manifest.files.filter((file) => file.kind === "skill" && file.scope === "project").map((file) => file.name)).size
  console.log(
    `Wrote agent-system/manifest.json: ${agents} agents, ${globalSkills} global skills, ${projectSkills} project skills, ${manifest.files.length} files.`,
  )
}
