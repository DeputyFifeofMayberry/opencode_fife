import "./host-runtime"
import { expect, test, spyOn } from "bun:test"
import { writeFile, mkdir, readFile } from "node:fs/promises"
import path from "node:path"
import { Model } from "@opencode/schema/model"
import { call, fixture } from "./fixture"
import { tmpdir } from "../fixture/tmpdir"

const plugin = (await import("../../../../.opencode/ecc/plugin/index")).default

function compact(id: string) {
  return {
    sessionID: call(id, {}).sessionID,
    agent: call(id, {}).agent,
    model: Model.Ref.parse("test/model"),
    system: [{ type: "text" as const, text: "Original system" }],
    messages: [],
    options: {},
    tools: {},
    result: { summary: "Existing summary" },
  }
}

test("shell dispatch preserves overrides and detects Bun without changing process environment", async () => {
  await using dir = await tmpdir()
  await writeFile(path.join(dir.path, "package.json"), '{"packageManager":"bun@1.4.4"}')
  await using app = await fixture(plugin, dir.path)
  const env = { CLAUDE_PLUGIN_ROOT: "chosen", USER_VALUE: "keep" } as Record<string, string>
  const previous = process.env.PROJECT_ROOT
  await app.shell.emit("create.before", { command: "echo test", cwd: dir.path, shell: "pwsh", timeout: 1000, env })
  expect(env).toMatchObject({
    CLAUDE_PLUGIN_ROOT: "chosen",
    USER_VALUE: "keep",
    PACKAGE_MANAGER: "bun",
    PROJECT_ROOT: dir.path,
    ECC_PLUGIN: "true",
  })
  expect(process.env.PROJECT_ROOT).toBe(previous)
})

test("successful writes add advisory content while preserving output and session isolation", async () => {
  await using dir = await tmpdir()
  const target = path.join(dir.path, "example.ts")
  await writeFile(target, 'console.log("debug")')
  await using app = await fixture(plugin, dir.path)
  const event = {
    ...call("ses_one", { path: target }),
    status: "completed" as const,
    result: { output: { operation: "write", target, resource: "example.ts", existed: false } },
  }
  await app.tool.emit("execute.before", event)
  await app.tool.emit("execute.after", event)
  expect(event.result.output).toMatchObject({ existed: false })
  expect((event.result as { content?: string }).content).toContain("console.log")
  const one = compact("ses_one")
  await app.session.emit("compaction", one)
  await app.session.emit("compaction", one)
  expect(one.system.filter((part) => part.text.startsWith("# ECC"))).toHaveLength(1)
  expect(one.system.at(-1)?.text).toContain('"example.ts" (added)')
  expect(one.result.summary).toBe("Existing summary")
  const other = compact("ses_other")
  await app.session.emit("compaction", other)
  expect(other.system.at(-1)?.text).not.toContain("example.ts")
})

test("failed calls are not tracked and patch moves retain both paths", async () => {
  await using dir = await tmpdir()
  await using app = await fixture(plugin, dir.path, { enabled: true, profile: "minimal" })
  const failed = {
    ...call("ses_patch", { path: "failed.ts" }),
    status: "error" as const,
    error: { message: "denied", _tag: "Tool.Error" },
  }
  await app.tool.emit("execute.before", failed)
  // Native Error constructors are tested by the existing tool suites; this event exercises the settled failure branch.
  await app.tool.emit("execute.after", failed as Parameters<typeof app.tool.emit<"execute.after">>[1])
  await app.tool.emit("execute.after", {
    ...call("ses_patch", { patchText: "native patch" }, "patch"),
    status: "completed",
    result: {
      output: {
        files: [{ file: "new.ts", status: "modified" }],
        applied: [{ type: "update", resource: "old.ts", target: path.join(dir.path, "new.ts") }],
      },
    },
  })
  const event = compact("ses_patch")
  await app.session.emit("compaction", event)
  expect(event.system.at(-1)?.text).toContain('"old.ts" (deleted)')
  expect(event.system.at(-1)?.text).toContain('"new.ts" (added)')
  expect(event.system.at(-1)?.text).not.toContain("failed.ts")
})

