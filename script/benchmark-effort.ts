#!/usr/bin/env bun

import { mkdtemp, mkdir, copyFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { parseArgs } from "node:util"
import { Session } from "@opencode/schema/session"
import { EffortBenchmark } from "@opencode/core/effort/benchmark"
import { EffortBenchmarkRunner } from "@opencode/core/effort/benchmark-runner"

const args = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    stage: { type: "string", default: "smoke" },
    "model-info": { type: "string" },
    tasks: { type: "string" },
    check: { type: "boolean", default: false },
    execute: { type: "boolean", default: false },
    "approve-spend": { type: "boolean", default: false },
    model: { type: "string" },
    "timeout-mins": { type: "string", default: "15" },
    "out-dir": { type: "string" },
  },
})

const suiteFile = args.positionals[0]
if (!suiteFile) usage("provide a suite manifest")
const stage = args.values.stage as "smoke" | "screening" | "confirmatory"
const suite = EffortBenchmark.parseManifest(await Bun.file(suiteFile).text())
const tasks = args.values.tasks ? EffortBenchmark.parseTasks(await Bun.file(args.values.tasks).text()) : suite.tasks

if (args.values.check) {
  if (!args.values["model-info"]) usage("--check needs --model-info <model.info.json> for preflight")
  const model = EffortBenchmark.parseModelInfo(await Bun.file(args.values["model-info"]!).text())
  const declared = suite.stages.find((entry) => entry.stage === stage)
  if (!declared) usage(`suite does not declare stage ${stage}`)
  const preflight = EffortBenchmark.preflight(model, suite.arms.map((arm) => arm.policy))
  const runs = EffortBenchmark.expand({ ...suite, tasks }, stage)
  process.stdout.write(
    `${JSON.stringify(
      {
        suite: { provider: suite.provider, model: suite.model, seed: suite.seed },
        stage,
        preflight,
        runs: runs.length,
        budget: { ceiling_usd: declared.ceiling_usd, run_ceiling_usd: declared.run_ceiling_usd, approved: declared.approved, mode: "admission" },
      },
      null,
      2,
    )}\n`,
  )
  if (!preflight.valid) {
    console.error("preflight found fewer than two distinct arms; the static comparison is not runnable")
    process.exit(1)
  }
  process.exit(0)
}

if (args.values.execute) {
  if (!args.values["approve-spend"]) usage("--execute spends money and requires --approve-spend")
  if (!args.values.model) usage("--execute needs --model <provider/model> (the variant per arm is derived)")
  if (!args.values["out-dir"]) usage("--execute needs --out-dir <directory> for the report and exports")
  const modelRef = args.values.model!
  const timeoutMs = Number(args.values["timeout-mins"]) * 60_000
  const outDir = path.resolve(args.values["out-dir"]!)
  await mkdir(outDir, { recursive: true })

  // Stage 0 discovery: the run measures the wire, so no model info gate applies.
  const result = await EffortBenchmarkRunner.execute({
    suite: { ...suite, tasks },
    stage,
    discovery: true,
    run: (spec) => runLive(spec, { modelRef, tasks, timeoutMs, outDir }),
  })

  const reportPath = path.join(outDir, "report.json")
  await writeFile(reportPath, `${JSON.stringify(result.report, null, 2)}\n`)
  const manifest = {
    version: 1 as const,
    stage,
    model: modelRef,
    discovery: true,
    preflight: result.preflight,
    entries: result.entries,
    not_started: result.not_started,
    errored: result.errored,
  }
  const manifestPath = path.join(outDir, "manifest.json")
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  process.stdout.write(`report: ${reportPath}\nmanifest: ${manifestPath}\n`)
  process.stdout.write(
    `runs: ${result.entries.length} entered, ${result.errored.length} errored, ${result.not_started.length} not started\n`,
  )
  process.exit(0)
}

usage("choose --check (offline preflight) or --execute --approve-spend (live stage)")

