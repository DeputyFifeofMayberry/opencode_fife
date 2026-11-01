"""False-positive sweep of humanizer metrics over a large human-prose corpus.

Default corpus: OANC written genres at Y:\\_refs\\oanc (6,424 files, ~14M words,
pre-LLM American English). Run:

    python evals/oanc_sweep.py [CORPUS_DIR]

Writes evals/results/oanc-sweep.json and prints a summary. Document-level
metrics (CVs, balanced clauses) only apply to files with >= 200 words; all
files feed the watch-word rate counts. Paired with
results/human-prose-sweep.md (the 24-file pilot) and the gate floors in
evals/README.md.
"""

import json
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from rhythm_metrics import measure
from watch_words import WATCH_WORDS, count_hits

MIN_WORDS = 200

CV_FLOOR_SENT = 0.44
CV_FLOOR_PARA = 0.40
BALANCED_CEIL = 0.5


def quantiles(values):
    if not values:
        return {}
    s = sorted(values)

    def q(p):
        return round(s[min(len(s) - 1, int(p * len(s)))], 3)

    return {"min": q(0.0), "p5": q(0.05), "median": q(0.5), "p95": q(0.95),
            "max": q(1.0), "n": len(values)}


def main():
    corpus = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(r"Y:\_refs\oanc")
    if not corpus.is_dir():
        print(f"corpus directory not found: {corpus}; nothing written", file=sys.stderr)
        sys.exit(2)
    files = sorted(corpus.rglob("*.txt"))
    if not files:
        print(f"no .txt files under {corpus}; refusing to overwrite the "
              f"baseline with empty results", file=sys.stderr)
        sys.exit(2)
    per_metric = {k: [] for k in
                  ("sentence_len_cv", "para_word_cv", "contraction_rate",
                   "balanced_clause_share", "colons", "punchy_closers",
                   "triads", "anaphora_runs", "one_line_paragraphs")}
    # para_word_cv is undefined-ish on single-paragraph docs (CV of one value);
    # keep those out of its distribution and say how many were excluded.
    para_excluded = 0
    by_genre = {}
    below_floor = {"sentence_len_cv": 0, "para_word_cv": 0, "both": 0}
    over_balanced = 0
    closers = sections = triads = words = 0
    word_hits = {w: 0 for w in WATCH_WORDS}
    word_files = {w: 0 for w in WATCH_WORDS}
    n_docs = n_short = 0

    for i, f in enumerate(files):
        text = f.read_text(encoding="utf-8", errors="replace")
        low = text.lower()
        words += len(low.split())
        seen = set()
        for w in WATCH_WORDS:
            hits = count_hits(w, low)
            if hits:
                word_hits[w] += hits
                seen.add(w)
        for w in seen:
            word_files[w] += 1
        genre = "/".join(f.relative_to(corpus).parts[:2])
        m = measure(text)
        if m["words"] < MIN_WORDS:
            n_short += 1
            continue
        n_docs += 1
        if m["paragraphs"] < 2:
            para_excluded += 1
        for k in per_metric:
            if k != "para_word_cv" or m["paragraphs"] >= 2:
                per_metric[k].append(m[k])
        g = by_genre.setdefault(genre, {k: [] for k in per_metric})
        for k in per_metric:
            if k != "para_word_cv" or m["paragraphs"] >= 2:
                g[k].append(m[k])
        if m["sentence_len_cv"] < CV_FLOOR_SENT:
            below_floor["sentence_len_cv"] += 1
        if m["paragraphs"] >= 2 and m["para_word_cv"] < CV_FLOOR_PARA:
            below_floor["para_word_cv"] += 1
        if m["sentence_len_cv"] < CV_FLOOR_SENT and m["paragraphs"] >= 2 \
                and m["para_word_cv"] < CV_FLOOR_PARA:
            below_floor["both"] += 1
        if m["balanced_clause_share"] > BALANCED_CEIL:
            over_balanced += 1
        closers += m["punchy_closers"]
        sections += m["sections"]
        triads += m["triads"]
        if i % 1000 == 0:
            print(f"{i}/{len(files)}", file=sys.stderr)

    result = {
        "corpus": str(corpus),
        "files": len(files),
        "docs_over_min_words": n_docs,
        "skipped_short": n_short,
        "para_word_cv_excluded_single_para": para_excluded,
        "min_words": MIN_WORDS,
        "words_total": words,
        "distributions": {k: quantiles(v) for k, v in per_metric.items()},
        "per_genre": {g: {k: quantiles(v) for k, v in d.items()}
                      for g, d in sorted(by_genre.items())},
        "floors": {
            "sentence_len_cv_below": below_floor["sentence_len_cv"],
            "para_word_cv_below": below_floor["para_word_cv"],
            "below_both": below_floor["both"],
            "balanced_clause_over": over_balanced,
        },
        "rates": {
            "punchy_closers_per_section": round(closers / max(1, sections), 4),
            "triads_per_100w": round(triads / max(1, words) * 100, 4),
        },
        "watch_words": {
            w: {"hits": word_hits[w],
                "per_100k": round(word_hits[w] / max(1, words) * 100000, 3),
                "files": word_files[w]}
            for w in WATCH_WORDS},
    }
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else \
        Path(__file__).parent / "results" / "oanc-sweep.json"
    out.write_text(json.dumps(result, indent=1), encoding="utf-8")
    print(json.dumps({k: result[k] for k in
                      ("files", "docs_over_min_words", "words_total",
                       "floors", "rates")}, indent=1))
    print("distributions:")
    for k, v in result["distributions"].items():
        print(f"  {k}: {v}")
    print("watch words (per 100k words):")
    for w, v in sorted(result["watch_words"].items(), key=lambda x: -x[1]["per_100k"]):
        print(f"  {w}: {v['per_100k']} ({v['hits']} hits, {v['files']} files)")


if __name__ == "__main__":
    main()
