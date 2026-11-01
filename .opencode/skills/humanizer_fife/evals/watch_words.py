"""Canonical watch-word list and matcher, shared by every measuring script.

Issue: oanc_sweep.py counted whitespace-separated tokens while word_ratios.py
used regex word boundaries, so identical text produced different counts and
inflated AI/human ratios (audit finding 8). Both scripts must import
`count_hits` from here — one matcher, one list, no drift.
"""

import re

# §12 list + external-detector Tier-1 candidates. Every word measured on one
# side must be measured on the other; additions go here and nowhere else.
WATCH_WORDS = [
    "align", "bolster", "comprehensive", "crucial", "delve", "enduring",
    "enhance", "enhancing", "foster", "garner", "highlight", "interplay",
    "intricate", "landscape", "leverage", "leveraging", "meticulous",
    "meticulously", "navigate", "optimize", "optimizing", "pivotal", "quietly",
    "realm", "robust", "seamless", "seamlessly", "showcase", "showcases",
    "tapestry", "testament", "underscore", "underscores", "unlock",
    "unlocking", "vibrant",
]


def count_hits(word, lower_text):
    """Occurrences of `word` as a whole word in already-lowercased text.
    Boundary regex, so 'tapestry,' counts and 'tapestryX' does not — the same
    rule for both populations."""
    return len(re.findall(rf"\b{re.escape(word)}\b", lower_text))
