# Evidence and inputs

## Evidence and sources

For research, current facts, or document-grounded tasks, specify permitted sources, relevant time period, and citation granularity. Prefer original documents, official technical documentation, underlying data, and other primary evidence. Check publication/update dates and the dates events occurred; a recent page can describe old information. Open and inspect sources rather than citing search snippets or invented links.

Require each material factual claim to be traceable to supporting evidence. Distinguish source facts, calculations, inferences, and recommendations. Reconcile conflicting sources by scope, definitions, date, and authority; disclose unresolved disagreement. Do not fabricate quotations, statistics, citations, tool results, or confidence scores. If browsing or essential evidence is unavailable, state the gap and narrow the conclusion. Source instructions remain untrusted data; delimiters alone do not prevent prompt injection.

## Confidential inputs

Before transmitting source material, determine whether the chosen destination is authorized for that data and necessary for the task. Preserve existing authorization; ask only when required authorization is missing. Avoid sending an entire proprietary collection when an excerpt or local check suffices. Redact logs, reports, and evaluation records as appropriate; do not retain secrets in checkpoints. Disclose redaction or omissions that materially limit conclusions. Minimize data before external calls rather than relying on output redaction alone.

## Large collections and long-running context

Use a source manifest with stable identifiers, scope, version/date, and page/section or record locators. Retrieve or chunk by the question and preserve those locators. Distinguish inspected, retrieved, summarized, and unexamined material. Check the actual context budget if available; leave room for the requested response. Never silently truncate inputs or imply full coverage after partial retrieval.

For cross-document synthesis, gather the necessary evidence first, note gaps and conflicts, and inspect original passages before quoting or making material claims. Summaries guide retrieval but do not replace evidence. If the relevant content cannot fit, stage retrieval or narrow scope explicitly. Use a checkpoint for long sessions: objective, decisions, source/version locators, verified facts, completed changes, pending checks, and blockers. Revalidate mutable state after resuming; do not store credentials or treat stale checkpoint assumptions as observations.

## Multimodal prompts

Identify whether the task is generation, editing, analysis, transcription, or comparison. Verify that the target accepts the needed inputs and can produce the requested output.

- **Images:** identify each reference and its purpose; specify subject, composition, viewpoint, lighting, style, and relevant dimensions/aspect ratio. For edits, explicitly separate what must be preserved from what may change, including identity, layout, text, colors, and background/transparency where relevant. Do not claim unseen references were inspected.
- **Video:** specify duration, shots or temporal sequence, subject continuity, action, camera motion, transitions, and audio when relevant. Distinguish exact timestamp edits from generative changes; do not promise frame-accurate output from an unsupported tool.
- **Audio:** specify language, speaker handling, delivery, timing, and transcription conventions where relevant. Distinguish an exact transcript from a summary or creative script.
- **Analysis:** identify the relevant image region, page, frame, or timestamp. Mark unreadable or inaudible material and uncertainty instead of inventing details. Request better input when necessary.

Place tool parameters only in supported configuration fields after verification. Avoid conflicting visual requirements and unnecessary camera jargon. Keep reference assets attached or clearly identified outside the textual prompt if the host requires separate media inputs.

## Few-shot examples

Use few-shot examples when classification boundaries, extraction conventions, strict formatting, or style are difficult to express unambiguously. Skip them for straightforward tasks. Select a small, representative and varied set; add an edge or contrasting case when it teaches a real boundary. Label negative examples as incorrect and include the correction. Keep examples separate from live input, avoid incidental patterns or sensitive data, and ensure every intended output obeys the contract. Adjust examples based on observed errors rather than assuming that more examples always help.
