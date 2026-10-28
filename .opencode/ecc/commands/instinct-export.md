---
description: Export instincts for sharing
agent: build
---

# Instinct Export Command

Export instincts for sharing with others: $ARGUMENTS

## Your Task

Export instincts from the continuous-learning-v2 system. Run from the repository root:

```powershell
python .opencode/skills/continuous-learning-v2/scripts/instinct-cli.py export $ARGUMENTS
```

On POSIX, use `python3` instead of `python`.

## Export Options

### Export All
```
/instinct-export
```

### Export High Confidence Only
```
/instinct-export --min-confidence 0.8
```

### Export by Domain
```
/instinct-export --domain coding
```

### Export to Specific Path
```
/instinct-export --output ./my-instincts.md
```

`--output` accepts a file path, not a directory; without it, output goes to stdout.

## Export Format

Output is Markdown text: comment headers followed by one frontmatter-plus-body block per instinct. There is no JSON envelope.

```markdown
# Instincts export
# Date: 2026-10-28T10:00:00
# Total: 25
# Project: example (proj_abc123)

---
id: instinct-123
trigger: "[situation description]"
confidence: 0.85
domain: coding
source: session-observation
---

Instinct body content.
```

Frontmatter keys, when present: `id`, `trigger`, `confidence`, `domain`, `source`, `scope`, `project_id`, `project_name`, `source_repo`.

## Empty Store

With no instincts, the CLI prints `No instincts to export.` and exits 1. When filters exclude everything, it prints `No instincts match the criteria.` and exits 1.

---

**TIP**: Export high-confidence instincts (>0.8) for better quality shares.
