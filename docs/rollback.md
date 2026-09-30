# Rollback — getting back to the last good version

**Written for 11pm, on a phone, when something is wrong and you are tired.**

Read the first section. Everything below it is detail you will not need most nights.

---

## The 60-second version

| What is broken | Do this | How long | Phone? |
|---|---|---|---|
| **The web app** (blank screen, broken page, bad release) | Firebase Console → **Hosting** → *Release history* → find the previous release → **⋮ → Rollback** | ~30s + ~1 min propagation | ✅ yes |
| **Spend is running away** | Firebase Console → **Firestore** → `config/spend` → set `monthlyCeilingUnits` to **0**; if Claude calls still go out, Anthropic Console → **API keys** → disable Homehub's key (see §3) | ~1 min, instant effect | ✅ yes |
| **Data is being exposed** (rules mistake) | Firebase Console → **Firestore → Rules** → *History* → pick the previous version → **Publish** | ~1 min | ✅ yes |
| **A Cloud Function is broken** | Needs a laptop — see §4 | ~5–8 min | ❌ no |
| **The iOS build is broken** | App Store Connect → TestFlight → expire the build (see §5) | ~2 min | ✅ yes |

> **The single most important fact on this page:** the web app and the iOS app
> serve the *same* bundle. The Capacitor wrapper loads the live site, and
> `firebase.json` sets `Cache-Control: no-cache` on the HTML shell. So a Hosting
> rollback fixes the iOS app too, on the tester's next launch — you do **not**
> need an App Store review to undo a bad front-end release. This is the fastest
> lever you have and it is worth knowing before you need it.

---

## 1. Web app — Hosting rollback

### From a phone (preferred at 11pm)

1. Open **console.firebase.google.com** → project **Homehub** (`homehub-2068d`).
2. **Hosting** in the left nav (tap the ☰ menu first on mobile).
3. Scroll to **Release history**. Each row is a deploy, newest first.
4. On the row you want to go back to: **⋮** → **Rollback** → confirm.

Firebase re-serves that exact version's files. Nothing is rebuilt, so there is no
build to fail and nothing to get wrong.

**Then verify** — do not skip this, a rollback that did not take is worse than
knowing you still have a problem:

- Open https://homehub-2068d.web.app in a **private/incognito tab** (your normal
  tab may hold a cached shell).
- Confirm the broken thing is gone.

### From a laptop

```bash
firebase hosting:channel:list --project homehub-2068d
```

There is **no `firebase hosting:rollback` command** in firebase-tools (checked on
15.23.0 — do not go looking for it at 11pm). The CLI equivalent is a re-deploy of
a known-good commit:

```bash
git checkout <last-good-sha> && npm ci && npm run build && firebase deploy --only hosting --project homehub-2068d
```

That is slower than the console rollback and can fail at the build step. **Use the
console.**

---

## 2. Finding the last good version

You need one thing: the commit that was live before the bad one.

```bash
git log --oneline -15 main
```

`main` is what is deployed, so the previous release is almost always the commit
before the one you just merged. Hosting's *Release history* also timestamps every
deploy — match the timestamp to the commit.

If you genuinely cannot tell which release was good, roll back **two** releases.
Being one version staler than necessary costs nothing; guessing wrong and staying
broken costs the night.

---

## 3. Spend kill switch

If the problem is money — a runaway loop, a stuck retry, an alert from Anthropic
or GCP — you can stop **every paid AI call in the app** without deploying
anything. The caps live in one Firestore document, `config/spend`, which every
paid call reads inside the transaction that charges it — so a change takes
effect on the very next call, in every function at once. The Anthropic key is
the second lever, for when our own code is what is going wrong (below).

### The switch (phone, ~1 minute, stops every paid call)

**From a phone (the console):**

1. Firebase Console → **Firestore Database** → **Data** → collection `config` →
   document `spend`.
2. Set the field `monthlyCeilingUnits` to **`0`** (a *number*, not the text
   "0" — though text fails safe too: any value the code cannot read as a whole
   number is treated as 0). If there is no `spend` document yet, add it with
   just that field; every other number falls back to its code default.
