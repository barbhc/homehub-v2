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

## Vendor-side spend alarms (verified 2026-08-19)

The in-app monthly ceiling (`shared/quota/policy.ts`, PR #91) is the first line of
defence, but it is **our own code** — a bug in the ceiling, a deploy that drops the
env var, or a paid call added without a `chargeAiQuota` wrapper all bypass it
silently. The vendor-side alarms below are the ones that still fire when our
accounting is the thing that broke.

**Two vendors, two bills, and they do not overlap.** This is the part that is easy
to get wrong:

| Cost | Billed by | Caught by |
|---|---|---|
| Firestore reads/writes, Functions invocations, Storage, egress | Google (GCP/Firebase) | GCP budget below |
| **Claude API tokens — the parse pipeline, chat, OCR, task generation** | **Anthropic, directly** | **Anthropic console alert below — NOT the GCP budget** |

A GCP budget on `homehub-2068d` will never see an Anthropic invoice. The runaway
risk this whole phase is about — a stuck retry loop shipping 12MB PDFs to Opus —
lands almost entirely on the Anthropic bill, which is exactly the one GCP cannot
see. Both alarms are required; neither is a substitute for the other.

### GCP budget — DONE, no action needed

Verified live on 2026-08-19 via `gcloud billing budgets describe`:

- Billing account `018AFC-7A39AF-E43EA7`, budget `Homehub`, scoped to project
  `homehub-2068d` (project number 793197604559) only.
- **$25/month**, calendar month, all credits included.
- Thresholds: 50%, 90%, 100% of **current** spend, plus **100% of forecasted
  spend** (added 2026-08-19 — the three original rules all fired only *after* the
  money was gone; the forecast rule is the one that warns mid-month while there is
  still time to act).
- `notificationsRule` is empty, which means `disableDefaultIamRecipients` is false
  — email goes to the billing account's admins and users. That is Barb today.

To re-check it at any time:

```bash
gcloud billing budgets list --billing-account=018AFC-7A39AF-E43EA7 --billing-project=homehub-2068d
```

> If a second maintainer is ever added, or Barb stops being a billing admin, this
> alert goes quiet without any error. Re-check it then — see the precondition rule
> at the top of this document.

### Anthropic console alert — BARB MUST DO THIS (5 minutes)

**Not automatable.** Spend alerts are console-only; the Anthropic Admin API covers
workspaces, members, and API keys but exposes no billing-limit endpoint, and the
key in `.env` is a regular `sk-ant-api…` key, not an admin key. So this one is a
click-path.

1. Sign in at **https://console.anthropic.com** as the org owner.
2. Left sidebar → **Settings** → **Billing** (org-level, not workspace-level).
3. Find **Usage limits** (some plans label it *Spend limits* / *Cost alerts*).
4. Set **Monthly spend alert** to **$25** — deliberately the same number as the GCP
   budget, so "have I blown a budget?" has one answer, not two.
5. Set **Monthly spend limit / hard cap** to **$100**. This is the one that actually
   *stops* calls rather than emailing about them. Pick a number you are willing to
   lose in a single bad night; $100 is roughly 4× the alert and still survivable.
6. Confirm the alert email is `barb.chang@gmail.com` (or whatever inbox is read on a
   phone at 11pm — an alert to an inbox nobody opens is not an alert).
7. **Optional but recommended:** Settings → **Workspaces** → create a `homehub-prod`
   workspace with its own **monthly budget**, and move the production key into it.
   That way a runaway in Homehub cannot drain the budget the other projects share —
   right now every app on this org bills into one pool.

Once done, tick this box and record the numbers actually chosen:

- [ ] Anthropic monthly **spend alert** set at $______ (target $25)
- [ ] Anthropic monthly **hard limit** set at $______ (target $100)
- [ ] Alert email confirmed as ______________________
- [ ] (optional) `homehub-prod` workspace with its own budget

## P0 — before the first invite goes out

- [x] **Set a Firebase Blaze budget alert** on `homehub-2068d` — DONE, verified live
      2026-08-19: $25/mo with a forecast rule. See *Vendor-side spend alarms* above.
      **The Anthropic alert in that same section is still open and is the more
      important half** — GCP cannot see the model bill.
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

1. Sign in, open an item, **upload a photo** — it must render. (This is the
   canary: if `firestore.exists()` misbehaves, `getDownloadURL` fails and the
   photo does not appear.)
2. Open an existing item whose photo predates the change — it must still render
   (legacy clause intact).
3. From a **second account that is not a member**, request the first account's
   new photo path directly — it must 403.

If step 1 or 2 fails, `firebase deploy --only storage` the previous
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
