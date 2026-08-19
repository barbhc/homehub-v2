# SYSTEM.md — homehub-v2

> Generated 2026-08-19 by Claude **from the code**. **Do not hand-edit** — regenerate at the end of any feature that touches these areas (global CLAUDE.md → SYSTEM.md tracker). Hand-edits rot; generated files don't.

Committed state as of `0f051d4` on `main`. This is the **live** app: Firebase project `homehub-2068d`, serving at <https://homehub-2068d.web.app>.

Every claim below was read at source; file:line references are the evidence. Where something is asserted without a citation it is marked as unverified.

**What changed since the 2026-08-18 generation:** the tenant-isolation and spend-cap PRs (#94, #91) merged; the emulator CI job was fixed (#96); **hosting and both rulesets were actually deployed** and the Storage tenant gate was proven against production (#102); five silent-failure paths were fixed and the five core flows got failure-path tests (#104); an enforcing CSP replaced the report-only one and 9 high CVEs were cleared (#108, #109). Concurrently merged by another session: the invite-code admission gate (#101), first-run seeding (#103), the a11y suite (#105), and device-viewport tests (#107).

## Stack

| Layer | Choice |
|---|---|
| Framework | React 19.2 + React Router 7.13, SPA |
| Build | Vite 7.3, TypeScript 5.9 (`npm run build` = `tsc -b && vite build`) |
| Styling | Tailwind CSS 4.1, Radix UI 1.4, `class-variance-authority`, `lucide-react` |
| Data fetching | SWR 2.4 + per-domain hooks/services under `src/modules/*/services` |
| Backend | Firebase Cloud Functions **2nd gen, Node 20**, region `us-central1` (`firebase/functions/`) |
| AI | `@anthropic-ai/sdk` 0.78. Models in use: `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`, `claude-opus-4-8`, `claude-3-5-haiku-20241022` |
| PDF | `pdfjs-dist` 4.10 (client render, worker from a blob URL), Claude document blocks (server parse) |
| Native shell | Capacitor 8.4 iOS — push-notifications, camera, apple-sign-in |
| Monitoring | PostHog (`posthog-js`, `src/lib/analytics.ts:27`). **Sentry SDK is wired but NOT enabled** — see Gap #1 |
| Tests | Vitest 4.1 (80 unit files), Playwright 1.59 (29 e2e specs), `@firebase/rules-unit-testing` 5.0, 23 node:test worker files |
| Lint | ESLint 9.39 — `npm run lint:new` covers only `src/integrations`, `shared`, `e2e/smoke`, `scripts/seed-emulator.ts`, `firebase/functions/src` |

**Admin SDK versions diverge on purpose.** Root is `firebase-admin@^14.2.0` (a **devDependency** — scripts, seeds and tests only, never in the client bundle). `firebase/functions` stays on `^13`, because `firebase-functions@6.6.0` peer-requires `^11 || ^12 || ^13` and npm refuses the tree otherwise. Moving functions to 14 requires `firebase-functions@7` — see Gap #5.

**Dead dependency:** `@supabase/supabase-js` 2.95 is still in `dependencies` despite the v1 Supabase backend being deleted.

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
| Firebase Cloud Messaging | Web push | `VITE_FIREBASE_VAPID_KEY` | public-by-design; duplicated into `public/firebase-messaging-sw.js` (not Vite-processed) |
| Sentry | Error monitoring | `VITE_SENTRY_DSN` | **empty** — the SDK never initialises. Gap #1 |
| PostHog | Product analytics | `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST` | public-by-design. Note it loads its runtime from `us-assets.i.posthog.com`, a **different host** from its `api_host` — both are in the CSP |
| CPSC saferproducts.gov | Recall lookups | none | `products/checkRecalls.ts:39` — fixed host, encoded query param |

**Secret-exposure check (verified, not assumed):** every paid key is introduced via `defineSecret` inside `firebase/functions/src/**` and injected per-function; no `ANTHROPIC_API_KEY` / `BRAVE_SEARCH_API_KEY` / `GOOGLE_VISION_API_KEY` reference exists anywhere under `src/`.

### Non-repo prerequisite: the cross-service IAM grant

`storage.rules` calls `firestore.exists()` to check membership. That only resolves if the **Cloud Storage for Firebase** service agent holds `roles/firebaserules.firestoreServiceAgent`:

```
service-<projectNumber>@gcp-sa-firebasestorage.iam.gserviceaccount.com
```

The Firebase console prompts for this the first time you open the Storage tab after deploying such rules. **A non-interactive `firebase deploy` never prompts**, and without the grant the rules compile, deploy, and then deny every caller including members — photos and manuals simply stop loading while the rules still read as correct. Granted on `homehub-2068d` 2026-08-19. Granting it to the `@firebase-rules` agent instead does nothing; that is the wrong principal.

## Auth logic

`AuthProvider` (`src/modules/auth/components/AuthProvider.tsx`) wraps Firebase Auth: email/password (`:150`), email-link/magic-link (`:178`, consumed at `:84`), and Apple sign-in. `AuthGate` protects routes; there is no dev bypass.

Two server-side gates, used consistently:

- **Per-home membership** — `db.doc('homes/{homeId}/members/{uid}').get()`, for every function that receives a `homeId`.
- **Any-home membership** — `requireAnyMembership` / `hasAnyMembership` (`lib/membership.ts:17-27`), a `collectionGroup("members")` lookup for functions that take no `homeId`. Exists specifically to stop anonymous/throwaway uids burning paid APIs.

**These gates are only as strong as the rule that decides who becomes a member.** Until #94 any signed-in user who knew a `homeId` could write their own member doc into that home at any role, which made every per-home check above return true for them. The `createdBy` ownership anchor is what closes it — and as of 2026-08-19 that fix is **actually deployed**, which it was not for the 19 days before.

**Admission gate (#101):** `admissions/{uid}` records who has been let in; `isSignedIn()` in `firestore.rules:64` now also accepts an existing admission doc. Codes live at `inviteCodes/{code}`, which is **fully denied to clients** — only the `redeemInviteCode` callable (Admin SDK) can read or decrement one.

## Endpoints (the doors)

26 deployed functions, all region `us-central1`. Every `onCall` begins with `if (!request.auth?.uid) throw new HttpsError("unauthenticated", …)` before any work.

| Function | Kind | Auth | Membership | Quota | Spends money |
|---|---|---|---|---|---|
| `enqueueParse` | onCall | yes | per-home | yes | indirect (queues worker) |
| `parseWorker` | onTaskDispatched | internal (Cloud Tasks) | n/a | n/a | **yes** — Claude |
| `commitManualDraft` | onCall | yes | per-home | — | no |
| `rollForwardNeverStarted` | onSchedule (30 5 * * *) | internal | n/a | n/a | no |
| `graduateFeedback` | onSchedule | internal | n/a | n/a | unverified |
| `sendTestPush` | onCall | yes | — | — | no |
| `sendPushDaily` | onSchedule (0 15 * * *) | internal | n/a | n/a | no |
| `completeTask` | onCall | yes | per-home | — | no |
| `acceptInvite` | onCall | yes | n/a — **by design** | — | no |
| `removeMember` | onCall | yes | caller-is-owner-or-self | — | no |
| `getInviteDetails` | onCall | yes | n/a — token-keyed, sanitized | — | no |
| `redeemInviteCode` | onCall | `:17` | n/a — **by design** (this is how you get in) | — | no |
| `generateTasks` | onCall | yes | any-home | yes | **yes** |
| `detectDocType` | onCall | yes | per-home | yes | **yes** |
| `ocr` | onCall | yes | any-home | yes | **yes** |
| `productLookup` | onCall | yes | any-home | yes | **yes** |
| `chatQuery` | **onRequest** | `verifyIdToken` | per-home | yes → 429 | **yes** |
| `suggestCareNotes` | onCall | yes | any-home | yes | **yes** |
| `importCareUrl` | onCall | yes | any-home | yes | **yes** |
| `ingestReference` | onCall | yes | per-home | yes | **yes** |
| `classifyExistingTasks` | onCall | yes | per-home | yes | **yes** |
| `discussTask` | onCall | yes | per-home | yes | **yes** |
| `searchProductImages` | onCall | yes | any-home | yes | **yes** |
| `findManual` | onCall | yes | any-home | yes | **yes** |
| `checkRecalls` | onCall | yes | per-home | — | no (fixed public API) |
| `proxyPdf` | **onRequest** | `verifyIdToken` `:39` | any-home `:45` → 403 | — | no (bandwidth only) |

**The two `onRequest` doors** verify the Firebase ID token themselves and both set `Access-Control-Allow-Origin: "*"` (`chatQuery.ts:47`, `proxyPdf.ts:20`). A wildcard ACAO is not itself an authorization hole — the bearer-token check is the gate — but any origin can invoke them from a browser with a stolen token. See Gap #6.

**No unauthenticated function exists.** `healthCheck` was removed in #94.

### SSRF posture

Every server-side fetch of a user-supplied URL goes through `fetchGuarded` (`shared/parse/ssrf.ts:72`), which sets `redirect: "manual"` and re-runs `isAllowedUrl` **on every hop**, capped at `MAX_REDIRECTS = 3`. All four sites use it: `proxyPdf.ts:65`, `claude.ts:83`, `careSuggestions.ts:144`, `storagePdf.ts:23`. Covered by 13 tests in `src/lib/ssrf.test.ts`.

The remaining raw `fetch` calls (`findManual.ts:120`, `checkRecalls.ts:40`, `searchProductImages.ts:34`, `chatQuery.ts:65`, `ocr.ts:151`) build their URLs from fixed vendor hosts with only the query string interpolated — not SSRF vectors.

## Data model & rules

All app data is path-tenanted under `homes/{homeId}/…`; membership at `homes/{homeId}/members/{uid}` is the rules primitive. Roles gate **member management only** — any member has full CRUD on the home's data, matching v1's effective model.

| Path | Read | Write | Notes |
|---|---|---|---|
| `homes/{homeId}` | member | create: signed-in **and `createdBy == uid`** (`:96`); update: member **and `createdBy` unchanged** (`:102`); delete: **owner only** (`:105`) | `createdBy` is the ownership anchor; `createdByUnchanged()` at `:38` |
| `homes/{homeId}/members/{uid}` | member | create: self **only as `owner` of a home you created**, else owner; update: owner, or self without role change; delete: self or owner | The tenant-isolation fix (`:108`) |
| `homes/{homeId}/invites/{id}` | member | member | Acceptance is **not** a client write — `acceptInvite` (Admin SDK) |
| `homes/{homeId}/taskInstances`, `taskTemplates` | member | member + assignee-must-be-member guard | `assigneeIsMember()` |
| `taskFeedback`, `parseFeedback` | member read/create | **update/delete denied** | append-only ledgers |
| `rooms`, `items`, `careNotes`, `chatFaqs`, `shoppingList`, `tierChangeLog`, `serviceProviders`, `houseRules`, `manuals/**`, `cleaningSessions/**`, `chatConversations/**`, `troubleshootingCases/**` | member | member | flat member-CRUD |
| `users/{uid}` | `get` any signed-in; **`list` denied** | self only | `list` closed against name/avatar enumeration |
| `users/{uid}/private/**` | self | self | prefs, FCM tokens |
| `supplyCatalog/**` | any signed-in | **denied** (Admin SDK) | global catalog |
| `webRetrievals`, `productLookupCache`, `parseEvalCandidates` | **denied** | **denied** | server-only caches |
| `usage/{uid}/daily/{day}` | **denied** | **denied** | quota counters — user cannot read or reset their own |
| `inviteCodes/{code}` | **denied** | **denied** | `:260` — redeem is server-side only |
| `admissions/{uid}` | `get` self only; **`list` denied** | **denied** | `:267` — admission cannot be self-granted |
| collectionGroup `members` | signed-in **where `uid == auth.uid`** | — | serves "find all my memberships" |

**Storage** (`storage.rules`): new uploads are keyed `homes/{homeId}/…` and `get` requires a member doc in that home via cross-service `firestore.exists()` (`:66-68`). Writes stay path+uid scoped (`:73-91`) so they remain emulator-verifiable. Legacy objects keep their old paths and remain readable by any signed-in non-anonymous user, narrowed to `prefix != 'homes'` (`:108-110`) — see Gap #3.

**Verified against production**, not just the emulator (`npm run smoke:storage`, 2026-08-19):

```
PASS  member reads own home's object    -> 200
PASS  member reads legacy-path object   -> 200
PASS  non-member reads that object      -> 403
PASS  unauthenticated reads it          -> 403
```

**Indexes:** `firestore.indexes.json` carries the composite indexes plus the `members.uid` COLLECTION_GROUP fieldOverride that `hasAnyMembership` and `getMyHomes` depend on. The **emulator does not enforce indexes**, so a missing one fails only in production (`lib/membership.ts:9-11`); `scripts/ops/prod-smoke.ts` is the compensating check.

## Quotas & spend caps

`consumeDailyAiQuota` (`lib/quota.ts`) — one counter doc per user per UTC day at `usage/{uid}/daily/{yyyy-mm-dd}`, read-and-incremented **transactionally**, default `DAILY_AI_LIMIT = 50`, per-function tallies in `fns`, `expiresAt` set 2 days out for TTL cleanup. Charged **after** auth/membership/validation and **before** the paid work, so rejected requests don't burn quota. Applied to all money-spending callables plus `chatQuery` (surfaced as HTTP 429).

**App-wide monthly ceiling (#91):** cost-weighted units with refunds on failure, on top of the per-user daily cap.

Not covered: `parseWorker` (quota is charged upstream at `enqueueParse`), and there is still **no org-level Firebase budget cap** — see Gap #7.

## Security headers

Served from `firebase.json` on `**`:

| Header | Value |
|---|---|
| `Content-Security-Policy` | **enforcing** — `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, and `script-src 'self'` plus **three SHA-256 hashes**, no `'unsafe-inline'` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(self), microphone=(), geolocation=(), payment=()` |
| `Strict-Transport-Security` | `max-age=31556926; includeSubDomains; preload` (Firebase default) |

The three hashed inline scripts in `index.html` are the pre-paint theme setter, the boot-splash safety timeout, and the font-stylesheet `media` swap. None can move to a file without putting a request back on the cold-start path. The third exists *because* of CSP: it was an inline `onload=` attribute, and **hashes never cover inline event handlers**.

`src/test/csp.test.ts` recomputes the hashes from `index.html` and fails if they drift — a stale hash is silent in production and costs either the boot theme or the splash timeout. The Report-Only twin was retired in #109.

`img-src` is deliberately `https:` rather than an allowlist: product-photo search renders thumbnails from arbitrary retailer and CDN hosts (`PhotoSearchSheet`).

## Deploy

| Target | How | Gating |
|---|---|---|
| Hosting | `firebase deploy --only hosting` (serves `dist/`, SPA rewrite to `/index.html`) | **manual** |
| Functions | `firebase deploy --only functions` (predeploy runs `npm run bundle` = typecheck + esbuild) | **manual** |
| Firestore rules + indexes | `firebase deploy --only firestore:rules,firestore:indexes` | **manual** |
| Storage rules | `firebase deploy --only storage` — **then `npm run smoke:storage`** | **manual** |

**There is still no deploy job in CI.** Nothing enforces that deployed rules match the repo. On 2026-08-19 that gap was measured, not theorised: `firestore.rules` was serving a version 19 days old and `storage.rules` one **36 days** old, with `allow read: if true` — every photo, manual and receipt readable by anyone on the internet holding a path. Both are now deployed and byte-match the repo.

**Order matters, and it is not obvious.** Hosting deploys had been keeping pace with merges while rules had not, so the client was newer than the rules. Deploying the new rules against the old client would have denied every upload (no `create`/`update` clause for legacy paths) and every home creation (no `createdBy` on the home doc). **Client first, then rules.**

Caching: `Cache-Control: no-cache` on `**` (so the iOS WKWebView picks up a deploy on next launch) and `max-age=31536000, immutable` on `/assets/**` (content-addressed).

## Tests & CI

| Job | Runs |
|---|---|
| `checks` | `tsc -b`, `lint:new`, `vitest run`, `vite build`, Playwright boot smoke |
| `functions` | `npm run typecheck` in `firebase/functions` |
| `emulator` | **security-rules tests**, parse-worker integration tests, seeded e2e |

Current local counts: **686 vitest** (6 skipped), **129 parse-worker**, **65 rules** (59 Firestore + 17 Storage declarations, 3 skipped).

Three Storage tests remain **skipped**: the membership gate needs cross-service `firestore.exists()`, which the Storage emulator does not resolve. This was re-probed on firebase-tools 15.23.0 rather than taken on trust — un-skipped, the *member* is denied, so the "outsider is denied" assertions pass vacuously. A false green is worse than a skip. `npm run smoke:storage` is the compensating check and runs against the real project.

**CI trigger changed (#108).** The workflow ran on `pull_request` **and** `push: [main]`. Because merges are squash merges, the tree landing on main is the tree the PR already tested; in August that duplicate cost **982 Actions minutes**, a third of the 3,000-minute monthly allowance. Now `pull_request` + `workflow_dispatch`, with `concurrency: cancel-in-progress`. The tradeoff: if main moves between a PR's last run and its merge, that combination is untested until the next PR.

**CI could not run for any of this work.** The account's 3,000 Actions minutes were exhausted on 2026-08-19 (resets 1 Sept), and 18 of 19 repos are private, so every run bills. Everything here was verified locally against the emulator and, where it touched production, against production.

## Gaps (ranked)

1. **Sentry is not enabled.** `VITE_SENTRY_DSN` is empty, so `bootTelemetry` returns before `Sentry.init` and the SDK never starts (`src/main.tsx:42`). The live bundle contains zero references to a Sentry ingest host. **There is no error reporting in production at all** — the SDK being wired is precisely what made this look done. A production build with no DSN now warns once in the console. Needs a Sentry project + DSN.
2. **Legacy Storage objects are not tenant-scoped.** Objects uploaded before 2026-08-18 have no `homeId` in their path and stay readable by any signed-in non-anonymous user. The legacy clause has to stay broad — v1 imports exist at arbitrary shapes. Needs an object migration + field rewrite.
3. **The Storage membership gate is not emulator-verifiable.** Its three tests ship skipped. Mitigated, not closed, by `npm run smoke:storage` against the real project — which must be run after every `firebase deploy --only storage`.
4. **No deploy gating.** Manual deploys, no CI deploy job, nothing compares live rules to the repo. This is what let the rules drift 19 and 36 days behind the code, unnoticed.
5. **15 moderate npm vulnerabilities remain** (6 root, 9 functions), all transitive under `firebase-admin`. **All 9 high are cleared.** npm's proposed remedy is `firebase-admin@10.3.0` — a three-major *downgrade* — and must not be applied. The real fix needs `firebase-functions@7` (which accepts `firebase-admin@^14`), a major runtime bump for the parse worker, quotas and invites that deserves its own PR with a deploy behind it.
6. **Both `onRequest` doors send `Access-Control-Allow-Origin: "*"`.** Token verification is the real gate, so not an authorization hole, but an origin allowlist would be strictly better.
7. **No Firebase budget cap.** Per-user daily quotas and an app-wide monthly ceiling exist in code; a project-level GCP spend ceiling does not.
8. **`verifyIdToken` is called without `checkRevoked: true`** (`chatQuery.ts:108`, `proxyPdf.ts:39`), so a revoked or disabled account keeps working until its token expires (up to 1 hour).
9. **`lint:new` covers only part of the tree** — most of `src/` is unlinted in CI, including every component touched by the silent-failure fixes.
10. **Dead `@supabase/supabase-js` dependency** still in `dependencies`.
11. **The emulator does not enforce Firestore indexes**, so a missing composite index or the `members.uid` fieldOverride fails only in production.
12. **GitHub Actions minutes are exhausted until 1 Sept.** 18 of 19 repos are private, so all CI bills against the 3,000-minute Pro allowance; homehub-v2 alone used 1,981 minutes in August. The duplicate-trigger fix removes ~982/month of that.
