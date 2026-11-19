# First-minute onboarding — zip code, then this month's short list (D8)

**Status: mock approved by the owner 2026-11-18 ("Approve mock"); built 2026-11-19 in three PRs (zip table and list rule; Home fixes; the screens). Where the build departs from this doc's prose, see "As built" at the end.**
Build-ready mock (real captures from the seeded emulator, rearranged): https://claude.ai/artifact/2VnY3jhXgB2ALEVkB8CzQC
Research and the four versions that lost: https://claude.ai/artifact/K9hhfgysCBHpiXB1pEz4Wz

## Why

A friend at the Nov 17 demo (BACKLOG D8) did not want setup before seeing anything
useful. Today a new account goes through a name screen, five profile questions and a
"where to next" screen, then lands on a Home that says "Let's set up your home"
(captured 2026-11-18 on the emulator: 8 screens, zero tasks). The goal is one true,
useful thing about *her* home in under a minute, with almost nothing typed.

## The owner's decisions (2026-11-18)

1. **Version B**: a zip code, then what the area means, then this month's short list.
   Skipping the zip gives the same list without the area facts (Version E).
2. **A street address is a paid-tier feature** (D8b), not part of onboarding. On the
   free path Homehub never asks for a street address (D7 must-be-true 1 and 6 stand).
3. **The list comes right after sign-in; the camera comes after the list.** "Snap a
   label" is the closing step, on Home. This reorders D1a.

## The flow

| # | Screen | She types / taps | Notes |
|---|---|---|---|
| 0 | Sign in (unchanged) | | |
| 1 | **What's your zip code?** | 5 digits, Continue. Or Skip for now. | The invite-code field moves here when the growth gate is on. The home is created on Continue or Skip, named "My home" (D1a), renamable from the switcher. |
| 2 | **What your area means for upkeep** | Home type (one tap). Optionally "Not true here" on a fact. | Shows only the area facts that change this month's list. |
| 3 | **Worth doing this month** | Answer at most two Yes/No questions, × anything unwanted, Add. Or Not now. | Two or three rows. Nothing is saved until Add. |
| 4 | **Home** | | Her tasks under This week, then "Get the exact schedule · Snap a label". |

Skip at step 1 goes straight to step 3 with the no-zip list. Every screen can be left;
leaving lands on a working Home.

The old front door goes away: `HomeOnboarding`'s name field (auto-named instead) and the
five-step `/onboarding/profile` (`HomeProfileOnboarding`, `OnboardingProfile`). Their
questions are not lost: ownership, duration, concerns and mode stay in Settings
(`HomeProfileSection`); home type is asked on step 2; climate is replaced by the zip (D7).

## The list: what qualifies and in what order

Every row must pass Relevant, Useful and Timely. Candidates are the **starter entries**
below (a flagged subset of `shared/care/library.ts` plus five new home-level entries).

1. **Relevant.** Every gate passes: home type, area facts, and care facts. A care fact
   that is `false` excludes the row. One that is unknown keeps it, with an inline
   question.
2. **Useful.** Essential or Recommended only. Optional never appears here.
3. **Timely.** This month is inside the entry's window, or the window opens next month.
   Essential freeze tasks stay eligible for one month after the window closes, worded
   "If not done yet."
4. **Order.** The window that closes soonest first, then Essential before Recommended,
   then rows with no question before rows with one, then fewer minutes.
5. **Size.** At most three rows, and at most two with a question. If fewer than two rows
   are timely, fill to two with "any month" entries. If nothing qualifies, say so
   ("Nothing pressing this month") and go to Home.
6. **One row per system.** Alarms, the HVAC system, the water heater and the exterior get
   one row each; the rest of that system's care is offered later by the care library.
7. **Pre-checked** only when the row has no open question. A Yes checks the row; a No
   removes it and records the fact; Not sure leaves it unchecked and the fact unknown.
