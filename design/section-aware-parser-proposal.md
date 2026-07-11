I have everything I need from the draft and critique. The critique verifies all load-bearing claims; my job is to produce the corrected final proposal. Let me write it directly.

# Homehub Section-Aware Two-Pass Manual Parser — Final Implementation Proposal

## 1. Summary

This replaces the single-call manual parser with a **two-pass, section-anchored** pipeline: Pass 1 extracts the manual's outline (canonical category + page range per section); Pass 2 parses each section under a role-aware prompt whose category is a *hard constraint*, so classification is anchored to the manual's own structure instead of guessed from prose. Install/setup steps route to a **Setup Checklist that is hidden by default** (we assume the item is already installed) and never enter the recurring Upkeep feed; they surface on demand or when the user says "I just bought this." Tasks and guides carry **variant applicability tags** (gas/electric/steam/etc.) and are hidden when they don't match the item's known config, shown-with-a-label when config is unknown. It also fixes four shipped defects on the path: the desktop recurring-feed leak of setup *and* habit tasks, the cleaning-guide raw-JSON render bug, the `cleaning_guide`/`warranty` chunk-type coercion in all three edge functions, and the destructive, duplicate-prone rescan. **The rescan is redefined as in-place UPDATE keyed on a stable re-identity** so re-parsing the 17 items preserves setup- and task-completion history rather than wiping it. We re-parse 2 items behind a validation gate before the remaining 15.

Three corrections from review are load-bearing and are reflected throughout below: (a) `schedule_type` lives on **`schedule_rule`**, not `task_template` — every "is this setup" predicate and the coercion lock operate on the `schedule_rule` payload; (b) rescan must **UPDATE-in-place by re-identity key**, not retire+insert, or completion history is lost; (c) `item_unit.variant_tags` must be **populated** (backfill + UI) or variant-hiding never fires.

## 2. Two-pass flow (concrete)

**Pass 1 — outline / section map.** Input: the PDF base64 attachment (existing mechanism in `parse-manual`/`preview-manual`) + `item_unit.model_number` and `sub_type`. Model: `claude-sonnet-4-6` (the model already used by `detect-doc-type`/`identify-diagram-pages`; needs accurate TOC/header reading). `max_tokens ≈ 1500`, outline only. Prompt: read TOC and page headers, return a flat section list, each mapped to **one** canonical `section_category` (the shared lexicon in §3, passed verbatim as the allowed enum) and a page range; do not extract content. Output:
```json
{ "has_toc": true, "tier": 1, "overall_confidence": 0.92,
  "sections": [ { "heading": "INSTALLATION", "section_category": "installation",
    "page_start": 10, "page_end": 29, "confidence": 0.95,
    "applies_to_hint": ["gas","electric","steam"] } ] }
```
`tier` (1 clean TOC / 2 no-TOC digital / 3 scanned) drives fallback and the auto-commit gate. **No-TOC / scanned / multi-language handling (was asserted, now specified):**
- **Tier 2 (no TOC):** infer sections from running page headers + the standard appliance order (safety → overview → installation → operation → maintenance → troubleshooting → warranty). Force **draft mode** (never auto-commit).
- **Tier 3 (scanned/no extractable text):** do **not** attempt section splitting. Fall back to the **existing single-pass path** for that manual and flag `parse_method='single_pass_fallback'` in the parse record. Two-pass requires structure; when there is none, 5× cost buys nothing.
- **Multi-language:** Pass 1 must return sections for **one language only** — instruct it to detect the primary/English section span and ignore mirrored translations (common in appliance manuals); otherwise page ranges double and sections duplicate. If multiple language blocks are detected, record `languages_detected` and scope Pass 2 to the first block.

