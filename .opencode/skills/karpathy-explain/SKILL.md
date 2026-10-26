---
name: karpathy-explain
description: "Explain code, architecture, bugs, PRs, logs, and technical docs in layered, evidence-backed form (30-second ELI5 → data flow → source-level deep dive); choose text, diagram, interactive HTML, or video. Use for onboarding, unfamiliar code, AI-generated code reviews, Karpathy-style/ELI5 explanations, or a natural-language polish of engineering explanations without losing evidence. Draw a diagram for 3+ related concepts, branching flows, 3+-way comparisons, hierarchies, or timelines. Not for answers clear in ~150 words, commands to copy and run, or plain code changes. 把技術內容分層解說，或在不刪證據下潤飾工程說明；簡短問答與純指令不用。"
license: MIT
compatibility: "Instruction-only. No API key, package, or network required. Optional: web access for URLs; local video tools only if a video is explicitly requested."
metadata:
  version: "1.6.0"
  inspired-by: "https://x.com/karpathy/status/2105819303471976479"
  shim: registration pointer only
  canonical-skill: "C:/Users/barne/.agents/skills/karpathy-explain-skill/skills/karpathy-explain/SKILL.md"
  shimmed: "2026-10-22"
---

This file is a registration shim, not the skill. The `karpathy-explain-skill` repo is a marketplace-style checkout whose `SKILL.md` sits one level deeper than the scanner looks, so this pointer file makes it discoverable.

Read `C:/Users/barne/.agents/skills/karpathy-explain-skill/skills/karpathy-explain/SKILL.md` in full and follow it exactly. Always load the skill from that canonical path: its `references/*.md` links resolve against its own directory, and a `git pull` there updates the skill without touching this shim.
