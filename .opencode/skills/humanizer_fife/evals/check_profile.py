"""Voice-profile fixture check: facts stay out, claims stay in.

    python evals/check_profile.py --source SOURCE --rewrite REWRITE \
        --profile PROFILE [--claims "twelve|Thursday|November 1st"]

Checks a profile-driven rewrite two ways:

1. Claims preserved. Every numeric token in the source (compared as a
   complete token on both sides — "123%" does not pass for "23%", "23.5"
   does not pass for "23") must appear in the rewrite. Word claims such as
   dates or written-out numbers are checked only
   when passed explicitly via --claims ("|"-separated, word-boundary match,
   case-insensitive). The checker cannot verify paraphrases: "twelve to four"
   rewritten as "12 to 4" is reported as a missing claim, and qualifies as a
   limitation, not a failure of the rewrite.
2. Exemplar leakage. Consecutive blockquote lines in the profile are joined
   into exemplar passages; the longest ordered word sequence shared between
   the rewrite and any exemplar must stay under 3 words. Scattered reuse of
   common words does not fire; copying a phrase does.

Exits 0 on pass, 1 on any failure. --selftest runs the audit's reproductions
and asserts the outcomes.
"""

import re
import sys
from difflib import SequenceMatcher
from pathlib import Path

# A well-formed number: optional $, digits with 3-digit comma groups, optional
# decimal part, optional ordinal suffix, optional %. Lookarounds keep sentence
# punctuation out and partial amounts from matching ("23.5" is one token).
NUMERIC = re.compile(
    r"(?<![\w.$])\$?\d+(?:,\d{3})*(?:\.\d+)?(?:st|nd|rd|th)?%?(?![\w]|\.\d)",
    re.IGNORECASE,
)


def numeric_tokens(text):
    """Complete numeric tokens: amounts, percents, decimals, integers with
    ordinal suffixes. "123%" is one token and does not contain "23%"; "1st" is
    one token and does not contain "1"; sentence punctuation stays out ("23."
    yields "23"). Amounts compare whole: "23.5" does not preserve "23" and
    "$400,000.50" does not preserve "$400,000"."""
    return set(NUMERIC.findall(text))


def word_present(claim, rewrite):
    pattern = r"(?<![\w])" + re.escape(claim.strip()) + r"(?![\w])"
    return re.search(pattern, rewrite, re.IGNORECASE) is not None


def exemplars_from(profile_text):
    """Join consecutive blockquote lines so wrapped exemplars stay whole."""
    exemplars = []
    current = []
    for line in profile_text.splitlines():
        if line.startswith(">"):
            current.append(line.lstrip("> ").strip())
        elif current:
            exemplars.append(" ".join(current))
            current = []
    if current:
        exemplars.append(" ".join(current))
    return [e for e in exemplars if e]


def words(text):
    """Tokens for the leakage check: whitespace split, case-folded, edge
    punctuation stripped. Both the rewrite and the exemplars go through this
    same tokenizer, so a verbatim hyphenated copy matches token-for-token."""
    return [w.lower().strip(".,;:!?\"'()") for w in text.split()
            if w.strip(".,;:!?\"'()")]


def longest_shared_run(rewrite_words, exemplar_words):
    matcher = SequenceMatcher(None, rewrite_words, exemplar_words, autojunk=False)
    return max((block.size for block in matcher.get_matching_blocks()), default=0)


def check(source, rewrite, profile, word_claims):
    ok = True
    missing = numeric_tokens(source) - numeric_tokens(rewrite)
    for token in sorted(missing):
        print(f"FAIL missing numeric claim: {token!r}")
        ok = False
    for claim in word_claims:
        if not word_present(claim, rewrite):
            print(f"FAIL missing word claim: {claim.strip()!r}")
            ok = False
    exemplars = exemplars_from(profile)
    rewrite_words = words(rewrite)
    for i, exemplar in enumerate(exemplars):
        run = longest_shared_run(rewrite_words, words(exemplar))
        if run >= 3:
            print(f"FAIL exemplar {i} leakage: {run}-word ordered sequence copied")
            ok = False
    return ok


