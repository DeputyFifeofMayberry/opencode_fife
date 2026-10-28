import { spawn } from "node:child_process"
import { realpath } from "node:fs/promises"
import path from "node:path"
import type { Options } from "./options.ts"
import type { Runtime } from "./state.ts"
import { inside } from "./state.ts"

export async function check(state: Runtime, configuration: NonNullable<Options["check"]>): Promise<string> {
  const [executable, ...args] = configuration.command
  const cwd = path.resolve(state.root, configuration.cwd)
  if (!inside(state.root, cwd)) return "Focused check unavailable: cwd must be inside this project."
  if (!executable || !/^bun(?:\.exe)?$/i.test(path.basename(executable))) {
    return "Focused check unavailable: configure a local Bun executable, not a shell or .cmd shim."
  }
  const directory = await realpath(cwd).catch(() => undefined)
  if (!directory || !inside(state.canonicalRoot, directory))
    return "Focused check unavailable: cwd must resolve inside this project."
  if (state.controller.signal.aborted) return "Focused check cancelled."
  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      cwd: directory,
      windowsHide: true,
      shell: false,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    })
    const output = { stdout: "", stderr: "", stopped: "" }
    const stop = (reason: string) => {
      if (output.stopped) return
      output.stopped = reason
      if (child.pid && process.platform === "win32") {
        const kill = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        })
        kill.on("error", () => child.kill())
      } else if (child.pid) {
        try {
          process.kill(-child.pid, "SIGKILL")
        } catch {
          child.kill("SIGKILL")
        }
      } else child.kill()
    }
    const abort = () => stop("cancelled")
    const timer = setTimeout(() => stop("timed out"), configuration.timeoutMs ?? 15_000)
    state.controller.signal.addEventListener("abort", abort, { once: true })
    if (state.controller.signal.aborted) abort()
    const finish = (message: string) => {
      clearTimeout(timer)
      state.controller.signal.removeEventListener("abort", abort)
      resolve(message)
    }
    child.stdout.on("data", (chunk) => {
      output.stdout = (output.stdout + String(chunk)).slice(0, 4000)
    })
    child.stderr.on("data", (chunk) => {
      output.stderr = (output.stderr + String(chunk)).slice(0, 4000)
    })
    child.once("error", (error) => finish(`Focused check unavailable: ${error.message}`))
    child.once("close", (code) =>
      finish(
        `Focused check ${output.stopped || (code === 0 ? "passed" : `failed (exit ${code})`)}.\n${output.stdout}\n${output.stderr}`.slice(
          0,
          2000,
        ),
      ),
    )
  })
}
