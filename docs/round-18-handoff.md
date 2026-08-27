# Round 18 — live handoff

**Written 2026-08-27, mid-QA, because the working session was running out of
context.** Read this before touching anything on `feat/kind-first-review`.

---

## THE SITUATION, IN ONE PARAGRAPH

We are **in the middle of an owner-run QA pass** on an open **draft** PR. The
owner is testing a preview build in her browser and giving feedback in real
time; each piece of feedback becomes a change **on this branch, before the PR
merges**. Nothing here is finished work waiting to ship — it is work being
actively corrected by the person who will use it.

## THE ONE RULE THAT OVERRIDES THE STANDING ONE

`CLAUDE.md` grants standing authority to merge and deploy a green PR without
asking. **That does not apply to PR #185.** Owner, verbatim:

> "There are a lot of changes that you're proposing. So I really wanna make sure
> that this is branched off, and I have an opportunity to QA that branch before
> we merge that PR."

**Do not merge #185. Do not deploy it to the live channel.** It merges when she
says so and not before.

## THE SECOND RULE, WHICH WAS BROKEN ONCE THIS SESSION

**Mock design changes before building them.** This is rule 7 in `CLAUDE.md` and
a standing instruction of hers. It was violated once — PR #186 added a visible
control with no mockup, on the grounds that "add a way out of a dead end" felt
mechanical. It was still a control on a screen new users see. She noticed.

Anything with a visual result gets a mockup first, published as an artifact.

---

## WHERE THINGS STAND

| | |
|---|---|
| Branch | `feat/kind-first-review` — 9 commits ahead of main |
| PR #185 | **DRAFT, OPEN.** The round-18 work. Held for her QA. CI green. |
| PR #186 | Open, not draft, CI green. Adds `‹ Back` to `/sample`. Independent — **she may merge this whenever** |
| Preview | https://homehub-2068d--round18-qa-bval84kw.web.app — expires 2026-09-03 |
| Live | Untouched, still round 17. Verified by grepping the bundle, not by exit code |
| Verification | build · 1122 unit tests · emu 26 · a11y 17 · device 61 · journey 5, on **fresh** emulator stacks |

**Redeploy the preview after any change she should see:**

```bash
npm run build && npx firebase-tools hosting:channel:deploy round18-qa --project homehub-2068d --expires 7d
```

Then verify by **content**, never status code — the SPA rewrite returns 200 for
any path, which has produced a false "verified" twice in this session.

---

## HOW PAIR QA WORKS HERE

She is using the **browser inside the Claude desktop app** — the same Browser
pane these tools drive (`mcp__Claude_Browser__*`), *not* Chrome. Claude in
Chrome is not connected.

| Anytime, even with the pane hidden | Requires the pane visible on her side |
|---|---|
| `screenshot`, `read_page`, `javascript_tool`, console, network | clicking, typing, navigating |

So: **she drives, you observe and diagnose.** Clicks fail with "the Browser pane
is currently hidden" when she has switched away. This split is what makes the
loop fast — she spots things in seconds, you confirm the mechanism in one DOM
query instead of guessing.

**Her preview points at PRODUCTION Firestore** (same project). Anything she saves
is a real write to her real home ("SF Condo"). Never touch "My House" — that is
Sonia's.

---

## WHAT ROUND 18 IS, AND WHAT WAS DECIDED

### The origin

HH-142 ("Same old page", reported twice) and HH-144. Her microwave was the
argument: eleven rows across six tier sections, four holding two rows or fewer,
while six of the eleven were the same kind of job split three ways by importance.

She rejected **both** existing options — the long list *and* round 14's card:

> "I don't love round fourteen for HH-142 either. It really is unsatisfying as
> somebody who has just waited to see their manual scanned."

### Decisions — all settled, all built

1. **One review screen, grouped by kind**: Maintenance → Cleaning → Usage →
   Setup. **Setup sits below Usage**, at her explicit request.
2. **Importance is a rail, not a heading.** `SECTION_RAIL` and `TIER_RAIL` are
   separate maps — one map holding both is precisely how HH-140 happened.
3. **No maintenance = no Maintenance section.** No special screen, no card.
4. **Essential is the only notify-by-default.** Her call, 2026-08-27. Priority
   and interruption stay independent (the "descale the machine" case).
5. **The cadence chip is identical on every scheduled row**; the bell sits
   *beside* it, never inside. Colouring the chip makes cadences incomparable
   down the column. Uses lucide `bell-ring`, not an emoji.
6. **The summary states two channels separately.** Her correction, and the sharpest
   note of the session:

   > "instead of saying nothing here will remind you, I feel like that is
   > confusing because there are items that are scheduled to be reminded within
   > the app even if there's no notification."

   So: *"N show up in Tasks when they're due"* (always on) and *"N will also
   notify your phone"* (opt-in). She also rejected "come back in your tasks" as
   odd phrasing — it is now "show up in Tasks".
7. **The walkthrough survives**, speaking the same four words; reclassifying a
   row visibly moves it between sections.
8. **Three onboarding moments**: a tour step, a once-per-device first-review
   explainer, and a pre-permission gate that only fires when something actually
   wants to notify.

### Superseded rules, named in `docs/add-item-flow.md`

HH-121/127 ("with maintenance it opens; without, a card reports"), HH-119,
HH-120, HH-137's finding-first sentence. HH-85, HH-100, HH-134 and the safety
routing all survive with tests.

---

## THE BUG THE AUDIT FOUND — worth understanding, not just knowing

She asked for an audit *before* the build, worried this would create a second
review flow. It did not — `TaskReviewSheet` has three call sites differing only
in data source and save path. But the audit found this:

```ts
remindsByDefault(bucket: ReviewBucket) => bucket === "essential"
```

