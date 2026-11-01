"""Deterministic rhythm metrics for humanizer_fife evals.

Report-only: measures mechanical proxies for the rhythmic tells that issue #229
showed growing through a humanizer rewrite (uniform beat rate, aphoristic
closers, contraction uniformity). Never edits text.

Usage:
    python evals/rhythm_metrics.py FILE [FILE ...]     # human-readable
    python evals/rhythm_metrics.py --json FILE ...     # machine-readable
    python evals/rhythm_metrics.py evals/corpus/*.md   # a whole corpus

Stdlib only. Sentence/paragraph splitting is naive prose splitting; code blocks,
headings, list items and block quotes are excluded from sentence metrics because
the skill leaves them alone too.
"""

import argparse
import json
import re
import statistics
import sys
from pathlib import Path

SENT_END = re.compile(r"[.!?]+(?:\s+|$)")
ABBREV = re.compile(r"\b([a-ei]\.[a-z]|[a-z])\.(?=\s|$)")  # a.m., e.g., i.e. → don't split
CONTRACTION = re.compile(r"\b\w+(?:n't|'re|'ve|'ll|'m|'d)\b", re.IGNORECASE)
TRIAD = re.compile(r"\b[\w'-]+,\s+[\w'-]+,?\s+and\s+[\w'-]+", re.IGNORECASE)
FIRST_WORDS = re.compile(r"[A-Za-z']+")


FENCE_OPEN = re.compile(r"^ {0,3}(`{3,}|~{3,})")


def strip_fences(text):
    """Remove fenced code blocks (``` or ~~~) before any paragraph splitting,
    so blank lines inside a fence cannot leak code into prose metrics. The
    closing fence must repeat the opening delimiter's character, be at least
    as long, and stand alone (CommonMark), so a four-backtick block survives
    an inner ``` line. An unclosed fence removes the rest of the text,
    matching Markdown rendering."""
    out = []
    opener = None  # (fence character, length) of the open fence
    for line in text.splitlines():
        if opener is None:
            m = FENCE_OPEN.match(line)
            if m:
                opener = (m.group(1)[0], len(m.group(1)))
            else:
                out.append(line)
            continue
        fence_ch, fence_len = opener
        indented = line.lstrip(" ")
        leading = len(indented) - len(indented.lstrip(fence_ch))
        if (len(line) - len(indented)) <= 3 and leading >= fence_len \
                and not indented.lstrip(fence_ch).strip():
            opener = None
        # fence content lines are dropped whether or not this one closes it
    return "\n".join(out)


def prose_blocks(text):
    """(kind, content) for prose paragraphs only; kind is 'p' or 'h' (heading)."""
    blocks = []
    for raw in re.split(r"\n\s*\n", text):
        raw = raw.strip()
        if not raw:
            continue
        if raw.startswith("```"):
            continue
        lines = [ln for ln in raw.splitlines() if ln.strip()]
        if all(re.match(r"^(#{1,6}\s|>|[-*+]\s|\d+\.\s)", ln) for ln in lines):
            kind = "h"
            content = "\n".join(re.sub(r"^(#{1,6}\s|>\s?|[-*+]\s|\d+\.\s)", "", ln) for ln in lines)
        else:
            kind = "p"
            content = " ".join(ln for ln in lines)
        blocks.append((kind, content))
    return blocks


def sentences(block):
    out = []
    for part in SENT_END.split(block):
        part = part.strip()
        if part:
            out.append(part)
    return out


def anaphora_runs(sents, min_run=3):
    runs = 0
    streak = 1
    prev = None
    for s in sents:
        words = FIRST_WORDS.findall(s.lower())[:2]
        key = tuple(words) if words else None
        if key and key == prev:
            streak += 1
            if streak == min_run:
                runs += 1
        else:
            streak = 1
        prev = key
    return runs


def balanced_clauses(sents):
    """Share of comma-split sentences whose two halves are near-equal length."""
    total = split = 0
    for s in sents:
        halves = s.split(",", 1)
        if len(halves) == 2:
            n1, n2 = len(halves[0].split()), len(halves[1].split())
            if min(n1, n2) >= 4:
                total += 1
                if n2 and 0.75 <= n1 / n2 <= 1.33:
                    split += 1
    return split / total if total else 0.0


