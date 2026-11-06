import { checkManifest, writeManifest } from "./manifest"
import { describeInstall, installAgentSystem, InstallError } from "./install"
import { describeRollback, RollbackError, rollbackAgents } from "./rollback"
import { describeStatus, readStatus, statusExitCode } from "./status"
import { repoRoot } from "./lib"

type Options = {
  positional: string[]
  values: Map<string, string | true>
}

function parseArgs(argv: string[]): Options {
  const positional: string[] = []
  const values = new Map<string, string | true>()
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    if (!argument) continue
    if (!argument.startsWith("-")) {
      positional.push(argument)
      continue
    }
    const key = argument.replace(/^--?/, "").replaceAll(/[-_]/g, "").toLowerCase()
    const next = argv[index + 1]
    if (next && !next.startsWith("-")) {
      values.set(key, next)
      index++
      continue
    }
    values.set(key, true)
  }
  return { positional, values }
}

function stringOption(options: Options, key: string) {
  const value = options.values.get(key)
  return typeof value === "string" ? value : undefined
}

function flag(options: Options, key: string) {
  return options.values.get(key) === true
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const command = options.positional[0] ?? "status"
  const root = stringOption(options, "reporoot") ?? repoRoot()
  const configRoot = stringOption(options, "configroot")

  if (command === "install") {
    if (flag(options, "keepautoaccept")) {
      console.error("-KeepAutoAccept is removed. autoaccept is now the default; use -PromptPermissions to restore prompt mode.")
      return 1
    }
    try {
      const result = await installAgentSystem({
        root,
        configRoot,
        force: flag(options, "force"),
        promptPermissions: flag(options, "promptpermissions"),
        runtimeVerify: !flag(options, "skipruntimeverify"),
        requireTiers: flag(options, "requiretiers"),
      })
      console.log(flag(options, "json") ? JSON.stringify(result, null, 2) : describeInstall(result))
      return 0
    } catch (error) {
      if (error instanceof InstallError) {
        console.error(error.message)
        return 1
      }
      throw error
    }
  }

  if (command === "status") {
    const report = await readStatus(root, configRoot)
    console.log(flag(options, "json") ? JSON.stringify(report, null, 2) : describeStatus(report))
    return statusExitCode(report)
  }

  if (command === "rollback") {
    try {
      const result = await rollbackAgents(configRoot)
      console.log(flag(options, "json") ? JSON.stringify(result, null, 2) : describeRollback(result))
      return 0
    } catch (error) {
      if (error instanceof RollbackError) {
        console.error(error.message)
        return error.exitCode
      }
      throw error
    }
  }

  if (command === "manifest") {
    if (flag(options, "check")) {
      const result = await checkManifest(root)
      if (result.errors.length > 0) {
        console.error(`Manifest check failed with ${result.errors.length} error(s):`)
        for (const error of result.errors) console.error(`  - ${error}`)
        return 1
      }
      console.log(
        `Manifest OK: ${result.agents} agents, ${result.globalSkills} global skills, ${result.projectSkills} project skills, ${result.files} files.`,
      )
      return 0
    }
    const manifest = await writeManifest(root)
    console.log(`Wrote agent-system/manifest.json with ${manifest.files.length} files.`)
    return 0
  }

  console.error(`Unknown command: ${command}. Use install, status, rollback, or manifest.`)
  return 3
}

const exitCode = await main()
process.exit(exitCode)
