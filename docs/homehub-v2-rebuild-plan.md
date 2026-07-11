# Homehub v2: parallel rebuild on Firebase — implementation plan & handoff

**Status: approved 2026-07-02. Phase 0 code merged (PR #194); implementation of Phases 1+ not started.**
This document is the self-contained handoff for the implementing session; it assumes no prior
conversation context.

> **Read `docs/homehub-v2-implementation-plan.md` alongside this** — the approved (2026-07-03)
> implementation-grade companion: per-phase work items with file paths, the frozen parse
> state-machine contract, the redesign fixes A–E folded into phases, verification gates, and
> the do-not-port list. Where the two disagree, the companion is newer and wins.

---

## 1. Why this exists (context and evidence)

Homehub is a React 19 + Vite 7 + Supabase app (this repo) for home/appliance care: users upload appliance
manuals, an Anthropic-powered pipeline extracts knowledge chunks + maintenance tasks, and the app schedules
and tracks upkeep. Production: https://homehub-pied.vercel.app (Vercel, deploys on push to `main`).

A week of parse-pipeline stabilization landed in PRs **#187–#192**:

| PR | What it did |
|----|-------------|
| #187 | Golden-corpus **eval harness** (`scripts/parse-eval/`) + prompt extracted to a single shared module |
| #188 | **Schema-forced extraction** via forced tool call (kills the malformed-JSON class) + title-stability prompt rule |
| #189 | **Shared normalization core** (`parseCore.ts`) used by both DB-writing paths + first 17 unit tests + taxonomy parity test |
| #190 | **Non-destructive rescan reconciliation**: fuzzy title matching (`titleSimilarity`), pure planner (`planTaskReconciliation`), flag-don't-delete (2-strike, completion-protected) |
| #191 | Every parse background failure now recorded on `manual_document.parse_draft._error` |
| #192 | Draft safety net + client retry-once (insufficient — see below) |

**The blocker that code cannot fix:** live breadcrumb tracing proved Supabase **free-plan edge isolates are
hard-killed at 150 seconds wall clock** — no catch blocks run, no trace lands. Measured Claude extraction
times on the real corpus (harness runs): FoodCycler 144–151s, Microwave 175–187s, Washer 205–241s,
Range/Opus 142–174s. The call alone exceeds the budget for most manuals. Two kills were observed live
(one mid-commit → **partial commit**, one mid-call), proving `commitDraft` is not atomic. Supabase docs
confirm: free = 150s wall clock; Pro = 150s initial response / 400s background; sync request cap is 150s
on **every** tier ([limits](https://supabase.com/docs/guides/functions/limits)).
Six PDF-attaching functions are exposed; the synchronous ones (`preview-manual`, `ingest-reference`,
`identify-diagram-pages`, `generate-tasks`) can't be saved by a plan upgrade.

**Owner decisions (2026-07-02, in order):**
1. Evaluated Supabase Pro ($25/mo) vs Anthropic Batch API vs **migrate to Google Firebase** → chose Firebase.
   (Recommendation to stay on Supabase was presented with the measured migration surface and overruled.)
2. Data layer: **Firestore** (not Data Connect/Cloud SQL).
3. Parsing on v1 is **frozen** until v2 lands — no interim Pro, no interim Batch work. Only data repairs on v1.
4. Evaluated in-place migration vs **parallel rebuild in a new repo** → chose rebuild: v1 keeps running
   untouched; v2 is built Firebase-native beside it; data import + manual re-parse happen at the end.
5. Scope includes: preview-flow redesign, remaining stability items (B3 fold, prompt unification, tier
   tuning), data hygiene, and the original goal — **re-parse of all ~19 manuals with confidence** — as v2
   onboarding.

**Migration surface (measured in this repo):** 91 client files / 241 Supabase call sites; 19 tables;
78 RLS policies across 53 migrations; 23 Deno edge functions; 2 pg_cron jobs; SQL RPCs + a membership
trigger; join-based read models throughout.

---

## 2. What is reused wholesale (do NOT redesign)

- **UI tree**: `src/components/**`, `src/pages/**` (the June–July 2026 redesign), `src/hooks/**`,
  `src/lib/redesign/tokens.ts`, routing in `src/App.tsx`. These consume typed service results and are
  data-layer-agnostic.
- **Parse-stability assets — dependency-free TypeScript, port verbatim:**
  - `supabase/functions/_shared/parsePrompt.ts` — THE extraction prompt (single source of truth),
    `EXTRACTION_TOOL` (forced tool; permissive-at-depth schema by design), `samplingParamsFor()`
    (temperature only where the model accepts it — Opus 4.8+/Claude 5 reject it, HTTP 400),
    `extractParsedResult()` (tool-block extraction + text fallback).
  - `supabase/functions/_shared/parseCore.ts` — normalizers (`normalizeTaskRow` emits `steps`,
    `source_page`, `justification`…), `titleSimilarity` (stemmed tokens + containment, cadence-phrase
    stripping), `planTaskReconciliation` (PURE planner: exact-key pass → greedy fuzzy pass →
    flag-don't-delete; `MISS_THRESHOLD = 2`; never deletes a task with completions), `extKey`.
  - Tests: `src/lib/parseCore.test.ts` (25 tests incl. real observed churn pairs + edge↔src taxonomy parity).
  - **Eval harness**: `scripts/parse-eval/run.ts` + `corpus.json` + `golden/*.json` — calls Anthropic
    directly (platform-neutral). Workflow rule: change the prompt → run harness → review diff → only then
    deploy. README documents churn-vs-regression thresholds (1–3 title drifts/run = normal variance;
    missing >3 / count drop >30% / coverage <100% / truncation = regression). **Run unpiped** (pipes mask
    the exit code). Costs real API money (~$0.15–0.50/manual; Opus more).
  - Audit tooling: `scripts/parse-eval/snapshot-item.mjs` (before/after rescan audits),
    `scripts/parse-eval/watch-crumbs.mjs` (live stage watcher).
- **Service interfaces** — keep exported types/signatures from `src/modules/*/services/` and
  `src/lib/dashboard.ts`, `src/lib/cleanSession.ts`; components then need no changes.

**Known-good design decisions to carry forward (with their reasons):**
- Forced tool call for extraction (Opus emits intermittently malformed free-text JSON — observed 1-of-2 runs).
- Title-stability prompt rule (tool-forcing verbosified titles until the rule was added).
- `pickParseModel`: Sonnet default, **Opus for gas/combustion/safety** (`_shared/mod.ts` lines ~155–196).
- The commitable-draft guard: a stored draft is only committable when it has real extraction arrays —
  breadcrumb/`_error` objects must never be committed (would reconcile against empty and wipe chunks).
- Calm reconciliation semantics: single-run absence = flag (`missed_scans`), delete only after 2 consecutive
  absences, never delete completed tasks, matches re-stamp `external_key` from the incoming title.

---

## 3. Known bugs & facts the implementer must know

1. **Fire-and-forget wizard bug (exists in v1, do not replicate):** `SmartAddItem.runParseAfterManualUpload`
   (~line 206) and `AddItem.handleManualConfirm` (~line 168) call `parseManual()` — which returns
   `{ok:true, processing:true}` immediately — then instantly fetch chunks/tasks (empty) and advance.
   `Settings.runRescan` (~line 488) has the same gap and would stack ~19 concurrent parses (rate limit is
   5 req/60s/user in `_shared/mod.ts`). In v2, all parse UIs must await completion via `onSnapshot`.
2. **Cadence-regex gap (fix in Phase 0):** `CADENCE_PHRASE_RE` in `parseCore.ts` strips "after each use"
   but not "after each **cycle**/wash/load" — caused a live duplicate ("Clean the Bucket After Each Cycle"
   vs "Clean the Bucket" scored 0.4 < 0.5 threshold).
3. **preview-manual prompt drift:** it carries its own inline prompt (no cleaning_guide/warranty/confidence,
   older task rules) invisible to the harness. v2 retires it: review is served from the shared prompt's
   draft mode. This also delivers B3 (single commit implementation with a fill-gaps mode flag).
4. **ParseProgressStep copy** says "usually takes 20–40 seconds"; reality is 2.5–4 minutes.
5. **Two accounts, one home:** home `c1d91d18-76d5-43cc-955d-ef73ba6f305f` is owned by
   `bcworkrelated@gmail.com` (`de59d59f-cfd9-4f77-b052-3c9f99c4de5d`; storage paths are prefixed with this
   uid) + one admin member (`2e225972…`). `barb.chang@gmail.com` (`bd2724cd…`) is NOT a member — calls
   authenticated as it get 403 from membership checks. v2 imports both accounts and makes both members.
6. **Tier inflation is real and measured** (deferred quality item): washer/Sonnet 60–64% "essential" vs
   range/Opus 11–19%. Tune the prompt post-rebuild with the harness watching.
7. **Watch item:** Range/Opus classifies self-clean cycles as `as_needed` (older parse said quarterly) —
   genuine manual ambiguity; recorded in eval results.
8. **FoodCycler current state** (from the interrupted live test): item `b6eebc35-7558-4c34-af42-97d6e13cdfea`;
   manual `3dd6282d-4cad-4f45-b5db-d9521a58a34d` (good upload) has a stale `parse_draft` breadcrumb
   (`_progress: "claude_call_started"`); manual `b7b9d947…` is a dead Vitamix URL (404, HTML). Two partial
   commits left ~13 live manual-source tasks (was 8): 5–6 legacy rows correctly matched+stamped by Phase C,
   ~5 new inserts, ≥1 duplicate pair from bug #2. Chunks: old 30 soft-deleted, new 21 live (likely complete).
   Snapshots: `scripts/parse-eval/results/snapshot-foodcycler-{before,after}.json`.

**Operational gotchas (cost hours this week — respect them):**
- Node one-off scripts MUST live in/run from the repo root (ESM resolves `@supabase/supabase-js` from the
  file's location; scripts in `/tmp` fail with ERR_MODULE_NOT_FOUND). Or use `node --input-type=module -e`.
- `.env` in repo root has `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `ANTHROPIC_API_KEY`. Supabase CLI is logged in (macOS Keychain) and linked to project `mpvhwuigpyrqdmjdkdjy`.
- v1 repo workflow (for Phase 0's repo change): never commit to `main`; branch → PR → `gh pr merge --squash
  --delete-branch`; verify the Vercel deploy state afterward (see `CLAUDE.md` shipping checklist).
- One prod DB, no staging: every write is production. Use dry-run→`--apply` script patterns
  (`snapshot-item.mjs` is the model) and take before-snapshots.
- Corpus manual IDs for the harness: range-ge-gas `27bf5e43-d076-4b7a-a0a4-850fca93d385` (Opus),
  microwave `9a053574-c4ad-4e15-9913-30a6bb4251b2`, washer `150399bc-c86c-40f5-83cf-25b3bd5fc1fd`,
  foodcycler `3dd6282d-4cad-4f45-b5db-d9521a58a34d`.

---

## 4. Phase 0 — v1 data repairs (data-only; v1 stays the daily app for weeks)

No code deploys to v1 except merging the regex fix into the repo (no function deploy needed under the freeze).

1. **Fix `CADENCE_PHRASE_RE`** in `supabase/functions/_shared/parseCore.ts`: `after each use` →
   `after each (use|cycle|wash|load)` (consider `loads?` in the `every…` alternation too). Add
   `titleSimilarity` test cases in `src/lib/parseCore.test.ts` (e.g. "Clean the Bucket After Each Cycle" ≡
   "Clean the Bucket" ≥ `TITLE_MATCH_THRESHOLD`). Branch → PR → merge per workflow.
2. **FoodCycler dedupe script** (new one-off in `scripts/`, modeled on `snapshot-item.mjs`): load live
   `task_template` rows for the item, group by `titleSimilarity ≥ TITLE_MATCH_THRESHOLD` (imports the FIXED
   parseCore via vite-node), soft-delete duplicates keeping (completions > has `external_key` > newest).
   Print plan, require `--apply`. Verify with a fresh snapshot diff vs the `-before` snapshot.
3. **Clear the stale breadcrumb** on manual `3dd6282d…`: guarded update setting `parse_draft = NULL` only
   when it has `_progress` or `_error` keys (never wipe a real draft).
4. **Hygiene deletes (owner confirms exact rows first):** the duplicate Beast Blender `manual_document`
   rows (6 total for the same Amazon URL; keep one parsed row — prefixes b95d5ad4, 69d7d3e6, e8f2e5d6,
   ff1b4026 unparsed; 782555fb, cc4825e4 parsed) and the dead Vitamix-URL FoodCycler row `b7b9d947…`.
   Soft-delete (`deleted_at`), not hard delete.

## 5. Phase 1 — v2 scaffold

- New repo `homehub-v2` (sibling directory `/Users/barbchang/Projects/homehub-v2`). Copy `src/` (minus
  `src/integrations/supabase/`), `scripts/parse-eval/`, configs (Vite 7, Tailwind 4, vitest, eslint,
  tsconfigs). Add `src/integrations/firebase/` (app init, auth, firestore helpers, storage) as the new
  integration layer. App must boot with services stubbed (compile-time stubs returning empty data).
- Firebase project on **Blaze with a budget alert set day one**: Auth (email/password + email link),
  Firestore, Storage, Functions 2nd gen (Node 20), Cloud Tasks, Cloud Scheduler, Hosting (or keep
  Vercel — decide at setup; Hosting is the default assumption).
- **Emulator Suite** wired into dev (`firebase emulators:start` + a seed script) — local end-to-end testing;
  v1's "no staging, test on prod" problem must not carry over.
- Functions workspace `firebase/functions/` (TypeScript, Node 20); shared modules (`parsePrompt.ts`,
  `parseCore.ts`) live where both functions and the web app + vitest can import them.

## 6. Phase 2 — Firestore model + rules (write `docs/firestore-model.md` FIRST, mapping all 19 tables)

```
homes/{homeId}
  members/{uid}              ← membership doc = the rules primitive (replaces 78 RLS policies)
  rooms/{roomId}
  items/{itemUnitId}
  manuals/{manualId}         ← + parse state machine fields (stage / previewDraft / draft / error)
    chunks/{chunkId}
  taskTemplates/{templateId} ← schedule rule inlined (1:1 in v1); supplies as refs to supplyCatalog
  taskInstances/{instanceId}
  chatConversations/…  careNotes/…  shoppingList/…
supplyCatalog/{supplyItemId}
users/{uid}
```
- Rules: all `homes/{homeId}/**` access requires `exists(members/$(request.auth.uid))`; role checks where
  v1 RLS had owner/admin distinctions; assignee-must-be-member validation replaces the DB trigger.
  Soft deletes stay as a `deletedAt` field + query filters.
- Read models: household-scale data (hundreds of docs) → **client-side joins composed in the service layer**
  (same function shapes as v1's `getTaskDetail`, `getWeekAgenda`, etc.). Denormalize only hot display fields
  (e.g. itemName/roomName on task docs). Do not port SQL thinking into rules.
- SQL artifacts → equivalents: `complete_task_instance` RPC → Firestore transaction;
  pg_cron `send-push-notifications-daily` and `roll-forward-never-started` → Cloud Scheduler functions
  (roll-forward semantics: re-anchor never-completed past-due recurring instances to the next cycle from
  today — see v1 migration `20260701000002_roll_forward_never_started.sql`); atomic chunk swap → one
  batched write (≤500 ops; chunk sets ≤60).

## 7. Phase 3 — Parse pipeline vertical slice (build FIRST; it's why we're here)

- `parseManual` = **enqueue → Cloud Tasks worker** (`onTaskDispatched`, `timeoutSeconds: 1800`,
  queue concurrency 1–2): fetch PDF from Storage → extraction via ported `parsePrompt.ts` (identical
  prompt, forced tool, `samplingParamsFor`) → normalize via `parseCore.ts` → reconcile via
  `planTaskReconciliation` (planner unchanged; write a Firestore executor for the plan) → atomic
  chunk-swap batch → clear draft, stamp `parsedAt`.
- **Progress = field updates on the manual doc** (`parseStage`: started → pdf_fetched → claude_call →
  claude_responded → committing → done/error) — the client subscribes with `onSnapshot`; realtime stages
  replace v1's 5s polling and fix the fire-and-forget bugs by construction.
- Preview/review: same worker writing `previewDraft` (strictly separate from the commitable draft; keep the
  commitable-guard concept). One prompt, one commit implementation with a fill-gaps mode flag.
- Verification: eval harness (unchanged) for extraction quality; emulator integration test for the worker;
  an onSnapshot stage logger (port of `watch-crumbs.mjs`); snapshot audits (port of `snapshot-item.mjs`
  to Admin SDK).

## 8. Phase 4 — Remaining backend (23 functions, by tier) 

- Heavy (worker pattern): generate-tasks, ingest-reference; identify-diagram-pages (lowest priority — only
  invoked by backfill-diagram-pages, no src/ caller). chat-query: 2nd-gen streaming response (it streams
  SSE today and works; don't regress it). search-manual, proxy-pdf (CORS-safe PDF fetch for the viewer;
  keep the `isAllowedUrl` SSRF guard concept from `_shared/mod.ts`).
- Light text-only (direct port): troubleshoot-synthesize, classify-existing-tasks, suggest-care-notes,
  import-care-url, product-lookup, detect-doc-type, check-recalls (CPSC REST only), save/preview/parse
  legacy endpoints are superseded by the worker.
- Push → **FCM** end-to-end (replaces web-push/APNs plumbing; re-verify iOS PWA push on a real device).
  Secrets (`ANTHROPIC_API_KEY`, `BRAVE_SEARCH_API_KEY`, …) → Functions secrets.

## 9. Phase 5 — Service-layer swap (bulk of client work)

Module order (keep vitest green throughout): auth (`src/modules/auth`) → home/rooms → items/inventory →
tasks/care (largest: `taskService.ts`, `weekAgenda.ts`, `src/lib/dashboard.ts`, `src/lib/cleanSession.ts`,
`homeUpkeep.ts`) → knowledge/parse services (onSnapshot-driven; fix the ParseProgressStep copy) → chat →
settings/push. Preserve exported types/signatures so `src/components/**` and `src/pages/**` need no edits
beyond the integration import.

## 10. Phase 6 — Data import + onboarding (v2 gets real data)

- Import scripts (Node + Admin SDK): Postgres export via v1 service key → transform to the Firestore model →
  import. Entities: items, rooms, task templates/instances **including completion history** (it powers the
  never-delete-completed protection and the calm "Start anytime" logic), care notes, chat FAQs, warranty
  fields, home + members.
- Auth: export both Supabase users → `firebase auth:import` with bcrypt params; add BOTH accounts as members
  of the home (resolves the two-account confusion by construction).
- Storage: copy the `Manuals` bucket (note: bucket name is capital-M; item photos live under `photos/`).
- **Manuals: re-parse everything on the v2 pipeline** rather than importing parse-derived data — this IS the
  original "rescan all manuals with confidence" goal: FoodCycler first (snapshot audit), Range second
  (Opus path + completion protection), then the bulk queue for the rest, with harness + audits watching.

## 11. Phase 7 — "Done" checklist + switch

- Golden paths on v2 with real data: sign-in (both accounts) · Home dashboard · item page incl. manual
  viewer opening at a cited page · task complete/snooze with next-due generation · smart-add a NEW manual
  end-to-end · Ask/chat with manual citations · push notification received on device · Deep-clean guides.
- Eval harness green vs goldens; vitest green; rules tests (membership isolation) green; bulk re-parse
  audits reviewed (no vanished tasks, tiers sane, source pages valid).
- Switch bookmarks/domain; v1 remains untouched as a read-only archive; write v2's `CLAUDE.md` + update
  project memory (stack, commands, gotchas) and note the pivot in the v1 repo's memory.
- Post-switch quality item: tier-inflation prompt tuning with the harness.

## 12. Sequencing & sizes

| # | Item | Size | Depends on |
|---|------|------|------------|
| 1 | Phase 0 data repairs + hygiene | S | — |
| 2 | v2 scaffold + Firebase project + emulators | S–M | — |
| 3 | Firestore model doc + rules | M | 2 |
| 4 | Parse pipeline vertical slice | L | 3 |
| 5 | Remaining functions + FCM | L | 4 |
| 6 | Service-layer swap (module by module) | XL | 3; parallel with 4–5 |
| 7 | Import scripts + auth/storage import | M | 3 |
| 8 | Manual re-parse onboarding (FoodCycler → Range → bulk) | M | 4, 7 |
| 9 | Done-checklist verification + switch + docs/memory | M | 6–8 |

Correction (2026-07-02): the planning session's task list did NOT persist — recreate the full task list
fresh when work begins (the earlier "tasks #1–#6 already created" note is stale).

## 13. Risks

- **Rewrite trap** — guarded by strict UI reuse, Phase-7 checklist as the definition of done, and
  backlogging new feature ideas (`~/.claude/projects/-Users-barbchang-Projects-Homehub/memory/project_backlog.md`).
- Firestore remodel of relational reads — keep joins in the service layer; `planTaskReconciliation` stays
  pure TS with its tests; only executors change.
- Two repos temporarily — v1 gets data-only fixes unless something critical breaks.
- FCM/iOS PWA push must be verified on a real device before the switch.
- Blaze costs ≈ free at household scale, but set the budget alert on day one.
- 400s/1800s are still finite — keep stage breadcrumbs and the draft-recovery concept in the worker.