**Pass 2 — per-section, role-aware.** One prompt template parameterized by `section_category`; the category is a hard constraint. Crucially, to control cost (see §8) Pass 2 is fed **page-scoped text/region**, not the whole binary re-uploaded N times. Per category:
- `installation` → everything one-time. Actionable checks → task with `schedule_rule.schedule_type:"setup"` + mandatory `re_check_triggers` (≥1); how-to procedures → chunk `how_to`, `section_category:"installation"`. The enum for `schedule_type` given to this section is literally `["setup"]` — it cannot emit a cadence.
- `operation`/`smart_features` → chunks only (`how_to`); no tasks.
- `maintenance`/`cleaning` → recurring task (cadence from text; `care_type` by consequence, not the word "clean") + `cleaning_guide` chunk with **structured `scenarios`** (never JSON-in-content).
- `troubleshooting` → chunk `troubleshooting`; Symptom/Cause/Fix in `scenarios`; `symptom_tags` from the canonical 12.
- `safety`/`specs`/`warranty` → respective chunk types; warranty also emits `duration_months`.

Per-section output: `{ section_category, chunks:[...], tasks:[...] }`, each record carrying `section_category` + `applies_to`.

**Batching / parallelism / confidence.** Isolate high-value sections (`installation`, `maintenance`, `troubleshooting`) into their own Pass-2 calls; batch front/back matter (safety/overview/specs/warranty) into one — ~4–5 calls instead of ~8. Run them via `Promise.all` (independent). Model: `claude-haiku-4-5` for Pass 2 (the section constraint does the work; this is the model the old single-pass path used); sonnet reserved for Pass 1. **Auto-commit gate (corrected):** `shouldAutoCommit` (`parse-manual:382-390`) reads *named* fields (`confidence.{safety,how_to,care,troubleshooting}` + `overall`, thresholds 0.85/0.70) — it does **not** see the new categories. Map Pass results into that exact shape: set `overall = min(Pass1.overall, min(section confidences))`, populate the named keys it checks, and **force tier-2/3 to draft** so a low-confidence `installation`/`specs`/etc. parse can never auto-commit through an unmonitored key.

## 3. Section → Homehub-surface routing

Shared canonical lexicon (identical across Pass-1 enum, Pass-2 enum, validators, and this table): `safety, product_overview, installation, operation, smart_features, maintenance, cleaning, troubleshooting, specs, parts_consumables, warranty, boilerplate`.

| section_category | Emits | Concrete field values |
|---|---|---|
| `installation` | `task_template` (+ child `schedule_rule`, one-time) and/or `knowledge_chunk` | `schedule_rule.schedule_type='setup'`; `task_template.re_check_triggers` (≥1, mandatory); `symptom_tags` from canonical 12; `care_type` per consequence. How-to procedures → chunk `how_to`, `section_category='installation'`. |
| `operation`, `smart_features` | `knowledge_chunk` | `chunk_type='how_to'`, `section_category` set, `scenarios=[{condition,steps[]}]`. No tasks. |
| `maintenance` | recurring `task_template`+`schedule_rule` + `knowledge_chunk` | `schedule_type ∈ {weekly…annual/every_n_days/as_needed}`; `care_type='maintenance'`; chunk `cleaning_guide`, structured `scenarios`, supplies in `metadata`. |
| `cleaning` | recurring `task_template` + `knowledge_chunk` | `care_type='cleaning'`; chunk `cleaning_guide`, structured `scenarios`. |
| `troubleshooting` | `knowledge_chunk` | `chunk_type='troubleshooting'`; `scenarios[].condition`=cause, `.steps`=fix; `symptom_tags`. |
| `safety` | `knowledge_chunk` | `chunk_type='safety'`; `content_level ∈ critical/important/contextual/reference`. |
| `product_overview`/`specs`/`parts_consumables` | `knowledge_chunk` + `item_unit.category_fields` | `chunk_type='specs'`; specs merged into `category_fields`; parts tagged `tags:["parts"]`. |
| `warranty` | `knowledge_chunk` + `item_unit` | `chunk_type='warranty'`; writes `item_unit.warranty_duration_months`/`warranty_coverage`. |
| `boilerplate` | nothing | dropped. |

