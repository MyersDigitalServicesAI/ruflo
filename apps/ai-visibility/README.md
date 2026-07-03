# AI Visibility Tracker (v0)

**A Myers Digital Consulting product.**

White-label AI-visibility reporting for agencies. We track how AI answer
surfaces — ChatGPT, Google AI, Perplexity, and Gemini — talk about a brand
versus its competitors, score it 0–100, and generate a client-ready report the
agency can put its own name on.

This is **v0: concierge tooling**. It contains three things:

1. **Scoring engine** — computes the Visibility Score and its components from
   captured run data.
2. **White-label report generator** — turns a capture file into a branded HTML
   report an agency can send to its client.
3. **Free-audit landing page** — the lead magnet (`public/index.html`), a
   self-contained static page with the audit request form.

The Visibility Score formula (identical everywhere in this product):

> **Score = 0.4×(prompt appearance rate) + 0.3×(citation/link rate) + 0.2×(prominence) + 0.1×(sentiment), scaled 0–100**

See [docs/methodology.md](docs/methodology.md) for full definitions, worked
examples, and limitations.

## Quickstart

```bash
# from apps/ai-visibility/

# run the test suite
npm test

# generate a white-label report from the sample capture
node bin/generate-report.mjs \
  --input data/sample-capture.json \
  --agency "Your Agency" \
  --out report.html
```

Open `report.html` in a browser. To preview the landing page, open
`public/index.html` directly — it is fully self-contained and works from
`file://`.

## Directory layout

```
apps/ai-visibility/
├── README.md              # this file
├── package.json           # scripts + metadata
├── bin/
│   └── generate-report.mjs  # CLI: capture JSON → white-label HTML report
├── src/                   # scoring engine + report generator modules
├── data/
│   └── sample-capture.json  # example capture file (fictional brands)
├── tests/                 # engine + generator tests
├── public/
│   └── index.html         # free-audit landing page (static, self-contained)
└── docs/
    ├── methodology.md     # public scoring methodology
    └── capture-schema.md  # how runs are recorded in v0 (concierge capture)
```

## Documentation

- [Scoring methodology](docs/methodology.md) — what a "run" is, each score
  component with weight and worked example, share of voice / overtakes /
  alerts, and honest limitations.
- [Capture schema](docs/capture-schema.md) — the format analysts use to record
  each prompt × surface run in v0.

## v0 non-goals (deliberate)

Per the business plan, automation comes **after paying pilots**, not before.
v0 intentionally does **not** include:

- **No scraping** — capture is manual/concierge, recorded by an analyst.
- **No live LLM calls** — the engine scores recorded captures; it does not
  query ChatGPT, Gemini, Perplexity, or Google AI itself.
- **No billing** — plans on the landing page are fulfilled manually.
- **No dashboard** — output is a generated report file, not a hosted app.

If you find yourself building any of the above into v0, stop and re-read the
business plan.
