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
| **Top 3 risks** *(restated 2026-08-19)* | (1) **no error visibility** — Sentry has no DSN in the deployed bundle, so a broken ring looks identical to a healthy one; (2) **no CI** — Actions billing is blocked account-wide, so nothing has been gated by a machine since 18 Aug; (3) **the Anthropic bill is unalarmed** — the in-app ceiling and the GCP budget both exist, and neither can see the invoice that a runaway parse actually lands on. *Original three (blind analytics, uncapped spend, world-readable Storage) are addressed — see the sections below.* |

## What's already in good shape (verified — don't redo)

- **Auth is real and open:** email/password, email-link, and Apple sign-in with password reset (`src/modules/auth/components/AuthProvider.tsx`); `AuthGate` protects routes, no dev bypass.
- **Multi-tenancy is genuine:** all data under `homes/{homeId}/…`, gated by membership (`firestore.rules`); multiple homes/users coexist; `getPrimaryHome` handles multi-home.
- **Onboarding + empty states exist:** `Index.tsx` routing → `HomeOnboarding` → `OnboardingProfile`/`OnboardingInventory`; `EmptyState.tsx` used on Home/Inventory/Tasks; duplicate-home guard from a real launch-day incident.
- ~~**Sentry** wired, prod-gated~~ — **WRONG, corrected 2026-08-19.** The code is
  there (`src/main.tsx:42`) and `ErrorBoundary` does call `captureException`, but
  `VITE_SENTRY_DSN` is empty, so `Sentry.init` never runs. Verified by downloading
  the live bundle from `homehub-2068d.web.app`: it carries the PostHog key and **no
  Sentry DSN**. Every crash since has gone nowhere. This line sitting under
  *"verified — don't redo"* is exactly how it stayed invisible for a month, and is
  the second entry in this document to fail that way. See the precondition rule below.
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
- [x] **Add a per-user daily quota on AI functions** — DONE. 50 units/day per user
      (PR #91), an app-wide 20,000-unit monthly ceiling with refunds and cost-weighted
      units (PR #91), and per-endpoint rate limits capping the *minute* (PR #97).
      The last one matters separately: quotas cap the day, and a stuck retry can
      spend a whole day's allowance in five seconds — the cap works and the user
      still loses. Details in `shared/quota/policy.ts`.
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
- [x] **In-app feedback entry point** — DONE (PR #99). Three entry points, not one:
      the crash screen (which previously had none — `ErrorBoundary` replaces the whole
      app, so a user who landed there could not reach Settings), the desktop header,
      and Settings. mailto rather than a `feedback` collection on purpose: a Firestore
      write cannot help when the thing being reported IS Firestore. The "what to test"
      note is in `docs/testflight-ring.md`.
- [ ] **Latency pass** on the AI-heavy paths (chat, parse/ingest) — confirm visible loading states everywhere; Sentry tracing (0.2 sample) can show the slow spans.
- [ ] **Review `sendPushDaily` for new users** — make sure a brand-new home gets sensible (or no) daily pushes rather than noise.
- [ ] **Clean up dead weight:** remove the vestigial `@supabase/supabase-js` dependency from `homehub-v2/package.json`.

## Phase 2–4 — what shipped, 2026-08-19

The work between "secure" and "ready for a wide spectrum of real users".

### Strangers at scale

| | |
|---|---|
| **Vendor spend alarms** | GCP budget verified live and given a *forecast* threshold — its three original rules all fired only after the money was gone. **The Anthropic alert is still open and is the more important half**; see *Vendor-side spend alarms* above. |
| **Rate limits** | Per-endpoint and per-user, 60s windows, folded into the transaction `chargeAiQuota` already runs so they cost no extra reads. A throttled call charges nothing — being throttled must not also spend the allowance being protected. |
| **Invite gate** | Enforced in `firestore.rules` at *home creation*, not sign-up: sign-up is Firebase Auth with a public API key, so a client check there is a suggestion. Ships **off**; `scripts/ops/invite-codes.ts on`. See `docs/invite-gate.md`. |
| **Parser eval** | `evals/manual-parser/` — 12 real manuals, expectations written by reading them, **baseline 97.5/100**. `npm run eval:parser -- --offline` re-scores for free. |

### Usability

| | |
|---|---|
| **First run** | A sample home at `/sample` you can explore before committing, empty states that say what a screen is *for*, and capture guidance that names what to photograph (the rating label, not the appliance front). |
| **Accessibility** | The suite could not run *and* could not fail. Both fixed; it now gates CI at two viewports. 16 of 17 checks were failing — all fixed, including a design-token contrast bug affecting nearly every screen. |
| **Device matrix** | Four viewports, gating on layout. Found and fixed a real iPad break: the desktop header renders from 768px but needed ~1102px, so its right-hand controls ran off the edge. |
| **Feedback** | Three entry points including the crash screen, which had none. |

### Launch prep (prepared, not shipped)

- **Privacy + terms** — already existed, written against the code on 2026-07-31, and re-verified. No action.
- **Rollback** — `docs/rollback.md`. Written for 11pm on a phone.
- **TestFlight ring** — `docs/testflight-ring.md`. 5–10 users, two weeks, thresholds fixed *before* the ring.

### Still open, and honest about it

- **Anthropic spend alert** — console-only, 5 minutes, Barb's to do.
- **`VITE_SENTRY_DSN`** — not set, so nothing is being captured. See the correction above.
- **Analytics funnel** — PostHog is wired, but the funnel events the ring needs measuring are not confirmed firing.
- **Tap targets between 24px and 44px** — WCAG's 24×24 minimum is gated and passes; Apple's 44×44 guideline is reported with counts by the device suite. Closing that gap is a design pass, not a layout fix.
- **CI has not run since 18 Aug.** GitHub Actions billing is blocked account-wide: every job fails unstarted in ~2s. Everything above was verified by running each CI job locally. **Nothing in this repo can fix that** — it needs Barb's billing settings.


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

### It happened twice more — 2026-08-19

This is not a one-off, and treating it as one is how it keeps happening.

**Second instance.** The *deployed* rules were 19 days (Firestore) and 36 days
(Storage) stale. PR #94's tenant-isolation fix — the entire point of #94 — had
never been live. The unstated precondition was "merging deploys it". Hosting
auto-deploys; rules never have.

**Third instance.** Sentry sat under *"What's already in good shape (verified —
don't redo)"* with no DSN in the production bundle. It captured nothing, for a
month, while a heading told every reader not to look at it.

**The rule, restated so it covers all three:**

> An accepted risk is a claim about the world, and the world moves. So is a
> ticked checkbox. **Neither is self-maintaining.**

Concretely, three habits, in the order they are worth adopting:

1. **Name the precondition and the file.** "Safe until X" is only manageable if
   X is written down next to the file that would change it. Then whoever ships X
   greps this document before merging.
2. **A ticked box needs a date and a way to re-check it.** Not "Sentry wired" but
   "Sentry wired — verified 19 Aug by finding the DSN in the deployed bundle".
   A claim you cannot re-run is a claim you cannot maintain, and it decays
   silently into a heading that tells people not to look.
3. **"Verified — don't redo" is the most dangerous heading in this document.**
   Two of the three failures above were sitting under it. Anything in that
   section needs the check that proved it, so re-proving costs a command rather
   than an afternoon.

The recurring shape is the same every time: **something was true when written,
stopped being true silently, and the document went on asserting it.** Nothing in
the code can catch that. The only defence is that these claims carry their own
expiry conditions and the commands that re-test them.

- [ ] Before each release, re-run the checks behind every ticked P0 box rather
      than trusting the tick. Today that is: `gcloud billing budgets list` (the
      GCP alert), `npm run smoke:storage` (the rules, against production),
      `npm run eval:parser -- --offline` (the parser), and a `curl` of the live
      bundle for `VITE_SENTRY_DSN`. Each is one command; none of them is a tick.

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
