import { marked } from "marked"
import { codeToHtml } from "shiki"
import markedShiki from "marked-shiki"
import DOMPurify from "dompurify"

// A private instance keeps this pipeline separate from other DOMPurify users.
// Created on first use so bun tests can register a jsdom window beforehand.
let purifier: ReturnType<typeof DOMPurify> | undefined

// Mirrors the proven session-ui markdown config: default URI filtering drops
// javascript:/data: schemes, event-handler attributes are never allowed, and
// `target` is re-added because it sits outside the html profile.
const config = {
  USE_PROFILES: { html: true },
  SANITIZE_NAMED_PROPS: true,
  FORBID_TAGS: ["style"],
  FORBID_CONTENTS: ["style", "script"],
  ADD_ATTR: ["target"],
}

const markedWithShiki = marked.use(
  {
    renderer: {
      // Regular function so the override resolves `this.parser`.
      link(token) {
        // Labels go through the inline parser: raw `token.text` would print nested markdown
        // literally and bypass inline handling for HTML inside the label.
        const text = this.parser.parseInline(token.tokens)
        const titleAttr = token.title ? ` title="${escapeHtml(token.title)}"` : ""
        return `<a href="${escapeHtml(token.href)}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`
      },
    },
  },
  markedShiki({
    highlight(code, lang) {
      return codeToHtml(code, {
        lang: lang || "text",
        themes: {
          light: "github-light",
          dark: "github-dark",
        },
      })
    },
  }),
)

export async function renderMarkdown(markdown: string) {
  const active = currentPurifier()
  if (!active) {
    // Fail closed, but say why: silent content loss is hard to diagnose in production.
    if (import.meta.env?.DEV) console.warn("renderMarkdown skipped: DOMPurify unavailable")
    return ""
  }

  return active.sanitize(await markedWithShiki.parse(markdown), config)
}

function currentPurifier() {
  if (purifier) return purifier.isSupported ? purifier : undefined
  if (typeof window === "undefined") return undefined

  purifier = DOMPurify(window)
  if (!purifier.isSupported) return undefined

  purifier.addHook("afterSanitizeAttributes", (node) => {
    if (!(node instanceof HTMLAnchorElement)) return

    if (node.target !== "_blank") return

    const rel = new Set(node.getAttribute("rel")?.split(/\s+/).filter(Boolean))
    rel.add("noopener")
    rel.add("noreferrer")
    node.setAttribute("rel", Array.from(rel).join(" "))
  })

  return purifier
}

// Defense-in-depth under the sanitizer: the renderer interpolates attributes
// into a template string before DOMPurify sees them.
function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}
