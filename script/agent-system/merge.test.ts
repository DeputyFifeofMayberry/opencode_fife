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
      provider: { example: { apiKey: "test" } },
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
    expect(result.value.model).toBe("mistral/deepseek-v4-1-flash-1017#max")
    expect(result.value.experimental).toEqual({ subagent_depth: 2 })
    expect(result.value.agents).toEqual({
      plan: { disabled: true },
      build: {
        permissions: [
          { action: "subagent", resource: "spec-writer", effect: "deny" },
          { action: "subagent", resource: "implementer", effect: "deny" },
          { action: "subagent", resource: "tester", effect: "deny" },
          { action: "subagent", resource: "qa", effect: "deny" },
        ],
      },
      explore: {
        model: "vercel/minimax/minimax-m3.1-flash#medium",
        permissions: [{ action: "subagent", resource: "*", effect: "deny" }],
      },
      fast: { permissions: [{ action: "subagent", resource: "*", effect: "deny" }] },
      medium: { permissions: [{ action: "subagent", resource: "*", effect: "deny" }] },
      heavy: { permissions: [{ action: "subagent", resource: "*", effect: "deny" }] },
      qa: { model: "vercel/openai/gpt-6.1-terra#high" },
    })
  })

  test("appends canonical rules after user rules and keeps them idempotent", async () => {
    const canonical = readCanonicalOpencode(repoRoot())
    const userRule = { action: "read", resource: "*.env", effect: "ask" }
    const existing = { agents: { build: { description: "keep me", permissions: [userRule] } } }
    const first = mergeOpencodeConfig(existing, canonical)
    const build = (first.value.agents as Record<string, Record<string, unknown>>).build
    expect(build.description).toBe("keep me")
    expect((build.permissions as unknown[])[0]).toEqual(userRule)
    const second = mergeOpencodeConfig(first.value, canonical)
    expect(second.changed).toBe(false)
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
  test("switches prompt to autoaccept by default", () => {
    const result = mergeCliPermissions({ session: { permissions: "prompt", tps: true } }, false)
    expect(result.action).toBe("changed")
    expect(result.value.session).toEqual({ permissions: "autoaccept", tps: true })
  })

  test("leaves autoaccept unchanged by default", () => {
    const result = mergeCliPermissions({ session: { permissions: "autoaccept" } }, false)
    expect(result.action).toBe("unchanged")
    expect(result.changed).toBe(false)
  })

  test("-PromptPermissions restores prompt mode", () => {
    const result = mergeCliPermissions({ session: { permissions: "autoaccept" } }, true)
    expect(result.action).toBe("changed")
    expect(result.value.session).toEqual({ permissions: "prompt" })
  })

  test("sets autoaccept when the key is absent", () => {
    const result = mergeCliPermissions({ session: {} }, false)
    expect(result.action).toBe("default")
    expect(result.value.session).toEqual({ permissions: "autoaccept" })
  })

  test("rejects an unknown permission mode", () => {
    expect(() => mergeCliPermissions({ session: { permissions: "allow" } }, false)).toThrow(MergeError)
  })
})

test("the checked-in fragments are parseable", async () => {
  expect(readJsonFile(`${repoRoot()}/agent-system/config/opencode.fragment.json`)).toBeTruthy()
  expect(await readCanonicalRouter(repoRoot())).toBeTruthy()
})
