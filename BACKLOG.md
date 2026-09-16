# BACKLOG

_Regenerated 2026-09-16 against the code, the feedback ledger and the CI config —
not against the previous backlog. Every line below was checked in the repo
before it was ranked; every "closed" line names what was found. The previous
regeneration was 2026-08-25._

Since then, twelve of the previous file's items closed: eight on their own
(shipped by other work, or the premise no longer held) and four today
(#207–#210). Two got worse than recorded — the product name is now inlined
in **21** user-facing strings, not 18, and `justify-between` is in **47**
component files, not 43. They are all in "Closed since 2026-08-25" at the
bottom, one line each, with what verified them.

---

## Nothing is blocking

Beta feedback is at **zero open items**: 157 decided, 107 deleted from App
Store Connect, **49 awaiting the owner's deletion** (bookkeeping), one on the
roadmap (HH-152's product half, §4a).

Migration phases 0–5 are complete and the shim is deleted. Read
`MIGRATION_STATUS.md` for history, **but do not trust its remaining-work notes**.

---

## 1. Ranked — what to do next

Priority = (Risk + Impact) / Scope. Risk: what happens if we don't (5 = data
loss / broken core). Impact: how much it improves the product. Scope: 1 =
under half an hour … 5 = a week. Ties break security > data > UX > polish.

| # | Item | Risk | Impact | Scope | Score | Why it ranks here |
|---|---|---|---|---|---|---|
| 1 | **Grow the golden corpus** (§5) | 3 | 4 | 3 | 2.3 | Still 7 files. Gates #7, #8, #12 and the prompt half of HH-152; nothing parse-related ships safely until it grows. |
| 2 | **One high CVE** — `@xmldom/xmldom` via `@capacitor/cli` → `plist` | 1 | 1 | 1 | 2.0 | Build tooling only; not in the client bundle (0 chunks reference it). `npm audit fix` clears it. |
| 3 | **Bake visual baselines** (§7) | 2 | 2 | 2 | 2.0 | Zero `-snapshots` directories, so the visual suite cannot fail and proves nothing. |
| 4 | **"Needs a pro" hand-off to Providers** — HH-152's product half (§4a) | 2 | 3 | 3 | 1.7 | Owner's 2026-09-05 roadmap decision. Mock first. |
| 5 | **Walkthrough video** from the journey screenshots (§6) | 1 | 2 | 2 | 1.5 | `e2e/journey/` already captures every step of all five flows. |
| 6 | **`APP_NAME` constant** — 21 inlined strings | 1 | 2 | 2 | 1.5 | Mechanical; only urgent if a rename is coming. |
| 7 | **`justify-between` sweep** — 47 files | 2 | 2 | 3 | 1.3 | One instance fixed with a container query; wait for a second before sweeping. |
| 8 | **Brand registry** — the unbuilt half of HH-107 (§4) | 2 | 3 | 4 | 1.25 | Fixes the manual-search complaint that came back; no tester has raised it since. |
| 9 | **Language-aware page selection** (§3.1) | 1 | 3 | 4 | 1.0 | ~35% off parse cost; blocked on #1. |
| 10 | **Streaming partial parse** (§3.2) | 1 | 3 | 4 | 1.0 | Blocked on #1 and a schema reorder. |
| 11 | **Offline support** (§6) | 2 | 3 | 5 | 1.0 | Starts with deciding what an empty cache read means. |
| 12 | **Split `Settings.tsx` (1,754 lines) and `IdentifyStep.tsx` (1,223)** | 1 | 2 | 3 | 1.0 | Maintenance only. |
| 13 | **Section-aware parser** (§4) | 1 | 3 | 5 | 0.8 | Biggest parse-quality lever, biggest scope, blocked on #1. |

**Do now:** #1, because it unblocks four others. Then #2 and #3 in the same
sitting — both under an hour.

---

## 2. Owner-only — nobody else can do these

| Decision | Note |
|---|---|
| **Approve the `chatQuery` functions deploy** (#210) | Merged to `main`; nothing reaches Ask until `firebase deploy --only functions:chatQuery`. Standing rule: functions deploys are per-deploy approval. |
| Delete 49 resolved reports in App Store Connect | Destructive; the API key can't be trusted with it. |
| **Unpark the sample home?** (§4b) | Its stated precondition — a final add-item flow and item page — is now met (#161–#163, #200). The session it was waiting for can be scheduled. |
| Decide the fate of the v1 Supabase project (§2a) | A paused project can be restored; a deleted one cannot. `scripts/import/` waits on this. |
| Invite gate ON or OFF for new testers | Wired: `firestore.rules` + `growthGate.ts` read `config/growth.inviteGateEnabled`. The switch is a config document, not code. |
| Prune 4 stale worktrees | `.claude/worktrees/{nifty-shtern,wizardly-williamson}` (detached) and `~/Projects/homehub-v2-{security,spend-caps}`. Both branches shipped (#94, #91); nothing unmerged. |

### 2a. The v1 question

**v1's Supabase host stopped resolving** (`ENOTFOUND`) and
`homehub-pied.vercel.app` returns 404. Everything Supabase-dependent is
retired. One genuine decision remains, **time-sensitive in one direction**:

- A **paused** Supabase project can be restored from the dashboard; a **deleted**
  one cannot. DNS looks identical either way, so the repo can't tell you which.
- `scripts/import/` (preflight → auth → firestore → storage → re-parse) is the
  only path from v1 data into v2. Still present (5 scripts), still dead code
  until that project answers.

**If there is nothing in v1 you still want, say so and `scripts/import/` goes.**

---

## 3. Parse cost — the two levers, ranked by when they pay

Measured: **~$0.55 and ~4 minutes per manual** (42 pages, Sonnet 4.6). Cost
scales with **pages**, split input/output ~55/45.

| # | Item | When it pays | Status |
|---|---|---|---|
| 3.1 | **Language-aware page selection** | **Now** — every manual, every user | Designed in part; blocked on the corpus (§5) |
| 3.2 | **Streaming partial results (design B)** | **After the golden corpus grows** | Blocked by schema order, not effort |
| 3.3 | **Shared parse cache** | **At volume** — deferred by the owner 2026-08-25 | `design/manual-sourcing-and-parse-cache.md` |

### 3.1 Language-aware page selection

**Verified 2026-09-16: `parsePrompt.ts` no longer carries a "skip pages not in
English" instruction** (the 2026-08-25 file quoted one at line 36; that line
is now the output-size cap). So there is currently no language handling at
all — neither the cheap-but-useless model-side skip nor the real thing.

To actually save, pages must not be **sent**:

1. Extract per-page text locally and detect its language. No API call.
2. Subset the PDF to the selected pages and send only those.
3. **Fall back to sending everything** whenever selection is uncertain — a
   trilingual manual whose maintenance section exists in only one language
   must not lose content to a cost optimisation.

Expected saving on a trilingual manual: about **35% off the total** (output
is nearly half the bill). The same step delivers the owner's language
requirement (2026-08-25: parse in the user's preferred language when the
manual carries it) — tag every page's language, then choose; never hard-code
English.

**Cost of building it:** there is no PDF library in `firebase/functions`
(`countPdfPages` is hand-rolled byte parsing). Page text extraction and
subsetting need a real dependency. **Gate:** it changes what the model sees,
so it goes through `scripts/parse-eval/run.ts` against the goldens BEFORE
deploy — and the corpus is 7 files (§5). Grow the corpus first.

### 3.2 Streaming partial parse results ("design B")

The scanning page that fills in row by row. Deferred 2026-08-26; two to three
days of build (stream the forced tool call, parse partial JSON, debounced
partial writes, retry safety, client render). **What blocks it: the tool
schema emits `chunks` before `tasks`**, so a streaming client would see
nothing for most of the scan and then every task at once. Reordering the
schema changes what the model produces → eval gate → the corpus (§5).

One honesty problem to settle first: house rules are applied in
`commitDraft`, not at parse, so a streamed row can vanish a minute later.
Either apply suppression client-side while streaming, or accept it knowingly.

### 3.3 Shared parse cache — deferred, not dismissed

Correct at one household; changes shape as the beta grows. Cost stops scaling
with users and starts scaling with distinct appliances (50 homes × 20 items:
$550 → **$82**). **Revisit when:** more than ~10 active households, or when
two users first add the same appliance model.

---

## 4. Designed, approved, not built

Confirmed by grep on 2026-09-16, not by the docs' status lines: no
`brandRegistry` / `BrandRegistry` symbol anywhere; nothing in `shared/parse`
or `firebase/functions/src` implements sections.

| # | Item | Doc | Why it matters |
|---|---|---|---|
| 4.1 | **Brand registry + parse cache** | `design/manual-sourcing-and-parse-cache.md` | The unbuilt half of HH-107. Manual search still ranks results it has already judged poor; the registry supplies the manufacturer URL for the no-match state. The round-7 fix added a *badge* and the complaint came back. |
| 4.2 | **Section-aware parser** | `design/section-aware-parser-proposal.md` | Parse quality at the source. |

---

## 4a. Pro tasks — the product half of HH-152

**Owner, 2026-09-05, on the dryer's duct-cleaning task:** *"In the manual,
cleaning out the ductwork specifically says to hire a qualified technician.
How can I flag tasks for scheduling a technician?"* Two halves.

**The safety half — SHIPPED 2026-09-16 (#207).** The task row already rendered
a **Pro** badge when the classifier said so, but `classifyActorFromText` only
knew a technician's *tools* (manometer, static pressure, control board). It
now reads the manual's *verbs* — "by a qualified/licensed/authorized
technician", "hire / call / contact / have a professional", "professional
service is recommended", "not user-serviceable" — as directives, ignoring a
match inside an "if / persists / still" sentence so a troubleshooting fallback
doesn't flip a homeowner task. Runs at render time from the task's text, so
every already-parsed task got the badge on next load; no prompt change, no
eval gate. The *prompt* half — the parser writing pro tasks as "what the tech
checks" — still waits on the corpus (§5).

**The half she asked for — a "Needs a pro" call — is still open (#4 in §1).**
`Assigned to` on the task page offers Anyone or a household member
(`RefinedTaskDetail.tsx`) and nothing else. The product answer is a third
option that hands the task to the Providers tab, so "who does this" and "who
to call" are one flow. **Mock first** — it touches the task page, the
Providers tab and probably the week lists. Estimate 4–8 hours plus a design
pass. The one seam already in the code: `TaskHowTo.tsx` has a "Needs a pro?"
escalation card, imported by `DesktopItemDetail` but not rendered anywhere on
mobile.

---

## 4b. The sample home — parked; its precondition is now met

**Owner, 2026-08-27:** park it *"until we finalize and QA fully the add item
flow and the final item page."* Both entry points were removed (round 18);
the route survives by direct link; `HomeOnboarding.sample.test.tsx` pins both
doors shut.

**The add-item flow and item page have since been finalised** (the living item
page, #161–#163; the care library and Suggested band, #200; the editable
supplies, #204). The parked session can be scheduled — that is the owner's
call, in §2. What is known so far, so it starts from evidence (measured
2026-08-27 at 375×812): images on the page **0**; manual citations rendered on
arrival **0**; page-cited sources sitting unused in the fixtures **4**; scroll
before the call to action ~2 screens. Two open questions: a sample HOME or a
sample ITEM (recommendation: the item page — the proof lives there), and how
much of it should be the real components (`SampleHome.tsx` hand-rolls 311
lines; feeding fixtures through `RefinedItemDetail` would make it inherit every
future change, but its header warns against exactly that).

Mockups so far: https://claude.ai/code/artifact/395e50df-9925-4252-a6a2-4d46c19fa2f9

---

## 5. Parse quality — the loop is built, the curation isn't

The task-feedback loop (phases A–D) is complete and in production. **What it
produces has no one consuming it.** Candidates route through the goldens
harness (`scripts/parse-eval/run.ts`), and there are **7 golden files**
(`scripts/parse-eval/golden/`, verified 2026-09-16) — enough to run, not
enough to trust a prompt change against.

| # | Item | Shape |
|---|---|---|
| 5.1 | Work the graduated candidates | `npx tsx scripts/parse-eval/graduation.ts` reports them; each becomes a golden or a rejection with a reason |
| 5.2 | Grow the golden set | The corpus is the gate on every `parsePrompt.ts` change (non-negotiable #5). This is #1 in §1. |

---

## 6. Product items carried over

| # | Item | Note after checking (2026-09-16) |
|---|---|---|
| 6.1 | **Offline support** | Still nothing: no `persistentLocalCache` / IndexedDB persistence anywhere in `src`. `reference_firestore_fromcache_trap` in memory is the warning to read first — an offline `getDocs` resolves EMPTY from cache, and an empty result once drove "create a duplicate home". Any offline work starts by deciding what emptiness means. |
| 6.2 | **Product walkthrough video** | Still a gap, and cheap: `e2e/journey/` drives all five core flows and screenshots every step. |

---

## 7. Test-surface gaps

| # | Item | State |
|---|---|---|
| 7.1 | **Visual baselines are not baked** | `e2e/visual/pages.spec.ts` exists; **zero `-snapshots` directories** (verified 2026-09-16). Re-bake via the workflow — never commit local-platform pixels. |
| 7.2 | **Item-page manual attach → review → tasks has no walk** | From the 2026-08-19 audit. `task-review.spec.ts` covers the review WRITE from the item page's Review button; `knowledge*.spec.ts` cover Ask. No walk attaches a manual from the item page and follows it into the review. The emulator seed also uploads no PDF, which is why the manual viewer has no walk either (#206 was proven at the component level and on the preview channel instead). |
| 7.3 | `chatQuery` has no testable core | It builds the prompt inline in the request handler with a live Claude client, unlike `runDiscussTask`. #210's wiring was verified by reading. Extracting a core would let the assembled prompt be asserted. |
| 7.4 | Parse watch-stages / snapshot tooling | Explicitly optional. Only worth it if parse debugging gets painful again. |

---

## 8. Standing constraints (not tasks — read before proposing work)

- **Deploying is manual.** `ci.yml` is the only workflow; merging ships nothing.
  Hosting is `npx firebase-tools deploy --only hosting --project homehub-2068d`,
  and the iOS shell loads the live site. Verify by grepping the production
  bundle, never by an exit code.
- **Functions deploys need explicit per-deploy approval**, separate from the
  standing merge/deploy authorization. `functions:list` on 2026-09-16:
  `sendPushSweep` (scheduled), `graduateFeedback` (scheduled), `previewDigest`
  and `proposeReminders` (callables) — `sendPushDaily` is gone.
- **Native changes need a TestFlight upload** and can only be verified by
  unzipping the IPA.
- **AI spend is capped**: 50 units/user/UTC-day, 20k/month app-wide
  (`shared/quota/policy.ts`), enforced across the paid callables.
- **A tab open across a deploy asks for chunks that no longer exist.** Hosting
  rewrites the miss to `index.html`. Routes recover via `lazyWithRetry`; any
  bare `import()` outside it must go through `withChunkRetry`
  (`src/lib/chunkRetry.ts`, #206) or say in place why not (#209). Every
  remaining `import()` in `src/` is now one or the other.
- The seven rules in `CLAUDE.md` under "Claiming something is done" are the
  bar for calling anything here finished.

---

## The product name is inlined in 21 user-facing strings

Raised by the owner 2026-08-27: "if I have to change the product name, I
would want to pull this out." There is no `APP_NAME` constant. The count has
grown from 18 to **21** since (grep, 2026-09-16). A rename means a hand-audit
of all of them, and the iOS one names a system UI path ("Enable it in iOS
Settings → Homehub → Camera"). Both onboarding tour titles already avoid the
name. The rest is a constant plus 21 substitutions — small, mechanical, and
much easier before a rename than during one. #6 in §1.

## `justify-between` — the sweep is still open

Fixed 2026-08-27 for the scan card with a `@min-[360px]:justify-start`
container query (`e2e/emu/desktop-gap.spec.ts` holds the gap under 16% of the
card at six widths). **47** component files use `justify-between` now (was
43). Only one row of the full-width-row-plus-trailing-chevron shape existed
then; the container-query mechanism has one worked example to copy. #7 in §1.

## Home rebuild — two prep features deferred on purpose (2026-09-08)

The Home redesign (shipped #202, 2026-09-09) shows one prep line inside the
open task — "You'll need an Affresh washer tablet." / "Schedule a visit with
your HVAC technician." — as a reminder only. Two things it deliberately does
NOT do yet:

- **Track how many of a supply you have on hand** ("You have 3"), with Buy /
  Have it on the task. Substrate exists: `shoppingList` service and the
  buy-ahead supply fields.
- **Book the technician from the task** — Call / Book against the provider in
  Service providers, and a way to record the visit as the task's completion.
  (Pairs with the "Needs a pro" hand-off, §4a.)

Both wait until the simple line has been lived with for a few weeks.

---

## Closed since 2026-08-25

Each line says what verified it. Nothing here is a claim from a status doc.

| Item (as it stood 2026-08-25) | How it closed |
|---|---|
| Seasonal / weather-aware timing on the agenda | `weekAgenda.ts` imports `seasonForTitle` / `seasonalWindow` and reads the home's climate for seasonal windows. |
| Logo legibility at small sizes | `design/app-icon/` holds the 1024 master, every device size and the Xcode `Contents.json`. |
| `getInviteByToken` collectionGroup read rule | Invitees read through the `getInviteDetails` Admin-SDK callable; no client read rule needed. |
| "Your reminders" plan (weekly digest, curated pushes, supplies) | All shipped: `sendPushSweep` replaced `sendPushDaily` (confirmed by `functions:list`), `previewDigest` + `proposeReminders` callables, `/week` and Your reminders pages, `push_mode`, `updateTaskSupply`, buy-ahead supply UI. |
| Feature tour fires over non-dashboard pages (audit P0) | `useFeatureTour` refuses any pathname but `/home`. |
| "What's new" shown to accounts newer than the feature (audit P1) | `whatsNew.ts` compares the auth account's creation time to the feature's ship date. |
| On-page "reading the manual…" state on the item page (audit P1) | `ParsePickupCard` renders on `ItemDetailPage`. |
| The review WRITE is covered nowhere | Fixed 2026-08-29: `task-review.spec.ts` waits for the dialog to close, reloads, reads both edits back. |
| GitHub Actions billing blocks CI (audit P2) | Resolved 2026-08-21; red `main` is signal again. |
| 6 moderate CVEs (audit P2) | Now 1 high, different package (`@xmldom/xmldom` via `@capacitor/cli`); #2 in §1. |
| **One review door skips the freeze-risk suppression** | **#208 (2026-09-16).** `ManualSection` reads the home profile; `freezeRiskFalse` is required, so a fourth door cannot forget it. |
| **Ask cannot answer warranty questions** | **#210 (2026-09-16), deploy pending.** A "Warranty on record" block from the item's fields, with the expiry arithmetic done server-side. |
| **HH-152, the safety half** | **#207 (2026-09-16).** See §4a. |
| **Bare dynamic imports outside stale-chunk recovery** | **#206 + #209.** Manual viewer, Apple sign-in, push diagnostics wrapped; analytics and crash-screen feedback annotated. |
| ~~Controls stretch on desktop~~ (scan card) | Fixed 2026-08-27; the sweep remains (above). |
| ~~Journey suite fails 4/5 locally~~ | Diagnosed 2026-08-28 (a stray `vite preview` serving production); both guards built 2026-08-29. |

---

## Where the history went

- **Every beta report, decision and outcome** → `feedback/ledger.json`, with the
  review page and Feedback HQ artifacts linked from it.
- **How v2 was built, phase by phase** → `MIGRATION_STATUS.md` (history is
  reliable; its forward-looking notes are not).
- **Strategic product direction** → `~/.claude/projects/…/memory/`, in particular
  the product-vision and principle notes.
- **This file's previous version** (2026-08-25 regeneration, with the full
  reasoning on the scan-card fix and the journey-suite diagnosis) → git history.
