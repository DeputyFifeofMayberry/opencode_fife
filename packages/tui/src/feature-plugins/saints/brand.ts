import { RGBA } from "@opentui/core"

export const THEME_NAME = "new-orleans-saints"

// Brand colors, not semantic tokens: these effects render only while the
// Saints theme is selected and exist to paint its identity, so they carry no
// role in any other theme and have no honest token to borrow.
export const brand = {
  dark: {
    gold: RGBA.fromHex("#d3bc8d"),
    goldBright: RGBA.fromHex("#f5e6bd"),
    purple: RGBA.fromHex("#a78bd6"),
    green: RGBA.fromHex("#4fa96b"),
    kraft: RGBA.fromHex("#b59b6d"),
    kraftDim: RGBA.fromHex("#8a7351"),
    dirge: RGBA.fromHex("#6f5f8f"),
    dirgeDim: RGBA.fromHex("#453a5e"),
  },
  light: {
    gold: RGBA.fromHex("#7a5e14"),
    goldBright: RGBA.fromHex("#a8842e"),
    purple: RGBA.fromHex("#5b3e91"),
    green: RGBA.fromHex("#1f7a46"),
    kraft: RGBA.fromHex("#7d6636"),
    kraftDim: RGBA.fromHex("#a08a5c"),
    dirge: RGBA.fromHex("#6a5495"),
    dirgeDim: RGBA.fromHex("#9a8cc0"),
  },
}
export type BrandPalette = (typeof brand)[keyof typeof brand]

export const beadOrder = ["purple", "green", "gold"] as const
