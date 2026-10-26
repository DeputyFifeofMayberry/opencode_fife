# Maintenance and inherited sources

Trigger a focused compatibility review when the target model/version, host, tool schema, supported message roles, or instruction hierarchy materially changes, or when a demonstrated failure reveals drift. Verify the relevant current official documentation; update affected instructions and rerun affected fixtures on the new target. Preserve the prior version and record the actual target, settings, changes, and results. Do not recheck every source on every routine prompt request. If compatibility cannot be checked, mark it unverified and omit unsupported specifics.

The source attachment records these links as verified on 2026-10-15; this revision retains their provenance and does not claim a new live documentation check. These sources inform specific practices; they do not endorse CRAFT or validate this skill's performance. Recheck only the relevant official guidance when platform-dependent behavior changes. Do not add vendor-specific recommendations to every prompt.

- [OpenAI prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering): instruction roles, separating context, and testing across model versions.
- [OpenAI skill authoring](https://learn.chatgpt.com/docs/build-skills): skill metadata, focused scope, progressive disclosure, and invocation tests.
- [OpenAI agent best practices](https://learn.chatgpt.com/guides/best-practices): relevant project context, constraints, and completion criteria.
- [OpenAI evaluation guidance](https://developers.openai.com/api/docs/guides/evaluation-best-practices): task-specific criteria, representative cases, and comparison across revisions. Use the evaluation principles without assuming a particular hosted evaluation service remains available.
- [OpenAI images and vision](https://developers.openai.com/api/docs/guides/images-vision): account for visual interpretation limits and input readability.
- [Anthropic prompting guidance](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices): clear instructions, relevant varied examples, and model-specific adaptation.
- [Google prompt design](https://ai.google.dev/gemini-api/docs/prompting-strategies): explicit constraints, examples, and iterative refinement.

The operational boundaries, recovery procedures, compact CRAFT format, and regression fixtures are task-specific design choices. They are not copied vendor standards or measured performance claims.
