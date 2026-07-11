# Homehub — Parsing Data Model (for design)

**Purpose.** This is the contract between the manual **parser** (the `parse-manual` /
`preview-manual` edge functions) and the **product UI**. Use it to make sure every
piece of data the parser produces has a deliberate home in the designs — and to see,
at a glance, what is already wired, what is half-wired, and what is parsed-but-orphaned
(or expected-by-UI-but-never-parsed).

Read it top to bottom once; after that the **Surface Map** (§4) and **Gaps** (§6) are
the working sections.

_Last reconciled against the codebase: 2026-06-26 (branch `claude/redesign-frontend`)._

---

## 1. The pipeline in one picture

```
 Owner's manual PDF
        │
        ▼
 parse-manual (Claude Haiku, single call)          ← §3 "Parser output contract"
        │  returns ONE JSON object:
        │  { chunks[], tasks[], cleaning_guide, warranty, manufactured_year, confidence }
        ▼
 commitDraft  →  writes to Postgres                 ← §5 "Storage model"
        │   • knowledge_chunk      (chunks, cleaning_guide, warranty-as-chunk)
        │   • task_template + schedule_rule (tasks + cadence)
        │   • item_unit            (manufactured_year, warranty_* fields)
        ▼
 ItemDetailPage splits task_template by schedule_type into THREE surfaces:
        │   • regular cadence → "Upkeep for this item"   (Tasks tab)
        │   • after_each_use / as_needed → "Habits & reminders"
        │   • setup → "Setup checklist" (hidden by default)
        ▼
 Item page tabs + rails render it                   ← §4 "Surface map"
   Tasks · Guides · Fix it · Saved answers · Activity   |   Warranty · Manuals · Specs · Tags
```

**The one rule designers must internalize:** a parsed task is routed entirely by its
`schedule_rule.schedule_type`. Three buckets, three different surfaces, three different
mental models (recurring chore vs. everyday habit vs. one-time install). Get the bucket
wrong in a design and the task either disappears or lands in the wrong place.

---

## 2. Entities & relationships

| Entity | Table | Owns | Notes |
|---|---|---|---|
| **Item** | `item_unit` | the appliance | holds warranty_* , manufactured_year, category_fields (specs), recall_*, tags, **setup_revealed_at\***, **variant_tags\*** |
| **Manual** | `manual_document` | a PDF/URL on an item | `parsed_at`, `parse_draft`; an item can have several |
| **Knowledge chunk** | `knowledge_chunk` | a unit of manual content | `chunk_type` decides the surface (Guides / Fix-it / Specs / Warranty / Cleaning) |
| **Task template** | `task_template` | one recurring/habit/setup task | classified by `care_type`, `priority_tier`, `risk_level`, `symptom_tags`, `re_check_triggers` |
| **Schedule rule** | `schedule_rule` | the cadence for a task | `schedule_type` + `interval_days` — **this is what routes a task to a surface** |
| **Supply** | `supply_item`, `task_template_supply` | what a task needs | **tables exist, never populated** (see Gaps) |
| **Task instance** | `task_instance` | a dated occurrence / completion | Setup-checklist "done" writes one of these |

`*` = column added by migrations `20260626000001` / `20260626000002` but **not yet in the
generated `types.ts`** and (for `variant_tags`/`section_category`/`applies_to`) **not yet
written by the parser**. See §7.

---

## 3. Parser output contract (source of truth for "everything in the output")

This is the exact JSON `parse-manual` emits. Anything here is a candidate for a design surface.

```jsonc
{
  "chunks": [{
    "chunk_type": "care | how_to | troubleshooting | safety | specs | warranty | cleaning_guide | reference",
    "content_level": "critical | important | contextual | reference | everyday",  // safety + how_to/care only
    "title": "short title",
    "content": "1–2 sentence summary",
    "tags": ["lowercase-keyword"],
    "scenarios": [{ "condition": "…", "steps": ["…"] }],   // structured cause→fix; null otherwise
    "source_pages": [12],                                    // PDF page numbers
    "diagram_pages": [{ "page": 12, "caption": "…" }],       // → chunk.metadata
    "table_data": [{ "table_title": "…", "columns": [], "rows": [[]] }]  // → chunk.metadata
  }],
  "tasks": [{
    "title": "task",
    "description": "one sentence",
    "care_type": "cleaning | maintenance | mixed",
    "justification": "one-sentence consequence of skipping",   // → "Why this matters"
    "priority_tier": "essential | recommended | optional",
    "risk_level": "safety | prevent_damage | performance | comfort",
    "estimated_minutes": 15,
    "schedule_type": "after_each_use | weekly | monthly | quarterly | semiannual | annual | seasonal | every_n_days | as_needed | setup",
    "interval_days": null,                                     // only for every_n_days
    "instructions_text": "brief steps",                        // → instructions_override → StepList
    "tags": [],
    "diagram_pages": [],                                       // → task.metadata.diagram_pages → "Open manual · p.X"
    "symptom_tags": ["vibration", …],                          // canonical taxonomy (12 values)
    "re_check_triggers": [{ "trigger": "vibration", "description": "…", "severity": "safety | warning" }]
  }],
  "cleaning_guide": { "weekly": { "title", "steps":[], "supplies":[] }, "deep_clean": {…} },
  "warranty": { "duration_months": 12, "coverage": "…", "exclusions": "…", "registration_required": null, "contact": "url/phone" },
  "manufactured_year": null,
  "confidence": { "overall": 0.85, "safety": 0.9, "how_to": 0.8, "care": 0.8, "troubleshooting": 0.8, "notes": "…" }
}
```

