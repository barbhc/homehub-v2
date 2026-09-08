# Home, focused — design doc (draft for the build branch)

_Chosen by the owner on 2026-09-08 from the "Homehub Home, focused" canvas
(page "Chosen · H1 with firmer edges"). One page: data model, edge cases,
failure modes, what "done" means._

## The one question Home answers

**What needs me this week?** One greeting, the Ask bar, one list titled
*This week*, and below it only what is timely. Everything else Home used to
show (the stat band and its dead tap, the swipe face and dots, *Coming up*,
the 7-day strip, standing Guides and Warranties) is gone from Home and lives
where it already had a door: Tasks, Clean, Items.

## The list

- Source: the existing week feed (`getWeekReminders` / `getWeekAgenda`),
  the same rows *This week at home* and *Coming up* were drawing from — so
  every task on Home appears **once**.
- Order: the current hero ordering (`urgentTasks` → lead first), then the
  forward rows by due date. Capped at 5; the footer is `All tasks ›` and
  nothing else.
- Row: title · item name · window phrase · minutes · caret. The lapsed
  phrase stays "Been a while".
- **The first row opens by default.** Tapping any row opens it the same way
  and closes the open one (accordion, one open at a time).

## The open row (H1)

- The row itself expands, edge to edge inside the list card: wash fill
  `#E4EEE9`, 2px teal edges left and right (`rgba(27,107,90,.45)` inset),
  caret flipped. No inner border, no inset card.
- Inside, in order: three pills (when · cadence · minutes); **one prep
  line** only when the task needs something ("You'll need an Affresh washer
  tablet." / "Schedule a visit with your HVAC technician."); actions:
  *Mark done*, *Snooze*, *See details*. No kicker, no how line — the steps
  live behind *See details* (the existing task view).
- Prep line sources: the template's `supplies[]` names (first one, or "and
  N more"); a pro task (`actor === "pro"` / risk that requires a pro) gets
  the technician line, naming the provider category if the home has one.

## Vocabulary change (shared)

`windowPhrase`: "Sep-ish" → "In Sep", "Oct-ish" → "In Oct". One change in
`shared/care/dueWindow.ts`; Tasks, Coming up, the item page and Your week
follow. Update the pinned tests.

## Below the list — timely only

- A warranty ending within 60 days: one line, "<Item> warranty ends <date>
  · Details". Otherwise nothing.
- Nothing else standing. The Deep-clean guides and Warranties sections leave
  Home (Clean tab and Items keep them).

## The quiet week

No rows in the window → one card: "All quiet until <date>. Nothing is late.
Next up: <task>." and the list shows the next two ahead under
*Coming this week*, then `All tasks ›`. Never an empty section.

## Edge cases

1. **A task with no item** (home-level): item name reads "Home".
2. **A lapsed safety task**: row phrase "Been a while"; inside the open row
   the safety note (existing `safetyNote`) replaces the prep line's slot, in
   clay, calm wording.
3. **More than 5 in the window**: the list shows 5 and the footer stays
   `All tasks ›` — no count in the footer (the count is the list on Tasks).

## Failure modes

- Feed fetch fails → the list shows an error row with *Try again*, never a
  false "All quiet" (the existing ThisWeekSection contract; keep its test).
- Mark done / Snooze fails → the row stays open and says so (existing
  `RefinedWeek.failure` contract).
- Warranty fetch fails → the timely line is simply absent (it is optional
  by definition); the error is logged, not shown.

## Done means

- Home renders: greeting, Ask, *This week* with the first row open, footer,
  timely line when due. Nothing else. Mobile and desktop.
- The stat band, drawer, strip, guides and warranties sections are removed
  from Home (and their tests retired or moved).
- "In Sep" everywhere; the dueWindow tests updated.
- Unit: accordion (one open; first open by default; any row opens),
  prep-line derivation (supply / pro / none), timely-line gate (60 days),
  quiet state. Emulator walk: open a row, mark done, see it leave; failure
  path visible. Four-suite gate green. Screenshot beside the chosen board.

## Backlog (deliberately not built)

Supply counts on hand; booking the technician from the task (PR #201).
Per-person Home modules (the "Flexible Home" page) — after this ships.
