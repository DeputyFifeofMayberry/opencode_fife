---
description: Analyze instincts and suggest or generate evolved structures
agent: build
---

# Evolve Command

Analyze and evolve instincts in continuous-learning-v2: $ARGUMENTS

## Your Task

Run from the repository root:

```powershell
python .opencode/skills/continuous-learning-v2/scripts/instinct-cli.py evolve $ARGUMENTS
```

On POSIX, use `python3` instead of `python`.

## Supported Args (v2.1)

- no args: analysis only
- `--generate`: also generate files under `evolved/{skills,commands,agents}`

## Behavior Notes

- Uses project + global instincts for analysis.
- Shows skill/command/agent candidates from trigger and domain clustering.
- Shows project -> global promotion candidates.
- State root resolution: absolute `CLV2_HOMUNCULUS_DIR` if set, otherwise absolute `XDG_DATA_HOME` plus `ecc-homunculus`, otherwise `~/.local/share/ecc-homunculus`.
- With `--generate`, output path is:
  - project context: `<state-root>/projects/<project-id>/evolved/`
  - global fallback: `<state-root>/evolved/`
