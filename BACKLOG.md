# BACKLOG

_Regenerated 2026-08-25 against the code, the feedback ledger and the CI config —
not against the previous backlog. Every "shipped" line below was checked in the
repo; every "not built" line is a grep that came back empty._

The file this replaces had grown into a chronological log of beta rounds with
stale checkboxes: sixteen items still showed open (HH-74, 78, 80–82, 92–102) that
the ledger records as **live and already deleted from App Store Connect**. That
history is not lost — `feedback/ledger.json` holds every report, decision and
outcome, and it is maintained automatically. This file is now only what is
*ahead*.

---

## Nothing is blocking

Beta feedback is at **zero open items**. All 124 reports are resolved; 18 sit in
App Store Connect awaiting the owner's deletion, which is bookkeeping rather than
work.

Migration phases 0–5 are complete and the shim is deleted. Read
`MIGRATION_STATUS.md` for history, **but do not trust its remaining-work notes** —
several describe problems since fixed (the member self-create bootstrap hole is
closed in `firestore.rules`; due-windows shipped as `lib/dueWindow.ts`).

---

## 1. Owner-only — nobody else can do these

| Item | Why it's blocked on you |
|---|---|
| Delete 18 resolved reports in App Store Connect | Destructive; the API key can't be trusted with it |
| Decide the fate of the v1 Supabase project | See §2 — it gates the last migration phase |

---

## 2. The v1 question, which decides Phase 6

**v1's Supabase host stopped resolving** (`ENOTFOUND`) and
`homehub-pied.vercel.app` returns 404. Everything Supabase-dependent is now
retired: the v1 e2e workflow is parked, v1's `CLAUDE.md` describes the repo as
the iOS shell it now is, and the spend-caps PR is closed as superseded.

What that leaves is one genuine decision, and it is **time-sensitive in one
direction only**:

- A **paused** Supabase project can be restored from the dashboard; a **deleted**
  one cannot. DNS looks identical either way, so the repo can't tell you which
  this is.
- `scripts/import/` (preflight → auth → firestore → storage → re-parse, with a
  runbook) is the only path from v1 data into v2. It is **kept deliberately** and
  is dead code until that project answers.

**If there is nothing in v1 you still want, say so and Phase 6/7 close out and
`scripts/import/` goes.** If there might be, check the Supabase dashboard before
the project ages out. Nothing else in this backlog depends on the answer.

---

## 3. Parse cost — the two levers, ranked by when they pay

Measured: **~$0.55 and ~4 minutes per manual** (42 pages, Sonnet 4.6). Cost
scales with **pages**, and roughly splits input/output ~55/45 — so page count
drives about half the bill and the structured output drives the rest.

For scale: 8 scans this month is about **$4.40**. The 20,000-unit monthly
ceiling is worth ~$1,100, which is a ceiling and not a forecast.

| # | Item | When it pays | Status |
|---|---|---|---|
| 3.1 | **Language-aware page selection** | **Now** — every manual, every user | Designed in part; see below |
| 3.2 | **Streaming partial results (design B)** | **After the golden corpus grows** — deferred 2026-08-26 | Blocked by schema order, not effort |
| 3.3 | **Shared parse cache** | **At volume** — deferred by the owner 2026-08-25 | `design/manual-sourcing-and-parse-cache.md` |

### 3.1 Language-aware page selection

**The instruction already exists and cannot save money where it sits.**
`shared/parse/parsePrompt.ts:36` tells the model *"Skip pages not in English"* —
but that is an instruction to the model, which means the whole PDF has already
been uploaded and billed as input tokens before any page is skipped. Skipping
after you have paid for the page saves output, not input.

To actually save, the pages must not be **sent**. That means selecting pages
before the API call:

1. Extract per-page text locally and detect its language. No API call, no cost.
2. Subset the PDF to the selected pages and send only those.
3. **Fall back to sending everything** whenever selection is uncertain — a
   trilingual manual whose maintenance section exists in only one language, or
   a layout that interleaves rather than blocks languages, must not lose
   content to a cost optimisation.

Expected saving on a trilingual manual: input drops to roughly a third, so
about **35% off the total**, not two thirds — output is nearly half the bill.

**The same step delivers the owner's language requirement** (2026-08-25): *"In
the future, I would want the flexibility for the parser to match the user's
preferred language, if the manual is translated in that preferred language."*
Once pages are language-tagged, selecting the user's preferred language instead
of English is a parameter, not new machinery. Build the detection with that in
mind — tag every page's language, then choose; do not hard-code English.