3. Save. That's it — no deploy.

**From a laptop:** `npx tsx scripts/ops/set-spend-config.ts kill --prod --project=homehub-2068d`

It stops all fifteen functions that charge AI units — `enqueueParse`,
`retryAwaitingCapacity`, `chatQuery`, `ocr`, `detectDocType`,
`ingestReference`, `generateTasks`, `classifyExistingTasks`, `discussTask`,
`proposeReminders`, `suggestCareNotes`, `importCareUrl`, `productLookup`,
`findManual`, `searchProductImages` — so the Brave Search and Google Vision
calls behind some of them stop too, not only Claude.

Every paid function then refuses with *"Homehub has hit its monthly AI budget.
This isn't something you did"* — a manual scan adds *"your manual is saved and
queued"* (it parks, and `retryAwaitingCapacity` starts it once the switch is
off), and everything else adds *"AI features are paused for now."* Reads,
writes, sign-in, and every already-parsed manual keep working — only new AI
calls stop.

**What it does not stop:** a scan that was already queued or running when the
switch was thrown. It was charged when it was queued, the worker does not
check the switch again, and it finishes (and bills) as normal.

**0 is the documented value now.** Until 2026-09-30 a ceiling of 0 read as
*"Usage accounting is misconfigured"*, which is why this page used to say "never
below 20"; `decideQuota` now reads 0 as the kill switch.

**To restore:** set `monthlyCeilingUnits` back to its previous value —
`npx tsx scripts/ops/set-spend-config.ts show --prod --project=homehub-2068d`
prints the document; the code default is **1,500**
(`scripts/ops/set-spend-config.ts ceiling 1500 --prod --project=homehub-2068d`).
Parked scans start on the next hourly `retryAwaitingCapacity` run (up to 25 a
run); one parked for more than three days ends as an error the manual card can
restart.

### The key (phone, ~1 minute, stops every Claude call)

For when the switch is thrown and Claude calls are still going out — a bug in
our own accounting, or a paid call added without a charge. It does not depend
on any of our code being right.

1. **console.anthropic.com** → the workspace Homehub's key lives in → **API keys**.
2. Find the key the functions use (Secret Manager name `ANTHROPIC_API_KEY`) and
   **disable** it. Prefer disable over delete if the console offers it:
   re-enabling a disabled key restores everything with no deploy.

Anthropic then refuses every new Claude call from every function, whatever
version of the code is running. A request Anthropic had already accepted may
still finish, and bill.

