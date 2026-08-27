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

## 4b. The sample home buries the one thing that sells the product

**Owner, 2026-08-27:** *"the sample home page is still very visually simple and
doesn't inform or motivate a user if this is the first thing they explore."*

`/sample` is the "find out before you commit" page — reached from the Inventory
empty state and from `HomeOnboarding`. It is often the FIRST screen a new person
sees, and it is a well-typeset list: a pale banner, a heading, hairline rules,
four task rows with tier rails and cadence pills. No imagery, no manual, no
before/after.

**The specific finding, which is sharper than "it looks plain".** The content
that proves the pitch is already in the fixtures and is hidden behind a chevron:

```
source: "Carrier Infinity 59MN7 manual, p. 34"
source: "Bosch SHPM88Z75N manual, p. 20"
source: "Rheem XE50T10 manual, p. 18"
```

The product's whole claim — *photograph an appliance, Homehub reads its manual,
these jobs came from page 34* — is one tap away and invisible on arrival. A
visitor who does not tap a chevron sees a to-do list that could have been typed
by hand, and leaves without ever learning what the app did.

| Shape | Cost |
|---|---|
| Surface the page citation on the collapsed row, not just the expanded one | small |
| Lead with the mechanism rather than the result — show a manual page and the tasks that came out of it | medium |
| Give the page a visual anchor: the appliance, or the manual, or both | medium |

Not a bug and not urgent, but it is the page that decides whether someone starts
at all — and it is currently the least persuasive surface in the app while
holding the most persuasive content.

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
| 6.2 | **The review WRITE is covered nowhere** | Found while fixing HH-134. J3 was the only walk touching it, and only by asserting a Save button that — correctly, after HH-134 — appears solely when there is something to save. The seeded dishwasher's one task is cleaning, so nothing needs scheduling and Done is right. **Add one maintenance task to the seed**, then J3 covers the write again. Until then `saveItemTaskReview` / `commitDraft` have no end-to-end test. |
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
