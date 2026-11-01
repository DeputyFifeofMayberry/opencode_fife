"""Mechanical gate check: score a frozen metrics JSON against the gate.

    python evals/check_gate.py evals/results/v3.6.0-rewrites.json

Flags per file: sentence_len_cv < 0.44, para_word_cv < 0.40 (multi-paragraph
texts only), balanced_clause_share > 0.5, punchy_closers > 0, triads > 1.
Floors from results/oanc-sweep.md; closers and triads stay relative-only, so
they are reported without failing anything.
"""

import json
import sys
from pathlib import Path

SENT_FLOOR = 0.44
PARA_FLOOR = 0.40
BALANCED_CEIL = 0.5

REQUIRED = ("sentence_len_cv", "para_word_cv", "balanced_clause_share",
            "punchy_closers", "triads", "paragraphs")


def main():
    for arg in sys.argv[1:]:
        data = json.loads(Path(arg).read_text(encoding="utf-8"))
        print(f"== {arg}")
        failures = 0
        for p, m in sorted(data.items()):
            name = Path(p).name
            missing = [k for k in REQUIRED if k not in m]
            if missing:
                print(f"  {name}: MISSING {missing}")
                failures += 1
                continue
            flags = []
            if m["sentence_len_cv"] < SENT_FLOOR:
                flags.append("sent_cv")
            if m["paragraphs"] >= 2 and m["para_word_cv"] < PARA_FLOOR:
                flags.append("para_cv")
            if m["balanced_clause_share"] > BALANCED_CEIL:
                flags.append("balanced")
            if m["punchy_closers"] > 0:
                flags.append(f"punchy({m['punchy_closers']})")
            if m["triads"] > 1:
                flags.append(f"triads({m['triads']})")
            print(f"  {name}: sent_cv={m['sentence_len_cv']} "
                  f"para_cv={m['para_word_cv']} bal={m['balanced_clause_share']} "
                  f"punchy={m['punchy_closers']} triads={m['triads']}"
                  + (f" -> {', '.join(flags)}" if flags else " -> pass"))
            failures += bool([f for f in flags if not f.startswith(("punchy", "triads"))])
        print(f"  gate failures: {failures}")


if __name__ == "__main__":
    main()
