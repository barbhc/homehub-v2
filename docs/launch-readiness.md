# HomeHub — Launch-Readiness Checklist (friends-and-family round)

> Instantiates `~/.claude/templates/app-launch-readiness-template.md` for HomeHub v2.
> Grounded in a repo audit on 2026-07-21. **This is the friends-round gate, not the
> public/App Store launch.**

## Front matter

| Field | Value |
|---|---|
| **App** | HomeHub v2 (`homehub-v2/`, Firebase project `homehub-2068d`; root repo is retired v1 — Supabase backend deleted) |
| **Sharing goal** | Friends use it for their own homes and give feedback (per product notes 2026-07-21) |
| **Distribution channel** | Web URL `https://homehub-2068d.web.app` (Capacitor iOS wrapper exists but web is enough for round 1) |
| **Sharing model (decided)** | **Each friend runs their own home.** Co-member invite flow stays deferred — it is partially wired and explicitly out of scope this round. |
| **Required-tasks funnel** | sign up → create home → add first items → engage with item content → check off first task |
| **AHA moment (candidate)** | first time the app *answers a real question about their stuff* — e.g. viewing parsed manual/care content for an item they added, or completing a generated task. Pick one and instrument it. |
| **Top 3 risks** | (1) zero analytics = blind feedback round; (2) uncapped AI spend per signed-up user; (3) world-readable Storage objects (receipts/photos) |

## What's already in good shape (verified — don't redo)

- **Auth is real and open:** email/password, email-link, and Apple sign-in with password reset (`src/modules/auth/components/AuthProvider.tsx`); `AuthGate` protects routes, no dev bypass.
- **Multi-tenancy is genuine:** all data under `homes/{homeId}/…`, gated by membership (`firestore.rules`); multiple homes/users coexist; `getPrimaryHome` handles multi-home.
- **Onboarding + empty states exist:** `Index.tsx` routing → `HomeOnboarding` → `OnboardingProfile`/`OnboardingInventory`; `EmptyState.tsx` used on Home/Inventory/Tasks; duplicate-home guard from a real launch-day incident.
- **Sentry** wired, prod-gated (`src/main.tsx`), plus ErrorBoundary.
- **Tests:** 24 unit + 26 Playwright e2e + Firestore rules tests, all in CI.
- **Server secrets:** Anthropic/Brave keys are Firebase secrets, never client-shipped; all `onCall` functions check `request.auth`.

## P0 — before the first invite goes out

- [ ] **Set a Firebase Blaze budget alert** on `homehub-2068d` (flagged as an owner to-do in `MIGRATION_STATUS.md`, never confirmed done).
- [ ] **Add a per-user daily quota on AI functions** (`chatQuery`, `generateTasks`, `productLookup`, `ingestReference`, `ocr`, …). Simple pattern: a `usage/{uid}/{yyyy-mm-dd}` counter doc checked in one shared helper at the top of each paid function. A generous cap (e.g. 50 AI calls/day) protects against loops and leaked links without friends ever noticing.
- [ ] **Close the Storage public-read:** `storage.rules` currently has `allow read: if true` on all paths — every uploaded manual, item photo, and receipt is readable by URL. Scope reads to home members (and migrate the "tokenless public URL" call sites that depend on it).
- [ ] **Add product analytics** (recommend PostHog; Firebase Analytics also fine). Instrument the funnel + engagement events — this is what makes the feedback round measurable against the product-notes metrics:
  - funnel: `sign_up`, `home_created`, `first_item_added`, `item_content_viewed`, `task_checked` (with timestamps → time-to-complete-required-tasks, time-to-first-AHA)
  - engagement: items added, item content views, tasks checked, session count / return visits
