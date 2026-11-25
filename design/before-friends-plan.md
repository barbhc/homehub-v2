# Before-friends fixes 1–3: implementation plan

Written 2026-11-24 for the executing agent. The owner approved the designs over four
rounds of mockups: https://claude.ai/artifact/T7uTBLZttF7hvXA3d95m4X (version 4, plus two
later comments recorded below). The page builder with every "must be true" list is
`scratchpad/shots/mocks/page/build4.py`; the shots are the `r3-*` / `r4-*` PNGs beside it.

Read `CLAUDE.md` first. Its seven "claiming something is done" rules apply to every
step here, and three of them shaped this plan: write claims from the diff (1), put the
built screen beside the mock before saying it matches (2), and grep every call site
when a prop changes behaviour (6).

## What ships, in four PRs

| PR | Branch | Contents | Deploy |
|---|---|---|---|
| A | `fix/before-friends` (exists, has fixes 4–8) | The words (mock 3 and /beta), the item page's no-manual card (mock 2, card only), "Don't Add" | Hosting |
| B | `feat/whats-in-your-home` (new, from main after A) | Smoke and carbon monoxide split, the empty-Home card (mock 1), Add My Exact Models, the collapsed line | Hosting |
| C | `feat/item-what-is-it` (new, from main after B) | The item page's "What is it?" fallback | Hosting |
| D | `feat/manual-replaces-typical` | The manual review's Replace or Keep Both | **Functions and hosting. Do not start without the owner's yes.** |

PRs A, B and C touch no Functions, Firestore rules or storage rules. If a step in them
seems to need one, stop and report. PR D changes the `commitManualDraft` function,
and a functions deploy needs the owner's approval each time.

Ship A before starting B. A is the low-risk half and the owner sends the TestFlight
link tomorrow; B and C follow as each goes green.

This plan was reviewed adversarially by Codex on 2026-11-24. Its eleven findings are
folded in; the three blockers are marked "Codex" where they changed the design.

## Decisions already made (do not re-open)

1. Option A: an "Add My Exact Models" button on the card. Option B is dropped.
2. All mock 3 wording is final, exactly as in the table in section A1.
3. "Not This One" becomes "Don't Add" (owner comment, 2026-11-25).
4. The Replace panel is plain, not tinted, and short (owner comment, 2026-11-25:
   "very wordy and hard to read because it's green on green").
5. The "This month at your home" card does not appear on an empty Home.

## Decisions this plan makes (flag each in the PR body; the owner has not seen them)

| # | Decision | Why |
|---|---|---|
| D1 | A ticked appliance becomes an item when its first task is added, as today. It is not created at "See Suggested Care". | Creating it earlier leaves items with no tasks, which drops Home into the "No upkeep yet, add a manual" state. Today's `AppliancePanel` already works this way. |
| D2 | Replace archives the typical task. It does not move the last-done date to the manual's task. (PR D) | The sentence promising it was cut for length, and moving dates between task series touches instance data that has drifted before (memory: denormalized instance drift). |
| D3 | On an empty Home, ticking "Smoke alarms" offers the alarm test only. The yearly battery change stays where it is offered today (Tasks → Suggested, and the monthly card in March and November). | The mock shows one row per safety chip. |
| D4 | The carbon monoxide (CO) task says "Most last 5 to 10 years", not the mock's "7 to 10". | Makers differ: Kidde says 7 to 10, others 5 to 7. The date on the unit is what counts. |
| D5 | The old "What's in your home?" card (homes with tasks but no items) keeps its design. Only its footer changes, to match Option A. | Rebuilding it is unmocked. Follow-up: one card for both states. |
| D6 | After "Add" on the item page's no-manual card, the page shows the task under Maintenance and any remaining suggestions in the existing Suggested band. The row does not sit there reading "Added". | The card exists only while the item has no tasks. |
| D7 | A typical task she already ADDED keeps a way out, relabelled from "Not this one" to "Remove". Only an un-added suggestion says "Don't Add". | The item page has two "Not this one" controls. "Don't Add" is wrong on a task that is already added. |
| D8 | The shared label for refrigerators becomes "fridges". | The mock says "most fridges", and the chips already say "Fridge". |
| D9 | "Done" with nothing added leaves the one-line "Tell us what's in your home" row, the same as Not now. | Home is still empty, so the card's place cannot be blank. (Codex) |
| D10 | The feature tour does not start in the visit where the card finishes. It starts on the next visit to Home, as it does today after the old empty screen. | `useFeatureTour` checks once, 600 ms after mount. |
| D11 | In the manual review, a match found only by similar wording defaults to Keep Both. Only a same-kind-of-task match defaults to Replace. (PR D) | "Replace water inlet hoses" scores 0.67 against "Replace the water filter". (Codex) |

## Step 0: before any code

1. Stop the session's leftover servers. They hold port 5283 and an emulator stack, and
   Playwright's configs use `--strictPort` with `reuseExistingServer: false`:
   background tasks `b6fk4az0a` (emulators), `brv6cqs4t` (vite on 5283), `b4moaroyh`
   (static server on 5291). Confirm nothing listens on 5283, 8080, 9099, 9199.
2. In `~/.homehub-worktrees/before-friends`: `git fetch origin && git rebase origin/main`.
   The branch has two unpushed commits (fa04c35, 3ac8a9d) on fe206f0; main is now
   b5d3c64 (PR 304, which adds `public/beta.html`). Expect no conflicts.
3. `node_modules` in that worktree is a symlink to the main checkout. Vite then refuses
   font files outside its allow list. Replace it with a real install
   (`rm node_modules && npm ci`) before running any browser suite. The `.env` copy stays.
4. Baseline, on the rebased branch, before editing: `npm run build`, `npm run lint`,
   `npm run check:design`, `npm test`. All green, or stop and report what is red.

---

## PR A: words, the item card, "Don't Add"

### A1. Words (mock 3)