test("disabled checks suppress diagnostics without changing native tool results", async () => {
  await using dir = await tmpdir()
  await using app = await fixture(plugin, dir.path, {
    enabled: true,
    disabledHooks: ["post:edit:console-warn", "compaction:context"],
  })
  const event = {
    ...call("ses_disabled", {}),
    status: "completed" as const,
    result: {
      content: "original",
      output: { operation: "write", target: path.join(dir.path, "missing.ts"), resource: "missing.ts", existed: false },
    },
  }
  await app.tool.emit("execute.after", event)
  expect(event.result.content).toBe("original")
  const context = compact("ses_disabled")
  await app.session.emit("compaction", context)
  expect(context.system).toHaveLength(1)
})

test("missing files report unavailable rather than a clean audit", async () => {
  await using dir = await tmpdir()
  await using app = await fixture(plugin, dir.path)
  const event = {
    ...call("ses_missing", {}),
    status: "completed" as const,
    result: {
      content: "written",
      output: { operation: "write", target: path.join(dir.path, "missing.ts"), resource: "missing.ts", existed: false },
    },
  }
  await app.tool.emit("execute.after", event)
  expect(event.result.content).toContain("Check unavailable")
})

test("completion consumes native events once and deletion clears only its session", async () => {
  await using dir = await tmpdir()
  await using app = await fixture(plugin, dir.path, { enabled: true, profile: "minimal" })
  await app.subscriptionsReady()
  for (const id of ["ses_a", "ses_b"]) {
    await app.tool.emit("execute.after", {
      ...call(id, {}, "write"),
      status: "completed",
      result: {
        output: {
          operation: "write",
          target: path.join(dir.path, `${id}.txt`),
          resource: `${id}.txt`,
          existed: false,
        },
      },
    })
  }
  const logged = Promise.withResolvers<void>()
  using log = spyOn(console, "warn").mockImplementation(() => logged.resolve())
  const event = {
    id: "evt_ecc_a",
    created: Date.now(),
    type: "session.execution.succeeded",
    data: { sessionID: "ses_a" },
    durable: { aggregateID: "ses_a", seq: 1, version: 1 },
    location: { directory: dir.path },
  }
  await app.publish({ ...event, location: { directory: path.join(dir.path, "foreign") } })
  await app.publish(event)
  await logged.promise
  expect(log).toHaveBeenCalledTimes(1)
  await app.publish({
    ...event,
    id: "evt_ecc_deleted",
    type: "session.deleted",
    durable: { ...event.durable, version: 2, seq: 2 },
  })
  // A second terminal event gives an observable stream barrier after deletion.
  const barrier = Promise.withResolvers<void>()
  log.mockImplementation(() => barrier.resolve())
  await app.publish({
    ...event,
    id: "evt_ecc_b",
    data: { sessionID: "ses_b" },
    durable: { aggregateID: "ses_b", seq: 1, version: 1 },
  })
  await barrier.promise
  const a = compact("ses_a")
  const b = compact("ses_b")
  await app.session.emit("compaction", a)
  await app.session.emit("compaction", b)
  expect(a.system.at(-1)?.text).not.toContain("ses_a.txt")
  expect(b.system.at(-1)?.text).toContain("ses_b.txt")
})

test("optional focused check preserves literal Windows arguments and cwd", async () => {
  await using dir = await tmpdir()
  await mkdir(path.join(dir.path, "package"))
  const literal = "spaces & %NAME% !NAME!.ts"
  await using app = await fixture(plugin, dir.path, {
    enabled: true,
    profile: "strict",
    check: {
      command: [
        process.execPath,
        "-e",
        "console.log(JSON.stringify({args:process.argv.slice(1),cwd:process.cwd()}))",
        literal,
      ],
      cwd: "package",
    },
  })
  const target = path.join(dir.path, "safe.ts")
  await writeFile(target, "export const answer = 42")
  const event = {
    ...call("ses_check", {}),
    status: "completed" as const,
    result: {
      content: "original",
      output: { operation: "write", target, resource: "safe.ts", existed: false },
    },
  }
  await app.tool.emit("execute.after", event)
  expect(event.result.content).toContain("Focused check passed")
  expect(event.result.content).toContain(literal)
  expect(event.result.content).toContain("package")
})

