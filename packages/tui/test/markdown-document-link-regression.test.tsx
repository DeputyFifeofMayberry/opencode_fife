import { afterEach, expect, test } from "bun:test"
import { SyntaxStyle } from "@opentui/core"
import { testRender, useRenderer } from "@opentui/solid"
import { linkifyDocumentPaths } from "../src/util/document-path"
import { waitForHighlightedFrame } from "./fixture/frame"

const renderers: {
  renderer: Awaited<ReturnType<typeof testRender>>["renderer"]
  syntaxStyle: SyntaxStyle
}[] = []

afterEach(async () => {
  await Promise.all(
    renderers.splice(0).map(async (output) => {
      output.renderer.destroy()
      await output.renderer.closed
      output.syntaxStyle.destroy()
    }),
  )
})

async function render(content: string) {
  const output = await testRender(
    () => {
      const renderer = useRenderer()
      const syntaxStyle = SyntaxStyle.fromStyles({ default: { fg: "#ffffff" } }, renderer.nativeScene)
      renderers.push({ renderer, syntaxStyle })
      return <markdown syntaxStyle={syntaxStyle} content={content} conceal internalBlockMode="top-level" />
    },
    { width: 80, height: 12, remote: true },
  )
  output.renderer.start()
  return await waitForHighlightedFrame(output, (value) => value.includes("details"))
}

test("renders a document path once when terminal hyperlinks are unavailable", async () => {
  const content = linkifyDocumentPaths("see docs/plan.md for details", {
    cwd: "Y:/CodingProjects/opencode_fife",
    exists: () => true,
  })
  const frame = await render(content)

  expect(frame).toContain("see docs/plan.md for details")
  expect(frame).not.toContain("file:///")
})

test("still shows a web URL when terminal hyperlinks are unavailable", async () => {
  const frame = await render("see [the docs](https://example.com/docs) for details")

  expect(frame).toContain("https://example.com/docs")
})
