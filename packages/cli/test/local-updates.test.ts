import { expect, test } from "bun:test"
import { rm } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "./fixture/tmpdir"

const scriptRoot = path.resolve(import.meta.dir, "../../../script")

function runLocalScript(script: string, home: string, args: string[] = [], cwd?: string) {
  return Bun.spawnSync(
    ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(scriptRoot, script), ...args],
    { cwd, env: { ...process.env, USERPROFILE: home } },
  )
}

function git(cwd: string, args: string[]) {
  return Bun.spawnSync(["git", "-C", cwd, "-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", ...args])
}

async function writeBuildRecord(home: string, commit: string, version = "0.0.0-dev-20261029000000000") {
  await Bun.write(
    path.join(home, ".local/bin/opencode-build.json"),
    JSON.stringify({ version, channel: "dev", installedAt: "2026-10-29T00:00:00Z", source: { commit, dirty: false } }),
  )
}

test.skipIf(process.platform !== "win32")(
  "prune keeps the newest five archives and removes stale renames",
  async () => {
    await using root = await tmpdir()
    const home = path.join(root.path, "home")
    const bin = path.join(home, ".local/bin")
    const archiveRoot = path.join(home, ".local/share/opencode-fife-builds")
    for (let index = 0; index < 7; index++) {
      await Bun.write(
        path.join(archiveRoot, `1700000000000${String(index).padStart(4, "0")}`, "opencode.exe"),
        "archive",
      )
    }
    await Bun.write(path.join(bin, "opencode.exe.old-16000000000000000"), "held")

    const prune = runLocalScript("local-prune.ps1", home)
    expect(prune.exitCode).toBe(0)
    expect(prune.stdout.toString()).toContain("Removed 2 archive(s)")
    const archives = (
      await Array.fromAsync(new Bun.Glob("*").scan({ cwd: archiveRoot, onlyFiles: false }))
    ).sort()
    expect(archives).toEqual(["17000000000000002", "17000000000000003", "17000000000000004", "17000000000000005", "17000000000000006"])
    expect(await Array.fromAsync(new Bun.Glob("opencode.exe.old-*").scan({ cwd: bin }))).toHaveLength(0)

    const again = runLocalScript("local-prune.ps1", home)
    expect(again.exitCode).toBe(0)
    expect(again.stdout.toString()).toContain("within the keep-5 limit")
  },
)

test.skipIf(process.platform !== "win32")(
  "status compares the installed build with dev HEAD and reports a dirty tree",
  async () => {
    await using root = await tmpdir()
    const home = path.join(root.path, "home")
    const repo = path.join(root.path, "repo")
    expect(Bun.spawnSync(["git", "init", repo]).exitCode).toBe(0)
    await Bun.write(path.join(repo, "file.txt"), "one\n")
    expect(git(repo, ["add", "."]).exitCode).toBe(0)
    expect(git(repo, ["commit", "-m", "one"]).exitCode).toBe(0)

    const missing = runLocalScript("local-status.ps1", home, [], repo)
    expect(missing.exitCode).toBe(0)
    expect(missing.stdout.toString()).toContain("No installed build record")

    const head = Bun.spawnSync(["git", "-C", repo, "rev-parse", "HEAD"]).stdout.toString().trim()
    await writeBuildRecord(home, head)
    const current = runLocalScript("local-status.ps1", home, [], repo)
    expect(current.exitCode).toBe(0)
    expect(current.stdout.toString()).toContain("Up to date")

    await Bun.write(path.join(repo, "file.txt"), "two\n")
    expect(git(repo, ["add", "."]).exitCode).toBe(0)
    expect(git(repo, ["commit", "-m", "two"]).exitCode).toBe(0)
    const behind = runLocalScript("local-status.ps1", home, [], repo)
    expect(behind.stdout.toString()).toContain("dev is 1 commit(s) ahead")

    await Bun.write(path.join(repo, "scratch.txt"), "uncommitted\n")
    const dirty = runLocalScript("local-status.ps1", home, [], repo)
    expect(dirty.stdout.toString()).toContain("uncommitted change(s)")
  },
)

test.skipIf(process.platform !== "win32")(
  "list shows the installed build and each archive, flagging missing records",
  async () => {
    await using root = await tmpdir()
    const home = path.join(root.path, "home")
    const archiveRoot = path.join(home, ".local/share/opencode-fife-builds")
    await writeBuildRecord(home, "a".repeat(40))
    await Bun.write(path.join(archiveRoot, "17000000000000001", "opencode-build.json"), JSON.stringify({ version: "0.0.0-dev-20261028000000000", source: { commit: "b".repeat(40) } }))
    await Bun.write(path.join(archiveRoot, "17000000000000002", "opencode.exe"), "x".repeat(2048))

    const list = runLocalScript("local-list.ps1", home)
    expect(list.exitCode).toBe(0)
    const output = list.stdout.toString()
    expect(output).toContain("Installed: 0.0.0-dev-20261029000000000")
    expect(output).toContain("17000000000000001  0.0.0-dev-20261028000000000")
    expect(output).toContain("17000000000000002  no build record")
    expect(output).toContain("0 MB")
  },
)

test.skipIf(process.platform !== "win32")(
  "rollback restores an archived build, keeps an undo rename, and syncs the record",
  async () => {
    await using root = await tmpdir()
    const home = path.join(root.path, "home")
    const bin = path.join(home, ".local/bin")
    const archiveRoot = path.join(home, ".local/share/opencode-fife-builds")
    const standIn = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "cmd.exe")
    await Bun.write(path.join(bin, "opencode.exe"), Bun.file(standIn))
    await writeBuildRecord(home, "c".repeat(40), "0.0.0-dev-20261029000000000")
    const archive = path.join(archiveRoot, "17000000000000001")
    await Bun.write(path.join(archive, "opencode.exe"), Bun.file(standIn))
    await Bun.write(
      path.join(archive, "opencode-build.json"),
      JSON.stringify({ version: "0.0.0-dev-20261028000000000", channel: "dev", source: { commit: "b".repeat(40), dirty: false } }),
    )
    await Bun.write(path.join(archive, "opentui-fake.dll"), "renderer")

    const rollback = runLocalScript("local-rollback.ps1", home)
    expect(rollback.exitCode).toBe(0)
    const record = await Bun.file(path.join(bin, "opencode-build.json")).json()
    expect(record.version).toBe("0.0.0-dev-20261028000000000")
    expect(await Bun.file(path.join(bin, "opentui-fake.dll")).exists()).toBe(true)
    const renames = await Array.fromAsync(new Bun.Glob("opencode.exe.old-*").scan({ cwd: bin }))
    expect(renames).toHaveLength(1)
    expect(await Bun.file(path.join(archive, "opencode.exe")).exists()).toBe(true)

    const selected = runLocalScript("local-rollback.ps1", home, ["-Build", "17000000000000001"])
    expect(selected.exitCode).toBe(0)
    const invalid = runLocalScript("local-rollback.ps1", home, ["-Build", "17000000000000002"])
    expect(invalid.exitCode).not.toBe(0)
    expect(invalid.stderr.toString()).toContain("No archived build named")

    await rm(path.join(archive, "opencode-build.json"))
    await Bun.write(path.join(bin, "opencode-build.json"), "stale")
    const noRecord = runLocalScript("local-rollback.ps1", home)
    expect(noRecord.exitCode).toBe(0)
    expect(noRecord.stdout.toString()).toContain("predates build manifests")
    expect(await Bun.file(path.join(bin, "opencode-build.json")).exists()).toBe(false)
  },
)
