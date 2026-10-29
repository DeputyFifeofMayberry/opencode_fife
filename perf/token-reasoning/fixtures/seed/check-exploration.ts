#!/usr/bin/env bun
// Verifies an exploration answer file against predeclared facts; exits nonzero on any miss.
// Each requirement is a labeled line: markdown noise (bold, backticks, spacing) between the
// label and the value does not change the verdict.
import { existsSync, readFileSync } from "node:fs"

const mode = process.argv[2]
const file = "exploration-answer.md"
if (!existsSync(file)) {
  console.error(`missing ${file}`)
  process.exit(1)
}
const text = readFileSync(file, "utf8")

// (^|\n) anchors the label to a line start; \W{0,12} skips markdown noise; [^\n]* keeps the
// value on the labeled line.
const line = (label: string, value: string) => new RegExp(`(^|\\n)\\W{0,12}${label}\\W{0,12}[^\\n]*${value}`, "i")

const REQUIREMENTS: Record<string, RegExp[]> = {
  "durable-state": [line("table", "session_effort"), line("file", "session[/\\\\]sql\\.ts"), line("column", "\\blevel\\b")],
  "command-trace": [line("id", "variant\\.list"), line("slash", "\\bvariant\\b"), line("operation", "\\bimplement\\b")],
}
const required = REQUIREMENTS[mode ?? ""]
if (!required) {
  console.error(`unknown check mode: ${mode}`)
  process.exit(1)
}
const failed = required.filter((pattern) => !pattern.test(text))
if (failed.length > 0) {
  console.error(`answer failed ${failed.length} of ${required.length} checks`)
  process.exit(1)
}
console.log("exploration answer verified")