- [ ] **Deploy hygiene:** deploys are manual and current work sits on `feat/parser-curate-tasks` — decide what ships, deploy it, and confirm the live site matches. Then **retire the dead v1 Vercel deployment** (its Supabase backend is deleted; if the old URL is public it shows friends a broken app).
- [ ] **Secrets off the shared path:** move `homehub-2068d-firebase-adminsdk-fbsvc-*.json` (prod admin key), `AuthKey_*.p8` (Apple key), and the full-history `*.zip`/`*.bundle` archives out of the project folders. They're gitignored but one folder-zip away from leaking.
- [ ] **Fresh-account walkthrough on prod:** new email, sign up, create home, add 3 items, complete a task — timed, no code/DB touches. (Note: prod data owner is `bcworkrelated@gmail.com` / "SF Condo" — use a *new* account, don't test in that one.)

## P1 — first week after sharing

- [x] **Patch the member self-create rule** — DONE 2026-08-18. See "A precondition expired" below; this is the entry that lapsed.
- [ ] **npm CVEs:** 18 vulnerabilities (10 moderate, 8 high) as of 2026-08-18, but only **5 reach production** — `react-router-dom` + `react-router` (high), `brace-expansion` (high), `dompurify` + `tar` (moderate). The other 13 are build-time only. All 5 fix within the current major; `npm audit fix` pulls in 80 packages, so run it in its own PR and click through the app afterwards (routing is in the blast radius).
- [x] **CSP** — added 2026-08-18 as `Content-Security-Policy-Report-Only` in `firebase.json`. Deliberately not blocking: two inline `<script>` blocks in `index.html`, six Firebase/Google origins, PostHog, arbitrary vendor `<img>` hosts, and a Capacitor WebView. **Next step: read the violation reports, then promote to the enforcing header and replace `'unsafe-inline'` on `script-src` with hashes.**
- [ ] **In-app feedback entry point** (Section 7 of template): a "Send feedback" item writing to a `feedback` collection (or even mailto:) + the "what to test" note.
- [ ] **Latency pass** on the AI-heavy paths (chat, parse/ingest) — confirm visible loading states everywhere; Sentry tracing (0.2 sample) can show the slow spans.
- [ ] **Review `sendPushDaily` for new users** — make sure a brand-new home gets sensible (or no) daily pushes rather than noise.
- [ ] **Clean up dead weight:** remove the vestigial `@supabase/supabase-js` dependency from `homehub-v2/package.json`.

## A precondition expired — 2026-08-18

The member self-create rule sat at P1 for four weeks behind one sentence:

> *"Demoted from P0 only because no shared-home IDs will circulate this round
> (friends run their own homes); fix before any invite/sharing work."*

That was a sound call **on 2026-07-21**. It stopped being true on **2026-08-18**,
when sharing shipped: PRs #79 and #80 added multi-home support and the home
switcher, an `/invite/:token` route landed at `App.tsx:145`, and
`HomeMembersSection` went into Settings. `firestore.rules` was last touched
**2026-07-31** — eighteen days before the thing it was waiting on arrived.

Nobody re-read this line when sharing shipped, because nothing made them. The
risk was accepted against a condition, and the condition changed silently.

Worse, home IDs turned out never to have been secret even in the friends round:
push deep-links carry `?home=<homeId>` (`sendPush.ts:162`, consumed at
`usePushDeepLink.ts:10`), so the ID travels in a notification URL.

**The rule this earns:** an accepted risk that names a precondition
("*fix before X*", "*safe until Y*") is not done being managed. Whoever ships X
re-reads it. Concretely — put the re-check in the PR that lands the feature, not
in a doc that only gets read at review time:

- [ ] When a checklist item is deferred **because of a precondition**, name the
      precondition and the file that would have to change. Then grep this doc for
      that filename before merging anything that touches it.

## Storage: legacy objects are still un-scoped

The 2026-08-18 change keys **new** uploads under `homes/{homeId}/…` and gates
reads on membership. Objects uploaded **before** that keep the old paths, carry
no `homeId`, and stay readable by any signed-in user — the legacy read clause had
to stay broad because v1 imports exist at arbitrary path shapes and enumerating
prefixes would have broken existing photos and manuals.

- [ ] **Migrate legacy Storage objects** into `homes/{homeId}/…`, rewrite the
      `photoPath` / `sourceRef` / `receipt_storage_path` / diagram-URL fields that
      point at them, then narrow the legacy clause in `storage.rules` to nothing.
      Until this runs, the tenant-scoping fix protects new content only.

## Post-deploy smoke check — Storage rules (REQUIRED, not optional)

The membership gate uses cross-service `firestore.exists()`, which **the Storage
emulator does not resolve** (verified on firebase-tools 15.23.0: same rule body,
member denied with the Firestore call, allowed with a plain auth check). So it
cannot be proven locally and its three rules tests ship skipped. It has to be
proven against the real project, immediately after deploying:

```bash
firebase deploy --only storage
```

This is now a script — `npm run smoke:storage` (scripts/smoke-storage-rules.mjs).
It asserts all four cases against the real project with throwaway users and
synthetic paths, and cleans up after itself:

```bash
WEB_API_KEY=<VITE_FIREBASE_API_KEY> npm run smoke:storage
```

1. a member reads their own home's object → 200 (the canary: if
   `firestore.exists()` misbehaves, `getDownloadURL` fails and photos vanish)
