// Shared GitHub REST/GraphQL client for the maintenance scripts. Ported from
// the request/retry logic in close-prs.ts so all scripts retry rate limits,
// secondary rate limits and transient 5xx the same way.

const apiBase = "https://api.github.com"
const perPage = 100

export async function resolveToken() {
  const envToken = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
  if (envToken) return envToken

  const proc = Bun.spawn(["gh", "auth", "token"], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited
  if (exitCode === 0 && stdout.trim()) return stdout.trim()

  throw new Error(
    `GitHub authentication is required. Set GITHUB_TOKEN/GH_TOKEN or run gh auth login.\n${stderr.trim()}`,
  )
}

// Collects every page of an endpoint that returns a JSON array. Stops after
// a short page, so callers see items beyond the first 100.
export async function listAllPages<T>(fetchPage: (path: string) => Promise<T[]>, path: string, perPage = 100) {
  const all: T[] = []
  for (let page = 1; ; page++) {
    const separator = path.includes("?") ? "&" : "?"
    const items = await fetchPage(`${path}${separator}per_page=${perPage}&page=${page}`)
    all.push(...items)
    if (items.length < perPage) return all
  }
}

export function createGithubRest(token: string) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  }

  async function request(path: string, init: RequestInit = {}, attempt = 0): Promise<Response> {
    const response = await fetch(path.startsWith("https://") ? path : `${apiBase}${path}`, {
      ...init,
      headers: {
        ...headers,
        ...init.headers,
      },
    })

    if (response.ok) return response

    const body = await response.text()
    const retryAfter = response.headers.get("retry-after")
    const reset = response.headers.get("x-ratelimit-reset")
    const retryMs = retryAfter
      ? Number(retryAfter) * 1000
      : response.headers.get("x-ratelimit-remaining") === "0" && reset
        ? Math.max(0, Number(reset) * 1000 - Date.now()) + 1_000
        : body.toLowerCase().includes("secondary rate limit")
          ? 300_000
          : response.status >= 500
            ? Math.min(300_000, 10_000 * 2 ** attempt)
            : 0

    if ((response.status === 403 || response.status === 429 || response.status >= 500) && retryMs > 0 && attempt < 10) {
      console.warn(`GitHub request failed; sleeping ${Math.ceil(retryMs / 1000)}s before retry ${attempt + 1}`)
      await sleep(retryMs)
      return request(path, init, attempt + 1)
    }

    throw new Error(`GitHub request failed: ${response.status} ${response.statusText}\n${body}`)
  }

  async function json<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await request(path, init)
    return (await response.json()) as T
  }

  // Collects every page of an endpoint that returns a JSON array.
  async function list<T>(path: string): Promise<T[]> {
    return listAllPages(json<T[]>, path, perPage)
  }

  async function graphql<T>(query: string, variables: Record<string, string | number | null>): Promise<T> {
    const response = await request("/graphql", {
      method: "POST",
      body: JSON.stringify({ query, variables }),
    })
    const body = (await response.json()) as { data?: T; errors?: Array<{ message: string }> }
    if (body.errors?.length) {
      throw new Error(`GitHub GraphQL error: ${body.errors.map((error) => error.message).join(", ")}`)
    }
    if (!body.data) throw new Error("GitHub GraphQL response did not include data")
    return body.data
  }

  return { request, json, list, graphql }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
