# Due windows — when a task is "due" without a deadline

**Status**: backlog, approved direction (owner, 2026-08-20) — not scheduled
**Owner ask, verbatim intent**: maintenance rarely has to happen *by* a date; date-specific "overdue" triggers unnecessary stress. Filters should be done *within a window*. Propose the change and the per-category considerations.

## The problem in the current model

Everything downstream of the parser speaks deadline:

- `taskInstances.dueDate` is a single `YYYY-MM-DD` (`weekAgenda.ts:28`)
- overdue is `dueDate < today` (`homeUpkeep.ts:73`) — softened once already in
  `weekAgenda.ts:95` (essential-tier + previously-completed only), which is
  evidence this model has been fighting us
- the parser collapses whatever the manual said to `schedule_type` +
  `interval_days` (`parseCore.ts:80`) — "every 6–12 months" becomes one number
- `sendPushDaily` selects `dueDate <= today` (`sendPush.ts:118`) — a day-of
  alarm for things that were never day-of obligations

Result: red urgency on a filter change. False urgency trains people to ignore
red, which spends the credibility we need for the rare true deadline (recall,
warranty expiry). This contradicts both product principles — *timely* (RUT) and
*suggest, never assume*.

## Proposal: due semantics become a kind, not a date

```
dueKind: "window" | "deadline" | "seasonal" | "usage"
```

| Kind | Meaning | Agenda language | Overdue? |
|---|---|---|---|
| `window` (default) | target ± tolerance derived from cadence | "Sometime this month" | Never. Past-window = **"been a while"** — quiet, no red |
| `deadline` | a real calendar date | "By Sep 30" | Yes — the only kind that earns red |
| `seasonal` | anchored to climate, not calendar | "Before first frost" | Soft — the closing season is the pressure |
| `usage` | runtime or an indicator | "When the filter light comes on, or ~8 months" | No — framed as a *check* whose outcome may be replace |

**Window widths from cadence** (defaults, per-task overridable):
weekly ±2d · monthly ±1wk · quarterly ±3wk · semiannual ±1mo · annual ±6wk.

**Ranges are windows for free.** Manuals say "every 6–12 months"; the parser
currently picks one number. Capturing `intervalDaysMin/Max` *is* the window —
next target = last-done + min, window closes at last-done + max.

**The user's own date outranks our semantics.** A date set by hand in
TaskEditSheet stays a real date with real overdue — their choice, reversible,
per *suggest-never-assume*.

## Data model (minimal delta)

- `taskTemplates`: `+dueKind` (default `"window"`), `+intervalDaysMin/Max`
  (nullable; when absent, width derives from cadence), `+seasonAnchor`
  (nullable; e.g. `"before_first_frost"`, resolved via the home's climate
  facts — `freezeRisk` already exists and already suppresses winterizing for
  freeze-free homes).
- `taskInstances`: `dueDate` **keeps its meaning as the window target** —
  unchanged writes, unchanged reconciliation (`planTaskReconciliation` stays
  pure, untouched). `windowStart/windowEnd` are **computed at read time**, not
  stored — the denormalized-instance-drift incident (v2 PR #19 era) is the
  standing argument against persisting anything derivable.
- No rules change; no index change (reads still key on `dueDate`).

## Rollout — presentation first, schema later

1. **Phase 1 (pure presentation, zero migration)**: derive window from the
   existing cadence at read time. Agenda copy becomes window phrases; "N
   overdue" on Home becomes "N waiting" counting only deadlines + essentials far
   past window; `sendPushDaily` batches into a weekly digest ("3 things worth
   doing this month") for window-kind, day-of push only for deadline-kind.
2. **Phase 2 (parser)**: `EXTRACTION_TOOL` gains `dueKind` + interval ranges.
   Golden-set eval run **before** deploy per non-negotiable #5; prompt change
   routes through `scripts/parse-eval/run.ts`.
3. **Phase 3 (usage signals)**: check-filter tasks framed as checks; indicator
   reset tasks (the Core 300's "Reset the Check Filter Indicator" already
   exists) linked to their replace task.

## Category considerations

| Category | Kind | Note |
|---|---|---|
| HVAC / purifier filters | usage → window fallback | manuals give ranges; purifiers have indicator lights; frame as *check* |
| Smoke/CO detector test | window, **firm** | the safety exception — tight window, the one honest firmer nudge |
| Gutters, winterize, AC service | seasonal | climate-anchored via existing profile facts; a fixed date is absurd here |
| Water heater flush, coils, gaskets | window | wide (±1–2 mo) |
| Warranty, registration, recall response | deadline | keep exactly today's behavior |
| Deep-clean guides | none | already a library; never dated |
| After-each-use habits | none | `afterEachUse` already outside the date system |

## Edge cases

1. **Task never done once** (no last-done anchor): window anchors to creation
   date + interval, same as today's first `dueDate`; `rollForwardNeverStarted`
   keeps working untouched because `dueDate` is still the target.
2. **User completes far outside the window** (early or "stretched"): next
   target = completion + min-interval, window from ranges — early completion
   must not shrink the next window (no punishment for diligence).
3. **Seasonal task in a home with no climate profile**: degrade to a wide
   annual window with the season named in copy ("usually autumn") — never
   block on a profile fact, never assert a local date we don't know.
4. **Legacy instances during Phase 1**: no data changes, so mixed old/new
   clients render the same `dueDate` — old clients just say "due", new say
   the window phrase. No coordination needed.

## Failure modes

- **Everything becomes a window and nothing ever happens** → the weekly digest
  and the "been a while" state are the counterweight; watch task-completion
  rate per cohort in PostHog for a month before/after Phase 1.
- **A true deadline mislabelled as window** (parser error) → deadline set is
  allowlist-seeded (warranty/registration/recall), not parser-trusted, until
  the eval proves the parser's precision.
- **Push regression** — the digest accidentally silencing deadline pushes →
  failure-path test: a deadline-kind instance due today must still produce a
  day-of push.

## Done means

- A monthly filter task shows "Sometime this month", never red, and a month
  past target shows "been a while" in muted styling.
- A warranty expiry still goes red and still pushes day-of.
- Push volume for a 10-item home drops to ≤1 digest/week + true deadlines.
- Parse eval: cadence-range fixtures ("every 6–12 months") produce min/max, not
  a collapsed midpoint; score delta reported in the PR body.
- No write-path change to instances in Phase 1 (diff proves it).
