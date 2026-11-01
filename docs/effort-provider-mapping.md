# Offline effort-route coverage

The resolver regression test in `packages/core/test/model-resolver.test.ts` builds variants from the repository's bundled models.dev snapshot, resolves each model, and captures the actual outgoing JSON with an in-memory HTTP transport. No provider request is sent. Catalog entries, configured overrides, and provider behavior can change; this is not proof of the current remote endpoint or billing route.

| Provider and model | Low policy | Standard policy | Deep policy | Effort update transport |
| --- | --- | --- | --- | --- |
| `zai-coding-plan/glm-5.3-flash` and `glm-5.3` | low | provider default | max | Markers removed; top-level setting applies |
| `openrouter/z-ai/glm-5.3-flash` | low | provider default | max | Markers removed; top-level setting applies |
| `deepseek/deepseek-flash` and `deepseek-v4-pro` | low | provider default | max | Markers removed; top-level setting applies |
| `opencode/deepseek-v4.1-flash-free` | low | provider default | max | Markers removed; top-level setting applies |
| `opencode-go/kimi-k3.1-pro` | low | provider default | max | Markers removed; top-level setting applies |
| `opencode-go/deepseek-v4-pro` | high | provider default | max | Markers removed; top-level setting applies |
| `openai/gpt-6.1-sol` | low | provider default | max | Responses configuration update |
| `anthropic/claude-opus-5` | low | provider default | max | Messages output configuration update |

The snapshot declares `max` as the default for Kimi K3.1 Pro and both tested Z.ai coding-plan models. Standard and deep can therefore converge on those routes, subject to the actual endpoint and catalog in use. The snapshot gives OpenCode `big-pickle` no effort variants, so automatic effort leaves it untouched. OpenCode Go's DeepSeek V4 Pro advertises only high and max; the low policy selects high.

Tests cover explicit high picks, unavailable variants, default requests, actual serialized effort fields, and supported versus removed transition markers. A removed marker does not preserve a prefix by itself; cache behavior remains provider-dependent and requires live observation. The fixture uses the snapshot's listed protocol, not an independently verified live provider configuration.