Three callers reached it three ways — the review passed a **bucket**, the task
page a raw **tier**, and `sendPush.ts` (the server that actually sends) a
converted tier. It worked only because three tier names and three of six bucket
names are the same word.

**Renaming the buckets would have made the review answer "no" for every task
while the server kept sending.** A screen saying nothing will notify you while
the phone buzzes.

I wrote the runtime test first, reintroduced the bug, and **it passed** — today
`reviewBucketFor` returns the tier for scheduled rows, so a bucket is
indistinguishable until the rename. **So it is typed instead**:
`remindsByDefault` takes `PriorityTierName`, and passing a bucket fails `tsc -b`.

Pinned by `src/lib/reviewBuckets.agreement.test.ts`. **If you are renaming
buckets and it goes red, the bug is real — do not relax the assertion.**

---

## THINGS ONLY FOUND BY LOOKING AT BUILT SCREENS

Every one survived a fully green suite, because in each case the wrong output is
still well-formed. This is the argument for screenshotting, not just testing.

| Found | By |
|---|---|
| Kind pill echoing its own section ("Maintenance" inside Maintenance) | screenshot |
| "adjust it on the next step" — pointing at a screen deleted 3 commits earlier | screenshot |
| "Seasonally", the one adverb among Weekly/Monthly/Quarterly/Yearly | screenshot |
| **The item page still had the old bell placement** (left of title) while the review had the new one | **she caught it, in a mockup I drew from the stale file** |
| `/sample` had no way out at all — one link, two screens down, and none in the native shell | **she caught it by trying to leave** |

---

## OPEN — NEEDS HER, OR NEEDS DOING

### 1. Approved by mockup, NOT BUILT — move the product lookup off the add screen

Artifact: https://claude.ai/code/artifact/d65f91c0-c096-40db-bb05-e35077b119a2

> "I think it's a distraction when somebody is adding an item… let's not confuse
> the user with this search that doesn't necessarily result in anything useful."

- Add-item loses **both** cards (identity + specs). The screen stops changing
  under you while you type.
- The lookup runs **on item creation**, in the background.
- Findings appear on the item page **inline on the field they belong to** —
  italic, greyed, with an Add affordance — plus one provenance line. Explicitly
  *not* a card announcing a find; she rejected that first attempt.
- Finding nothing shows nothing.
- **Also approved in the same mockup:** the Scan control keeps the exact shape it
  has today — icon tile, teal title, chevron, one muted line — and gains **one**
  short line ("Get the whole sticker in frame"). An earlier draft moved the whole
  tips paragraph onto the card and she rejected it as overcrowded: the location
  half already lives in the Model field's hint, so repeating it there was the
  redundancy that made the card feel heavy. The disclosure becomes **"If you
  can't scan the label"**, holding only the two real alternatives.
- **~11h, roughly half deletion.**
- **STILL HER CALL:** should the **name** still auto-fill in the background? The
  category should (visible and reversible on the item page). Silently renaming
  someone's item is the one change they would not expect.

### 2. Flagged, not fixed — CSP may be breaking Apple sign-in on the web

`firebase.json`'s CSP blocks `https://apis.google.com/js/api.js` on **live and
preview alike**. That script is Firebase Auth's gapi iframe, which
`signInWithPopup` and `signInWithRedirect` both need — and in
`AuthProvider.tsx` those are the **Apple sign-in** path on web. Both halves of
the fallback chain need the same blocked script.

Native iOS is unaffected (`signInWithAppleNative` via Capacitor), which is why
no tester has hit it.

**Verified:** the CSP blocks it; Apple's web path calls those functions.
**Not verified:** clicking "Continue with Apple" on the web end to end. Do that
before claiming it is broken. Fix is one line (`script-src`, probably
`frame-src` too) but it is a **security header on production auth** — its own
PR, with her awareness.

### 3. Parked by decision — the sample home redesign

`BACKLOG.md` §4b, with measurements (0 images, 0 citations rendered, 4 unused
page-cited sources) and two open questions.

> "I wanna be able to do a session to really think through what a sample home
> should show… park this until we finalize and QA fully the add item flow and
> the final item page."

Both entry points are removed for the duration; the route survives. **The
onboarding removal has a real cost recorded in the backlog** — that screen is
back to asking for commitment before showing anything — and the redesign is
expected to restore it.

### 4. Not built — the Settings line

*"7 tasks are set to notify you · See which ones"*. Needs a home-wide task
query, not the single line the mockup implied. Flagged rather than half-built.

---

## HOW SHE WORKS — observed, worth matching

- **Lead with the answer.** Bold the action. ~150 words. Detail belongs in
  commits and PR bodies, which she does read.
- **She catches drift by trying things**, not by reading diffs. Give her
  something to press.
- **She will challenge an estimate.** One was wrong this session — 3 days quoted
  by stacking two worst cases, when the two things I called expensive were the
  two I had not checked. Re-costed to 2 days from the code, then honestly back
  up to 3 as her questions found real work.
- **Say what was not done.** Every message that claims completion should name
  what is still open.

---

## FILES THAT CARRY THE AGREEMENT

| File | What it is |
|---|---|
| `docs/add-item-flow.md` | **The canonical spec.** Check any add-item change against it; amend it in the SAME PR; name supersessions |
| `feedback/ledger.json` | Every report, decision and thread. HH-142 and HH-144 carry this round's full conversation |
| `BACKLOG.md` §4b | The parked sample-home work |
| `src/lib/reviewBuckets.agreement.test.ts` | The three-way notification check |
| `scripts/seed-emulator.ts` → `seedUnreviewedManual` | The read-but-unsaved manual that made five previously-untestable states reachable. **Do not stamp its `parsedAt`** to make something else pass |
