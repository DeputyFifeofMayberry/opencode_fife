export * as CostProvenance from "./cost-provenance.js"

import { Schema } from "effect"
import { Money } from "./money.js"
import { NonNegativeInt, optional } from "./schema.js"

/**
 * How settled costs were priced. A new record carries exactly one of `provider` or `estimated`, or counts as
 * `unpriced`; aggregates carry every origin they summed. Absent on records stored before provenance existed,
 * which stay unknown rather than being guessed. `provider` is endpoint-reported, not invoice-verified.
 */
export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  /** The endpoint reported this amount, including an authoritative zero. */
  provider: Money.USD.pipe(optional),
  /** Catalog rates priced this amount, including a matched zero rate. */
  estimated: Money.USD.pipe(optional),
  /** Records with neither a provider amount nor a matching catalog rate. */
  unpriced: NonNegativeInt.pipe(optional),
}).annotate({ identifier: "CostProvenance.Info" })
