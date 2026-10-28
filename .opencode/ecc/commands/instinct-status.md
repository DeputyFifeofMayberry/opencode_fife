---
description: Show learned instincts (project + global) with confidence
agent: build
---

# Instinct Status Command

Show instinct status from continuous-learning-v2: $ARGUMENTS

## Your Task

Run from the repository root:

```powershell
python .opencode/skills/continuous-learning-v2/scripts/instinct-cli.py status
```

On POSIX, use `python3` instead of `python`.

## Behavior Notes

- Output includes both project-scoped and global instincts.
- Project instincts override global instincts when IDs conflict.
- Output is grouped by domain with confidence bars.
- This command does not support extra filters in v2.1.
- State root resolution: absolute `CLV2_HOMUNCULUS_DIR` if set, otherwise absolute `XDG_DATA_HOME` plus `ecc-homunculus`, otherwise `~/.local/share/ecc-homunculus`.
