# BACKLOG

_Last synced: 2026-06-17. Strategic Arc-level planning lives in `memory/project_backlog.md`; relevance tracker in `RUT_AUDIT.md`._

## In Progress
- [ ] _None_

## Up Next
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
