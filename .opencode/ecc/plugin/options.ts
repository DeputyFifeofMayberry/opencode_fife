import { Schema } from "effect"

const Profile = Schema.Literals(["minimal", "standard", "strict"])
const Options = Schema.Struct({
  enabled: Schema.optionalKey(Schema.Boolean),
  profile: Schema.optionalKey(Profile),
  disabledHooks: Schema.optionalKey(Schema.Array(Schema.String)),
  check: Schema.optionalKey(
    Schema.Struct({
      command: Schema.Array(Schema.String).check(Schema.isMinLength(1)),
      cwd: Schema.String,
      timeoutMs: Schema.optionalKey(Schema.Number.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(120_000))),
    }),
  ),
})

export function options(input: unknown) {
  const value = Schema.decodeUnknownSync(Options, { onExcessProperty: "error" })(input)
  const environment = process.env.ECC_HOOK_PROFILE
  const profile = value.profile ?? (environment === "minimal" || environment === "strict" ? environment : "standard")
  const disabled = new Set([
    ...(value.disabledHooks ?? []),
    ...(process.env.ECC_DISABLED_HOOKS ?? "").split(/[\s,]+/).filter(Boolean),
  ])
  const levels = { minimal: 0, standard: 1, strict: 2 }
  return {
    enabled: value.enabled === true,
    profile,
    disabled,
    check: value.check,
    allows: (id: string, level: keyof typeof levels = "standard") =>
      !disabled.has(id) && levels[profile] >= levels[level],
  }
}

export type Options = ReturnType<typeof options>