Exact strings. "Today" must not render anywhere afterwards; "Proposed" must appear
exactly as written. No changed string contains an em dash.

| Where | Today | Proposed |
|---|---|---|
| `Landing.tsx` hero (line ~136) | Items, manuals, warranties, maintenance and a built-in assistant — organized to effortlessly care for your home. | Items, manuals, warranties, maintenance and a built-in assistant, organized to effortlessly care for your home. |
| `Landing.tsx` Inventory | Scan a label or snap a photo. Homehub identifies the model and files it by room. | Model, purchase date, warranty and manual for every appliance, kept in one place. |
| `Landing.tsx` Maintenance | From your real manuals, not generic advice — with calm reminders so nothing slips. | Common upkeep for what most homes have, plus the exact schedule from your manual when you add one. Proactive reminders so nothing slips. |
| `Landing.tsx` Ask | Ask a question to any item's manual and get a clear, sourced answer in seconds. | Ask about anything you own. With its manual you get a clear, sourced answer; without one, general guidance. |
| `Landing.tsx` step 1 | Add your home's items / Photo, scan, or search — a few taps each. | Set up in a minute / Your zip code and type of home are all it takes to get started. |
| `Landing.tsx` step 2 | We build the care plan / Tailored to your manuals and your home. | We build the care plan / Tailored to your home, your climate and what you own. |
| `Landing.tsx` step 3 | (unchanged) | (unchanged) |
| `tourSteps.ts` step 1 | Home is what your house needs from you, most important first — straight from your manuals, not generic advice. It appears here on its own; notifications on your phone are separate, and yours to allow. | Home is what your house needs from you: what's due now, what's coming up, and a place to ask questions. |
| `tourSteps.ts` step 3 (Items) | Add anything you own that came with a manual. We'll read it for the upkeep, the cleaning and the how-tos. | Add what you own. Common things get their typical care; add a manual and we'll read it for the exact upkeep, the cleaning and the how-tos. |
| `tourSteps.ts` step 4 (Ask) | Why it's beeping, which filter it takes, how to reset it after a power cut — ask anything about anything you own, and the answer comes straight out of that item's own manual. | Why it's beeping, which filter it takes, how to reset it after a power cut. Ask about anything you own; once you've added its manual, the answer comes straight out of it. |

Tour steps 2 and 5 are untouched, and the order and targets do not change. The long
comment above tour step 1 explains why the notifications sentence existed (HH-144);
keep the comment and add one line saying the owner replaced the sentence on 2026-11-24.

