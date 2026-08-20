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
