# Capture Schema

A **capture** is one JSON file describing a snapshot of AI-answer visibility for one brand
during one period. It is produced by hand (v0 is concierge — no scraping, no LLM API calls)
and consumed by the scoring engine (`src/score.mjs`, `src/sov.mjs`) and the report generator
(`bin/generate-report.mjs`).

## Full example

```json
{
  "meta": { "capturedAt": "2026-07-01T00:00:00Z", "period": "2026-W27" },
  "brand": { "name": "Acme Roofing", "aliases": ["Acme"], "domain": "acmeroofing.com" },
  "competitors": [ { "name": "...", "aliases": [], "domain": "..." } ],
  "surfaces": ["chatgpt", "google-ai", "perplexity", "gemini"],
  "results": [
    {
      "prompt": "best roofing company in Austin",
      "surface": "chatgpt",
      "entities": [
        { "name": "Acme Roofing", "mentioned": true, "linked": true, "position": 1, "sentiment": "positive" }
      ],
      "citedSources": ["yelp.com", "acmeroofing.com"]
    }
  ]
}
```

## Field-by-field reference

### `meta` (object, required)

| Field | Type | Description |
|-------|------|-------------|
| `capturedAt` | string (ISO 8601) | When the capture session happened, e.g. `"2026-07-01T00:00:00Z"`. |
| `period` | string | Human-readable reporting period label, e.g. ISO week `"2026-W27"`. Shown on the report and used to label week-over-week deltas. |

### `brand` (object, required)

The client brand being tracked.

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Canonical brand name, e.g. `"Acme Roofing"`. Required. |
| `aliases` | string[] | Alternative spellings/short forms the AI may use, e.g. `["Acme"]`. Matched case-insensitively. |
| `domain` | string | Brand website domain, e.g. `"acmeroofing.com"`. Used to detect brand-owned cited sources (any cited source *containing* this domain counts). |

### `competitors` (array of objects, required — may be empty)

Each competitor has the same shape as `brand`: `{ name, aliases, domain }`.

### `surfaces` (string[], required)

The AI surfaces covered in this capture. Canonical values:
`"chatgpt"`, `"google-ai"`, `"perplexity"`, `"gemini"`.

### `results` (array of objects, required)

One element per **run**. A run = one prompt asked on one surface. With 12 prompts and
4 surfaces a full capture has 48 runs.

| Field | Type | Description |
|-------|------|-------------|
| `prompt` | string | The exact prompt asked, e.g. `"best roofing company in Austin"`. |
| `surface` | string | One of the values in `surfaces`. |
| `entities` | object[] | One entry per tracked entity that appears in the answer (see below). Entities not mentioned may simply be omitted. |
| `citedSources` | string[] | Domains/URLs the AI answer cited or linked as sources, e.g. `["yelp.com", "acmeroofing.com"]`. |

### `results[].entities[]` (object)

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Must match the brand or a competitor `name` — or any of their `aliases`. Matching is case-insensitive. |
| `mentioned` | boolean | `true` if the entity is named in the answer. |
| `linked` | boolean | `true` if the answer includes a hyperlink to the entity (its site or profile). |
| `position` | integer (1-based) | Order of mention among the **mentioned** entities in that answer. `1` = most prominent / first mentioned, `2` = second, and so on. |
| `sentiment` | string | How the answer characterizes the entity: `"positive"`, `"neutral"`, or `"negative"`. |

## How the engine uses this

For each entity, across all runs (see `src/score.mjs`):

- **appearanceRate** = mentioned runs / total runs
- **citationRate** = runs where the entity is `linked` / total runs
- **prominence** = mean of `1/position` over mentioned runs (1 → 1.0, 2 → 0.5, 3 → 0.33…); 0 if never mentioned
- **sentiment** = mean of positive=1 / neutral=0.5 / negative=0 over mentioned runs; 0.5 if never mentioned
- **score** = round(100 × (0.4×appearance + 0.3×citation + 0.2×prominence + 0.1×sentiment)), clamped 0–100

## How to capture by hand (concierge workflow)

1. **Fix the prompt list.** Agree with the client on ~12 buying-intent prompts
   (e.g. "best roofing company in Austin", "roof replacement cost near me").
2. **Run every prompt on every surface.** Open ChatGPT, Google AI Overviews,
   Perplexity, and Gemini in a clean/logged-out session and ask each prompt verbatim.
3. **Record each answer as one `results[]` entry:**
   - For every tracked company that the answer names, add an `entities[]` entry with
     `mentioned: true`, whether it was hyperlinked (`linked`), its order of mention
     (`position`, 1 = first), and the tone (`sentiment`).
   - Copy the answer's cited/linked source domains into `citedSources`.
4. **Fill in `meta`** with the capture date and the period label (ISO week works well).
5. **Repeat next period with the same prompts** and pass the prior file as `--previous`
   to unlock week-over-week deltas, overtake detection, and alerts:

```bash
node bin/generate-report.mjs \
  --input data/2026-W27.json \
  --previous data/2026-W26.json \
  --agency "Your Agency" \
  --out reports/client-2026-W27.html
```
