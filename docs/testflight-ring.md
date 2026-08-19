# TestFlight ring — 5–10 users, two weeks

The first ring of people who are not Barb. The purpose is **not** "get feedback";
it is to answer one question: **is this safe and good enough to widen?**

So it has an explicit go/no-go at the end, and numbers decided *before* the ring
starts — because a threshold picked afterwards is just a description of whatever
happened.

---

## Before you invite anybody

Everything here is a gate, not a suggestion. A ring that starts with these
undone produces data you cannot act on.

- [ ] **Anthropic spend alert + hard limit set.** `docs/launch-readiness.md` →
      *Vendor-side spend alarms*. The GCP budget is already live and does **not**
      cover the model bill.
- [ ] **You can see spend per user.** `aiSpendGlobal/{yyyy-mm}` holds app-wide
      units and `fns.<fn>.charged` / `.failed`; `usage/{uid}/daily/{day}` holds
      per-user units. Read them once *now* so you know what normal looks like
      before you have nine people to compare against.
- [ ] 🚨 **Wire Sentry. It is currently OFF in production.** Verified
      2026-08-19 by downloading the live bundle from
      `https://homehub-2068d.web.app`: it contains the PostHog key but **no
      Sentry DSN**. `src/main.tsx:42` reads `VITE_SENTRY_DSN`, and that variable
      is empty in `.env`, so `Sentry.init` never runs and nothing is captured.
      `docs/launch-readiness.md` lists Sentry under *"already in good shape —
      don't redo"*, which is how this stayed invisible.
      **Set `VITE_SENTRY_DSN`, rebuild, redeploy, then trigger one real error on
      the live site and confirm it arrives.** Every "watch Sentry" row below is
      watching nothing until this is done — and "no errors reported" from an
      un-wired Sentry looks exactly like a healthy ring.
- [ ] **Analytics funnel fires.** `sign_up → home_created → first_item_added →
      item_content_viewed → task_checked`. Without these, "where onboarding drops
      people" is unanswerable and this ring's main question goes unanswered.
- [ ] **The feedback button works end to end** — tap it, receive the mail.
- [ ] **`npx tsx scripts/ops/prod-smoke.ts` passes** against production.
- [ ] **Rollback rehearsed once.** Do a Hosting rollback and roll forward again,
      on a normal evening, so the first time is not the emergency. `docs/rollback.md`.
- [ ] **A "what to test" note written** — 3–5 focus areas and the known rough
      edges. Testers who are told what is unfinished report the interesting
      things; testers who are not report the unfinished things.

---

## Who to invite

**5–10 people, and no more.** The number is a cost control as much as a research
one: 10 people at the 50-unit daily cap is 500 units/day against a 20,000/month
ceiling, so a bad week from a full ring cannot exhaust the budget. It is also
roughly the number whose feedback one person can actually act on in two weeks.

Aim for a mix, because the failure modes differ:

| Who | What they surface |
|---|---|
| 2–3 who are comfortable with new apps | depth — they will reach the parse flow and the task feed |
| 2–3 who are not | the onboarding truth. **This is the point of the ring.** |
| 1–2 with an older/small phone | layout breaks the device matrix missed |
| 1–2 with a house full of appliances | volume — the failure modes that only appear at 30 items |

Invite in **two waves**: 3 people on day 1, the rest on day 3 or 4. If something
is badly wrong, you find out with three people inconvenienced instead of ten.

---

## What to watch, and how often

### Daily (5 minutes)

| Signal | Where | What is fine | Escalate when |
|---|---|---|---|
| **Sentry volume** | Sentry issues, last 24h | 0–2 new issues/day, none affecting >1 user | any issue hitting **≥2 distinct users**, or **>5 new issues in a day** |
| **Crash-free sessions** | Sentry | ≥ 99% | < 98% |
| **App-wide spend** | `aiSpendGlobal/{yyyy-mm}.units` | < 400 units/day across the ring | > 800 units/day, or > 40% of the monthly ceiling before week 2 |
| **Per-user spend** | `usage/{uid}/daily/{day}.units` | ≤ ~30 units/day for an active user | any user at the 50-unit daily cap **two days running** — that is a loop or a confused user, and both need a look |
| **Rate-limit hits** | function logs, `rate_limited` | occasional | a user hitting it repeatedly ⇒ a client retry bug, not impatience |
| **Function failure rate** | `aiSpendGlobal.fns.<fn>.failed` ÷ `.charged` | < 5% | > 15% on any function |

