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
| 4 — remaining backend + FCM | **deploy packaging + rollForward + FCM scaffold + ALL 12 Bucket B fn ports done; FCM device verify + client FCM swap remaining** | esbuild bundle solves shared/; rollForward emulator-tested; every v1 edge fn now ported (see Bucket B section) |
| 5 — service swap + fixes A/C/D | **GATE CLOSED — zero shim imports, shim deleted**; fixes A/B/C/D landed; fix E (visual re-bake) is the only open item | every service on Firebase; parse-legacy retired; FCM swapped |
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
| home | **homeService + homeProfileService + inviteService + HomeOnboarding = ported**; acceptInvite/removeMember Admin callables **IMPLEMENTED** (firebase/functions/src/invites/inviteActions.ts, 8 fn emu tests) + invites rules hardened to members-only (3 rules tests); getInviteByToken collectionGroup read rule still deferred until sharing ships; member self-create bootstrap hole flagged for Phase 7 | ported |
| inventory | **itemService + supplyService + useServiceProviders + storageService = ported**; **legacy inventoryService + manualSourcesService DELETED** (Increment 1 — Smart Add now creates via createItemUnit; hooks/OnboardingInventory/InventoryItemSetup re-pointed, emu-verified); ocrService/planGenerationService/productLookupService = Bucket B callables | mixed |
| items / supplies | **itemService = ported** (getItemUnits/getItemUnit/create/update/softDelete on Firestore; camelCase→ItemUnit edge mapper); supplyService = stub | mixed |
| care | **weekAgenda.getWeekAgenda = ported**; **taskService = FULLY ported off shim** (reads: getTaskInstances/getTaskTemplates/ByItem/WithSchedules/getTaskDetail/getCompletionHistory/getTierChangeHistory — emu-verified; writes: createTaskTemplate [inlined default schedule]/updateTaskCareType/updateTaskDiagram{Urls,Pages}/updateTaskInstance/assignTaskInstance/archiveTaskTemplate/deleteTaskTemplate/logTaskCompletion/markDone/snooze — verified by pattern + tsc/build, UI write-path e2e = follow-up); updateTaskCareType/updateTaskDiagram* gained leading homeId; **conversationService = ported** (chatConversations + messages, emu-verified). **scheduleService + taskScheduleService = ported** (the task-create subsystem: createScheduleRule/getScheduleRulesByTemplate write/read the template's inlined schedule; generateTaskInstances resolves due date + writes an instance with the full denorm set — exercised live via /clean's backfill; createTaskFromNote writes template+instance; updateTaskSchedule/updateTaskNotes gained homeId + write tierChangeLog via Firebase auth; TaskEditPopover/TaskDetailSheet gained homeId props). homeUpkeep, careNoteService, shoppingListService = ported | mixed |
| lib (dashboard) | **getDashboardStats + getAllMaintenanceTasks + getDashboardTasks = ported** (denorm reads; power /maintenance + the Home feed w/ Fix A cap); getUpcomingTasks/getExpiringWarranties/getHomeNotices/getInsights = inert-shim (empty, non-crashing) → swap later | mixed |
| knowledge | parseManualService — trust-arc API (startParse/watchParse/parseManualAndWait/toUiStage) on Firebase = **ported**; shim `parseManual` still present for 5 callers (Phase 5); **knowledgeService = FULLY ported** (FAQ subset + chunk reads getChunksByManual/ByItem/searchChunks/getKnowledgeChunksByHome traversing nested manuals/{manualId}/chunks + chunk mutations reclassify/convert/archive/updateChunk* [manualId threaded from chunk.manual_id] + logParseCorrection/getParseCorrections → parseCorrections; seed expanded with a furnace manual + 2 chunks, emu-verified via /faq); **manualDocumentService = ported** (homes/{homeId}/manuals; ingestReference → callable); **conversationService = ported**; chatService, detectDocTypeService = stub (Bucket B callables); diagramRenderService = de-shimmed (dead); previewManualService + saveManualParseService = DELETE (worker modes) | mixed |
| lib | **dashboard.ts = FULLY ported** (getInsights item-match read swapped — shim-free); **cleanSession.ts = ported** (getCleaningTasks/getRoutineTemplates/getDeepCleanGuides/getItemCleanGuide via denorm + template/item maps + inlined schedule/supplies; saveRoutineTask/saveStandaloneTask write templates w/ inlined schedule; deleteRoutineTask gained homeId — emu-verified via /clean). userPreferences = ported; nativePush.ts/pushNotifications.ts = stub (Phase 4 FCM) | mixed |

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

