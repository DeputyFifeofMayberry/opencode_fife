#!/usr/bin/env bun

import { $ } from "bun"

const server = (await $`opencode service status`.quiet().text()).trim()
if (!server || server === "stopped") {
  console.error("no running opencode service — start one first")
  process.exit(1)
}

const password = (await $`opencode service get password`.quiet().text()).trim()
if (!password) {
  console.error("could not read service password")
  process.exit(1)
}

const input = process.argv.slice(2)
const vite = input[0] === "--vite"
const args = vite ? input.slice(1) : input

process.env.OPENCODE_TUI_CHANNEL = "dev"
process.env.OPENCODE_PASSWORD = password
await (vite
  ? $`bun run --cwd packages/cli --conditions=browser dev/vite.ts ${args} --server ${server}`
  : $`bun run --cwd packages/cli src/index.ts ${args} --server ${server}`)
