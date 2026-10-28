/**
 * Greedily wraps text to `width` characters: words join with single spaces, explicit newlines are
 * preserved, words longer than the width stay intact, and `width <= 0` throws RangeError.
 */
export function wrapText(text: string, width: number): string {
  throw new RangeError(`wrapText is not implemented: ${width}`)
}