---

## 4. Surface map — where each parsed field lives in the UI

Status legend: ✅ wired · ⚠️ partial / inconsistent · ❌ parsed (or schema-ready) but **no UI**.

### Tasks (routed by `schedule_type`)

| Parsed field | Surface | Status |
|---|---|---|
| `title`, `estimated_minutes` | task row title + "N min" | ✅ |
| `priority_tier` | TierChip (Essential / Recommended / Optional) | ✅ |
| `instructions_text` | numbered, checkable StepList (Tasks tab, expanded) | ✅ |
| `justification` | slate "Why this matters" blurb | ✅ |
| `diagram_pages` (task) | "Open manual · p.X" link | ✅ |
| `schedule_type = weekly…annual / every_n_days` | **Upkeep for this item** (Tasks tab) | ✅ |
| `schedule_type = after_each_use / as_needed` | **Habits & reminders** (Every use / As needed) | ✅ (desktop + mobile) |
| `schedule_type = setup` | **Setup checklist** (collapsed by default) | ✅ |
| `re_check_triggers` | "Re-do if…" symptom chips in Setup checklist | ✅ |
| `cautions` (derived) | CautionCallout in the expanded task | ✅ |
| hazard (gas/combustion/electrical) | ProTaskNotice — suppresses DIY steps | ✅ (heuristic from title/`risk_level`) |
| `care_type` (cleaning/maintenance/mixed) | — used for habit tinting only | ⚠️ under-used elsewhere |
| `risk_level` | — | ⚠️ not visually distinct from `priority_tier` |
| `symptom_tags` | — | ❌ no symptom→task/chunk "troubleshoot" flow |
| supplies / "You'll need" | intentionally omitted (no data) | ❌ see Gaps |

### Knowledge (routed by `chunk_type`)

| `chunk_type` | Surface | Status |
|---|---|---|
| `how_to` | **Guides** tab — steps + "manual p.X" | ✅ |
| `cleaning_guide` | **Guides** tab (weekly / deep-clean) | ✅ |
| `troubleshooting` | **Fix it** tab — `scenarios` cause→fix | ✅ (scenarios) / ❌ (`table_data` not rendered) |
| `warranty` | folded into the Warranty rail / chunk | ⚠️ only duration/coverage/expiry structured |
| `specs` | **not used** — Specs rail reads `item.category_fields` instead | ⚠️ specs chunks orphaned |
| `safety` | — | ❌ no dedicated safety surface; `content_level=critical` not emphasized |
| `reference` | — | ❌ no surface |
| `content_level` | — | ❌ parsed for every chunk, never drives emphasis/ordering |
| `source_pages` | Guides "p.X" | ⚠️ tasks use `metadata.diagram_pages` instead — two page sources |

### Item-level

| Field | Surface | Status |
|---|---|---|
| `warranty.duration_months / coverage` → `item_unit` | Warranty rail (badge, coverage, provider) | ✅ |
| `warranty.exclusions / registration_required / contact` | — only as prose inside the warranty chunk | ❌ no structured columns/UI |
| `manufactured_year` → `item_unit` | — | ❌ stored, not shown |
| `confidence` | gates auto-commit server-side | ❌ no trust/provenance indicator in UI |

---

## 5. Storage model (key columns only)

- **`task_template`**: `title, description, care_type, care_type_overridden_at, justification,
  symptom_tags[], re_check_triggers(json), priority_tier, risk_level, estimated_minutes,
  instructions_override, supplies_mode, source, metadata(json: diagram_pages), is_active, deleted_at`
  · **+ migration cols not in types.ts**: `section_category, applies_to[], external_key, manual_id`
- **`schedule_rule`**: `task_template_id, schedule_type, interval_days, window_days_before/after`
- **`knowledge_chunk`**: `chunk_type, content_level, title, content, tags(json), scenarios(json),
  source_pages[], metadata(json: diagram_pages, table_data)` · **+ migration cols not in types.ts**:
  `section_category, applies_to[]`
- **`item_unit`**: `…, manufactured_year, warranty_duration_months, warranty_coverage,
  warranty_expiry_date, category_fields(json), recall_*, tags[]` · **+ migration cols not in
  types.ts**: `setup_revealed_at, variant_tags[]`
- **`supply_item` / `task_template_supply`**: full supply schema — **0 rows written**.

---

## 6. Gaps to design around

