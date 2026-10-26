import { Provider } from "@opencode/core/provider"
import { ProviderUsage } from "@opencode/core/provider-usage"
import { ProviderNotFoundError } from "@opencode/protocol/errors"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { Api } from "../api"
import { awaitPlugins, response } from "../location"

export const ProviderHandler = HttpApiBuilder.group(Api, "server.provider", (handlers) =>
  Effect.gen(function* () {
    return handlers
      .handle(
        "provider.list",
        Effect.fn(function* () {
          yield* awaitPlugins
          const providers = yield* Provider.Service
          return yield* response(providers.available())
        }),
      )
      .handle(
        "provider.get",
        Effect.fn(function* (ctx) {
          const providers = yield* Provider.Service
          const provider = yield* providers.get(ctx.params.providerID)
          if (!provider)
            return yield* new ProviderNotFoundError({
              providerID: ctx.params.providerID,
              message: `Provider not found: ${ctx.params.providerID}`,
            })
          return yield* response(Effect.succeed(provider))
        }),
      )
      .handle(
        "provider.usage",
        Effect.fn(function* (ctx) {
          return yield* response(
            ProviderUsage.snapshot(ctx.params.providerID).pipe(
              Effect.catchTag("ProviderUsage.ProviderNotFound", (error) =>
                new ProviderNotFoundError({
                  providerID: error.providerID,
                  message: error.message,
                }),
              ),
            ),
          )
        }),
      )
  }),
)
