# Review — Manual-parse → Care design handoff (round 1)

**To:** Claude Design · **From:** engineering (codebase + parser owner) · **Re:** the
`design_handoff_manual_parse_care` package (Care by rhythm, Parse review "Sort it right",
Warranty integrity).

**Verdict: strong package — accept and iterate.** The "by rhythm" model, the parse-review
flow, and the warranty fix are all the right calls and faithful to the parser contract. The
only real risk was UI that *implies* data the backend can't produce yet; the product decisions
below remove or green-light each of those, so this is now a buildable spec once the prototype
changes in §2 and the backend work in §3 land.

This doc captures: what's **decided** (§1), what the prototypes need to **change** as a result
(§2 — your action), what **engineering** must build so the design has real data (§3), what's
**still open** for you/product (§4), and the **sequence** (§5).

---

## 1. Decisions locked this round

| # | Question | Decision |
|---|---|---|
| 1 | Per-habit **reminder/nudge toggle** on "Every use" rows | **Remove it.** There's no per-task notification backing (prefs are global; `after_each_use` tasks have no due date to fire from). |
| 2 | `EveryUse behavior="log"` ("Log a load · N logged") | **Out of scope.** No usage-logging feature exists; drop it from the prototypes. |
| Q6 | **Variant filtering** (gas / electric / steam) | **Build it.** Active correctness bug today (gas-only tasks show on electric units). |
| Q5 | **Supplies** ("You'll need" chips) | **Extract only when the manual cites them — never hallucinate.** Render the chip row when supplies exist, self-hide otherwise. |

---

## 2. Prototype changes these decisions require (Design action)

### 2a. Collapse "Every use" to a single read-only treatment
Decisions 1 + 2 together mean `EveryUse` no longer needs the `reminders` toggle **or** the
`log` variant — both go. That leaves **one** treatment: the calm reference list you already
designed for `as_needed`.

- **Every use** (`after_each_use`) and **As needed** (`as_needed`) now render the same way —
  a bulleted reference list — distinguished only by label ("After each load · every use" vs
  "As needed · only when needed") and the optional "From your manual · p.X" caption.
- Remove the `Switch`, the "Nudge after a load / No reminder" sub-line, and the whole `log`
  header (the "Log a load / 41 logged" row) from `item-care.jsx`.
- **Still open (Q11):** an *essential* everyday habit (e.g. "clean the lint filter every load")
  now sits in a calm list with no emphasis. Decide if it deserves a light marker (e.g. a small
  `Essential` dot) — but **not** a nudge/toggle. Keep it subtle.

### 2b. Supplies — bring back a conditional "You'll need" row
Q5 is a go (extract-when-cited). In the **expanded task detail**, add the "You'll need" chip
row you'd omitted — but it must **self-hide when a task has no supplies** (most won't, at least
initially). Empty state = render nothing, never "No supplies." Engineering will populate the
data (see §3); design the chip treatment and where it sits relative to the steps.

### 2c. Variant filtering — needs new design, not just a flag
Q6 is a go, and it's the one decision that needs **new screens from you**, because today there's
no way for a user to tell us a unit's variant. Please spec:

