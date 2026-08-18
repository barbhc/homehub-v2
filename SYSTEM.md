# SYSTEM.md — homehub-v2

> Generated 2026-08-18 by Claude **from the code**. **Do not hand-edit** — regenerate at the end of any feature that touches these areas (global CLAUDE.md → SYSTEM.md tracker). Hand-edits rot; generated files don't.

Committed state as of `bc0d264`, on branch `fix/tenant-isolation-member-escalation` (base `0100d35` = `main`). This is the **live** app: Firebase project `homehub-2068d`, serving at <https://homehub-2068d.web.app>.

**Concurrent work not reflected here:** PR #91 (`feat/durable-spend-caps`) is in flight against `firebase/functions/src/lib/quota.ts` and its call sites. The quota section below describes the **committed** implementation, not #91's changes. A separate session also has manual-search work uncommitted in the main checkout.

Every claim below was read at source; file:line references are the evidence. Where something is asserted without a citation it is marked as unverified.

## Stack

| Layer | Choice |
|---|---|
| Framework | React 19.2 + React Router 7.13, SPA |
| Build | Vite 7.3, TypeScript 5.9 (`npm run build` = `tsc -b && vite build`) |
| Styling | Tailwind CSS 4.1, Radix UI 1.4, `class-variance-authority`, `lucide-react` |
| Data fetching | SWR 2.4 + per-domain hooks/services under `src/modules/*/services` |
| Backend | Firebase Cloud Functions **2nd gen, Node 20**, region `us-central1` (`firebase/functions/`) |
| AI | `@anthropic-ai/sdk` 0.78. Models in use: `claude-sonnet-4-6` (9 sites), `claude-haiku-4-5-20251001` (3), `claude-opus-4-8` (2), `claude-3-5-haiku-20241022` (2) |
| PDF | `pdfjs-dist` 4.10 (client render), Claude document blocks (server parse) |
| Native shell | Capacitor 8.4 iOS — push-notifications, camera, apple-sign-in, app |
| Monitoring | Sentry (`@sentry/react` 10.48, `src/main.tsx:45`), PostHog (`posthog-js`, `src/lib/analytics.ts:27`) |
| Tests | Vitest 4.1 (69 unit files), Playwright 1.59 (28 e2e specs), `@firebase/rules-unit-testing` 5.0 |
| Lint | ESLint 9.39 — note `npm run lint:new` only covers `src/integrations`, `shared`, `e2e/smoke`, `scripts/seed-emulator.ts`, `firebase/functions/src` |

**Dead dependency:** `@supabase/supabase-js` 2.95 is still in `dependencies` despite the v1 Supabase backend being deleted. Flagged in `docs/launch-readiness.md` P1; still present.

## Services & keys

| Service | Used for | Key / credential | Where it lives |
|---|---|---|---|
| Anthropic API | All AI functions (parse, chat, tasks, care notes, doc typing, classification) | `ANTHROPIC_API_KEY` | `defineSecret` → Google Secret Manager, server-only. Declared per-function in `secrets: [...]`. Never in the client. |
| Brave Search | Product lookup, manual finding, product images, chat web search | `BRAVE_SEARCH_API_KEY` | `defineSecret` → Secret Manager (`productLookup.ts`, `findManual.ts`, `searchProductImages.ts`, `chatQuery.ts`) |
| Google Cloud Vision | OCR of label photos | `GOOGLE_VISION_API_KEY` | `defineSecret` → Secret Manager (`ai/ocr.ts`) |
| Apple APNs | iOS push | `APNS_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID` | `defineSecret` → Secret Manager (`push/sendPush.ts`) |
| Firebase Auth | email/password, email-link (magic link), Apple sign-in | `VITE_FIREBASE_*` | **Public by design** — bundled into the client |
| Firebase Firestore | All app data | same client config | public-by-design; protected by `firestore.rules` |
| Firebase Storage | Manuals, item photos, receipts, diagram renders | same client config | public-by-design; protected by `storage.rules` |
| Firebase Cloud Messaging | Web push | `VITE_FIREBASE_VAPID_KEY` | public-by-design; also duplicated into `public/firebase-messaging-sw.js` (not Vite-processed) |
| Sentry | Error monitoring | `VITE_SENTRY_DSN` | public-by-design (DSNs are write-only ingest keys) |
| PostHog | Product analytics | `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST` | public-by-design (client-side project key) |
| CPSC saferproducts.gov | Recall lookups | none | `products/checkRecalls.ts:39` — fixed host, encoded query param |