2. a member reads a legacy-path object → 200 (legacy clause intact)
3. a signed-in non-member reads the same object → 403 (the tenant gate)
4. an unauthenticated caller reads it → 403 (no public reads)

**If only #1 fails, the rules are fine and the IAM grant is missing.** Do NOT
widen the rule to make it pass. See below.

### The cross-service IAM grant (learned the hard way, 19 Aug 2026)

`firestore.exists()` in Storage rules needs the **Cloud Storage for Firebase**
service agent to hold `roles/firebaserules.firestoreServiceAgent`. The Firebase
console prompts for this the first time you open the Storage tab after deploying
such rules; a non-interactive `firebase deploy` never prompts, so the grant
silently never happens. The rules then compile, deploy, read correctly — and
deny every caller including members. The Rules test API is what finally named it:

```
Function not found error: Name: [firestore.exists]
```

Granting the role to the `@firebase-rules` service agent is NOT sufficient and
was the wrong turn taken on the day. The principal that needs it is
`@gcp-sa-firebasestorage`:

```bash
gcloud projects add-iam-policy-binding <project> \
  --member=serviceAccount:service-<projectNumber>@gcp-sa-firebasestorage.iam.gserviceaccount.com \
  --role=roles/firebaserules.firestoreServiceAgent
```

Allow ~1 minute to propagate, then re-run `npm run smoke:storage`.

If #1 or #2 still fails after that, `firebase deploy --only storage` the previous
`storage.rules` and reopen this item.

## P2 — nice to have

- [ ] Finish the co-member invite flow (token lookup rules + `acceptInvite` path) — unlocks couples/shared homes; do together with the member-rule fix above.
- [ ] Starter templates for common household items to shorten time-to-first-value during `OnboardingInventory`.
- [ ] Decide whether friends ever get the iOS (Capacitor/TestFlight) build or web stays the channel.

## Measurement plan (maps the handwritten metrics → instrumentation)

| Product-notes metric | Concrete measure | Source |
|---|---|---|
| Stability: no bugs | crash-free sessions, error rate | Sentry (already wired) |
| Minimal latency | p75 screen load; AI action duration | Sentry tracing |
| Time to complete required tasks | timestamp deltas across the funnel events | analytics (new) |
| Time to 1st AHA/joy/relief | signup → first AHA event (pick the AHA definition above) | analytics (new) |
| Engagement | items added, item content engagement, tasks checked, time on app, return visits | analytics (new) |

## Dry run & sign-off

- [ ] Full funnel on a fresh account via the real URL (P0 walkthrough above).
- [ ] One pilot friend while you watch silently; fix what surfaces.
- [ ] "What to test" note written (3–5 focus areas + known rough edges).
- [ ] You can see: signups (analytics), errors (Sentry), AHA reached (analytics).
