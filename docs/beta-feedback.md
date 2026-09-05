# Beta feedback log

Running triage of TestFlight feedback. Appended by the scheduled routine
(`.claude/` cron) and by hand; newest first.

Pull it manually any time:

```bash
ASC_KEY_ID=86YGW9ASWY ASC_ISSUER_ID=94e74136-1682-4b9a-912b-668a5de478a7 \
ASC_APP_ID=6794043154 node scripts/ops/testflight-feedback.mjs --new
```

`--new` reports only items not seen before and then records them, so nothing is
reported twice. `--peek` shows new items without marking them seen — use it when
you only want a look.

Severity: **S1** data loss / privacy / cannot use the app · **S2** core flow
broken or badly misleading · **S3** confusing but workable · **S4** cosmetic.

---

## 2026-09-05 — round 19 (owner's run, 8 reports in 10 minutes · all decided same day)

Pulled 49 records from App Store Connect (not truncated). Eight are new, all
from the owner's own pass between 16:45 and 16:55 on build 202608170005; a
ninth ("Same old page", 27 Aug) was a third copy of HH-142 and folded into it.
No crashes. Every one of the 41 items from rounds 12–18 is still in Apple's
inbox — nothing has been deleted since 2026-08-30, and the deletion sweep is
still the outstanding action.

**Owner's decisions, same day: seven Fix now, one to the roadmap — and a
standing instruction recorded on every affected item: _"For all of the fix now
issues that have a design element, show me the change in a mockup before making
the changes."_ No code has been written for any of them.**

| ID | Report | Sev | What is actually happening | Call |
|---|---|---|---|---|
| HH-148 | "Dishwasher item page isn't loading" | S2 | Not reproducible — the same item loads in under 8 s on the branch build against her data, and her console showed QUIC network errors at that moment. The defect is that `ItemDetailPage` has no timeout: a stalled Storage or Firestore request holds "Loading…" forever. The page already owns a "Could not load this item · Try again" state (`ItemDetailPage.tsx:222–296`); nothing routes a hang into it. | Fix now |
| HH-149 | "When I search for dishwasher, it doesn't appear on the Ask page" | S2 | The picker matches name, brand and model (`FilterBar.tsx:42–46`) over every active item (`useChatFilters` → `getItemUnits`), and the item is named "Dishwasher" — the query would have matched. The list was EMPTY when she typed: still loading, or the items fetch failed and only wrote to `console.error`. Either way the UI says "No appliances match", which is a lie about her home. | Fix now |
| HH-150 | "Specific dates shown for tasks instead of time ranges" | S3 | Beyond a week out the row prints the stored date (`dueLabel` → `shortDate`, `src/lib/redesign/tokens.ts:66–75`) — "Tue, Sep 22" — while the task page for the same task says "Sep-ish · Window: Sep 15–29". Same invented-date habit fixed on Home and Your week in PR #197; the item page's rows were not in that PR. | Fix now |
| HH-151 | "'In your cleaning guides…' line looks too close to header and stylistically different" | S4 | A one-off 11.5 px line with almost no padding, sitting directly under the gold Cleaning band (`CareBlock.tsx:852–858`), in neither the band's nor the row's type. | Fix now |
| HH-153 | "Custom tasks says you can set them up from the Tasks page, but I don't see how" | S3 | The sentence is real (`Settings.tsx:751`) and the affordance is not: nothing on the Tasks page adds a task — only Deep Clean has an "Add a task…" field. A broken promise in copy. | Fix now |
| HH-154 | "Why is the rice cooker saved 4 times here?" | S2 | Every successful add creates a new manual record with no check for an existing one on the same item (`useManualManagement.ts:175`, `SmartAddItem.tsx:365`). Four attempts left four records, three of them "Not scanned" — and nothing will ever scan them. The Manuals list also has no per-row Remove or Rescan. | Fix now |
| HH-155 | "The task names are squeezed to the left" | S3 | The row's right side stacks four controls — cadence chip, bell, "See how ⌄", chevron (`CareBlock.tsx` `ScheduleRow`) — leaving the title roughly 140 px of a 390 px screen, so "Inspect and Clean Vent Ductwork" wraps to two lines. Exactly the anatomy fixed on Your week and Home this week. | Fix now |
| HH-152 | "In the manual, cleaning out the ductwork specifically says to hire a qualified technician. How can I flag tasks for scheduling a technician?" | S2 | Two halves. (1) There is no way to say "this one needs a pro": `Assigned to` offers Anyone or a household member (`RefinedTaskDetail.tsx:239–245`). (2) The sharper half — the row already renders a **Pro** badge when `actor` is `pro`/`hazardous`, and this task did not get one. The manual says hire a technician and the app handed her DIY steps, which is the pro-task safety model failing at parse, not a missing button. | Roadmap |

### The pattern this round paid for twice

HH-150 and HH-155 are the same two fixes that landed on Home and Your week days
earlier, in the same week, from the same owner sessions. Both were fixed where
they were reported and nowhere else. The item page's task rows are a THIRD
surface rendering the same task, and nobody swept it. Before closing round 19:
grep every surface that renders a task row and fix the whole set at once.

---

## 2026-09-02 — rounds 12–18 reconciled (41 reports, 24–28 Aug · none of them new)

**Headline: the "41 new" pull is not 41 new reports. It is HH-107 → HH-147 —
every report from rounds 12 through 18 — already triaged, already decided,
already fixed and verified live. They came back as "new" because they were
never deleted in App Store Connect, so Apple's inbox still holds them and the
seen-marker no longer matches. The one action is a deletion sweep, not a fix
round.**

Worked from `feedback/ledger.json` (pulled 2026-08-30, ledger last touched
2026-08-31 — no fresh network pull this session). Every one of the 41 Apple
records matches a ledger entry by timestamp and text, 41 for 41. Every entry is
`status: awaiting-deletion`. Two records were spot-checked against their own
screenshots and six fixes were re-verified in today's source, not taken on
trust:

