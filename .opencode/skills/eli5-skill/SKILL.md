---
name: eli5
description: This skill should be used when the user says "/eli5", "eli5", "explain like I'm 5", "simplify", "too complex", "make it simpler", "ELI5", or asks for a plain-language explanation of code, errors, or concepts. Forces maximally simple, jargon-free output. When triggered without a specific topic, re-explain the previous response in simplified form.
metadata:
  shim: registration pointer only
  canonical-skill: "C:/Users/barne/.agents/skills/eli5/skills/eli5/SKILL.md"
  shimmed: "2026-10-22"
---

This file is a registration shim, not the skill. The `eli5` repo is a marketplace-style checkout whose `SKILL.md` sits one level deeper than the scanner looks, so this pointer file makes it discoverable.

Read `C:/Users/barne/.agents/skills/eli5/skills/eli5/SKILL.md` in full and follow it exactly. Always load the skill from that canonical path: its own relative references resolve against its directory, and a `git pull` there updates the skill without touching this shim.