## Phase 5 remaining inventory (resume here — updated 2026-07-12, HEAD after Increment 3)

The forward plan + full evidence audit live in `/root/.claude/plans/modular-baking-meadow.md`
(checkpoint). **15 files still import `@/integrations/shim/client`** (all non-crashing).
Increments 1–3 DONE this session (all emu-verified): P0 Smart Add un-break + legacy
inventoryService/manualSourcesService deleted; inline-portable sweep (10 files); acceptInvite/
removeMember callables + invites-rules hardening. Suites: vitest 127, rules 22, functions 21,
emu e2e 18.

**Remaining 15 shim files, by bucket:**

**B. Bucket B callable ports (Increments 4–5) — v1 source IS available at
`/home/user/homehub/supabase/functions/` (premise falsified — NOT blocked on source; only some
need owner secrets):**
- Core: `chatService` (chat-query 424 LOC → **HTTPS SSE**, keep streaming), `ocrService` (ocr 222,
  needs GOOGLE_VISION_API_KEY), `productLookupService` (product-lookup 480), `detectDocTypeService`
  (detect-doc-type 225), `planGenerationService` (generate-tasks 416).
- Tail: `AddNoteSheet` (import-care-url 152), `FaqPage` (suggest-care-notes 119), `PurchaseStep` +
  `ItemDetailPage` (check-recalls 164), `AdminToolsSection` (classify-existing-tasks 684).
- Also folded in: `ingestReference` (ingest-reference 209 — manualDocumentService), `searchProductImages`
  (search-product-images 94 — needs BRAVE_SEARCH_API_KEY). Both referenced client-side; implement as
  callables here.
- Port each edge fn as an onCall v2 fn (fixture-based emulator test per worker pattern) BEFORE
  repointing its client service. Owner secrets: BRAVE_SEARCH_API_KEY, GOOGLE_VISION_API_KEY.

**FCM (Increment 8, Phase 4 remainder):** `nativePush`, `pushNotifications` → FCM web SDK +
`users/{uid}/private/fcmTokens` + `firebase-messaging-sw.js`. (Settings send-test-push already
swapped to the `sendTestPush` callable.)

**Parse-legacy retirement (Increment 6):** `parseManualService` shim `parseManual` (3 caller files:
Settings rescan, ItemDetailPage auto-parse, useManualManagement) → startParse/parseManualAndWait;
then DELETE `previewManualService` + `saveManualParseService` after moving useManualManagement's
preview/save to worker modes.

**Fix E (Increment 7):** re-bake the 18 visual baselines against the emulator seed (currently
byte-identical v1 copies); decide CI wiring.

**Phase 5 gate:** zero `@/integrations/shim/client` imports → delete the shim; all suites green.
**Phases 6–7 (OWNER-gated):** prod data/auth/storage import, re-parse ~19 manuals, Apple prod
config, domain cutover — need real prod creds; can't run in the sandbox.

## Verified — Bucket B complete (all 12 edge functions ported; Increments 4–5)

Every v1 `supabase/functions/` edge function the client references is now a Firebase
Cloud Function; all client `supabase.functions.invoke(...)` calls are gone.

- **Smart Add core (onCall):** `generateTasks` (generate-tasks, Sonnet, PDF doc block +
  SSRF), `detectDocType` (detect-doc-type; reads manual, reuses worker storagePdf),
  `ocr` (Google Vision → Claude Haiku extraction; degrades to raw text), `productLookup`
  (forced tool-use two-tier safe/candidate; `productLookupCache` Firestore cache +
  per-user daily quota txn).
- **Ask (SSE):** `chatQuery` is an **onRequest v2 HTTPS fn** (streams SSE; verifies the
  Firebase ID token itself). ≤2 manuals → full-PDF answer, else preferred-type chunks;
  optional Brave web search. Client `chatService` uses `getIdToken()` + `functionUrl()`.
