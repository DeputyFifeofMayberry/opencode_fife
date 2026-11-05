import { describe, expect, test } from "bun:test"
import { readJsonFile } from "./lib"
import { repoRoot } from "./lib"
import {
  MergeError,
  mergeCliPermissions,
  mergeOpencodeConfig,
  mergeRouterOverrides,
  mergeRouterOverridesText,
  readCanonicalOpencode,
  readCanonicalRouter,
} from "./merge"

describe("opencode.json merge", () => {
  test("preserves unrelated keys and adds the canonical keys", async () => {
    const canonical = readCanonicalOpencode(repoRoot())
    const existing = {
      update: "disable",
      provider: { example: { apiKey: "not-a-real-key" } },
      effort_policy: { mode: "frozen", base_level: "standard", agent_operations: { fast: "old" } },
      plugins: ["other-plugin"],
    }
    const result = mergeOpencodeConfig(existing, canonical)
    expect(result.changed).toBe(true)
    expect(result.value.update).toBe("disable")
    expect(result.value.provider).toEqual(existing.provider)
    expect(result.value.effort_policy).toEqual({
      mode: "frozen",
      base_level: "standard",
      agent_operations: { fast: "explore", medium: "implement", heavy: "review" },
    })
    expect(result.value.plugins).toEqual(["other-plugin", "opencode-model-router@2.9.1"])
  })

  test("is idempotent when the canonical keys already match", async () => {
    const canonical = readCanonicalOpencode(repoRoot())
    const first = mergeOpencodeConfig({ update: "disable", plugins: [] }, canonical)
    const second = mergeOpencodeConfig(first.value, canonical)
    expect(second.changed).toBe(false)
  })

  test("refuses to substitute a different model-router version", async () => {
    const canonical = readCanonicalOpencode(repoRoot())
    expect(() => mergeOpencodeConfig({ plugins: ["opencode-model-router@2.8.0"] }, canonical)).toThrow(MergeError)
  })
})

describe("router overrides merge", () => {
  test("preserves the active preset, other presets, and unrelated keys", async () => {
    const canonical = await readCanonicalRouter(repoRoot())
    const existing = {
      activePreset: "other",
      activeMode: "normal",
      presets: {
        other: { fast: { model: "other/model" } },
        fife: { fast: { model: "stale/model" } },
      },
      enforcement: { mode: "advisory" },
    }
    const result = mergeRouterOverrides(existing, canonical)
    expect(result.changed).toBe(true)
    expect(result.value.activePreset).toBe("other")
    expect(result.value.activeMode).toBe("normal")
    expect(result.value.enforcement).toEqual({ mode: "advisory" })
    expect((result.value.presets as Record<string, unknown>).other).toEqual(existing.presets.other)
    expect((result.value.presets as Record<string, unknown>).fife).toEqual(
      (canonical.presets as Record<string, unknown>).fife,
    )
  })

  test("parses comments and trailing commas and records normalization", async () => {
    const canonical = await readCanonicalRouter(repoRoot())
    const text = `{
      // keep this comment in the backup
      "activePreset": "fife",
      "presets": { "fife": { "fast": { "model": "stale/model" } }, },
    }`
    const result = mergeRouterOverridesText(text, canonical)
    expect(result.changed).toBe(true)
    expect(result.commentsNormalized).toBe(true)
    expect(result.value.activePreset).toBe("fife")
  })

  test("rejects malformed JSONC", async () => {
    const canonical = await readCanonicalRouter(repoRoot())
    expect(() => mergeRouterOverridesText("{ nope", canonical)).toThrow()
  })
})

describe("cli.json permission merge", () => {
  test("changes autoaccept to prompt by default", () => {
    const result = mergeCliPermissions({ session: { permissions: "autoaccept", tps: true } }, false)
    expect(result.action).toBe("changed")
    expect(result.value.session).toEqual({ permissions: "prompt", tps: true })
  })

  test("keeps autoaccept with an explicit opt-out and warns", () => {
    const result = mergeCliPermissions({ session: { permissions: "autoaccept" } }, true)
    expect(result.action).toBe("kept")
    expect(result.changed).toBe(false)
    expect(result.warnings.some((warning) => warning.includes("suppresses ask prompts"))).toBe(true)
  })

  test("leaves prompt unchanged", () => {
    const result = mergeCliPermissions({ session: { permissions: "prompt" } }, false)
    expect(result.action).toBe("unchanged")
    expect(result.changed).toBe(false)
  })

  test("reports the runtime default when the key is absent", () => {
    const result = mergeCliPermissions({ session: {} }, false)
    expect(result.action).toBe("default")
    expect(result.warnings.some((warning) => warning.includes("runtime default is prompt"))).toBe(true)
  })
})

test("the checked-in fragments are parseable", async () => {
  expect(readJsonFile(`${repoRoot()}/agent-system/config/opencode.fragment.json`)).toBeTruthy()
  expect(await readCanonicalRouter(repoRoot())).toBeTruthy()
})