type LiveContext = {
  modelRef: string
  tasks: ReadonlyArray<EffortBenchmark.Task>
  timeoutMs: number
  outDir: string
}

/** Executes one spec against an isolated snapshot copy: run, export, verify. */
async function runLive(
  spec: EffortBenchmark.RunSpec,
  ctx: LiveContext,
): Promise<EffortBenchmarkRunner.Outcome> {
  const started = Date.now()
  const task = ctx.tasks.find((candidate) => candidate.id === spec.task_id)
  if (!task) throw new Error(`task ${spec.task_id} is not in the corpus`)
  const snapshot = await mkdtemp(path.join(process.env.TEMP ?? "/tmp", "bench-snapshot-"))
  await extractSnapshot(snapshot)
  await seedCorpus(snapshot)

  const variant = spec.policy === "efficiency" ? "low" : spec.policy === "quality" ? "max" : undefined
  const modelArg = variant === undefined ? ctx.modelRef : `${ctx.modelRef}#${variant}`
  const runTimeout = Math.min(ctx.timeoutMs, 15 * 60_000)
  const runOutput = await capture(
    ["opencode", "run", "--format", "json", "--auto", "-m", modelArg, "--title", `bench-${spec.task_id}-${spec.policy}`, task.prompt],
    { cwd: snapshot, timeoutMs: runTimeout },
  )
  if (runOutput.timedOut) {
    const root = sessionIdFrom(runOutput.stdout)
    if (root) {
      const exportJson = await exportSession(root)
      return { root: Session.ID.make(root), exportJson, wall_ms: Date.now() - started, correctness: "timeout" }
    }
    throw new Error(`run timed out after ${Math.round(runTimeout / 60_000)} min before any session settled`)
  }
  const sessionID = sessionIdFrom(runOutput.stdout)
  if (!sessionID) throw new Error(`run produced no session id; stderr: ${runOutput.stderr.slice(0, 400)}`)
  if (runOutput.code !== 0) {
    // A failed run still leaves spend behind; export it. The verifier never ran, so blocked, not fail.
    const exportJson = await exportSession(sessionID)
    return settle({ root: sessionID, exportJson, wall: started, correctness: "blocked", resolved: null })
  }

  const exportJson = await exportSession(sessionID)
  if (!task.verify) {
    return { root: Session.ID.make(sessionID), exportJson, wall_ms: Date.now() - started, resolved: resolvedVariant(exportJson) }
  }
  const [verifyProgram, ...verifyArgs] = task.verify.split(/\s+/)
  const verdict = await capture([verifyProgram!, ...verifyArgs], { cwd: snapshot, timeoutMs: ctx.timeoutMs })
  return settle({
    root: sessionID,
    exportJson,
    wall: started,
    correctness: verdict.code === 0 && !verdict.timedOut ? "pass" : "fail",
    resolved: resolvedVariant(exportJson),
  })

  async function settle(
    partial: { root: string; exportJson: string; wall: number; correctness: "pass" | "fail" | "blocked"; resolved: string | null },
  ): Promise<EffortBenchmarkRunner.Outcome> {
    await writeFile(path.join(ctx.outDir, `export-${spec.task_id}-${spec.policy}-${spec.repetition}.json`), partial.exportJson)
    return {
      root: Session.ID.make(partial.root),
      exportJson: partial.exportJson,
      wall_ms: Date.now() - partial.wall,
      resolved: partial.resolved,
      correctness: partial.correctness,
    }
  }
}

async function extractSnapshot(into: string) {
  const repoRoot = path.resolve(import.meta.dirname, "..")
  const zip = path.join(into, "..", `snapshot-${Date.now()}.zip`)
  const pack = await capture(["git", "-c", "core.autocrlf=false", "archive", "--format=zip", "--output", zip, "HEAD"], {
    cwd: repoRoot,
    timeoutMs: 120_000,
  })
  if (pack.code !== 0) throw new Error(`git archive failed: ${pack.stderr.slice(0, 300)}`)
  const unpack = await capture(["tar", "-xf", zip], { cwd: into, timeoutMs: 300_000 })
  if (unpack.code !== 0) throw new Error(`snapshot extract failed: ${unpack.stderr.slice(0, 300)}`)
}

