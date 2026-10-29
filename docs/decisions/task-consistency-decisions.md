# Task consistency — three decisions for the owner

**Status:** decided 2026-10-28 (one follow-up question open, under C) ·
**Written:** 2026-10-28 · **Source:** Package 2 of
`HOMEHUB_IMPLEMENTATION_HANDOFF_2026-10-28.md` and the matching findings in
`HOMEHUB_PRODUCT_AUDIT_2026-10-28.md`.

## Owner decisions, 2026-10-28

These supersede the options and recommendations below. The analysis is kept
as the record of what the app did before each decision and why.

- **A — Reminder Off: "Off wins, no exceptions."** An explicit Off on a task
  is silent in every notification style and every push — including deadlines
  and overdue safety work. (Chosen over the recommended option 1, "except
  safety".) "Everything on a schedule" means everything you have not switched
  off. A task you never chose about still notifies as before, deadlines and
  lapsed safety work included. Off is about notifications only: the task stays
  on Home and in Tasks.
- **B — Changing how often a task repeats: "From when you last did it."**
  Next due = last completion + the new cadence (never done: the date it was
  added + the cadence). One rule across all three editors; show "Next due:
  <date>" before saving; changing to seasonal asks for the season when we
  don't know it (no ten-year parking); a snooze survives only if it is later
  than the new date; as-needed/setup remove the open occurrence; history is
  never rewritten.
- **C — Re-scans: "Keep mine, show differences."** Per-field provenance for
  priority, cadence, reminder and kind; a re-scan updates only the manual's
  suggestion; the review shows "You chose X · the manual now says Y",
  defaulting to yours; accepted changes update the open occurrence; a save
  checks for other members' newer edits. Built in two steps: record
  provenance first (no visible change), then switch the re-scan.
  **Still open:** for existing tasks that have `userModifiedAt`, treat all
  four fields as the owner's, or none — to be asked when step 2 is built.

**Built so far:** A — one shared decision, `taskNotifies` in
`shared/notifications/preferences.ts`, used by the morning, digest and
buy-ahead pushes, /week and the task page's reminder switch; the push sweep
also applies Home's cold-storage rule. B and C are not built yet.

*The analysis as written before the decisions:* the PR that added this
document fixed only an engineering bug (the item review matched tasks by name
— see the PR). The three
questions below change what a user's choice *means*, so they are yours to make.
Each section says what the app does today, with the file and line that does
it, where that goes wrong for a real household, two or three ways to fix it,
and a recommendation.

Line numbers are as of `main` at 333615e.

---

## A. What does turning a task's reminder **off** mean?

### What happens today

A task has one switch, "Remind me". It is stored on the task (`remindEnabled`:
on, off, or "never chose"). Whether your phone actually buzzes depends on that
switch **and** on the notification mode chosen in Settings, and two kinds of
message ignore both.

| Settings mode | Switch ON | Switch OFF | Never chose |
|---|---|---|---|
| Just my list (`curated`) | buzzes | silent | silent |
| My list + anything Essential (`curated+essential`, the default) | buzzes | silent | buzzes only if Essential |
| Everything on a schedule (`all`) | buzzes | **buzzes** | buzzes |

- The "Everything on a schedule" row is `shared/notifications/preferences.ts:174` —
  `if (mode === "all") return true`, before the switch is even read. A unit
  test pins this on purpose.
- **Deadlines ignore the switch in every mode.** The morning push lists any
  task due today whose name reads as a deadline (for example a warranty
  registration) with no check of the switch or the mode —
  `firebase/functions/src/push/lanes.ts:139`. Only the ordinary reminders on
  the next line (`:140`) are checked.
- **Lapsed safety work ignores the switch in every mode.** The weekly digest
  includes a task if you agreed to it *or* it is safety-critical and overdue —
  `lanes.ts:179` (`agreed(p, prefs) || p.safety`).
- **The switch does not decide what Home shows.** Home and the Tasks week list
  decide visibility from the task's type and scope (item cleaning is hidden,
  `shared/tasks/agendaEligibility.ts:26-28`), plus the cold-storage special case
  (`src/lib/dashboard.ts:46-47`, `src/modules/care/services/weekAgenda.ts:129`).
  So "reminder off" still leaves the row on Home.
- The phone sweep applies the same type rule (`push/sweep.ts:209`) but **not**
  the cold-storage rule, so a winterize task hidden from Home in a freeze-free
  home can still be a push candidate (audit finding; not yet proven on a phone).

### Where this goes wrong for you

- **Dryer door seal.** You turn its reminder off because wiping a seal does not
  deserve a buzz. If you ever switch Settings to "Everything on a schedule" it buzzes again,
  and nothing on the task tells you why.
- **Washer winterization.** You switch it off on a freeze-free home. Home hides
  it (cold-storage rule), the phone sweep does not apply that rule, and the
  task's own switch is overridden by "Everything on a schedule". Three surfaces, three
  answers.
