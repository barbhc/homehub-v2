# Manual-parser baseline — 2026-08-19

**Corpus score: 97.5 / 100** across 12 real appliance manuals, prompt `d564709261ca`.

Reproduce for free (scores the committed runs, no API calls):

```bash
npm run eval:parser -- --offline
```

| manual | score | rcl | prc | cad | care | safe | strc | tier | vol | tasks |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| furnace-york | 98.5 | 100 | 100 | 100 | 100 | 100 | 100 | 50 | 100 | 10 |
| dryer-lg | 97.0 | 100 | 100 | 100 | 100 | 100 | 100 | 0 | 100 | 10 |
| washer-lg | 98.4 | 100 | 100 | 100 | 100 | — | 100 | 50 | 100 | 14 |
| nespresso-vertuo | 90.9 | 100 | 67 | 100 | 100 | — | 100 | 100 | 100 | 8 |
| foodcycler | 100.0 | 100 | 100 | 100 | 100 | — | 100 | 100 | 100 | 7 |
| range-hood-zline | 100.0 | 100 | 100 | 100 | 100 | — | 100 | 100 | 100 | 7 |
| air-purifier-coway | 100.0 | 100 | 100 | 100 | 100 | — | 100 | 100 | 100 | 7 |
| ceiling-fan-haiku | 100.0 | 100 | 100 | 100 | — | — | 100 | 100 | 100 | 5 |
| ninja-creami | 100.0 | 100 | 100 | — | — | — | 100 | 100 | 100 | 8 |
| blender-kitchenaid | 100.0 | 100 | 100 | — | 100 | — | 100 | 100 | 100 | 4 |
| blender-beast | 91.9 | — | 100 | — | — | — | 100 | 0 | 100 | 5 |
| dishwasher-thermador | 93.2 | 100 | 75 | 100 | 100 | — | 100 | 100 | 100 | 8 |
| **CORPUS** | **97.5** | | | | | | | | | |

`—` means the dimension does not apply to that manual and was excluded from its
score rather than counted as a zero.

## What is strong

**Recall is 100% everywhere it is asserted.** Every task a manual genuinely
specifies — the lint trap, the drain-pump filter, three separate Coway filters,
the furnace filter, the range-hood grease filter, descaling — came out. The
"tasks silently disappear" fear that motivated the original harness is not
currently happening.

**Cadence fidelity is 100%.** The washer's Tub Clean arrives `monthly`, which
the manual states in those words; the Coway's three filters arrive at three
different intervals matching the table printed in its manual. Nothing was
softened to `as_needed`, which was the specific failure the prompt's SCHEDULE
FIDELITY section was written to prevent.

**Structural validity is 100% on all 12.** No truncation, every task carries
instructions, a justification and a plausible `source_page`, every chunk carries
`source_pages`.

**No hazardous DIY.** The furnace install manual is full of gas-piping and
combustion procedure written for a technician, and none of it came back as
homeowner steps.

## What it found — three things, all live in production today

### 1. The original regression never actually died

`nespresso-vertuo` still emits **"Replace Water in Tank After Weekend"**.

That is the exact task that started the entire task-curation effort. The manual
sentence behind it is a safety note — *"Replace water in water tank when the
appliance is not operated during a weekend or a similar period of time"* — and
refilling a water tank is operating a coffee machine, not maintaining one. It is
explicitly listed under NOT A TASK in the prompt, by name, and it is still here.

Nobody knew, because nothing measured it. That is the entire argument for this
directory.

### 2. "Refill the Rinse Aid Dispenser" is still a task

`dishwasher-thermador`. The canonical bad task, on the appliance class that
produced the canonical complaint. Same NOT A TASK rule, same outcome.

### 3. Essential-tier inflation on install-heavy manuals

Four manuals exceed their essential bound:

| manual | essential tasks |
|---|---|
| furnace-york | Replace the Air Filter · Verify Grounding and Polarity · Perform Gas Piping Leak Check · Confirm Combustion Air Supply |
| dryer-lg | Clean the Lint Filter · Inspect and Clean Exhaust Ductwork · Connect and Verify Gas Supply · Verify Electrical Connection and Grounding |
| washer-lg | Remove Shipping Bolts · Level the Washer · Connect Water Supply Lines · Connect and Secure Drain Hose |
| blender-beast | First-Time Parts Wash · Clean Blade Assembly |