**Secret-exposure check (verified, not assumed):** every paid key is introduced via `defineSecret` inside `firebase/functions/src/**` and injected per-function; no `ANTHROPIC_API_KEY` / `BRAVE_SEARCH_API_KEY` / `GOOGLE_VISION_API_KEY` reference exists anywhere under `src/`. The only `import.meta.env.*` vars the client reads are the six Firebase ones plus `VITE_FIREBASE_VAPID_KEY`, `VITE_APPLE_SIGNIN_ENABLED`, `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`, `VITE_SENTRY_DSN`, `VITE_USE_EMULATORS` — none secret.

## Auth logic

`AuthProvider` (`src/modules/auth/components/AuthProvider.tsx`) wraps Firebase Auth: email/password (`:150`), email-link/magic-link (`:178`, consumed at `:84`), and Apple sign-in. `AuthGate` protects routes; there is no dev bypass.

Two server-side gates, used consistently:

- **Per-home membership** — `db.doc('homes/{homeId}/members/{uid}').get()`, for every function that receives a `homeId`. Verified present in all 8: `detectDocType:80`, `enqueueParse:45`, `commitManualDraft:36`, `completeTask:155`, `discussTask:190`, `ingestReference:79`, `checkRecalls:74`, `classifyExistingTasks:341`.
- **Any-home membership** — `requireAnyMembership` / `hasAnyMembership` (`lib/membership.ts:17-27`), a `collectionGroup("members")` lookup for functions that take no `homeId`. Exists specifically to stop anonymous/throwaway uids burning paid APIs.

**These gates were only as strong as the rule that decides who becomes a member.** Until `57bb9aa` (2026-08-18) any signed-in user who knew a `homeId` could write their own member doc into that home at any role — which made every per-home check above return true for them. That is why the member-create rule was the keystone fix, not one item among four.

## Endpoints (the doors)

25 deployed functions, all region `us-central1`. Every `onCall` begins with `if (!request.auth?.uid) throw new HttpsError("unauthenticated", …)` before any work — verified individually.

| Function | Kind | Auth | Membership | Quota | Spends money |
|---|---|---|---|---|---|
| `enqueueParse` | onCall | `:23` | per-home `:45` | `:54` | indirect (queues worker) |
| `parseWorker` | onTaskDispatched | internal (Cloud Tasks) | n/a | n/a | **yes** — Claude |
| `commitManualDraft` | onCall | `:22` | per-home `:36` | — | no |
| `rollForwardNeverStarted` | onSchedule (30 5 * * *) | internal | n/a | n/a | no |
| `graduateFeedback` | onSchedule | internal | n/a | n/a | unverified |
| `sendTestPush` | onCall | `:92` | — | — | no |
| `sendPushDaily` | onSchedule (0 15 * * *) | internal | n/a | n/a | no |
| `completeTask` | onCall | `:150` | per-home `:155` | — | no |
| `acceptInvite` | onCall | `:131` | n/a — **by design** | — | no |
| `removeMember` | onCall | `:155` | caller-is-owner-or-self `:112` | — | no |
| `getInviteDetails` | onCall | `:143` | n/a — token-keyed, sanitized | — | no |
| `generateTasks` | onCall | `:245` | any-home `:246` | `:247` | **yes** |
| `detectDocType` | onCall | `:73` | per-home `:80` | `:88` | **yes** |
| `ocr` | onCall | `:164` | any-home `:165` | `:174` | **yes** |
| `productLookup` | onCall | `:330` | any-home `:334` | `:357`,`:370` | **yes** |
| `chatQuery` | **onRequest** | `verifyIdToken` `:108` | per-home `:124` | `:130` → 429 | **yes** |
| `suggestCareNotes` | onCall | `:89` | any-home `:90` | `:95` | **yes** |
| `importCareUrl` | onCall | `:128` | any-home `:129` | `:134` | **yes** |
| `ingestReference` | onCall | `:74` | per-home `:79` | `:85` | **yes** |
| `classifyExistingTasks` | onCall | `:331` | per-home `:341` | `:373` | **yes** |
| `discussTask` | onCall | `:184` | per-home `:190` | `:192` | **yes** |
| `searchProductImages` | onCall | `:18` | any-home `:19` | `:25` | **yes** |
| `findManual` | onCall | `:132` | any-home `:135` | `:165` | **yes** |
| `checkRecalls` | onCall | `:69` | per-home `:74` | — | no (fixed public API) |
| `proxyPdf` | **onRequest** | `verifyIdToken` `:39` | any-home `:45` → 403 | — | no (bandwidth only) |

