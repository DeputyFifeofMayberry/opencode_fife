import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { dirname, join, relative, resolve } from "node:path"

export const AGENT_SYSTEM_VERSION = "2.1.0"
export const ROLE_CONTENT_VERSION = "1.2.0"
export const PLUGIN_PACKAGE = "opencode-model-router"
export const PLUGIN_VERSION = "2.9.1"
export const PLUGIN_PIN = `${PLUGIN_PACKAGE}@${PLUGIN_VERSION}`
export const MANIFEST_SCHEMA_VERSION = 1
export const LINE_ENDINGS = "lf"

export const AGENT_IDS = ["spec-writer", "implementer", "tester", "qa"] as const
export type AgentID = (typeof AGENT_IDS)[number]

export const GLOBAL_SKILLS = [
  "api-and-interface-design",
  "browser-testing-with-devtools",
  "code-review-and-quality",
  "code-simplification",
  "constraint-driven-development",
  "construction-humanizer",
  "context-engineering",
  "craft-prompting",
  "debugging-and-error-recovery",
  "deprecation-and-migration",
  "documentation-and-adrs",
  "doubt-driven-development",
  "eli5-skill",
  "find-skills",
  "frontend-ui-engineering",
  "git-workflow-and-versioning",
  "grilling",
  "idea-refine",
  "incremental-implementation",
  "interview-me",
  "observability-and-instrumentation",
  "performance-optimization",
  "planning-and-task-breakdown",
  "ponytail",
  "security-and-hardening",
  "shipping-and-launch",
  "source-driven-development",
  "spec-driven-development",
  "test-design",
  "using-agent-skills",
  "walk-me-through",
] as const

export const SHARED_SKILLS = [
  "construction-humanizer",
  "craft-prompting",
  "eli5-skill",
  "find-skills",
  "walk-me-through",
] as const

// The approved specification lists nine repo-only skills but omits `opencode-dev`,
// which is present in the repository and referenced by AGENTS.md. Preserve it as a
// project-scoped skill rather than deleting working content to match the count.
export const PROJECT_SKILLS = [
  "app-e2e-tests",
  "component-tests",
  "effect",
  "humanizer_fife",
  "opencode-dev",
  "plan-hardening",
  "rtl-aware-development",
  "sample-skill",
  "tui-tests",
  "unit-tests",
] as const

export type Scope = "global" | "project" | "config"
export type Kind = "agent" | "skill" | "config"

export type ManifestFile = {
  kind: Kind
  name: string
  source: string
  target: string | null
  scope: Scope
  sha256: string
}

export type Manifest = {
  schemaVersion: number
  agentSystemVersion: string
  roleContentVersion: string
  plugin: string
  lineEndings: string
  files: ManifestFile[]
}

export type InstalledFile = {
  kind: Kind
  name: string
  target: string
  scope: Scope
  sha256: string
}

export type InstalledConfig = {
  path: string
  sha256: string
}

export type InstalledManifest = {
  schemaVersion: number
  agentSystemVersion: string
  roleContentVersion: string
  sourceCommit: string
  cliVersion: string
  installedAt: string
  backupPath: string | null
  permissionMode: "prompt" | "autoaccept" | "default"
  promptPermissions: boolean
  plugin: string
  files: InstalledFile[]
  config: InstalledConfig[]
}

export type BackupEntry = {
  path: string
  backup: string | null
  existed: boolean
  sha256: string | null
}

export type BackupManifest = {
  schemaVersion: number
  createdAt: string
  agentSystemVersion: string
  roleContentVersion: string
  installedManifestExisted: boolean
  files: BackupEntry[]
}

const ignoredDirectories = new Set(["__pycache__", ".git", "node_modules"])
const ignoredFiles = new Set([".DS_Store", "Thumbs.db"])
const textExtensions = new Set([
  ".md",
  ".json",
  ".jsonc",
  ".yaml",
  ".yml",
  ".sh",
  ".py",
  ".txt",
  ".csv",
  ".jsonl",
])

export function repoRoot() {
  return resolve(import.meta.dir, "../..")
}

export function defaultConfigRoot() {
  return process.env.OPENCODE_CONFIG_DIR ?? join(homedir(), ".config", "opencode")
}

export function resolveConfigRoot(input?: string) {
  return resolve(input ?? defaultConfigRoot())
}

