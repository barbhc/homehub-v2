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

- [ ] **Patch the member self-create rule:** `firestore.rules` lets any signed-in user create their *own* member doc in **any home whose ID they know**. Demoted from P0 only because no shared-home IDs will circulate this round (friends run their own homes); fix before any invite/sharing work, and add a rules test.
- [ ] **npm CVEs + CSP:** ~10 vulnerabilities (4 high) and no Content-Security-Policy header (`BACKLOG.md`; note its wording still says "Supabase/localStorage" — stale v1 text).
- [ ] **In-app feedback entry point** (Section 7 of template): a "Send feedback" item writing to a `feedback` collection (or even mailto:) + the "what to test" note.
- [ ] **Latency pass** on the AI-heavy paths (chat, parse/ingest) — confirm visible loading states everywhere; Sentry tracing (0.2 sample) can show the slow spans.
- [ ] **Review `sendPushDaily` for new users** — make sure a brand-new home gets sensible (or no) daily pushes rather than noise.
- [ ] **Clean up dead weight:** remove the vestigial `@supabase/supabase-js` dependency from `homehub-v2/package.json`.

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
