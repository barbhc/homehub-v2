# Homehub v2 — Production Completion Plan (2026-07-14)

Supersedes the prior checkpoint plan (its Increments 1–9 are all complete; history in MIGRATION_STATUS.md + git). This plan: (1) the full status assessment requested by the owner, (2) root causes of the launch-day incidents, (3) the waves to reach FULL production — verified app, Apple Sign-In, custom domain cutover, v1 retirement.

**Owner decisions (locked):** anonymous sign-in stays ON temporarily → harden server-side, disable before public launch · delete stray + test homes, keep "My House" · full scope incl. cutover · re-parse manuals AFTER verification.

---

## 1. Status assessment (what's true right now)

### Done & verified
- **Code migration 100%**: every service on Firebase; Supabase shim deleted; all 12 v1 edge functions ported (fixture-tested); parse-legacy retired; FCM client code in place. Redesign fixes A–D landed; fix E desktop baselines re-baked + green (mobile pending).
- **Backend deployed**: 22 functions live (us-central1), rules + composite indexes + storage rules deployed, secrets set (ANTHROPIC / GOOGLE_VISION / BRAVE), Cloud Tasks queue + 2 cron jobs provisioned.
- **Hosting live** at homehub-2068d.web.app with real Firebase config (auth round-trips prove it).
- **Data imported & reconciled**: 7 auth users (uids preserved), 1,498 Firestore docs (all counts match source), 117 storage objects (paths preserved) in bucket `homehub-2068d.firebasestorage.app`.
- **Auth working**: Email/Password provider enabled; owner password set; sign-in succeeds.
- Suites green pre-delivery: vitest 127 · functions 60 · rules · emu e2e 18 · desktop visual 10.

### Broken in prod — root-caused (investigation reports, file:line verified)
1. **Sign-in lands on onboarding instead of "SF Condo" (25 items).** `myMemberships()` runs `collectionGroup("members").where("uid","==",uid)` (src/modules/home/services/homeService.ts:117) which requires a COLLECTION_GROUP single-field index on `members.uid` — **missing** (firestore.indexes.json:126 `fieldOverrides: []`). The Firestore **emulator doesn't enforce indexes**, so every e2e passed while prod throws FAILED_PRECONDITION. HomeProvider swallows the error at `console.debug` (HomeProvider.tsx:37) and sets home=null → indistinguishable from "no home" → onboarding. Also breaks `getHomes` (Settings) and `useUserLevel.ts:45`.
2. **Blank page after creating a home.** OnboardingProfile.tsx:21-24 calls `navigate("/")` during render + `return null` when home is null (the react-router warning observed). Upstream: same broken query keeps home null forever.
3. **Duplicate-home trap.** HomeOnboarding's "already have a home?" guard uses the same broken query → owner minted a stray empty "SF Condo". `createHome` stamps `isPrimary:true`; **imported memberships have no isPrimary** (v1 had no such column) → after the index fix, the stray would WIN `getPrimaryHome`'s pick (homeService.ts:147). Cleanup is mandatory, not cosmetic.
4. **"Verifying your link…" dead-end** (seen on iPhone). ResetPassword.tsx: with no/invalid oobCode, `ready` stays false forever and the error is never rendered (:45, :86-100). Compounded by: Firebase uses ONE action-handler URL for all email actions, so pointing the reset template at /reset-password sends magic **sign-in** links there too; and AuthProvider.tsx:65 strips query params on email-link completion, leaving the page paramless.
5. **Latent index gaps** (will fail the same way when exercised): `invites.token` (client getInviteByToken + acceptInvite callable — Admin SDK needs indexes too), `manuals.role` (40-reparse script).

### Security posture (anonymous provider currently ON)
- **7 anonymously-drainable functions** (auth-only gates, no membership): generateTasks, ocr, suggestCareNotes, importCareUrl (Anthropic Sonnet), productLookup (Haiku; per-uid quota defeated by minting fresh anon uids), searchProductImages (Brave), proxyPdf (open fetch proxy, no response-size cap).
- **storage.rules**: catch-all `read: true; write: any-authed` → anonymous can overwrite ANY object; 50 MB cap is client-side only.
- **users collection enumerable** by any token (`allow read: if isSignedIn()` = get+list) → all names/avatars leak (emails do NOT — they live in Auth, not Firestore). App does zero users-collection lists → safe to close.
- Membership-gated + safe: enqueueParse, commitManualDraft, completeTask, removeMember, detectDocType, chatQuery, ingestReference, classifyExistingTasks, checkRecalls.

