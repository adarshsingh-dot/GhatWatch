# Visarjan Ghat Watch, Bhopal: upload version

Team: `<<FILL>>` · Members: `<<FILL>>` · Track 2, Visarjan Ghat Watch · One user: the BMC officer planning Durga visarjan (20 Oct 2026)

The officer uploads water-test readings. Code checks and scores them, an optional AI step writes the
words, and the officer gets a ranked list, a summary PDF and a one-page brief in English and Hindi.

This is the upload-first version of the tool. It was written in one session on 11 Oct 2026 and is meant
to be merged into, or to replace, the static site on the team's repo. See "Merging with the static site".

## What the officer does

1. Opens the page and drops a CSV (template layout) or an MPPCB report PDF. One button loads the
   2023 to 2025 readings from the track pack.
2. Sees the ghats ranked, with a plain-words reason, a tier, a data-confidence label and suggested actions.
   Ghats with too few readings are listed separately under "Cannot be ranked: test before visarjan".
3. Opens any ghat to see every number behind its rank, the coverage grid, and a link to the report page.
4. Presses "Download PDF" (summary, English brief, Hindi brief, one A4 page each), "Copy brief as text"
   (WhatsApp-ready, both languages) or "Print".

## Who does what: code and the three AI roles

| Step | Done by | What it does |
|---|---|---|
| Check files | code | Schema, bad rows, duplicates, implausible values. Blank, `*`, `**`, `_`, `-` mean not sampled. |
| Score and rank | code | Severity, risk score, tier, confidence, rank range across 4 methods. |
| Writer | AI (optional) | Rewrites the summary and the EN + HI brief from the computed facts only. |
| Auditor | AI (optional) | Separate call with a fresh context that looks for unsupported numbers and claims. |
| Number check | code | Every number in the AI text must be in the computed facts. Wording lint, rank order, unranked list, EN/HI number match. |
| PDF reader | AI (optional) | Copies printed DO, BOD and pH values out of a report PDF for the officer to review. |

Numbers come from code. A model never calculates, ranks or scores. If the AI step is not set up, fails,
or its text does not pass the number check, the brief written by code is used and nothing is missing.
The auditor is the same model family as the writer, so it is a second look, not independent proof.
The code check is the authority.

## How to run

```bash
git clone https://github.com/adarshsingh-dot/GhatWatch.git
cd GhatWatch
npm install
npm run dev
```

Then open http://localhost:5173. Also: `npm test`, `npm run build`.

No key is needed for any of this. To try the AI step locally, set a key in your own terminal first
(never in a file):

```bash
# PowerShell:  $env:ANTHROPIC_API_KEY="..." ; npm run dev
# bash:        ANTHROPIC_API_KEY=... npm run dev
```

`AI_PROVIDER=mock npm run dev` runs the AI path with a stand-in that is not a model, to demo the flow
without a key. `MOCK_BAD=1` makes that stand-in break the rules so you can watch the number check reject it.

## Deploying (Vercel)

1. Import the repo in Vercel. The framework preset is Vite; the two files in `api/` become serverless functions.
2. In Project Settings, Environment Variables, add ONE of `ANTHROPIC_API_KEY` or `CEREBRAS_API_KEY`.
   Optional: `AI_PROVIDER` (`claude` or `cerebras`), `ANTHROPIC_WRITER_MODEL` (default `claude-sonnet-5-5`),
   `ANTHROPIC_AUDITOR_MODEL` (default `claude-haiku-5-5`), `CEREBRAS_MODEL` (default `gpt-oss-120b`).
3. Deploy. The officer never sees or enters a key. On static hosting with no functions (GitHub Pages),
   everything except the AI step and PDF reading still works.

Keys live only in the server's environment. They are not in the repo, the browser bundle or any response.
Error messages pass through `redact()` before they leave the server.

## What works, and what has not been checked

Checked in this session:
- 40 tests pass (`npm test`), with no key and no network.
- Golden counts from the participant guide reproduce on `bhopal_ghats_2023_2025.csv`: 116 DO readings with
  a number, 42 below 5; 112 BOD readings, 100 above 3; Bairagarh DO = 0 four times.
