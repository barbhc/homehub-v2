# Manual-parser eval

The parse pipeline — photograph an appliance → find its manual → extract care
tasks — **is** the product. Everything else is a list with reminders on it.

Until this directory existed, nothing measured whether its output was any good.
A prompt tweak or a model upgrade could silently degrade the core feature and the
first person to notice would be a user, weeks later, wondering why their
dishwasher stopped reminding them about anything.

## One command

```bash
npm run eval:parser                        # full corpus, calls the API (~$4)
npm run eval:parser -- --only=dryer-lg     # one manual, the cheap check
npm run eval:parser -- --offline           # re-score the committed runs, $0
npm run eval:parser -- --update-baseline
```

Current baseline and what it found: **[BASELINE.md](./BASELINE.md)**.

`--offline` is the one to reach for most of the time. Every run's raw output is
committed under `runs/`, so scoring changes, expectation changes and score
arithmetic can all be checked for free and reviewed by reading the actual model
output rather than trusting a number.

## What makes this different from `scripts/parse-eval/`

The older harness diffs each run against the **previous run's** output. That
answers *"did the output change?"*, which is useful — but it cannot answer *"is
the output any good?"*, and it happily baselines a regression the moment someone
runs `--update-golden` on a bad day.

This one scores against **expectations written by reading the actual manuals**.
A score here means the extraction agrees with the document, not merely with its
own past self. Both can coexist; they answer different questions.

## How a manual gets scored

Eight dimensions, weighted. Recall and precision carry more than half between
them because they are the two failures that actually happened in this product: a
filter task quietly disappearing, and "Add Detergent Before Each Cycle" showing
up as a reminder.

| dimension | weight | question |
|---|---:|---|
| **recall** | 30 | is every task the manual genuinely specifies present? |
| **precision** | 25 | did it stay out of operation, config and unboxing? |
| **cadence** | 15 | did it keep the manufacturer's stated interval? |
| **careType** | 10 | maintenance vs cleaning — which decides where a task appears |
| **safety** | 8 | safety context kept, and no hazardous DIY instructions |
| **structure** | 7 | commitable shape: fields present, nothing truncated |
| **tier** | 3 | is "essential" still rare? |
| **volume** | 2 | not under-extracting, not transcribing the manual |

Weights are renormalised over the dimensions that **apply** to a given manual. A
manual with no cadence expectations is not scored out of a total that included
them — otherwise the image-only manual, which can assert almost nothing, would
read as a permanent failure and drag the corpus average somewhere meaningless.

A **2-point corpus drop fails the command**, which is set above this pipeline's
measured run-to-run noise. A hair-trigger threshold on a stochastic pipeline
produces a suite nobody runs.

## Adding a manual to the corpus

1. **Find one that covers something the corpus doesn't.** Head-count is not the
   goal — `corpus.json` records why each entry is there. A refrigerator, an
   oven, and a second install/service manual are the current gaps.

   ```bash
   npx vite-node evals/manual-parser/discover.ts
   ```

   Lists every manual in the live project with its PDF resolvability
   (`cached` / `storage` / `url` / `DEAD`). `DEAD` means the v1 Supabase link.

2. **Add it to `corpus/corpus.json`** with a `covers:` line saying what capability
   it exercises, and `model` matching what `pickParseModel` would choose.

3. **Read the actual manual before writing expectations.** Not optional:

   ```bash
   npx vite-node evals/manual-parser/inspect.ts -- --only=<name> --grep="filter|month"
   ```

   "The pre-filter is washed every 2 weeks" is a fact about one Coway model. An
   expectation asserting it for the wrong model turns the eval into a generator
   of false failures — which is how a suite stops being trusted, and then stops
   being run. Every expectation file carries a `grounded_in` field quoting what
   the manual actually says.

4. **Write `corpus/expectations/<name>.json`.** Each entry needs a `why`, and the
   `why` appears in the failure output — a failure that does not explain itself
   gets muted rather than fixed.

5. **Run it, then read what failed.** Expect to fix your own patterns first —
   three of the six failures in the very first full run were the expectations
   being wrong, not the parser (`app` matching inside "Appliance" flagged
   "Descale the Appliance", one of the best tasks in the corpus).

6. `npm run eval:parser -- --update-baseline`, and report the delta in the PR.

## Credentials and cost

- `ANTHROPIC_API_KEY` — only to **run**. Scoring needs nothing.
- `GOOGLE_APPLICATION_CREDENTIALS` — only to **download** a corpus PDF that is
  not yet in `.pdf-cache/`. Read-only, and it never writes to anyone's home.
- A full run is roughly **$4** and about 40 minutes. That is cheaper than one bad
  deploy plus a house full of wrong tasks.

PDFs are **not committed** — ~80MB of other people's appliance manuals does not
belong in git. `runs/` is committed, which is what keeps the score reproducible
without them.

## When to run it

- **Any change to `shared/parse/parsePrompt.ts`.** The prompt hash is stamped on
  every run, so a run whose baseline was recorded under a different prompt says
  so.
- **Before any model upgrade**, per the global CLAUDE.md rule. This is the suite
  that upgrade is measured against.
- **When a tester reports a bad task.** Add their manual, encode the complaint as
  an expectation, and it can never come back unnoticed. That is how a ring's
  findings survive past the week you had them.