/** Corpus seeds: committed under fixtures/seed/, materialized into the snapshot as runnable tests. */
async function seedCorpus(snapshot: string) {
  const seedDir = path.resolve(import.meta.dirname, "../perf/token-reasoning/fixtures/seed")
  const runDir = path.join(snapshot, "perf/token-reasoning/fixtures/run")
  await mkdir(runDir, { recursive: true })
  const seeds = await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: seedDir, onlyFiles: true }))
  for (const seed of seeds) {
    // `*.verify.ts` seeds arrive as failing `<name>.test.ts` files; everything else copies verbatim.
    const target = seed.endsWith(".verify.ts") ? `${seed.slice(0, -".verify.ts")}.test.ts` : seed
    await copyFile(path.join(seedDir, seed), path.join(runDir, target))
  }
}

async function exportSession(sessionID: string) {
  const exported = await capture(["opencode", "session", "export", sessionID], {
    cwd: process.cwd(),
    timeoutMs: 120_000,
  })
  if (exported.code !== 0) throw new Error(`session export failed: ${exported.stderr.slice(0, 300)}`)
  return exported.stdout
}

function sessionIdFrom(ndjson: string) {
  for (const line of ndjson.split("\n").reverse()) {
    if (!line.trim()) continue
    try {
      const event = JSON.parse(line) as { sessionID?: string }
      if (typeof event.sessionID === "string") return event.sessionID
    } catch {
      // Non-JSON trailing output is expected from some providers' banners.
    }
  }
  return undefined
}

function resolvedVariant(exportJson: string) {
  try {
    const parsed = JSON.parse(exportJson) as { messages?: Array<{ type?: string; model?: { variant?: string } }> }
    const assistants = (parsed.messages ?? []).filter((message) => message.type === "assistant")
    const last = assistants.at(-1)
    return last?.model?.variant ?? null
  } catch {
    return null
  }
}

type Capture = { code: number | null; stdout: string; stderr: string; timedOut: boolean }

async function capture(cmd: string[], options: { cwd: string; timeoutMs: number }): Promise<Capture> {
  const proc = Bun.spawn(windowsLine(cmd), { cwd: options.cwd, stdout: "pipe", stderr: "pipe", stdin: "ignore" })
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    // The direct child is a cmd shim; the real work runs in its descendants, which keep the
    // stdout pipe open. Kill the whole tree or the capture never drains.
    if (process.platform === "win32") Bun.spawnSync(["taskkill", "/pid", String(proc.pid), "/t", "/f"])
    else proc.kill()
  }, options.timeoutMs)
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  clearTimeout(timer)
  return { code, stdout, stderr, timedOut }
}

/** Resolve through cmd so npm shims (opencode.cmd) and PATH resolution work on Windows. */
function windowsLine(cmd: string[]) {
  if (process.platform !== "win32") return cmd
  const line = cmd
    .map((part) => (/[\s"]/.test(part) ? `"${part.replaceAll('"', '\\"')}"` : part))
    .join(" ")
  return ["cmd", "/d", "/s", "/c", line]
}

function usage(problem: string): never {
  console.error(
    `${problem}\n\nUsage:\n` +
      `  bun script/benchmark-effort.ts <suite.json> --stage smoke --check --model-info <model.info.json> [--tasks tasks.json]\n` +
      `  bun script/benchmark-effort.ts <suite.json> --stage smoke --execute --approve-spend --model <provider/model> --out-dir <dir> [--tasks tasks.json] [--seed <src:dest> ...] [--timeout-mins 15]`,
  )
  process.exit(2)
}
