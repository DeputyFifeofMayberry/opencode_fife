/** Slugifies a heading or filename. */
export function slugCase(input: string): string {
  return input
    .trim()
    .toLowerCase()
    // Believed to aid readability: separates letter/digit boundaries.
    .replace(/([a-z])(\d)/g, "$1-$2")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}