**What it does not stop:** Brave Search (Find manual, product images, product
lookups, Ask's web search) and Google Vision (label OCR) use their own keys.
They cost cents, not dollars; the switch above stops them, or revoke them in
their own consoles if they are what is running away.

**What people see:** every AI feature fails with its usual error ("Reading the
manual failed on our side. Try again in a minute…" for a scan). Everything
else — reads, writes, check-offs, sign-in, already-parsed manuals — keeps working.

**Parses in flight** (checked in the code, 2026-09-30, after the parse hardening):

- A parse that reaches its Claude call after the key is off fails once: the
  manual goes to `error` and is not retried. A refused key is a permanent
  failure; only timeouts, rate limits and 5xx get the one Cloud Tasks retry
  (`parse/errorClass.ts`, `parseWorker`).
- **Its 10 units are refunded.** The charge is recorded in the server-only
  ledger `parseCharges/{requestId}`, and `runParse` refunds it whenever Claude
  never answered (`refundParseCharge` in `lib/parseCharges.ts`). "Try again"
  charges and refunds again until the key is back — no units lost and no
  money spent, though each attempt still counts toward the day's scan cap
  (`scansPerDay`, 50 by default).
- Interactive calls (Ask, OCR, lookups, generate, discuss…) hand their units
  back when the call fails (`withAiQuota` / `hold.refund()` in `lib/quota.ts`).

**To turn it back on:** re-enable the key — nothing else. If it was deleted:
create a new key, `firebase functions:secrets:set ANTHROPIC_API_KEY --project
homehub-2068d`, then redeploy the functions that declare it (a function uses
the secret version current at its last deploy). That needs a laptop, and it is
a functions deploy.

### The env var — a per-function brake, not a switch (laptop + a functions deploy)

`AI_MONTHLY_UNIT_CEILING` used to be this page's kill switch, and it never was
one: functions are 2nd gen, each its own Cloud Run service with its own
environment, and each paid function reads the variable from ITS OWN
environment (`envMonthlyCeiling()` in `shared/quota/policy.ts`) — setting it
"on any function" stopped that one function and left the rest paying. It now
only **lowers** the ceiling of the function it is set on
(`effectiveMonthlyCeiling` takes the smaller of it and the document's value):
it can never raise the document's value or lift the switch, and it ignores `0`
(logged) — zero is the document's job. Any positive whole number at or below
this month's spend (`aiSpendGlobal/{yyyy-mm}.units`) stops that function with
the budget message. You should not need it; if you do, one line sets it on all
fifteen:

```bash
cd ~/Projects/Homehub/homehub-v2
echo "AI_MONTHLY_UNIT_CEILING=<units>" >> firebase/functions/.env.homehub-2068d
firebase deploy --only functions --project homehub-2068d
```

Hand-editing each function in the Cloud console (**Edit** → *Runtime, build and
connections settings* → **Environment variables**) also works, fifteen times —
but the next `firebase deploy --only functions` replaces every function's
variables with what the `.env` files say (firebase-tools 15.23.0,
`updateFunction`), so a console-only value silently disappears then. To remove
it: delete the line and deploy again.

---

## 4. Cloud Functions rollback (laptop required)

Firebase does **not** offer a functions rollback button. There is no phone path
here — this is the one thing on this page you cannot do from bed.

```bash
cd ~/Projects/Homehub/homehub-v2
git checkout <last-good-sha>
npm ci --prefix firebase/functions
firebase deploy --only functions --project homehub-2068d
```

The `predeploy` hook bundles `shared/` into the functions build automatically, so
there is no extra step for shared code.

To deploy a single function rather than all of them (faster, smaller blast
radius):

```bash
firebase deploy --only functions:chatQuery --project homehub-2068d
```

**Faster, no rebuild — shift traffic back to the previous revision.** Every
gen-2 function is a Cloud Run service that keeps its earlier revisions. Record
the serving revision of each function BEFORE a functions deploy, so there is
something to go back to:

```bash
gcloud run services list --project homehub-2068d --region us-central1        # service names
gcloud run revisions list --service <service> --project homehub-2068d --region us-central1
# back to the one that was serving before:
gcloud run services update-traffic <service> --to-revisions <revision>=100 \
  --project homehub-2068d --region us-central1
```

This moves requests only. The old revision runs its own code and settings, but
what lives outside the service — Cloud Scheduler jobs, the Cloud Tasks queue's
retry settings — stays as the latest deploy set it, and the next `firebase
deploy` of that function routes 100% to a new revision again. Use it to stop the
bleeding; then redeploy the last good SHA as above.

Afterwards, run the production canary — the Firestore emulator does not enforce
indexes, so a query can pass every local suite and still fail in production:

```bash
npx tsx scripts/ops/prod-smoke.ts
```

**If you cannot get to a laptop:** throw the spend switch (§3 — one Firestore
field) to stop the paid AI calls, disable the Anthropic key (§3) if the broken
function is still calling Claude anyway, or accept the breakage until morning. A broken AI feature with a
visible error is survivable overnight; a data or money problem is not.

---

## 5. Rules rollback (Firestore / Storage)

Both have version history in the console, and both are phone-capable.

- **Firestore:** Console → Firestore Database → **Rules** → **History** tab →
  select an earlier version → **Publish**.
- **Storage:** Console → Storage → **Rules** → same flow.

From a laptop, deploy the rules from a known-good commit:

```bash
git checkout <last-good-sha> -- firestore.rules storage.rules
firebase deploy --only firestore:rules,storage --project homehub-2068d
```

> ⚠️ **After any Storage rules rollback, re-run the post-deploy smoke check in
> `docs/launch-readiness.md`.** The membership gate uses a cross-service
> `firestore.exists()` call that the Storage emulator cannot resolve, so it is
> only ever proven in production: sign in, open an item, upload a photo, and
> confirm it renders. If it does not, `getDownloadURL` is failing and you have
> traded one problem for another.
>
> ⚠️ **Never widen a rule to make a symptom go away.** Rolling back to a
> previously-published version is fine. Editing a rule live to unblock a query is
> how the tenant-isolation hole stayed open — fix the query instead.

---

## 6. iOS / TestFlight

Because the wrapper loads the live web app (§1), **most** iOS problems are fixed
by a Hosting rollback and a relaunch. Reach for this section only when the broken
thing is *native*: a Capacitor plugin, push registration, the splash screen, or a
crash on launch.

1. **App Store Connect** → your app → **TestFlight** → **iOS builds**.
2. Select the bad build → **Expire Build**.

Testers can no longer *install* it. **An expired build stays installed on phones
that already have it** — this is the honest limitation. To get testers onto a good
build you must ship a new one (build, upload, wait for processing, ~15–30 min),
and tell them to update.

So: if the native layer is broken for testers who already installed it, the fast
mitigation is still the web layer — roll Hosting back to a version that works
inside the wrapper, and ship the native fix at normal speed.

---

## 7. After any rollback — the part that is easy to skip

1. **Say so.** Post in the tester group: what broke, that it is rolled back, and
   whether they should do anything. Silence reads as "still broken".
2. **Write down what happened** while it is fresh — in the PR that caused it, or
   in `docs/beta-feedback.md`.
3. **Do not re-merge the reverted change until the cause is understood.** A
   rollback buys time; it does not fix anything.
4. **Check `docs/launch-readiness.md` for an accepted risk whose precondition
   just changed.** If tonight's incident proved an assumption wrong, that document
   is where the assumption is written down, and it does not re-read itself.

---

## Verified 2026-08-19

- Hosting site is `homehub-2068d`, live channel, no preview channels configured.
- `firebase hosting:rollback` does **not** exist in firebase-tools 15.23.0. The
  console is the rollback path; the CLI path is a re-deploy.
- `firebase.json` sets `Cache-Control: no-cache` on the HTML shell, which is what
  makes a Hosting rollback reach the iOS WKWebView on next launch instead of up to
  an hour later.
- ~~The 20-unit floor on the spend kill switch~~ — superseded 2026-09-30: the
  kill switch is `config/spend.monthlyCeilingUnits: 0`, read by `decideQuota`
  as "global" (see §3); `firebase/functions/test/quota.emu.test.mjs` pins it.

## Re-checked 2026-09-30 (§3 rewritten, then moved onto `config/spend`)

- The fifteen charging functions are every caller of `chargeAiQuota` /
  `withAiQuota` in `firebase/functions/src`. Each reads `config/spend` inside
  its charge transaction (`lib/quota.ts`), so the document is app-wide and
  needs no deploy; `AI_MONTHLY_UNIT_CEILING` is read per function
  (`envMonthlyCeiling()`) and can only lower that function's ceiling.
- firebase-tools 15.23.0 `gcp/cloudfunctionsv2.js` `updateFunction` patches
  `serviceConfig.environmentVariables` as a whole on every deploy — a variable
  set only in the console does not survive the next functions deploy.
- ~~A parse's 10 units are charged in `enqueueParse` and never refunded by
  `parseWorker`/`runParse`~~ — superseded the same day: the charge is recorded
  in `parseCharges/{requestId}` and refunded when Claude never answered
  (`runParse`) or was never called (the stalled-parse sweep). Interactive AI
  calls refund on failure.
- The Anthropic key is the `ANTHROPIC_API_KEY` secret, declared by `parseWorker`
  and the `ai/*` functions. Brave Search and Google Vision have their own
  secrets (`BRAVE_SEARCH_API_KEY`, `GOOGLE_VISION_API_KEY`).
- NOT verified from here: whether the Anthropic console offers "disable" as
  well as "delete" for a key, and how fast a revoked key is refused.
