import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import {
  type InstalledManifest,
  type Manifest,
  PLUGIN_PIN,
  asRecord,
  deepEqual,
  installableFiles,
  isRecord,
  listFiles,
  loadManifest,
  parseJsonc,
  readInstalledManifest,
  readJsonFile,
  readText,
  relativePosix,
  repoRoot,
  resolveConfigRoot,
  sha256File,
} from "./lib"
import { readCanonicalOpencode, readCanonicalRouter } from "./merge"

export type StatusReport = {
  installed: boolean
  configRoot: string
  cli: { version: string; commit: string; installedAt: string | null } | null
  agentSystemVersion: string | null
  roleContentVersion: string | null
  permissionMode: string | null
  promptPermissions: boolean
  plugin: string | null
  files: {
    total: number
    inSync: number
    drifted: string[]
    missing: string[]
    extra: string[]
    unmanaged: string[]
  }
  config: {
    opencode: "in-sync" | "drift" | "missing" | "parse-error"
    router: "in-sync" | "drift" | "missing" | "parse-error"
    cli: "in-sync" | "drift" | "missing" | "parse-error"
  }
  errors: string[]
}

export async function readStatus(root = repoRoot(), configRootInput?: string): Promise<StatusReport> {
  const configRoot = resolveConfigRoot(configRootInput)
  const report: StatusReport = {
    installed: false,
    configRoot,
    cli: readCliRecord(),
    agentSystemVersion: null,
    roleContentVersion: null,
    permissionMode: null,
    promptPermissions: false,
    plugin: null,
    files: { total: 0, inSync: 0, drifted: [], missing: [], extra: [], unmanaged: [] },
    config: { opencode: "missing", router: "missing", cli: "missing" },
    errors: [],
  }

  let installed: InstalledManifest | null = null
  try {
    installed = readInstalledManifest(configRoot)
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error))
    return report
  }
  if (!installed) return report

  report.installed = true
  report.agentSystemVersion = installed.agentSystemVersion
  report.roleContentVersion = installed.roleContentVersion
  report.permissionMode = installed.permissionMode
  report.promptPermissions = installed.promptPermissions
  report.plugin = installed.plugin

  let manifest: Manifest
  try {
    manifest = await loadManifest(root)
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error))
    return report
  }

  const installedByTarget = new Map(installed.files.map((file) => [file.target, file]))
  const canonicalByTarget = new Map(installableFiles(manifest).map((file) => [file.target ?? "", file]))
  report.files.total = canonicalByTarget.size
  for (const [target, file] of canonicalByTarget) {
    const installedEntry = installedByTarget.get(target)
    const path = join(configRoot, target)
    if (!installedEntry || !existsSync(path)) {
      report.files.missing.push(target)
      continue
    }
    const hash = await sha256File(path)
    if (hash !== installedEntry.sha256 || hash !== file.sha256) {
      report.files.drifted.push(target)
      continue
    }
    report.files.inSync++
  }
  for (const target of installedByTarget.keys()) {
    if (!canonicalByTarget.has(target)) report.files.extra.push(target)
  }
  report.files.unmanaged = scanUnmanaged(configRoot, canonicalByTarget)

  const canonicalOpencode = readCanonicalOpencode(root)
  const canonicalRouter = await readCanonicalRouter(root)
  report.config.opencode = checkOpencodeConfig(join(configRoot, "opencode.json"), canonicalOpencode)
  report.config.router = await checkRouterConfig(join(configRoot, "opencode-model-router.overrides.jsonc"), canonicalRouter)
  report.config.cli = checkCliConfig(join(configRoot, "cli.json"), installed)
  return report
}

function readCliRecord() {
  const path = join(homedir(), ".local/bin/opencode-build.json")
  if (!existsSync(path)) return null
  try {
    const value = readJsonFile(path)
    if (!isRecord(value)) return null
    return {
      version: typeof value.version === "string" ? value.version : "unknown",
      commit: isRecord(value.source) && typeof value.source.commit === "string" ? value.source.commit : "unknown",
      installedAt: typeof value.installedAt === "string" ? value.installedAt : null,
    }
  } catch {
    return null
  }
}

