import { RGBA, type OptimizedBuffer, type RenderContext, type TextOptions } from "@opentui/core"
import { extend, type JSX } from "@opentui/solid"
import { splitProps } from "solid-js"
import { MaskedTextRenderable } from "./masked-text"

type FadeTextOptions = TextOptions & {
  fade: RGBA
  duration?: number
}

const DEFAULT_DURATION = 2400

// The whole text breathes on a sine between its base foreground and the fade
// color, unlike ShimmerText's traveling highlight.
class FadeTextRenderable extends MaskedTextRenderable {
  private _fade = RGBA.defaultForeground()
  private _duration = DEFAULT_DURATION
  private elapsed = 0

  constructor(ctx: RenderContext, options: FadeTextOptions) {
    super(ctx, options)
    this.matrix[3] = this._fade.r
    this.matrix[7] = this._fade.g
    this.matrix[11] = this._fade.b
    this.matrix[15] = 1
    if (options.fade) this.fade = options.fade
    if (options.duration) this._duration = options.duration
    this.live = true
  }

  set fade(value: RGBA) {
    if (value.equals(this._fade)) return
    this._fade = value
    this.matrix[3] = value.r
    this.matrix[7] = value.g
    this.matrix[11] = value.b
    this.requestRender()
  }

  protected override renderSelf(buffer: OptimizedBuffer, deltaTime = 0) {
    if (!this.visible || this.isDestroyed || !Number.isFinite(this.width) || this.width <= 0 || this.height <= 0) return
    this.elapsed = (this.elapsed + deltaTime) % this._duration
    const level = 0.5 - 0.5 * Math.cos((2 * Math.PI * this.elapsed) / this._duration)
    this.renderMasked(buffer, 0, () => () => level)
  }
}

extend({ fade_text: FadeTextRenderable })

declare module "@opentui/solid" {
  interface OpenTUIComponents {
    fade_text: typeof FadeTextRenderable
  }
}

type Props = Omit<JSX.IntrinsicElements["text"], "ref"> & { fade: RGBA; duration?: number }

export function FadeText(props: Props) {
  const [local, text] = splitProps(props, ["fade", "duration"])
  return <fade_text {...text} fade={local.fade} duration={local.duration} />
}
