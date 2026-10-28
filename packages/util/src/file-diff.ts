import { isRecord } from "./record.js"

export type FileDiffStatus = "added" | "deleted" | "modified" | "moved"

export type FileDiffType = "add" | "delete" | "update" | "move"

/**
 * One decoded entry from an apply-patch / edit tool `files` metadata payload. Tool metadata is
 * untyped JSON in persisted sessions, so payloads exist in a canonical shape (`file` + `status`,
 * matching FileDiff.Info) and legacy shapes (`relativePath`/`filePath` path aliases, a coarse
 * `type`, `movePath`). Consumers apply their own acceptance policy on top of the decode.
 */
export type FileDiffRecord = {
  /** Display path: the `file`, `relativePath`, or `filePath` alias, in that order. */
  path: string
  /** Raw `filePath` field: the move source on moved entries, otherwise a path alias. */
  filePath?: string
  /** Normalized status: the raw `status` when recognized, else derived from legacy `type`. */
  status?: FileDiffStatus
  /** Normalized coarse type: the raw `type` when recognized, else derived from `status`. */
  type?: FileDiffType
  patch?: string
  additions?: number
  deletions?: number
  movePath?: string
}

const STATUS_BY_TYPE: Record<string, FileDiffStatus> = {
  add: "added",
  delete: "deleted",
  update: "modified",
  move: "moved",
}

const TYPE_BY_STATUS: Record<FileDiffStatus, FileDiffType> = {
  added: "add",
  deleted: "delete",
  modified: "update",
  moved: "move",
}

const recognizedStatus = (value: unknown): FileDiffStatus | undefined =>
  typeof value === "string" && value in TYPE_BY_STATUS ? (value as FileDiffStatus) : undefined

const recognizedType = (value: unknown): FileDiffType | undefined =>
  typeof value === "string" && value in STATUS_BY_TYPE ? (value as FileDiffType) : undefined

const finiteNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined

const text = (value: unknown) => (typeof value === "string" ? value : undefined)

export function fileDiffRecord(value: unknown): FileDiffRecord | undefined {
  if (!isRecord(value)) return undefined
  const path = text(value.file) || text(value.relativePath) || text(value.filePath)
  if (!path) return undefined
  const filePath = text(value.filePath)
  const legacyType = text(value.type)
  // One coherent status/type pair: raw status wins, legacy type fills the gaps, and the type is
  // derived from the effective status rather than trusted independently.
  const status = recognizedStatus(value.status) ?? (legacyType === undefined ? undefined : STATUS_BY_TYPE[legacyType])
  const type = status === undefined ? recognizedType(legacyType) : TYPE_BY_STATUS[status]
  const patch = text(value.patch)
  const additions = finiteNumber(value.additions)
  const deletions = finiteNumber(value.deletions)
  const movePath = text(value.movePath)
  return {
    path,
    ...(filePath ? { filePath } : {}),
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    ...(patch !== undefined ? { patch } : {}),
    ...(additions !== undefined ? { additions } : {}),
    ...(deletions !== undefined ? { deletions } : {}),
    ...(movePath !== undefined ? { movePath } : {}),
  }
}
