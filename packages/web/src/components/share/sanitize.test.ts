import { JSDOM } from "jsdom"
import { afterAll, beforeAll, expect, test } from "bun:test"
import { renderMarkdown } from "./sanitize"

const dom = new JSDOM()

beforeAll(() => {
  // DOMPurify resolves a window at first use; bun tests inject a jsdom window
  // the same way session-ui's harness registers a happy-dom one.
  const scope = globalThis as unknown as Record<string, unknown>
  scope.window = dom.window
  scope.HTMLAnchorElement = dom.window.HTMLAnchorElement
})

afterAll(() => {
  const scope = globalThis as unknown as Record<string, unknown>
  delete scope.window
  delete scope.HTMLAnchorElement
  dom.window.close()
})

test("renders benign markdown to non-empty sanitized html", async () => {
  const html = await renderMarkdown("# Hello\n\nWorld")

  // A missing DOM would silently return ""; this guards the harness itself.
  expect(html.length).toBeGreaterThan(0)
  expect(html).toContain("<h1>Hello</h1>")
  expect(html).toContain("<p>World</p>")
})

test("strips raw script tags and their content", async () => {
  const html = await renderMarkdown('<script>alert(1)</script>\n\nsafe text')

  expect(html).not.toContain("<script")
  expect(html).not.toContain("alert")
  expect(html).toContain("safe text")
})

test("strips event handlers from raw img tags", async () => {
  const html = await renderMarkdown('<img src="https://example.com/x.png" onerror="alert(1)">')

  expect(html).toContain('src="https://example.com/x.png"')
  expect(html).not.toContain("onerror")
})

test("escapes double quotes in link titles so attributes cannot break out", async () => {
  const html = await renderMarkdown('[x](https://example.com (" onmouseover="alert(1)))')

  expect(html).not.toContain('onmouseover="')
  expect(html).toContain("&quot;")
})

test("drops javascript and data URLs from links", async () => {
  const html = await renderMarkdown(
    "[bad](javascript:alert(1))\n\n[data](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)",
  )

  expect(html).not.toContain("javascript:")
  expect(html).not.toContain("data:")
  expect(html).toContain('<a target="_blank" rel="noopener noreferrer">bad</a>')
})

test("keeps shiki-highlighted code blocks intact", async () => {
  const html = await renderMarkdown("```ts\nconst x = 1\n```")

  expect(html).toContain('<pre class="shiki')
  expect(html).toContain("color:#")
  expect(html).toContain("</code></pre>")
})

test("preserves target and rel on markdown links", async () => {
  const html = await renderMarkdown("[docs](https://example.com)")

  expect(html).toContain('href="https://example.com"')
  expect(html).toContain('target="_blank"')
  expect(html).toContain('rel="noopener noreferrer"')
})

test("adds noopener noreferrer to raw anchors targeting _blank", async () => {
  const html = await renderMarkdown('<a href="https://example.com" target="_blank">raw</a>')

  expect(html).toContain('rel="noopener noreferrer"')
})
