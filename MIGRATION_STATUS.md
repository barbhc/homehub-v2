# Migration status ledger

Cross-session state for the v2 rebuild (`docs/homehub-v2-implementation-plan.md`).
Update the relevant rows in the SAME commit as the work. Statuses: `stub` → `ported` → `verified`.

## Phase gates

| Phase | Status | Notes |
|---|---|---|
| 0 — v1 data repairs | code merged (v1 #194) | owner still runs dedupe/breadcrumb/hygiene on prod (blocks Phase 6 only) |
| 1 — scaffold + Firebase + emulators | **code complete; owner console steps pending** | see "Phase 1 remainder" below |
| 2 — Firestore model + rules | **code complete; verified on emulator** | model doc 19/19 + rules 19 tests green + indexes schema-valid |
| 3 — parse worker + trust arc | **worker + seed + client trust arc (fix B) done** | 3.1+3.2 done; 3.3 watch-stages/snapshot tooling optional-remaining |
| 4 — remaining backend + FCM | **deploy packaging + rollForward + FCM scaffold done; callable ports remaining** | esbuild bundle solves shared/; rollForward emulator-tested; chat/proxy/detect/etc. ports need v1 source + API keys |
| 5 — service swap + fixes A/C/D | **fix A + auth module (fix D) done**; home/items/tasks/knowledge/chat swaps + fix C pending | auth is the first module off the shim; Apple owner-config in DEPLOY.md |
| 6 — import + re-parse | not started | needs Phase 0 owner scripts run |
| 7 — done checklist + switch | not started | |

## Phase 1 remainder (owner console; sandbox couldn't do these)
- [ ] Create GitHub repo `barbhc/homehub-v2` (private) and push this tree (or add repo to a Claude session and have it push).
- [ ] Firebase console: create project on **Blaze**, set a **budget alert** the same session; enable Auth (email/password + email link), Firestore, Storage, Functions, Cloud Tasks, Cloud Scheduler. Put the real project id in `.firebaserc` + web-app config in `.env`.
- [ ] `firebase deploy --only functions` → call `healthCheck` once (proves deploy).
- [ ] First `npm run emu` downloads emulator JARs; then `npm run seed:emu` + `npm run dev:emu`.

## Phase 1 adaptations (deliberate, documented)
- **Shim instead of per-service stubs:** v1 services compile UNCHANGED against
  `src/integrations/shim/client.ts`. Phase 5 gate = zero `@/integrations/shim` imports.
  **Phase 5 update:** the shim is now a genuinely INERT hand-written stub (was a real supabase-js
  client against a placeholder URL, which made unmigrated reads throw "Failed to fetch" and blank
  whole pages). It resolves every query to `{data:null,error:null}` with no I/O, cast to
  `SupabaseClient` so call-site typing is unchanged → partially-migrated pages render (empty
  unmigrated sections) instead of crashing. This is what lets Home/Maintenance render while their
  secondary loaders are still shimmed.
- **Seed:** auth-only for now; Firestore writes land with the Phase 2 model doc (seeding before
  the model would freeze a guessed schema). Dataset must stay identical to v1's `e2e/seed-config.ts`.
- **e2e:** full flow/visual/a11y suites parked until emulator auth+seed (Phase 2/3); `smoke`
  project (3 tests) is the CI gate meanwhile. Visual baselines copied from v1 for future comparability.
- **Capacitor kept temporarily** (native*/push importers) — FCM swap is Phase 4; native app post-switch.
- **Lint gate scoped to new code** (`npm run lint:new`): full-tree eslint carries ~70 pre-existing
  v1 findings (newer react-hooks plugin rules: set-state-in-effect/purity, etc.) in UI files the
  plan forbids churning in Phase 1. Each Phase 5 module swap fixes its module's findings and widens
  the CI scope; done = full-tree `npm run lint` green.

## Services ledger (Phase 5 tracks per-file)

All service files currently compile against the shim (status: `stub`).

| Module | Files | Status |
|---|---|---|
| auth | AuthProvider.tsx (Firebase: email/pw, magic link, reset via oobCode, **Apple/fix D**), ResetPassword.tsx, types/auth.ts | **ported** |
| home | **homeService = ported** (create/get/primary/rooms via Firestore; camelCase→curated-type edge mappers; membership via collectionGroup(members).uid); homeProfileService, inviteService, HomeOnboarding = stub | mixed |
| inventory | manualSourcesService, storageService, ocrService (→callable), planGenerationService, productLookupService (→callable), legacy inventoryService | stub |
| items / supplies | **itemService = ported** (getItemUnits/getItemUnit/create/update/softDelete on Firestore; camelCase→ItemUnit edge mapper); supplyService = stub | mixed |
| care | **weekAgenda.getWeekAgenda = ported** (single denormalized read, no joins); taskService (mark/snooze/detail → next), taskScheduleService, homeUpkeep, careNoteService, scheduleService, shoppingListService = stub | mixed |
| lib (dashboard) | **getDashboardStats + getAllMaintenanceTasks + getDashboardTasks = ported** (denorm reads; power /maintenance + the Home feed w/ Fix A cap); getUpcomingTasks/getExpiringWarranties/getHomeNotices/getInsights = inert-shim (empty, non-crashing) → swap later | mixed |
| knowledge | parseManualService — trust-arc API (startParse/watchParse/parseManualAndWait/toUiStage) on Firebase = **ported**; shim `parseManual` still present for 5 callers (Phase 5); manualDocumentService, knowledgeService, chatService, conversationService, detectDocTypeService, diagramRenderService = stub; previewManualService + saveManualParseService = DELETE (worker modes) | mixed |
| lib | dashboard.ts, cleanSession.ts, userPreferences.ts, nativePush.ts/pushNotifications.ts (Phase 4 FCM) | stub |

## Verified — Phase 1
- `npm run build` green (tsc -b + vite build) — first compile after sweeps.
- vitest 104/104 (13 files) incl. `shared/parse` parseCore suite; verbatim diff-gate vs v1 passed.
- Boot: `/`, `/signin`, `/home`-gate render with ZERO page errors on the inert shim (no env).
- Smoke e2e 3/3 (sandbox browser override; CI uses its own installed browsers).

## Verified — Phase 2
- `docs/firestore-model.md` — all 19 core tables + link/aux tables mapped; §3 coverage
  checklist 19/19; every read-model join (dashboard/weekAgenda/taskService/cleanSession/
  homeUpkeep/careNote) resolved to a v2 composition; denorm set (§5) enumerated; parse
  state-machine contract frozen (§8); complete_task/roll-forward/chunk-swap specs (§7,§9);
  6 deliberate divergences from v1 documented.
- `firestore.rules` — membership model mirroring v1's effective RLS; assignee-must-be-member
  guard; self-only users; role/member-management gates; global catalog server-write lock.
- `firebase/rules.test.ts` — **19/19 green on the Firestore emulator** (JAR v1.21.0 downloaded
  in-sandbox; Java 21 present). Covers tenant isolation, manual/chunk subtree, assignee guard,
  users self-ownership, global catalog read/server-write, member self-join/role/removal.
  Run: `npm run test:rules:emu` (wraps `firebase emulators:exec --only firestore`). Kept OUT of
  default `npm test` (separate `vitest.rules.config.ts`, node env) so unit runs never need a JAR.
- `firestore.indexes.json` — 12 composite indexes derived from the inventoried queries (§10),
  incl. one COLLECTION_GROUP index for the roll-forward sweep. Schema-valid; actual
  `firebase deploy --only firestore:indexes` needs the OWNER's project (Phase 1 remainder).
- tsc -b green; vitest 104/104 still green (rules test not collected).
- New devDeps: `@firebase/rules-unit-testing@^5.0.1` (firebase 12 peer), `firebase-admin@^13.0.2`
  (also the seed-emulator dep). firebase-tools installed ad-hoc in sandbox for the emulator run
  (NOT added to package.json — owner/CI supply their own).

## Verified — Phase 3.1 (parse worker)
- **Worker core `runParse`** (firebase/functions/src/parse/): drives the frozen state
  machine (queued→…→committing→done/error), claims requestId (ignores stale deliveries),
  commitable-draft guard (invariant 5), preview/commit/fill_gaps modes. Injectable
  `callClaude`/`fetchPdf` → directly testable without Cloud Tasks.
- **commitDraft**: chunk swap (hard delete+reinsert, one batch) + `planTaskReconciliation`
  execution (match=update-in-place+re-stamp externalKey, insert=new template + initial
  recurring instance w/ denorm §5, flag=missed_scans++, delete=soft, never completion-bearing);
  idempotent by requestId.
- **enqueueParse** (onCall): membership check + per-home in-flight cap + requestId claim +
  Cloud Task enqueue. **parseWorker** (onTaskDispatched, timeoutSeconds 1800,
  maxConcurrentDispatches 2, maxAttempts 2) — thin wrapper over runParse.
- Ported VERBATIM to shared/parse: `pickParseModel.ts`, `ssrf.ts` (invariants 4 & 8).
- **worker.emu.test.mjs — 5/5 green on the Firestore emulator** (fixture Claude response, no
  API): commit→done writes chunks+templates+instances w/ denorm; fuzzy rescan UPDATES in place
  (no delete/insert churn); malformed→error, no partial chunk swap; stale delivery no-op;
  preview writes previewDraft only. Run: `npm run test:worker:emu`.
- functions `npm run typecheck` green; @anthropic-ai/sdk added to functions deps.

## Verified — Phase 3.2 (client trust arc, fix B)
- **parseManualService** gains the Firebase-native arc: `startParse` (enqueueParse
  callable) / `watchParse` (onSnapshot on `parse.stage`) / `parseManualAndWait`
  (start + watch to done/error, guards on requestId) / `toUiStage`. The shim
  `parseManual` is kept intact for its 5 other callers (Phase 5 migrates them).
- **SmartAddItem.runParseAfterManualUpload** now advances to review **only on `done`**
  (worker reaches done only after commit → empty-review bug impossible); streams live
  stages via onStage; error → plan fallback.
- **ParseProgressStep**: honest 2–4 min stage-aware copy (was the "20–40 seconds" fib),
  added `queued`/`saving` stages + per-stage microcopy, an elapsed timer after 60s, and
  a calm error state.
- **toUiStage** unit-tested (9 cases incl. "no pre-commit stage maps to done").
- tsc green; vitest 113/113; `lint:new` gate green (the 2 react-hooks findings in
  SmartAddItem are PRE-EXISTING v1 `src/pages/` debt, unchanged by this edit, outside the
  gate — Phase 5 module swaps clear them).

### 3.2 deferrals (coherent with the shim migration state)
- `Settings.runRescan` + the 4 `useManualManagement`/`ItemDetailPage` callers stay on the
  shim `parseManual` until Phase 5 (manual-creation + home-context on Firebase). Wiring them
  to the Firebase arc now would be incoherent while manual data is shim-backed.
- **The 3.2 emulator e2e demonstration** (stages streaming in the real UI over seeded data)
  is gated on the Phase 5 manual-creation + auth→homeId swap. The service + mapping are
  correct now; the worker path itself is already proven by `worker.emu.test.mjs`.

## Verified — Phase 4 (partial: scheduler + FCM + deploy packaging)
- **Deploy packaging RESOLVED** — `firebase/functions/esbuild.config.mjs` bundles the entry to
  `dist/index.js`, INLINING repo-root `shared/parse/*` while keeping node_modules external.
  `main` → `dist/index.js`; `firebase.json` predeploy runs `npm run bundle` (= typecheck + esbuild).
  Verified the bundle inlines `planTaskReconciliation`/`titleSimilarity` and exports all 6 fns.
  (`npm run build` = tsc still emits `lib/` for the emulator tests.)
- **rollForwardNeverStarted** (onSchedule 30 5 * * * LA) + pure `addCadence` — collection-group
  sweep re-anchors never-started recurring past-due instances; keeps lapsed (has-done) + non-recurring
  untouched. **4/4 emulator tests green** (in `rollForward.emu.test.mjs`).
- **FCM**: `sendTestPush` (callable) + `sendPushDaily` (onSchedule 0 15 * * * LA) + token pruning;
  tokens at `users/{uid}/private/fcmTokens`. Compile-verified — **owner must verify a real push on
  desktop + iOS PWA** (no FCM emulator; plan Phase 4 gate).
- All 9 functions emulator tests green (`npm run test:worker:emu`); typecheck + bundle green.

### Phase 4 remaining (callable ports — need v1 source + live API keys)
Port from v1 `supabase/functions/` as direct callables / HTTPS fns (defineSecret for keys):
`chat-query` (2nd-gen HTTPS, **keep SSE streaming + PDF citations**), `proxy-pdf` (keep isAllowedUrl),
`detect-doc-type`, `generate-tasks`/`ingest-reference` (worker pattern, same queue),
`troubleshoot-synthesize`, `classify-existing-tasks`, `suggest-care-notes`, `import-care-url`,
`product-lookup`, `check-recalls`, `search-product-images`, `ocr` (verify live callers first).
Do NOT port: `manual-search`, `search-manual`, `identify-diagram-pages`, `backfill-diagram-pages`.
Best done alongside the Phase 5 services that call them (client contract in hand) or as a dedicated
keys-in-hand pass. `completeTask` callable (model §9) lands with the Phase 5 taskService swap.

## Verified — Phase 5 fix A (calm-by-default surfacing)
Addresses the #1 owner complaint ("still overwhelming — too many non-essential tasks").
- **`tasks/shared.ts`**: `applyTierFilter` (+ `isFocusTask`, `useTierFilter`). "Focus" =
  essential OR overdue (any tier); the universal DEFAULT (not level-keyed). `useTierFilter`
  persists the choice in sessionStorage but resets to focus each new session.
- **RefinedWeek (mobile) + DesktopTasks (desktop)**: default to Focus; leading teal **Focus**
  chip; **All · N** chip shows the true total (nothing feels hidden); calm empty-focus state
  with a one-tap "Show N other tasks →" link.
- **RefinedHome**: `UPCOMING_CAP = 4` on the Upcoming list + a quiet "{n} more this week →"
  link to /tasks when truncated.
- **10 unit tests** (`shared.test.ts`); vitest 123/123; tsc + full build green.
- **Pixels changed by design** → the Phase 5 canonical visual baselines bake AFTER fix A (fix E).
  e2e assertions (default = Focus, All count, one-tap reveal, Home cap + more-link) land with the
  emulator-seeded suite at the Phase 5 gate.

## Verified — Phase 5 auth module (fix D)
First service module off the shim.
- **AuthProvider** → Firebase Auth, `AuthState` signatures frozen. email/pw
  (`signInWithEmailAndPassword` / `createUserWithEmailAndPassword` + `updateProfile`); magic
  link (`sendSignInLinkToEmail` + localStorage email stash + on-load `isSignInWithEmailLink` →
  `signInWithEmailLink`); reset (`sendPasswordResetEmail`); `updatePassword` handles
  `auth/requires-recent-login`; **Apple = `OAuthProvider("apple.com")` + `signInWithPopup`** behind
  `VITE_APPLE_SIGNIN_ENABLED` (stub path when off).
- **`user` contract preserved**: `AuthUser = { id, email, user_metadata.full_name }` mapped from the
  Firebase user (id = uid) → the ~60 `user.id` / `user.email` / `user_metadata.full_name` reads across
  the app compile unchanged.
- **ResetPassword.tsx** → Firebase `oobCode` flow (`verifyPasswordResetCode` → `confirmPasswordReset`),
  routes to /signin after (reset creates no session). UI pixel-frozen — service logic only.
- **Owner config** (DEPLOY.md): Apple Services ID + Firebase provider; reset-email action URL → /reset-password.
- Verified: tsc + build green; vitest 123/123; **boot smoke 3/3** (pre-login renders under Firebase auth,
  no crash); zero `@/integrations/shim` imports in the auth module.

## Verified — Phase 5 home read path (homeService)
- **homeService** → Firestore: `createHome` (two batches — home+member first, then rooms, because
  the rules gate room writes on `isMember`), `getPrimaryHome`/`getHomes` (via
  `collectionGroup("members").where("uid","==",…)` — needs the `uid` field on member docs; seed
  updated), `getHome`, `getRooms`, `createRoom`, `renameRoom`, `deleteRoom` (soft-delete + nullify
  roomId on items/taskTemplates/cleaningSessions/careNotes).
- **Edge mappers** translate Firestore camelCase + Timestamps → the curated snake_case `Home`/`Room`
  types, so consumers are unchanged.
- **Signature note**: `renameRoom`/`deleteRoom` gained a leading `homeId` (Firestore path needs it);
  the only callers (Settings.tsx) updated. `createRoom` already carried `home_id`.
- Verified: tsc + build green; boot smoke 3/3 (HomeProvider → Firebase getPrimaryHome, no crash).
- Remaining in the home module: `homeProfileService`, `inviteService`, `HomeOnboarding.tsx` still
  on the shim (next).

## Verified — emulator-seeded e2e harness (wiring)
Real end-to-end verification against a seeded Firestore/Auth emulator — every future module
swap adds a spec here instead of relying on boot smoke.
- **`auth.setup.ts`** signs the seeded user into the Auth emulator and saves storage state with
  **`indexedDB: true`** (Firebase auth persists to IndexedDB, not localStorage).
- **`playwright.emu.config.ts`** — webServer `npm run dev:emu` (VITE_USE_EMULATORS=true); `setup` +
  `emu` projects; `PW_CHROMIUM_PATH` override for sandboxes, CI uses its own browser.
- **`e2e/emu/auth-home.spec.ts`** — 2 specs (home gate passes; Settings lists seeded rooms →
  `getRooms` end-to-end). **3/3 green** (setup + 2) on the emulator.
- **`npm run test:e2e:emu`** = `firebase emulators:exec --only auth,firestore "seed + playwright"`.
- **Rules fix (root cause of the first red run)**: `getPrimaryHome`/`getHomes` run
  `collectionGroup("members").where("uid","==",me)`; a parent-path `isMember(homeId)` check can't be
  statically proven for a collection-group LIST → denied. Added a dedicated, analyzable
  `match /{path=**}/members/{memberUid} { allow read: if resource.data.uid == request.auth.uid }`.
  Member docs now carry a `uid` field (seed + createHome). Rules unit tests still 19/19.
- **CI**: new `emulator` job runs rules + worker + seeded e2e (setup-java + firebase-tools + chromium).

## Verified — Phase 5 items read path (itemService)
- **itemService** → Firestore `homes/{homeId}/items`: `getItemUnits` (two equality-class filters
  + client-side sort, no composite index), `getItemUnit`, `createItemUnit`, `updateItemUnit`
  (snake→camel field map), `softDeleteItemUnit`. Edge mapper → curated `ItemUnit`.
- **e2e/emu/inventory.spec.ts**: Inventory shows "6 items across 3 rooms" + the seeded item cards
  (getItemUnits end-to-end). **Full emu suite now 4/4** (setup + auth-home ×2 + inventory).
- Remaining in items/inventory: add-item support services (storage/ocr/product-lookup → callables),
  supplyService, legacy inventoryService.

## Verified — Phase 5 tasks/care read path (partial) + Fix A on real data
- **weekAgenda.getWeekAgenda** → Firestore: the 3-way join collapses to ONE denormalized
  taskInstances read (firestore-model.md §5) + client-side status/dueDate/cleaning filtering.
- **dashboard.ts** partial: `getDashboardStats` + `getAllMaintenanceTasks` swapped (denorm reads)
  to unblock /maintenance's vestigial legacy loader (its `error` gate was blocking the redesign).
- **e2e/emu/tasks.spec.ts**: on /maintenance (DesktopTasks), default **Focus** shows the 2 seeded
  essentials + "All · 7"; recommended "Flush the water heater" is calmed out until All is tapped —
  **Fix A verified end-to-end on seeded data**. Emu suite now **5/5** (setup + auth-home ×2 +
  inventory + tasks). Note: the page renders 3 list copies (mobile/desktop/hidden-legacy) so specs
  filter to `{ visible: true }`.
- vitest 123/123; tsc + build green.
- **Task actions done**: `markTaskInstanceDone` → **completeTask callable** (Admin transaction:
  mark done + next-occurrence w/ denorm + dup-suppression + member-validated assignee inheritance;
  seasonal anchor + cadence); `snoozeTaskInstance` → direct Firestore update. completeTask core has
  **4 emulator tests** (functions suite now 13/13). Client wired (tsc green); the browser calls the
  callable, so a full click-through needs the functions emulator in e2e (deferred — the callable core
  is emulator-tested directly).
- **Fix C DONE (root cause: test-stale)**: the "Start here" banner shows only for
  `isOverdue && essential`, and `isOverdue` (getWeekAgenda) requires a PRIOR completion — by the
  calm design a never-started essential is "Start anytime", not overdue. The v1 seed gave its
  essentials no completion history, so `computeInsight` correctly returned "calm" and the banner
  correctly hid; the old spec's "2 overdue essentials" premise was never true. Fix: seed a prior
  completion for the furnace filter (`priorCompletion`) so one essential is genuinely overdue →
  banner surfaces for a real reason. Added `computeInsight` unit tests (4) + an emu spec asserting
  the banner. Emu suite now **6/6**; vitest 127/127.
- Remaining in tasks/care: getTaskDetail, cleanSession.ts, homeUpkeep.ts, the rest of dashboard.ts
  (Home feed).

## Phase 2 → Phase 3 deferral
- **Firestore emulator seed** (`scripts/seed-emulator.ts`) is still auth-only. The model is now
  frozen, so the deterministic Firestore dataset (mirroring `e2e/seed-config.ts`) is the FIRST
  Phase 3 task — it's the precondition for the parse-slice emulator e2e and the re-enabled
  chromium/mobile Playwright projects.