### Unverified / not yet done
- **Push wholly non-functional**: VITE_FIREBASE_VAPID_KEY unset (push UI gracefully hidden) AND public/firebase-messaging-sw.js still ships demo-homehub placeholder config.
- **Storage bucket in the deployed bundle unverified**: real bucket is `homehub-2068d.firebasestorage.app` (`.appspot.com` proven nonexistent during import); repo docs reference wrong names (docs/DEPLOY.md:47, scripts/import/lib/env.ts:16). If `.env` had the wrong value at build time, ALL media 404s. Must check with the next hosting deploy.
- Budget alert unconfirmed · reset-email action URL unset (console save failed once — retry after our flow fix) · re-parse not run (functions redeploy REQUIRED first: deployed worker predates parseCore nested-array fix 73903fa) · live verification of AI features/chat SSE/recalls not done · mobile visual baselines + CI visual job pending · Apple Sign-In, custom domain, v1 retirement pending.
- Housekeeping: MIGRATION_STATUS.md:55 stale "inert-shim" note (dashboard loaders verified fully ported) · Node 20 runtime decommissions 2026-10-30 · firebase-functions ^6.3.0 upgrade warning · dead deps @supabase/supabase-js + @capacitor/*.

---

## 2. Implementation waves

Delivery model unchanged: I code + verify on the emulator suites, deliver a git bundle; the owner pulls/pushes and runs deploys + console steps with step-by-step guidance (runbook artifact gets updated to match). **Two ordering rules that must not be violated:** (a) data cleanup runs BEFORE the owner uses the app post-fix (else the stray isPrimary home hijacks sign-in); (b) the index deploy must be confirmed built (prod-smoke) BEFORE the functions deploy (the new `requireAnyMembership` uses the same index — deploying functions early would brick 7 callables during the build window).

### Wave 1 — Unblock sign-in + hardening (one bundle, one owner session)

**Code (all in this bundle):**
1. **`firestore.indexes.json`** — populate `fieldOverrides` with three single-field overrides: `members.uid`, `invites.token`, `manuals.role`. Each MUST re-list the automatic COLLECTION-scope entries (ASC, DESC, CONTAINS) plus `COLLECTION_GROUP` ASC — an override *replaces* automatic indexing for that field. (Audited: no existing query relies on defaults being different.) Fixes: getPrimaryHome/getHomes/useUserLevel (members.uid), latently-broken acceptInvite + future getInviteDetails (invites.token — Admin SDK needs indexes too), 40-reparse (manuals.role).
2. **`src/modules/home/components/HomeProvider.tsx`** — `HomeState` gains `error: string | null`; set from `result.error`/catch, cleared on success; escalate to `console.error`. `useCurrentPropertyCompat` untouched.
3. **`src/pages/Index.tsx:43-54`** — before the `!home` branch: if `error`, render an error card ("We couldn't load your home…") with a Try-again button calling `refresh`. **Never render HomeOnboarding when error is set** (that's the stray-home minting path). HomeGate needs no change.
4. **`src/modules/home/components/HomeOnboarding.tsx:27-36`** — if the "already have a home?" pre-check returns an error: show error + return, do NOT fall through to `createHome` (second independent duplicate-home guard).
5. **`src/pages/OnboardingProfile.tsx:21-24`** — move the redirect into `useEffect`; render the loading placeholder instead of `return null` (kills the render-phase navigate + blank page).
6. **`src/pages/ResetPassword.tsx`** — replace `ready: boolean` with a phase machine: `verifying | form | done | signin-handoff | link-error`. `mode=signIn` → "Finishing sign-in…" spinner, watch `useAuth().user` → redirect `/` (10s timeout → link-error). No oobCode → immediate link-error card with "Request a new link" CTA. `verifyPasswordResetCode` reject → link-error (error currently never renders — the perpetual-spinner bug). No AuthProvider change needed in Wave 1 (its `history.replaceState` doesn't affect router search params).
7. **`firebase/functions/src/lib/membership.ts` (new)** — `hasAnyMembership(db, uid)` = `collectionGroup("members").where("uid","==",uid).limit(1)` + `requireAnyMembership` throwing `permission-denied`. Insert one line after the auth check in the 7 auth-only functions: generateTasks.ts:242, ocr.ts:108, careSuggestions.ts:86 + :123, productLookup.ts:221, searchProductImages.ts:15, proxyPdf.ts (boolean form → 403; onRequest can't throw HttpsError). Chosen over threading homeId (would touch ~7 client services for marginal gain); per-home checks remain the pattern where homeId already exists. Safe for new users: all 7 surfaces are only reachable after home creation.
8. **`proxyPdf.ts:49-58`** — response size cap (50 MB): reject on Content-Length, stream-read with running total → 413 (replaces unbounded `arrayBuffer()`).
9. **`firestore.rules:44`** — users: `allow get: if isSignedIn(); allow list: if false;` (zero app list-reads verified).
10. **`storage.rules`** — DELETE the catch-all (overlapping matches OR together — supplementing is void) and replace with per-prefix blocks: `{userId}/{itemId}/{file}` manuals (uid-scoped create/update <50MB + uid-scoped delete — delete must be a separate clause; `request.resource` is null on deletes), `photos/{userId}/{itemId}/{file}` (uid-scoped, <50MB), `receipts/{itemUnitId}/{file}` + `images/{manualId}/{file}` (any-auth, capped — no uid in path, v1 parity), 2-segment legacy read-only block. All reads stay public (storageDownloadUrl builds public URLs). Companion: `storageService.ts` — when `userId` is falsy return an error instead of writing an unscoped path the new rules deny (signatures unchanged; all call sites already pass user ids).
11. **`scripts/ops/cleanup-homes.ts` (new)** — dry-run default, `CONFIRM=CLEANUP` gate; scans homes (plain collection read — works pre-index); matches a hardcoded (name, itemCount) manifest: DELETE stray SF Condo/0, Mission Condo/1, E2E Test Home/6, Test Home/0; KEEP SF Condo/25 + My House/3; **abort on any mismatch** (drift guard); `getFirestore().recursiveDelete()` (firebase-admin ^13 has it); stamp `isPrimary:true` on the kept SF Condo membership for OWNER_EMAIL (default bcworkrelated@gmail.com), false elsewhere; print orphaned Storage paths (recursiveDelete is Firestore-only).
12. **`scripts/ops/prod-smoke.ts` (new)** — read-only Admin canary: members.uid CG query (retry loop while index builds), home list + item counts + isPrimary flags, replicate getPrimaryHome's pick and print the chosen home, probe invites.token + manuals.role, flag storage paths outside the four rule shapes. Exit non-zero on failure. This is the compensating control for "emulator doesn't enforce indexes."
13. **`scripts/import/20-firestore.ts`** — member import sets `isPrimary: role === "owner"`; comment that re-running resurrects deleted homes (only 40-reparse is re-runnable).
14. **Docs**: DEPLOY.md bucket example → `homehub-2068d.firebasestorage.app`; env.ts comment likewise; MIGRATION_STATUS.md:55 stale inert-shim note removed; one-line "emulator doesn't enforce indexes" comments at homeService.ts:117 + useUserLevel.ts:45.

**Owner runbook (Wave 1, in order):**
```
grep firebasestorage.app .env                     # bucket preflight — MUST match, else fix .env
git pull <bundle> main && git push origin main
npx tsx scripts/ops/cleanup-homes.ts              # dry run — review
CONFIRM=CLEANUP npx tsx scripts/ops/cleanup-homes.ts
firebase deploy --only firestore:indexes
npx tsx scripts/ops/prod-smoke.ts                 # retries until members.uid index is Enabled
npm run build
firebase deploy --only firestore:rules,storage,functions,hosting
npx tsx scripts/ops/prod-smoke.ts                 # full green expected
```
Then UI checks: sign in → lands on SF Condo (25 items, no onboarding, no blank); deep-link refresh works; upload manual/photo/receipt; open a PDF; one AI action (product lookup) succeeds; `/reset-password` with no params shows the error card, not a spinner.

### Wave 2 — Console config + live verification (no code; one hosting redeploy)
- VAPID key (console → Cloud Messaging → Web Push certificates) → `.env` `VITE_FIREBASE_VAPID_KEY`; fill real config into `public/firebase-messaging-sw.js`; `npm run build && firebase deploy --only hosting`; push test on desktop Chrome + iOS installed PWA.
- Reset-email action URL retry (incognito) → `https://homehub-2068d.web.app/reset-password` — safe now that mode=signIn is handled; **if the console save fails again, skip it** (default hosted handler works fine; ours is branding).
- Budget alert (GCP Billing → Budgets) — confirm or create.
- Full functional walkthrough on prod data (DoD §5): Home/Focus + Start-here, Inventory + PDF render + receipt link, Smart Add (OCR + lookup + parse→review→save), Ask SSE + web-search toggle, complete task → next occurrence, Warranties/Providers/Settings, recalls, care-note URL import/suggest, reset-email + magic-link end-to-end. Several green days here gate v1 retirement.

### Wave 3 — Re-parse (after Wave 2 green)
Functions already redeployed in Wave 1 (carries the parseCore nested-array fix); manuals.role index live. Dry-run `40-reparse.ts`, review count (~26 primary manuals), then `CONFIRM=IMPORT`. Spot-check 2–3 manuals for new-format chunks/tasks (symptom tags, steps); failures retry via Settings → Rescan all. **Never re-run 20-firestore.ts** (resurrects deleted homes).

### Wave 4 — Public launch (order matters inside the wave)
1. **Custom domain cutover**: Hosting custom domain + DNS; Auth authorized domains; update `.env` `VITE_FIREBASE_AUTH_DOMAIN` if adopting the custom domain for auth; re-save action URL; rebuild+redeploy hosting.
2. **Apple Sign-In** (after domain is final — Services ID return URLs): Apple Services ID (reuse Team ID + .p8), Firebase Auth Apple provider, `VITE_APPLE_SIGNIN_ENABLED=true`, hosting redeploy; test desktop Safari + iOS PWA.
3. **Invite flow enablement** (code, small bundle): new `getInviteDetails` callable (auth + invites.token CG lookup, sanitized response — reuses runAcceptInvite's query shape); swap client `getInviteByToken` to the callable (AcceptInvite page untouched). Do NOT add an invites CG read rule (token-harvesting risk). acceptInvite works once the Wave 1 index is live.
4. **AuthProvider `window.prompt` fallback** → `/signin?completeLink=1` confirm-email form (small code change, same bundle as 3).
5. **Mobile visual baselines** re-bake on the Mac (`npm run test:e2e:visual:update`) → commit → wire the visual job into `.github/workflows/ci.yml`.
6. **Disable anonymous sign-in** (console) — the step that actually closes the anon quota-defeat hole (requireAnyMembership only raises the bar: an anon CAN still self-create a home; accepted temporarily per owner decision).
7. **v1 Supabase retirement** after several green days + final spot-check (pause first, delete later); prune dead deps (@supabase/supabase-js, @capacitor/*).
8. **Post-launch, before 2026-10-30**: functions runtime → nodejs22 + firebase-functions major bump (one redeploy).

---

## 3. Tests added (Wave 1 bundle)

- **Vitest**: HomeProvider error-path (error exposed, cleared on success); HomeOnboarding pre-check-error → createHome NOT called (anti-stray regression); ResetPassword phases (no-oobCode → error card; verify-reject → error card, never stuck; mode=signIn → handoff; happy path); OnboardingProfile null-home → effect redirect, no render-warning; storageService missing-userId → error, no upload. Plus `src/test/indexCoverage.test.ts` — static guard: every `collectionGroup(` field in the repo must have a fieldOverride/composite in firestore.indexes.json (the only automatable defense against this incident class).
- **Rules tests**: users get-allowed/list-denied matrix; new `storage.rules` test file via @firebase/rules-unit-testing v5 (own-path manual write allowed, other-uid denied, unauth denied, receipts/images any-auth allowed, unmatched-path denied, delete matrix); `test:rules:emu` → `--only firestore,storage`.
- **Functions emu tests**: `membership.emu.test.mjs` — hasAnyMembership false/true, requireAnyMembership throws permission-denied. Call-site insertions verified by typecheck + review.
- Documented gap (comments in membership.ts + homeService.ts): no emulator suite can catch a missing prod index; prod-smoke.ts is the compensating control.

## 4. Key risks / gotchas (from the design review)
- fieldOverride REPLACES automatic single-field indexes — the COLLECTION-scope re-listing in §2.1 is mandatory, not decorative.
- Index builds are async post-deploy; the runbook's prod-smoke gate between the index deploy and the functions deploy is what prevents bricking the hardened callables.
- Storage rules: deletes need their own clause (`request.resource` is null on delete — a size condition on combined `write` would break removeManualPdf). Benign overlaps analyzed (receipts/images 3-segment paths also match the manuals pattern but their own blocks grant).
- An anonymous user can still self-create a home then pass requireAnyMembership — fully closed only by Wave 4's provider disable (owner-accepted temporary risk).
- Re-running the Firestore import resurrects deleted test homes.

## 5. Who does what
- **Me (sandbox)**: all code/tests/docs, verified on emulator suites (vitest ≥127, functions ≥60, rules incl. new storage tests, emu e2e 18, desktop visual 10), delivered per wave as git bundles; runbook artifact updated per wave.
- **Owner (Mac + browser, guided)**: bundle pull/push; the Wave 1 runbook above; console steps (VAPID, SW config values, action URL, budget alert, Apple, domain, anon disable, v1 pause); device push tests; mobile baseline re-bake; live UI walkthroughs.

## 6. Success criteria
Wave 1: owner signs in → SF Condo with 25 items; prod-smoke fully green; no way to reach onboarding while a load error exists. Wave 2: every DoD §5 surface verified on prod data; push arrives on both devices. Wave 3: manuals re-parsed to v2 format. Wave 4: custom domain + Apple live; invites work for a second real user; anon disabled; CI runs visual suite; v1 paused. Then Homehub v2 is fully production-complete — Firebase backend + full redesign, end to end.