export function toPosix(path: string) {
  return path.replaceAll("\\", "/")
}

export function relativePosix(root: string, path: string) {
  return toPosix(relative(root, path))
}

export function isTextFile(path: string) {
  const name = path.slice(path.lastIndexOf("/") + 1)
  if (name === ".gitignore" || name === ".gitattributes") return true
  const dot = name.lastIndexOf(".")
  if (dot === -1) return false
  return textExtensions.has(name.slice(dot).toLowerCase())
}

export function normalizeLineEndings(text: string) {
  return text.replaceAll("\r\n", "\n").replaceAll("\r", "\n")
}

export function isIgnoredPath(path: string) {
  const parts = toPosix(path).split("/")
  return parts.some((part) => ignoredDirectories.has(part) || part.endsWith(".pyc")) || ignoredFiles.has(parts.at(-1) ?? "")
}

export function listFiles(root: string) {
  if (!existsSync(root)) return []
  const files: string[] = []
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (isIgnoredPath(relativePosix(root, path))) continue
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile()) files.push(path)
    }
  }
  visit(root)
  return files.sort()
}

export async function sha256File(path: string) {
  return createHash("sha256").update(normalizedBytes(Buffer.from(await Bun.file(path).arrayBuffer()))).digest("hex")
}

export function normalizedBytes(bytes: Buffer) {
  if (bytes.includes(0)) return bytes
  const text = bytes.toString("utf8")
  if (!Buffer.from(text, "utf8").equals(bytes)) return bytes
  return Buffer.from(normalizeLineEndings(text), "utf8")
}

export async function readText(path: string) {
  return normalizeLineEndings(await Bun.file(path).text())
}

export function writeFileAtomic(path: string, content: string | Uint8Array) {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(temporary, content)
  renameSync(temporary, path)
}

export async function copyFileAtomic(source: string, target: string) {
  writeFileAtomic(target, normalizedBytes(Buffer.from(await Bun.file(source).arrayBuffer())))
}

export function parseJsonText(text: string) {
  return JSON.parse(text.replace(/^\uFEFF/, "")) as unknown
}

export function readJsonFile(path: string) {
  return parseJsonText(readFileSync(path, "utf8"))
}

export function writeJsonAtomic(path: string, value: unknown) {
  writeFileAtomic(path, `${JSON.stringify(value, null, 2)}\n`)
}

export function parseJsonc(text: string) {
  return JSON.parse(removeTrailingCommas(stripJsoncComments(text))) as unknown
}

export function hasJsoncComments(text: string) {
  let index = 0
  let inString = false
  while (index < text.length) {
    const char = text[index]
    const next = text[index + 1]
    if (inString) {
      if (char === "\\") {
        index += 2
        continue
      }
      if (char === '"') inString = false
      index++
      continue
    }
    if (char === '"') {
      inString = true
      index++
      continue
    }
    if (char === "/" && (next === "/" || next === "*")) return true
    index++
  }
  return false
}

function stripJsoncComments(text: string) {
  let result = ""
  let index = 0
  let inString = false
  while (index < text.length) {
    const char = text[index]
    const next = text[index + 1]
    if (inString) {
      result += char
      if (char === "\\") {
        result += next ?? ""
        index += 2
        continue
      }
      if (char === '"') inString = false
      index++
      continue
    }
    if (char === '"') {
      inString = true
      result += char
      index++
      continue
    }
    if (char === "/" && next === "/") {
      while (index < text.length && text[index] !== "\n") index++
      continue
    }
    if (char === "/" && next === "*") {
      index += 2
      while (index < text.length && !(text[index] === "*" && text[index + 1] === "/")) index++
      index += 2
      continue
    }
    result += char
    index++
  }
  return result
}

function removeTrailingCommas(text: string) {
  let result = ""
  let inString = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (inString) {
      result += char
      if (char === "\\") {
        result += text[index + 1] ?? ""
        index++
        continue
      }
      if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      result += char
      continue
    }
    if (char === ",") {
      let next = index + 1
      while (next < text.length && /\s/.test(text[next] ?? "")) next++
      if (text[next] === "}" || text[next] === "]") continue
    }
    result += char
  }
  return result
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function asRecord(value: unknown, label: string) {
  if (!isRecord(value)) throw new Error(`${label} must be a JSON object.`)
  return value
}