8. **"Not on your list"** names at most two things a *derived* default removed from this
   month's list (freeze-free → winterizing; condo → roof and gutters), each with Change.
   It lists nothing that would not have been timely anyway.

### Starter entries

New entries are marked **new**. Windows use `seasonalWindow.ts`'s climate bands.

| Key | Task | Tier | Cadence | Window | Gates |
|---|---|---|---|---|---|
| home.alarm_test | Test smoke and CO alarms | Essential | Twice a year | Mar–Apr, Oct–Nov | `has_smoke_alarms` not false |
| home.air_filter **new** | Replace the air filter | Recommended | Every 3 months | Start of heating season (cold Sep–Oct, moderate Oct–Nov, mild Oct–Nov); hot climates start of cooling season (Apr–May) | `has_air_filter` (asks "Do you have a furnace or central air?") |
| home.hvac_service | Furnace or HVAC service (a pro) | Recommended | Yearly | Month before the filter window | `has_hvac_service`; never in the same list as the filter (rule 6) |
| home.water_heater | Flush the water heater | Recommended | Yearly | Any month | `has_water_heater` |
| home.quake_straps **new** | Check the water heater's quake straps | Recommended | Yearly | Any month | Earthquake rating Relatively High or above, and `has_water_heater` |
| home.outdoor_taps **new** | Shut off and drain the outdoor taps | Essential | Yearly | Fall window of the climate band (+1 month grace) | `freezeRisk` true, house or townhouse, `has_outdoor_taps` |
| home.gutters | Clean the gutters | Recommended | Spring and fall | Fall window; spring Mar–Apr | `has_gutters`, not `building_handles_exterior`; condos and apartments default to "the building handles it" (shown, changeable) |
| home.wildfire_prep **new** | Clear leaves from the roof, gutters and vents | Recommended | Yearly | May–Jun | Wildfire rating Relatively High or above, house or townhouse, not `building_handles_exterior` |
| home.hurricane_prep **new** | Get ready for hurricane season | Recommended | Yearly | May | Hurricane rating Relatively High or above |
| home.extinguisher | Check the fire extinguisher | Recommended | Yearly | Any month | `has_extinguisher` |

Before building, each new entry needs its `why`, `how` and `source` written and checked
the way the Sept 6 library entries were. Radon, sump pumps and rainy-season drains are
deliberately left for later: their sources were not verified (see the research page).

### Worked examples (in the mock)

| Home | Month | List | Not on your list |
|---|---|---|---|
| Condo, 94110 (San Francisco) | Nov | Alarms ✓ · Air filter (asks) · Quake straps (asks) | Winterizing; roof and gutters |
| House, 55406 (Minneapolis) | Nov | Alarms ✓ · Outdoor taps "if not done yet" (asks) · Air filter (asks) | — |
| Condo, 33139 (Miami Beach) | May | Hurricane season ✓ · Air filter (asks) | — |
| No zip | Nov | Alarms ✓ · Air filter (asks) | — (a dashed "Add your zip" row instead) |

The county hazard ratings in these examples are expected values, not yet read from the
FEMA file; the first build step verifies them.

## Data

**The zip table** ships with the app as a lazy-loaded chunk (D7 must-be-true 6: nothing
leaves Homehub). One row per zip: hardiness half-zone, county FIPS, and a county row with
IECC zone, earthquake, wildfire and hurricane ratings, and whether the state observes
daylight time. Sources: USDA/PRISM 2023 zip file; Census 2020 zip-to-county file (largest
land overlap wins); FEMA National Risk Index v1.20 county file; PNNL county climate
zones. The table records its source versions and build date. Estimated 100–300 KB
compressed (not measured). Refreshed yearly.

**Derivations** (proposed defaults, visible and changeable):

