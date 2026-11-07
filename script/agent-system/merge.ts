import {
  PLUGIN_PACKAGE,
  PLUGIN_PIN,
  PLUGIN_VERSION,
  asArray,
  asRecord,
  deepEqual,
  hasJsoncComments,
  isRecord,
  readJsonFile,
  readText,
  parseJsonc,
} from "./lib"
import { join } from "node:path"

export class MergeError extends Error {}

export type MergeResult = {
  value: Record<string, unknown>
  changed: boolean
  commentsNormalized: boolean
  warnings: string[]
}

export type PermissionMergeResult = MergeResult & {
  action: "unchanged" | "changed" | "default"
}

export function readCanonicalOpencode(root: string) {
  return asRecord(readJsonFile(join(root, "agent-system/config/opencode.fragment.json")), "opencode fragment")
}

export async function readCanonicalRouter(root: string) {
  return asRecord(parseJsonc(await readText(join(root, "agent-system/config/model-router.overrides.jsonc"))), "router overrides")
}

export function mergeOpencodeConfig(existing: unknown, canonical: unknown): MergeResult {
  const current = asRecord(existing, "opencode.json")
  const fragment = asRecord(canonical, "opencode fragment")
  const value = structuredClone(current)
  const warnings: string[] = []

  if (fragment.model !== undefined) value.model = structuredClone(fragment.model)

  const experimental = isRecord(value.experimental) ? value.experimental : {}
  const canonicalExperimental = isRecord(fragment.experimental) ? fragment.experimental : {}
  if (canonicalExperimental.subagent_depth !== undefined) {
    value.experimental = { ...experimental, subagent_depth: structuredClone(canonicalExperimental.subagent_depth) }
  }

  if (isRecord(fragment.agents)) {
    const agents = isRecord(value.agents) ? value.agents : {}
    const merged: Record<string, unknown> = { ...agents }
    for (const [id, item] of Object.entries(fragment.agents)) {
      if (!isRecord(item)) continue
      const target = isRecord(merged[id]) ? (merged[id] as Record<string, unknown>) : {}
      const next: Record<string, unknown> = { ...target }
      for (const [key, value] of Object.entries(item)) {
        if (key === "permissions") continue
        next[key] = structuredClone(value)
      }
      if (item.permissions !== undefined) next.permissions = mergePermissionRules(target.permissions, item.permissions)
      merged[id] = next
    }
    value.agents = merged
  }

  const effort = isRecord(value.effort_policy) ? value.effort_policy : {}
  const canonicalEffort = asRecord(fragment.effort_policy, "opencode fragment effort_policy")
  value.effort_policy = {
    ...effort,
    agent_operations: structuredClone(asRecord(canonicalEffort.agent_operations, "agent_operations")),
  }

  const plugins = value.plugins === undefined ? [] : asArray(value.plugins, "opencode.json plugins")
  const routerEntries = plugins.filter(
    (entry): entry is string => typeof entry === "string" && (entry === PLUGIN_PACKAGE || entry.startsWith(`${PLUGIN_PACKAGE}@`)),
  )
  const mismatched = routerEntries.filter((entry) => entry !== PLUGIN_PIN)
  if (mismatched.length > 0) {
    throw new MergeError(
      `opencode.json pins ${mismatched.join(", ")}; the managed pin is ${PLUGIN_PIN}. ` +
        "The installer does not substitute another model-router version.",
    )
  }
  if (!routerEntries.includes(PLUGIN_PIN)) {
    value.plugins = [...plugins, PLUGIN_PIN]
  } else {
    value.plugins = plugins
  }

  return {
    value,
    changed: !deepEqual(current, value),
    commentsNormalized: false,
    warnings,
  }
}

/**
 * Canonical rules are appended after any user rules so they win the last-match
 * evaluation, and identical rules are dropped first so a reinstall is idempotent.
 */
function mergePermissionRules(existing: unknown, canonical: unknown) {
  const current = existing === undefined ? [] : asArray(existing, "agent permissions")
  const managed = asArray(canonical, "fragment agent permissions")
  const kept = current.filter((rule) => !managed.some((candidate) => deepEqual(rule, candidate)))
  return [...kept, ...structuredClone(managed)]
}

export function mergeRouterOverrides(existing: unknown, canonical: unknown): MergeResult {
  const current = asRecord(existing, "router overrides")
  const fragment = asRecord(canonical, "router overrides fragment")
  const value = structuredClone(current)
  const presets = isRecord(value.presets) ? value.presets : {}
  const canonicalPresets = asRecord(fragment.presets, "router overrides presets")
  value.presets = {
    ...presets,
    fife: structuredClone(asRecord(canonicalPresets.fife, "fife preset")),
  }
  if (fragment.subagentTiers !== undefined) value.subagentTiers = structuredClone(fragment.subagentTiers)
  return {
    value,
    changed: !deepEqual(current, value),
    commentsNormalized: false,
    warnings: [],
  }
}

export function mergeCliPermissions(existing: unknown, promptPermissions: boolean): PermissionMergeResult {
  const current = asRecord(existing, "cli.json")
  const value = structuredClone(current)
  const session = isRecord(value.session) ? value.session : {}
  const currentMode = session.permissions
  if (currentMode !== undefined && currentMode !== "prompt" && currentMode !== "autoaccept") {
    throw new MergeError(`cli.json session.permissions must be "prompt" or "autoaccept", received ${JSON.stringify(currentMode)}.`)
  }
  const desired = promptPermissions ? "prompt" : "autoaccept"
  if (currentMode === desired) {
    return { value, changed: false, commentsNormalized: false, warnings: [], action: "unchanged" }
  }
  value.session = { ...session, permissions: desired }
  const warnings = promptPermissions
    ? ["-PromptPermissions restores prompt mode; the SDD ask gates are presented again."]
    : []
  return {
    value,
    changed: true,
    commentsNormalized: false,
    warnings,
    action: currentMode === undefined ? "default" : "changed",
  }
}

export function mergeRouterOverridesText(text: string, canonical: unknown) {
  const result = mergeRouterOverrides(parseJsonc(text), canonical)
  return {
    ...result,
    commentsNormalized: result.changed && hasJsoncComments(text),
  }
}

export function canonicalPermissionRules(agents: unknown, disabled: ReadonlySet<string> = new Set()) {
  const list = asArray(agents, "agents")
  const specWriter = list.find((entry) => isRecord(entry) && entry.id === "spec-writer")
  if (!isRecord(specWriter)) {
    if (disabled.has("spec-writer")) return []
    throw new MergeError("spec-writer is missing from debug agents output.")
  }
  const permissions = asArray(specWriter.permissions, "spec-writer permissions")
  return permissions.filter(isRecord)
}

export function pluginPinFromConfig(config: unknown) {
  const value = asRecord(config, "opencode.json")
  const plugins = asArray(value.plugins, "opencode.json plugins")
  const entry = plugins.find((item) => item === PLUGIN_PIN)
  return typeof entry === "string" ? entry : null
}

export function expectedPluginVersion() {
  return PLUGIN_VERSION
}
