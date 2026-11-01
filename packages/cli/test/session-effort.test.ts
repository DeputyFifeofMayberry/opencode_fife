import { expect, test } from "bun:test"
import path from "node:path"
import { OPENCODE_VERSION } from "../src/version"

const status = {
  mode: "adaptive", agent: "build", support: "supported", control: "automatic",
  model: { providerID: "test", id: "model" }, selectedVariant: "max", baseLevel: "standard",
  currentLevel: "deep", initialized: true, verificationCommands: ["bun run check"], cleanPasses: 1,
  cleanPassesNeeded: 2, openFailure: "bun run check", next: { rule: "escalated", level: "deep", effort: "max" },
}

test("session effort displays the selected state and the next policy decision", async () => {
  using server = Bun.serve({ port: 0, fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === "/api/info") return Response.json({ version: OPENCODE_VERSION, pid: process.pid, urls: [], paths: { tmp: "/tmp" } })
    if (url.pathname === "/api/session/ses_example/effort") return Response.json({ data: status })
    return new Response("Not found", { status: 404 })
  } })
  const run = async (format: string) => {
    const child = Bun.spawn([process.execPath, "run", "src/index.ts", "session", "effort", "ses_example", "--format", format, "--server", server.url.href], {
      cwd: path.join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe",
    })
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    expect({ stderr, code }).toEqual({ stderr: "", code: 0 })
    return stdout
  }
  expect(JSON.parse(await run("json"))).toEqual(status)
  const text = await run("text")
  expect(text).toContain("Mode: adaptive")
  expect(text).toContain("Selected variant: max (automatic)")
  expect(text).toContain("Next decision: escalated, level deep, variant max")
  expect(text).toContain("Clean passes: 1/2")
}, 15_000)
