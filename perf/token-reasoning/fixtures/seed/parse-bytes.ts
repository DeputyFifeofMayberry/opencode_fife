/**
 * Parses human-readable byte sizes ("512 B", "1 KB", "2 KiB", "1.5 MB") into whole bytes.
 * Units: B, KB (1000), MB (1000000), KiB (1024), MiB (1048576), case-insensitive, optional space.
 * Throws RangeError for malformed input, unsupported units, negative values, or non-integer bytes.
 */
export function parseBytes(input: string): number {
  throw new RangeError(`parseBytes is not implemented: ${input}`)
}
