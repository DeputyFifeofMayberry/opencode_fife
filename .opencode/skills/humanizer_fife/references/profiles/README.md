# Voice profiles

A profile is a saved writing sample: the writer's rhythm, word choice,
punctuation habits, and quirks, extracted once from real writing so every
rewrite can reuse it. It replaces pasting a sample into each request.

## Layout

One file per context, named for when the writer uses it:

```
references/profiles/
    work-standup.md      # how they write to their team
    client-emails.md     # how they write to clients
    public-posts.md      # how they write in public
```

## Format

```markdown
# <name>

## When to use this profile
<who the writer is here, who reads it, one line.>

## Style summary
<Sentence length and rhythm. Punctuation habits (dashes? parentheses?
contractions at what rate?). Vocabulary level. Directness. Openings and
closings. What they never do. 5-10 lines, concrete.>

## Exemplars
> <2-3 short verbatim excerpts from the samples, 1-3 sentences each.>

## Measured bands (optional)
<Output of evals/rhythm_metrics.py run over the samples: sentence_len_cv,
contraction_rate, and anything else measured. A rewrite targeting this profile
should land near these bands.>
```

## Building one

Ask for 5-10 samples of the writer's real, unedited writing in that context
(sent messages, drafts, posts). Extract the style summary and exemplars. The
Exemplars section holds short verbatim excerpts, authorized by the writer —
they may naturally contain facts, names, and dates. What never happens is
those facts traveling: exemplar content must not appear in a rewrite of
someone else's text. Keep private samples out of git. Run
`evals/rhythm_metrics.py` over the samples and record the bands. Save, name the
file for the context, done. A profile with fewer than 3 samples says so at the
top.

Sample counts answer two different questions. 5-10 samples is enough for the
style summary and exemplars (few-shot style capture). Measuring stable
statistical bands needs more: writing-eval's calibration study found 25 samples
cover ~70% of stable scores and 40 cover ~87%, with article count mattering
more than total words. Until then, label the bands provisional.

Three rules from prior art (full survey in `PRIOR-ART.md`):

- **Authorization.** Only profile prose the writer owns or published. Their
  samples stay out of git if they are private.
- **Rebuild, don't append.** When the corpus grows, rebuild the profile from
  all of it rather than patching the oldest summary.
- **Exemplars stay verbatim.** A summary alone drifts generic; verbatim
  excerpts are what keep the rewrite honest (authorized by the writer, so
  their facts may sit in the profile — they just never travel into rewrites
  of other text), which is why voice-fidelity products keep both.

## Using one at rewrite time

If `references/profiles/` contains a profile matching the writer, or the user
names one, read it before drafting and treat it as the writing sample: it
outranks the patterns, including the dash rule in §8, at the same strength as a
sample pasted into the request. Two limits hold regardless:

1. **Style carries over, facts do not.** Vocabulary, cadence, punctuation, and
   quirks transfer. The exemplars' content never appears in a rewrite of
   someone else's text, and the profile never outranks the no-fabrication rule.
2. **The profile is the floor, not the ceiling.** If the text's own register
   clearly differs from the profile's (a reply to a frustrated reader, a formal
   request that reaches a new audience), follow the situation and say so in the
   summary you return.

A writing sample pasted directly into the request outranks a saved profile: it
is fresher evidence of how the writer wants to sound right now.

## Maintenance

When the user corrects a rewrite ("I'd never say it that way"), update the
profile's style summary or exemplars in the same session. Corrections are the
cheapest voice data there is.