test("two locations and a reload keep independent contexts and one warning per call", async () => {
  await using left = await tmpdir()
  await using right = await tmpdir()
  await writeFile(path.join(left.path, "bun.lock"), "")
  await writeFile(path.join(right.path, "package.json"), '{"packageManager":"pnpm@10.0.0"}')
  await using other = await fixture(plugin, right.path)
  const first = await fixture(plugin, left.path)
  await first.close()
  await using app = await fixture(plugin, left.path)
  for (const [instance, root, manager] of [
    [app, left.path, "bun"],
    [other, right.path, "pnpm"],
  ] as const) {
    const env: Record<string, string> = {}
    await instance.shell.emit("create.before", { command: "echo test", cwd: root, shell: "pwsh", timeout: 1000, env })
    expect(env.PROJECT_ROOT).toBe(root)
    expect(env.PACKAGE_MANAGER).toBe(manager)
  }
  const target = path.join(left.path, "only-left.ts")
  await writeFile(target, "console.log(42)")
  const event = {
    ...call("ses_shared", {}),
    status: "completed" as const,
    result: { content: "native", output: { operation: "write", target, resource: "only-left.ts", existed: false } },
  }
  await app.tool.emit("execute.after", event)
  await app.tool.emit("execute.after", event)
  expect(event.result.content.match(/\[ECC\]/g)).toHaveLength(1)
  const own = compact("ses_shared")
  const foreign = compact("ses_shared")
  await app.session.emit("compaction", own)
  await other.session.emit("compaction", foreign)
  expect(own.system.at(-1)?.text).toContain("only-left.ts")
  expect(foreign.system.at(-1)?.text).not.toContain("only-left.ts")
  expect(first.tool.size() + first.shell.size() + first.session.size()).toBe(0)
})

test("focused check failures and unsupported shims are visible", async () => {
  await using dir = await tmpdir()
  for (const [command, expected] of [
    [[process.execPath, "-e", "process.exit(7)"], "failed (exit 7)"],
    [["checker.cmd"], "not a shell or .cmd shim"],
  ] as const) {
    await using app = await fixture(plugin, dir.path, {
      enabled: true,
      profile: "strict",
      check: { command: [...command], cwd: "." },
    })
    const event = {
      ...call("ses_failure", {}),
      status: "completed" as const,
      result: {
        content: "native",
        output: { operation: "write", target: path.join(dir.path, "file.ts"), resource: "file.ts", existed: false },
      },
    }
    await app.tool.emit("execute.after", event)
    expect(event.result.content).toContain(expected)
  }
})

test("strict command reminders preserve native structured content and output", async () => {
  await using dir = await tmpdir()
  await using app = await fixture(plugin, dir.path, { enabled: true, profile: "strict" })
  const event = {
    ...call("ses_push", { command: "git push" }, "shell"),
    status: "completed" as const,
    result: { content: [{ type: "text" as const, text: "native output" }], output: { exitCode: 0 } },
  }
  await app.tool.emit("execute.before", event)
  await app.tool.emit("execute.after", event)
  expect(event.result.content[0]?.text).toBe("native output")
  expect(event.result.content[1]?.text).toContain("push authorization")
  expect(event.result.output).toEqual({ exitCode: 0 })
})

test("focused checks reject an external or unavailable working directory", async () => {
  await using dir = await tmpdir()
  for (const cwd of ["..", "missing-package"]) {
    await using app = await fixture(plugin, dir.path, {
      enabled: true,
      profile: "strict",
      check: { command: [process.execPath, "-e", "throw Error('must not run')"], cwd },
    })
    const event = {
      ...call("ses_cwd", {}),
      status: "completed" as const,
      result: {
        content: "native",
        output: { operation: "write", target: path.join(dir.path, "file.ts"), resource: "file.ts", existed: false },
      },
    }
    await app.tool.emit("execute.after", event)
    expect(event.result.content).toContain("Focused check unavailable: cwd must")
  }
})