`public/beta.html` (live at /beta), words only:
- Line ~222, the Inventory `feature-text` (today: "Scan a label or type the brand and
  model. Homehub files each item by room, with its manual, warranty and notes in one
  place." Read the rebased file; this branch does not have it before Step 0): replace
  with "Model, purchase date, warranty and manual for every appliance, kept in one place."
- Line ~224: delete the "By room," bullet.
- Line ~238: "calm reminders so nothing slips" → "proactive reminders so nothing slips".
- Nothing else. Its zip-first setup steps stay. Image alt text stays (it describes the
  screenshot, which does group by room).

Tests: grep `src`, `e2e`, `design` for each "Today" string and update any pin. Add one
unit test file `src/lib/copyBeforeFriends.test.ts` that reads `Landing.tsx`,
`tourSteps.ts` and `public/beta.html` as text and asserts each proposed string is
present, each replaced string absent, and none of the proposed strings contains "—".
`design/hh-landing.jsx` is a design reference, not shipped code: leave it.

The landing visual baseline is CI-baked. Do not commit local pixels; note in the PR
body that the `landing` baseline needs re-baking by the workflow.

### A2. The item page's no-manual card (mock 2, shots `r4-m2-dish-after`, `r4-m2-fridge-after`)

Where: `src/components/item-care/CareBlock.tsx`, the `if (nothing && !critical)` branch
(line ~985). Today suggestions are computed (line ~903) but never rendered in this
branch, which is why a name-only "Dishwasher" shows only "No upkeep yet".

Behaviour:
- `!hasManual` and `suggestions.length > 0`:
  - Headline: "No upkeep yet".
  - Line: "Here's what most {kindLabel} need. Add the manual for this one's exact schedule."
    `KIND_LABELS` is imported from `src/components/care/kindLabels.ts`. Its
    refrigerator value is "refrigerators"; change it to "fridges" there AND in the
    second map at `shared/care/library.ts:333` (the review's "Typical for …"), then
    grep `src`, `shared`, `e2e` for "refrigerators" and update pins (D8).
  - Up to two suggestion rows (`suggestions.slice(0, 2)`), each a bordered row: title,
    then `cadenceLabel · N min` (or "Call a pro" in place of minutes when `entry.pro`),
    then an outlined "Add" button and a text "Don't Add" button.
  - Then the filled "Add the Manual" button (Title Case; it is "Add the manual" today).
- `!hasManual` and no suggestions: headline "No upkeep yet", today's line ("The manual
  is where this item's schedule, warranty window and answers come from."), the filled
  "Add the Manual" button. (PR C adds the "What is it?" chips here.)
- `hasManual` (a manual with nothing found): unchanged.
- The `reading` and `manualAwaitingReview` branches above it: unchanged. They must
  still win over this branch (`chrisRound1.test.ts` pins the order).

Implementation:
- Give `SuggestedRow` a `variant?: "band" | "card"` prop, default `"band"` (the safe
  default: every existing caller keeps today's row). `"card"` renders the mock's row:
  bordered, no "Suggested" pill, no how/why lines, outlined Add, text "Don't Add".
  Backstop suggestions cannot occur here (they need an existing task), so the card
  variant does not handle `backstopFor`; assert that in a comment and render the band
  variant if one ever arrives.
- Reuse `addSuggestion` and `dismissSuggestion` already in `CareBlock`. A failed write
  shows the row's inline error and leaves the row in place (today's `SuggestedRow`
  contract).
- Button rule (design/task-card.md, docs/add-item-flow.md HH-109): "Add the Manual" is
  the card's only filled button; each row's Add is outlined; "Don't Add" is text. All
  tap targets at least 44pt; colours from tokens only.

Headline change and its trap. "No upkeep yet — add the manual" is pinned verbatim in
about 20 assertions, and several are absence checks (`toHaveCount(0)`, `queryByText(...)
toBeNull()`). After the rename an absence check on the OLD string passes for the wrong
reason. Update every one, and make each absence check target the new text:
- `src/lib/designContracts.test.ts` (~495–541)
- `src/test/chrisRound1.test.ts` (142, 143, 236)
- `src/components/item-care/CareBlock.awaiting.test.tsx`, `CareBlock.reading.test.tsx`
  (regex `/No upkeep yet/` already; check intent)
- `e2e/emu/item-page-scan-indicator.spec.ts` (218, 292)
- `e2e/emu/item-page-manual.spec.ts` (207, 214)
- `e2e/journey/journey.spec.ts` (216 caption, 413)
- `docs/user-journeys.md` (line ~368 and the J1 step), `docs/add-item-flow.md`
Then grep the whole repo for the old string once more; the only hits left should be
historical notes (`docs/beta-feedback.md`, `design/mocks/`).
`src/hooks/useItemManuals.ts`, `useManualManagement.ts`, `useItemDetailLoad.ts`,
`ItemDetailPage.tsx` and `parseManualService.ts` mention it in comments: update the
wording so the comments stay true.

"Don't Add" everywhere a suggestion can be declined (owner: "Not this one doesn't make
sense to me"):
- `SuggestedRow.tsx`: label "Don't Add"; `aria-label` becomes `Don't add ${entry.title}`.
- Pins: `SuggestedRow.test.tsx`, `YourHome.switch.test.tsx` (160, 163),
  `design/care-library.md`.
- There is a SECOND "Not this one": `CareBlock.tsx:391`, on a task that was already
  added from typical care ("Added from typical care · … Not this one"). It archives
  the task. Relabel it "Remove" (D7); `e2e/emu/care-library.spec.ts:65` clicks that
  one, and `design/care-library.md:34` describes it. Read each "Not this one" hit and
  decide which of the two controls it is before changing it.
- The band's footnote (`SuggestedSource`) has two em dashes and promises "the manual
  replaces these", which is not true until PR D. Change it to: "Typical for
  {kindLabel}, not from this one's manual. Add the manual for its exact schedule."
  Grep for pins on the old sentence first.

Tests to add (`CareBlock.noManual.test.tsx`, modelled on `CareBlock.awaiting.test.tsx`):
1. Dishwasher, no manual, no tasks: "No upkeep yet", the "most dishwashers" line, one
   row "Clean the dishwasher filter" with Add and Don't Add, and "Add the Manual".
2. Fridge: two rows.
3. Unknown kind: no rows; "Add the Manual" present.
4. Add calls `addLibraryTask` once with that entry; on error the row shows the message
   and no success state.
5. Don't Add calls `dismissLibrarySuggestion(homeId, itemUnitId, key)` and the row is
   gone; the next suggestion (if any) takes its place.
6. Exactly one filled button in the card (the `designContracts` "one filled primary"
   pattern).
7. While `reading` or `manualAwaitingReview`: none of this renders (`toHaveCount(0)`
   on the testid, not on text).

Docs, same PR: `docs/add-item-flow.md` (this supersedes HH-91's headline; say so in the
PR body), `docs/user-journeys.md` J1's item-page step, `e2e/journey/journey.spec.ts`
caption and assertions.

### A3. Verify and ship PR A

1. `npm run build && npm run lint && npm run check:design && npm test`.
2. All four browser suites, each on a fresh stack (CLAUDE.md rule 5).
3. Look at it. Start the emulator stack and `npm run dev:emu`, seed, and screenshot at
   390px, light and dark: the welcome page (three sections), tour steps 1, 3, 4, a
   name-only dishwasher's item page, a fridge's, and an unknown-kind item's. Put each
   beside its mock shot and check the must-be-true list. Then desktop width for the
   item page.
4. Commit, push, PR. The PR body lists fixes 4–8 (already on the branch), then A1–A2,
   decision D6, the headline supersession, and the baseline note. No routes, no
   serialization boundary, no sync logic: say so.
5. Merge when CI is green (`gh pr merge --squash --delete-branch`), deploy hosting
   (`npx firebase-tools deploy --only hosting --project homehub-2068d`, never bypass the
   predeploy hook), then verify live with a cache-buster: the bundle has `homehub-2068d`
   and no `demo-api-key`, contains "kept in one place" and "Don't Add", and `/beta`
   matches the repo file byte for byte.

---

## PR B: the empty-Home card and the alarm split

### B1. Smoke and carbon monoxide (CO) become two answers

`shared/care/library.ts`:
- `CareFacts`: add `has_co_alarms?: boolean`.
- `home.alarm_test`: title becomes "Test the smoke alarms". Key, archetype, fact and
  cadence unchanged. Existing tasks in existing homes keep their stored title.
- New archetype `"alarm.co.check"` and a rule for it placed BEFORE `safety.test.alarm`
  and `battery.replace.alarm` in `ARCHETYPE_RULES`. Contract (unit-test this table):

  | Title | Archetype |
  |---|---|
  | Check the carbon monoxide (CO) alarm's date | alarm.co.check |
  | Check the CO detector's expiry date | alarm.co.check |
  | Test the smoke alarms | safety.test.alarm |
  | Test smoke and CO alarms | safety.test.alarm |
  | Test the CO alarm | safety.test.alarm |
  | Replace CO alarm batteries | battery.replace.alarm |
  | Replace alarm batteries | battery.replace.alarm |

  (Today the first row reads as `null`, checked with tsx on 2026-11-24.)
  The rule, checked against that table and four near misses ("Check the condenser coil
  date", "Check smoke alarm expiry date", "Clean the coils on this date", "Test the CO
  alarm" all do not match):
  `/\b(carbon monoxide|co)\b.*\b(alarm|detector)('s|s)?\b.*\b(date|expir\w*|end[\s-]of[\s-]life|replace[\s-]by)\b/i`
  `archetypeOf` also has a similarity fallback over library titles. Add these as tests
  too, since the new title joins that pool: "Check the fire extinguisher" stays
  `extinguisher.check`, "Check the alarm" stays whatever it is today, "Check the water
  heater's quake straps" stays `quake.strap` (their similarity to the new title is
  0.33, 0.40 and 0.20; the threshold is 0.5).
- New entry `home.co_alarm_check`: kind "home", archetype "alarm.co.check", title
  "Check the carbon monoxide (CO) alarm's date", maintenance, essential, safety,
  annual, 2 minutes, cadenceLabel "Yearly", why "Their sensors wear out. Most last 5
  to 10 years, and the replace-by date is on the back.", how "Read the date on the
  back of each alarm. Replace any that are past it, or that chirp after a new
  battery.", source "Alarm makers' end-of-life guidance (Kidde, First Alert)", fact
  "has_co_alarms".
- Anything typed `Record<Archetype, …>` or switching on archetype fails to compile:
  fix each.

Questions and settings:
- `shared/care/dayOne.ts` `QUESTIONS`: the smoke row's text becomes "Do you have smoke
  alarms?". Add `{ fact: "has_co_alarms", text: "Do you have carbon monoxide (CO)
  alarms?", entries: ["home.co_alarm_check"] }` after it. `ADDS`: `"home.co_alarm_check":
  "a yearly check of its replace-by date"`.
- `shared/care/firstList.ts` line ~102 (the batteries starter): "Do you have smoke alarms?".
- `src/pages/homeSetupCategories.ts` Safety: "Smoke alarms in the home?" and a new
  "Carbon monoxide (CO) alarms in the home?" (`has_co_alarms`).
- `src/modules/home/services/firstMinuteDraft.ts` `CARE_FACT_KEYS`: add `has_co_alarms`
  (it is a `Record<keyof CareFacts, true>`, so the compiler demands it).
- `src/lib/dashboard.ts:177`: "Test smoke and CO detectors before heating season." →
  "Test smoke and carbon monoxide (CO) detectors before heating season."
- Rule for all of it: "CO" never appears to a user without "carbon monoxide" beside
  it. After the change, `grep -rn '\bCO\b' src shared --include=*.ts --include=*.tsx`
  and read every user-facing hit.

Existing homes: `has_smoke_alarms` keeps its value; `has_co_alarms` starts unanswered,
so Home's question card will ask it once. That is intended.

Tests. About 24 files contain "Test smoke and CO alarms". Sort them before touching:
- Asserting the LIBRARY's title for `home.alarm_test` (dayOne, firstList, FirstMinute,
  MonthlyRefreshCard, NextStepCard, YourHome tests; `e2e/emu/care-library.spec.ts`;
  `e2e/journey/journey.spec.ts`): update to "Test the smoke alarms".
- Using the string as an arbitrary stored task title (homeSections, comingUp,
  notifyGate, useReminderAsk, homeWeek comment): leave. Stored titles are real data.
- `evals/ask-general/goldens.json` and `evals/ask-general/runs/*`: leave. Eval fixtures.
- `shared/chat/__tests__/generalGuidance.test.ts`: read it; change only if it asserts
  the library title.
Add: the archetype table above; `nextQuestion` asks the CO question when smoke is
answered and CO is not; `suggestionsForHome` offers the CO check only when
`has_co_alarms === true`; a home with a stored "Test smoke and CO alarms" task is
still offered the CO check (different archetype) and is not re-offered an alarm test.

### B2. The card (mock 1, shots `r3-m1-a/b/c`, `r4-m1-optA`, `r4-m1-collapsed`)

Pure logic, in `shared/care/dayOne.ts` (unit-tested in `dayOne.test.ts`):

```ts
export type HomePick =
  | { type: "fact"; id: string; label: string; fact: keyof CareFacts; entries: string[] }
  | { type: "appliance"; id: string; label: string; appliance: Appliance; more?: boolean }

export const HOME_PICK_GROUPS: { title: string; picks: HomePick[] }[]
// Safety: Smoke alarms (has_smoke_alarms → home.alarm_test),
//         Carbon monoxide (CO) alarms (has_co_alarms → home.co_alarm_check),
//         Fire extinguisher (has_extinguisher → home.extinguisher)
// Heating and water: Furnace, Central air, Water heater   (from APPLIANCES)
// Appliances: Dishwasher, Washer, Dryer, Fridge; behind "More…": Range hood,
//             Air purifier, Coffee machine, Food recycler (from APPLIANCES)

export interface PickCareRow { pickId: string; entry: CareEntry }
/** One list for everything ticked, in group order, one row per archetype. */
export function careForPicks(picks: HomePick[], ctx: HomeContext): PickCareRow[]
```

`careForPicks` threads ONE `covered` set through all picks (so Furnace plus Central air
yields one "Replace the air filter"), applies `offerable` (dismissed keys, area gates,
existing titles), and for appliances uses the same own-then-extra order as
`applianceCare`. Build appliance picks from `APPLIANCES` by kind so there is one list
of appliances, not two. Do not change `APPLIANCES` itself: the old card still reads its
`more` flags.

Component: `src/components/home/WhatsInYourHomeCard.tsx`. One responsive component for
phone and desktop (no parallel trees). Props:

```ts
{ homeId: string; onEngaged: () => void; onFinished: () => void }
```

Data: the same read `NextStepCard` uses. Export `fetchDayOne` and the `DayOneData` type
from `NextStepCard.tsx` (or move both to `src/components/home/dayOneData.ts` and import
from both) and use `useSWR(\`day-one:${homeId}\`, …)` so the two cards share one cache
key. Also export `readLocal` / `writeLocal` and `dismissKey` rather than copying them.

The card's own read decides whether this home is really empty (Codex blocker). Home's
`stats` can be the PREVIOUS home's for a moment: `useDashboard`'s core read uses
`keepPreviousData` and, unlike its extras read, does not check the home id
(`useDashboard.ts:137–164`). `NextStepCard` already guards against this by needing both
counts to say none (`NextStepCard.tsx:131`). So:
- Until the read has answered, the chips render but every button is disabled.
- If the read says the home has any item or any task and she has not yet engaged, the
  card renders nothing. Home's own data catches up and replaces the branch.
- `onEngaged` (the pin) fires only after the read confirmed empty.
- Test both directions with retained SWR data: empty → populated home, and populated →
  empty home.

States:

1. **Pick** (first seen).
   - Heading "What's in your home?"; line "Tap what you have. Homehub suggests the care
     that goes with it, and adds nothing until you say so."
   - Three labelled chip groups. Chips are toggle buttons (`aria-pressed`); a ticked
     chip is filled with a check. "More…" reveals the rest of Appliances.
   - "See Suggested Care": filled, the card's only filled button, disabled until at
     least one chip is ticked AND the data has loaded.
   - "Add My Exact Models": outlined, full width. Under it: "Brand and model, or the
     manual, gets you the maker's schedule."
   - "Not now": text.
   - Load error: `InlineError` with retry in place of the buttons' enabled state; the
     chips still render.
2. **Care** (after See Suggested Care).
   - On the tap: if any fact pick is ticked, ONE `upsertHomeProfile(homeId, { care_facts:
     { ...data.facts, [fact]: true, … } })` for the ticked facts only. An unticked chip
     writes nothing: not ticking is not "no". If the write fails, stay on Pick and show
     "Couldn't save that. {message}". Then `mutate()` the SWR key and call `onEngaged()`.
   - Heading "Suggested for your home"; line "From what you told us. Add the ones you want."
   - One row per `careForPicks` result: title; a meta line of "Essential" (clay,
     `--hh-clay`, only when `priorityTier === "essential"`) · cadenceLabel · "N min" (or
     "Call a pro" when `entry.pro`); the entry's `why` as a third line ONLY for
     `home.co_alarm_check`; an outlined "Add" on the right.
   - Add, one write at a time (a single `busyKey`; every other Add is disabled while
     one runs, so two taps cannot create two items):
     - Fact pick → `addLibraryTask(homeId, null, entry, essential ? { firstDue } : {})`.
     - Appliance pick → ensure its item exists, then `addLibraryTask(homeId, itemId,
       entry, …)`. Lift only the item creation out of `AppliancePanel` into a shared
       `createApplianceItem(homeId, appliance)` (room lookup by `appliance.room`, then
       `createItemUnit({ home_id, display_name: label, category: kind, item_category,
       room_id })`); leave the rest of `AppliancePanel` as it is.
       Keep `created: Map<kind, itemId>` in component state so a second row of the same
       appliance reuses the item.
       No item may be left with zero tasks (Codex): if THIS tap created the item and
       the task write then fails, take the item back out with the items module's
       delete (find it; if only a soft delete exists, use that) and drop it from
       `created`, then show "Couldn't add that. Try again." If the take-back also
       fails, keep the id in `created`, log both errors with home and item ids, and
       show "Your {label} is added, but this task couldn't be. Try again." Set
       `appliance.fact` only after the task is in (a failed fact write is logged, as
       today). Test: item created, task fails → `createItemUnit` then the delete, the
       row shows the error, and a retry creates exactly one item.
     - `firstDue` for essentials: `firstDueDates(localToday(), 2)[n]`, where n is 0 for
       the first essential added in this visit and 1 for every later one (the same
       Saturday-then-Sunday spread `addEntries` gives a batch).
     - Success: the row shows "✓ Added" in place of the button. Failure: an inline
       error on that row with the service's message; the button stays. Never "Added"
       after a failed write.
     - Keep the analytics events the old panel fires: `home_kind_added` on an
       appliance's first task, `home_question_task_added` for fact tasks.
   - Under the list, only if a fact was saved in this visit: "Your answers are saved
     with your home. Change them anytime in Your Home."
   - "Done": filled (the stage's only filled button). Writes `dismissKey(homeId)` = "1"
     (so the old appliances card does not re-ask on this phone a second later), then
     `onFinished()`.
     If no task was added in this visit the home is still empty, so Home keeps showing
     this card (Codex blocker): in that case Done also writes the collapsed flag and the
     card shows its Collapsed row (D9). Test: tick facts → See Suggested Care → add
     nothing → Done → the collapsed row, and it is still collapsed after a remount.
   - "Edit what you have": text; returns to Pick with ticks intact. Already-added rows
     stay added when she comes back.
   - No rows at all (everything already covered): "Nothing new to suggest for these."
     and Done.
3. **Collapsed** (after Not now).
   - Not now writes a per-phone flag `hh.emptyHome.collapsed.${homeId}` and shows, in the
     card's place, one tappable row: "Tell us what's in your home" with "You can add a
     model or manual anytime in Items." under it and a chevron. Tapping it clears the
     flag and shows Pick again. The row is a real button, at least 44pt tall.
   - Initial state reads the flag, so a returning visit to a still-empty Home shows the
     collapsed row.

"Add My Exact Models" target (compute on tap):
- An item was created in this visit (`created.size > 0`): exactly one → `/items/{id}`
  (its page is where brand, model and manual are added); more than one → `/inventory`.
  This avoids a second "Dishwasher" for someone who already added the dishwasher's task.
- Otherwise `/inventory/add?lane=appliance`, plus `&kind={subType}` when exactly one
  appliance chip is ticked and it has a "What is it?" chip:
  dishwasher→`dishwasher`, washer→`washing-machine`, dryer→`dryer`,
  refrigerator→`refrigerator`, water_heater→`water-heater`, furnace→`hvac-furnace`.
  Central air, range hood and the More… kinds have no chip: no `kind`.
- "Snap a label instead" is not rendered on this card.

`data-tour-halt=""` stays on the card in all three states (an empty Home is still the
first minute; `useFeatureTour.ts:82` checks for it). The tour checks once, 600 ms after
mount, so finishing the card does not start it in the same visit; it starts on the
next visit to Home (D10). Do not write or claim otherwise. `data-testid`s:
`empty-home-card`, `empty-home-care`, `empty-home-collapsed`.

### B3. Home.tsx

- Delete `EmptyHomeHero` (first check nothing else imports it or the icons it alone uses).
- Add `const [setupPinned, setSetupPinned] = useState(false)`, reset when `homeId`
  changes (`useDepsChanged`, as the file already does for the skeleton).
- `const showSetup = isNewUser || setupPinned`. Replace `isNewUser` with `showSetup` in
  every JSX gate (the setup block, `ProfileCompletionBanner`, `NoUpkeepYetHero`,
  `PushOptInNudge`, `AskFirstHero`, the main `RefinedHome`/`DesktopHome` block) so the
  rest of Home does not appear around the card while she is mid-flow. Two things sit
  above the branch today and stay as they are: `WhatsNewBanner` and the "couldn't reach
  the server" note (a real failure she should see). The derived values
  (`tasksBeforeItems`, `hasItemsNoUpkeep`, `starters`, `earlyCard`, `nextStep`) keep
  using `isNewUser`.
- Render `<WhatsInYourHomeCard key={homeId} homeId={homeId} onEngaged={() =>
  setSetupPinned(true)} onFinished={() => { setSetupPinned(false); void refresh() }} />`
  in the hero's place, under the existing home-name pill.
- Why the pin: the first Add makes the home non-empty. Without it, a background
  refresh would swap the whole card for the normal Home while she still has rows to add
  (the same reason `NextStepCard` has `appliancesPinned`).
- `MonthlyRefreshCard` is not rendered in this state (it already is not; assert it).

### B4. The old appliances card's footer (D5)

In `NextStepCard.tsx` `AppliancesCard`: replace the "Snap a label instead" link with
the same outlined "Add My Exact Models" button and the same line under it; the target
is the same rule as B2: `/inventory/add?lane=appliance` (plus `&kind=` when a chip is
selected and maps) while nothing has been created in this visit; after an add, the
created item's page (one item) or `/inventory` (several). For that, `AppliancePanel
.onDone` must hand back the created item id and `AppliancesCard` must keep it; today
it gets only a task count (`NextStepCard.tsx:235`). Without this the button starts a
second dishwasher for someone who just added one (Codex). Test it.
"Not now" / "Done" stays text. The card's first line ("Tap what you have to get its
typical care. Snap its label later for the exact schedule.") stays.
Update `e2e/journey/journey.spec.ts:193` (it clicks "Snap a label instead") and
`docs/user-journeys.md` J1 in the same commit.

### B5. The add screen accepts a kind

`src/pages/SmartAddItem.tsx`: read `kind` beside `lane` on first render only. Accept it
only when `lane === "appliance"` and the value is one of `KIND_CHIPS`' `subType`s (an
allowlist check on external input; anything else is ignored, not cast). Then the
initial `identifyData` is `{ ...DEFAULT_IDENTIFY_DATA, itemCategory: KIND_CATEGORY,
subType: kind }`, which is exactly what tapping that chip sets.
- A resumed wizard session still wins (`checkResume` overwrites the data), and "Start
  fresh" still resets to defaults and the chooser, as today.
- Tests (`SmartAddItem.test.tsx`): `?lane=appliance&kind=dishwasher` opens the
  appliance lane with Dishwasher checked; an unknown kind, or `kind` without
  `lane=appliance`, pre-picks nothing; a saved session for this home still prompts.
- `docs/add-item-flow.md`: add the `kind` parameter and who sends it.

### B6. Tests for the card

Unit (`dayOne.test.ts`): group contents and order; `careForPicks` for smoke + CO +
water heater + dishwasher gives the four mock rows in order (in an earthquake area the
quake-strap row too); Furnace + Central air gives one air-filter row; a dismissed key
or a covered archetype is skipped.

Component (`WhatsInYourHomeCard.test.tsx`), each from the mock's must-be-true list:
1. "CO" never renders without "carbon monoxide" beside it (scan the card's text).
2. See Suggested Care is disabled with nothing ticked and enabled after one tick.
3. Tapping See Suggested Care with two fact chips writes ONE profile update holding
   only those two facts as `true`; with only appliance chips it writes none.
4. No `addLibraryTask` and no `createItemUnit` call happens before an Add tap.
5. Add on a fact row creates a home-level task; the row reads Added.
6. Add on an appliance row creates the item once, then the task; a second row of the
   same appliance reuses the item (one `createItemUnit` call in total).
7. A failed task write shows an error and no "Added". (This is the failure-path test
   the error-handling standard requires for a save.)
8. A failed profile write keeps her on Pick with an error.
9. While one Add is in flight every other Add is disabled.
10. Not now shows the collapsed row and hides the card (`toBeHidden` / not rendered:
    say which); tapping the row brings the card back; the flag survives a remount.
11. Add My Exact Models: no ticks → `?lane=appliance`; Dishwasher only → `&kind=dishwasher`;
    two appliances → no kind; after creating one item → `/items/{id}`.
12. One filled button per stage.

Home (`Home.homeName.test.tsx`, `Home.tasksBeforeItems.test.tsx`,
`homeEmptyStates.test.ts`): replace "Let's set up your home" expectations with the new
card's testid; assert "Let's set up your home", "Add your first item" (on Home) and
"This month at your home" are not rendered on an empty Home (`toHaveCount(0)`); assert
the pin: after `onEngaged`, a stats change to one item still shows the card, and after
`onFinished` the normal Home renders.

Journey: `docs/user-journeys.md` J1 gains the empty-Home path (Not now on the starter
list → the card → pick → care → Done) and `e2e/journey/journey.spec.ts` walks it with
step screenshots, in this PR. Each walk uses its own sentinel data (memory: specs in
one run share seeded state).

A11y: the a11y suite must cover Home in all three card states at 390px.

### B7. Verify and ship PR B

As A3, plus: screenshots of all three states at 390px light and dark and at desktop
width, each beside its mock; the add screen opened from the button with Dishwasher
pre-picked; `/your-home` showing the two alarm questions. Run `/code-review` on the
diff before the PR. Regenerate `SYSTEM.md` if its generator covers the home profile's
fields (a new `care_facts` key); if it is hand-maintained for that section, say so in
the PR rather than editing by hand.

---

## PR C: "What is it?" on the item page (shot `r4-m2-nokind`)

Hosting only. The least valuable piece: the add screen already asks, and the lookup
usually fills it in. If time is short, skip it and say so.

When it shows: the no-manual branch of A2, `kindOf(item) === null`.
- Line: "We couldn't tell what this is from its model. Pick one to see its typical care."
  when the item has a brand or model; otherwise "Pick what this is to see its typical care."
- Chips: only kinds the library has item-level care for, by the add screen's labels:
  Dishwasher, Washer, Dryer, Fridge, Furnace. (Water heater and Oven or range have no
  item-level entries, so picking them would show nothing.) Outlined chips, 44pt.
- Below: "Or add the manual for the exact schedule." and the filled "Add the Manual".
- On pick: `updateItemUnit(homeId, id, { item_category: "major_appliance", sub_type,
  category: subType })`. Rename the item to the kind's label ONLY when its name is
  still the composed "Brand Model" placeholder, using the same rule and helper as
  `postCreateLookup.ts` (lines ~98–112); export that helper rather than copying it.
  Failure: inline error, chips stay.
- After the write the page re-reads and A2's card shows that kind's typical care.

`kindOf` must then recognise the stored category. Today "washing-machine" does not
match the washer rule (it expects a space), so an item the user named themselves would
still read as unknown. In `shared/care/library.ts` `kindOf`, replace hyphens with
spaces in the joined text before matching. Tests: every `KIND_CHIPS` subType maps to
its kind (`washing-machine`→washer, `hvac-furnace`→furnace, `water-heater`→
water_heater, `oven-range`→oven_range, …); the existing `library.test.ts` cases still
pass; and a table of hyphenated names and models that must NOT change kind (run
`kindOf` over every seeded item in `scripts/seed-emulator.ts` before and after and
diff the results).

Docs: `docs/add-item-flow.md` in the same PR. Verify and ship as A3, with the card
before and after a pick beside the mock.

---

## PR D: Replace or Keep Both (needs the owner's yes: Functions deploy)

### D0. What the server does today (Codex blocker; this replaced the first design)

The first version of this plan archived the typical task from the app after the save.
That would have lost data. `commitDraft` already compares each new manual task against
every other task on the item and silently declines to create a near-duplicate:

- `firebase/functions/src/parse/commitDraft.ts:429–447`: `otherTitles` is every
  template on the item with `deletedAt == null` from another source; a manual task
  whose title scores `>= TITLE_MATCH_THRESHOLD` (0.5) against any of them is skipped
  (`duplicatesSkipped`).
- "Clean the filter" scores 0.67 against "Clean the dishwasher filter". So today, for
  someone who added the typical task and then the manual: the review SHOWS the
  manual's filter task, Save drops it without saying so, and the typical task stays.
  No duplicate, but the manual is not the source of truth and the review overstates.
- Had the app then archived the typical task, the item would have neither.
- An archived template keeps `deletedAt == null` (`archiveTaskTemplate` sets only
  `isActive: false`), and the suppression does not look at `isActive`. So an archived
  typical task would keep suppressing the manual's task on every later re-read.

So the choice has to reach the server and be applied in the same commit.

### D1. Design

Shared matcher, `shared/care/manualReplaces.ts` (imported by the app and by Functions,
like `shared/parse/parseCore`):

```ts
export interface TypicalTask { templateId: string; title: string; libraryKey: string }
export interface ReplaceMatch { rowTitle: string; typical: TypicalTask; by: "archetype" | "similarity" }
export function matchManualToTypical(rowTitles: string[], typical: TypicalTask[]): ReplaceMatch[]
```

One-to-one, strongest pair first (the greedy shape of `planTaskReconciliation`):
1. `by: "archetype"`: `archetypeOf(rowTitle) === entryByKey(libraryKey)?.archetype`.
2. `by: "similarity"`: `titleSimilarity(rowTitle, typical.title) >= TITLE_MATCH_THRESHOLD`,
   the same function and threshold the server's suppression uses (non-negotiable 1).
   This must stay identical to the server's test, because these are exactly the rows
   the server would otherwise drop.

Test table: "Clean the filter" ~ "Clean the dishwasher filter" matches by similarity
(0.67); "Replace water filter" ~ "Replace the water filter" by archetype; "Replace
water inlet hoses" ~ "Replace the water filter" by similarity (0.67, a FALSE match:
this is why similarity never defaults to Replace); "Clean the door gasket" and "Run a
cleaning cycle" do not match "Clean the dishwasher filter" (0.33). Two rows never claim
one typical task.

Request: `CommitManualDraftRequest` in `draftSchemas.ts` gains an optional, Zod-validated

```ts
typicalChoices: z.array(z.object({
  title: z.string().min(1).max(300),          // the manual task's title, as sent in `tasks`
  templateId: docId,                           // the typical task (use the file's existing id schema)
  choice: z.enum(["replace", "keep_both"]),
})).max(50).optional()
```

`commitManualDraft` checks each choice before trusting it: the template exists in this
home, is on this manual's item, is not deleted, and its `externalKey` starts with
`library:`. Anything else is dropped with a logged warning (never thrown: an old client
or a task removed meanwhile must still be able to save).

`commitDraft` (keep `planTaskReconciliation` pure and untouched, non-negotiable 3):
- Build `chosen: Map<normalizedTitle, { templateId, choice }>` from the validated list.
- In `isCrossManualDuplicate`, ignore the chosen template's title for the task that
  named it. So that task is inserted under either choice. Every other suppression is
  unchanged.
- For `replace`, in the SAME batch as the insert: set the typical template
  `isActive: false`, `deletedAt: now`, and a marker `replacedByManualId: manualId`; and
  soft-delete its open instances (`scheduled` / `snoozed`), leaving completed ones.
  `deletedAt` is what stops it suppressing later re-reads. Check first what else reads
  a soft-deleted template (item history, the completion timeline, exports) and confirm
  completed instances still resolve their title; if anything breaks, use a dedicated
  `replacedAt` field and teach the `otherTitles` filter to skip it instead.
- Also add the library key to the item's `dismissedCare`, in the same batch, so the
  item page does not re-offer the typical task a moment later.
- No choice sent for a row: behaviour is exactly today's.
- A later re-read of the same manual: the manual's task now exists under this
  `manualId`, so reconciliation matches it in place. Test that nothing is resurrected
  or duplicated.

`TaskReviewSheet.tsx`: optional prop `typicalTasks?: TypicalTask[]`. Absent (the
default, and what `ReviewItemTasksButton` passes) means none of this renders.
- Matches come from the sheet's own `initial` rows.
- A matched row that is included and whose kind is "maintenance" shows, inside the row
  under its meta line, on the row's own white surface (no tinted panel; the owner
  found the tinted one hard to read):
  - one line, secondary text colour: `Replaces your typical task “{title}”` when the
    choice is Replace, `Same as your typical task “{title}”?` when it is Keep Both;
  - a two-option segmented control, "Replace" and "Keep Both". Selected half: filled
    teal, white text. Other half: white, ink text, border. `role="radiogroup"`, 44pt.
  - Default: Replace for `by: "archetype"`, Keep Both for `by: "similarity"` (D11).
- A matched row she skips, or re-files as a tip or as cleaning, shows nothing and
  sends no choice.
- `handleSave` passes the choices as a fourth argument to `onSave`.

`ParsePickupCard.tsx`: when a review opens, read the item's tasks
(`getTaskTemplatesByItem`), keep those with `libraryKeyOf(t)`, pass them as
`typicalTasks`. If the read fails, pass none and `console.warn` with home and item
ids. `commitReviewedDraft` gains the `typicalChoices` argument and sends it.

Old clients keep working (the field is optional), and a new client against an old
function sends a field the old schema may reject. So: deploy Functions FIRST, verify,
then hosting. Check whether `CommitManualDraftRequest` is strict about unknown keys;
if it is, that ordering is mandatory.

### D2. Tests

- Matcher: the table above.
- Functions (`npm run test:worker` / the functions emulator suite that already covers
  `commitDraft`): Replace → the manual task exists, the typical template is inactive
  and deleted, its open instance is gone, its completed instance remains, the key is in
  `dismissedCare`; Keep Both → both exist and active; no choice → today's skip, and
  `duplicatesSkipped` is 1; a choice naming a non-library or other-item template is
  ignored; re-read after Replace → no resurrection, no duplicate.
- Sheet: defaults by match type; toggling changes the fourth argument; skipped or
  re-filed rows send nothing; no `typicalTasks` → the line is not rendered
  (`toHaveCount(0)`).
- Card: a failed read of the item's tasks still lets the review save.
- `grep -rn "<TaskReviewSheet" src` before claiming it is wired: two call sites today.
- Functions deploys can run old code while reporting green (memory: functions deploy
  staleness). Prove the behaviour by driving the real callable against the emulator.

Docs: `docs/add-item-flow.md` (new rule: a manual's task replaces a typical one only
with her say-so), `docs/user-journeys.md` J3 and its walk, `SYSTEM.md` (the callable's
contract changed). Run the Codex adversarial review on this PR's diff before merging:
it changes a save path.

## Things that must stay true throughout

- Nothing is scheduled, created or archived without her tap (suggest, never assume).
- Every failed write shows an error. No catch block is empty; each one surfaces, logs
  with ids, or carries a comment saying why silence is right.
- Colours, sizes and radii come from `src/index.css` tokens. `npm run check:design`
  must not rise. No literal white, no raw palette classes, nothing under 12px, 44pt
  targets, Lucide icons only.
- Never test against the real Firebase project. Emulators only.
- One Playwright run per emulator stack at a time.
- Title Case on buttons; no em dashes in new copy; no new claim the app cannot back.

## Known gaps this plan leaves (put them in BACKLOG.md with the last PR)

- Home's "No upkeep yet — add a manual" hero (items but no tasks, `Home.tsx`
  `NoUpkeepYetHero`) still says upkeep only comes from a manual. Once A2 ships that is
  no longer true. Not mocked, so not changed here.
- Two "What's in your home?" cards exist (empty Home; tasks but no items). Unify.
- Typical care is thin: one task for dishwashers; none for water heater items,
  microwaves, ovens, ceiling fans.
- `suggestionsForItem` treats a manual task as covering a typical one only when the
  archetypes match, so "Clean the filter" from a manual does not hide the "Clean the
  dishwasher filter" suggestion. PR D's matcher could serve there too.
- Until PR D ships: someone who adds a typical task and then the manual sees the
  manual's matching task in the review, and Save quietly keeps the typical one instead
  (`commitDraft`'s duplicate suppression). No duplicate and nothing lost, but the
  review shows a task that is not created.
- Replace does not carry the last-done date (D2).
- The Ask headline on the welcome page ("Answers from your manuals") is still
  manual-first.
- How often the model lookup recognises a real model is unmeasured.
