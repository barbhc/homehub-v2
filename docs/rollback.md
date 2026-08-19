# Rollback — getting back to the last good version

**Written for 11pm, on a phone, when something is wrong and you are tired.**

Read the first section. Everything below it is detail you will not need most nights.

---

## The 60-second version

| What is broken | Do this | How long | Phone? |
|---|---|---|---|
| **The web app** (blank screen, broken page, bad release) | Firebase Console → **Hosting** → *Release history* → find the previous release → **⋮ → Rollback** | ~30s + ~1 min propagation | ✅ yes |
| **Spend is running away** | Firebase Console → **Functions** → `AI_MONTHLY_UNIT_CEILING` → set it low (see §3) | ~2 min | ✅ yes |
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

## 3. Spend kill switch (no deploy needed)

If the problem is money — a runaway loop, a stuck retry, an alert from Anthropic
or GCP — you can stop **every paid AI call in the app** without deploying
anything, by lowering the app-wide monthly ceiling below what has already been
spent this month.

1. Console → **Functions** → any function → **Edit** → *Runtime, build and
   connections settings* → **Environment variables**.
2. Set `AI_MONTHLY_UNIT_CEILING` to **`20`**.
3. Deploy the variable change (the console does this for you, ~2 min).

Every paid function then refuses with *"Homehub has hit its monthly AI budget.
This isn't something you did — please try again next month."* Reads, writes,
sign-in, and every already-parsed manual keep working — only new AI calls stop.

> ⚠️ **Do not set it to 0 or 1.** The quota rule treats a ceiling *below the cost
> of a single call* as misconfiguration, not exhaustion, and the user gets
> *"Usage accounting is misconfigured"* instead of an honest message. The most
> expensive single call is `enqueueParse` at 10 units, so **20 is the lowest safe
> value**. (`shared/quota/policy.ts` — `decideQuota`, the `invalid` branch.)

To restore: set it back to `20000`, or delete the variable to fall back to
`DEFAULT_MONTHLY_UNIT_CEILING`.

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

Afterwards, run the production canary — the Firestore emulator does not enforce
indexes, so a query can pass every local suite and still fail in production:

```bash
npx tsx scripts/ops/prod-smoke.ts
```

**If you cannot get to a laptop:** use the spend kill switch in §3 to stop the
paid functions, or accept the breakage until morning. A broken AI feature with a
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
- The 20-unit floor on the spend kill switch is read from `decideQuota`'s
  `invalid` branch and `AI_UNIT_COST.enqueueParse = 10`.
