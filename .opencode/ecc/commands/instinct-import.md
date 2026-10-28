---
description: Import instincts from external sources
agent: build
---

# Instinct Import Command

Import instincts from a file or URL: $ARGUMENTS

## Your Task

Import instincts into the continuous-learning-v2 system. Run from the repository root:

```powershell
python .opencode/skills/continuous-learning-v2/scripts/instinct-cli.py import $ARGUMENTS
```

On POSIX, use `python3` instead of `python`.

## Import Sources

The CLI accepts a file path or an HTTP(S) URL. `@teammate/...` shorthand sources are not supported.

### File Import
```
/instinct-import path/to/instincts.md
```

### URL Import
```
/instinct-import https://example.com/instincts.md
```

### Preview Without Importing
```
/instinct-import path/to/instincts.md --dry-run
```

Use `--force` to skip the confirmation prompt and `--min-confidence` to filter entries.

## Import Format

Each instinct is a YAML-like frontmatter block between `---` markers, followed by body content. `id` is required; entries without one are dropped. Use `***` or `___` for horizontal rules inside bodies.

```markdown
---
id: instinct-123
trigger: "[situation description]"
confidence: 0.7
domain: coding
source: imported
---

Recommended action content.
```

Malformed `confidence` values fall back to `0.5`.

## Import Process

1. **Deduplicate the source** - keep the highest-confidence entry per ID
2. **Compare with the local store** - higher confidence updates an existing entry; equal or lower confidence is skipped
3. **Filter** - apply `--min-confidence` when given
4. **Confirm** - prompt before writing unless `--force`; `--dry-run` never writes

---

**TIP**: Review imported instincts with `/instinct-status` after import.