def selftest():
    source = "Costs fell 23%, saving over $400,000 annualized. Vendors went from twelve to four. Details Thursday."
    exemplar_a = "> Need the RFI answers by Wednesday or the schedule slides again."
    exemplar_b = "> Steel showed up a day late, so decking pours Thursday now."
    profile = "## Exemplars\n" + exemplar_a + "\n" + exemplar_b + "\n"

    clean = "Costs fell 23%, saving over $400,000 annualized. Vendors went from twelve to four. Details Thursday."
    assert check(source, clean, profile, ["Thursday"]) is True, "clean rewrite must pass"

    substring_trap = "Costs fell 123%, saving over $400,000 annualized. Vendors went from twelve to four. Details Thursday."
    assert check(source, substring_trap, profile, ["Thursday"]) is False, \
        "123% must not pass for 23%"

    copied = ("Costs fell 23%, saving over $400,000 annualized. Vendors went from twelve to four. "
              "Need the RFI answers by Wednesday or the schedule slides again.")
    assert check(source, copied, profile, ["Thursday"]) is False, \
        "copied exemplar must fail the leakage check"

    scattered = ("Costs fell 23%, saving over $400,000 annualized. The schedule was revised, "
                 "then revised again, and revised a third time. Details Thursday.")
    assert check(source, scattered, profile, ["Thursday"]) is True, \
        "unrelated repetition must not fire the leakage check"

    missing_word_claim = "Costs fell 23%, saving over $400,000 annualized. Vendors went from twelve to four."
    assert check(source, missing_word_claim, profile, ["Thursday"]) is False, \
        "explicitly listed word claim must be checked"

    ordinal = "Launches the 1st. Costs fell 23%, saving over $400,000 annualized. Vendors went from twelve to four."
    assert check(ordinal, "Launches the 1st. Costs fell 23%. Savings over $400,000.", profile, []) is True, \
        "ordinal suffixes must stay part of the numeric token"
    assert check(ordinal, "Launches the 21st. Costs fell 23%. Savings over $400,000.", profile, []) is False, \
        "1st must not pass for 21st"

    decimal_trap = "Costs fell 23.5%, saving over $400,000 annualized. Vendors went from twelve to four. Details Thursday."
    assert check(source, decimal_trap, profile, ["Thursday"]) is False, \
        "23.5% must not pass for 23%"

    amount_trap = "Costs fell 23%, saving over $400,000.50 annualized. Vendors went from twelve to four. Details Thursday."
    assert check(source, amount_trap, profile, ["Thursday"]) is False, \
        "$400,000.50 must not pass for $400,000"

    reflowed = "Costs fell 23, saving over $400,000 annualized. Vendors went from twelve to four. Details Thursday."
    assert check("Costs fell 23. Vendors went from twelve to four. Details Thursday.",
                 reflowed, profile, ["Thursday"]) is True, \
        "sentence punctuation must not change the numeric token"

    hyphen_profile = "## Exemplars\n> Pre-launch review starts Monday, so flag me early.\n"
    hyphen_copy = "Costs fell 23%, saving over $400,000 annualized. Vendors went from twelve to four. Pre-launch review starts."
    assert check(source, hyphen_copy, hyphen_profile, ["Thursday"]) is False, \
        "verbatim hyphenated exemplar copy must fail the leakage check"

    print("check_profile selftest: OK (all audit reproductions behave correctly)")


def main():
    if "--selftest" in sys.argv:
        selftest()
        return
    args = dict(zip(sys.argv[1::2], sys.argv[2::2]))
    for required in ("--source", "--rewrite", "--profile"):
        if required not in args:
            print(f"usage: check_profile.py --source S --rewrite R --profile P "
                  f"[--claims 'a|b'] [--selftest]")
            sys.exit(2)
    source = Path(args["--source"]).read_text(encoding="utf-8")
    rewrite = Path(args["--rewrite"]).read_text(encoding="utf-8")
    profile = Path(args["--profile"]).read_text(encoding="utf-8")
    word_claims = [c for c in args.get("--claims", "").split("|") if c.strip()]
    ok = check(source, rewrite, profile, word_claims)
    print("PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
