"""Build blinded A/B pairs from evals/rewrite/ for judging.

    python evals/make_pairs.py --run run4 [--selftest]

Reads the (name, old-file, new-file) table below, shuffles A/B per pair with a
fresh random key, and writes evals/blind/<run>/<name>-<token>.md (no version
labels) plus evals/blind/<run>/key.json. Each run needs its own name, and an
existing run directory is never overwritten — a new judging run cannot
destroy the previous run's pair-to-version mapping (audit finding 10: two
runs shared one directory and one key.json, and the first run's mapping was
lost).

The key records the letters actually written to the pair file — `{"A": a,
"B": b}` — matching the shuffle. An earlier version recorded {"A": old,
"B": new} unconditionally, so every shuffled pair had a wrong key; the audit
that found this also reconstructed the true historical keys (see
results/key-reconstruction.json).
"""

import json
import random
import secrets
import sys
from pathlib import Path

ROOT = Path(__file__).parent
PAIRS = [
    ("essay", "essay_v310.md", "essay_v360.md"),
    ("howto", "howto_v310.md", "howto_v360.md"),
    ("email", "email_v310.md", "email_v360.md"),
    ("marketing", "marketing_v310.md", "marketing_v360.md"),
    ("review", "review_v310.md", "review_v360.md"),
    ("technical", "technical_v310.md", "technical_v360.md"),
]


def body(path):
    lines = path.read_text(encoding="utf-8").splitlines()
    if lines and lines[0].startswith("#"):
        lines = lines[1:]
    return "\n".join(lines).strip()


def write_pairs(out_dir, pairs, rng):
    """Write pair files + key for `pairs`; returns the key. `rng` supplies
    each pair's coin flip, so tests can force both shuffle outcomes."""
    out_dir.mkdir(parents=True, exist_ok=True)
    key = {}
    for name, old, new in pairs:
        a, b = (old, new) if rng() < 0.5 else (new, old)
        token = secrets.token_hex(4)
        (out_dir / f"{name}-{token}.md").write_text(
            f"# Pair {token}: which is the better piece of writing?\n\n"
            f"## A\n\n{body(ROOT / 'rewrite' / a)}\n\n## B\n\n{body(ROOT / 'rewrite' / b)}\n",
            encoding="utf-8",
        )
        key[f"{name}-{token}"] = {"A": a, "B": b}
    return key


def selftest():
    """Both shuffle outcomes must record the key that matches the file. Each
    outcome is forced and asserted separately, so a generator that ignored
    the shuffle (the original hardcoded-key bug) fails here."""
    tmp = ROOT / "blind" / "_selftest"
    for flip, expected_a in ((0.1, "essay_v310.md"), (0.9, "essay_v360.md")):
        if tmp.exists():
            for f in tmp.glob("*"):
                f.unlink()
        key = write_pairs(tmp, [("essay", "essay_v310.md", "essay_v360.md")],
                          lambda: flip)
        assert len(key) == 1, "expected one pair"
        entry = next(iter(key.values()))
        assert entry["A"] == expected_a, \
            f"forced flip {flip} must put {expected_a} in slot A, got {entry['A']}"
        pair_file = next(tmp.glob("essay-*.md"))
        text = pair_file.read_text(encoding="utf-8")
        a_text = text.split("## A\n\n")[1].split("\n\n## B")[0]
        b_text = text.split("## B\n\n")[1]
        assert a_text.strip() == body(ROOT / "rewrite" / entry["A"]), \
            f"key A {entry['A']} does not match file section A"
        assert b_text.strip() == body(ROOT / "rewrite" / entry["B"]), \
            f"key B {entry['B']} does not match file section B"
        assert {entry["A"], entry["B"]} == {"essay_v310.md", "essay_v360.md"}
    for f in tmp.glob("*"):
        f.unlink()
    tmp.rmdir()
    print("make_pairs selftest: OK (key matches file under both shuffles)")


def main():
    if "--selftest" in sys.argv:
        selftest()
        return
    args = dict(zip(sys.argv[1::2], sys.argv[2::2]))
    name = args.get("--run")
    if not name:
        print("usage: make_pairs.py --run NAME "
              "(writes evals/blind/NAME/, refuses to overwrite)")
        sys.exit(2)
    if "/" in name or "\\" in name or name in (".", ".."):
        print(f"error: --run must be a plain directory name, got {name!r}",
              file=sys.stderr)
        sys.exit(2)
    out = ROOT / "blind" / name
    if out.exists():
        print(f"error: run directory already exists: {out}", file=sys.stderr)
        sys.exit(1)
    key = write_pairs(out, PAIRS, random.random)
    (out / "key.json").write_text(json.dumps(key, indent=2), encoding="utf-8")
    print(json.dumps(key, indent=2))


if __name__ == "__main__":
    main()