for (const mode of ["timeout", "unload"] as const) {
  test(`focused check ${mode} terminates and joins its process tree`, async () => {
    await using dir = await tmpdir()
    const marker = path.join(dir.path, "pids.json")
    const script = `const {spawn}=require('node:child_process');const fs=require('node:fs');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync(process.argv[1],JSON.stringify([process.pid,child.pid]));setInterval(()=>{},1000)`
    const app = await fixture(plugin, dir.path, {
      enabled: true,
      profile: "strict",
      check: {
        command: [process.execPath, "-e", script, marker],
        cwd: ".",
        timeoutMs: mode === "timeout" ? 1000 : 10_000,
      },
    })
    const event = {
      ...call("ses_process", {}),
      status: "completed" as const,
      result: {
        content: "native",
        output: { operation: "write", target: path.join(dir.path, "file.ts"), resource: "file.ts", existed: false },
      },
    }
    const pending = app.tool.emit("execute.after", event)
    try {
      const deadline = Date.now() + 5000
      while (!(await Bun.file(marker).exists()) && Date.now() < deadline) await Bun.sleep(10)
      const pids = JSON.parse(await readFile(marker, "utf8")) as number[]
      if (mode === "unload") await app.close()
      await pending
      if (mode === "timeout") expect(event.result.content).toContain("timed out")
      else expect(event.result.content).toBe("native")
      for (const pid of pids) expect(() => process.kill(pid, 0)).toThrow()
    } finally {
      await app.close()
      await pending
    }
  })
}

test("terminal outcomes, shutdown, idle duplicates, and filesystem reconciliation use native envelopes", async () => {
  await using dir = await tmpdir()
  await using app = await fixture(plugin, dir.path, { enabled: true, profile: "minimal" })
  await app.subscriptionsReady()
  for (const id of ["ses_failed", "ses_user", "ses_shutdown", "ses_barrier"]) {
    await app.tool.emit("execute.after", {
      ...call(id, {}),
      status: "completed",
      result: {
        output: { operation: "write", target: path.join(dir.path, `${id}.txt`), resource: `${id}.txt`, existed: false },
      },
    })
  }
  const lines: string[] = []
  const flushed = Promise.withResolvers<void>()
  using log = spyOn(console, "warn").mockImplementation((message) => {
    lines.push(String(message))
    if (String(message).includes("ses_barrier")) flushed.resolve()
  })
  let seq = 0
  const publish = (type: string, sessionID: string, extra = {}) =>
    app.publish({
      id: `evt_${++seq}`,
      created: Date.now(),
      type,
      data: { sessionID, ...extra },
      location: { directory: dir.path },
      durable: { aggregateID: sessionID, seq, version: 1 },
    })
  await app.publish({
    id: "evt_unlink",
    created: Date.now(),
    type: "filesystem.changed",
    location: { directory: dir.path },
    data: { file: path.join(dir.path, "ses_failed.txt"), event: "unlink" },
  })
  await publish("session.execution.interrupted", "ses_shutdown", { reason: "shutdown" })
  await publish("session.execution.failed", "ses_failed", { error: { type: "test", message: "failed" } })
  await publish("session.execution.interrupted", "ses_user", { reason: "user" })
  await publish("session.execution.succeeded", "ses_failed")
  await app.publish({ id: "evt_idle", created: Date.now(), type: "session.idle", data: { sessionID: "ses_user" } })
  await publish("session.execution.succeeded", "ses_barrier")
  await flushed.promise
  expect(log).toHaveBeenCalledTimes(3)
  expect(lines.join("\n")).toContain("ses_failed failed")
  expect(lines.join("\n")).toContain("ses_user interrupted")
  expect(lines.join("\n")).not.toContain("ses_shutdown")
  const deleted = compact("ses_failed")
  const recoverable = compact("ses_shutdown")
  await app.session.emit("compaction", deleted)
  await app.session.emit("compaction", recoverable)
  expect(deleted.system.at(-1)?.text).toContain("(deleted)")
  expect(recoverable.system.at(-1)?.text).toContain("ses_shutdown.txt")
})
