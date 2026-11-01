"""Watch-word discrimination ratios: AI corpus vs human corpora.

    python evals/word_ratios.py

Counts the canonical watch list (evals/watch_words.py — the same list and
matcher the human sweeps use) in our AI-side corpus (evals/corpus + corpus2)
and compares per-100k rates against the human baselines frozen in
results/oanc-sweep.json and results/masc-sweep.json. Writes
results/word-ratios.json and prints a summary table.

A word missing from a baseline JSON is reported as "unmeasured", never as a
zero — treating unmeasured as zero manufactured a false discovery in the
first pass of this study (audit finding 7).
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from watch_words import WATCH_WORDS, count_hits


def main():
    root = Path(__file__).parent
    ai_texts = []
    for d in ("corpus", "corpus2"):
        for f in sorted((root / d).glob("*.md")):
            ai_texts.append(f.read_text(encoding="utf-8"))
    ai_words = sum(len(t.split()) for t in ai_texts)

    oanc = json.loads((root / "results" / "oanc-sweep.json")
                      .read_text(encoding="utf-8"))
    masc = json.loads((root / "results" / "masc-sweep.json")
                      .read_text(encoding="utf-8"))
    baselines = {"oanc": oanc, "masc": masc}
    human_words = oanc["words_total"] + masc["words_total"]

    rows = {}
    for w in WATCH_WORDS:
        ai_hits = sum(count_hits(w, t.lower()) for t in ai_texts)
        ai_rate = round(ai_hits / ai_words * 100000, 2)
        h_hits = h_words = 0
        unmeasured = []
        for name, b in baselines.items():
            entry = b["watch_words"].get(w)
            if entry is None:
                unmeasured.append(name)
                continue
            h_hits += entry["hits"]
            h_words += b["words_total"]
        if unmeasured:
            rows[w] = {"ai_per_100k": ai_rate, "ai_hits": ai_hits,
                       "status": f"unmeasured in {','.join(unmeasured)}"}
            continue
        h_rate = h_hits / h_words * 100000
        ratio = round(ai_rate / h_rate, 1) if h_rate > 0 else None
        rows[w] = {"ai_per_100k": ai_rate, "ai_hits": ai_hits,
                   "human_per_100k": round(h_rate, 3),
                   "human_hits": h_hits,
                   "ratio": ratio if ratio is not None else "n/a (zero human hits)"}

    result = {
        "ai_files": len(ai_texts), "ai_words": ai_words,
        "human_words": human_words,
        "matcher": "regex word boundary (\\b), shared with the human sweeps",
        "words": rows,
    }
    out = root / "results" / "word-ratios.json"
    out.write_text(json.dumps(result, indent=1), encoding="utf-8")

    print(f"AI: {len(ai_texts)} files, {ai_words} words; "
          f"human: {human_words:,} words")
    print(f"{'word':<14}{'AI/100k':>9}{'human/100k':>12}{'ratio':>10}")
    def sort_key(item):
        r = item[1].get("ratio")
        return -(r if isinstance(r, float) else -1)
    for w, v in sorted(rows.items(), key=sort_key):
        r = v.get("ratio", v.get("status", ""))
        print(f"{w:<14}{v['ai_per_100k']:>9}"
              f"{v.get('human_per_100k', ''):>12}{str(r):>10}")


if __name__ == "__main__":
    main()