function checkOpencodeConfig(path: string, canonical: Record<string, unknown>): StatusReport["config"]["opencode"] {
  if (!existsSync(path)) return "missing"
  try {
    const value = asRecord(readJsonFile(path), "opencode.json")
    const effort = isRecord(value.effort_policy) ? value.effort_policy : {}
    const expected = asRecord(asRecord(canonical.effort_policy, "fragment effort_policy").agent_operations, "agent_operations")
    if (!deepEqual(effort.agent_operations, expected)) return "drift"
    const plugins = Array.isArray(value.plugins) ? value.plugins : []
    if (!plugins.includes(PLUGIN_PIN)) return "drift"
    return "in-sync"
  } catch {
    return "parse-error"
  }
}

async function checkRouterConfig(path: string, canonical: Record<string, unknown>): Promise<StatusReport["config"]["router"]> {
  if (!existsSync(path)) return "missing"
  try {
    const value = asRecord(parseJsonc(await readText(path)), "router overrides")
    const presets = isRecord(value.presets) ? value.presets : {}
    const expected = asRecord(asRecord(canonical.presets, "fragment presets").fife, "fife preset")
    return deepEqual(presets.fife, expected) ? "in-sync" : "drift"
  } catch {
    return "parse-error"
  }
}

function checkCliConfig(path: string, installed: InstalledManifest): StatusReport["config"]["cli"] {
  if (installed.permissionMode === "default") {
    if (!existsSync(path)) return "in-sync"
    try {
      const value = asRecord(readJsonFile(path), "cli.json")
      const session = isRecord(value.session) ? value.session : {}
      return session.permissions === "autoaccept" ? "drift" : "in-sync"
    } catch {
      return "parse-error"
    }
  }
  if (!existsSync(path)) return "missing"
  try {
    const value = asRecord(readJsonFile(path), "cli.json")
    const session = asRecord(value.session, "cli.json session")
    return session.permissions === installed.permissionMode ? "in-sync" : "drift"
  } catch {
    return "parse-error"
  }
}

function scanUnmanaged(configRoot: string, managed: Map<string, unknown>) {
  const unmanaged: string[] = []
  for (const directory of ["agents", "skills"]) {
    const root = join(configRoot, directory)
    if (!existsSync(root)) continue
    for (const file of listFiles(root)) {
      const relativePath = relativePosix(configRoot, file)
      if (!managed.has(relativePath)) unmanaged.push(relativePath)
    }
  }
  return unmanaged
}

export function statusExitCode(report: StatusReport) {
  if (!report.installed) return 2
  if (report.errors.length > 0) return 3
  const drift =
    report.files.drifted.length > 0 ||
    report.files.missing.length > 0 ||
    report.files.extra.length > 0 ||
    Object.values(report.config).some((value) => value !== "in-sync")
  return drift ? 1 : 0
}

export function describeStatus(report: StatusReport) {
  if (!report.installed) {
    return [
      `Agent system is not installed in ${report.configRoot}.`,
      report.errors.length > 0 ? `Installed manifest error: ${report.errors.join(" ")}` : "Run 'bun run update:local' to install it.",
    ].join("\n")
  }
  const lines = [
    `Agent system: ${report.agentSystemVersion} (role content ${report.roleContentVersion})`,
    `Permission mode: ${report.permissionMode}${report.promptPermissions ? " (PromptPermissions opt-out recorded)" : ""}`,
    `Plugin: ${report.plugin}`,
    `Managed files: ${report.files.inSync}/${report.files.total} in sync`,
  ]
  if (report.cli) lines.push(`CLI: ${report.cli.version} from ${report.cli.commit.slice(0, 12)}${report.cli.installedAt ? `, installed ${report.cli.installedAt}` : ""}`)
  if (report.files.drifted.length > 0) lines.push(`Drifted: ${report.files.drifted.join(", ")}`)
  if (report.files.missing.length > 0) lines.push(`Missing: ${report.files.missing.join(", ")}`)
  if (report.files.extra.length > 0) lines.push(`Extra installed files: ${report.files.extra.join(", ")}`)
  if (report.files.unmanaged.length > 0) lines.push(`Unmanaged files preserved: ${report.files.unmanaged.join(", ")}`)
  lines.push(`Config: opencode.json ${report.config.opencode}; router overrides ${report.config.router}; cli.json ${report.config.cli}`)
  if (report.errors.length > 0) lines.push(`Errors: ${report.errors.join(" ")}`)
  return lines.join("\n")
}