export function asArray(value: unknown, label: string) {
  if (!Array.isArray(value)) throw new Error(`${label} must be a JSON array.`)
  return value
}

export function asString(value: unknown, label: string) {
  if (typeof value !== "string") throw new Error(`${label} must be a string.`)
  return value
}

export function deepEqual(left: unknown, right: unknown) {
  return Bun.deepEquals(left, right)
}

export function sortManifestFiles(files: ManifestFile[]) {
  return files.toSorted((left, right) => `${left.kind}:${left.name}:${left.source}`.localeCompare(`${right.kind}:${right.name}:${right.source}`))
}

export async function collectManifestFiles(root = repoRoot()): Promise<ManifestFile[]> {
  const files: ManifestFile[] = []
  for (const id of AGENT_IDS) {
    const source = `.opencode/agents/${id}.md`
    files.push({
      kind: "agent",
      name: id,
      source,
      target: `agents/${id}.md`,
      scope: "global",
      sha256: await sha256File(join(root, source)),
    })
  }
  for (const name of [...GLOBAL_SKILLS, ...PROJECT_SKILLS]) {
    const scope: Scope = (GLOBAL_SKILLS as readonly string[]).includes(name) ? "global" : "project"
    const directory = join(root, ".opencode/skills", name)
    if (!existsSync(directory)) throw new Error(`Missing skill directory: .opencode/skills/${name}`)
    for (const path of listFiles(directory)) {
      const relativePath = relativePosix(directory, path)
      const source = `.opencode/skills/${name}/${relativePath}`
      files.push({
        kind: "skill",
        name,
        source,
        target: `skills/${name}/${relativePath}`,
        scope,
        sha256: await sha256File(path),
      })
    }
  }
  for (const [name, source] of [
    ["opencode", "agent-system/config/opencode.fragment.json"],
    ["model-router", "agent-system/config/model-router.overrides.jsonc"],
  ] as const) {
    files.push({
      kind: "config",
      name,
      source,
      target: null,
      scope: "config",
      sha256: await sha256File(join(root, source)),
    })
  }
  return sortManifestFiles(files)
}

export function installableFiles(manifest: Manifest) {
  return manifest.files.filter((file) => file.kind === "agent" || (file.kind === "skill" && file.scope === "global"))
}

export function buildManifest(files: ManifestFile[]): Manifest {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    agentSystemVersion: AGENT_SYSTEM_VERSION,
    roleContentVersion: ROLE_CONTENT_VERSION,
    plugin: PLUGIN_PIN,
    lineEndings: LINE_ENDINGS,
    files,
  }
}

export function validateManifest(value: unknown, schema: unknown) {
  const errors = validateSchema(value, schema, "$")
  if (errors.length > 0) throw new Error(`Manifest schema validation failed:\n${errors.join("\n")}`)
  return value as Manifest
}

type Schema = {
  type?: string | string[]
  const?: unknown
  enum?: unknown[]
  required?: string[]
  properties?: Record<string, Schema>
  additionalProperties?: boolean | Schema
  items?: Schema
  minItems?: number
  minimum?: number
  pattern?: string
  oneOf?: Schema[]
  anyOf?: Schema[]
  allOf?: Schema[]
}