### A. Parsed/stored but NOT surfaced
1. **`content_level`** (critical/important/contextual/reference/everyday) — captured on every chunk, never used. The intended payoff (lead with `critical` safety, demote `reference`) isn't built. **Design need:** a safety/criticality emphasis treatment.
2. **`symptom_tags`** — captured on every task + the join exists, but there's no "having a problem? → see the tasks/guides tagged for it" flow. Only `re_check_triggers` (a subset, on setup tasks) surface. **Design need:** the symptom-driven troubleshoot entry point.
3. **`risk_level`** — `safety/prevent_damage/performance/comfort` is stored but the chip shows `priority_tier`. Safety tasks aren't visually distinct. **Design decision:** do we surface `risk_level` separately?
4. **`table_data`** on troubleshooting chunks — parsed (Problem/Cause/Fix tables) but Fix-it renders only `scenarios`. **Design need:** a table treatment, or accept scenarios-only.
5. **Warranty `exclusions` / `registration_required` / `contact`** — parsed but `item_unit` has no columns for them; they survive only as prose in the warranty chunk. **Design need:** "register your product" CTA + exclusions disclosure, plus a schema column or structured store.
6. **`manufactured_year`** — stored on the item, shown nowhere. **Design decision:** add to the header/specs or drop.
7. **`specs` chunks** — the Specs rail deliberately reads `item.category_fields`, so parsed `specs` chunks are orphaned. **Design decision:** reconcile the two specs sources.
8. **`confidence`** — drives auto-commit server-side but the user never sees a "parsed automatically / review suggested" signal. **Design need:** a provenance/trust indicator (was on the reliability plan).

### B. UI/feature expects it but the parser does NOT produce it
9. **Supplies ("You'll need" chips)** — `supply_item`, `task_template_supply`, and `supplies_mode` all exist; the task how-to intentionally omits the chip row because **the parser never extracts supplies** (`supplies_mode` is hard-set to `none`; the only supply text is inside `cleaning_guide` prose). **Two-sided gap:** parser must extract + UI must render.
10. **Variant filtering (gas / electric / steam …)** — `item_unit.variant_tags` and `task_template.applies_to` / `knowledge_chunk.applies_to` columns exist, but **the parser writes neither `applies_to` nor `section_category`** (confirmed: zero writes), there's **no UI to set an item's variant**, and **no client-side filtering**. Today a gas-only task shows on an electric unit. **Whole feature unbuilt despite the schema.**

### C. Built data, missing control
11. **Setup Checklist reveal** — the checklist reads `item_unit.setup_revealed_at` to open expanded, but there is **no "I just installed this" control** that *sets* it. Default for everyone is collapsed-but-accessible. **Design need:** the "just installed / set up" entry point (onboarding or item header).
12. **Habit prominence** — "Clean lint filter every load" is `essential` but sits in the calm Habits section. **Design decision:** should an `essential` `after_each_use` task get stronger treatment?

### D. Infrastructure / type debt (not design, but blocks it)
13. Generated `types.ts` is **stale** — missing `setup_revealed_at`, `variant_tags`,
    `task_template.{section_category, applies_to, external_key, manual_id}`,
    `knowledge_chunk.{section_category, applies_to}`. The app reads them via casts today.
    Re-run `supabase gen types` so designs/components can rely on them.

---

## 7. Enumerations a design must handle (don't assume the happy path)

| Dimension | Values | Where it matters |
|---|---|---|
| **Surface routing** (`schedule_type`) | `after_each_use`, `as_needed` → Habits · `setup` → Setup checklist · all others → Upkeep | every task |
| **Cadence** | `weekly, monthly, quarterly, semiannual, annual, seasonal, every_n_days` | due dates, calendar |
| **care_type** | `cleaning, maintenance, mixed` | tone/tinting |
| **priority_tier** | `essential, recommended, optional` | TierChip |
| **risk_level** | `safety, prevent_damage, performance, comfort` | (currently unsurfaced) |
| **chunk_type** | `care, how_to, troubleshooting, safety, specs, warranty, cleaning_guide, reference` | Guides / Fix-it / Specs / Warranty routing |
| **content_level** | `critical, important, contextual, reference, everyday` | (currently unsurfaced) |
| **symptom_tags** (12) | `vibration, drainage, electrical, noise, wont_start, overheating, leaking, odor, error_code, wont_clean, performance_drop, physical_damage` | troubleshoot flow + re-check chips |
| **re_check severity** | `safety, warning` | chip color (clay vs slate) |

**Empty states are the norm, not the exception:** an item may have 0 tasks, 0 habits, 0 setup
steps, no manual, no warranty, or a parse that yielded only 1 task. Every section already
self-hides when empty — designs should show the same restraint and never imply missing data
is an error.

---

## 8. Coverage checklist for a new design

- [ ] Does it route tasks by the **three surfaces** (upkeep / habit / setup), not one flat list?
- [ ] Does it have an **empty state** for every section?
- [ ] Does it treat **essential** + **safety** tasks distinctly (today only `priority_tier` shows)?
- [ ] Does it account for **hazardous / pro-only** tasks (no DIY steps)?
- [ ] Is there a home for **setup reveal**, **variant selection**, **supplies**, and a **trust/provenance** signal — or an explicit decision to defer each?
- [ ] Does it tolerate **run-to-run variance** (titles/counts shift between rescans; completion history can reset on title drift)?
```
