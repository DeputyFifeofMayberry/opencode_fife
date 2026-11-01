# Rhythm tells: the full inventory

Why this file exists: in a blind study of this skill's rewrite pass, judges
crushed every tell the skill encodes (AI vocabulary 70 → 0 citations) while the
rhythmic tells *grew* (uniform beat rate 60 → 101, aphoristic closers 38 → 61,
contraction uniformity 21 → 43). A subtractive rewrite makes prose more
uniformly well-shaped, and uniform good shape is itself what gives it away.
Source: issue #229 and the underlying study at
[itsryanlenk/humanist](https://github.com/itsryanlenk/humanist) `docs/evals/`
(used here as data, not text; their corpus and tally scripts are the model for
this repo's `evals/`).

These are read-aloud checks, not regexes. None is mechanically checkable without
lying about precision. `evals/rhythm_metrics.py` reports mechanical proxies for
three of them; treat its numbers as a smell, never a verdict.

## Safe to act on (measured discrimination ratio ≥ 3, from the study)

Ratio = how often judges cited a construction as machine evidence vs. as human
evidence. Above ~3 it is safe to encode; below 1 it fires on careful human
writing.

### Announced thesis (ratio 64.6 — the safest)

The essayistic hinge that states its own thesis, often as chiasmus: "Instead of
asking your team to adapt to the software, the software adapts to your team."
198 citations. Partially covered by §3 and §4; the subtler forms survive. Fix:
state the claim the thesis stands for, or cut it — the essay usually already
made the point.

### Tricolons and announced triads (ratio 35.8 — the most-cited tell overall)

Beyond §6's rule of three: *announced* enumerations that arrive at exactly three
("Three findings surprised us"), stacked triads across paragraphs, escalating
triads. 329 citations. Fix: use the number of items the content has. If three
items are real, vary their weight instead of their count.

### Uniform beat rate (ratio 13.9)

Every paragraph lands the same rhetorical beats — setup, turn, payoff — at
near-identical length. 256 citations, and the tell that grows most through a
rewrite. Fix: asymmetry the content supports. One paragraph runs four sentences,
the next one. A section is twice its neighbor because it earned it. A person
writing under real conditions is not metronomic; they get bored, distracted, or
more interested in one part than another. Never manufacture irregularity.

### Aphoristic closer (ratio 10.3)

The section or piece ends by tightening into a quotable line. Individually good;
every single time, machinery. 158 citations. Fix: end some sections on the
flattest available sentence, or on the most concrete fact, or mid-thought. Not
everything resolves.

### Too complete, no friction (ratio 11.2)

The piece anticipates every objection, covers every case, has no loose ends and
nothing the author failed to find out. Real writing has holes because real
research stops somewhere. Fix: say what you did not check; leave the objection
you cannot answer standing.

### Balanced clause symmetry (partly covered)

Clauses on either side of a comma or conjunction near-equal in weight and
grammar, sustained across a piece. A person writing fast produces lopsided
sentences. Fix: let one side carry more weight when the meaning leans that way.

### Contraction uniformity (ratio unmeasured, citations grew 21 → 43)

A rewrite that strips every contraction, or distributes them evenly, replaces
one pattern with another. Fix: let each sentence's register decide. Reported
speech, asides, and informal claims keep their contractions; definitions and
specifications may lose theirs.

## Do NOT encode (measured to misfire on human prose)

| construction | ratio | why |
| --- | --- | --- |
| Performed hedging | 0.89 | cited equally as machine and human evidence; a rule here flags careful writers |
| Self-answered question | 0.00 | cited only as *human* evidence |
| Typography (dashes, curly quotes) | 0.61 | why §8 and §21 are weak-alone |

## Method

Read the whole draft aloud (or subvocalize) once after the cleanup pass, before
the final version. Ask, per paragraph: does this land the same beats as the one
before, at the same length? Ask at each section end: did this just tighten into
a quote? Ask of the contractions: did the cleanup flatten their rate in either
direction? Then check `evals/rhythm_metrics.py` on the file if it is on disk —
falling sentence-length and paragraph-length variation is the smell that judges
cited 256 times.
