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
| 4 — remaining backend + FCM | not started | |
| 5 — service swap + fixes A/C/D | not started | |
| 6 — import + re-parse | not started | needs Phase 0 owner scripts run |
| 7 — done checklist + switch | not started | |

## Phase 1 remainder (owner console; sandbox couldn't do these)
- [ ] Create GitHub repo `barbhc/homehub-v2` (private) and push this tree (or add repo to a Claude session and have it push).
- [ ] Firebase console: create project on **Blaze**, set a **budget alert** the same session; enable Auth (email/password + email link), Firestore, Storage, Functions, Cloud Tasks, Cloud Scheduler. Put the real project id in `.firebaserc` + web-app config in `.env`.
- [ ] `firebase deploy --only functions` → call `healthCheck` once (proves deploy).
- [ ] First `npm run emu` downloads emulator JARs; then `npm run seed:emu` + `npm run dev:emu`.

## Phase 1 adaptations (deliberate, documented)
- **Shim instead of per-service stubs:** v1 services compile UNCHANGED against
  `src/integrations/shim/client.ts` (inert Supabase-shaped client). Rationale: zero churn in 47
  service files that Phase 5 rewrites anyway; boot verified. Phase 5 gate = zero `@/integrations/shim` imports.
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
| auth | AuthProvider.tsx | stub |
| home | homeService, homeProfileService, inviteService | stub |
| inventory | inventoryService, manualSourcesService, storageService, ocrService, planGenerationService, productLookupService | stub |
| items / supplies | itemService, supplyService | stub |
| care | taskService, weekAgenda, taskScheduleService, homeUpkeep, careNoteService, scheduleService, shoppingListService, + pure helpers (port untouched) | stub |
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

## ⚠ Deploy-packaging TODO (Phase 4, owner deploy)
`shared/parse/*` lives at the REPO ROOT (shared by client + functions + harness per plan).
`firebase deploy` uploads only the `firebase/functions` dir, so the compiled shared files
(imported as `../../../../shared/parse/*.js`, which resolve fine for tsc + the local emulator)
will NOT be in the deployed package as-is. Before the first real `firebase deploy --only
functions`, add a bundling step — recommended: esbuild-bundle the entry (inlines shared), OR a
predeploy copy of `shared/parse` into `firebase/functions/`. The EMULATOR path (what validates
logic) is unaffected; this is strictly a cloud-deploy packaging step and is the owner's to run.

## Phase 2 → Phase 3 deferral
- **Firestore emulator seed** (`scripts/seed-emulator.ts`) is still auth-only. The model is now
  frozen, so the deterministic Firestore dataset (mirroring `e2e/seed-config.ts`) is the FIRST
  Phase 3 task — it's the precondition for the parse-slice emulator e2e and the re-enabled
  chromium/mobile Playwright projects.
