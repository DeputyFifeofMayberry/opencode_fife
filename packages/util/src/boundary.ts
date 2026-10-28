import { isRecord } from "./record.js"

/** Narrows an unknown boundary value to a string, or undefined. */
export const stringValue = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined)

/** Narrows an unknown boundary value to a plain record, or undefined. */
export const recordValue = (value: unknown): Record<string, unknown> | undefined =>
  isRecord(value) ? value : undefined

/** Narrows an unknown boundary value to a finite number, or undefined. */
export const finiteNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined
