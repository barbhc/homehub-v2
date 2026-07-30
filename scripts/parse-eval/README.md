# Parse-manual eval harness

Regression harness for the manual-extraction pipeline. It runs the **exact
production prompt** (imported from `shared/parse/parsePrompt.ts`
— the single source of truth) over a golden corpus of real manuals, scores the
output, and diffs it against committed snapshots. **Zero DB writes** — it reads
manual metadata from Firestore and downloads the PDF from Firebase Storage
(read-only), calls Anthropic locally, and writes local files only.

## Setup

Needs `ANTHROPIC_API_KEY` and `GOOGLE_APPLICATION_CREDENTIALS` (path to an admin
service-account JSON) in `.env`. Downloaded PDFs are cached in
`.pdf-cache/` (gitignored) — a corpus manual runs up to 12MB, and a before/after
comparison reads every one of them twice, so the cache matters.

> Corpus rebuilt 2026-07-30. It previously addressed **v1 Supabase**
> `manual_document` rows; that project was deleted, so every PDF fetch failed
> with `ERR_NAME_NOT_RESOLVED` and this harness was un-runnable — which is why the
> prompt-curation work stalled. Entries are now `home_id` + `manual_id` against
> v2 Firestore. Two original manuals (the GE gas range and Sharp microwave
> drawer) plus the Bosch dishwasher are **permanently unrecoverable** — their
> `sourceRef` still points at the dead Supabase host. Their goldens remain in
> `golden/` for reference but cannot be reproduced. **Coverage gap:** no gas
> manual survives, so `pickParseModel`'s Opus escalation path is no longer
> exercised; add one when a gas manual is re-uploaded.

## Why

Prompt/model changes used to ship blind: the only quality signal was rescanning
a live home and noticing tasks vanished ("whack-a-mole"). This harness makes
regressions visible **before** deploying.

## Workflow

```bash
# See the corpus
npx vite-node scripts/parse-eval/run.ts -- --list

# Run one manual (cheapest check; ~$0.10–0.50 of API per manual)
npx vite-node scripts/parse-eval/run.ts -- --only=foodcycler

# Full run — compare every corpus manual against its golden snapshot
npx vite-node scripts/parse-eval/run.ts

# After an INTENTIONAL improvement changes the output, re-baseline
npx vite-node scripts/parse-eval/run.ts -- --update-golden
```

The rule: **change `shared/parse/parsePrompt.ts` → run the harness → review the
diff → only then deploy `parseWorker` / `commitManualDraft`.** A "MISSING task"
in the report is exactly the "things disappeared" bug — caught pre-deploy.

### ⚠ Never edit the prompt while a baseline is running

Each `vite-node` invocation re-reads `parsePrompt.ts` from disk, so a
per-manual loop (`for n in …; do … --only=$n --update-golden; done`) picks up
whatever the file says **at the moment that manual starts**. Editing the prompt
mid-loop silently produces a baseline where some manuals used the old prompt and
some the new one — a corrupt "before" that makes the diff meaningless while
looking perfectly healthy. Baseline first, confirm it finished, and only then
touch the prompt (`git stash push -- shared/parse/parsePrompt.ts` is a cheap way
to hold a change while the baseline runs).

## What it checks

- JSON parses; no `max_tokens` truncation
- Chunk counts by type; % chunks with `source_pages`
- Task counts (recurring / setup / habit) and field coverage
  (instructions, `source_page`, justification, minutes, valid schedule)
- Tier inflation warning (>40% essential)
- Fuzzy title diff vs golden (token Jaccard ≥ 0.5): matched / **missing** / added
- **Reclassification of surviving tasks** — `tier`, `care_type`, and `schedule`
  changes on fuzzy-matched titles. Title-only diffing is blind to the change that
  matters most for curation: a task that stays but moves `essential → recommended`
  or `maintenance → cleaning` is not "missing", it IS the improvement. Without
  this a tier/care-type prompt change reads as a clean no-op diff.

## Reading the diff — churn vs regression

Measured baseline: even with identical code, **2–3 task titles drift per run**
(retitles like "Run Citrus-Only Cycle" ↔ "Run Odor-Mitigation Citrus Cycle",
and occasional tasks appearing/dropping), and tier shares swing ±15pts. On
Opus (temperature un-pinnable) variance is larger. So:

- 1–3 missing/added titles with stable counts → ordinary variance, re-run or
  eyeball before acting.
- Missing > 3, count drops > 30%, coverage < 100%, or truncation → treat as a
  real regression.

This variance is also why prod's exact-title rescan reconciliation causes the
"tasks disappear on rescan" bug — Phase C replaces it with fuzzy matching.
Run the eval UNPIPED (`npx vite-node scripts/parse-eval/run.ts`) — piping
through grep masks the non-zero exit code.

## Global graduation (task-feedback → eval candidates)

`graduation.ts` closes the loop the other way: it reads task-feedback across ALL
homes and surfaces patterns where the SAME generalizable correction (e.g. "hide
winterizing tasks") has recurred across ≥3 distinct homes — a signal the parser
is systematically over/under-generating something.

```bash
# Prod (GOOGLE_APPLICATION_CREDENTIALS + FIREBASE_PROJECT_ID) or the emulator:
npx tsx scripts/parse-eval/graduation.ts
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-homehub npx tsx scripts/parse-eval/graduation.ts
npx tsx scripts/parse-eval/graduation.ts -- --emit   # write candidate stubs to ./candidates/ (gitignored)
```

The `graduateFeedback` scheduled function does the same aggregation weekly and
persists candidates to the server-only `parseEvalCandidates` collection (with a
`status` a maintainer can triage). **Feedback never edits the prompt.** Each
candidate is a prompt to a human: add/strengthen a golden here, tune
`shared/parse/parsePrompt.ts`, then run the harness above and review the diff
BEFORE deploying — the same gate as every other prompt change.

## Notes

- `golden/` snapshots are committed; `results/` (full raw outputs) is gitignored.
- Each corpus entry pins the model to mirror `pickParseModel`
  (gas/safety-critical → Opus).
- Exit code is non-zero on truncation, extraction failure, or missing tasks —
  suitable for a future CI/pre-deploy gate.
- Costs real API money per run; that's the point (it's cheaper than a bad
  deploy plus a home full of wrong tasks).
