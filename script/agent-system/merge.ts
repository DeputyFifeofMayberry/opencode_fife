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
  action: "unchanged" | "changed" | "kept" | "default"
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
  return {
    value,
    changed: !deepEqual(current, value),
    commentsNormalized: false,
    warnings: [],
  }
}

export function mergeCliPermissions(existing: unknown, keepAutoAccept: boolean): PermissionMergeResult {
  const current = asRecord(existing, "cli.json")
  const value = structuredClone(current)
  const session = isRecord(value.session) ? value.session : {}
  const currentMode = session.permissions
  if (currentMode === undefined) {
    return {
      value,
      changed: false,
      commentsNormalized: false,
      warnings: [
        "cli.json has no session.permissions; the runtime default is prompt because only autoaccept suppresses ask prompts.",
      ],
      action: "default",
    }
  }
  if (currentMode !== "prompt" && currentMode !== "autoaccept") {
    throw new MergeError(`cli.json session.permissions must be "prompt" or "autoaccept", received ${JSON.stringify(currentMode)}.`)
  }
  if (currentMode === "prompt") {
    return { value, changed: false, commentsNormalized: false, warnings: [], action: "unchanged" }
  }
  if (keepAutoAccept) {
    return {
      value,
      changed: false,
      commentsNormalized: false,
      warnings: [
        "WARNING: session.permissions remains autoaccept. The TUI suppresses ask prompts, so SDD approval gates are not presented.",
      ],
      action: "kept",
    }
  }
  value.session = { ...session, permissions: "prompt" }
  return {
    value,
    changed: true,
    commentsNormalized: false,
    warnings: [],
    action: "changed",
  }
}

export function mergeRouterOverridesText(text: string, canonical: unknown) {
  const result = mergeRouterOverrides(parseJsonc(text), canonical)
  return {
    ...result,
    commentsNormalized: result.changed && hasJsoncComments(text),
  }
}

export function canonicalPermissionRules(agents: unknown) {
  const list = asArray(agents, "agents")
  const specWriter = list.find((entry) => isRecord(entry) && entry.id === "spec-writer")
  if (!isRecord(specWriter)) throw new MergeError("spec-writer is missing from debug agents output.")
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
