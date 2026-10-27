#!/usr/bin/env bun

import { parseArgs } from "node:util"
import { EffortBenchmark } from "@opencode/core/effort/benchmark"

const args = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    stage: { type: "string", default: "smoke" },
    "model-info": { type: "string" },
    tasks: { type: "string" },
    check: { type: "boolean", default: false },
  },
})

const suiteFile = args.positionals[0]
if (!suiteFile) usage("provide a suite manifest")
if (!args.values.check) usage("only --check is available; live stages require a wired runner and an approved ceiling")
if (!args.values["model-info"]) usage("--check needs --model-info <model.info.json> for preflight")
const stage = args.values.stage as "smoke" | "screening" | "confirmatory"

const suite = EffortBenchmark.parseManifest(await Bun.file(suiteFile).text())
const model = EffortBenchmark.parseModelInfo(await Bun.file(args.values["model-info"]!).text())
const tasks = args.values.tasks ? EffortBenchmark.parseTasks(await Bun.file(args.values.tasks).text()) : suite.tasks

const declared = suite.stages.find((entry) => entry.stage === stage)
if (!declared) usage(`suite does not declare stage ${stage}`)
const preflight = EffortBenchmark.preflight(model, suite.arms.map((arm) => arm.policy))
const runs = EffortBenchmark.expand({ ...suite, tasks }, stage)

const report = {
  suite: { provider: suite.provider, model: suite.model, seed: suite.seed },
  stage,
  preflight,
  runs: runs.length,
  budget: {
    ceiling_usd: declared.ceiling_usd,
    run_ceiling_usd: declared.run_ceiling_usd,
    approved: declared.approved,
    mode: "admission",
  },
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
if (!preflight.valid) {
  console.error("preflight found fewer than two distinct arms; the static comparison is not runnable")
  process.exit(1)
}

function usage(problem: string): never {
  console.error(
    `${problem}\n\nUsage: bun script/benchmark-effort.ts <suite.json> --stage smoke|screening|confirmatory --check --model-info <model.info.json> [--tasks tasks.json]`,
  )
  process.exit(2)
}
