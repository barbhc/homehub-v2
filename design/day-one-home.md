# Day-one Home

Owner approved the mock on 2026-11-19 (https://claude.ai/artifact/DojkMCKSt3mJgh3WGQ4tAz),
after testing the zip onboarding and finding that Home ended in a dead end: three
tasks, then one high-effort "Snap a label" card. Research and the nine ideas this
comes from: https://claude.ai/artifact/NPGJgBFjb6an8o4TjpMFFS

Two releases:

| Release | Pieces | Ships by |
|---|---|---|
| A (this) | Coming up line · "What's in your home?" · one question | Hosting |
| B (next) | Ask answers with no manual (general guidance) · two starter questions under Ask | Functions deploy (owner approval) + hosting, with an eval set |

The starters wait for B on purpose: today they would lead straight into "I couldn't
find anything in your manuals".

## What the person sees

Below This week, in this order. Home stays one list plus one line plus one card.

1. **Coming up.** One line naming the next due month after this week, and up to two
   tasks in it: "Coming up in March: clean the gutters and test smoke and CO alarms."
   Hidden when the week is quiet (the quiet week already says what is next).
2. **One next-step card**, for an early home only (fewer than 3 items). Which card:
   - **0 items, not dismissed → "What's in your home?"** Chips for appliances the care
     library has care for. A tap SELECTS (no write) and shows that appliance's typical
     care inline, essentials pre-checked. "Add" creates the item and the checked tasks.
     "Not now" on the card hides it on this device.
   - **otherwise, while an unanswered question has something to add → one question.**
     Yes / No / Not sure. Yes saves the fact and then offers the task(s) it unlocks
     (Add / Not now). No saves the fact. Not sure skips it on this device.
   - **otherwise, 0 items → "Snap a label"** (today's card). Otherwise nothing.

## Data model

Nothing new is stored, except two per-device conveniences in localStorage
(`hh.dayOne.appliancesDismissed.<homeId>`, `hh.dayOne.skipped.<homeId>`).

- An appliance from a tap is an ordinary item: `displayName` = the chip label,
  `category` = the library kind, no brand/model, the usual room when one exists.
- Its tasks are ordinary library tasks (`addLibraryTask`): same provenance, same
  rollback. Checked essentials start this week (`firstDueDates`, as onboarding does).
  Everything else starts one cadence out, as any library add.
- A water heater also sets `careFacts.has_water_heater = true` (the person just said
  they have one).
- Answers write `careFacts` through `upsertHomeProfile`, the same field the Settings
  questionnaire writes. "Not now" on an offered task writes `dismissedCare`.
- `DashboardStats.comingUp` is derived from the open instances already read for
  `nextUp`; no new query.

## Rules it keeps

- Suggest, never assume: a tap adds nothing; tasks are added only on Add.
- The manual wins and nothing doubles: a library entry whose archetype any existing
  task already matches (the onboarding air filter, say) is not offered again.
- Honest gaps: appliances whose kind has no library care (microwave, oven) are not
  offered, because tapping them would give nothing.
- No totals, no progress bars, no counts of how complete the home is.

## Edge cases

1. **Tap, then Add fails half way** (item saved, a task refused): the card says so,
   keeps the unadded tasks checked, and the button retries only those. The item is
   not deleted: the person did say they have it.
2. **Second home or switching homes mid-add**: the card is keyed by home id; a result
   that lands for a home no longer shown is dropped.
3. **Settings questionnaire already answered**: answered facts are never asked again;
   a fact whose entries are all covered or dismissed is skipped.

## Failure modes

- Template read fails → the card says it couldn't load and offers Try again; it never
  shows chips with unknown duplicates.
- Profile save fails → the question stays, with the error under it.
- The dashboard read fails → Coming up does not render (the list above already shows
  the failure).

## Done means

- Unit tests for the pure rules (`shared/care/dayOne.ts`), the coming-up derivation
  and the card states, including each failure above.
- Walked on the seeded emulator at phone width: tap Furnace → Add → the tasks appear
  in This week, the chip shows added; answer a question → Yes → Add; Coming up shows.
- Hosting deployed and the live bundle checked.

## Measuring it

New events: `home_kind_added` (kind, tasks), `home_question_answered` (fact, answer),
`home_question_task_added` (key). The number to watch: share of new homes that add a
second thing (task, item or answer) in their first week.