- **Range-hood filter you DO want.** Switching it on works in every mode — the
  problem is only ever with "off".

### Options

1. **Off always wins, except a short, named safety list.** An explicit Off is
   silent in every mode. "Everything on a schedule" means "everything I have not switched
   off". The two exceptions stay (deadlines, lapsed safety) but are shown on the
   task: "Off — you will still get a safety reminder if this is overdue."
   *Trade-off:* someone who switched a genuinely dangerous task off and later
   expects silence still gets the safety note; that is the point, but it must be
   visible or it reads as a bug.
2. **Off always wins, no exceptions.** Simplest promise. *Trade-off:* a smoke
   alarm test switched off by accident never surfaces again. Conflicts with
   "safety beats silence" in the product principles.
3. **Keep today's rules, explain them.** Leave the logic, add copy under the
   switch per mode. *Trade-off:* cheapest, but "Everything on a schedule" overriding "Off"
   stays surprising however it is worded, and the Home/phone mismatch remains.

**Recommendation: option 1.** It keeps safety and makes Off mean off.
Separately, give Home its own rule (what is *shown*) and the phone its own rule
(what *buzzes*), both answered by one shared function so Home, Tasks and the
phone sweep cannot disagree — the audit asks for exactly this split, and a
single yes/no cannot express "keep it in my list but never buzz me".

**What you need to decide:** (a) option 1, 2 or 3; (b) whether the exception
list is "overdue safety work + deadlines" or something narrower; (c) whether an
Off task should still appear on Home (today: yes).

---

## B. What happens when you change how often a task repeats?

### What happens today

There are three places that change a task's cadence, and they disagree.

| Where you change it | The task itself | The occurrence you see now | A snoozed one | A task with no occurrence |
|---|---|---|---|---|
| Your reminders page (/reminders, turning a proposed reminder on) — `setTaskCadence`, `src/modules/care/services/taskService.ts:459-494` | updated | **keeps its due date**; the new rhythm starts next cycle | keeps due date and snooze | gets one, due one new cycle from today (`:482-487`); seasonal with no season → error |
| "This isn't right" feedback → cadence fix — `updateTaskSchedule`, `taskScheduleService.ts:39-109` | updated | **moved to today + new cycle** (`:91-101`) | moved too; snooze date left as is | **nothing created** — the change is invisible |
| Item "Review tasks" — `saveItemTaskReview`, `taskReviewService.ts` | updated | due date **unchanged**, label updated; moved to as-needed/setup → **removed** | unchanged; moved to as-needed/setup → **removed too**, snooze and all | gets one **due today** — even seasonal, ignoring the season |

Two more specifics:

- `updateTaskSchedule` has no case for seasonal, as-needed or setup: it falls
  to `addMonths(today, 120)` (`taskScheduleService.ts:34-35`) — **ten years
  out**. A cadence fix to "seasonal" quietly parks the task until 2036.
- Moving a task to "as needed" or "setup" in the review soft-deletes every open
  occurrence, **including a snoozed one** — the snooze is not kept anywhere
  (correct in that the task no longer has a date; worth knowing if you snoozed
  it deliberately). The other two editors leave a dated occurrence on a task
  that says it has no schedule.

### Where this goes wrong for you

- **Coway pre-filter, monthly → every 2 weeks** from the Reminders page: the
  current one still says "due in 3 weeks"; the faster rhythm only starts after
  that. From the feedback sheet the same change makes it due in 2 weeks from
  today. Same choice, two outcomes.
- **Washer winterize, changed to seasonal** through feedback: due date jumps
  ten years.
- **A task you snoozed to Saturday**, then changed to quarterly through
  feedback: its due date moves three months out, but it still carries the
  Saturday snooze.

### Options

1. **"From the last time you did it."** Next due = last completion + new
   cadence (or, if never done, the date it was added + new cadence). The
   current occurrence moves; a snooze is kept only if it is later than the new
   date; seasonal uses the season; as-needed/setup remove the open occurrence;
   history is never rewritten. Every editor shows "Next due: <date>" before you
   save. *Trade-off:* a task overdue under the old cadence may become overdue
   under the new one immediately — honest, but can surprise.
2. **"Starting today."** Next due = today + new cadence, everywhere (today's
   feedback behaviour, minus the ten-year bug). *Trade-off:* ignores history —
   tightening a filter clean you did yesterday makes it due a full cycle later
   than it should be.
