# AI Visibility Score — Methodology

This page explains exactly how we measure AI visibility, how every number in your
report is computed, and where the honest limits of the measurement are. There is
no black box: if a number appears in a report, its formula is on this page.

## What we measure

We track how four AI answer surfaces respond to the real questions your buyers ask:

- **ChatGPT**
- **Google AI**
- **Perplexity**
- **Gemini**

### What a "run" is

A **run** is one prompt asked on one surface: **prompt × surface**. If we track
10 buyer questions across the 4 surfaces, one full sweep is 40 runs. Every metric
below is computed over the set of tracked runs in a reporting period.

### How capture works in v0

In v0, capture is **manual (concierge)**: an analyst asks each tracked prompt on
each surface and records the answer — which brands are mentioned, in what order,
whether each brand's site is cited or linked, and the sentiment of each mention.
Captures follow a documented schema (see `capture-schema.md` in this directory)
so every run is recorded the same way.

Because AI answers vary from run to run, we repeat prompts across the period and
**average across runs** rather than treating any single answer as the truth.

## The Visibility Score

> **Score = 0.4×(prompt appearance rate) + 0.3×(citation/link rate) + 0.2×(prominence) + 0.1×(sentiment), scaled 0–100**

Each component is a value between 0 and 1; the weighted sum is multiplied by 100
to give a score from 0 to 100.

### 1. Prompt appearance rate — weight 0.4

The share of tracked runs in which your brand appears in the answer at all.

**Example:** your brand appears in 18 of 40 runs → appearance rate = 18 / 40 = **0.45**.

This carries the largest weight because showing up at all is the gate to
everything else: a brand AI never mentions cannot be cited, ranked, or praised.

### 2. Citation/link rate — weight 0.3

The share of tracked runs in which the answer cites or links your brand's own
site (not just a mention of the name).

**Example:** your site is cited or linked in 10 of 40 runs → citation/link rate = 10 / 40 = **0.25**.

Citations matter because they send traffic and signal that the AI treats your
site as a source, not just a name it has heard of.

### 3. Prominence — weight 0.2

How early your brand appears when it does appear. For each answer where your
brand is mentioned, we take **1 / position** of the mention (first brand
mentioned = position 1 → 1.0; second = 0.5; third ≈ 0.33; and so on).
Prominence is the **mean of 1/position across the answers where the brand appears**.

**Example:** your brand appears in 3 answers, mentioned first, second, and
fourth → (1.0 + 0.5 + 0.25) / 3 = **0.583**.

### 4. Sentiment — weight 0.1

How the answer talks about you when it mentions you. Each mention is classified
and mapped to a value:

| Sentiment | Value |
|-----------|-------|
| Positive  | 1.0   |
| Neutral   | 0.5   |
| Negative  | 0.0   |

Sentiment is the mean of these values across your brand's mentions.

**Example:** of 18 mentions, 6 are positive, 10 neutral, 2 negative →
(6×1.0 + 10×0.5 + 2×0.0) / 18 = 11 / 18 = **0.611**.

### Worked full example

Using the component values from the examples above:

```
Score = [ 0.4×0.45 + 0.3×0.25 + 0.2×0.583 + 0.1×0.611 ] × 100
      = [ 0.180   + 0.075   + 0.117    + 0.061   ] × 100
      ≈ 43 / 100
```

A brand that appears in under half of buyer-question runs, is cited in a
quarter of them, is usually mentioned second or later, and is discussed mostly
neutrally scores in the low 40s. The report's verdict text translates the band
into plain English.

## Share of voice, overtakes, and alerts

**Share of voice (SoV)** = the percentage of tracked runs in which an entity
(your brand or a competitor) appears. SoV is computed identically for every
entity, so it is directly comparable: if you appear in 18 of 40 runs (45%) and
your competitor appears in 26 of 40 (65%), they lead the head-to-head.

**Overtake** = a competitor's SoV passing your brand's SoV between one reporting
period and the next (or vice versa — the report shows both directions).

**Alerts** fire when either of these happens:

1. Your Visibility Score moves by **more than 10 points** between periods
   (up or down), or
2. A **competitor's SoV passes your brand's** SoV.

## Honest limitations

We would rather under-claim than over-claim. Know these limits when reading a report:

- **AI answers vary run to run.** The same prompt on the same surface can name
  different brands on different days. That variance is real and we do not hide
  it — we average across repeated runs instead of cherry-picking a single answer.
- **Scores are directional, not decimal-precise.** A 43 vs a 45 is noise; a 43
  vs a 60 is signal. We report **deltas over time** rather than false precision,
  and single-period scores should be read as a band, not a point.
- **v0 capture is manual.** Concierge capture keeps quality high and lets a
  human verify every mention, but it bounds how many prompts and repeats fit in
  a period. Sample sizes are stated in every report.
- **Sentiment classification involves judgement.** Positive/neutral/negative is
  assigned by an analyst following the capture schema; borderline cases default
  to neutral.
- **Surfaces change without notice.** AI products update their models and
  answer formats regularly. A score shift can reflect their change, not yours —
  another reason trends beat single snapshots.

## Questions?

This methodology is versioned with the product. If anything here is unclear —
or you think a weight or definition should be different — tell us:
**myersdigitalconsulting@gmail.com**.

---

*A Myers Digital Consulting product.*