function validateSchema(value: unknown, rawSchema: unknown, path: string): string[] {
  const schema = rawSchema as Schema
  const errors: string[] = []
  if (schema.const !== undefined && !deepEqual(value, schema.const)) {
    errors.push(`${path}: expected ${JSON.stringify(schema.const)}`)
  }
  if (schema.enum && !schema.enum.some((entry) => deepEqual(entry, value))) {
    errors.push(`${path}: expected one of ${schema.enum.map((entry) => JSON.stringify(entry)).join(", ")}`)
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type]
    const matches = types.some((type) => matchesType(value, type))
    if (!matches) errors.push(`${path}: expected type ${types.join(" | ")}`)
  }
  if (schema.oneOf) {
    const matches = schema.oneOf.filter((entry) => validateSchema(value, entry, path).length === 0)
    if (matches.length !== 1) errors.push(`${path}: expected exactly one oneOf branch`)
  }
  if (schema.anyOf) {
    if (!schema.anyOf.some((entry) => validateSchema(value, entry, path).length === 0)) {
      errors.push(`${path}: expected at least one anyOf branch`)
    }
  }
  if (schema.allOf) {
    for (const entry of schema.allOf) errors.push(...validateSchema(value, entry, path))
  }
  if (typeof value === "number" && schema.minimum !== undefined && value < schema.minimum) {
    errors.push(`${path}: expected a number >= ${schema.minimum}`)
  }
  if (typeof value === "string" && schema.pattern && !new RegExp(schema.pattern).test(value)) {
    errors.push(`${path}: expected to match ${schema.pattern}`)
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path}: expected at least ${schema.minItems} item(s)`)
    }
    if (schema.items) {
      value.forEach((entry, index) => errors.push(...validateSchema(entry, schema.items, `${path}[${index}]`)))
    }
  }
  if (isRecord(value)) {
    for (const required of schema.required ?? []) {
      if (!(required in value)) errors.push(`${path}: missing required property ${required}`)
    }
    for (const [key, entry] of Object.entries(value)) {
      const property = schema.properties?.[key]
      if (property) {
        errors.push(...validateSchema(entry, property, `${path}.${key}`))
        continue
      }
      if (schema.additionalProperties === false) {
        errors.push(`${path}: unexpected property ${key}`)
        continue
      }
      if (isRecord(schema.additionalProperties)) {
        errors.push(...validateSchema(entry, schema.additionalProperties, `${path}.${key}`))
      }
    }
  }
  return errors
}

function matchesType(value: unknown, type: string) {
  if (type === "object") return isRecord(value)
  if (type === "array") return Array.isArray(value)
  if (type === "string") return typeof value === "string"
  if (type === "number") return typeof value === "number"
  if (type === "integer") return Number.isInteger(value)
  if (type === "boolean") return typeof value === "boolean"
  if (type === "null") return value === null
  return false
}

export async function loadManifest(root = repoRoot()) {
  const manifestPath = join(root, "agent-system/manifest.json")
  const schemaPath = join(root, "agent-system/manifest.schema.json")
  if (!existsSync(manifestPath)) throw new Error(`Missing manifest: ${manifestPath}`)
  if (!existsSync(schemaPath)) throw new Error(`Missing manifest schema: ${schemaPath}`)
  return validateManifest(readJsonFile(manifestPath), readJsonFile(schemaPath))
}

export function readInstalledManifest(configRoot: string) {
  const path = join(configRoot, "agent-system.installed.json")
  if (!existsSync(path)) return null
  const value = readJsonFile(path)
  if (!isRecord(value)) throw new Error(`Installed manifest is not a JSON object: ${path}`)
  return value as InstalledManifest
}

export function installedManifestPath(configRoot: string) {
  return join(configRoot, "agent-system.installed.json")
}

export function backupRoot(configRoot: string) {
  return join(configRoot, "backups/agent-system")
}

export function listBackups(configRoot: string) {
  const root = backupRoot(configRoot)
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, entry.name))
    .sort()
    .reverse()
}

export function pruneBackups(configRoot: string, keep = 5) {
  const removed = listBackups(configRoot).slice(keep)
  for (const path of removed) rmSync(path, { recursive: true, force: true })
  return removed
}

export function gitCommit(root = repoRoot()) {
  const result = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: root, stdout: "pipe", stderr: "pipe" })
  if (result.exitCode !== 0) return "unknown"
  return result.stdout.toString().trim()
}

export function cliVersion() {
  const record = join(homedir(), ".local/bin/opencode-build.json")
  if (existsSync(record)) {
    try {
      const value = readJsonFile(record)
      if (isRecord(value) && typeof value.version === "string") return value.version
    } catch {}
  }
  const result = Bun.spawnSync(["opencode", "--version"], { stdout: "pipe", stderr: "pipe" })
  if (result.exitCode === 0) return result.stdout.toString().trim()
  return "unknown"
}

export function findOpencodeBinary() {
  const local = join(homedir(), ".local/bin/opencode.exe")
  if (existsSync(local)) return local
  return Bun.which("opencode")
}

export function tempRoot(prefix: string) {
  return mkdirTemp(join(tmpdir(), prefix))
}

function mkdirTemp(path: string) {
  const unique = `${path}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  mkdirSync(unique, { recursive: true })
  return unique
}

export function removeTree(path: string) {
  rmSync(path, { recursive: true, force: true })
}

export function statSize(path: string) {
  return statSync(path).size
}
