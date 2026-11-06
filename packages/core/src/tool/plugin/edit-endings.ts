export const crlf = "\r\n"

export const normalizeForMatch = (value: string) =>
  value
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐‑‒–—―−]/g, "-")
    .replace(/[\u00A0\u2002-\u200A\u202F\u205F\u3000]/g, " ")

/** The dominant line ending in text, or fallback when there is none. */
export const lineEnding = (text: string, fallback: string) => {
  const crlfCount = text.split(crlf).length - 1
  const lfCount = text.split("\n").length - 1 - crlfCount
  if (crlfCount === lfCount) return fallback
  return crlfCount > lfCount ? crlf : "\n"
}

/**
 * Joins the replacement's lines with line endings taken from the matched source region. A replacement line that
 * keeps a region line (longest common subsequence, compared like the trailing-whitespace tier) reuses that line's
 * ending; a line that changes in place reuses the ending of the line it replaces; only lines beyond those take
 * `fallback`. Unchanged context inside a match therefore keeps its bytes even in a mixed-ending file.
 *
 * The caller passes the region's dominant ending as `fallback`, so a region whose line breaks are all identical
 * needs no alignment: every line takes that ending. A region with no line break has none to inherit, so every
 * line takes `fallback`. Only a mixed-ending region with a multi-line replacement reaches the alignment, and its
 * common prefix is matched one-to-one before the table is built.
 */
export const withRegionEndings = (region: string, replacement: string, fallback: string) => {
  if (!replacement.includes("\n")) return replacement
  const after = replacement.split("\n")
  const endings = [...region.matchAll(/\r?\n/g)].map((match) => match[0])
  if (endings.length === 0) return after.join(fallback)
  const ending = endings[0]!
  if (fallback === ending && endings.every((value) => value === ending)) return after.join(ending)
  const before = region.split(/\r?\n/)
  const key = (line: string) => normalizeForMatch(line.trimEnd())
  const beforeKeys = before.map(key)
  const afterKeys = after.map(key)
  // Only the prefix is trimmed: a common suffix can map a line to a later region line with a different ending.
  let prefix = 0
  while (prefix < beforeKeys.length && prefix < afterKeys.length && beforeKeys[prefix] === afterKeys[prefix]) prefix++
  const source =
    prefix === 0 ? alignLines(beforeKeys, afterKeys) : alignLines(beforeKeys.slice(prefix), afterKeys.slice(prefix))
  return after
    .map((line, index) => {
      if (index === after.length - 1) return line
      if (index < prefix) return line + (endings[index] ?? fallback)
      const aligned = source[index - prefix]
      return line + (aligned === undefined ? fallback : (endings[aligned + prefix] ?? fallback))
    })
    .join("")
}

/**
 * For each line of `after`, the index of the `before` line it keeps (longest common subsequence) or, between kept
 * lines, the line it takes the place of; undefined for lines with no counterpart.
 */
export const alignLines = (before: string[], after: string[]) => {
  const width = after.length + 1
  const table = new Uint32Array((before.length + 1) * width)
  for (let i = before.length - 1; i >= 0; i--)
    for (let j = after.length - 1; j >= 0; j--)
      table[i * width + j] =
        before[i] === after[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1])
  const result: (number | undefined)[] = []
  const gap = { before: [] as number[], after: [] as number[] }
  const flush = () => {
    gap.after.forEach((j, k) => (result[j] = gap.before[k]))
    gap.before = []
    gap.after = []
  }
  let i = 0
  let j = 0
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      flush()
      result[j++] = i++
      continue
    }
    if (table[(i + 1) * width + j] >= table[i * width + j + 1]) gap.before.push(i++)
    else gap.after.push(j++)
  }
  while (i < before.length) gap.before.push(i++)
  while (j < after.length) gap.after.push(j++)
  flush()
  return result
}
