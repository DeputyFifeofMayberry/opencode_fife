#!/usr/bin/env bun

import { parseArgs } from "node:util"
import { SessionUsageReport } from "@opencode/core/session/usage-report"

const args = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    export: { type: "string", multiple: true },
    format: { type: "string", default: "json" },
    out: { type: "string" },
  },
})

const manifest = args.positionals[0]
if (!manifest) usage("provide a run manifest")
const files = args.values.export
if (!files?.length) usage("provide at least one --export session export")
if (args.values.format !== "json" && args.values.format !== "csv") usage("--format must be json or csv")

const runs = SessionUsageReport.parseManifest(await Bun.file(manifest).text())
const sessions = (
  await Promise.all(files.map(async (file) => SessionUsageReport.parseExports(await Bun.file(file).text())))
).flat()
const report = SessionUsageReport.build({ runs, exports: sessions })
const output =
  args.values.format === "csv" ? SessionUsageReport.csv(report) : `${JSON.stringify(report, null, 2)}\n`

if (args.values.out) await Bun.write(args.values.out, output)
else process.stdout.write(output)

function usage(problem: string): never {
  console.error(`${problem}\n\nUsage: bun script/session-usage-report.ts <manifest.json> --export <session.json> [--export ...] [--format json|csv] [--out report.json]`)
  process.exit(2)
}
