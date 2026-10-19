#!/usr/bin/env bun

import { $ } from "bun"

const name = process.argv[2]
if (!name) {
  console.error("usage: bun run test:pkg <name>   e.g. bun run test:pkg core")
  process.exit(1)
}

const pkg = name.startsWith("@") ? name : `@opencode/${name}`
await $`bun turbo test --filter=${pkg} --concurrency=3`
