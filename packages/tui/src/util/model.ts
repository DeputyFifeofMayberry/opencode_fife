export function parse(value: string) {
  const [providerID, ...modelID] = value.split("/")
  return { providerID, modelID: modelID.join("/") }
}

export function formatRef(model: { providerID: string; id: string; variant?: string }) {
  return [model.providerID, model.id, model.variant].filter((value) => value !== undefined).join("/")
}

/**
 * A same-model switch names the variant; the effort policy's writes (`source: "effort-policy"` metadata) say why
 * the effort moved. The unset pick is Auto, matching the variant picker.
 */
export function switchLabel(
  model: { providerID: string; id: string; variant?: string },
  models?: readonly { providerID: string; id: string; name: string }[],
  previous?: { providerID: string; id: string; variant?: string },
  metadata?: { source?: unknown; rule?: unknown },
) {
  if (previous?.providerID === model.providerID && previous.id === model.id) {
    const variant = model.variant ?? "Auto"
    const rule = metadata?.source === "effort-policy" && typeof metadata.rule === "string" ? metadata.rule : undefined

    if (rule === "escalated") return `Escalated to ${variant} · verification failed`
    if (rule === "mode-pin") return `Plan mode · ${variant} effort`
    if (rule === "step-down") return `Stepped down to ${variant} · verification stable`
    if (rule === "base") return `Effort policy set ${variant}`
    return `Switched variant to ${variant}`
  }
  const display = models?.find((item) => item.providerID === model.providerID && item.id === model.id)?.name
  if (display === undefined) return `Switched model to ${formatRef(model)}`
  const variant = model.variant && model.variant !== "default" ? ` (${model.variant})` : ""
  return `Switched model to ${display}${variant}`
}
