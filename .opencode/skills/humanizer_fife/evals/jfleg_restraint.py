"""Restraint calibration: how much do humans change when they edit for fluency?

JFLEG (Y:\\_refs\\jfleg, CC BY-NC-SA, keep external) pairs learner-English
sentences with 4 independent human fluency rewrites. We measure token-level
edit fraction (1 - SequenceMatcher ratio on word tokens) for every human edit,
then the same measure for our rewrites over the AI corpus. Task mismatch is a
standing caveat: fluency fixing is not de-AI-ing — this is a restraint
reference line, not a gold standard.

    python evals/jfleg_restraint.py [JFLEG_DIR]

Writes evals/results/jfleg-restraint.json and prints a summary.
"""

import json
import statistics
import sys
from difflib import SequenceMatcher
from pathlib import Path

PAIRS = {
    "email": "ai_email_vendor.md",
    "essay": "ai_essay_remote_work.md",
    "howto": "ai_howto_network.md",
    "marketing": "ai_marketing_saas.md",
    "review": "ai_review_grinder.md",
    "technical": "ai_technical_release.md",
}


def edit_fraction(a, b):
    ta, tb = a.split(), b.split()
    if not ta and not tb:
        return 0.0
    return round(1 - SequenceMatcher(None, ta, tb).ratio(), 4)


def dist(values):
    s = sorted(values)
    return {"n": len(s), "mean": round(statistics.mean(s), 4),
            "median": round(statistics.median(s), 4),
            "p90": round(s[int(0.9 * (len(s) - 1))], 4),
            "max": s[-1]}


def main():
    if "--selftest" in sys.argv:
        d = dist([1, 2, 3, 4])
        assert d["median"] == 2.5, f"even-sample median wrong: {d}"
        print("jfleg_restraint selftest: OK (even-sample median averages the middle pair)")
        return
    jfleg = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(r"Y:\_refs\jfleg")
    root = Path(__file__).parent
    human = {"dev": [], "test": []}
    for split in human:
        src = (jfleg / split / f"{split}.src").read_text(encoding="utf-8").splitlines()
        refs = [[l for l in (jfleg / split / f"{split}.ref{n}")
                 .read_text(encoding="utf-8").splitlines()] for n in range(4)]
        for i, s in enumerate(src):
            for n in range(4):
                human[split].append(edit_fraction(s, refs[n][i]))

    ours = {"v310": [], "v330": []}
    for name, corpus_file in PAIRS.items():
        src = (root / "corpus" / corpus_file).read_text(encoding="utf-8")
        for v in ours:
            rw = (root / "rewrite" / f"{name}_{v}.md").read_text(encoding="utf-8")
            body = "\n".join(rw.splitlines()[1:]).strip()
            ours[v].append(edit_fraction(src, body))

    result = {
        "human_edits": {k: dist(v) for k, v in human.items()},
        "human_edits_all": dist(human["dev"] + human["test"]),
        "our_rewrites": {k: dist(v) for k, v in ours.items()},
        "per_file_ours": {
            f"{name}_{v}": edit_fraction(
                (root / "corpus" / PAIRS[name]).read_text(encoding="utf-8"),
                "\n".join((root / "rewrite" / f"{name}_{v}.md")
                          .read_text(encoding="utf-8").splitlines()[1:]).strip())
            for name in PAIRS for v in ("v310", "v330")},
        "median_note": "statistics.median; even-sized samples average the two middle values",
        "caveat": "fluency fixing of learner text is not de-AI-ing; reference line only",
    }
    out = root / "results" / "jfleg-restraint.json"
    out.write_text(json.dumps(result, indent=1), encoding="utf-8")
    print(json.dumps(result, indent=1))


if __name__ == "__main__":
    main()
