import { describe, expect, test } from "bun:test"
import { fileDiffRecord } from "./file-diff.js"

describe("fileDiffRecord", () => {
  test("decodes the canonical FileDiff.Info payload", () => {
    expect(
      fileDiffRecord({ file: "a.ts", patch: "diff", additions: 1, deletions: 0, status: "modified", more: true }),
    ).toEqual({
      path: "a.ts",
      status: "modified",
      type: "update",
      patch: "diff",
      additions: 1,
      deletions: 0,
    })
  })

  test.each([
    { status: "added", type: "add" },
    { status: "deleted", type: "delete" },
    { status: "modified", type: "update" },
  ])("derives the coarse type from status %j", ({ status, type }) => {
    expect(fileDiffRecord({ file: "a.ts", status })).toMatchObject({ status, type })
  })

  test.each([
    { type: "add", status: "added" },
    { type: "delete", status: "deleted" },
    { type: "update", status: "modified" },
    { type: "move", status: "moved" },
  ])("derives the status from legacy type %j", ({ type, status }) => {
    expect(fileDiffRecord({ file: "a.ts", type })).toMatchObject({ type, status })
  })

  test("decodes the legacy route payload with a movePath", () => {
    expect(
      fileDiffRecord({ file: "a.ts", type: "update", patch: "diff", additions: 2, deletions: 1, movePath: "b.ts" }),
    ).toEqual({
      path: "a.ts",
      type: "update",
      status: "modified",
      patch: "diff",
      additions: 2,
      deletions: 1,
      movePath: "b.ts",
    })
  })

  test("decodes the mini move payload, keeping filePath as the move source", () => {
    expect(fileDiffRecord({ relativePath: "old.ts", filePath: "new.ts", type: "move" })).toEqual({
      path: "old.ts",
      filePath: "new.ts",
      status: "moved",
      type: "move",
    })
  })

  test("falls back through the path aliases", () => {
    expect(fileDiffRecord({ file: "", filePath: "c.ts" })?.path).toBe("c.ts")
    expect(fileDiffRecord({ relativePath: "b.ts" })?.path).toBe("b.ts")
  })

  test("raw status wins over legacy type", () => {
    expect(fileDiffRecord({ file: "a.ts", status: "added", type: "delete" })).toMatchObject({
      status: "added",
      type: "add",
    })
  })

  test("drops non-finite counts", () => {
    expect(fileDiffRecord({ file: "a.ts", additions: Number.NaN, deletions: Number.POSITIVE_INFINITY })).toEqual({
      path: "a.ts",
    })
  })

  test("keeps an empty patch", () => {
    expect(fileDiffRecord({ file: "a.ts", patch: "" })).toMatchObject({ patch: "" })
  })

  test("drops unrecognized type and status values", () => {
    expect(fileDiffRecord({ file: "a.ts", type: "rewrite" })).toEqual({ path: "a.ts" })
    expect(fileDiffRecord({ file: "a.ts", status: "rewritten", type: "update" })).toMatchObject({
      status: "modified",
      type: "update",
    })
  })

  test("rejects non-records and entries without a path", () => {
    expect(fileDiffRecord(null)).toBeUndefined()
    expect(fileDiffRecord(["a.ts"])).toBeUndefined()
    expect(fileDiffRecord({ status: "added" })).toBeUndefined()
    expect(fileDiffRecord({ file: "", relativePath: "", filePath: "" })).toBeUndefined()
  })
})
