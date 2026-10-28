import { describe, expect, test } from "bun:test"

import { resolveRepo } from "./repo.ts"

describe("resolveRepo", () => {
  test("splits an owner/name value", () => {
    expect(resolveRepo("owner/name")).toEqual({ owner: "owner", name: "name" })
  })

  test("throws when the value is missing", () => {
    expect(() => resolveRepo(undefined)).toThrow(/owner\/name/)
  })

  test("throws when the value has no name part", () => {
    expect(() => resolveRepo("justowner")).toThrow(/owner\/name/)
  })
})
