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

## 3. Designed, approved, not built

These have design documents in `design/` and no implementation. Confirmed by
grep, not by the docs' own status lines.

| # | Item | Doc | Why it matters |
|---|---|---|---|
| 3.1 | **Brand registry + parse cache** | `design/manual-sourcing-and-parse-cache.md` | The unbuilt half of HH-107. Manual search still ranks results it has already judged poor; the registry supplies the manufacturer URL for the no-match state. The round-7 fix added a *badge* and the complaint came back — this is the fix that changes the outcome. |
| 3.2 | **Section-aware parser** | `design/section-aware-parser-proposal.md` | Parse quality at the source. Nothing in `shared/parse` implements it. |

---

## 4. Parse quality — the loop is built, the curation isn't

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

## 5. Product items carried over from `backlog.json`

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

## 6. Test-surface gaps

| # | Item | State |
|---|---|---|
| 6.1 | **Visual baselines are not baked** | `e2e/visual/pages.spec.ts` exists; **zero `-snapshots` directories**. The visual suite cannot fail, so it currently proves nothing. Re-bake via the workflow — never commit local-platform pixels. (This is Phase 5's "fix E".) |
| 6.2 | `getInviteByToken` collectionGroup read rule | Deliberately deferred until sharing ships. Revisit when a non-member needs to resolve an invite link. |
| 6.3 | Parse watch-stages / snapshot tooling | Phase 3.3, explicitly optional. Only worth it if parse debugging gets painful again. |

---

## 7. Standing constraints (not tasks — read before proposing work)

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
