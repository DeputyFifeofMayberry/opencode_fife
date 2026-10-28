---
description: Promote project instincts to global scope
agent: build
---

# Promote Command

Promote instincts in continuous-learning-v2: $ARGUMENTS

## Your Task

Run from the repository root:

```powershell
python .opencode/skills/continuous-learning-v2/scripts/instinct-cli.py promote $ARGUMENTS
```

On POSIX, use `python3` instead of `python`.

## Supported Args (v2.1)

- `instinct_id`: promote one specific instinct
- `--dry-run`: preview without promoting
- `--force`: skip the confirmation prompt
