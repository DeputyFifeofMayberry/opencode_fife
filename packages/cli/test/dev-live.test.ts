import { expect, test } from "bun:test"
import path from "node:path"
import { tmpdir } from "./fixture/tmpdir"

// A real child runs the wrapper; tiny command shims keep it away from live services.
test.skipIf(process.platform !== "win32")("dev:live forwards the directory and rejects a stopped service", async () => {
  await using root = await tmpdir()
  const output = path.join(root.path, "args.txt")
  const shim = path.join(root.path, "shim.ts")
  await Bun.write(
    shim,
    `import { writeFileSync } from "node:fs"
const args = process.argv.slice(2)
if (args[0] === "service") console.log(args[2] === "password" ? "fixture-password" : process.env.FIXTURE_SERVER)
else writeFileSync(process.env.FIXTURE_ARGS!, args.join(" "))`,
  )
  const build = await Bun.build({
    entrypoints: [shim],
    compile: { outfile: path.join(root.path, "bun.exe"), autoloadBunfig: false, autoloadDotenv: false },
  })
  expect(build.success).toBe(true)
  await Bun.write(path.join(root.path, "opencode.exe"), Bun.file(path.join(root.path, "bun.exe")))
  const wrapper = path.resolve(import.meta.dir, "../../../script/dev-live.ts")
  const env = {
    ...process.env,
    Path: undefined,
    PATH: root.path + path.delimiter + process.env.PATH,
    FIXTURE_SERVER: "http://127.0.0.1:12345",
    FIXTURE_ARGS: output,
  }
  for (const mode of [[], ["--vite"]]) {
    const result = Bun.spawnSync([process.execPath, wrapper, ...mode, "C:/fixture project", "--help"], { env })
    expect(result.stderr.toString()).toBe("")
    expect(result.exitCode).toBe(0)
    expect(await Bun.file(output).text()).toContain("C:/fixture project")
    expect(await Bun.file(output).text()).toContain("--server http://127.0.0.1:12345")
  }
  const stopped = Bun.spawnSync([process.execPath, wrapper], { env: { ...env, FIXTURE_SERVER: "stopped" } })
  expect(stopped.exitCode).toBe(1)
  expect(stopped.stderr.toString()).toContain("no running opencode service")
})
