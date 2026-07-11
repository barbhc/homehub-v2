# Migration status ledger

Cross-session state for the v2 rebuild (`docs/homehub-v2-implementation-plan.md`).
Update the relevant rows in the SAME commit as the work. Statuses: `stub` → `ported` → `verified`.

## Phase gates

| Phase | Status | Notes |
|---|---|---|
| 0 — v1 data repairs | code merged (v1 #194) | owner still runs dedupe/breadcrumb/hygiene on prod (blocks Phase 6 only) |
| 1 — scaffold + Firebase + emulators | **code complete; owner console steps pending** | see "Phase 1 remainder" below |
| 2 — Firestore model + rules | not started | model doc FIRST |
| 3 — parse worker + trust arc | not started | |
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
| knowledge | parseManualService (Phase 3 rewrite), manualDocumentService, knowledgeService, chatService, conversationService, detectDocTypeService, diagramRenderService; previewManualService + saveManualParseService = DELETE (worker modes) | stub |
| lib | dashboard.ts, cleanSession.ts, userPreferences.ts, nativePush.ts/pushNotifications.ts (Phase 4 FCM) | stub |

## Verified this phase
- `npm run build` green (tsc -b + vite build) — first compile after sweeps.
- vitest 104/104 (13 files) incl. `shared/parse` parseCore suite; verbatim diff-gate vs v1 passed.
- Boot: `/`, `/signin`, `/home`-gate render with ZERO page errors on the inert shim (no env).
- Smoke e2e 3/3 (sandbox browser override; CI uses its own installed browsers).