| From | To | Rule |
|---|---|---|
| Hardiness zone | `freeze_risk` | false at zone 10a or warmer (coldest nights ≥ 30°F); true otherwise. Zone 9 is "true" on purpose: Texas, Feb 2021. |
| Hardiness + IECC zone | `climate` | cold ≤ 6b; moderate 7a–9b; mild ≥ 10a; hot when the IECC zone is 1 or 2. |
| County ratings | area facts | Shown only when Relatively High or Very High. |

**On the home doc** (the profile is folded there, `homeProfileService.ts`):

- New: `zip` (string or null), `area` (the derived facts plus `tableVersion`), and
  `climate_source` (`"zip"` or `"owner"`).
- Reused: `climate` and `freeze_risk` are written from the zip, so `houseRules`,
  `seasonalWindow` and the parse keep working unchanged. "Not true here" writes the
  opposite value with `climate_source: "owner"`, and a later table refresh never
  overwrites an owner value.
- `home_type` from step 2. Inline answers write `care_facts` (new keys `has_air_filter`
  and `has_outdoor_taps`). × with a reason writes a fact or `dismissed_care`.
- Tasks are created with `addLibraryTask` (`library:` provenance, "typical" label), with
  one change below.

## Two things the build must change outside onboarding

Both were found by walking the real flow on the emulator on 2026-11-18.

1. **First due date.** `addLibraryTask` anchors the cadence at today, so the first due
   date is one full interval away: an alarm test added on Nov 18 was first due
   **2027-05-18**, and an extinguisher check **2027-11-18**. A task added because it is
   timely this month must be first due **within Home's 7-day window**
   (`weekAgenda.ts:107`): the coming Saturday by default, shown on the row and movable.
2. **Home with tasks but no items.** `Home.tsx:281` treats a home as new when it has no
   *items*, and then shows only "Let's set up your home". A home with onboarding tasks
   and no items must show This week, with the "Snap a label" card in place of the hero.

## Must be true (these become the test assertions)

1. Homehub asks for a zip only: never a street address, never device location.
2. The zip never leaves Homehub. No network request carries it.
3. The zip screen can be skipped, and skipping still reaches a working list and Home.
4. An unknown or non-US zip says so and offers the four climate choices instead.
5. Every area fact shows its source and a "Not true here" that takes effect in one tap,
   with Undo.
6. Only area facts that change this month's list are shown.
7. The list has at most three rows and at most two questions.
8. Nothing is saved before Add. "Not now" saves nothing (the zip and home type are kept).
9. A row with an open question is never pre-checked.
10. A freeze-free zip (94110) never shows a winterizing task, and "Not on your list" says
    why.
11. Every task added here appears on Home's This week the same day.
12. A failed Add keeps the screen and every choice, says nothing was saved, and offers
    Try again. A partial failure names the rows that did not save.
13. Every added task is labelled as typical care (not from a manual) and carries the
    `library:` provenance.
14. After Add, Home shows "Snap a label" as the next step; the camera opens only on tap.
15. Clock-change copy appears only when the zip's state observes daylight time, and never
    on the no-zip list.

## Edge cases

- **A zip spanning counties** (10,186 of 33,791 touch two): use the largest land overlap,
  name the county on step 2, and let "Not true here" correct the facts.
- **Invited members** join an existing home and never see this flow; the zip is the
  home's, not the person's.
- **Existing homes** keep their climate answer. Settings, Your home offers the zip; nothing
  changes until it is entered.
- **A second home** in another region gets its own zip and list.
- **Month boundaries** use the home's calendar day (A5), so a list built on Nov 30 and
  added on Dec 1 is rebuilt for December.
- **Apartment renters**: the building handles the exterior by default, and the list leans
  to in-unit tasks.
- **Offline at step 1**: the table chunk did not load. Say so, offer Try again and Skip.

## Failure modes

| What fails | What she sees |
|---|---|
| The table chunk does not load | "Couldn't load area data." Try again, or Skip to the no-zip list. |
| Add fails | The list stays as she left it, an error above the button, Try again. Never Home. |
| A table value is wrong | "Not true here" fixes it for her home; the correction is logged for the yearly refresh. |
| The table is stale | Its version is on every home that used it, so a refresh can be targeted. |

