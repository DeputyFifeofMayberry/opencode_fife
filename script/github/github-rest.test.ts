import { describe, expect, test } from "bun:test"

import { createGithubRest, listAllPages } from "./github-rest.ts"

function restWithPages<T>(pages: T[][]) {
  const requests: string[] = []
  const rest = {
    fetchPage: async (path: string) => {
      requests.push(path)
      const match = path.match(/[?&]page=(\d+)/)
      const page = match ? Number(match[1]) : 1
      return pages[page - 1] ?? []
    },
    requests,
  }
  return rest
}

describe("listAllPages", () => {
  test("collects items beyond the first page of 100", async () => {
    const page = (n: number) => Array.from({ length: n }, (_, i) => i)
    const rest = restWithPages([page(100), page(100), page(50)])

    const all = await listAllPages(rest.fetchPage, "/repos/o/n/issues")

    expect(all.length).toBe(250)
    expect(rest.requests).toHaveLength(3)
  })

  test("appends pagination parameters after an existing query string", async () => {
    const rest = restWithPages([[1]])

    await listAllPages(rest.fetchPage, "/repos/o/n/issues?labels=needs:compliance&state=open")

    expect(rest.requests[0]).toContain("?labels=needs:compliance&state=open&per_page=100&page=1")
  })
})

describe("createGithubRest", () => {
  test("sends authorization and API version headers", async () => {
    let seen: RequestInit | undefined
    const original = globalThis.fetch
    globalThis.fetch = (async (_input: string | URL, init?: RequestInit) => {
      seen = init
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }) as typeof fetch

    try {
      const rest = createGithubRest("token-123")
      await rest.json<{ ok: boolean }>("/repos/o/n/anything")

      const headers = seen?.headers as Record<string, string>
      expect(headers.Authorization).toBe("Bearer token-123")
      expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28")
    } finally {
      globalThis.fetch = original
    }
  })
})
