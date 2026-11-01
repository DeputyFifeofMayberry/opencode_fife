"""Forensic reconstruction of the true A/B keys for archived blind runs.

The original make_pairs.py wrote every key as {"A": old, "B": new} regardless
of the shuffle (audit finding 1), so committed keys cannot be trusted for any
run made before 2026-10-11. This script re-derives the true mapping by
matching each pair file's A/B sections against the candidate rewrite files.

    python evals/reconstruct_keys.py

Writes results/key-reconstruction.json and prints one line per pair.
"""

import json
import re
import sys
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REWRITE = ROOT / "evals" / "rewrite"

RUNS = [
    {
        "name": "run1-smoke",
        "pairs_dir": ROOT / "evals/blind/smoke-2026-10-10",
        "candidates": ("v310", "v330"),
    },
    {
        "name": "run2",
        "pairs_dir": ROOT / "evals/blind/run2-2026-10-10",
        "candidates": ("v310", "v330"),
    },
    {
        "name": "run3",
        "pairs_dir": ROOT / "evals/blind",
        "candidates": ("v310", "v360"),
    },
]


def norm(text):
    return re.sub(r"\s+", " ", text).strip()


def body(path):
    lines = path.read_text(encoding="utf-8").splitlines()
    if lines and lines[0].startswith("#"):
        lines = lines[1:]
    return norm("\n".join(lines))


def sections(pair_text):
    # split on the full "\n\n## B\n\n" sequence: a bare "\n\n## B" would also
    # cut a release-notes body at its own "## Breaking changes" heading
    a = pair_text.split("## A\n\n", 1)[1].split("\n\n## B\n\n", 1)[0]
    b = pair_text.split("\n\n## B\n\n", 1)[1]
    return norm(a), norm(b)


def main():
    result = {}
    for run in RUNS:
        versions = run["candidates"]
        cands = {}
        for v in versions:
            for f in REWRITE.glob(f"*_{v}.md"):
                cands[f.name] = body(f)
        for pair in sorted(run["pairs_dir"].glob("*-*.md")):
            text_raw = pair.read_text(encoding="utf-8")
            if not text_raw.startswith("# Pair"):
                continue  # skip JUDGMENTS files and anything that is not a pair
            name = pair.stem.rsplit("-", 1)[0]
            a_text, b_text = sections(text_raw)
            mapping = {}
            for label, text in (("A", a_text), ("B", b_text)):
                scored = sorted(
                    ((SequenceMatcher(None, text, body_text).ratio(), fname)
                     for fname, body_text in cands.items()),
                    reverse=True)
                if scored and scored[0][0] >= 0.999:
                    mapping[label] = scored[0][1]
                else:
                    best = f"{scored[0][1]}@{scored[0][0]:.3f}" if scored else "none"
                    mapping[label] = f"pre-edit (best match {best})"
            result.setdefault(run["name"], {})[name] = mapping
            print(f"{run['name']:12} {name:10} A={mapping['A']:22} B={mapping['B']}")

    out = ROOT / "evals" / "results" / "key-reconstruction.json"
    out.write_text(json.dumps(result, indent=1), encoding="utf-8")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
