# Homehub v2 — Firebase migration + remaining redesign fixes
### Implementation plan (approved 2026-07-03; execute session-by-session; self-contained)

> Companion to `docs/homehub-v2-rebuild-plan.md` (the approved skeleton). This document adds
> implementation-grade engineering detail and folds in the redesign fixes A–E. Where the two
> disagree, this one is newer and wins; the skeleton's locked decisions (Firebase + Firestore,
> parallel rebuild, v1 frozen) are unchanged.

## Context (why)

Homehub's core value ("upload a manual → get a care plan") is broken on Supabase: edge isolates are hard-killed at **150s wall clock** (sync cap is 150s on *every* tier; Pro background = 400s), while real manual parses take **144–241s measured**. Two live kills were observed, one mid-commit → **partial commits**. This is a platform ceiling, not a code bug — hence the owner-approved **v2 Firebase rebuild** (`docs/homehub-v2-rebuild-plan.md`, approved 2026-07-02; decisions LOCKED: Firebase + **Firestore**, **parallel rebuild** in new repo `homehub-v2`, v1 untouched + parse frozen, re-parse ~19 manuals as v2 onboarding).

Owner decisions from this planning round:
- **Sharing with friends is deferred until v2 is ready** — no interim Supabase Pro, no v1 demo hardening.
- **All remaining redesign fixes land in v2 only**; v1 gets data-only repairs.
- Fix venue confirmed after owner feedback: (A) task lists feel **overwhelming with non-essential tasks**; (B) the **photo → auto-setup → manual-parse** add-item arc doesn't look/behave ready.