1. **Setting the variant** — how does a user mark their dryer as *electric* vs *gas*, or a
   washer as *steam*? Options to consider: a prompt at manual-add/parse time ("Is this the gas
   or electric model?"), an item-header chip/edit control, or inferred-from-model-with-confirm.
2. **The filtered state** — once set, tasks/guides tagged for other variants are hidden. Is that
   silent, or is there a "showing steps for your *gas* model" affordance with a way to see all?
3. **The unknown state** — variant not set yet. Show everything, or show a one-time "Which model
   do you have?" nudge? (A "may include steps for other variants" note is the cheap fallback.)

Engineering will make the parser tag content (`applies_to`) and add the filter; the **UI to set
the variant and communicate filtering is yours to design.**

---

## 3. Backend dependencies (engineering-owned) — must land for the design to have real data

These are the spots where the prototype currently hardcodes values the backend doesn't yet
produce. None block *your* iteration, but they gate implementation. Status is eng's to track.

| Item | Why it's needed | Status / owner |
|---|---|---|
| **Regen `types.ts`** (Q14, blocking) | App casts around `setup_revealed_at`, `variant_tags`, `applies_to`, `section_category`, `external_key`, `manual_id` today | **Product owner runs `supabase gen types`** (eng has no Supabase access) |
| **Warranty columns** (Q7, blocking for the warranty CTAs) | `exclusions`, `registration_required`, `contact`, and a "registered?" state have **no `item_unit` columns** — the Register CTA / disclosures render hardcoded data | eng: ALTER TABLE + persist in `commitDraft`; owner applies migration |
| **Variant tagging** (Q6) | Parser writes **no** `applies_to`; no client filter | eng: parser prompt + `commitDraft` write + client filter |
| **Supplies extraction** (Q5) | Parser writes **0 supply rows** (`supplies_mode` hard-set `none`) | eng: parser extracts cited supplies → `supply_item`/`task_template_supply` |
| **Parse-review data** (the "Sort it right" screen) | "Check this" needs **per-task** confidence (parser emits only **section-level**); and the screen assumes review-**before**-commit, but **rescan auto-commits** today | eng: per-task confidence in parser + route the flow through the existing preview→review→save path; decide if rescan also reviews |
| **Explicit Pro field** (Q2) | "Pro" pill is a `risk_level` + keyword **heuristic** | eng: add `requires_pro`/`hazard_class` to parser; keep heuristic as fallback |

**Already backed (no work needed):** `schedule_type` routing, `priority_tier` (TierDot),
`risk_level==='safety'` (Safety pill), `estimated_minutes`, `justification`, `instructions_text`
(StepList), `diagram_pages` ("Open manual · p.X"), scheduled due/overdue status (from generated
`task_instance`s), `re_check_triggers`, and `setup_revealed_at` **reads**. The "I just installed
this" control writing `setup_revealed_at` is a small add eng will do alongside.

---

## 4. Still open — for Design / product to resolve next iteration

Recommendations included; **[blocking]** must be answered before building that surface.

- **Q1 — `risk_level` treatment.** Rec: show **Safety** on *every* `risk_level==='safety'` task
  (not gated on `essential`); give `prevent_damage`/`performance`/`comfort` **no** separate
  treatment (they collapse into priority). Confirm.
- **Q3 — `content_level`.** Rec: defer broad use; the one cheap win is a **critical-safety
  callout** at the top of the item page sourced from `content_level==='critical'` safety chunks.
  In or out?
- **Q4 — `symptom_tags` troubleshoot flow.** Rec: defer; data's ready, build later as a Fix-it
  entry point. Confirm deferral.
- **Q8 — `manufactured_year`.** Rec: show in Specs as "~N years old" when present, hide when
  null. In or out?
- **Q9 — Specs source.** Decided (eng): `category_fields` stays the Specs-rail source of truth;
  `specs` chunks stay for chat/RAG. No design change.
- **Q10 — `table_data`.** Rec: defer; scenarios-only Fix-it is fine. Confirm.
- **Q11 — essential everyday habit.** See §2a — decide the (subtle) marker, if any.
- **Q12 — cadence options.** Friendly subset is fine; **add "Weekly"** (some habits are weekly).
  Move-out of schedule drops the cadence but keeps `external_key`. Confirm.
- **Q13 — run-to-run variance.** Rely on `external_key` to preserve completion across rescans.
  **Caveat:** today the key is title-based, so a title change still resets history — a "changed
  since last scan" affordance is a nice-to-have, and eng should stabilize the key. Flag for later.

---

## 5. Recommended build sequence

1. **Regen `types.ts`** → then the **Care "by rhythm" item page** (mostly a restyle of what's
   already shipped — see §6 — and fully backed today once the toggle/log are removed per §2a).
2. **Warranty redesign + warranty columns** (Q7) — ship together; contained, high value.
3. **Variant filtering** (Q6) — parser tagging + the variant-set UI you spec in §2c.
4. **Supplies** (Q5) — parser extraction + the conditional chip row.
5. **"Sort it right"** parse review — on the add-manual/preview path, with per-task confidence.

## 6. Current baseline (what's already live, for reference)

The item page already has a first cut of two of these surfaces (built last week), which the "by
rhythm" design should *evolve*, not start from scratch:

- **Habits & reminders** section (Every use / As needed) — desktop + mobile, read-only.
- **Setup checklist** — collapsed-by-default, checkable, with `re_check_triggers` chips; reads
  `setup_revealed_at` to open expanded (the "I just installed this" *setter* is not built yet).

Both use the redesign tokens already. The handoff's main deltas over this baseline are: the
**"On a schedule" hero** (due-dated tracked maintenance — the biggest add), the **Provenance
banner**, the **Warranty fix**, and the **"Sort it right"** review flow.