**The two `onRequest` doors** verify the Firebase ID token themselves (there is no `onCall` wrapper to do it) and both set `Access-Control-Allow-Origin: "*"` (`chatQuery.ts:47`, `proxyPdf.ts:20`). A wildcard ACAO is not itself an authorization hole — the bearer-token check is the gate, and CORS is a browser-only control — but it means any origin can invoke them from a browser with a stolen token. See Gap #3.

`healthCheck` was removed in `bc0d264` (unauthenticated, returned a fixed object, superseded by `firebase functions:list`).

## Data model & rules

All app data is path-tenanted under `homes/{homeId}/…`; membership at `homes/{homeId}/members/{uid}` is the rules primitive. Per `firestore.rules:5-10`, roles gate **member management only** — any member has full CRUD on the home's data, matching v1's effective model.

| Path | Read | Write | Notes |
|---|---|---|---|
| `homes/{homeId}` | member | create: signed-in **and `createdBy == uid`**; update: member **and `createdBy` unchanged**; delete: **owner only** | `createdBy` is the ownership anchor (`:57-72`) |
| `homes/{homeId}/members/{uid}` | member | create: self **only as `owner` of a home you created**, else owner; update: owner, or self without role change; delete: self or owner | The Finding-1 fix (`:78-104`) |
| `homes/{homeId}/invites/{id}` | member | member | Acceptance is **not** a client write — `acceptInvite` (Admin SDK) |
| `homes/{homeId}/taskInstances`, `taskTemplates` | member | member + assignee-must-be-member guard | `assigneeIsMember()` |
| `taskFeedback`, `parseFeedback` | member read/create | **update/delete denied** | append-only ledgers |
| `rooms`, `items`, `careNotes`, `chatFaqs`, `shoppingList`, `tierChangeLog`, `serviceProviders`, `houseRules`, `manuals/**`, `cleaningSessions/**`, `chatConversations/**`, `troubleshootingCases/**` | member | member | flat member-CRUD |
| `users/{uid}` | `get` any signed-in; **`list` denied** | self only | `list` closed against name/avatar enumeration |
| `users/{uid}/private/**` | self | self | prefs, FCM tokens |
| `supplyCatalog/**` | any signed-in | **denied** (Admin SDK) | global catalog |
| `webRetrievals`, `productLookupCache`, `parseEvalCandidates` | **denied** | **denied** | server-only caches |
| `usage/{uid}/daily/{day}` | **denied** | **denied** | quota counters — user cannot read or reset their own |
| collectionGroup `members` | signed-in **where `uid == auth.uid`** | — | serves "find all my memberships" |

**Storage** (`storage.rules`): new uploads are keyed `homes/{homeId}/…` and reads require a member doc in that home via cross-service `firestore.exists()`. Writes stay path+uid scoped. Legacy objects (pre-2026-08-18) keep old paths and remain readable by any signed-in non-anonymous user — see Gap #1.

**Indexes:** `firestore.indexes.json` carries the composite indexes plus the `members.uid` COLLECTION_GROUP fieldOverride that `hasAnyMembership` and `getMyHomes` depend on. The **emulator does not enforce indexes**, so a missing one fails only in production (`lib/membership.ts:9-11`); `scripts/ops/prod-smoke.ts` is the compensating check.

## Quotas & spend caps

`consumeDailyAiQuota` (`lib/quota.ts`) — one counter doc per user per UTC day at `usage/{uid}/daily/{yyyy-mm-dd}`, read-and-incremented **transactionally**, default `DAILY_AI_LIMIT = 50`, per-function tallies in `fns`, `expiresAt` set 2 days out for TTL cleanup. Charged **after** auth/membership/validation and **before** the paid work, so rejected requests don't burn quota. Applied to all 13 money-spending callables plus `chatQuery` (surfaced as HTTP 429). `findManual` and `productLookup` pass their own tighter limits.