**This one is a genuine disagreement, not an obvious bug, and it needs a human
decision.** The prompt says essential is "RARE — usually 0-2 per appliance" and
tells the model to self-check if more than ~2 are essential. The model produces
4 on every install-heavy manual. Read one way that is inflation. Read the other
way, a gas furnace really does have four safety-critical items and the prompt's
"0-2" is the thing that is wrong.

The eval's job was to make that visible and quantified rather than a matter of
opinion; the decision is Barb's. It is weighted at 3 points out of 100
deliberately, so a debatable dimension cannot dominate the score.

Note the washer row is also mildly suspicious in a second way: three of its four
"essential" items are one-time install steps. A setup task on the Setup
Checklist and an essential recurring reminder are different products.

## Soft coverage (reported, not scored)

- `range-hood-zline` did not emit a duct/blower task. Airflow is a NEVER DROP
  category, but the manual only covers ducting in its installation chapter, so
  this is defensible. Worth watching rather than fixing.

## Known coverage gaps in the corpus itself

Being explicit, because a gap you cannot see reads as coverage you have:

- **No refrigerator, no oven/range, no microwave.** Their manuals were lost when
  the v1 Supabase project was deleted; their `sourceRef` values are dead links.
  Re-upload one of each and add it here.
- **One image-only PDF** (`blender-beast`). It asserts no must-haves at all,
  because its text could not be read and inventing an expectation produces false
  failures. It still earns its place as the only manual exercising the
  vision-only path — a phone photo of a manual takes the same route.
- **Nine of twelve manuals come from one home.** The Thermador is from a second
  home, which at least proves the corpus is not single-tenant.
- **Only one manual (furnace-york) exercises the Opus escalation path.** It does
  exercise it — `pickParseModel` escalates on its `hvac-furnace` sub-type — so
  the stale note in `scripts/parse-eval/README.md` claiming that coverage was
  lost is wrong.

## Malformed replies — measured 2026-11-17

Not a score: a fault rate. The production request (`buildExtractionRequest`,
Sonnet 5, forced `record_extraction`) was sent 22 times across four manuals.

| | calls | arrays as sent | stringified, repaired | **malformed (unrepairable)** |
|---|---:|---:|---:|---:|
| first session (nespresso-vertuo ×2, ninja-creami, blender-beast) | 4 | — | — | **2** |
| re-measure: nespresso-vertuo ×3 | 3 | 3 | 0 | 0 |
| re-measure: washer-lg ×3 | 3 | 3 | 0 | 0 |
| re-measure: blender-beast ×6 | 6 | 5 | 1 | 0 |
| re-measure: ninja-creami ×6 | 6 | 2 | 2 | **2** |
| **all** | **22** | | | **4 (18%)** |

Every malformed reply was the same thing underneath: `chunks` or `tasks` sent as
one long string, with a JSON mistake inside it (an unquoted key; a stray quote
and newline before a key; twice, a `table_data` array never closed). They are
not repairable without guessing, and the scan failed in production each time.

**What changed (this PR):** the worker asks once more before failing
(`MAX_EXTRACTION_CALLS`). Two unusable replies in a row are needed to fail a
scan now — roughly the square of the per-call rate, so ~1–3% overall and more
for a manual that is prone to it (ninja-creami was 2 of 6).

**What did not help — both tried against the live API that day:**

- **`strict: true` on the tool** — refused: *"The compiled grammar is too
  large"*, for the full shape, with every nullable union removed, and even
  with only the `chunks` and `tasks` arrays in the schema. Same answer
  structured outputs gave on Opus on 2026-09-23.
- **Spelling out the array item schemas without `strict`** (a hint, not a
  constraint; accepted, +1,765 input tokens). On ninja-creami and blender-beast,
  6 calls each: 7 clean, 2 repaired, **3 malformed** — against 7 clean, 3
  repaired, 2 malformed for the unchanged tool on the same two manuals. No
  difference, so the schema stays as it is.

## Reading a future run

Two numbers move for two different reasons:

- **A drop of 2+ points fails the command.** That threshold is set above the
  pipeline's measured run-to-run noise (the predecessor harness measured 2–3
  task titles drifting per run with identical code), so it should mean something
  when it fires.
- **A rise is not automatically good.** Check *which* dimension moved. Precision
  going up while recall stays at 100 is a real improvement. Recall going up while
  volume-discipline fails is the parser transcribing the manual.

Re-baseline only when the change is deliberate and the delta is understood:

```bash
npm run eval:parser -- --update-baseline
```