def measure(text):
    blocks = prose_blocks(strip_fences(text))
    paras = [b for k, b in blocks if k == "p"]
    heads = [b for k, b in blocks if k == "h"]

    sents = [s for p in paras for s in sentences(p)]
    counts = [len(s.split()) for s in sents]
    p_words = [len(p.split()) for p in paras]
    p_sents = [len(sentences(p)) for p in paras]

    # Aphoristic-closer proxy: a section-final prose paragraph that "tightens" —
    # its last sentence is much shorter than the paragraph's average sentence,
    # i.e. the passage ends by snapping into a quotable line.
    closers = 0
    sections = 0
    for i, (kind, body) in enumerate(blocks):
        if kind != "p":
            continue
        nxt = blocks[i + 1] if i + 1 < len(blocks) else (None, None)
        if nxt[0] == "h" or nxt[0] is None:
            sections += 1
            s = sentences(ABBREV.sub(r"\1", body))
            if len(s) >= 2:
                prior = [len(x.split()) for x in s[:-1]]
                avg_prior = sum(prior) / len(prior)
                last = len(s[-1].split())
                if last <= 12 and avg_prior and last < 0.6 * avg_prior:
                    closers += 1

    one_liners = sum(1 for n in p_sents if n == 1)
    body = " ".join(paras)
    words = max(1, len(body.split()))
    contract_sents = sum(1 for s in sents if CONTRACTION.search(s))

    def cv(xs):
        if len(xs) < 2 or statistics.mean(xs) == 0:
            return 0.0
        return statistics.stdev(xs) / statistics.mean(xs)

    return {
        "words": words,
        "sentences": len(sents),
        "paragraphs": len(paras),
        "headings": len(heads),
        # Uniform beat rate proxies: LOWER coefficient of variation = more uniform = worse
        "sentence_len_cv": round(cv(counts), 3),
        "para_word_cv": round(cv(p_words), 3),
        "para_sent_cv": round(cv(p_sents), 3),
        # Aphoristic closer proxy
        "punchy_closers": closers,
        "sections": sections,
        "one_line_paragraphs": one_liners,
        # Contraction uniformity proxy: rate near 0 or near 1 across the text
        "contraction_rate": round(contract_sents / len(sents), 3) if sents else 0.0,
        # Other counted tells
        "triads": len(TRIAD.findall(body)),
        "anaphora_runs": anaphora_runs(sents),
        "balanced_clause_share": round(balanced_clauses(sents), 3),
        "colons": round(body.count(":") / words * 100, 2),
    }


def fmt(name, m):
    lines = [f"\n{name}  ({m['words']}w, {m['sentences']}s, {m['paragraphs']}p)"]
    rows = [
        ("sentence_len_cv", "sentence length CV (higher = more varied)"),
        ("para_word_cv", "paragraph word CV (higher = less metronomic)"),
        ("punchy_closers", f"punchy closers / {m['sections']} sections"),
        ("one_line_paragraphs", "one-line paragraphs"),
        ("contraction_rate", "sentence contraction rate"),
        ("triads", "X, Y, and Z triads"),
        ("anaphora_runs", "anaphora runs (3+)"),
        ("balanced_clause_share", "balanced-clause share"),
        ("colons", "colons per 100 words"),
    ]
    for key, label in rows:
        lines.append(f"  {label:44} {m[key]}")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    files = []
    for arg in args.files:
        p = Path(arg)
        if p.is_file():
            files.append(p)
        elif any(ch in arg for ch in "*?["):
            # expand wildcards ourselves: PowerShell and cmd do not expand
            # them for native commands, so the documented glob usage works here
            files.extend(sorted(Path().glob(arg)))
        else:
            print(f"skip (not a file): {arg}", file=sys.stderr)
    files = sorted(set(files))
    if not files:
        print("no input files matched; wildcards are expanded by this script, "
              "e.g. python evals/rhythm_metrics.py 'evals/corpus/*.md'",
              file=sys.stderr)
        sys.exit(2)
    results = {}
    for f in files:
        results[str(f)] = measure(f.read_text(encoding="utf-8"))

    if args.json:
        print(json.dumps(results, indent=2))
    else:
        for name, m in results.items():
            print(fmt(name, m))


if __name__ == "__main__":
    main()
