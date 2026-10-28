// Run with Node and an installed CLI path; this creates private, disposable server instances.
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawn } = require("node:child_process")
const { randomBytes } = require("node:crypto")
const assert = require("node:assert/strict")

const binary = process.argv[2]
assert(binary && fs.existsSync(binary), "Pass an absolute installed OpenCode binary path")
assert(path.isAbsolute(binary), "The binary path must be absolute")
const source = path.resolve(__dirname, "../../../../.opencode/ecc/plugin")
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ecc-native-smoke-"))

async function run(enabled) {
  const root = path.join(scratch, enabled ? "enabled" : "disabled")
  const adapter = path.join(root, ".opencode/ecc/plugin")
  fs.mkdirSync(adapter, { recursive: true })
  // Copy only source files: no workspace node_modules or development junctions.
  for (const file of fs.readdirSync(source, { withFileTypes: true })) {
    if (file.isFile() && (file.name.endsWith(".ts") || file.name === "package.json")) {
      fs.copyFileSync(path.join(source, file.name), path.join(adapter, file.name))
    }
  }
  assert(!fs.existsSync(path.join(adapter, "node_modules")))
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ packageManager: "bun@1.4.4" }))
  fs.writeFileSync(path.join(root, ".opencode/package.json"), JSON.stringify({ version: "2.2.3" }))
  fs.writeFileSync(
    path.join(root, ".opencode/opencode.json"),
    JSON.stringify({
      plugins: [{ package: "./ecc/plugin", options: { enabled } }],
    }),
  )
  const password = randomBytes(32).toString("hex")
  const child = spawn(binary, ["serve", "--stdio", "--port", "0", "--log-level", "error"], {
    cwd: root,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      OPENCODE_PASSWORD: password,
      OPENCODE_DB: path.join(root, "test.db"),
      OPENCODE_DISABLE_MODELS_FETCH: "1",
      XDG_CONFIG_HOME: path.join(root, "config"),
      XDG_DATA_HOME: path.join(root, "data"),
      XDG_STATE_HOME: path.join(root, "state"),
      XDG_CACHE_HOME: path.join(root, "cache"),
    },
  })
  const exited = new Promise((resolve) => child.once("exit", resolve))
  let stderr = ""
  child.stderr.on("data", (chunk) => {
    stderr += chunk
  })
  try {
    const base = await new Promise((resolve, reject) => {
      let output = ""
      const timer = setTimeout(() => reject(new Error("Private server startup timed out")), 20_000)
      const fail = (error) => {
        clearTimeout(timer)
        reject(error)
      }
      child.once("error", fail)
      child.once("exit", (code) => fail(new Error(`Private server exited ${code}`)))
      child.stdout.on("data", (chunk) => {
        output += chunk
        for (const line of output.split(/\r?\n/)) {
          try {
            const info = JSON.parse(line)
            if (info.url) {
              clearTimeout(timer)
              resolve(info.url)
            }
          } catch {}
        }
      })
    })
    async function request(endpoint, body) {
      const url = new URL(endpoint, base)
      url.searchParams.set("location[directory]", root)
      const response = await fetch(url, {
        method: body ? "POST" : "GET",
        headers: {
          authorization: "Basic " + Buffer.from("opencode:" + password).toString("base64"),
          "content-type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20_000),
      })
      assert(response.ok, `${endpoint}: ${response.status} ${await response.clone().text()}`)
      return response.status === 204 ? undefined : response.json()
    }
    await request("/api/agent")
    const session = await request("/api/session", { location: { directory: root }, title: "ECC native smoke" })
    const marker = path.join(root, "environment.json")
    const escaped = marker.replaceAll("'", "''")
    const command =
      process.platform === "win32"
        ? `[System.IO.File]::WriteAllText('${escaped}',($env:ECC_PLUGIN+'|'+$env:PACKAGE_MANAGER+'|'+$env:ECC_VERSION))`
        : `printf '%s|%s|%s' "$ECC_PLUGIN" "$PACKAGE_MANAGER" "$ECC_VERSION" > '${escaped.replaceAll("''", "'\\''")}'`
    await request(`/api/session/${session.data.id}/shell`, { command })
    for (let attempt = 0; attempt < 100 && !fs.existsSync(marker); attempt++)
      await new Promise((resolve) => setTimeout(resolve, 20))
    const actual = fs.readFileSync(marker, "utf8")
    assert.equal(actual, enabled ? "true|bun|2.2.3" : "||")
    assert.equal(stderr.trim(), "", `Private server diagnostics: ${stderr}`)
    return { enabled, actual, realShellHookDispatch: true, copiedWithoutNodeModules: true }
  } finally {
    child.stdin.end()
    const stopped = await Promise.race([
      exited.then(() => true),
      new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), 5000)
        timer.unref()
      }),
    ])
    if (!stopped) {
      child.kill()
      await exited
    }
  }
}

;(async () => {
  const report = { checks: [await run(true), await run(false)], modelCalls: 0, sharedServiceRestarted: false, scratch }
  fs.writeFileSync(path.join(scratch, "report.json"), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
