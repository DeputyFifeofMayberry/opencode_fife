import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const binary = join(homedir(), ".local/bin/opencode.exe")
const configRoot = join(homedir(), ".config/opencode")
const cwd = "C:\\Windows\\Temp\\opencode\\retest-ac09-cwd"
mkdirSync(cwd, { recursive: true })

const env: Record<string, string | undefined> = { ...process.env, OPENCODE_CONFIG_DIR: configRoot }
delete env.OPENCODE_CONFIG
delete env.OPENCODE_CONFIG_CONTENT

const result = Bun.spawnSync([binary, "debug", "agents"], { cwd, env, stdout: "pipe", stderr: "pipe" })
const stdout = result.stdout.toString()
const stderr = result.stderr.toString()
writeFileSync("C:\\Windows\\Temp\\opencode\\retest-agents.json", stdout)
writeFileSync("C:\\Windows\\Temp\\opencode\\retest-agents.err", stderr)

const results: string[] = []
const fail = (msg: string) => results.push(`FAIL ${msg}`)
const pass = (msg: string) => results.push(`PASS ${msg}`)

if (result.exitCode === 0) pass(`debug agents exited 0 (cwd ${cwd})`)
else fail(`debug agents exited ${result.exitCode}; stderr: ${stderr.slice(0, 500)}`)

const start = stdout.indexOf("[")
const end = stdout.lastIndexOf("]")
if (start === -1 || end === -1) {
  fail("debug agents did not print a JSON array")
  console.log(results.join("\n"))
  process.exit(1)
}
const agents = JSON.parse(stdout.slice(start, end + 1)) as Record<string, unknown>[]
pass(`debug agents returned ${agents.length} agents`)

const modes: Record<string, string> = { "spec-writer": "primary", implementer: "all", tester: "subagent", qa: "subagent" }
for (const [id, mode] of Object.entries(modes)) {
  const agent = agents.find((entry) => entry.id === id)
  if (!agent) fail(`role missing: ${id}`)
  else if (agent.mode === mode) pass(`${id} mode ${mode}`)
  else fail(`${id} mode ${JSON.stringify(agent.mode)}, expected ${mode}`)
}

const rules = (id: string) => ((agents.find((entry) => entry.id === id)?.permissions ?? []) as Record<string, unknown>[])
const hasRule = (id: string, action: string, resource: string, effect: string) =>
  rules(id).some((rule) => rule.action === action && rule.resource === resource && rule.effect === effect)

const expected: Array<[string, string, string, string]> = [
  ["spec-writer", "subagent", "*", "deny"],
  ["spec-writer", "subagent", "explore", "allow"],
  ["spec-writer", "subagent", "implementer", "ask"],
  ["spec-writer", "subagent", "tester", "ask"],
  ["spec-writer", "subagent", "qa", "ask"],
  ["implementer", "subagent", "*", "ask"],
  ["implementer", "subagent", "explore", "allow"],
  ["tester", "subagent", "*", "deny"],
  ["qa", "subagent", "explore", "ask"],
]
for (const [id, action, resource, effect] of expected) {
  if (hasRule(id, action, resource, effect)) pass(`${id} rule ${action} ${resource} ${effect}`)
  else fail(`${id} missing rule ${action} ${resource} ${effect}`)
}

const qaDefaultDeny =
  hasRule("qa", "subagent", "*", "deny") || hasRule("qa", "*", "*", "deny")
if (qaDefaultDeny) pass("qa default deny covers subagent resources")
else fail("qa has no default deny rule covering subagent resources")

for (const id of ["spec-writer", "implementer", "tester", "qa"]) {
  for (const tier of ["fast", "medium", "heavy"]) {
    if (hasRule(id, "subagent", tier, "allow")) fail(`${id} allows subagent ${tier}`)
  }
}
pass("no SDD role has an allow rule for fast/medium/heavy")

for (const tier of ["fast", "medium", "heavy"]) {
  if (agents.some((entry) => entry.id === tier)) pass(`tier present: ${tier}`)
  else fail(`tier missing: ${tier}`)
}

const cli = JSON.parse(readFileSync(join(configRoot, "cli.json"), "utf8").replace(/^\uFEFF/, "")) as {
  session?: { permissions?: string }
}
if (cli.session?.permissions === "prompt") pass("live cli.json session.permissions prompt")
else fail(`live cli.json session.permissions ${JSON.stringify(cli.session?.permissions)}`)

const installed = JSON.parse(readFileSync(join(configRoot, "agent-system.installed.json"), "utf8").replace(/^\uFEFF/, "")) as {
  permissionMode?: string
  keepAutoAccept?: boolean
}
if (installed.permissionMode === "prompt") pass("installed manifest permissionMode prompt")
else fail(`installed manifest permissionMode ${JSON.stringify(installed.permissionMode)}`)
if (installed.keepAutoAccept === false) pass("installed manifest keepAutoAccept false")
else fail(`installed manifest keepAutoAccept ${JSON.stringify(installed.keepAutoAccept)}`)

if (existsSync("C:\\Windows\\Temp\\opencode\\retest-agents.json")) pass("raw debug agents output saved")
else fail("raw debug agents output missing")

console.log(results.join("\n"))
const failures = results.filter((entry) => entry.startsWith("FAIL"))
console.log(`\n${results.length - failures.length} passed, ${failures.length} failed`)
process.exit(failures.length === 0 ? 0 : 1)
