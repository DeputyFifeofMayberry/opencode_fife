import open from "open"

export function openUrl(input: string) {
  const url = URL.canParse(input) ? new URL(input) : undefined
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:"))
    return Promise.reject(new Error(`Only http and https links can be opened in the browser: ${input}`))
  return open(url.href)
}

export async function openPath(path: string) {
  const subprocess = await open(path)
  // The launcher resolves before the child exits on macOS and Linux, leaving exitCode null.
  // Windows resolves on child close, so a non-zero code is the only failure signal available.
  if (typeof subprocess.exitCode === "number" && subprocess.exitCode !== 0)
    throw new Error(`Failed to open ${path} (exit code ${subprocess.exitCode})`)
  return subprocess
}