## Measuring it

Events, none carrying the zip: `onboarding_zip_entered` (known or not), `area_fact_corrected`
(which fact), `first_list_shown` (row count, month), `first_list_added` (count, entry keys).
Success: most new homes add at least one task in the first session, and the median time
from sign-in to Add is under 60 seconds.

## Not in this build

- D8b, the address reveal (paid tier).
- Learning beyond the reasons sheet. Cross-home learning stays with `graduateFeedback`.
- A desktop layout of its own: the same single column, centred, as the profile screens
  today.

## Done means

The owner approves the mock; the zip table exists with its sources and date recorded;
the 15 checks above pass in a journey spec with a failure-path test for Add; 94110 shows
no winterizing; Home shows onboarding tasks for a home with no items; `docs/user-journeys.md`
and the journey spec change in the same PR.

## As built (2026-11-19)

Where the build differs from the prose above, and why. The approved mock wins over prose.

| Spec said | Built | Why |
|---|---|---|
| Air-filter window in cold climates Sep–Oct | Sep–Nov | The mock shows it in Minneapolis in November |
| Starter list with no home type (zip skipped) | Outside work (outdoor taps, gutters, wildfire) is not offered | The mock's no-zip list is two rows; that work depends on the building |
| Quake straps and outdoor taps minutes (unstated) | 5 and 10 minutes | The mock's rows |
| County hazard ratings "expected" | Read from FEMA NRI v1.20. Connecticut zips carry none | FEMA rates CT's 2022 planning regions, which the 2020 Census zip file cannot place; silence over a guess |
| "the coming Saturday, shown on the row" | First row due Saturday, the rest Sunday; the row shows Home's usual window wording ("Good to do now"), not "Due Sat" | Home's due wording is shared by every task; changing it for these alone is a separate decision |
| (unstated) reload mid-flow | Reopening `/onboarding/first` after step 2 starts at step 2 with the home type kept | Steps 2–3 hold their state in the page; the zip and home type are already saved |
| "Not now saves nothing (the zip and home type are kept)" | As written. `profileCompletedAt` is set when the home type is saved, so the old profile banner does not reappear | The zip and home type answer what the five questions were for |
| A × "with a reason writes a fact or dismissed_care" | The building handles it → `building_handles_exterior` and `building_handles_pests`; We don't have one → the row's fact false (or dismissed); Already done recently → nothing; Just not for me → dismissed; Skip → nothing. All written on Add | The mock's sheet |
| Settings, Your home offers the zip to existing homes | Built 2026-11-19 (mock https://claude.ai/artifact/CvrAvWEQr7wGao9wbAAtUm, approved). A Zip code field above Local climate, looked up on the device as the fifth digit lands; written only by the section's Save. An owner's climate (`climate_source` "owner", or null from before D8) is never overwritten: the zip's is offered ("Use the zip's" / "Keep mine"). A home with no answer, or one from an earlier zip, takes the new zip's, marked "From your zip". Unknown zip: said and not saved. Table won't load: Try again, and Save waits. Clearing a saved zip removes it and its area, climate kept. Rule in `src/components/settings/zipClimate.ts` | The edge case's own words |
| Only facts that change this month's list (must-be-true 6) | Settings shows every fact rated Relatively High or above | Settings describes the home for every month, not this month's list |
| (unstated) re-saving the profile | Save no longer rewrites `climate`/`freeze_risk` unless the climate itself changed | It reset freeze risk from the four-choice list, which would undo a zip's finer answer (zone 9 "hot" homes can freeze) |

Failure honesty: a task add that fails part-way rolls its own template back (`addLibraryTask`), so "No tasks were saved" is true; when the answers write itself fails, the message is "Nothing was saved".

