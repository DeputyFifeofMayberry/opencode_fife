import { readFileSync } from "node:fs"
import { describe, expect, it } from "bun:test"

const CORE_FILES = ["types.ts", "levels.ts", "policy.ts"] as const

function source(file: string): string {
  return readFileSync(new URL(`../../src/effort/policy/${file}`, import.meta.url), "utf8")
}

describe("portable core boundary", () => {
  it("imports only sibling core modules", () => {
    for (const file of CORE_FILES) {
      const specifiers = [...source(file).matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1])
      expect(specifiers.every(specifier => specifier !== undefined && specifier.startsWith("./")))
        .toBe(true)
    }
  })

  it("reaches no harness package, host package, Node API, clock, or process state", () => {
    for (const file of CORE_FILES) {
      const text = source(file)
      expect(text).not.toMatch(/from\s+['"]@(deepseek-ai|opencode)\//)
      expect(text).not.toMatch(/from\s+['"]node:/)
      expect(text).not.toMatch(/\bDate\s*\.\s*now\b|\bprocess\s*\./)
      expect(text).not.toMatch(/\bContext\b|\bSession\b/)
    }
  })
})
