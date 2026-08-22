# BACKLOG

_Last synced: 2026-06-17. Strategic Arc-level planning lives in `memory/project_backlog.md`; relevance tracker in `RUT_AUDIT.md`._

## In Progress
- [ ] **Beta round 10 — the overnight sweep** (owner decisions 2026-08-22; 11 reports, 6 of them round-9 fallout, all owner-reported).
  - [ ] **HH-96 — mobile has no purchase-data entry** (warranty tracking impossible from a phone; the add-flow removal assumed the item page had it). Blocked on the everything-included item-page design.
  - [ ] **HH-92 — Home says "nothing scheduled yet" over scheduled tasks**; wire the #142 withheld-readback into the copy. Item-page date vocabulary folds into the HH-96 design.
  - [ ] **HH-94 — Tasks hides cleaning invisibly on a NON-empty list** (third report against the rule's invisibility).
  - [ ] HH-101 inverted setup labels · HH-100 "Something else…" placement · HH-98 "Save 11" over 3 shown · HH-97 "In guides" → "· Deep Clean" meta · HH-99 last-done styling · HH-95 briefing gate.
  - [ ] **HH-74 — add-screen spacing pass** (promoted from roadmap).
  - [ ] **HH-78 — sample home in the app's real design** (promoted from roadmap; direction approved on the Round 9 page).
  - [ ] **HH-102 — reminders follow importance** (proposal deletes the per-row switch; awaiting explicit yes).
  - [ ] **HH-93 — post-profile landing** (undecided; flow mockup requested).
- [x] **Beta round 9 — the add-manual flow, end to end** (ALL NINE live: #145–#149; HH-84/85 re-placed to the review sheet by her screenshots) (owner decisions 2026-08-21, from her 20-minute test run; 9 reports, 5 of them one item-page design problem).
  - [x] **HH-90 — every dialog stopped scrolling past one screen.** `DialogContent` had no max-height/overflow; "Add" was unreachable while choosing a manual. LIVE (#145).
  - [x] **HH-86 — item header repeated the brand.** #139's composed names met an unconditional "brand · model" subtitle; `itemSubtitle()` now suppresses by content. LIVE (#145).
  - [x] **HH-88 — parsing-copy semicolons.** Blocked on wording pick (options in chat + on the card).
  - [x] **HH-87 — item page during a parse.** `hasManual` is `parsed_at !== null`, so a parsing manual reads as none. Blocked on picking one of 3 mocked states + the global parsing-tray question.
  - [x] **HH-83/84/85/91 (+86 density) — the item-page redesign.** One screen, five reports: schedule buried, setup above upkeep, Ask front-and-centre pre-manual, crowded text, review exit ambiguous. Blocked on the Round 9 Redlines review.
  - [x] **HH-89 — manual section + PDF upload affordance.** Blocked on picking one of 3 designs.
- [ ] **Beta round 8 — "I did the work and see nothing"** (owner decisions 2026-08-21). All three are the same complaint from different screens: someone adds an item and the app shows them nothing in return.
  - [ ] **HH-81 — the onboarding add screen is still the OLD layout.** There are two add-item surfaces: `/inventory/add` (fixed in #139) and `/onboarding/inventory` (`AddItemForm`, never touched). The onboarding one asks Category → Room → Name and labels brand+model "optional" — on the one screen every new account sees first, calling the only two fields that lead to a manual optional. The duplication is the real defect.
  - [ ] **HH-82 — scheduled tasks absent from the Tasks list** (Chris, second report). Two deliberate causes stacking: `cleaning`+`item_unit` is excluded by the 2026-07-29 agenda rule, and the rest fall outside `weekAgenda`'s 7-day horizon. The horizon half is a side effect of #58 — before it, every new task landed due today, so the list was always full. We traded a flood for an empty list.
  - [ ] **HH-80 — Home has nothing actionable when a home has items but no tasks.** The empty hero is gated on `totalItems === 0`, so it correctly steps aside once an item exists; what fills the gap is a profile nag. Needs a middle state.

## Roadmap — from beta feedback
- [ ] **Ask one profile question, at the moment it changes something** — owner-approved 2026-08-21; design + the options that lost in `design/profile-nudge.md`. The measurement behind it: **climate is the only answer that changes which tasks exist** (7 readers, and its derived `freezeRisk` suppresses the whole freeze-prep family inside `commitDraft` *at parse time*), while **`ownershipDuration` has zero readers and we interrupt people for it**. Four steps:
  - [ ] **Retire `ownershipDuration`.** Stop asking, stop reading, drop it from the profile type and both profile screens. Firestore, so existing docs keep the orphan field harmlessly — no migration, and nothing to DROP.
  - [ ] **Climate becomes one question, with its consequence stated** — "we'll skip freeze prep entirely if winters are mild where you are" — instead of question 3 of 5 behind the least load-bearing ones.
  - [ ] **Ask it before the first parse commits.** That is the last moment the answer can change the tasks the user is about to receive, and they are already engaged. Not a banner.
  - [ ] **Everything else moves to Settings, never nudged**, and `completed_at` stops meaning "all five" and starts meaning "climate answered" — so the nag can actually end.
  - Edge cases already written up: a late answer re-runs `applyHouseRules` (same shape as the confirm-first sweep, not new machinery); climate is per-home, so a second home must be asked rather than inherit; declining stays free and must stop the asking; a changed answer offers confirm-first suppression of tasks already committed, never silent deletion.
  - Done means: a mild-climate home that answers before its first parse never receives a winterizing task, verified end to end against the emulator where `commitDraft`'s suppression is already tested.
- [ ] **HH-74 — spacing on the add screen.** Downgraded from Fix now on 2026-08-21 after the owner looked: HH-76 removed Room and Category from that screen, so the complaint was measured against a much longer version than ships today.
- [x] **HH-78 → promoted to round 10, 2026-08-22** — was: **give the sample home the app's real design.** `/sample` is the try-before-you-commit door and currently undersells the product.
- [x] **Beta round 7 — the first-run path, second pass** (6 of 8 live; HH-74/HH-78 moved to the roadmap above) (owner decisions 2026-08-21, from her own test session; see `docs/beta-feedback.md`).
  - [x] **HH-76 — finish the agreed add screen.** Room and Category moved off the main column; the approved design was brand + model + one CTA. LIVE (#139).
  - [x] **HH-75 — brand list emptied itself on the last keystroke.** LIVE (#139).
  - [ ] **HH-73 — the manual search offered two wrong documents.** Three faults: `findModelMismatch` doesn't fire on a doc naming two unrelated models; a parts reseller passed `isOfferableManual` with only a site name as its title; nothing checks document TYPE, so a spec sheet wore the "manufacturer's own site" badge.
  - [ ] **HH-72 — relabel "Search the web yourself".** The pre-filled Google search already exists; the label reads as being sent away. Blocked on wording.
  - [ ] **HH-74 — spacing on the add screen.** Blocked on layout review.
  - [ ] **HH-79 — "there is no long setup".** Blocked on wording.
  - [ ] **HH-77 — first-run hero copy.** Undecided, pending wording options.
- [x] **HH-78 → promoted to round 10, 2026-08-22** — was: **give the sample home the app's real design.** Roadmap. `/sample` is the try-before-you-commit door and currently undersells the product.
- [ ] **Beta round 6 — the first-run path** (owner-approved 2026-08-20 from TestFlight feedback; decisions in `docs/beta-feedback.md`). Four of these five land on the SAME screen, so they ship as one coherent piece of work rather than four patches:
  - [ ] **HH-48 — open the review when a parse finishes.** The "Review tasks" button already exists; the missing thing is the moment. Auto-open on the item the user is looking at; the button and pickup card stay as the fallback for a parse that lands while they are elsewhere.
  - [ ] **HH-56 — say what the manual said, let the user place the first window.** Nothing lands due today any more (#58), but an appliance the user has already been maintaining for months should not restart at zero. Show the manual's own cadence, offer "I did this recently".
  - [ ] **HH-55 — a custom interval, not more presets.** Explicitly NOT adding biweekly/every-3-weeks chips. `every_n_days` already exists end to end; expose it on the mobile task sheet and word it the way a person would say it.
  - [ ] **HH-35 — redesign the review sheet** for cohesion with the rest of the app and phone readability. Mono metadata sits at 9.5–10.5px, under the 11px floor, and the sheet body has a tighter inset than its own card rows.
  - [ ] **HH-23 — shortest path to a parsed manual.** Purchase/warranty fields move behind the item existing. Success measure is time-to-first-task, not form layout.

## Up Next
- [ ] **Task feedback loop ("Tune your tasks")** - Chips→chat feedback on any task; per-home house-rules layer + home-profile facts; confirm-first sweeps; global graduation via parse-eval corpus. Owner-approved design: `design/task-feedback-scope.md` (2026-07-17). Build Phase A first (no AI: chips, actions, ledger, confirm-sweep).
- [ ] **Add bulk item operations (multi-select)** - Select multiple items in Inventory to delete, tag, move to room, or update maintenance schedules. The top remaining feature; high daily-workflow value.
- [ ] **Wire Playwright E2E into CI** - Unit tests now gate every PR (#155/#156), but Playwright still runs nowhere automatically. Add `TEST_USER_EMAIL/PASSWORD` GitHub secrets + an e2e job so item-creation / task-lifecycle / chat flows actually gate.

## Follow-ups / polish (spun off the RUT + pro-task work)
- [ ] **Pro/hazardous treatment on more surfaces** - The "schedule a pro" reframing only renders on committed item-detail cards. Extend it to Maintenance-page rows and the parse-review sheet.
- [ ] **Deep-link "Find a pro" by category** - Currently links to /settings; route to the matching service-provider category instead.
- [ ] **Contextual Fix-routing for reactive tasks** (RUT P1 #5 remainder) - "When needed" tasks (e.g. replace oven bulb) should surface only when the symptom occurs, not as a standing list. Larger — needs symptom-taxonomy expansion. Honest categorization already shipped (#146).
- [ ] **Chat suggested-prompt relevance** (RUT P2) - Make any suggested chat prompts inventory-aware. Minor.
- [ ] **Backfill existing jargon/warning task data** - New parses are clean; the render layer masks legacy data, but stored `instructions_text` on old tasks is still raw until re-parsed. Optional dry-run backfill if clean stored data is wanted.
- [ ] **Route one-time installs to `setup` more reliably** - e.g. "Install Air Filter" still lands as "as needed" sometimes. Parser tuning.

## Exploration — from competitive analysis (2026-06-17)
_Unvalidated candidates surfaced by the Casa / Hint / Oply / Dib refresh in `COMPETITIVE_ANALYSIS.md`. Not committed — for spike/scoping before promotion to "Up Next."_

- [ ] **Automatic manual retrieval from model number** - Fetch the owner's manual automatically once brand+model are known, instead of relying on a user-supplied PDF/URL. Now a *parity* gap: Dib, Homer, and Casa-era expectations all assume this. Highest-leverage capture improvement. _(gap vs Dib/Homer)_
- [ ] **Faster time-to-first-value: address-first / chat-first cold start** - Deliver value in minute one — before the user has catalogued anything — then pull them into the deeper inventory layer. Counters Casa's "just ask" and Hint's "just enter your address" frictionless on-ramps. _(vs Casa, Hint)_
- [ ] **Proactive recall alerts (productize)** - Extend the existing recall/warranty inventory chips into active, push-able recall alerts checked against the CPSC public API. The one Centriq feature nobody — including Casa and Hint — has replaced; strong trust-builder for Centriq refugees. _(gap vs all; Centriq legacy)_
- [ ] **Lightweight resale / move-out report** - Auto-generate a shareable home-history / maintenance + warranty record at sale or move time. Hint is staking out "your home is your biggest investment / resale value"; ship a credible version before they own it. _(vs Hint; also Casa "House→Home")_
- [ ] **Smart Projects: photo/inspection → pro-ready scope** - Upload a photo or home-inspection report and have AI scope a job into a clear, pro-ready description (and tasks). Slick low-friction onboarding wedge; pairs with manual-grounded depth. _(borrowed from Oply; also Hint doc-vault)_
- [ ] **"Book a pro" partnership / referral integration** - Extend the existing "route to saved provider" + "Find a pro" deep-link into a real booking/affiliate path (Thumbtack / Angi / Oply-style). Potential revenue line to fund a free tier; favor "you pick the pro, no lead reselling" framing. _(borrowed from Oply / HomeLedger; extends existing pro-routing backlog items)_
- [ ] **Gamified maintenance health (Home Score milestones)** - Layer streaks/milestones onto the existing actionable health score for stickier engagement. Optional polish — validate it doesn't conflict with the "calm, not a chore app" north star. _(borrowed from Oply; extends shipped health score)_

## Audit follow-ups (v2 — 2026-06-17)
_From the full app audit in `AUDIT_REPORT.md` (overall 7.7/10, up from 6.1 in v1). Items already tracked above are cross-referenced, not duplicated._

- [ ] **Progressive-complexity model — staged feature reveal** (audit #1, highest impact) - Treat *features* the way tasks are treated (relevant/useful/timely): a surface appears only when the user's data + engagement warrant it. Three altitudes — Essentials (renter / new homeowner) → Engaged (5–15 items) → Power (20+/multi-home). Each surface self-gates + a small "level" helper. Fixes onboarding overwhelm; pairs with freemium (Free = L1 + basic L2, Pro = full L2/3 + multi-home); answers Casa/Hint's frictionless on-ramp.
- [ ] **Unify the dual parse path** (audit #4) - `parse-manual` ⊕ `preview-manual`/`save-parsed-manual` diverge repeatedly (4 bugs this session: #150/#153/#154/#158). Extract shared prompt + normalization so any task-field change touches one place.
- [ ] **`npm audit fix` + Content-Security-Policy header** (audit #5) - Clear 10 npm CVEs (4 high, mostly dev/unused-RSC paths) and add a CSP header (mitigates XSS→token-theft, since Supabase stores the auth token in localStorage).
- [ ] **Define free vs Pro tier** (audit #6) - Free is now table stakes. Free = capture + calm tasks + limited AI (L1 + basic L2); Pro = unlimited AI parsing, guided cleaning, troubleshooting, multi-home (~$8–12/mo or $79–99/yr). Pairs with the progressive-complexity levels.
- [ ] **Remove 5 debug `console.log`** (audit #8) - In `cleanSession.ts` + `DeepClean.tsx` (`[cleanSession]`/`[DeepClean]` tags).
- [ ] **Split the largest components** (audit #10) - `ItemDetailView.tsx` (1215), `FaqPage.tsx` (1168), and 13 other files >500 lines.
- [ ] **Systematic accessibility pass** (audit #12) - Keyboard nav, screen-reader labels, color contrast — beyond the 44px tap-target work already done.

_Already tracked above — automatic manual retrieval, address/chat-first cold start, recall alerts, resale report (Exploration §); bulk ops + Playwright-in-CI (Up Next §); orphaned-page cleanup (kept by decision, `RUT_AUDIT.md`)._

## iOS app (Capacitor — spike resolved, shipped to device)
_Spike concluded: **Capacitor 8** (SPM, no CocoaPods). Running on device; web app on Vercel unaffected. See `IOS_SETUP.md`._
- [ ] **APNs Apple-side setup to activate native push** (your steps) - Create an APNs auth key (.p8), add the Xcode **Push Notifications** capability, set `APNS_*` Supabase secrets, rebuild once. Code already ships (#170); this turns delivery on. Steps in `IOS_SETUP.md`.
- [ ] **Capgo OTA** - Offline-capable, App-Store-safe upgrade from the current `server.url` "load the live site" model. Do before App Store submission.
- [ ] **Supabase deep-link OAuth** - Only if/when social login is added (PKCE + custom URL scheme, ~½ day). Email/password works as-is.
- [ ] **Adopt UIScene lifecycle** - Silence the iOS 26 future-deprecation warning in the Capacitor template. Low priority.
- [ ] **App Store prep** - Icon/launch assets, privacy nutrition labels (Anthropic + Supabase data), TestFlight, Guideline 4.2 (native camera + push already help).

## Bugs
- [x] **Seasonal tasks with `season: null` anchor to the parse date → surface "due today" off-season** (verified in prod 2026-07-17) — _FIXED `1b1f078`: commitDraft anchors seasonal tasks via `seasonForTask`+`seasonalNextDue` (winterize → next fall) or holds unknown-season ones unscheduled; `schedule.season` now stored; deployed parseWorker+commitManualDraft; existing "Winterize Washer" instance re-anchored 07-14→10-15._ Remaining sub-issue below.
- [x] **Two prod tasks stuck due-today via seasonal misclassification** (found + fixed 2026-07-17) - _"Prepare Dishwasher for Vacation" reclassified `seasonal`→`as_needed` (it's an extended-absence task; its due-today instance dropped). "Inspect Vent and Intake Terminations" (furnace, safety/CO — actually seasonal, season signal "each heating season" was in the description) → `season=fall`, re-anchored 07-14→10-15. `seasonForTask` now scans the description too (`812f65c`, deployed) so HVAC "heating season" tasks self-anchor._ **Residual (open):** the *parser* still occasionally emits genuinely-non-seasonal tasks (e.g. vacation prep) as `scheduleType: "seasonal"` — a prompt-quality issue best addressed via parse-eval goldens or the task-feedback loop, not more heuristics. - "Winterize Washer for Cold Storage" (SF Condo washer) stored `scheduleType: "seasonal", season: null, anchorDate: 2026-07-14` (= the re-parse date) → instance dueDate 2026-07-14, so a winterization task became the Essential focus task in July. Fix both ends: extractor should emit `season` for seasonal tasks (winterize → "fall"; prompt change ⇒ must go through `scripts/parse-eval/run.ts` vs goldens first), AND commit/scheduling should treat seasonal-without-season as unscheduled (or hold until season known) instead of anchoring to today. Check how many other seasonal templates have `season: null` before fixing.
- [ ] **Functions emu suite is order-dependent (test isolation)** (found 2026-07-14) - `test:worker:emu` runs all `*.test.mjs` against one shared Firestore emulator with no per-file reset, so `rollForward.emu.test.mjs`'s "re-anchors… past-due instance" asserts `res.rolled === 1` but sees `2` in the full suite because `runRollForward` sweeps taskInstances across ALL homes (collectionGroup) and other test files leave scheduled past-due instances behind. Passes 4/4 in isolation. Fix: clear Firestore between files (or scope the rollForward query/assertions to the test's own home). Flaky-CI risk, not a product bug.
- [ ] **Push enable fails with generic "An error has occurred." (web; reproduced in Safari, 2026-07-14)** - Settings → Notifications → **Enable** throws and shows a generic alert; the real cause is swallowed. The Enable `onClick` (`src/pages/Settings.tsx:1043`) awaits `subscribeToPush()` with **no try/catch**, so `pushToggling` can stick on "…" and the underlying error (notification permission denied / FCM `getToken` failure / Safari web-push + VAPID limitation) is never surfaced. Fix: wrap in try/catch, reset `pushToggling` in a `finally`, and show the actual error. Then re-diagnose the Safari `getToken` failure with the real message. **Related gap:** the "Send test notification" button is gated to the native iOS shell only (`isNative && pushSubscribed`, `Settings.tsx:1067`), so there is **no way to self-test push on desktop web** — consider exposing it for `pushSubscribed` web users too. _(FIXED 2026-07-14: enable-error surfacing `8485aff`; web test button `92d14c2`.)_
- [ ] **Unscoped "Ask about your home" chat isn't query-relevant** (diagnosed 2026-07-14) - A home-wide (no filter) question pulls chunks from the home's manuals **in Firestore order until `MAX_CHUNKS` fills, then stops** (`chatQuery.ts:197-213`) — no relevance to the question (`embeddingRef` is always `null`, so there is no vector search — `commitDraft.ts:88`, `ingestReference.ts:116`). So early/chunk-heavy manuals (washer, Nespresso) eat the budget and most manuals (e.g. the Furnace) are **never read** — the chat answers "no manual for that" and falls back to general knowledge, regardless of the question. **Scoped chat works great** (item/room filter → few manuals → PDF path; verified the Furnace gives the exact TG9S lighting procedure). Fix options: (a) rank chunks by relevance to the query across *all* in-scope manuals (v2 chunks carry `tags`/`scenarios`/`sectionCategory` — cheap keyword/BM25 scoring), or (b) generate embeddings on parse + Firestore `findNearest` vector search. Re-parse does NOT fix this. _(FIXED 2026-07-14 `68f32e0`: option (a) — relevance-ranked chunk retrieval across all in-scope manuals, `chatQuery.ts` + `chunkRanking.ts` + node:test; verified on prod — unscoped "light my furnace" now answers from the York furnace manual.)_
- [ ] **2 imported manuals still point `sourceRef` at v1 Supabase storage URLs** (found 2026-07-14) - manual ids `d6485c07`, `ed6fc9e1` (SF Condo) have `sourceType:url` → `https://…supabase.co/storage/v1/object/public/Manuals/…`. They fetch fine while v1 is live, but will **404 when v1 Supabase is retired (Wave 4)**. Re-point to the migrated Firebase Storage object (or re-upload) before decommissioning v1.

## Later
- [ ] **Offline support via service worker** - Enable offline use of the app; high effort

## Done
- [x] **Native iOS push via APNs (#170)** - `@capacitor/push-notifications` registration wired into Settings + home nudge; `push_subscription.platform` migration; `send-push-notifications` branches web-push vs APNs (ES256 JWT/HTTP2). Delivery activates once the Apple-side APNs key + secrets are set.
- [x] **iOS native app on device (Capacitor spike → shipped, #165–#170)** - Capacitor 8 shell on real device; native camera nameplate OCR (#168); safe-area/Dynamic-Island fix (#167); live updates without Xcode via Vercel `server.url` (#169).
- [x] **Progressive-complexity model Phases A & B (#160–#163)** - `useUserLevel` + interface-level override (Simple/Standard/Advanced); essentials hides advanced routes; Fix tab merged into Ask/Chat.
- [x] **Test coverage + CI test gate + safety-classifier fix (#155, #156)** - Unit tests for the safety classifier / cautions / symptom matching; `npm run test` now runs in CI; fixed a regex bug that mis-classified gas tasks as DIY
- [x] **Commissioning steps → `setup` schedule routing (#154)** - One-time install/commissioning tasks route to the Setup checklist, not the recurring feed
- [x] **Pro/hazardous task safety model (#151–#153)** - "Schedule a pro" reframing for professional tasks; DIY steps suppressed for gas/combustion/electrical; parser + preview-manual write pro-framed, non-hazardous instructions
- [x] **preview-manual truncation fix (#150)** - Large manuals (furnace) no longer fail with "invalid JSON"
- [x] **RUT audit — P0/P1/P2 relevance fixes (#141–#149)** - Inventory-aware seasonal card, actionable health score, "Fix a problem" restyle, essential-only overdue, ⚠ caution callouts, plain-language parser prompts, Habits regroup, free-text symptom entry, recall/warranty inventory chips, tier cleanup
- [x] **Feature-based PRD + RUT audit docs (#140, #149)** - `PRD.md` and `RUT_AUDIT.md`
- [x] **Product walkthrough video** - Screen-record real app flows to complete the video (animated showcase on login done in PR #48)
- [x] **Seasonal/weather-based recommendations** - Surface maintenance tasks based on season and local weather; future differentiator
- [x] **Cross-bucket reclassify in parse review with parser learning (#51)**
- [x] **EOD commit: BACKLOG.md, audit report, HTML prototypes (#52)**
- [x] **Compress app icon PNGs (#50)**
- [x] **Update app icon with new Homehub logo (#49)**
- [x] **Add animated product showcase to login page (#48)**
- [x] **Fix product photo search 401 (#47)**
- [x] **Fix room group labels (#46)**
- [x] **Chip tabs as primary nav in task section (#45)**
- [x] **Tab hierarchy, banner alignment, task actions fixes (#44)**
- [x] **Task reclassify and complete-with-backdate (#42)**
- [x] **Login page redesign and layout balance (#37-#41)**
- [x] **Push notifications, warranty tracking, and dashboard insights (#65)**
- [x] **Smart Add item redesign (Arc 2)** - Complete redesign of add-item flow with OCR receipt scanning, structured field extraction via Claude, and SSRF protection
- [x] **Auto product photo search** - Automatically search and display product photos when adding items, with CORS and Brave API integration
- [x] **Shared home invites with member management** - Invite household members to shared homes with role management
- [x] **Dashboard redesign with calendar and agenda** - New dashboard layout with calendar view, agenda, and simplified tasks page
- [x] **Category standardization** - Enum-based categories with sub-types and task prompts for consistent data
- [x] **Item detail page two-column redesign** - Redesigned item detail with two-column desktop layout
- [x] **Onboarding tour and dashboard tier filter** - Guided onboarding tour with styled popovers, plus dashboard tier filtering and redesigned icons
- [x] **Mobile polish and empty-state hero (Arc 1)** - Mobile UX polish pass with empty-state hero for new users
- [x] **Glass-UI aesthetic across all sections** - Applied glass-UI design treatment across all item detail sections
- [x] **What's New banner on dashboard** - Banner highlighting recent features and changes
- [x] **Chat item auto-scoping** - Chat automatically identifies which item the user is asking about with inferred item indicator
- [x] **Standalone maintenance tasks** - Create maintenance tasks not tied to a specific product
- [x] **Rescan manuals with retry and bulk support** - Per-item and bulk manual rescan with retry, backoff, and error details
- [x] **Sentry error monitoring** - Production error tracking with Sentry integration
- [x] **Home ownership security checks** - Edge function guards ensuring users can only access their own homes
- [x] **CI build-check workflow** - GitHub Actions build validation with project shipping rules
- [x] **Sign out button on Settings page** - Allow mobile users to log out from settings
- [x] **Display name editing** - Edit display name from settings page
- [x] **add-item): benefit-labeled progressive disclosure CTA**
- [x] **dashboard): dedicated warranty expiration alerts card**
- [x] **item-detail): progressive-disclosure long task lists**
- [x] **smart-add): add-item redesign (Arc 2)**
- [x] **Add push notifications, warranty tracking, and dashboard insights**
- [x] **Add warranty alerts, push notifications, and fix invite onboarding**
- [x] **Style tour popovers to match app design system**
- [x] **Add reference docs, chunk deletion, and parse grouping fix**
- [x] **Add cross-bucket reclassify in parse review with parser learning**
- [x] **Compress app icon PNGs**
- [x] **Update app icon with new Homehub logo**
- [x] **Add animated product showcase to login page**
- [x] **Promote chip tabs to primary nav in task section**
- [x] **Add task reclassify and complete-with-backdate**
- [x] **Balance login page layout with grid columns**
- [x] **Center login page hero text and form**
- [x] **Improve login page alignment and heading weight**
- [x] **Redesign jump links and login page**
- [x] **Implement undo/redo for item and task operations** - Add undo/redo stack for item deletions, edits, and task status changes so users can recover from accidental changes without friction. This is critical polish for daily workflow reliability.
- [x] **one-step Add Item (name only required)**
- [x] **overdue): Essential-only overdue semantics — only Essential tasks show red**
- [x] **Phase 3: Cleaning/maintenance UI separation**
- [x] **Phase 4d: Cross-surface entry points for troubleshooting**
- [x] **Phase 4c: AI synthesis layer — 3 things to try**
- [x] **4b): symptom-first troubleshooting flow**
- [x] **4a/3): Setup Checklist on item detail**
- [x] **Phase 4a/2 — parser + classifier learn setup tasks + symptom_tags**
- [x] **Phase 4a/1 — setup-task schema + symptom taxonomy + types**
- [x] **export tasks to CSV for async audit**
- [x] **classifier detects + deactivates non-task rows**
- [x] **add behavioral-realism axis to habit-task classifier**
- [x] **classifier also re-proposes schedule_type (not just care_type)**
- [x] **show schedule_type in classifier dry-run report**
- [x] **classify-existing-tasks edge fn + Admin tools Settings UI**
- [x] **cleaning/maintenance classifier — Phase 1 foundation**
- [x] **service provider contacts**
- [x] **task completion history + manual file labeling**
- [x] **Arc 4 Phase 2c: top_concerns task ranking + cleanup**
- [x] **smart-add): AI product-lookup for brand+model spec autofill**
- [x] **a11y): mobile tap-target follow-ups (Maintenance + menus + popovers)**
- [x] **a11y): mobile tap-target audit — Home, Inventory, Settings**
- [x] **parse): Arc 3 PR 2 — manufactured_year age hint**
- [x] **review): Arc 3 PR 1 — additive briefing cards above parse editor**
- [x] **push): schedule daily reminders + add Home opt-in nudge**
- [x] **settings): home profile editor (Arc 4 phase 2a)**
- [x] **onboarding): home_profile Q&A step (Arc 4 phase 1)**
- [x] **ocr): nameplate-vs-receipt detection + purchase date/price autofill**