**Install ⇒ setup, three locks (corrected for schema):**
1. **Extraction lock** — the `installation` Pass-2 prompt's `schedule_type` enum is `["setup"]`.
2. **Persistence lock** — in both commit paths, the assertion runs on the **`schedule_rule` insert payload**, not the task: if a record's `section_category==='installation'` and its `schedule_rule.schedule_type !== 'setup'`, coerce to `'setup'` before insert. (The `schedule_rule` CHECK already allows `setup`.)
3. **Routing lock** — "is this a setup task" is computed by inspecting `schedule_rule[0].schedule_type` (as `ItemDetailPage.tsx:221` already does correctly), not a non-existent `task_template.schedule_type`.

## 4. Setup Checklist — hidden by default + "just bought" reveal

**Storage:** setup steps are `task_template` rows whose child `schedule_rule.schedule_type='setup'` (foundation `20260425000002`) + `re_check_triggers`. No `setup_completed` column.

**Completion + the rescan correction (P0 #1).** Completion is inferred from a `done` `task_instance` per `task_template_id` (`SetupChecklistSection.tsx:41-58`). `task_instance.task_template_id` is `NOT NULL` and FK-bound, so **retire-and-reinsert on rescan orphans every done instance and silently wipes completion**. Therefore rescan **must UPDATE the existing template in place**, carrying its instances. Re-identity key: a parser-stable **`external_key = sha1(item_unit_id : section_category : normalized_title)`**, stored on `task_template` and `knowledge_chunk`. On rescan: match new parse rows to existing rows by `external_key` → `UPDATE` in place (refresh `section_category`, `applies_to`, `re_check_triggers`, content; instances follow the template); soft-delete only templates/chunks with **no match** in the new parse. This is the single most important correctness change and is explicitly tested in the §7 gate ("rescan twice → completion survives").

**Reveal flag (new column 1), on `item_unit`:**
```sql
-- 20260626000001_setup_checklist_reveal.sql
ALTER TABLE item_unit
  ADD COLUMN IF NOT EXISTS setup_revealed_at TIMESTAMPTZ NULL;
```
NULL = assume installed, keep checklist **collapsed but accessible**. We use a dedicated flag (not `install_date`/`purchase_date`, which a user may backfill for an old item) for the explicit "I just got this" intent.

**UI:**
- **Hidden default** (`setup_revealed_at IS NULL`): render the Setup Checklist **collapsed** — a single affordance ("Just installed this? View setup checklist (N steps)") — and nothing in the Tasks feed. Default for all 17 re-parsed items.
- **Reveal:** set `setup_revealed_at = now()` from (a) an explicit "I just bought/installed this" control on the item page and (b) item-create when marked new; checklist then renders expanded.
- **Always accessible:** the collapsed affordance shows whenever `setupTasks.length > 0` regardless of the flag; `SetupChecklistSection` returns `null` when empty (`:62`).

**Files:** `ItemDetailPage.tsx:324` pass `regularTasks` (not `tasks`) to desktop; add `setupTasks` + `SetupChecklistSection` render to `DesktopItemDetail.tsx` and `RefinedItemDetail.tsx` (mobile fetches its own instances at `:69`, gate on `schedule_rule.schedule_type==='setup'`).

## 5. Variant tag-and-hide + unknown-config safety

**New columns (2 & 3):**
```sql
-- 20260626000002_section_and_variant.sql
ALTER TABLE knowledge_chunk
  ADD COLUMN IF NOT EXISTS section_category TEXT NULL,
  ADD COLUMN IF NOT EXISTS applies_to TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS external_key TEXT NULL;
ALTER TABLE task_template
  ADD COLUMN IF NOT EXISTS section_category TEXT NULL,
  ADD COLUMN IF NOT EXISTS applies_to TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS external_key TEXT NULL,
  ADD COLUMN IF NOT EXISTS manual_id UUID NULL;        -- clean rescan scoping (§6)
ALTER TABLE item_unit
  ADD COLUMN IF NOT EXISTS variant_tags TEXT[] NOT NULL DEFAULT '{}';
```
`section_category` is a real column (not metadata JSON) because Guides grouping and the persistence lock query it. The `applies_to` GIN indexes from the draft are **dropped** — filtering is client-side (`filterByVariant`), so server-side GIN buys nothing and only adds write cost (review #13). `external_key` indexed `(item_unit_id, external_key)` for the rescan match.

**Populating `variant_tags` (P0 #2 — without this, hiding never fires).** A brand-new `'{}'` column means every item is "unknown config," so per the rule below *nothing is ever hidden*. We populate it two ways:
1. **Deterministic backfill** in the re-parse migration step: a per-`sub_type` mapping reads `item_unit.category_fields` (free-form JSONB — **no guaranteed keys**, so the mapping is explicit per sub_type, e.g. dryer: `category_fields->>'fuel_type' ∈ {gas,electric}`, `->>'steam' truthy → 'steam'`) and falls back to `model_number` heuristics (e.g. LG `DLGX*` → gas, `DLEX*` → electric). Items it can't classify stay `'{}'` (correctly "unknown").
2. **UI control** on the item page to set fuel type / steam / stackable, writing `variant_tags`.

Until an item is populated, hiding is **explicitly inert** for it (shown-with-label), by design — no data is lost.

**Tagging:** Pass 2 sets `applies_to` from the section's `applies_to_hint` + per-record cues ("Connect Gas Supply" → `["gas"]`; steam inlet hose → `["steam"]`; door reversal → `["reversible_door"]`). Empty = applies to all.

**Hide rule (shared `filterByVariant(records, variant_tags)` in `src/pages/item-detail/utils.ts`, applied to Guides, Setup steps, Tasks):**
- `applies_to` empty → always show.
- `applies_to` non-empty AND `variant_tags` **known/non-empty** → show only if `applies_to ∩ variant_tags ≠ ∅`; else **hide**.
- `applies_to` non-empty AND `variant_tags` **empty/unknown** → **show with a label** ("Gas models only" / "Steam only"). Hide only when config is positively known — the safe fallback against false-hide.

## 6. Code/schema changes by file

**Migrations (ALTER/ADD only, never DROP):** `20260626000001_setup_checklist_reveal.sql` (§4), `20260626000002_section_and_variant.sql` (§5).

**Edge functions:**
- `supabase/functions/parse-manual/index.ts` — two-pass orchestration (Pass 1 outline + parallel role-aware Pass 2); map confidence into `shouldAutoCommit`'s named fields + tier-2/3→draft (`:382-390`); **`VALID_CHUNK_TYPES` (`:296`)** add `cleaning_guide`, `warranty`, `reference` so the *main chunk path* (not just the hardcoded `:470` insert) stops downgrading to `how_to`; carry `section_category`/`applies_to`/`external_key` through `validateChunkRow`/`validateTaskRow` and the `commitDraft` inserts (`:402-460`); install⇒setup coercion on the **`schedule_rule` payload**; **cleaning-guide JSON fix at source** (`:468-493` and twin `:681-698`):
  ```ts
  content: weekly.title ?? "Weekly Cleaning",
  scenarios: [{ condition: "", steps: weekly.steps }],
  metadata: { guide_type: "weekly", supplies: weekly.supplies ?? [] },
  ```
  rescan rewrite (§6 rescan, below).
- `supabase/functions/preview-manual/index.ts` — `VALID_CHUNK_TYPES` (`:275/:93`) same additions; mirror Pass-1/Pass-2 schema; output + forward `section_category`/`applies_to`/`external_key`.
- `supabase/functions/save-parsed-manual/index.ts` — `VALID_CHUNK_TYPES` (`:183/:91`) same additions; add the three fields to `PreviewChunk`/`PreviewTask` (`:26-37,77-89`) and the chunk/task inserts (`:402-559`); keep `deriveScenarios` (`:60-75`) as the preview-path fallback for `cleaning_guide`; run the same idempotent replace at top of a non-fill-gaps save; install⇒setup coercion on the `schedule_rule` payload.

**Rescan idempotency (corrected, in both `parse-manual` `deleteOldParseData` `:1060-1083` and the save path):**
1. **UPDATE-in-place by `external_key`**, not retire+insert (§4) — preserves instances/completion. Soft-delete (`UPDATE … SET deleted_at = now()`) only rows with no match in the new parse; both tables already have `deleted_at` and all reads filter `.is("deleted_at", null)`.
2. **Scope task deletion by manual** via the new `task_template.manual_id` (or `metadata->>manual_id`) — **not** by `item_unit_id`, which over-deletes sibling-manual tasks. **Correction to the draft:** chunk deletion is already `.eq("manual_id", manualId)` (`knowledge_chunk` has no `item_unit_id`) and is manual-safe; the multi-manual hazard is **tasks only**.
3. **Preserve user edits:** never soft-delete or overwrite user-set fields on tasks with `care_type_overridden_at IS NOT NULL` — UPDATE only `section_category`/`applies_to`/`re_check_triggers`, leave `care_type`/`schedule_type` intact.
4. **Fill-gaps dedup (`commitDraftFillGaps:584-631`):** key on `(section_category, normalized_title)` but **treat NULL `section_category` as a wildcard match** against a new row's category during the transition window, so legacy NULL rows don't duplicate against freshly-categorized ones.

**UI:**
- `src/pages/ItemDetailPage.tsx:324` — pass `regularTasks` to `DesktopItemDetail`.
- `src/components/home/DesktopItemDetail.tsx` — **route all three slices** (`regularTasks`→`TaskSection`, `setupTasks`→`SetupChecklistSection`, `habitTasks`→`HabitsSection`); `TasksTab tasks={tasks}` (`:647`) currently leaks setup **and** habit tasks — fix both, matching mobile. `GuideCard` (`:218`) already reads `scenarios` first; add the "Installation & setup" Guides group keyed on `section_category`.
- `src/components/home/RefinedItemDetail.tsx:69` — gate setup section on `schedule_rule.schedule_type==='setup'`.
- `src/pages/item-detail/utils.ts:96` (`parseSteps`/`GuideCard`) — **defensive render guard** for already-stored bad rows: if `content` starts with `{` and `JSON.parse` yields a `.steps` array, render those steps. Add `filterByVariant` helper here.
- `src/pages/item-detail/SetupChecklistSection.tsx` — reveal/collapse per `setup_revealed_at`.

## 7. Phased rollout + 2-item validation gate

- **Phase 1 — stop the bleeding (frontend-only, no parser/migration):** route all three task slices on desktop (fixes setup + habit leak); `parseSteps` JSON guard (cleaning rows stop showing raw JSON for *already-parsed* data). Depends on neither `section_category` nor re-parse.
- **Phase 2 — schema + persistence:** both migrations; `VALID_CHUNK_TYPES` reconciliation (all three files, incl. `reference`); carry the three new fields through; cleaning-guide structured fix at source.
- **Phase 3 — two-pass extraction:** Pass 1 + role-aware Pass 2 in `parse-manual`, mirrored in `preview-manual`; install⇒setup `schedule_rule` lock; variant tagging; tier-2/3→draft + single-pass fallback for tier 3.
- **Phase 4 — idempotent rescan:** UPDATE-in-place by `external_key`, manual-scoped task deletion, user-edit preservation, save-path replace.
- **Phase 5 — `variant_tags` backfill** (mapping + UI control), then validation gate, then fleet.
- **Phase 6 — variant + reveal UI wiring:** `filterByVariant`, `setup_revealed_at` hide/reveal, Guides grouping.

**Validation gate — 2 items first:** re-parse **LG DLGX3901B** (known-bad reference; exercises installation/maintenance/troubleshooting/variant) and **one simple gadget** (Nespresso/blender; must yield zero setup, zero recurring — proves we don't synthesize tasks). Gate must pass **all**:
- Dryer install checks ("Run Installation Test", "Verify Dryer is Level", "Inspect Power Cord", "Connect Inlet Hose") land as `schedule_rule.schedule_type='setup'` + `re_check_triggers`, **not** in Upkeep.
- Install how-tos carry `section_category='installation'` and group under Guides "Installation & setup", separate from `operation`/`smart_features`.
- Cleaning guides render as steps + supplies, never raw JSON.
- "Connect Gas Supply" tagged `applies_to:['gas']`; **after** the dryer's `variant_tags` is set to `['electric']` it **hides**; with `variant_tags='{}'` it shows-with-label. (This explicitly tests P0 #2 — gate cannot pass on an unpopulated `variant_tags`.)
- Gadget: Setup Checklist absent; Upkeep empty or descaling-only.
- **Rescan the dryer twice → no duplicate chunks/tasks AND prior setup/task completion survives** (mark a setup step done, override a task's `care_type`, rescan; both persist). This tests P0 #1.
- Multi-manual safety: pick any of the 17 with >1 manual, rescan one manual, confirm the sibling manual's tasks are untouched.

**Fleet (remaining 15):** serial server-side with a delay between items (the `backfill-diagram-pages` pattern) to stay under rate limits; each is idempotent UPDATE-in-place. **Optional safety net:** `classify-existing-tasks` (idempotent, `.is("justification", null)`) dry-run first to move any stray install tasks to `setup` for items not yet re-parsed.

## 8. Open risks / decisions needing the owner's call

1. **Pass-2 input strategy — the real cost driver.** If each of ~5 parallel Pass-2 calls re-uploads the full base64 PDF, token-in and upload cost multiply ~5× and edge-function timeout risk *rises* on 100+ page / scanned manuals (contradicting "reduces timeout risk"). **Decision needed:** pre-split the PDF per section range (added complexity, cleaner cost) vs. extract page text once in Pass 1 and pass text (not binary) to Pass 2 vs. accept full re-attachment. Recommend passing page-scoped text. Owner to confirm acceptable per-manual cost ceiling.
2. **Tier-3 (scanned) policy:** confirm single-pass fallback (no OCR investment now) is acceptable, vs. funding OCR for image-only manuals.
3. **`external_key` stability vs. title drift:** the key uses `normalized_title`; if a re-parse renames a step, the key changes and the row is treated as new (completion lost for that step). Acceptable, or do we want a fuzzy fallback match? Recommend accepting for v1.
4. **`variant_tags` backfill confidence:** the `category_fields`/`model_number` mapping will mis-tag some items; a wrong tag *hides* real content. Recommend the mapping only sets tags it's confident about and leaves the rest `'{}'` (show-with-label). Owner to confirm we prefer over-showing to over-hiding.
5. **`section_category` constraint:** ship as nullable TEXT with a hard app-level enum validator in `validateChunkRow`/`validateTaskRow` (reject/normalize, not pass-through); add a DB CHECK in a follow-up once values are stable. Confirm we don't want the CHECK on day one.
6. **Legacy data (628 chunks / 155 tasks) pre-re-parse:** `section_category` is NULL → Guides falls back to flat grouping and the persistence lock is a no-op until re-parse; Phase-1 fixes are independent of it. Confirm graceful degradation is acceptable for the window between Phase 1 and fleet re-parse.

**New columns (all additive, ADD COLUMN IF NOT EXISTS, no DROP):** `item_unit.setup_revealed_at`, `item_unit.variant_tags`, `knowledge_chunk.{section_category, applies_to, external_key}`, `task_template.{section_category, applies_to, external_key, manual_id}`. Everything else reuses existing fields (`schedule_rule.schedule_type='setup'`, `re_check_triggers`, `symptom_tags`, `care_type_overridden_at`, `scenarios`, `source_pages`, `category_fields`, `warranty_*`, and the `deleted_at` soft-delete columns already on both tables).

## 9. Edge case (added after design): professional install/service manuals

Validated against the **York TG9S furnace** manual — title literally "RESIDENTIAL GAS
FURNACES — INSTALLATION MANUAL", TOC header "LIST OF SECTIONS", and **no Maintenance /
homeowner / annual content anywhere**. Every section is install/service for an HVAC tech
(Gas Piping, Combustion Air, Electrical, Twinning, Start-Up & Adjustments, Safety Controls).
This is a *different axis* from no-TOC/scanned (tiers): the TOC is clean, but the **audience
is a professional**. Naively parsed, its install/service steps become recurring homeowner
tasks — the bug in its worst form. Four additions to the design:

1. **Doc-type / audience signal in Pass 1.** Reuse the existing `detect-doc-type` function (or
   fold a `doc_audience` field into Pass-1 output): classify `user_manual` vs
   `install_service_manual` from the title + section signature. For an install/service manual:
   relax the "min 2 how_to + 2 troubleshooting" floor (it will mint nonexistent content), and
   treat install/gas/combustion/electrical/start-up sections as `installation` → **setup
   (hidden, pro)** — never homeowner recurring tasks. The `requires_pro`/`risk_level='safety'`
   guard becomes section+audience-driven, not keyword-driven.

2. **Diagnostics / fault-code sections → Fix-it.** "NORMAL OPERATION AND DIAGNOSTICS" with LED
   flash/fault codes is homeowner-*readable* (read the code) even when the fix is pro. Pass-1
   outline must recognize diagnostics/fault-code/"before calling for service" headings as
   `troubleshooting`; Pass-2 emits Fix-it scenarios with an escalate-to-pro (the ProEscalate
   card already built) when the fix needs a tech.

3. **Category-default supplement (new).** When a manual yields **no homeowner recurring
   maintenance** (normal for HVAC/pro docs), Homehub must supplement upkeep from **category
   defaults** rather than leave the item with zero tasks: e.g. furnace → "Replace air filter
   every 1–3 months" + "Schedule annual professional service." Source options: a per-`sub_type`
   care-template table, or reuse `suggest-care-notes`/`import-care-url`. Mark these
   `source='cho_generated'` (not `'manual'`) so they're distinguishable and the user can
   dismiss. **Owner decision:** build category-default templates now, or defer.

4. **TOC label synonyms.** Pass-1 outline must accept "LIST OF SECTIONS", "CONTENTS",
   "Sections", etc., not just "Table of Contents".

These fold into Phase 3 (doc-type + diagnostics routing, synonyms) and a new Phase 7
(category-default supplement) — except the category-default templates, which need an owner
call on scope.

## 10. Trust & accuracy gating (owner priority: reliability over cost)

The app only ASSERTS a task it's confident about and can cite; anything uncertain is
shown as a reviewable suggestion, never silently trusted. Five mechanisms, mostly ~free:

1. **Confidence-gated commit (the big lever).** Pass 2 emits per-section + per-task
   confidence. High confidence → auto-commit to the live feed. Low confidence (scanned,
   no-TOC, or a section the model wasn't sure of) → a **"N suggested tasks to review"**
   draft state; one tap to confirm/reject before they join the trusted list. The recurring
   feed the user relies on then contains only high-confidence items. (Threshold on data the
   model already returns — near-zero cost.)
2. **#3 scanned manuals = Option A + force draft.** Keep the cheap single-pass fallback for
   image-only PDFs (the model still reads them visually) but never auto-commit a fallback
   parse — it lands in review. No OCR spend; weak parses can't produce trusted tasks.
3. **Provenance on every task.** Parsed items cite a manual page ("From your manual · p.31");
   category-default supplements (§9) show a "Suggested" tag. Every task is traceable to a
   source — the core trust signal.
4. **Verifier self-check pass (modest cost, highest-leverage accuracy check).** After Pass 2,
   one cheap adversarial call per item: "Do any of these RECURRING tasks actually look like
   one-time install or pro-only steps? Flag them." Directly targets the install-as-maintenance
   error class. ~1 small call per manual.
5. **Two-item validation gate before fleet re-parse** (already in §7) stays the human
   backstop on the whole pipeline.

Cost impact: mechanisms 1–3 ≈ free; 4 ≈ cents/manual. The expensive options (OCR / per-section
page-images) are NOT funded — the draft gate contains their risk for free.
