import { expect, test } from "bun:test"
import path from "node:path"
import { windowsOpenTui } from "../script/windows-opentui"
import { tmpdir } from "./fixture/tmpdir"

test.skipIf(process.platform !== "win32")(
  "compiled OpenTUI survives unavailable Bun extraction through build and install",
  async () => {
    await using root = await tmpdir()
    const native = await windowsOpenTui(process.arch)
    const name = `@opencode/cli-windows-${process.arch}`
    const artifact = path.join(root.path, "node_modules", name)
    const executable = path.join(artifact, "bin", "opencode.exe")
    const entry = path.join(root.path, "smoke.ts")
    await Bun.write(
      entry,
      `import file from ${JSON.stringify(Bun.resolveSync(`@opentui/core-win32-${process.arch}`, path.dirname(Bun.resolveSync("@opentui/core", import.meta.dir))))}
import { resolveRenderLib } from ${JSON.stringify(Bun.resolveSync("@opentui/core", import.meta.dir))}
resolveRenderLib()
console.log(file)`,
    )
    const result = await Bun.build({
      entrypoints: [entry],
      plugins: [native.plugin],
      format: "esm",
      minify: true,
      bytecode: true,
      splitting: true,
      compile: { outfile: executable, autoloadBunfig: false, autoloadDotenv: false },
    })
    expect(result.success).toBe(true)
    const env = { ...process.env, BUN_TMPDIR: path.join(root.path, "missing-temp") }
    const missing = Bun.spawnSync([executable], { env })
    expect(missing.exitCode).not.toBe(0)
    expect(missing.stderr.toString()).toContain("error code 126")
    const fallback = Bun.spawnSync([executable], { env: { ...process.env, BUN_TMPDIR: undefined } })
    expect(fallback.exitCode).toBe(0)
    expect(fallback.stdout.toString()).toContain("B:/~BUN/")
    await Bun.write(path.join(artifact, "bin", native.name), Bun.file(native.source))
    const sidecar = Bun.spawnSync([executable], { env })
    expect(sidecar.exitCode).toBe(0)
    expect(sidecar.stdout.toString().trim()).toBe(path.join(artifact, "bin", native.name))
    await Bun.write(path.join(artifact, "package.json"), JSON.stringify({ name, version: "0.0.0" }))
    const install = path.join(root.path, "install")
    await Bun.write(
      path.join(install, "package.json"),
      JSON.stringify({
        name: "@opencode/cli",
        bin: { opencode: "bin/opencode.exe" },
        optionalDependencies: { [name]: "0.0.0" },
      }),
    )
    await Bun.write(
      path.join(install, "postinstall.mjs"),
      Bun.file(path.join(import.meta.dir, "../script/postinstall.mjs")),
    )
    const postinstall = Bun.spawnSync(["node", path.join(install, "postinstall.mjs")], { env })
    expect(postinstall.stderr.toString()).toBe("")
    expect(postinstall.exitCode).toBe(0)
    const installed = Bun.spawnSync([path.join(install, "bin", "opencode.exe")], { env })
    expect(installed.exitCode).toBe(0)
    expect(installed.stdout.toString().trim()).toBe(path.join(install, "bin", native.name))
    const git = Bun.spawnSync(["git", "--exec-path"]).stdout.toString().trim()
    const home = path.join(root.path, "shell-home")
    const shell = Bun.spawnSync(
      [
        path.resolve(git, "../../../bin/bash.exe"),
        path.resolve(import.meta.dir, "../../../install"),
        "--binary",
        executable,
        "--no-modify-path",
      ],
      { env: { ...env, HOME: home, SHELL: "/bin/bash", GITHUB_ACTIONS: undefined } },
    )
    expect(shell.stderr.toString()).toBe("")
    expect(shell.exitCode).toBe(0)
    const shellInstalled = Bun.spawnSync([path.join(home, ".opencode", "bin", "opencode.exe")], { env })
    expect(shellInstalled.exitCode).toBe(0)
    expect(shellInstalled.stdout.toString().trim()).toBe(path.join(home, ".opencode", "bin", native.name))
    const local = path.join(root.path, "local repo")
    const localHome = path.join(root.path, "local home")
    const localBin = path.join(local, "packages/cli/dist/cli-windows-x64/bin")
    await Bun.write(path.join(localBin, "opencode.exe"), Bun.file(executable))
    await Bun.write(path.join(localBin, native.name), Bun.file(native.source))
    await Bun.write(path.join(localHome, ".local/bin/opencode.exe"), Bun.file(executable))
    const installer = path.resolve(import.meta.dir, "../../../script/install-local.ps1")
    const localInstall = Bun.spawnSync(
      [
        "powershell.exe",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `function bun { $global:LASTEXITCODE = 0 }; & '${installer.replaceAll("'", "''")}'`,
      ],
      { cwd: local, env: { ...env, USERPROFILE: localHome } },
    )
    expect(localInstall.stderr.toString()).toBe("")
    expect(localInstall.exitCode).toBe(0)
    const localInstalled = Bun.spawnSync([path.join(localHome, ".local/bin/opencode.exe")], { env })
    expect(localInstalled.exitCode).toBe(0)
    expect(localInstalled.stdout.toString().trim()).toBe(path.join(localHome, ".local/bin", native.name))
  },
)
