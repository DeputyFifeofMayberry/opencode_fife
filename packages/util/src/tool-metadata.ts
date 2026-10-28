import { Option, Schema } from "effect"

// Tool input and metadata are open records shared by every tool. Each field decodes on its own,
// so a malformed value drops only that field.

const decodeQuestion = Schema.decodeUnknownOption(Schema.Struct({ question: Schema.String }))

const decodeAnswerItems = Schema.decodeUnknownOption(Schema.Array(Schema.Unknown))

const decodeAnswerItem = Schema.decodeUnknownOption(Schema.String)

const decodeDiagnostic = Schema.decodeUnknownOption(
  Schema.Struct({
    range: Schema.Struct({ start: Schema.Struct({ line: Schema.Finite, character: Schema.Finite }) }),
    message: Schema.String,
    severity: Schema.optional(Schema.Number),
  }),
)

export type ToolQuestion = { readonly question: string }

export type ToolAnswer = readonly string[]

export type ToolDiagnostic = {
  readonly range: { readonly start: { readonly line: number; readonly character: number } }
  readonly message: string
  readonly severity?: number
}

/** Decoded `question` tool inputs; malformed entries drop out instead of failing the tool part. */
export function toolQuestions(value: unknown): Array<ToolQuestion> {
  if (!Array.isArray(value)) return []
  return value.flatMap((question) => Option.toArray(decodeQuestion(question)))
}

/**
 * Decoded `answers` tool metadata, one slot per question so indices stay aligned. A malformed slot
 * decodes to no answer and non-string items drop out of a slot; `undefined` means the tool has not
 * answered yet.
 */
export function toolAnswers(value: unknown): ReadonlyArray<ToolAnswer> | undefined {
  if (!Array.isArray(value)) return undefined
  return value.map((answer) => Option.getOrElse(decodeAnswerItems(answer), (): ToolAnswer => []).flatMap((item) => Option.toArray(decodeAnswerItem(item))))
}

/** Error-level diagnostics (severity 1) for one file, capped at three like the surfaces render. */
export function toolDiagnostics(value: unknown, filePath: string | undefined): Array<ToolDiagnostic> {
  if (!filePath) return []
  const byFile = Schema.decodeUnknownOption(Schema.Record(Schema.String, Schema.Array(Schema.Unknown)))(value)
  if (Option.isNone(byFile)) return []
  return (byFile.value[filePath] ?? [])
    .flatMap((entry) => Option.toArray(decodeDiagnostic(entry)).filter((diagnostic) => diagnostic.severity === 1))
    .slice(0, 3)
}
