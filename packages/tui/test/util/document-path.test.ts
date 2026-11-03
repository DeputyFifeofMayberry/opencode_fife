import { expect, test } from "bun:test"
import { linkifyDocumentPaths, lastDocumentPath } from "../../src/util/document-path"

const cwd = "Y:/CodingProjects/opencode_fife"
const planAbsolute = "Y:/CodingProjects/opencode_fife/docs/plan.md"
const spacedAbsolute = "Y:/CodingProjects/opencode_fife/docs/my plan.md"
const parenAbsolute = "Y:/CodingProjects/opencode_fife/docs/report(1).md"

const normalize = (value: string) => value.replace(/\\/g, "/")
const exists = (value: string) =>
  [planAbsolute, spacedAbsolute, parenAbsolute].includes(normalize(value))
const options = { cwd, exists }

test("linkifies an existing relative path in prose", () => {
  expect(linkifyDocumentPaths("see docs/plan.md for details", options)).toBe(
    `see [docs/plan.md](file:///Y:/CodingProjects/opencode_fife/docs/plan.md) for details`,
  )
})

test("leaves a path that does not exist untouched", () => {
  expect(linkifyDocumentPaths("see docs/missing.md for details", options)).toBe("see docs/missing.md for details")
})

test("leaves a path inside a fenced code block untouched", () => {
  const content = ["```", "docs/plan.md", "```"].join("\n")
  expect(linkifyDocumentPaths(content, options)).toBe(content)
})

test("linkifies a path in inline code and drops the backticks", () => {
  expect(linkifyDocumentPaths("the `docs/plan.md` file", options)).toBe(
    `the [docs/plan.md](file:///Y:/CodingProjects/opencode_fife/docs/plan.md) file`,
  )
})

test("linkifies a path containing a space when it is in inline code", () => {
  expect(linkifyDocumentPaths("the `docs/my plan.md` file", options)).toBe(
    `the [docs/my plan.md](file:///Y:/CodingProjects/opencode_fife/docs/my%20plan.md) file`,
  )
})

test("linkifies a windows absolute path with forward slashes in the href", () => {
  expect(linkifyDocumentPaths("open Y:\\CodingProjects\\opencode_fife\\docs\\plan.md now", options)).toBe(
    `open [Y:\\CodingProjects\\opencode_fife\\docs\\plan.md](file:///Y:/CodingProjects/opencode_fife/docs/plan.md) now`,
  )
})

test("returns the last existing path across messages, newest first", () => {
  const messages = [
    { text: "first docs/plan.md" },
    { text: "nothing here" },
    { text: "second docs/plan.md" },
  ]
  expect(lastDocumentPath(messages, options)).toBe(planAbsolute)
})

test("returns undefined when no message references an existing path", () => {
  expect(lastDocumentPath([{ text: "docs/missing.md" }], options)).toBeUndefined()
})

test("leaves an existing markdown link alone", () => {
  const content = "see [the plan](docs/plan.md) now"
  expect(linkifyDocumentPaths(content, options)).toBe(content)
})

test("encodes a parenthesis in an inline-code path so the destination cannot break", () => {
  expect(linkifyDocumentPaths("see `docs/report(1).md`", options)).toBe(
    "see [docs/report(1).md](file:///Y:/CodingProjects/opencode_fife/docs/report%281%29.md)",
  )
})

test("leaves a path inside a tilde fence untouched", () => {
  const content = ["~~~", "docs/plan.md", "~~~"].join("\n")
  expect(linkifyDocumentPaths(content, options)).toBe(content)
})

test("leaves an unterminated fence's tail untouched", () => {
  const content = ["```", "docs/plan.md"].join("\n")
  expect(linkifyDocumentPaths(content, options)).toBe(content)
})