- **Tail (onCall unless noted):** `suggestCareNotes` + `importCareUrl` (shared
  parseSuggestions; importCareUrl SSRF-guarded), `ingestReference` (reference PDF →
  chunkType='reference' chunks), `classifyExistingTasks` (4-axis reclassifier; schedule
  inlined on template; txn apply w/ idempotency guard), `searchProductImages` (Brave),
  `checkRecalls` (CPSC → writes recall* on item), **`proxyPdf` (onRequest** byte proxy,
  ID-token auth, isAllowedUrl).
- **Shared helpers:** `ai/claude.ts` gained `CallClaudeTool`/`makeCallClaudeTool`; client
  `functionUrl()` + `pdfProxySource()` (replaces 3 copies of getCorsProxiedUrl; passes the
  ID token via pdfjs httpHeaders).
- **Injectable-core pattern** everywhere: **40 fixture tests** (generateTasks 4,
  detectDocType 4, ocr 5, productLookup 6, careSuggestions 5, checkRecalls 5,
  classifyExistingTasks 5, ingestReference 4, + prior). Full functions suite **59/59 green
  under the Firestore emulator**; tsc + client build green.
- **New Firestore index:** `chunks(deletedAt, chunkType)` for the chat chunk retrieval.
- **Owner secrets** already set: ANTHROPIC_API_KEY, GOOGLE_VISION_API_KEY,
  BRAVE_SEARCH_API_KEY. Owner still needs `firebase deploy --only functions,firestore:indexes`.
- **Live UI verification deferred to owner deploy:** chat SSE + a real Vision/Claude/Brave
  round-trip need live keys; the pure cores are fixture-verified. (Cloud Run backs gen2
  onRequest → SSE streaming is supported.)

**Client shim imports now 6** (all in Increment 6–9 scope): `parseManualService`,
`previewManualService`, `saveManualParseService`, `ItemDetailPage` (parse-legacy
retirement); `nativePush`, `pushNotifications` (FCM).

## Verified — Increment 6 (parse-legacy retirement) + 8/9 (FCM + gate close)

- **Parse-legacy DELETED:** the shim `parseManual` (raw fetch to the old parse-manual
  edge fn) + `previewManualService` + `saveManualParseService` are gone. New
  `commitManualDraft` callable commits a client-REVIEWED draft: re-runs the edited
  PreviewChunk/PreviewTask through the worker's normalizeChunkRow/normalizeTaskRow,
  then commitDraft (which already seeds recurring instances → no client
  generateTaskInstances). parseManualService adds `previewManualParse` (worker PREVIEW
  mode → previewDraft → snake_case PreviewResult) + `commitReviewedDraft`. Callers
  (useManualManagement add/rescan/fill-gaps/re-review, ItemDetailPage auto-parse,
  Settings rescan) now use worker modes; the dead dropped-connection polling machinery
  is removed (worker owns state; watchParse resolves only on done/error).
  `commitManualDraft.emu.test.mjs` proves edited client rows normalize + commit + seed
  an instance + derive steps.
- **FCM (Increment 8):** `src/integrations/firebase/messaging.ts` (getFcmToken +
  firebase-messaging-sw.js). pushNotifications + nativePush now store tokens in
  `users/{uid}/private/fcmTokens` (arrayUnion/arrayRemove) — the doc sendPush reads.
  Public API unchanged. Owner: set VITE_FIREBASE_VAPID_KEY + real config in the SW +
  verify a device push (Phase 4 gate).
- **Phase 5 GATE CLOSED (Increment 9):** zero `@/integrations/shim/client` imports →
  `src/integrations/shim` DELETED. Every service runs on Firebase.
- **Verified:** tsc + build green; vitest 127/127; functions suite 60/60 under the
  emulator; emu e2e 17/18 (the 18th is the first-navigation auth-home webServer-warmup
  flake — passes 6/6 in isolation).

**Only open Phase-5 item:** Fix E — re-bake the 18 visual baselines (still byte-identical
v1 copies) against the emulator seed post-fix-A, then wire the visual project into CI or
record a Phase-7 deferral.

## Phase 2 → Phase 3 deferral
- **Firestore emulator seed** (`scripts/seed-emulator.ts`) is still auth-only. The model is now
  frozen, so the deterministic Firestore dataset (mirroring `e2e/seed-config.ts`) is the FIRST
  Phase 3 task — it's the precondition for the parse-slice emulator e2e and the re-enabled
  chromium/mobile Playwright projects.