| Claim | Verified today |
|---|---|
| HH-140 — the untouched "Review them all" step 1 is gone | `"Review them all"` now appears in `src/` and `e2e/` **only inside absence assertions** (`toHaveCount(0)`) |
| HH-128/146 — empty files refused | `ManualStep.tsx:164` — "This file came through empty…" |
| HH-139 — a label photo beats what was typed | `IdentifyStep.tsx:355` carries the fix and a comment naming the old `data.brand \|\| r.brand` bug |
| HH-145 — the burst ceiling was too tight | `shared/quota/policy.ts:260` — `BURST_UNIT_LIMIT = 45` (was 25), and the deployed bundle agrees |
| HH-124 — a parked scan resumes without the user | `retryAwaitingCapacity` is exported from the functions index; the closed-app half landed after all |
| HH-119 — the review's three doors | `TaskReviewSheet` still has exactly three call sites (`ParsePickupCard`, `ReviewItemTasksButton`, `ManualSection`) |

### The 41, by Apple record

Severity is what the report was worth **when it arrived**. Everything below is
live unless the last column says otherwise.

| # | ID | Report | Sev | What was actually happening | State |
|---|---|---|---|---|---|
| 1 | HH-145 | "There's an error with my scan" | S2 | Not a failure. A rate limit wearing a failure's clothes — the shot shows "The scan failed" directly above "Reading the manual — 124 pages", still running. `refusal.ts` matched only ceiling wording, so the burst message fell through to `The scan failed:` | ✅ #193 + functions 8/30 |
| 2 | HH-144 | Essential/Recommended/Optional is less useful than maintenance/cleaning/usage/setup | S3 | She was right about the axis: on her Sharp, tier grouping spent 6 headings to split 3 cleaning jobs three ways. Became round 18's kind-first review | ✅ #185 |
| 3 | HH-142 | "Same old page" (2 Apple records, 54s apart) | S2 | Round 14 approved a card with no sheet; only the card's words were built and the sheet stayed. Superseded by round 18 | ✅ #185 · **2 records to delete** |
| 4 | HH-143 | "Formatting is off in the notice" | S4 | `ParsePickupCard`'s fixed-width button squeezed the title into a 92px column, 14 wrapped lines. Stacks under 480px now | ✅ #196 |
| 5 | HH-141 | "Finished reading your manual" over "you haven't added a manual yet" | S2 | `hasParsedManual` = `parsed_at !== null`, and `parsed_at` stays null until the draft is committed — so a finished-but-uncommitted parse read as no manual | ✅ 8/26 |
| 6 | HH-140 | "Same old design is still here" | S2 | The fifth report, and the one that explained the other four: "Review them all" led to step 1, which no redesign had ever touched. Every earlier fix landed on the reported door and left this one open | ✅ #185 |
| 7 | HH-139 | Label photo should overwrite the typed brand | S2 | Confirmed in her screenshot: Brand "GE Café" above model SHPM65Z55N/01, a Bosch. `data.brand \|\| r.brand` let whatever was typed win. The item would have saved under the wrong manufacturer | ✅ #181 |
| 8 | HH-138 | "It said it found the manual" on the identify page | S2 | The card rendered a web-page **title** — "Bosch SHPM65Z55N/01 Manuals" — as a product name, and claimed a manual we had not verified. Same shot as #7 | ✅ 8/26 |
| 9 | HH-137 | "The old list of tasks is still showing up" | S2 | Fourth report of one thing. #134 removed the contradiction, not the screen. Her objection was never wording: why review at all when nothing needs a decision | ✅ #182 → #185 |
| 10 | HH-147 | "Again the old design, no maintenance task" | S2 | Same screen as #9, filed 2 days before round 18 reached production | ✅ #185 |
| 11 | HH-135 | Scanning message is small; wants more life in it | S4 | 11.5px over three lines with a static spinner for a four-minute wait. Now one line plus an indeterminate rail | ✅ #180 |
| 12 | HH-136 | Add-a-photo block sits above the item name | S3 | A dashed 150px CTA for an optional nicety was the first thing on the page. Now a 44px control beside the name. *(Same Apple record as #11 — one record, two asks)* | ✅ #179 |
| 13 | HH-134 | Sharp manual scanned, still the old view | S2 | The card offered "Review & schedule" for rows it had just said need no reminder, and behind it sat "Nothing needs a reminder" over "Save all 11" | ✅ #178 |
| 14 | HH-133 | Can't reach the service-provider field | S2 | Last input, flush to the footer, keyboard covers it, nothing left to scroll. Also in that shot: a microwave asked for Fuel type, and Installation date pre-filled with today | ✅ #174 |
| 15 | HH-132 | Tray says the Zojirushi is "actively scanning" — is it? | S3 | No. A parked scan counted as active (correct) but the tray labels every active stage "working", so it reported a running scan that wasn't | ✅ #174 |
| 16 | HH-131 | Scan button still live with no capacity left | S3 | Pressing it spent a request to be told no, and nothing said whether she had to come back and do anything | ✅ #174 |
| 17 | HH-146 | "5.9 MB but it says zero bites" | S2 | Same bug as #20, separate Apple record. Fixed ~4 hours after it was sent | ✅ 8/25 |
| 18 | HH-130 | Brand/model not carried to the manual step; no Back | S2 | Asked to go find a manual for a model number the app was holding and not showing, on a screen with no way back | ✅ #174 |
| 19 | HH-129 | Wants a pre-filled Google search link | S3 | Feature request, not a bug — a sensible bridge while our own manual search stays weak | ✅ #174 |
| 20 | HH-128 | "Check the file has content before accepting it" | S2 | Correct, and it was a data bug: iOS hands the picker a 0-byte placeholder for an un-downloaded iCloud file. The guard only checked for *too big*, so an empty PDF was uploaded, scanned, and turned into confident nonsense | ✅ #174 |
| 21 | HH-127 | Strange pop-up on the Sharp microwave | S2 | #24 through a door the fix didn't cover, and self-contradicting: "Nothing here needs a reminder" above "Save all 11" | ✅ #174 |
| 22 | HH-126 | Add-a-manual from the item page is the old design | S2 | A second door the redesign never reached — same shape as #29. Opened with Link selected and "Find it for me" prominent, the exact ranking #33 was about | ✅ #174 |
| 23 | HH-125 | "Why is this named Pan for NSLACO5?" | S2 | The name came out of the manual, not brand+model, so `composeItemName` kept a phrase that isn't what the thing is — and rename lived behind Edit in Details & records, not where she was standing | ✅ #174 |
| 24 | HH-124 | AI limit is a terrible dead end | S2 | A ceiling *we* set, rendered in alarm-red as an error she caused, with a "Try again" that would fail identically and a midnight-**UTC** clock. Now reads as queued, and the scan actually resumes | ✅ #171 + `retryAwaitingCapacity` |
| 25 | HH-123 | Don't bury the label photo under "can't find the label" | S3 | A deliberate reversal of the round-11 call, and the right one — field use showed the OCR is good enough to be a first-class route, not a failure fallback | ✅ #171 |
| 26 | HH-122 | **Stuck in landscape after shooting a label** | **S1** | Root cause was native, not web: `Info.plist` listed both landscape orientations for iPhone, and no screen in the product has a landscape layout. Rotating to shoot a nameplate rotated the app into a design that doesn't exist | ✅ TestFlight 202608250654 (the only item here that needed a build) |
| 27 | HH-121 | "I'm not sure what this page is. It just popped up." | S3 | The consolidated review auto-opening 95 minutes after the scan, on a manual with no maintenance, with no sentence saying why it appeared | ✅ #171 |
| 28 | HH-120 | "Wonky text" after dismissing the popup | S2 | A regression from #167: the review's new inline mode rendered inside a narrow layout slot and collapsed to one word per line, with two review surfaces mounted at once | ✅ #169 |
| 29 | HH-119 | Old pop-up showing all tasks | S2 | `TaskReviewSheet` had three callers and only one passed `focus`; the other two silently defaulted to the pre-round-10 review. The consolidated view was wired into one door of three | ✅ #169 |
| 30 | HH-118 | Bottom drawer repeats what's above it | S3 | The pill said "1 manual parsing" under a card already saying "Scanning your manual — 24 pages", named no item, and overlapped the page | ✅ #169 |
| 31 | HH-117 | Say the scan continues if I leave | S3 | Folded into #32 — the promise was stated on the item page and not at the moment she was watching a spinner deciding if she was trapped | ✅ #169 |
| 32 | HH-116 | No exit / no "you can leave" while uploading | S3 | Same as #31, one screen earlier | ✅ #169 |
| 33 | HH-115 | The three manual sources read as equals | S3 | Order was right, weight wasn't: three same-size white cards. Upload now dominates, link names `.pdf`, "Find it for me" is visibly demoted and badged Beta | ✅ #169 |
| 34 | HH-114 | Picked the right model, got no specs | S3 | The approved screen showed a spec list as *proof we found the right unit* — the defence against a wrong manual becoming a wrong care plan. `productLookup` returned the fields; the card never rendered them | ✅ #169 |
| 35 | HH-113 | "Incomplete steps" reminder gives no context | S3 | The resume gate said "You have an incomplete setup" while holding the item name, brand, model, step and age in the saved session. It also still carried the pre-round-11 title, which is why her first screen looked stale | ✅ #168 |
| 36 | HH-107 | Found manuals are bad results | S2 | Everything needed to reject them was computed and then ignored — `documentKind()` had already labelled result 1 a parts list, and `rankCandidates()` had no confidence floor. Round 7 added *information* where a *gate* was needed, which is why it came back | ✅ #167 |
| 37 | HH-108 | Can't exit the manual Preview | S2 | The close × was a 16×16px tap target in the shared sheet component — app-wide, and here the only exit. Now 44px across all 10 sheets and 10 dialogs, plus an explicit Done | ✅ #171 |
| 38 | HH-109 | Upload PDF is at the top but its drop zone is below the search | S3 | `ManualStep` rendered toggle → search → panel, and the search auto-fired on mount, pushing the drop zone below the fold. The file's own comment said upload was the default path; the layout said otherwise | ✅ #167 |
| 39 | HH-110 | The add page is one long form; mock a split flow first | S3 | HH-63 returning — that ask was answered by *collapsing* the extras behind a disclosure rather than splitting them, so opening the disclosure put her back in one long form | ✅ #167 |
| 40 | HH-111 | Warranty fields have serial but no purchase date | S2 | A regression with a stale justification: the code comment said the fields "live on the Purchase step now", and PR #161 had retired that step | ✅ #167 |
| 41 | HH-112 | Name shouldn't default to brand + model | S3 | `data.subType` already held "Refrigerator"; the default used the model string anyway, and the helper promised an improvement instead of saying she could rename it any time | ✅ #167 |

### What made 41 shipped items look like 41 new bugs

Nothing was mis-triaged. The pull is honest about what is in Apple's inbox and
the inbox is stale — **rounds 12–18 were fixed but never deleted in App Store
Connect.** Six of the 41 (`HH-107`–`HH-112`) are also already written up above
as round 11, so this log double-counted them until now.

Two records need deleting twice over: HH-142 is two Apple records with identical
text 54 seconds apart, and HH-128/HH-146 are two records of the same 0-byte
complaint.

### One real gap, found with the code open rather than from a report

`TaskReviewSheet` takes `freezeRiskFalse`, which suppresses winterizing work for
a home that never freezes. **Two of its three callers pass it; `ManualSection`
does not** — the same one-door-of-three shape as HH-119. Logged in `BACKLOG.md`
§"One review door skips the freeze-risk suppression", not fixed.

### The pattern rounds 12–18 paid for six times

HH-121 → HH-127 → HH-134 → HH-137 → HH-142 → HH-140 is one complaint reported
six times, and the first five fixes all landed on the screen named in the
screenshot while another door stayed open. HH-140 is the one that found the
cause. `CLAUDE.md` rule 6 — make the safe value the default and grep every call
site — was written from exactly this.

## 2026-08-24 — round 11 (owner's add-item run · 6 reports in 7 minutes)

**Headline: the owner stopped the patch cycle. All six approved Fix now, then
held behind one design pass — at least five complete add-item flows, every step
drawn — because three of the six are earlier reports coming back.**

Pulled 20:49 UTC. 6 items, all new, no crashes, inbox otherwise empty (the
105-item backlog was cleared 2026-08-23). All reporters are the owner,
iPhone16_2, build 202608170005.

Verified before triaging, because HH-109 asked directly whether this was the
latest design: production serves `SmartAddItem-DvUjlKIx.js` with the current
step-2 copy and `index-CBa9hT5C.css` with `--t-background:#f3f5f4`. It is the
current build. Every complaint is with what shipped, not with a stale cache.

| ID | Report | Severity | Recurrence |
|---|---|---|---|
| HH-107 | Manual search offers results it has already labelled bad | S2 | HH-73 |
| HH-108 | Manual preview cannot be exited (16px close target, app-wide) | S2 | — |
| HH-109 | Upload PDF tab separated from its drop zone by the search card | S3 | — |
| HH-110 | Add-item step 1 is one long form; wants it split, mock-up first | S3 | HH-63 |
| HH-111 | Purchase date / retailer / price missing from warranty fields | S2 | HH-96 |
| HH-112 | Name defaults to brand + model instead of something recognisable | S3 | — |

**No rejections this round.** Nothing was declined, so nothing is queued for
deletion on those grounds; all six stay open until the design lands.

**The pattern worth keeping.** HH-73 was answered with badges, a mismatch
warning and a document-kind label — real information, added to a list that
still said "Found 2 that could be right" and still offered a filled primary
"Use this". HH-63 was answered by collapsing the extra fields behind a
disclosure rather than splitting them into a step. HH-96 was answered by moving
the purchase fields to the item page. In all three the user's *outcome* was
unchanged, which is why all three came back. The round-11 rule: change what
happens, not what is said about it.

## 2026-08-21 (evening) — round 9 (owner's add-manual run · 9 reports in 20 minutes)

**Headline: one systemic bug (every dialog in the app lost scrolling past one
screen of content), one self-inflicted regression (the composed name meeting an
unconditional subtitle), and five reports that are a single item-page design
problem. Two shipped same-day; the design work is mocked on the Round 9
Redlines page and parked on the owner's picks.**

Pulled 19:57 UTC. 91 items, 9 new, no crashes. All reporters are the owner.

### Fixed and live (#145)

| # | Report | Root cause |
|---|---|---|
| HH-90 | "The page freezes up… where is the Google link?" | `DialogContent` had no max-height and no overflow — content past one screen grew off BOTH viewport edges with nothing scrollable, on every dialog in the app. The "missing" Google link was present below the cut-off; one bug, two symptoms. Fixed with `max-h-[calc(100dvh-2rem)] + overflow-y-auto` (dvh — iOS Safari's vh lies) |
| HH-86 | "Why is the brand name repeated at the top?" | Ours: #139 composes blank names as "Brand Model"; both detail headers rendered name + "brand · model" unconditionally. `itemSubtitle()` now suppresses by content, per-part |

### All picks shipped same-day (#146–#149, verified live)

Her picks: item page yes; HH-83 exit-not-accept; 87 A+tray; 89 A+find lane;
88 options 1+2; 78 approved for its roadmap turn. One correction her
screenshots forced: **HH-84 and HH-85 were review-sheet reports, not item-page
ones** — the item page already kept schedule first and setup last; the review
sheet had learned neither lesson. Fixes landed on the right screen.

| # | Shipped as |
|---|---|
| HH-83 | No finish path while a walkthrough card is open — footer shows "N of 11 decided · nothing is saved until the end"; ✕ Exit remains the way out and saves nothing |
| HH-88 | Both sentences, her picks (dash; shortened dialog copy) |
| HH-89 | Drop-zone upload + named lanes + "Find it for me · Beta" + PDF/LINK/REF tags. Fixing call sites caught "Re-upload PDF" opening the LINK tab |
| HH-87 | `parse_stage` carried to the client; live banner data-gated; CareBlock waits during a parse; the self-draining parsing tray above the tab bar |
| HH-84 | The walkthrough's schedule is the labelled "ON A SCHEDULE?" section, peer to What-is-it / How-important |
| HH-85 | Review order: whenNeeded before setup; setup tucked behind "Already set up? Hide them" |
| HH-91 | Ask below Upkeep with its precondition stated; empty card leads "No upkeep yet — add the manual" in Home's voice |

Also from her walkthrough screenshot: the sheet title read "LG LG DLGX3901B" —
ItemDetailPage prepended brand to a name that carries it since #139. Fixed
content-conditionally (#146).

### Superseded — as decided that morning


| # | Waiting on |
|---|---|
| HH-83/84/85/91 | The item-page redesign: schedule first, setup collapsed behind "Already set up", Ask contextual, empty state leads with the manual |
| HH-87 | One of 3 in-progress states + yes/no on the global parsing tray. Cause found: `hasManual` is `parsed_at !== null`, so a parsing manual reads as none |
| HH-89 | One of 3 manual-section/upload designs |
| HH-88 | One wording pick per sentence (2 sentences, 3 options each) |

### Roadmap

HH-78 (sample home — redesign mocked on the same page), HH-74 (reconfirmed).

### Rejected

HH-1, reconfirmed. Listed for deletion.

---

## 2026-08-21 (late) — round 8 (owner's continued test + Chris · 3 reports)

**Headline: three reports, one complaint. Someone adds an item and the app shows
them nothing back — on the onboarding form, on the Tasks list, and on Home. Two
of the three are consequences of fixes shipped hours earlier the same day, and
they are recorded here as that rather than explained away.**

Pulled 03:39 UTC. 82 items, 3 new, no crashes.

| # | Report | Root cause (verified in code) | Call |
|---|---|---|---|
| HH-81 | "This still looks like the old layout for adding an item" | **TWO add-item surfaces exist.** `SmartAddItem`/`IdentifyStep` at `/inventory/add` was fixed in #139; `AddItemForm` at `/onboarding/inventory` was never touched and still asks Category → Room → Name, labelling brand+model *"Optional: Add make and model for more specific maintenance tips"*. That is the approved design inverted, on the first screen a new account sees, calling the only two fields that produce a manual optional | **Fix now** |
| HH-82 | "I'm still not seeing these tasks on my task list" (2nd report) | Three scheduled tasks on his air fryer, all absent for **two** deliberate reasons: `Clean Baskets and Crisper Plates` is `cleaning`+`item_unit`, excluded by the 2026-07-29 agenda rule; the other two are due Sep 17, past `weekAgenda.ts:108`'s 7-day horizon. The horizon half is a **side effect of #58** — before it every new task landed due today, so the list was always full. The flood fix produced the empty list | **Fix now** |
| HH-80 | "No call to action to add an item — it just asks me to finish my home profile" | Not the zero-items case; the hero for that exists and she saw it two hours earlier. `isNewUser = totalItems === 0`, and by then the home held the LG dryer, so the hero correctly stepped aside. But that item has no manual (HH-73 offered two wrong ones), so no tasks — and the loudest element on a screen with nothing to do is a profile nag. **The missing state is has-items-but-no-tasks** | **Fix now** |

### Moved to the roadmap

| # | Report | Why |
|---|---|---|
| HH-74 | Spacing on the add screen | Downgraded from Fix now after the owner looked at it: HH-76 removed Room and Category from that screen, so the original complaint was measured against a much longer version than ships today |
| HH-78 | Sample home looks plain | Behind the add flow — someone who never reaches a parsed manual never comes back regardless |

### Rejected

HH-1 (blank submission), reconfirmed. Listed for deletion.

**Credit:** HH-82 is Chris, credited by name (no email on file, so no thank-you
to send). HH-80 and HH-81 are the owner's own reports.

---

## 2026-08-21 — round 7 (owner's own test session · 8 reports in 11 minutes)

**Headline: she tested a fresh account and the add flow, and the most useful
report was that the screen she approved is not the screen that shipped. Two
fixes are already live; three are blocked on her review by her own request; one
is on the roadmap.**

Pulled fresh 01:29 UTC. 79 items total, 8 new, no crashes. Every reporter this
round is the owner herself, so there is no tester to credit or email.

### Fixed and live (#139)

| # | Report | Root cause (verified) |
|---|---|---|
| HH-76 | "What happened to the design we had talked about?" | **Ours.** The approved mockup was brand + model + one CTA. The first pass moved the NAME field and stopped, leaving Room and Category between the model field and the button. Her screenshot carried the new subtitle, ruling out a stale bundle |
| HH-75 | Typing "lg" emptied the brand dropdown | `brandSuggestionsFor` skipped any brand whose LOWERCASED form equalled the query — meant as "already typed" — but the suggestion's whole value is the case. The list emptied on the last keystroke, taking the tap that fixes "lg" → "LG". Note the reported cause was not the real one: matching was already case-insensitive |

Same commit fixed a duplicate her screenshot caught: the Room field printed both
the new prefill hint and the old static helper line at once. That screenshot is
also the first production confirmation that room inference works — Laundry Room,
from an LG dryer.

### Blocked on owner review (her request, not a blocker we invented)

| # | What is needed |
|---|---|
| HH-72 | Wording for the web-search label. The pre-filled Google search **already exists** (`manualSearchUrl`) on the screen she used a minute earlier; "Search the web yourself →" reads as being sent away |
| HH-74 | Layout proposal for the add screen's vertical rhythm |
| HH-79 | Rewrite of "there is no long setup" |
| HH-77 | Undecided. Wording options for the first-run hero; "fixture" is the least motivating opening example |

### Roadmap

| # | Report | Why not now |
|---|---|---|
| HH-73 | Both offered manuals wrong — wrong models, one from a parts reseller | Fix now, next in the queue. Three faults: `findModelMismatch` handles suffix variants, not a doc naming two unrelated models; partstown.com passed `isOfferableManual` on a bare site-name title; nothing checks document TYPE, so a spec sheet carried the "manufacturer's own site" badge |
| HH-78 | Sample home looks plain next to the app | Half a day of design, and behind the add flow — someone who never reaches a parsed manual never comes back regardless |

### Rejected

| # | Report | Why |
|---|---|---|
| HH-1 | Blank submission (reconfirmed) | Nothing to act on. Listed for deletion |

---

## 2026-08-20 — round 6 (full-inbox sweep · 71 reports, two testers, 10–20 Aug)

**Headline: the inbox had ~50 reports that earlier pulls never surfaced, and 65
of the 71 were already fixed and live by the time they were read — verified
against the deployed bundle, not assumed. Of the six that needed a call, four
land on the SAME screen: the parse-review sheet. The first-run path is one piece
of work, not four patches.**

Reconciled with `feedback/ledger.json` (local; gitignored — it carries tester
photos and emails). Review page: the artifact linked from the ledger.

### Verified already fixed — no work, delete in App Store Connect

| # | Report | Where it was fixed |
|---|---|---|
| HH-28 | Ask hung on a typing bubble; composer below the fold | #58 — transport guard, honest empty answers, `100dvh` with tab-bar clearance. Confirmed live: the deployed `ChatPage` chunk contains "Lost the connection — please try again." and `100dvh` |
| HH-29 | "Trapped" in the Ask thread, wanted a back arrow | #58 — the thread Back control. Its code comment cites this exact report |
| HH-56 (bug half) | Every new task landed due today | #58 — `commitDraft` seeds the first instance one cadence from the add date. Confirmed in the DEPLOYED `commitManualDraft` source (`addCadence` present, function updated 2026-08-20 17:40 UTC) |
| HH-48 (misread) | "The review flow was supposed to open" | NOT the missing-pickup-card bug (#119) — his screenshot shows "Review tasks" present. See below |
| + 62 others | round 1–5 items | shipped between 15 and 20 Aug |

Because the iOS shell loads the live site, these reached testers **without a new
build** — which is why so many reports describe behaviour that no longer exists.
Build age is a weak signal on this app.

### Decided — owner, 2026-08-20

All five approved as **Fix now**. Owner notes re-scoped three of them:

| # | Report (as re-scoped) | Sev | What the owner changed |
|---|---|---|---|
| HH-48 | Open the review automatically when a parse finishes | **S3** | Confirmed the fix. The affordance exists; the *moment* does not |
| HH-56 | Say what the manual said; let the user place the first window | **S3** | Beyond the shipped fix: an appliance already in use for months should not restart its clock at zero. Educate with the manual's own cadence, offer "I did this recently" |
| HH-55 | A custom interval — explicitly NOT more presets | **S3** | Narrowed from "add biweekly" to "let the user say it". `every_n_days` already exists end to end; the mobile task sheet offers four cadences and no custom, and "Every N days" is developer wording |
| HH-35 | Redesign the review sheet for cohesion + phone readability | **S4** | Widened from a type-size fix to a design pass. Mono metadata sits at 9.5–10.5px (under the 11px floor) and the sheet body has a tighter inset than its own cards. Mono itself stays — `design/README.md` assigns it to serials, counts and dates |
| HH-23 | Shortest path to a parsed manual | **S3** | Re-framed from the tester's ask (one field per screen) to the owner's goal (fewer fields before the manual). A wizard with the same questions is the same number of questions. Success measure: time-to-first-task |

### Rejected

| # | Report | Why |
|---|---|---|
| HH-1 | Blank submission — no comment | Nothing to act on. Listed for deletion in App Store Connect |

---

## 2026-08-18 — round 5 (owner, one air-purifier session · 10 reports)

**Headline: the add flow is organised around identifying the product, but all of
the app's value comes from the manual. She added a Levoit Core 300 and ended on
an item page with a wrong name, a raw-slug category, no manual and no tasks —
with nothing on the page offering to find one. Two hard bugs underneath it: the
expanded task card ignores every tap, and the edit-task sheet's Save sits under
the tab bar.**

| # | Report | Sev | Root cause (verified in code) |
|---|---|---|---|
| 1 | "View full guide" does nothing (Tasks page, expanded card) | **S2** | `RefinedWeek.tsx:133` — the swipe-reveal layer is `absolute inset-0` with no `pointer-events-none`, and `ExpandedDetail` is a NON-positioned sibling. Positioned elements paint above non-positioned ones, so the invisible (opacity 0 ≠ untappable) reveal layer covers the whole expanded panel. "Mark done" and "Snooze" inside the panel are dead for the same reason |
| 2 | Text below the fold on the edit sheet, won't scroll | **S2** | `TaskEditSheet` is `z-50` and rendered INLINE in the page tree; the tab bar is also `z-50` and comes later in DOM order, so it paints on top and hides Save/Cancel. Radix sheets/dialogs escape this only because they portal to `<body>` |
| 3 | Model series found, the specific model wasn't offered | **S2** | Lookup fires on partial input ("Core") and AUTO-APPLIES a single result as "USING THIS". No candidate list, no re-run when the model is completed → the item is named "Levoit Core Series Air Purifiers" while brand·model reads "Levoit · Core 300" |
| 4 | Nothing in the flow searched for the manual; item page is a dead end | **S2** | `findManual` (Brave, deployed, secret bound) exists ONLY in the wizard's manual step, and only as a passive card you have to tap. The item page's Upkeep empty state is a sentence with no button; "Add manual or reference" offers a generic web-search link instead |
| 5 | "Search the web for the manual" opens a generic search | **S3** | Same asymmetry — the item-page dialog never calls `findManual`, it links to `manualSearchUrl()` |
| 6 | Category shown lowercase, no picker (Room has one) | **S3** | `RefinedItemDetail.tsx:99,141` renders `item.category` raw. The field holds a subtype id ("air-purifier") for lookup-created items and a category label ("Major appliance") for older ones. `getSubTypeLabel()` already exists and isn't used; no edit affordance |
| 7 | Fields should be clearly optional; too much before the item exists | **S3** | Serial, purchase date, price, warranty and spec fields all sit in the add flow ahead of the manual |
| 8 | Header says "Give it a name to get started" over a Brand/Model form | **S3** | `SmartAddItem.tsx:541` — copy predates the two-lane start |
| 9 | "Snap label instead" / "From library" float; "library" is unclear | **S3** | `IdentifyStep.tsx` — three sibling affordances with no grouping label; "library" means the photo library |
| 10 | Item photo pops in late | **S4** | `ItemPhoto` resolves the URL through `useStorageUrl()` after mount, with no reserved space or fade |

**Also found (not from feedback):** a Secret Manager secret in `homehub-2068d`
whose NAME is a live-looking Anthropic API key (`SK_ANT_API03_…`) — someone ran
`secrets:set <value>` instead of `secrets:set NAME`. The key material is visible
to anyone with list access. Rotate it and delete the secret.

**Proposal:** `design/add-item-manual-first.md` — reorder the flow so the manual
is the spine, move purchase/spec details onto the item page, and make find-the-
manual, category and room behave identically on all three surfaces.

---

## 2026-08-17 — round 4 (second tester, one air-fryer session · 14 reports)

**Headline: P0 + P1 fixed and deployed. The "due today" report turned out to be
a STALE DEPLOY, not stale data — production was running a bundle older than the
seeding fix, which only surfaced by driving the real callable in the emulator.**

| # | Report | Sev | Status |
|---|---|---|---|
| 1 | Cover-page-only upload produced 3 confident generic tasks under "From your manual" | **S1** | ✅ Fixed (PR #71) — `shared/parse/pdfShape.ts` counts pages from raw bytes, worker stores it, review sheet warns. Silent when the page tree is compressed: a false warning on a real manual would teach people to ignore it |
| 2 | Re-parse duplicated tasks ("Clean Baskets" twice, worded differently); no keep/clear prompt | **S2** | ✅ Fixed (PR #71) — `commitDraft` declines to CREATE a near-duplicate of an existing active task on the same item from another manual. Suppression, not deletion (invariant 3 intact); skips counted + logged |
| 3 | "All the new tasks got scheduled as due today" | **S1** | ✅ Fixed — **not a code bug and not stale data**: his instances were written a day AFTER the fix deployed. Driving `commitManualDraft` against the emulator proved current code seeds weekly → today+7, so prod was running a stale bundle. Redeployed `commitManualDraft` + `parseWorker`; his 3 instances repaired (weekly → 8/25, monthly → 9/18, verified 200s) |
| 4 | Manual says "after each use"; review offered only Monthly or off-schedule | **S2** | ✅ Fixed (PR #71) — review sheet offered 6 of the 9 cadences the parser/store/item-page editor all support. All nine now, plus an "Every N days" interval input (default 14 = his every-two-weeks ask) |
| 5 | Adding a manual from the item page skipped review entirely — "these items just appeared" | **S2** | ✅ Fixed (PR #71) — it parsed in commit mode while the wizard previews first. Now previews + opens the same review sheet, which is also what makes #1's warning reachable |
| 6 | Walkthrough was one-way; didn't know cadence was editable later | S3 | ✅ Fixed (PR #71) — Previous button + a line up front saying you can change these later |
| 7 | Wants a progress bar and to be told parsing continues if he leaves (item-page parse) | S3 | ✅ Fixed (PR #73) — the add-manual dialog now says you can close it, keep using the app, or quit; the tasks will be waiting. Always was true (server-side worker); the wizard said it and this path didn't |
| 8 | Yellow parse-error banner can't be dismissed | S3 | ✅ Fixed (PR #73) — dismissible; it explained itself once then followed him around the item forever |
| 9 | Onboarding bubbles describe other tabs while the screen behind doesn't change | S3 | ✅ Fixed (PR #73) — each step carries a route and navigates on highlight; verified all five land on /home, /inventory, /maintenance, /chat, /settings |
| 10 | Welcome tour bubble sits under the toolbar icons | **S3** | ✅ Fixed (PR #73) — root cause was NOT styling: the nav renders twice (desktop header + mobile bar) with the same `data-tour`, and driver.js's `querySelector` picked the hidden desktop one, collapsed to 0×0 at y=0. Steps now resolve to the first VISIBLE match; safe-area clamp added as backup. Measured after: popover top 605 in an 812 viewport |
| 11 | Label-photo consent prompt is unwanted — he'd never use a label as the item photo | S4 | ✅ Fixed (PR #73) — the photo stays out by default and the offer is one quiet link with Undo, instead of a question you must answer to move on |
| 12 | Pasting the SharkNinja Salesforce URL still fails | S3 | ✅ Working as designed — he saw the new friendly copy. That link keeps its file id after `#`, which browsers never send, so it can never resolve server-side |

**Also caught while fixing P2:** the item page auto-parses recently-added
unparsed manuals in COMMIT mode on load — the same "tasks just appeared" path
fixed for the add-manual handler in #71, which would have quietly undone it (a
review closed without saving leaves the manual unparsed, so the next visit
commits behind the user's back). Now previews + reviews, most recent only.

**The lesson worth keeping from #3:** a green deploy is not a working deploy. The
only thing that found it was running the real callable against the emulator and
reading back what it wrote.


## 2026-08-15 — round 3 (owner + second tester)

**Headline: one S1 data bug (the "22 tasks due today" alert) fixed at the
source, in prod data, and in the push counter; four UX proposals from this
round's triage built and shipped together.**

| # | Report / proposal | Severity | Status |
|---|---|---|---|
| 1 | Owner's lock screen: "You have 22 tasks due today" | **S1** | ✅ Fixed 3 ways: `commitDraft` seeded every parsed task due on its creation day → first due is now one cadence out (`addCadence`, seasonal tasks anchor to their season); `commitManualDraft` + `parseWorker` redeployed. The 7 flooded SF-Condo instances re-dated in prod (verified 200s). `sendPushDaily` also counted raw open instances while Home filters item-scoped cleaning — both now share `shared/tasks/agendaEligibility`; deployed |
| 2 | Parse looked like it failed when leaving the wizard mid-parse | S2 | ✅ Built — "Continue in background" on the progress step + item-page pickup card (live stage → "N tasks found — Review" → error), gated on a handoff flag so old manuals never banner |
| 3 | No way to create a room, or change an item's room on mobile | S3 | ✅ Built — tappable room pill → RoomPickerDialog (pick or create); "+ New room…" in the wizard RoomSelector and the desktop edit dialog |
| 4 | Label photo silently became the item's picture; no library option | S3 | ✅ Built — "From library" lane (native photo picker / no-capture input) + "Use as the item's photo?" consent chips, default off |
| 5 | Finding the manual is a dead end when the in-app search misses | S3 | ✅ Built — "Search the web yourself →" pre-filled with brand + model in FindManualCard's dead-end states and the item page's add-manual dialog |
| 6 | Owner: app takes ~3s to load | S3 | ◐ **Measured, half closed.** Device numbers (8/15, WiFi): ttfb 63ms, bundle 409ms, auth 214ms — **web total 625ms**. Fonts already non-blocking, firebase/react already preloaded: no cheap web win left. The other ~2.4s is native shell launch before the WebView navigates, invisible to web timing. Measuring it needs a launch stamp in the iOS shell → next TestFlight build. Separately, the diagnostics panel was calling this healthy boot "never finished loading" (PR #60) |
| 7 | Buttons cut off near screen edges (safe area) | S3 | ✅ **Fixed (PR #64), deployed.** Two distinct causes. (a) `AppLayout.tsx` reserves a flat `pb-16` for the bottom nav, but the nav itself adds `pb-[env(safe-area-inset-bottom)]` — so on a home-indicator iPhone the bar is ~34px taller than the space reserved for it, and the last element on any page sits under it. The tester hit it on the add-item wizard ("Back and Add item buttons are still partially cut off"), but it is global. One-line fix: `pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0`. (b) `PhotoSearchSheet`'s footer is `px-4 py-3` with no inset, so "Use as photo" sits on the home indicator. Other sheets (TaskEdit, TaskFeedback, UndoBar) already handle this — this one was missed |
| 8 | Lookup provenance — wrong wattage, "Amazon" titles, unclear icons | **S2** | ✅ **Fixed (PR #64), fully deployed — web + `productLookup` function.** The screenshot shows "Power (W) **700** ✓ Applied" directly above a Wattage field reading **1690** (1690 is the correct DZ201 spec; the AI's 700 is wrong). Chain: `productLookup` validates candidate keys only as snake_case (`/^[a-z0-9_]+$/`), NOT against the category's field schema, so Haiku can emit key `power` while the form field is `wattage` → `handleApplyCandidate` writes `categoryFields.power = 700` → `CategoryFields` renders only schema fields, so nothing visibly changes and an orphan key is saved on the item. "Applied" comes from a separate `appliedCandidateKeys` Set that records the *click*, not the *form state* — the same second-source-of-truth pattern as the boot mark. Plus "High confidence" is the model's self-report presented as fact, and the citation is truncated mid-word |
| 9 | Owner: "The hero task on the homepage to replace the air filter… not clickable outside of the snooze and other button" — expected instructions + what size filter | S2 | ✅ **Fixed (PR #66), deployed.** The hero named the job and offered only Mark done / Snooze, so "how, and which part" had no route out of the card announcing it. The whole headline is now the tap target → `/tasks/{id}`, with an explicit "See how & what you need" line; a `swiped` ref stops a face-swipe ending over the headline from opening the task. Checked against her real data: the Carrier "Replace the Air Filter" template carries steps AND supplies ("Field-supplied return air filter (e.g. 16x25 or 20x25)"), both rendered by HowToSteps — so the tap answers the size question too |
| 10 | Chris: "I got this error message when trying to parse user manual" — raw Anthropic 400 JSON (request_id included) in the banner, air-fryer manual via pasted URL | **S2** | ✅ **Fixed (PR #69); client belt deployed, `parseWorker` deploy pending.** Verified root cause: the pasted SharkNinja Salesforce link keeps its file id after `#`, which browsers never send — the server fetch got HTTP 200 `text/html` (1.5KB stub) and shipped it to Claude as a PDF. Worker now validates `%PDF-` bytes BEFORE the API call (HTML → "That link opened a web page, not a PDF — download it, then upload here"), the catch humanizes anything that escapes (raw kept as `parse.error.raw` for diagnosis), and the client humanizes at all five display sites. His link can never work server-side — the answer for him is upload-the-PDF, which the new copy says |

## 2026-08-14 — second tester, round 2 (6 reports)

**Headline: all six were already fixed in `main` before this triage.** Every
report predates the commit that addresses it — the tester is on a stale
TestFlight build (last two fix rounds, PR #53 and PR #56, hadn't reached him).
**One action for the owner: cut a fresh TestFlight build from current `main`.**

| # | Report | Severity | Status |
|---|---|---|---|
| 1 | "Still getting this message when I try to use the camera" (red camera error) | S3 | ✅ Fixed (PR #56) — same as #4; sent 4 min before that fix merged |
| 2 | "My name appeared in Home Members only after switching tabs and back" | S3 | ✅ Fixed (PR #53) — members list now refetches on save |
| 3 | "Let me add my name right here instead of scrolling to the bottom of Settings; it also didn't update immediately" | S3 | ✅ Fixed (PR #53) — inline name field added to the member row; saves and reloads in place |
| 4 | "Took the photo, then this message popped up" (camera error after a successful shot) | S3 | ✅ Fixed (PR #56) — the photo-picker fallback no longer shows a red error; only a real permission denial surfaces a message |
| 5 | "I accidentally deleted a task in the Later section — can you restore it?" | S2 | ✅ Not deleted; explained + fixed (PR #53). He *snoozed* the Dishwasher filter task (alive, snoozed to Aug 20, due Sep 1). The row vanished silently with no undo, so it *felt* like data loss. Snooze/complete now show a receipt with Undo |
| 6 | "Tapped the Search field, the app zoomed in and wouldn't go back" | S2 | ✅ Fixed (PR #53) — the Items search input was 15px; iOS auto-zooms any focused input under 16px and a Capacitor shell has no way to zoom back out. All touch inputs floored at 16px |

**What made them look like bugs:**
- **#5** looked like S1 data loss but nothing was lost — a snooze with no visible
  result and no undo is a destructive action *from where the user sits*, whatever
  the database did. Verified against prod: exactly one task changed that minute,
  and it was snoozed, not deleted.
- **#1/#4** the camera fallback *worked* (he got his photo) — we were just
  announcing our internal reroute to the photo picker as a red error.
- **#2/#3** the round-1 name fix saved the name but never refetched the list, and
  pointed the user at a field buried at the bottom of Settings.

## 2026-08-12 — first outside tester (9 reports)

| # | Report | Severity | Status |
|---|---|---|---|
| 1 | "The app greeted me as Barb" | S2 | ✅ Fixed — owner's name was hardcoded in both Home headers (PR #50) |
| 2 | "Other people show as unknown" | S3 | ✅ Fixed — `users/{uid}.fullName` was never written; now seeded from the auth provider (PR #50) |
| 3 | "Blank Home Screen when I first logged in" | S2 | ✅ Fixed — skeleton now explains itself after 6s (PR #50) |
| 4 | "I had a list of tasks on my brand new account" | S3 | ✅ Explained — he is a legitimate admin of SF Condo. Home now names the home (PR #50) |
| 5 | "There were tasks here on my task list" | S3 | ✅ Same as #4 |
| 6 | "I have items I didn't add on my items tab" | S3 | ✅ Same as #4 |
| 7 | "How did I become a home member with my new account?" | S3 | ✅ Same as #4 |
| 8 | "The dark theme colors are off" | S4 | ⬜ Open |
| 9 | "Formatting on the box is off — text and light green boxes too close to the edges of the gray box" | S4 | ⬜ Open |

**Verified during triage:** prod holds exactly 3 homes and 2 accounts, none
created during his session. Nothing leaked; the public link is safe. The scare
came from correct behaviour being indistinguishable from a breach — which is
why #4–#7 were treated as a real (UX) bug rather than dismissed.