- In a browser at phone and desktop width: load the sample, upload a second CSV with bad rows (rejected row,
  non-numeric value treated as not sampled, pH 19 flagged and not scored, a new ghat left unranked),
  open a ghat's detail, switch brief tabs, run the AI path with the mock provider, build the 3-page PDF.

NOT checked, because no real key was used in this session:
- A live call to Claude or Cerebras. The request code follows the SDK documentation but has not been run
  against either service. Run it once with your own key before the demo.
- The PDF reader against a real MPPCB report. Its line parser and its "value must be printed on the cited
  page" check are unit tested; reading a real 100-page report through a model is not.
- A Vercel deployment.

Known limits:
- The PDF reader takes only DO, BOD and pH, needs a PDF with a text layer (not a scan), and its rows must be
  reviewed by a person. The page check confirms a number is printed on that page, not that it sits in the right row.
- Hindi text needs review by a Hindi speaker before use. Strings are in `src/i18n/hi.ts`.
- The `/api` endpoints have input-size limits but no login or rate limit. Anyone with the URL can spend the key.
  Add a rate limit or an access code before sharing the link widely.
- 13 parameters only, 4 metals, 3 sampling moments per festival, no coliform data, units assumed (the reports
  print none), CPCB Class B is our assumption, Rani Kamlapati / Kamla Park kund may be two places, and
  Bairagarh and Malikhedi have no Durga 2025 table.
- No dot plot and no methodology page in this version; the coverage grid and readings table are there.

## Method in short

- Benchmark: CPCB Class B (outdoor bathing): DO 5 mg/l or more, BOD 3 mg/l or less, pH 6.5 to 8.5.
- Per-reading severity 0 to 1. DO: (5 - v) / 5. BOD: log10(v / 3), capped at 1. pH: distance outside the range / 1.5.
- Risk score = 100 x (0.45 weighted severity + 0.25 share of readings outside the limit + 0.20 worst reading
  + 0.10 share outside the limit one week after). Parameter weights DO 0.4, BOD 0.4, pH 0.2.
- Year weights: the latest year in the uploaded data counts 1.0, each earlier year 0.2 less (2025 = 1.0,
  2024 = 0.8, 2023 = 0.6 for the pack). When 2026 readings are uploaded, 2026 becomes 1.0.
- Tiers: Critical if any DO reading is below 1 mg/l or the score is 50 or more; High from 35; Moderate from 20;
  otherwise "Lower concern in sampled readings". On the pack data the scores are 57.5, 44.6, 35.7, 35.2, 33.7,
  33.4 and 18.1, so the High / Moderate line falls between close scores. The card says when a tier changes
  between scoring methods.
- Ranking is by tier first, then score, so a ghat that is Critical because of a near-zero oxygen reading is
  not listed below a lower tier. On the pack data this gives the same order as score alone.
- Confidence = usable readings / expected readings (tables for that ghat x 3 phases x 3 tests).
- Not ranked: fewer than 6 usable readings, or no DO or no BOD reading during immersion.
- All values are in `src/config.ts`.

## Merging with the static site

The static site and this version follow the same spec, so these files map one to one:
`src/types.ts`, `src/lib/scoring.ts`, `src/i18n/*.ts`. Before merging, compare the ranking the two produce
on the pack CSV. Differences to expect and decide on: tier cut-offs, tier-first ranking, and the year-weight
rule for 2026. New in this version: `src/lib/parse.ts` (browser-side validation), `src/lib/gate.ts`
(number check), `src/lib/pdfExtract.ts`, `src/lib/pdf.ts`, `api/` (serverless AI calls), the upload screen.

## Data

`data/bhopal_ghats_2023_2025.csv` and `data/cpcb_water_quality_criteria.csv` from the track pack
(github.com/Laaaaksh/bhopal-impact-lab-2026, tracks/02-visarjan-ghat-watch). No other data. Official MPPCB
reports are linked by page, never fetched. `public/TEMPLATE.csv` shows the layout for new readings.

## Licence

MIT. See `LICENSE`.