Status inputs:
- Phase 0 (v1 data repairs) code is **merged** (PR #194). Owner still runs 3 prod scripts locally (dedupe / breadcrumb / hygiene) — **blocker for Phase 6 import only**, not Phases 1–5.
- **PR #195** (refreshed home/tasks visual baselines) is open on v1 — **Phase 1 must copy `src/` + `e2e/` only after it merges.**
- ~~Step 0: commit this plan into the repo~~ — done; you are reading the repo copy.

Verified-in-code facts driving the redesign fixes:
- **A (calm-by-default):** tier filters default `"all"` (`RefinedWeek.tsx:372`, `DesktopTasks.tsx:199`); mobile Home renders hero + ALL overdue/due-soon uncapped (`RefinedHome.tsx:349–392`); the level system gates entry cards only, not list volume.
- **B (add-item trust arc):** `SmartAddItem.tsx` `runParseAfterManualUpload` (206–258) awaits `parseManual()` which returns `{ok:true, processing:true}` immediately, **never reads `.processing`**, fetches empty chunks/tasks, shows "done", advances to an empty review. Same bug in legacy `AddItem.tsx:122–196` (which is **unrouted** — App.tsx routes /inventory/add → SmartAddItem). `ParseProgressState` has no background state; copy says "usually takes 20–40 seconds" (`ParseProgressStep.tsx:69`) vs real 2.5–4 min. `Settings.runRescan` (488–517) loops with 5s sleeps against a 5req/60s limit.
- **C ("Start here" nudge):** desktop `/maintenance` insight banner (`computeInsight`, `tasks/shared.ts:117–145`) fails its e2e on v1 main with 2 seeded overdue essentials present; not flaky (failed run + retry); sibling test on the same page passes. Test-stale vs regression unresolved.
- **D (Apple sign-in):** client fully wired behind `VITE_APPLE_SIGNIN_ENABLED` on Supabase OAuth; owner has team-level Apple .p8 (reusable from SkinIQ, a native app); needs a NEW **web Services ID**.
- **Dead code (do NOT port):** `manual-search`, `search-manual` (zero src/ callers), legacy `AddItem.tsx`, `identify-diagram-pages`/`backfill-diagram-pages` (only caller is the backfill; backlog).
- **Portability confirmed:** `parsePrompt.ts` (238 lines) + `parseCore.ts` have **zero Deno/esm.sh imports** — port verbatim. The 2 pg_cron jobs live in migrations `20260420000001` (push daily) and `20260701000002` (roll-forward). e2e seed (`scripts/seed-test-data.ts`) is supabase-js–based → needs Admin-SDK/emulator port.

## Engineering invariants (verify at every phase gate; violations are review-blockers)

1. **ONE matcher**: `titleSimilarity`/`TITLE_MATCH_THRESHOLD` imported from `parseCore.ts` everywhere. Never reimplement.
2. **Forced tool call** extraction via `EXTRACTION_TOOL` (`parsePrompt.ts:207`) — Opus emits malformed free-text JSON ~50% without it.
3. `samplingParamsFor(model)` (`parsePrompt.ts:179`) on every extraction call — Opus 4.8+/Claude 5 reject `temperature` with HTTP 400.
4. `pickParseModel`: Sonnet 4.6 default → Opus 4.8 for gas/combustion/safety. Port verbatim from `supabase/functions/_shared/mod.ts` (~155–196).
5. **Commitable-draft guard**: never commit breadcrumb/`_error` objects; a draft is committable only with real extraction arrays.
6. **Calm reconciliation**: `planTaskReconciliation` stays pure/unchanged; flag-don't-delete; `MISS_THRESHOLD=2`; never delete completion-bearing tasks; matches re-stamp `external_key`.
7. **Eval harness gate**: prompt change → `scripts/parse-eval/run.ts` (run **unpiped**) → review diff vs goldens → then deploy. Thresholds in its README. Costs real API money.
8. `isAllowedUrl` SSRF guard on any server-side fetch of user URLs (proxy-pdf, URL manuals, import-care-url).
9. **Calm tiers** (never alarmist red): Essential clay `#C2410C` / Recommended teal `#1B6B5A` / Optional slate `#5B748F`; overdue = clay.
10. **UI reuse**: v2 recreates zero screens. `src/components/**`, `src/pages/**`, `src/hooks/**` port as-is; only the integration/service layer changes plus the surgical fixes A–C.

---

## Phase 1 — v2 scaffold + Firebase project + emulators

**Objective:** `homehub-v2` boots the full v1 UI on compile-time service stubs; Firebase project + Emulator Suite operational; CI + seeded e2e harness runs day one.

**Precondition:** PR #195 squash commit visible on v1 `main` (gate the copy on it).

1. New repo `homehub-v2` (sibling dir). Copy from post-#195 v1 `main`: `src/` **minus** `src/integrations/supabase/` and `src/pages/AddItem.tsx`; `e2e/` (fixtures, seed-config, flows, visual + `__screenshots__`, a11y) + `playwright.config.ts`; `scripts/parse-eval/` whole; `src/lib/parseCore.test.ts`; configs (vite/vitest/eslint/tsconfigs/tailwind/`index.html`/`public/`). Do NOT copy `supabase/`, `ios/`+`capacitor.config.ts` (defer native), design-canvas HTML mockups.
2. Firebase project on **Blaze with a budget alert configured the same session**. Enable Auth (email/password + email link; Apple placeholder), Firestore, Storage, Functions 2nd gen (Node 20), Cloud Tasks, Cloud Scheduler. Hosting vs keep-Vercel: decide at setup (doc default = Hosting); record in v2 `CLAUDE.md`.
3. Integration layer `src/integrations/firebase/`: `app.ts` (init + emulator hookup via `VITE_USE_EMULATORS`), `auth.ts`, `firestore.ts` (typed converters + ref helpers), `storage.ts`, `functions.ts` (httpsCallable). **`types.ts` hand-curated with the SAME exported type names** as v1's curated `src/integrations/supabase/types.ts` (`ItemUnit`, `TaskTemplate`, `TaskInstance`, `KnowledgeChunk`, `ManualDocument`, …) so components don't change; add alias `@/integrations/types` and do the mechanical 91-file import sweep now so Phase 5 diffs are semantic only.
4. Shared parse core at repo-root `shared/parse/` (`parsePrompt.ts`, `parseCore.ts`, symptom-taxonomy parity pair) — importable by functions (tsconfig path/workspace), by `src/` (vite alias), by vitest + harness. Verbatim port; carry all parseCore tests incl. taxonomy parity. **Gate: `diff` v1↔v2 copies must be empty (modulo header).**
5. Functions workspace `firebase/functions/` (TS, Node 20, 2nd gen) with one health-check callable to prove deploy.
6. Emulator Suite: `firebase.json` (auth/firestore/functions/storage/tasks); `npm run dev:emu` = emulators + Vite. **Port `scripts/seed-test-data.ts` to Admin SDK against the emulator** with the identical deterministic dataset + `e2e/seed-config.ts` dates (fix E precondition).
7. Compile-time service stubs preserving every v1 service signature (empty typed data) so the app boots and all routes render.
8. CI (GitHub Actions): vitest + lint + tsc + Playwright-on-emulator. Interim baseline bake (real bake gates Phase 5).
9. v2 `CLAUDE.md` skeleton: stack, commands, invariants list, "never test on prod — use emulators". Create **`MIGRATION_STATUS.md`** — one row per service file (stub/ported/verified); this ledger is the cross-session state for Phases 2–5.

**Gate:** app boots on emulator, all routes render on stubs; vitest green (parseCore tests in v2); health-check function deployed + responding; budget alert confirmed; CI green.

**Risks:** import-path churn (mitigate: alias + mechanical sweep now) · copying before #195 (mitigate: git-log gate) · Cloud Tasks emulator gaps (mitigate: worker core = plain exported function, directly testable — see Phase 3).

---

## Phase 2 — Firestore model + security rules (write the model doc FIRST)

**Objective:** `docs/firestore-model.md` maps all 19 tables; rules deployed + tested on emulator. This doc is the coding contract for Phases 3–6.

1. Model (doc §6 skeleton):
```
homes/{homeId}
  members/{uid}            role: owner|admin|member — the rules primitive (replaces 78 RLS policies)
  rooms/{roomId}
  items/{itemUnitId}       specs, warranty fields, photoPath, deletedAt
  manuals/{manualId}       sourceType/Ref, parse state machine (Phase 3 contract), parsedAt, deletedAt
    chunks/{chunkId}       normalizeChunkRow output shape
  taskTemplates/{tplId}    schedule rule inlined (1:1 in v1); steps, justification, sourcePage,
                           externalKey, missedScans, supplies[] (SupplyDraft), symptomTags, reCheckTriggers
  taskInstances/{instId}   dueDate, status, completedAt/By, templateRef, denormalized itemName/roomName/tier
  careNotes/… chatConversations/… shoppingList/…
supplyCatalog/{supplyItemId}
users/{uid}                preferences (incl. interface_level), FCM tokens
```
   Enumerate **every v1 join** and its v2 composition (client-side joins in the service layer; denormalize only hot display fields). Must cover, query-by-query: `getTaskDetail`, `getWeekAgenda`, `src/lib/dashboard.ts` (771 lines), `src/lib/cleanSession.ts` (527), `homeUpkeep.ts` — before Phase 5 starts.
2. `firestore.rules`: all `homes/{homeId}/**` require `exists(members/$(request.auth.uid))`; owner/admin role checks mirroring v1 RLS; assignee-must-be-member in rules (replaces the DB trigger); `users/{uid}` self-only; `supplyCatalog` read-authed/write-server. Soft-delete convention: `deletedAt` + every list query filters `deletedAt == null`. Rules do auth + shape, **never joins**.
3. Rules unit tests (`@firebase/rules-unit-testing`): membership isolation, role escalation, assignee validation.
4. SQL artifact equivalents (spec here, build in Phases 3–4): `complete_task_instance` RPC → Firestore transaction in `taskService`; pg_cron `send-push-notifications-daily` + `roll-forward-never-started` → Cloud Scheduler fns (roll-forward semantics from migration `20260701000002`: re-anchor never-completed past-due recurring instances to the next cycle from today); atomic chunk swap → one batched write (≤500 ops; chunk sets ≤60 → single batch).
5. `firestore.indexes.json` derived from the inventoried queries (taskInstances by status+dueDate; templates by itemUnitId+deletedAt; …).

**Gate:** model doc covers 19/19 tables + all read models (checklist inside the doc); rules tests green; indexes deploy clean.

---

## Phase 3 — Parse pipeline vertical slice (build FIRST) + add-item trust arc (fix B)

**Objective:** emulator end-to-end: upload PDF → enqueue → Cloud Tasks worker parses with the ported prompt/core → atomic Firestore commit → SmartAddItem streams live stages via onSnapshot and lands on a **populated** review. Kills the fire-and-forget class by construction.

### 3.1 Worker + state machine
Files: `firebase/functions/src/parse/enqueueParse.ts` (callable), `parseWorker.ts` (`onTaskDispatched`, `timeoutSeconds: 1800`, `retryConfig {maxAttempts: 2}`, queue `rateLimits {maxConcurrentDispatches: 2}`), `commitDraft.ts` (Firestore executor for `planTaskReconciliation`'s plan), `pickParseModel.ts` (verbatim).

**Frozen state-machine contract** (fields on `manuals/{manualId}`; record in the model doc):
```ts
parse: {
  stage: "queued"|"started"|"pdf_fetched"|"claude_call"|"claude_responded"|"committing"|"done"|"error",
  stageAt: Timestamp,          // every transition (staleness detection)
  requestId: string,           // per enqueue; worker claims via transaction, ignores stale deliveries
  mode: "commit"|"preview"|"fill_gaps",
  model: string, attempt: number,
  error: { message, stage, at } | null,
  summary: { chunks, tasks, confidence: ParsedConfidence } | null,   // at done
}
previewDraft | null   // NEVER commitable
draft | null          // commitable ONLY with real extraction arrays (invariant 5)
parsedAt | null
```
Worker: claim requestId → stage writes each step → Storage PDF fetch (or `isAllowedUrl`-guarded URL) → Anthropic with `buildPrompt` + `EXTRACTION_TOOL` + `samplingParamsFor(pickParseModel(item))` → `extractParsedResult` → `normalizeChunkRow/TaskRow` → `planTaskReconciliation` → `commitDraft` executes matches/inserts/flags/deletes + chunk-swap in one **idempotent batch keyed by requestId** → clear draft, set summary/parsedAt/`done`. Any throw → `error` with dying stage (breadcrumbs survive; 1800s is still finite — doc §13). Never auto-retry past `committing` without checking commit markers.

**Preview/fill-gaps**: same worker; `mode:"preview"` writes `previewDraft` from the **shared prompt's draft mode**; `mode:"fill_gaps"` passes `existingTitles`. This retires `preview-manual`'s drifted inline prompt (delivers B3: one prompt, one commit impl + flag).

**Rate limiting:** enqueue callable caps per-home in-flight parses; queue concurrency 1–2 drains a 19-manual bulk rescan serially (what makes v2 rescan safe).

### 3.2 Client trust arc (fix B)
Files: `src/modules/knowledge/services/parseManualService.ts` (rewrite), `src/pages/SmartAddItem.tsx` (206–258), `src/components/smart-add/ParseProgressStep.tsx`, `src/pages/Settings.tsx` (runRescan).

New service (keep `ParsedConfidence`/result names):
```ts
startParse(manualId, opts?) → {ok, requestId} | {ok:false, error}
watchParse(manualId, onStage) → Unsubscribe          // onSnapshot on parse.stage
parseManualAndWait(manualId, opts?, onStage?) → ParseManualResult   // start + watch to done/error
```
- `ParseProgressState` → `idle|uploading|queued|reading|extracting|saving|done|error` (map: started/pdf_fetched→reading, claude_*→extracting, committing→saving). Add "Saving results" stage row.
- **Copy fix (ParseProgressStep.tsx:69):** replace "usually takes 20–40 seconds" with honest, stage-aware copy — "This takes 2–4 minutes for a full manual — you can keep this open or come back; we'll keep working." + per-stage microcopy; show elapsed time after 60s.
- `runParseAfterManualUpload`: advance to review **only on `done`** (worker reaches done only after commit → empty-review bug impossible); `error` → existing plan-step fallback. Wizard resume on remount re-attaches `watchParse` (state lives in Firestore → survives tab refresh: the trust arc).
- `Settings.runRescan`: enqueue all → per-manual live stage chips (server queue serializes).
- Legacy `AddItem.tsx`: already excluded from the copy; verify zero imports/routes reference it.

### 3.3 Verification tooling
Harness unchanged (calls Anthropic directly). `watch-crumbs.mjs` → `watch-stages.mjs` (onSnapshot logger). `snapshot-item.mjs` → Admin SDK port. Worker integration test on emulator with a **fixture Anthropic response** (from a golden), calling the worker core directly: assert stage sequence, committed docs, reconciliation behavior (fuzzy-matched rescan title → UPDATE not delete/insert; `_error` draft → refuses commit).

**Gate:** emulator e2e with the corpus FoodCycler PDF — stages stream in UI, review shows real chunks/tasks; harness vs goldens within thresholds; worker + parseCore tests green; a deliberate mid-parse kill leaves a diagnosable, retryable state (no partial chunk swap).

---

## Phase 4 — Remaining backend + FCM

| v1 function | v2 disposition |
|---|---|
| parse-manual, preview-manual, save-parsed-manual | superseded by worker modes (Phase 3) |
| generate-tasks, ingest-reference | worker pattern, same queue (both attach PDFs) |
| chat-query | 2nd-gen HTTPS, **keep SSE streaming contract** (works today — do not regress); keep PDF citations |
| proxy-pdf | HTTPS fn, keep `isAllowedUrl` |
| detect-doc-type | callable (short PDF call); if observed >60s → worker pattern |
| troubleshoot-synthesize, classify-existing-tasks, suggest-care-notes, import-care-url, product-lookup, check-recalls, search-product-images, ocr | direct callable ports (verify ocr/search-product-images have live callers first) |
| send-push-notifications, send-test-push | Cloud Scheduler + **FCM** |
| manual-search, search-manual, identify-diagram-pages, backfill-diagram-pages | **do not port** (dead / backlog) |

- Scheduler jobs: `sendPushDaily`, `rollForwardNeverStarted` (semantics from migration `20260701000002`).
- Secrets → Functions `defineSecret` (`ANTHROPIC_API_KEY`, `BRAVE_SEARCH_API_KEY`, …). Never client env.
- Push client: `nativePush.ts`/`pushNotifications.ts` → FCM web SDK (VAPID `getToken`, `onMessage`) + `firebase-messaging-sw.js`; tokens on `users/{uid}`. **Verify iOS PWA push on the owner's real device HERE, not at switch week.**

**Gate:** per-function emulator test or smoke; chat streaming verified in UI; test push received on desktop + iOS PWA; secrets set; dead code confirmed unported.

---

## Phase 5 — Service-layer swap + fixes A, C, D (bulk of client work)

Module order (vitest green after each; one PR-sized commit per module; update `MIGRATION_STATUS.md` each):

1. **Auth (fix D).** Keep `AuthState` signatures frozen (`signIn/signOut/signUp/signInWithMagicLink/signInWithApple/resetPassword/updatePassword`). Firebase impls: email/pw (`signInWithEmailAndPassword`, `createUserWithEmailAndPassword`+`updateProfile`); magic link (`sendSignInLinkToEmail` + localStorage email stash + app-load `isSignInWithEmailLink` → `signInWithEmailLink`); reset (`sendPasswordResetEmail` → `ResetPassword.tsx` swaps the PASSWORD_RECOVERY listener for `mode=resetPassword&oobCode` → `verifyPasswordResetCode` → `confirmPasswordReset`; configure the action-handler URL); `updatePassword` handles `auth/requires-recent-login` via reauth prompt; **Apple** = `new OAuthProvider("apple.com")` + `signInWithPopup` (avoid redirect unless authDomain is same-origin — third-party-storage partitioning breaks it), keep `VITE_APPLE_SIGNIN_ENABLED` flag + stub path. **Owner Apple checklist** (adapt `design/apple-signin-scope.md`): reuse Team ID + .p8 + Key ID from SkinIQ; NEW web Services ID with Return URL `https://<v2-project>.firebaseapp.com/__/auth/handler` (or custom authDomain); Firebase console Apple provider gets Services ID + Team ID + Key ID + .p8. Gotchas: private-relay emails are the account email; name arrives only on first auth; **no 6-month secret rotation with Firebase** (it signs from the key). **Pre-login UI is pixel-frozen** — only service imports change; visual baselines enforce.
2. **home/rooms** (invites become Firestore invite docs consumed by `AcceptInvite`).
3. **items/inventory** (Storage keeps v1 path conventions; product-lookup/ocr → callables).
4. **tasks/care** (largest): `taskService` (complete = transaction), `weekAgenda`, `taskScheduleService`, `homeUpkeep`, `dashboard.ts`, `cleanSession.ts` — keep exported shapes byte-compatible; pure helpers + tests port untouched. **Fixes A + C land here.**
5. **knowledge/parse**: repoint remaining services; **delete** `previewManualService.ts`/`saveManualParseService.ts` in favor of worker modes (rewire `ParseReviewStep`).
6. **chat, supplies, settings/push/userPreferences** (`useUserLevel.fetchSignals` → Firestore counts; `interface_level` → `users/{uid}`).

### Fix A — calm-by-default surfacing (universal defaults, NOT level-keyed — level stays on entry-card gating; volume calming protects everyone, one-tap escape for power users)
1. `tasks/shared.ts`: add pure `applyTierFilter(tasks, tier: "focus"|"all"|"essential"|"recommended"|"optional", item)` where **"focus" = essential OR overdue (any tier)**.
2. `RefinedWeek.tsx:372` + `DesktopTasks.tsx:199`: default `useState("focus")`; chip rows gain a leading teal **Focus** chip; the **All** chip shows the total (`All · 14`) so nothing feels hidden; persist last choice in `sessionStorage` (`homehub:tasks-tier`) but reset to focus each new session. Empty-focus fallback: calm empty state + inline "Show N recommended/optional tasks" link (never a blank page).
3. `RefinedHome.tsx` (~349–392): `upcoming = sorted.slice(1, 1 + UPCOMING_CAP)` with `UPCOMING_CAP = 4`; quiet "`{n} more this week →`" row → `/tasks` when truncated (reuse the SectionLabel right-slot pattern at :370).
4. Focus chip teal (never clay); overdue styling unchanged.
5. Tests: unit (`applyTierFilter` incl. overdue-optional included, non-overdue recommended excluded, empty-fallback) + e2e (default chip = Focus; All shows count; one tap shows all; Home caps at 4 + more-link). **Land fix A before the Phase 5 baseline bake** (it changes pixels).

### Fix C — "Start here" nudge (diagnose in v2 on the emulator harness)
1. Run the failing spec headed against seeded emulator data; inspect what `computeInsight` receives (`DesktopTasks.tsx:238`).
2. Ranked hypotheses: (a) banner render condition/`dismissed` state around `DesktopTasks.tsx:275`; (b) fix-A interaction — verify `computeInsight(all)` on the focus-filtered list is intended (overdue essentials pass focus, so it stays correct); (c) seed→`weekAgenda` mapping drift of `priorityTier`/`isOverdue` (test-stale hypothesis); (d) spec locator/viewport.
3. Fix the real cause; add a `computeInsight` unit test pinning "2 overdue essentials → kind: start"; the spec must pass 3 consecutive emulator runs; **write the root cause (test-stale vs regression) in the PR description**.

**Phase 5 gate:** `MIGRATION_STATUS.md` all verified; `grep` gate: zero `@/integrations/supabase` imports; vitest + full e2e green on emulator seed; **v2 canonical visual baselines baked post-fix-A** (fix E complete); auth flows manually verified on emulator (email/pw, magic link, reset deep link) — Apple prod config deferred to Phase 7 checklist.

**Risks:** `dashboard.ts`/`cleanSession.ts` scope (~1300 lines of joins) — mitigated by the Phase 2 query-by-query spec + snapshot tests on fixture data · signature drift — tsc + "no component diffs outside fixes A–C" review rule.

---

## Phase 6 — Data + auth + storage import, re-parse onboarding

**Precondition:** Phase 0 owner scripts RUN on v1 prod; verify via fresh `snapshot-item.mjs` diff (FoodCycler deduped, no `_progress` breadcrumbs).

1. `scripts/import/` (Node + Admin SDK, run from v2 repo root — ESM resolves from file location): v1 export via service key → transform → import. Entities: home + members, rooms, items, **task templates + instances incl. completion history** (powers never-delete-completed + "Start anytime"), care notes, chat FAQs, warranty fields, shopping list, supply catalog. Dry-run default, `--apply`, before-snapshots. **Full rehearsal on the emulator first** (import + run e2e suite over it).
2. **Auth import:** export both users (`bcworkrelated@gmail.com` = `de59d59f…`, `barb.chang@gmail.com` = `bd2724cd…`) → `firebase auth:import --hash-algo=BCRYPT` **preserving UIDs** (keeps storage paths + member docs simple); create `members/{uid}` for **both** (fixes two-accounts-one-home by construction).
3. **Storage:** copy `Manuals` bucket (capital M; owner-uid-prefixed paths) + `photos/` preserving conventions; verify a manual renders at a cited page.
4. **Re-parse (the original goal):** import templates/instances FIRST, then re-parse reconciles against them (matched tasks update in place, history kept). Order: **FoodCycler** (snapshot audit; item `b6eebc35…`) → **Range** (Opus path + completion protection) → bulk queue the rest, `watch-stages` + snapshot audits watching. Review: no vanished completion-bearing tasks; tiers sane; source pages valid; counts within harness thresholds.

**Gate:** per-entity row-count reconciliation report; both accounts sign in on v2 prod and see the home; FoodCycler + Range audits archived in `scripts/parse-eval/results/`; bulk re-parse completes with zero unresolved `error` manuals.

---

## Phase 7 — Definition of done + switch

Doc §11 checklist PLUS the fixes — golden paths on v2 prod with real data:
- [ ] Sign-in both accounts (email/pw) · magic link · reset deep link · **Apple** (owner completes Services-ID checklist; flip `VITE_APPLE_SIGNIN_ENABLED=true`; test desktop Safari + iOS)
- [ ] Home renders; **Upcoming capped at 4 + "N more this week →"** (A)
- [ ] Tasks default **Focus** with one-tap All — mobile RefinedWeek AND DesktopTasks (A)
- [ ] **"Start here" banner renders** with overdue essentials; root cause documented (C)
- [ ] Item page incl. manual viewer at a cited page
- [ ] Task complete/snooze → next-due generation (transaction verified)
- [ ] Smart-add a NEW manual end-to-end: **live stages via onSnapshot, honest 2–4 min copy, survives tab refresh mid-parse, populated review** (B)
- [ ] Settings rescan-all drains serially with live stages
- [ ] Ask/chat streams with manual citations
- [ ] Push received on iOS device (FCM)
- [ ] Deep-clean guides
- [ ] Harness green vs goldens · vitest green · rules tests green · e2e + v2 visual baselines green in CI (E)
- [ ] Re-parse audits reviewed
- [ ] Dead code absent (list below)

Switch: domain/bookmarks cutover (per Phase 1 hosting decision); v1 = read-only archive; finalize v2 `CLAUDE.md` + project memory (pivot note in v1 memory); file post-switch backlog: tier-inflation prompt tuning (harness-watched), diagram-pages port, native iOS wrapper + native Apple sign-in, multi-property/provider-handoff explorations.

## Do-NOT-port list (consolidated)
`src/pages/AddItem.tsx` (unrouted legacy, carries the bug) · `manual-search`/`search-manual` (no callers) · `preview-manual`/`save-parsed-manual` + `previewManualService.ts`/`saveManualParseService.ts` (superseded by worker modes) · `identify-diagram-pages`/`backfill-diagram-pages` (backlog) · v1 polling parse client (AbortSignal/raw-fetch machinery) · web-push/APNs plumbing (FCM replaces) · `ios/`+`capacitor.config.ts` (post-switch).

## Session-boundary handoffs
| After | State left |
|---|---|
| 1 | Booting stubbed repo; `MIGRATION_STATUS.md`; emulator + seed + CI |
| 2 | `docs/firestore-model.md` (incl. frozen parse contract) + tested rules |
| 3 | Parse slice works on emulator; trust arc done; audit tooling ported |
| 4 | Functions inventory green; FCM verified on device |
| 5 | Full app on emulator; A/C/D landed; baselines baked; zero supabase imports |
| 6 | v2 prod populated + re-parsed; audits archived |
| 7 | Switched; docs/memory updated; backlog filed |

## Verification (how the whole plan is tested)
- **Per-phase gates** above are blocking; `MIGRATION_STATUS.md` is the ledger.
- **Parse quality:** eval harness vs goldens on any prompt-adjacent change; snapshot audits on every re-parse.
- **Behavior:** vitest (parseCore 25+, new applyTierFilter + computeInsight tests, service snapshot tests), rules-unit-tests, worker integration test with fixture Anthropic response.
- **UX:** Playwright on emulator seed (flows + a11y + visual baselines re-baked after fix A); manual golden-path pass per Phase 7 checklist on prod data.
- **Ops:** budget alert day one; `watch-stages.mjs` during bulk re-parse; deliberate mid-parse kill test in Phase 3.

## Immediate next actions (order)
1. ~~Merge PR #195~~ — done (`06a8047` on main); the Phase 1 copy is unblocked.
2. ~~Commit this plan to the repo~~ — done (this file).
3. Owner runs the 3 Phase 0 prod scripts when convenient (needed before Phase 6, not before Phase 1). Commands are in PR #194's description.
4. Begin Phase 1 — on the owner's machine (new repo + Firebase console access required).
