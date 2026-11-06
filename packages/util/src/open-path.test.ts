import { afterAll, describe, expect, mock, test } from "bun:test"

let result: { exitCode: number | null } = { exitCode: 0 }
const calls: string[] = []

mock.module("open", () => ({
  default: async (path: string) => {
    calls.push(path)
    return result
  },
}))

const { openPath } = await import("./open.js")

afterAll(() => mock.restore())

describe("openPath", () => {
  test("rejects when the launcher reports a non-zero exit code", async () => {
    result = { exitCode: 1 }
    await expect(openPath("C:/missing/file.md")).rejects.toThrow(
      "Failed to open C:/missing/file.md (exit code 1)",
    )
    expect(calls).toEqual(["C:/missing/file.md"])
  })

  test("resolves when the launcher reports a zero exit code", async () => {
    result = { exitCode: 0 }
    await expect(openPath("C:/docs/file.md")).resolves.toMatchObject({ exitCode: 0 })
  })

  test("resolves when the exit code is unavailable", async () => {
    result = { exitCode: null }
    await expect(openPath("C:/docs/file.md")).resolves.toMatchObject({ exitCode: null })
  })
})