Not covered: `parseWorker` (runs off the Cloud Tasks queue — quota is charged upstream at `enqueueParse`), and there is **no org-level Firebase budget cap** in the repo. A Blaze budget alert on `homehub-2068d` is still an open P0 in `docs/launch-readiness.md`.

## Deploy

| Target | How | Gating |
|---|---|---|
| Hosting | `firebase deploy --only hosting` (serves `dist/`, SPA rewrite to `/index.html`) | **manual** |
| Functions | `firebase deploy --only functions` (predeploy runs `npm run bundle` = typecheck + esbuild) | **manual** |
| Firestore rules + indexes | `firebase deploy --only firestore:rules,firestore:indexes` | **manual** |
| Storage rules | `firebase deploy --only storage` | **manual** |

**There is no deploy job in CI** (`.github/workflows/ci.yml` has three jobs — `checks`, `functions`, `emulator` — and none deploys). Nothing enforces that the deployed rules match the repo. That gap is not theoretical: `firestore.rules` was last modified 2026-07-31 while the sharing feature it needed to account for shipped 2026-08-18. **After merging, run `firebase deploy --only firestore:rules,storage` and confirm the live rules match the repo.**

Caching: `Cache-Control: no-cache` on `**` (so the iOS WKWebView picks up a deploy on next launch) and `max-age=31536000, immutable` on `/assets/**` (content-addressed).

## Tests & CI

| Job | Runs |
|---|---|
| `checks` | `tsc -b`, `lint:new`, `vitest run`, `vite build`, Playwright boot smoke |
| `functions` | `npm run typecheck` in `firebase/functions` |
| `emulator` | **security-rules tests**, parse-worker integration tests, seeded e2e |

Rules tests: **40 Firestore + 17 Storage = 57** (`firebase/rules.test.ts`, `firebase/storage.rules.test.ts`), run by `npm run test:rules:emu`, blocking in the `emulator` job. Up from 27 + 13 = 40 before 2026-08-18. Three of the Storage tests are **skipped** — the membership gate needs cross-service `firestore.exists()`, which the Storage emulator does not resolve.

**CI is currently blocked fleet-wide by a GitHub Actions billing issue**, so no run can go green regardless of the code. Verification for this change was done locally against the emulator.

## Gaps (ranked)

1. **Legacy Storage objects are not tenant-scoped.** Objects uploaded before 2026-08-18 have no `homeId` in their path and stay readable by any signed-in non-anonymous user. The legacy clause had to stay broad — v1 imports exist at arbitrary shapes. Needs an object migration + field rewrite. Tracked in `docs/launch-readiness.md`.
2. **The Storage membership gate is not emulator-verifiable.** Cross-service `firestore.exists()` is unsupported by the Storage emulator (probed on firebase-tools 15.23.0). Its three tests ship skipped; the gate must be proven by the post-deploy smoke check in `docs/launch-readiness.md`. **This is the highest-risk unverified change in the repo.**
3. **Both `onRequest` doors send `Access-Control-Allow-Origin: "*"`.** Token verification is the real gate, so this is not an authorization hole, but an origin allowlist (as `mealplan` uses) would be strictly better. `chatQuery.ts:47`, `proxyPdf.ts:20`.
4. **`verifyIdToken` is called without `checkRevoked: true`** (`chatQuery.ts:108`, `proxyPdf.ts:39`), so a revoked or disabled account keeps working until its token expires (up to 1 hour).
5. **No deploy gating.** Manual deploys, no CI deploy job, nothing compares live rules to the repo. This is what let the rules drift 18 days behind the sharing feature.
6. **No Firebase budget cap.** Per-user daily AI quotas exist; a project-level spend ceiling does not.
7. **5 production npm vulnerabilities** (3 high: `react-router-dom`, `react-router`, `brace-expansion`; 2 moderate: `dompurify`, `tar`). 18 total, but 13 are build-time only. All fix within the current major.
8. **CSP is report-only.** Needs its reports read, then promotion to the enforcing header with hashes replacing `'unsafe-inline'` on `script-src`.
9. **`lint:new` covers only part of the tree** — most of `src/` is unlinted in CI.
10. **Dead `@supabase/supabase-js` dependency** still shipping in the client bundle graph.
11. **The emulator does not enforce Firestore indexes**, so a missing composite index or the `members.uid` fieldOverride fails only in production.
