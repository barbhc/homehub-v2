# Due windows — when a task is "due" without a deadline

**Status**: backlog, approved direction (owner, 2026-08-20) — not scheduled
**Composes with**: P2-7 chosen option B (confirm-next-date) — see Prior art
**Owner ask, verbatim intent**: maintenance rarely has to happen *by* a date; date-specific "overdue" triggers unnecessary stress. Filters should be done *within a window*. Propose the change and the per-category considerations.

## Prior art — what was already decided, and what this is not

The design handoff's P2-7 exploration (`design/explorations/feat-due.jsx`)
covered **completion mechanics** — what happens at "Mark done" — and chose
option B, *confirm-next-date* (a sheet: "when did you do it?" + adjustable next
date). That decision stands; this doc does not reopen it.

Due windows govern the other axis: what "due" MEANS while a task is pending.
The two compose: the confirm sheet's "Next due {date}" becomes "Next: {window
phrase}" with the same ± adjustment, and its seasonal-anchor behavior ("anchor
to a month") is an early ancestor of `seasonal` kind. This also continues the
2026-04-25 principle reset ("the app treats the user as a partner, not a
delinquent") and the existing essential-only overdue softening.

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

### Status (2026-08-20)

- **Phase 1 — SHIPPED** (#126) plus the push digest (#127).
- **Phase 2 — SHIPPED** (#128): interval ranges extracted, validated, and
  deployed. `dueKind` was deliberately NOT added to the extraction schema.
  Client inference already covers window / deadline / seasonal, Phase 3 covers
  usage from data already extracted, and each prompt change costs a full eval
  cycle (~$5) against a harness with real run-to-run variance. Revisit if the
  inference is ever seen to mislabel something.
- **Phase 3 — SHIPPED** by inference rather than a prompt change
  (`shared/care/usageSignal.ts`). An item that has a "Reset Filter Cleaning
  Indicator" task demonstrably HAS an indicator, so its filter work is
  indicator-driven. Verified against the owner's 429 real templates: 4 tasks on
  one range hood reframed as checks, and the same item's "Check LED Light
  Operation" and "Replace LumiLight LED" correctly untouched — a looser rule
  would have turned a bulb replacement into a filter check.
- **Seasonal × climate — SHIPPED** (`shared/care/seasonalWindow.ts`). A
  seasonal task states its season, and the months shift with the home's climate
  band: a cold home's autumn work closes in October, a mild home's in November.
  With no climate answered — the owner's own home today — it degrades to the
  season-wide window and drops the local claim entirely ("Usually autumn", not
  "usually autumn here"), because naming a local month would assert something
  about their home we have not verified. Season inference reuses
  `seasonalFamily` rather than adding a third copy of the winterize keyword list.
- **Known limit**: a task is only treated as seasonal when its `scheduleType`
  IS `seasonal`. A winterize task the parser filed as `annual` gets an annual
  window instead — less specific, but not invented. Widening the gate on title
  alone would manufacture a season the parser never claimed.

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

## Decisions from mockup review (owner, 2026-08-20)

- **Safety pressure approved**: "Monthly check · skipped July" is the right
  firmness for smoke/CO detectors — honest, dateless, no red.
- **Window phrasing**: short forms win — "Oct-ish" over "anytime this fall".
- **Agenda group header**: "Coming up" (reusing the header Home already
  taught), not "Windows opening soon".
- **Completion is one tap, adjust by exception.** "Mark done" completes
  immediately, assuming today, and announces the next window in a calm bar
  ("Done — next window around Oct 2 · Sep 25 – Oct 16") with two quiet text
  actions: **Adjust** (reveals when-did-you-do-it + ±week — P2-7's mechanics,
  now behind the exception) and **Undo**. The review found the always-open
  sheet overwhelming: six tappable things to answer a question the app could
  assume. Confirm-next-date's intent survives — the next window is always SEEN
  before leaving — with five fewer buttons on the happy path.

## Done means

- A monthly filter task shows "Sometime this month", never red, and a month
  past target shows "been a while" in muted styling.
- A warranty expiry still goes red and still pushes day-of.
- Push volume for a 10-item home drops to ≤1 digest/week + true deadlines.
- Parse eval: cadence-range fixtures ("every 6–12 months") produce min/max, not
  a collapsed midpoint; score delta reported in the PR body.
- No write-path change to instances in Phase 1 (diff proves it).