3. **"Next time round."** Keep the current due date; apply the new rhythm after
   it (today's Reminders behaviour). *Trade-off:* the change you just made has
   no visible effect, which reads as "it didn't save".

**Recommendation: option 1**, with the resulting date shown before saving.
It is what a person means by "every two weeks", it respects what they already
did, and showing the date makes the consequence visible rather than assumed.

**What you need to decide:** the rule (1/2/3); whether a snooze survives a
cadence change; and whether changing to seasonal should *ask* for the season
when we do not know it (recommended) rather than fail or guess.

---

## C. What should a re-scan keep?

### What happens today

When a manual is scanned again, each newly extracted task is matched to an
existing one by name (`planTaskReconciliation`, `shared/parse/parseCore.ts:413`;
matching by name is correct here — the new extraction has no ids). For every
match, the **whole** stored task is overwritten with the fresh extraction
(`firebase/functions/src/parse/commitDraft.ts:224-226`, built at `:169-221`):

| Field | What a re-scan does to your choice |
|---|---|
| Priority (Essential/Recommended/Optional) | replaced by the model's tier (`commitDraft.ts:180`) |
| Cadence | replaced (`:210`), and the schedule's start date reset to today (`:215`) |
| Reminder switch | replaced by the review row's value; a row you did not touch sends "never chose", **erasing an explicit On/Off** (`:187`) |
| Kind (maintenance/cleaning) | replaced (`:175`), and the "user overrode this" marker cleared (`:176`) |
| Completion history | **kept** — done occurrences are separate records and are never deleted (non-negotiable 3) |
| Open occurrence | **not updated** — it keeps the old title, tier, kind and cadence label, so Home disagrees with the task (the drift bug class, see `denormSync.ts`) |

The review screen does show the re-scanned rows before you press Save, but it
shows the *model's* values, not "you had Recommended; the manual now says
Essential". `userModifiedAt` exists but records only *that* something was
edited, not *which field* — and the Reminders switch (`taskService.ts:409-425`)
does not set it at all.

House rules (learned from your past feedback) are re-applied during the scan
(`commitDraft.ts:89-104`), which protects some choices — but only the ones you
expressed as feedback, not ones you made directly on a task.

### Where this goes wrong for you

- **Coway pre-filter.** You set it to remind you every 2 weeks and marked it
  Recommended. A re-scan (say, after attaching the right model's manual) puts
  it back to the model's monthly and erases your reminder choice — and the
  review only shows "monthly", with nothing saying it was yours.
- **Dryer door seal.** You moved it to cleaning and turned the reminder off. A
  re-scan can flip it back to maintenance with "never chose" — it is back on
  Home and, in the default mode if the model calls it Essential, back on your
  phone.
- **Another household member** edits a task while you are reviewing a re-scan;
  your Save overwrites their edit with the model's values without either of you
  seeing it.

### Options

1. **Per-field "who set this" (recommended).** Store, for each of priority,
   cadence, reminder and kind, both the manual's suggestion and — if you
   changed it — your value, with who and when. A re-scan updates only the
   *suggestion*. Where the new suggestion differs from your value, the review
   shows "You chose Every 2 weeks · the manual now says Monthly — keep yours /
   use the manual's", defaulting to **yours**. Accepted changes update the open
   occurrence in the same save. A save checks each task's last-edited time and
   asks before overwriting a newer edit by someone else. *Trade-off:* the most
   work — a data change on every task, a migration that infers "user-set" for
   existing tasks (it can only guess from `userModifiedAt`, which is
   field-blind), and a richer review row.
2. **Lock the whole task once touched.** If `userModifiedAt` is set, a re-scan
   updates only the description/steps and never the four fields. *Trade-off:*
   cheap and safe, but all-or-nothing: correcting the tier also freezes a
   cadence you never looked at, so a genuinely better manual can't improve it.
   And the Reminders switch must start setting the marker.
3. **Keep overwriting, but show the diff.** Review rows that would change a
   saved choice are flagged "This replaces your setting" and default to
   keeping it. *Trade-off:* no new data model, but the flag can only be shown
   where we can tell a value was the user's, which today we mostly can't — so
   in practice it would flag too much or too little.

**Recommendation: option 1**, delivered in two steps: first start recording
per-field provenance on every editor (no visible change), then switch the
re-scan to update suggestions only and add the keep-yours row. Option 2 is a
reasonable stop-gap if a re-scan is likely before option 1 lands.

**What you need to decide:** option 1, 2 or 3; and for existing tasks, whether
any task with `userModifiedAt` should be treated as "all four fields are mine"
(safe, may freeze some fields) or "none are" (today's behaviour).

---

## Not decided here, noted for completeness

- **Stale review saves.** The item review loads tasks, you edit for a while,
  then Save writes all reviewed rows. The PR that adds this document makes Save
  match by task id (so it can no longer hit the *wrong* task) and refuses to
  save if one of the reviewed tasks was removed on another device meanwhile —
  deleted or archived — checked inside the same transaction as the writes
  ("Close the review and open it again"). It does **not** yet detect another
  member *editing* a reviewed task in between — Save still overwrites their
  priority/cadence/reminder. That belongs with the provenance work in C.
- **Library "back up this task" lookup** (`src/hooks/useCareSuggestions.ts:112`,
  `src/components/item-care/CareBlock.tsx:903`) still finds the task it backs up
  by exact name. With two identically named tasks on one item it can attach to
  the first one; a small follow-up, not a policy question.
