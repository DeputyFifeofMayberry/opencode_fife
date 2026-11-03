import path from "node:path"

const EXTENSIONS = "md|mdx|ts|tsx|js|jsx|json|jsonc|css|txt|toml|yaml|yml"
const BARE = new RegExp(
  `(?<![\\w/@:-])(?:[A-Za-z]:[\\\\/]|/)?(?:[\\w.@-]+[\\\\/])+[\\w.@-]+\\.(?:${EXTENSIONS})`,
  "g",
)
const INLINE = /`([^`\n]+)`/g
// Fenced blocks, closed or running to the end of a response that is still streaming.
const FENCE = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$))/
// Existing markdown links are left exactly as written.
const MARKDOWN_LINK = /\[[^\]]*\]\([^)]*\)/g

type Options = {
  cwd: string
  exists: (path: string) => boolean
}

/** Absolute form of a candidate, with forward slashes so Windows and POSIX agree. */
function absolute(raw: string, cwd: string) {
  const value = raw.replace(/\\/g, "/")
  const rooted = value.startsWith("/") || /^[A-Za-z]:\//.test(value)
  return path.resolve(rooted ? value : path.join(cwd, value))
}

function href(resolved: string) {
  // Parentheses would otherwise close the markdown destination early.
  return "file:///" + encodeURI(resolved.replace(/\\/g, "/")).replace(/\(/g, "%28").replace(/\)/g, "%29")
}

function link(raw: string, options: Options) {
  const resolved = absolute(raw, options.cwd)
  if (!options.exists(resolved)) return undefined
  return { resolved, markdown: `[${raw}](${href(resolved)})` }
}

function rewrite(segment: string, options: Options) {
  const links: string[] = []
  const hold = (markdown: string) => {
    links.push(markdown)
    return `\u0000${links.length - 1}\u0000`
  }
  // Existing links and inline code are held first so the bare pass cannot re-match
  // inside them; a backticked path keeps its spaces.
  const held = segment
    .replace(MARKDOWN_LINK, hold)
    .replace(INLINE, (whole, inner: string) => {
      const target = link(inner.trim(), options)
      return target ? hold(target.markdown) : whole
    })
  const linked = held.replace(BARE, (raw) => link(raw, options)?.markdown ?? raw)
  return linked.replace(/\u0000(\d+)\u0000/g, (_, index: string) => links[Number(index)]!)
}

/** Rewrites existing file references in assistant markdown into clickable file links. */
export function linkifyDocumentPaths(content: string, options: Options) {
  return content
    .split(FENCE)
    .map((segment, index) => (index % 2 === 1 ? segment : rewrite(segment, options)))
    .join("")
}

function candidates(segment: string): string[] {
  const found: string[] = []
  for (const match of segment.matchAll(INLINE)) {
    const inner = match[1]?.trim()
    if (inner) found.push(inner)
  }
  for (const match of segment.matchAll(BARE)) found.push(match[0])
  return found
}

/** The most recently referenced document across messages, newest message first. */
export function lastDocumentPath(messages: readonly { text: string }[], options: Options) {
  for (const message of [...messages].reverse()) {
    const parts = message.text.split(FENCE)
    for (let index = parts.length - 1; index >= 0; index -= 1) {
      const segment = parts[index]
      if (index % 2 === 1 || !segment) continue
      for (const raw of candidates(segment).reverse()) {
        const target = link(raw, options)
        if (target) return target.resolved.replace(/\\/g, "/")
      }
    }
  }
  return undefined
}