### Every 2–3 days (20 minutes)

- **Onboarding funnel.** For each tester: did they reach `first_item_added`? Then
  `task_checked`? **The step with the biggest drop is the ring's single most
  valuable output** — more than any individual complaint.
- **Parse quality on real manuals.** Their appliances are not the corpus's. Open
  two or three parsed items and read the tasks as a homeowner would. If something
  is wrong, it belongs in `evals/manual-parser/corpus/` — a complaint you cannot
  reproduce next month is a complaint you will fix twice.
- **Feedback inbox.** Reply to every message, even a one-liner. A tester who
  hears nothing stops writing.

### Weekly

- Re-read this document's go/no-go criteria against what you actually have.
- Re-read the **accepted risks with preconditions** in
  `docs/launch-readiness.md`. A ring changes preconditions — sharing, invites and
  real multi-user data all become true during it, and the tenant-isolation hole
  stayed open for four weeks precisely because nobody re-read that line when the
  condition changed.

---

## Week 1 vs week 2

**Week 1 — does it work?** Expect bugs. Fix and ship daily; a tester who reports
something and sees it fixed in a day reports the next thing. Do not start counting
retention yet; you are still changing the product underneath them.

**Week 2 — do they come back?** Change as little as possible. This is the only
clean signal you get, and shipping through it destroys the measurement.

---

## Go / no-go — decide with these, not with a feeling

Run this at the end of week 2.

### GO — widen the ring

All of these:

- [ ] **≥ 60% of testers completed the funnel** (signed up → created a home →
      added an item → checked off a task). 6 of 10.
- [ ] **≥ 40% returned on a day after their first** — someone came back without
      being asked.
- [ ] **Crash-free sessions ≥ 99%** across week 2.
- [ ] **No unresolved Sentry issue affecting ≥ 2 users.**
- [ ] **Spend per active user ≤ 25 units/day averaged over week 2**, and the
      month's total tracking under 50% of the ceiling.
- [ ] **No security or privacy incident**, and no accepted-risk precondition
      quietly expired.
- [ ] **At least 3 testers said something specific and positive** — not "nice
      app", but naming a thing it did for them. Fewer than 3 means the product may
      work and still not matter.

### NO-GO — fix first, ring again

Any one of these:

- [ ] **< 40% completed the funnel.** Onboarding, not scale, is the problem.
- [ ] **Two or more testers stopped after the first session and could not say
      why.** The worst signal there is, and the easiest to explain away.
- [ ] **Any tester lost data** — an item, a task, a photo. Non-negotiable.
- [ ] **Spend per user > 40 units/day**, or the ceiling was hit at all. Ten
      people cannot become a hundred at that rate.
- [ ] **The parse produced something unsafe** — a homeowner DIY instruction on a
      gas or electrical job. Fix the prompt, add the manual to the eval corpus,
      re-baseline, and only then widen.
- [ ] **Crash-free < 98%**, or a crash nobody could reproduce.

### The honest middle

Most rings land here: it mostly works, two people loved it, one never got past
the second screen. **Do not widen on "mostly".** Pick the single biggest funnel
drop, fix that one thing, and run a second ring with 5 new people. A second ring
is cheap. A hundred people meeting the same broken second screen is not — you only
get one first impression per person, and you will have spent a hundred of them.

---

## Closing the ring

Whatever the verdict:

1. Write the outcome into `docs/launch-readiness.md` — the numbers, not a vibe.
2. Add every parse complaint you could reproduce to
   `evals/manual-parser/corpus/expectations/`, and re-baseline. That is how a
   ring's findings survive past the week you had them.
3. Thank the testers and tell them what you changed. They are the only people who
   have seen this thing besides you.
