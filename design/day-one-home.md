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

## Release C — the reminder ask after Mark done

Owner asked for it on 2026-11-19 (idea 6 of the brainstorm). A new home never saw
Home's "Turn on notifications" nudge (it gives way to the first-minute cards), so
nothing could bring the person back. And iOS shows its permission dialog once per
install, so the ask has to come at a concrete moment.

- **When:** after a Mark done is SAVED (past its Undo), on an Essential task, once
  per device. Never when the answer is known: notifications on, refused (iOS will
  not prompt again), turned off on this phone, this ask declined here, or Home's
  nudge dismissed for this home.
- **What it shows:** the push that would arrive, word for word
  (`sampleReminder`, mirroring `composeMorning` in `push/lanes.ts`), and "We'd
  send this on May 21, the day it's due." from the Done receipt's next date; then
  everything the switch turns on (`WHAT_NOTIFICATIONS_SEND`).
- **Answers:** Turn on reminders → the system prompt (web push or APNs) → "Reminders
  are on" only on success; a refusal closes it; any other failure is said and the
  button stays. Not now (or closing the sheet) → never asked again on this device.
- **Code:** `src/hooks/useReminderAsk.tsx`, `shouldAskAfterDone` and
  `sampleReminder` in `src/lib/notifyGate.ts`, `nativePushPermission` in
  `src/lib/nativePush.ts`; the Done outcome now carries `nextDue`.
- **Events:** `reminder_ask_shown`, `reminder_ask_answered` (on, not_now, denied,
  error).
- **Time zone (fixed 2026-11-19, owner approved):** the sweep ran every lane on
  Pacific time, so "8am" was 11am in New York. Now each person's lanes run on their
  own clock: the app records the phone's zone at sign-in (`time_zone` in
  users/{uid}/private/preferences, `src/lib/timeZone.ts`), and the sweep reads it
  with the preferences it already loads (`localParts`/`validTimeZone` in
  `push/lanes.ts`). Per person, not per home. Anyone not yet recorded stays on
  Pacific until their next sign-in or app start.

## Release D — the monthly refresh ("This month at your home")

Owner asked for it 2026-11-19 (idea 7). The first-minute list was the part that
landed, and it ran once.

- **What:** the same list (`firstList`, same rules: at most three rows, at most two
  questions, one per system, timely), for this month, minus everything the home
  already has (archetype match against its tasks) or dismissed. **No fillers:** the
  year-round extinguisher and water-heater rows only top up onboarding's short
  list; offered monthly they would repeat every month.
- **When:** any working home, from the month after it was created (onboarding just
  showed that month's list), until the month is answered. It takes Home's one
  next-step slot; with nothing timely, the slot's usual card shows.
- **Answers:** Add → the checked tasks (due this weekend, as onboarding), then the
  month marked answered (`refreshAnsweredMonth` on the home doc, with any Yes/No
  answers as care facts) — for the whole home. Not now → the month marked answered.
  Partial failures are said; a retry adds only what is missing.
- **Code:** `src/components/home/MonthlyRefreshCard.tsx`, `src/lib/monthlyRefresh.ts`,
  `src/lib/firstListInput.ts` (shared with onboarding), `fillers` on `firstList`.
- **Events:** `monthly_refresh_shown`, `monthly_refresh_added`, `monthly_refresh_dismissed`.
- **Coverage, honestly:** the seasonal library has ten starters. For a Dallas house
  that already has alarms, taps and gutters, the card appears in September (HVAC
  service) and October–November (air filter) only. More months need more seasonal
  entries, each with a source — content for the owner to approve, not invent.
- **Seasonal entries (owner approved 2026-11-20):** radon test (January, houses),
  leak check (March), A/C tune-up (spring, asks "central air?"), chimney inspection
  (before the first fire, asks "fireplace or wood stove?"), alarm batteries (March and
  November) and the termite inspection (April–May, houses). Monthly card only;
  onboarding is unchanged. She dropped the fire-drill and draft-sealing drafts.
  A No to any question removes the task for good; Not sure asks again next season.
- **Termites by zip:** `shared/area/termites.ts` holds the VA's wood-destroying-insect
  inspection list (states and counties, updated July 2025). A zip lookup stores
  `area.termites`; where it is true the card offers the inspection without asking,
  where false it is not offered, and homes looked up before this change are asked.
  Her own answer always wins.
- **Not built:** a notification on the 1st. It needs a new push lane (functions
  deploy) and the owner's call on whether a monthly ping is welcome.