**Cost of building it:** there is no PDF library in `firebase/functions` today —
`countPdfPages` is hand-rolled byte parsing that returns null when unsure. Page
text extraction and subsetting need a real dependency (pdf-lib / pdfjs-dist).
This is a real piece of work, not a config change.

**Gate:** this changes what the model sees, so it goes through
`scripts/parse-eval/run.ts` against the goldens BEFORE deploy (non-negotiable
#5) — and the golden corpus is 7 files, which §5 already flags as too thin to
trust a parse change against. Grow the corpus first or the eval proves nothing.

### 3.2 Streaming partial parse results ("design B")

The scanning page that fills in row by row as the model finds each task — the
version the owner liked most in the round-15 mockups. **Deferred 2026-08-26, and
the reason is not effort.**

Roughly two to three days of build:

| Piece | Notes |
|---|---|
| Stream the Claude call | `messages.create` → `messages.stream`, consuming `input_json_delta` for the forced tool call |
| Incrementally parse partial JSON | Emit complete array elements from a truncated document. The fiddliest part |
| Write partial results | New field on the manual doc, debounced (~1/s) — not one Firestore write per task |
| Retry safety | `parseWorker` is `maxAttempts: 2`; a retry must clear partial state or the list double-appends |
| Client render | Small — `CareBlock` already has a mid-parse skeleton branch from HH-87 |

**What actually blocks it: the tool schema emits `chunks` before `tasks`.**
`EXTRACTION_TOOL` declares them in that order and the model emits in schema
order, so a streaming client would see **nothing for most of the scan and then
every task at once** — worse than the current state, and the opposite of what
design B is for.

Fixing that means reordering the schema, which changes what the model produces,
which puts it through `scripts/parse-eval/run.ts` against the goldens
(non-negotiable #5). **The corpus is 7 files** — §5 already flags that as too
thin to trust a parse change against. So the golden corpus is the real
prerequisite, not the streaming work.

**One honesty problem to settle before building it:** house rules are applied in
`commitDraft`, not at parse. A task streamed into view can be suppressed a minute
later — a row appears, then vanishes. Either apply the suppression client-side
while streaming, or accept it knowingly.

Design A shipped in the meantime (HH-135): one readable line, an indeterminate
rail, and the leave-is-safe promise cut to a clause.

### 3.3 Shared parse cache — deferred, not dismissed

**Owner, 2026-08-25: "the shared parse cache won't matter until I have more
volume."** Correct at one household. It changes shape as the beta grows, because
a manual is not personal — the same Zojirushi NS-LAC05 PDF is the same document
for every owner, and the architecture already splits the cacheable part
(`previewDraft`, the raw extraction) from the personal part (`commitDraft`,
which applies house rules, climate and per-user corrections).

Cost stops scaling with users and starts scaling with distinct appliances:

| | No cache | Shared cache |
|---|---|---|
| 1 home × 20 items | $11 | $11 |
| 10 homes × 20 items | $110 | $33 |
| 50 homes × 20 items | $550 | **$82** |

**Revisit when:** more than ~10 active households, or when two users first add
the same appliance model. Nothing else in the backlog depends on it.

---

## 4. Designed, approved, not built

These have design documents in `design/` and no implementation. Confirmed by
grep, not by the docs' own status lines.

| # | Item | Doc | Why it matters |
|---|---|---|---|
| 4.1 | **Brand registry + parse cache** | `design/manual-sourcing-and-parse-cache.md` | The unbuilt half of HH-107. Manual search still ranks results it has already judged poor; the registry supplies the manufacturer URL for the no-match state. The round-7 fix added a *badge* and the complaint came back — this is the fix that changes the outcome. |
| 4.2 | **Section-aware parser** | `design/section-aware-parser-proposal.md` | Parse quality at the source. Nothing in `shared/parse` implements it. |

---

## 4a. Pro tasks — flagging work that needs a technician (HH-152)

**Owner, 2026-09-05, on the dryer's duct-cleaning task:** *"In the manual,
cleaning out the ductwork specifically says to hire a qualified technician. How
can I flag tasks for scheduling a technician?"* Decided to the roadmap the same
day. Two halves, and they are not the same size.

**The half she asked for — a "Needs a pro" call.** `Assigned to` on the task
page offers Anyone or a household member (`RefinedTaskDetail.tsx:239–245`) and
nothing else. The product answer is a third option that hands the task to the
Providers tab, so "who does this" and "who to call" are one flow. **Mock first**
— it touches the task page, the Providers tab and probably the week lists.
Estimate 4–8 hours plus a design pass.

**The half underneath, which is the safety one.** The task row ALREADY renders a
**Pro** badge when a task's `actor` is `pro` or `hazardous` (`CareBlock.tsx`
`ScheduleRow`). This task did not get one: the manual says hire a technician and
the app handed her DIY steps. That is `classifyActorFromText` and the parse
taxonomy failing, not a missing button — and it is the pro-task safety model
(gas, combustion, electrical, ducting) doing the one thing it exists to prevent.
It goes through the parse-eval gate (`scripts/parse-eval/run.ts` against
goldens) before any prompt change ships. **This half does not wait on the flag,
and should be scheduled first.**

---

## 4b. The sample home — PARKED until the add-item flow and item page are final

**Owner, 2026-08-27:** *"I wanna be able to do a session to really think through
what a sample home should show and what would be helpful to the user versus just
bolting it on right now… Let's park this until we finalize and QA fully the add
item flow and the final item page."*

**Status:** deliberately not being worked. **Both** entry points are removed for
the duration (round 18) — the Inventory empty state's "See a sample home" button
and onboarding's "Not sure yet? Look around a sample home first". The route
survives and works by direct link.

That second removal has a real cost and it is recorded here so the redesign
carries it back: the onboarding screen now asks for a commitment before the
person has seen anything the product does, which is exactly what the escape
hatch was built to fix. Restoring it is a three-line change and the argument for
it has not stopped being true — it is waiting on a page worth linking to.
`HomeOnboarding.sample.test.tsx` pins both doors shut so neither returns by
reflex before then.

### What is known so far, so the session starts from evidence

Measured live on 2026-08-27, at 375×812:

| | |
|---|---|
| Images on the entire page | **0** |
| Manual citations rendered on arrival | **0** — conditionally rendered, not merely collapsed |
| Page-cited sources sitting unused in the fixtures | **4** |
| Scroll before the call to action | ~2 screens |

The product's claim — *photograph an appliance, Homehub reads its manual, these
jobs came from page 34* — is asserted in one line of prose and demonstrated
nowhere. `"Carrier Infinity 59MN7 manual, p. 34"` does not exist in the page
until a chevron is opened, so it is invisible to a skim, to search and to a
screen reader alike.

### Two open questions for the session

1. **A sample HOME or a sample ITEM?** My recommendation was the item page — the
   unit of value is the appliance, the proof (manual, citations) only exists
   there, and depth beats breadth for someone who has committed to nothing. Not
   decided.
2. **How much of it should be the real components?** `SampleHome.tsx` hand-rolls
   311 lines of its own layout, which is why it drifted from the app in the first
   place. Feeding fixtures through `RefinedItemDetail` would make it inherit
   every future change — but the file's own header warns against exactly that,
   and that warning needs checking rather than overruling.

### Do not resume before

The add-item flow and the item page are finalised and QA'd. Building a sample of
a design that is still moving is how it went stale the first time.

Mockups so far: https://claude.ai/code/artifact/395e50df-9925-4252-a6a2-4d46c19fa2f9

---

## 5. Parse quality — the loop is built, the curation isn't

The task-feedback loop (phases A–D) is complete and in production: chips, house
rules re-applied at parse, the `discussTask` callable with deterministic safety
pushback, and the weekly `graduateFeedback` job that promotes a pattern seen in
≥3 homes into a `parseEvalCandidates` doc.

**What that machine produces has no one consuming it.** Candidates are supposed
to route through the goldens harness (`scripts/parse-eval/run.ts`), and there are
**7 golden files** — enough to run, not enough to trust a prompt change against.

| # | Item | Shape |
|---|---|---|
| 4.1 | Work the graduated candidates | `npx tsx scripts/parse-eval/graduation.ts` reports them; each becomes a golden or a rejection with a reason |
| 4.2 | Grow the golden set | The corpus is the gate on every `parsePrompt.ts` change (non-negotiable #5). Feedback must never edit the prompt directly — that is what this harness is for |

---

## 6. Product items carried over from `backlog.json`

That file (April, tech listed as "Supabase") held 15 items, 11 shipped. These
four are the survivors, checked against the app as it is today. The JSON is
deleted — these are the only parts of it that were still true.

| # | Item | Note after checking |
|---|---|---|
| 5.1 | **Offline support** | Was deferred, and the case is stronger now: the app is a phone-first PWA in a native shell. `reference_firestore_fromcache_trap` in memory is the warning to read first — an offline `getDocs` resolves EMPTY from cache, and an empty result once drove "create a duplicate home". Any offline work starts by deciding what emptiness means. |
| 5.2 | **Seasonal / weather-aware maintenance** | **Partly done, and not tracked anywhere.** Climate facts (`freezeRisk`) are on the home profile and a freeze-free home already suppresses winterizing *at parse time*. What's missing is the surfacing half — seasonal timing on the agenda. Scope this against what exists rather than from scratch. |
| 5.3 | **Product walkthrough video** | Still a real gap and cheap now that the journey walks exist — `e2e/journey/` already drives all five core flows and screenshots every step. |
| 5.4 | **Logo legibility at small sizes** | `design/app-icon/` exists; unverified whether it superseded this. Check before scheduling. |

---

## 7. Test-surface gaps

| # | Item | State |
|---|---|---|
| 6.1 | **Visual baselines are not baked** | `e2e/visual/pages.spec.ts` exists; **zero `-snapshots` directories**. The visual suite cannot fail, so it currently proves nothing. Re-bake via the workflow — never commit local-platform pixels. (This is Phase 5's "fix E".) |
| 6.2 | ~~**The review WRITE is covered nowhere**~~ | **FIXED 2026-08-29, and the diagnosis above was wrong.** `e2e/emu/task-review.spec.ts` was already driving the write — it changes a cadence and a reminder and clicks Save. Its closing assertion, though, watched `"What is it?"` — a label inside the EXPANDED ROW, which the row's own Done button collapsed two lines earlier. It was already true before Save was clicked, so it observed nothing about saving. It now waits for the DIALOG to close (the only signal that `saveItemTaskReview` resolved without error), reloads, reopens the review and reads both edits back off the row. The write itself was verified sound against the emulator during this work — `scheduleType` and `remindEnabled` both land. The prescribed fix (add a maintenance task to the seeded dishwasher) was **not** taken: J3 deliberately covers the no-maintenance case that produced six reports, and seeding one away would have traded real coverage for a duplicate of what the emu spec already does. |
| 6.3 | `getInviteByToken` collectionGroup read rule | Deliberately deferred until sharing ships. Revisit when a non-member needs to resolve an invite link. |
| 6.4 | Parse watch-stages / snapshot tooling | Phase 3.3, explicitly optional. Only worth it if parse debugging gets painful again. |

---

## 8. Standing constraints (not tasks — read before proposing work)

- **Deploying is manual.** `ci.yml` is the only workflow; merging ships nothing.
  Hosting is `npx firebase-tools deploy --only hosting --project homehub-2068d`,
  and the iOS shell loads the live site, so that push is what reaches testers.
  Verify by grepping the production bundle, never by an exit code.
- **Functions deploys need explicit per-deploy approval**, separate from the
  standing merge/deploy authorization.
- **Native changes need a TestFlight upload** and can only be verified by
  unzipping the IPA. `scripts/ops/upload-testflight.sh` in the v1 repo refuses a
  checkout behind origin — it exists because a build shipped without its fix.
- **AI spend is capped**: 50 units/user/UTC-day, 20k/month app-wide
  (`shared/quota/policy.ts`), enforced across 12 paid callables. A refused parse
  now parks and retries itself rather than failing.
- The seven rules in `CLAUDE.md` under "Claiming something is done" are the
  bar for calling anything here finished.

---

## Where the history went

- **Every beta report, decision and outcome** → `feedback/ledger.json`, with the
  review page and Feedback HQ artifacts linked from it.
- **How v2 was built, phase by phase** → `MIGRATION_STATUS.md` (history is
  reliable; its forward-looking notes are not).
- **Strategic product direction** → `~/.claude/projects/…/memory/`, in particular
  the product-vision and principle notes.

## One review door skips the freeze-risk suppression

Found 2026-08-30 while triaging feedback with the code open, not from a report.

`TaskReviewSheet` takes `freezeRiskFalse`, which is what suppresses winterizing
work for a home that never freezes. **Two of its three callers pass it and one
does not**: `ReviewItemTasksButton` and `ParsePickupCard` do,
`src/pages/item-detail/ManualSection.tsx:589` does not — and that file has no
`useHomeProfile` at all, so it has nothing to pass. The prop defaults to
`undefined`, `correctDraft` then skips `applyHouseRules`, and freeze-prep tasks
render in the review on that door.

**Why it is worse than a cosmetic miss:** the server DOES apply house rules —
`commitDraft` calls `applyHouseRules` and has since the 2026-08-30 functions
deploy. So on this door the tasks are shown, the person saves them, and they are
silently dropped. That is the exact "shown in review then dropped at save" bug
the owner reported, still live on the one door that was missed.

This is the CLAUDE.md rule-6 shape one layer over: rule 6 was written about
`focus`, whose default was then made safe. `freezeRiskFalse` has an unsafe
default (`undefined` → suppression off) and three call sites. Either give it a
safe default that cannot silently disable a suppression, or have `ManualSection`
read the profile. The first is better — the same argument rule 6 already made.

Not yet triaged for effort; no tester has reported this door specifically.

## The product name is inlined in 18 user-facing strings

Raised by the owner 2026-08-27, while reviewing the onboarding tour: "if I have
to change the product name, I would want to pull this out."

There is no `APP_NAME` constant. "Homehub" is typed directly into 18 strings a
user can read — crash and feedback report titles, the monthly AI-budget notice,
the iOS camera-permission instructions ("Enable it in iOS Settings → Homehub →
Camera"), purchase-date and manual-parse explainers. A rename today means a
hand-audit of all of them, and the iOS one is worse than a find-and-replace
because it names a system UI path that changes with the app's display name.

Cheap half already done: both onboarding tour titles were rewritten to avoid
the name ("Welcome", "How we'll reach you"), and the voice guide now prefers
"we" to the product name wherever a sentence allows it.

The rest is a constant plus 18 substitutions — small, mechanical, and much
easier before a rename than during one. Not urgent while the name is settled.

## Ask cannot answer warranty questions, though the app knows the answer

Found 2026-08-27 while fact-checking onboarding copy, after the owner queried
whether manuals carry warranty terms. They do, and we parse them — the parse
schema has a top-level `warranty` object (duration_months, coverage,
exclusions, registration, contact) that populates the item's Warranty panel.

But `chatQuery` ranks and feeds **knowledge chunks**, and the parser's chunk
types are `care | how_to | troubleshooting | safety | specs`. There is no
warranty chunk type, so "what does the warranty cover?" searches a corpus that
structurally cannot contain the answer — while the answer sits on the same
item's page.

A user asking the obvious question gets a miss from a product that already
knows. Two candidate fixes: emit a warranty chunk at parse time, or let
chatQuery fall back to the item's warranty fields when the question is
warranty-shaped. The first is cheaper and keeps one retrieval path.

Not blocking; onboarding copy no longer promises it.

## ~~Controls stretch on desktop~~ — FIXED 2026-08-27 for the scan card; sweep still open

Owner, 2026-08-27, reading the add screen on a laptop: "there's just a very
wide space between scan the label, the text underneath, and then the carrot on
the right hand side."

Measured on the real component at both ends:

| viewport | card | content | dead space |
|---|---|---|---|
| 375 | 285px | 205px | 24px |
| 1440 | 526px | **205px** | **265px** |

The content does not grow at all. The card nearly doubles, `justify-between`
spends the entire difference on emptiness, and the chevron ends up 265px from
the thing it belongs to — eleven times the mobile gap. It reads as a layout
bug because it is one: nobody decided what the extra width was for.

### What the extra width should be for

Three legitimate answers, and stretching a control is none of them:

1. **More content per row** — a second column, a wider table.
2. **A longer measure** for prose, up to the 45–75 character comfort zone.
3. **More whitespace AROUND a capped block** — which is what a single-column
   form wants.

The add flow is (3). Its column already caps at `max-w-xl` (576px); the fault
is that controls inside the cap still stretch to fill it.

### `justify-between` is a contract, and this row breaks it

It says "both ends are meaningful and independent" — right for a settings row
where a label sits opposite its value. Wrong for a whole-card tap target,
where the chevron is an *attribute of the row*, not a second thing. Options,
cheapest first: cap the inner content and let the chevron follow the text; or
keep `justify-between` only above a width where the spread looks deliberate.

### The systemic version

`justify-between` appears in 43 component files. Only one is this exact
shape today (full-width row + trailing chevron), so this is a small fix now
and a growing one later — worth a sweep while it is still one instance.

### The right mechanism

Container queries, not breakpoints. A component should respond to the width of
its own container, not the viewport — the same scan card may later sit in a
sidebar, a modal, or a two-column desktop layout, and a `md:` breakpoint would
be wrong in all three. Tailwind v4 supports `@container` natively and
`components/ui/card.tsx` already uses it (`@container/card-header`), so the
primitive is present and unused elsewhere.

**Fixed for the scan card** (owner reversed the deferral the same day): a
`@min-[360px]:justify-start` container query on `IdentifyStep`'s appliance
column. 265px of dead space became 16px on desktop, 375pt is unchanged, and
`e2e/emu/desktop-gap.spec.ts` holds the gap under 16% of the card at 375, 390,
430, 600, 768 and 1440.

The 360px threshold was measured rather than picked. The first attempt used
`@sm` (384px) and the guard failed at 430 — a 79px gap, 23% of the card, on an
iPhone 15 Pro Max. The same defect in miniature, on a device testers hold,
which nobody would have reported because it only looks slightly loose.

**Still open: the sweep.** 43 files use `justify-between`; this was the only
row of this exact shape today, but the pattern will recur, and the container-
query mechanism now has one worked example to copy.

## ~~Journey suite fails 4/5 locally~~ — DIAGNOSED: tests were running against PRODUCTION

Found 2026-08-27 late. `npm run test:e2e:journey:emu` — a FRESH emulator stack
via `emulators:exec`, not the long-lived one — fails J2 through J5 with
`waitForURL` timeouts. The failure screenshot shows the sign-in screen with
`e2e@homehub.test` in the field, so the walks are not getting past login.

**It is not today's work.** Checked out `main` and ran the identical command:
4 failed, 1 passed, same shape. It reproduces without any round-18, add-flow
or tour change present, so it is this machine rather than the branch. Clearing
`e2e/.auth` did not help; the journey config has no auth setup project, so the
walks sign themselves in.

Earlier the same day the suite passed 5/5 repeatedly against a long-lived
stack, which is the opposite of the usual trap — normally the long-lived stack
is the one that lies. Whatever changed is in the host's emulator state or in
seed timing under `emulators:exec`, not in the app.

**Root cause, found 2026-08-28.** A stray `vite preview` had been listening on
port 5173 since before the session, serving a PRODUCTION-configured bundle
(`homehub-2068d`). `playwright.journey.config.ts` defaults to `PORT = 5173` with
`reuseExistingServer: !CI`, so every local run silently adopted it instead of
starting its own emulator-backed server. The walks then signed in as
`e2e@homehub.test` against **production auth**, where that user does not exist —
hence four timeouts on the sign-in screen. `PW_WEB_PORT=5399` → 5/5 pass.

**The part that needs a decision, not a fix.** J1 does not sign in, it signs
UP, with `journey-${Date.now()}@homehub.test`. Against production that
succeeds — so each of tonight's runs likely created a real account, and J1
walks on to create a home called "Journey Test Home". Worth checking prod for
`journey-*@homehub.test` users and stray "Journey Test Home" homes, and
deleting them. Deletion is the owner's to run.

**Both guards BUILT 2026-08-29.** A config that silently prefers whatever is on
a port will do this again, so both were taken rather than either:

1. **The port moved and reuse is off.** `WEB_PORT` in `e2e/seed-config.ts`
   defaults to **5273**, not Vite's 5173, and all five emulator-backed configs
   now set `reuseExistingServer: false`. With `--strictPort` a collision is a
   loud startup failure instead of a silent adoption. `PW_WEB_PORT` still
   overrides.
2. **The walks check the backend before they walk.**
   `e2e/assertEmulatorBackend.ts` reads `window.__HH_BACKEND_PROJECT__` — set
   dev-only in `src/integrations/firebase/app.ts` — and refuses anything but
   `demo-homehub`. It runs in a `beforeAll` in the journey walks and at the top
   of `auth.setup.ts`, which covers emu/a11y/device/visual too.

   The check is browser-side on purpose: a node-side env check is exactly the
   check that cannot catch this, because a suite that *adopts* someone else's
   server has no idea what that server is serving. Only the running page knows.
   A production build has no beacon at all, so `undefined` fails — inconclusive
   is treated as hostile.

**The stray process was still running when this was fixed** — `vite preview
--port 5173`, uptime 14 days, serving a `homehub-2068d` bundle. The guard was
verified by pointing it at that exact server and watching it refuse, rather
than by reasoning about it.
