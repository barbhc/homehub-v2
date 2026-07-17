# Scope — Task feedback loop ("Tune your tasks")

Let the homeowner give feedback on any task ("why is this Essential?", "wrong
season", "not my climate"), get an explanation grounded in the manual, and have
the system learn — per-home immediately, globally over time. This operationalizes
the **Relevant / Useful / Timely** principle as a user-driven loop: the feedback
chips are literally the RUT test inverted (not Relevant → climate/home fit; not
Useful → tier/effort wrong; not Timely → season/cadence wrong).

**Decisions locked with owner (2026-07-17):**
1. **Two-tier learning** — feedback becomes structured per-home "house rules"
   immediately; recurring cross-home patterns graduate into parse-eval cases →
   global prompt tuning, gated by the goldens harness (non-negotiable #5).
2. **Feedback reach** — one piece of feedback may: fix the task now, sweep
   similar existing tasks (**always confirm the sweep list with the user first —
   never silently**), shape future parses, and backfill home-profile facts.
3. **Modality: chips → chat** — quick reason chips for the 80%; a "Discuss"
   escape hatch opens an AI conversation that explains provenance (manual page,
   tier logic) and negotiates for the nuanced 20%.
4. **Safety: AI pushes back, user wins** — for hazard-adjacent tasks (gas,
   combustion, electrical, CO) the AI makes its case once with the manual
   citation and offers the pro-handoff path, but ultimately honors the change.
   Every override is logged and reversible.

## Motivating example — ground truth (verified in prod, 2026-07-17)

"Winterize Washer for Cold Storage" surfaced as Essential **in July** because:

```
scheduleType: "seasonal", season: null, anchorDate: <the parse date>
→ instance dueDate = the parse date  (i.e. "due today")
```

Two distinct failures, two distinct fixes:
- **BUG (deterministic, fix independently of this feature):** a `seasonal` task
  with `season: null` must not be instantiated anchored to the parse date.
  Either the extractor fills `season` (winterize → "fall") or commit holds
  seasonal-without-season tasks unscheduled ("when winter approaches") instead
  of due-today. Tracked in BACKLOG › Bugs.
- **FEATURE (this doc):** "I'm in SF — mild climate, winterizing doesn't apply"
  is a per-home fact no parser fix can know. That's the feedback loop.

## Architecture

**The parse prompt stays canonical and shared.** Per-home learning must NOT fork
`parsePrompt.ts` per user (breaks the goldens gate, unmaintainable). Instead:

```
manual ──canonical parse──► extraction ──house-rules layer──► tasks committed
                                              ▲
                    homes/{homeId}/houseRules (structured, user-confirmed)
```

### Data model (new subcollections under homes/{homeId})

- **`taskFeedback/{id}`** — the raw ledger: taskTemplateId/instanceId, chips
  selected, free text, chat transcript (if any), resolution, ruleIds created,
  createdBy/At. Append-only; the audit trail for "why did this change".
- **`houseRules/{id}`** — structured, machine-applicable rules, e.g.
  `{ kind: "suppress", match: { tags: ["winterize","cold-storage"] }, reason, sourceFeedbackId }`,
  `{ kind: "tier_remap", match: {...}, to: "optional" }`,
  `{ kind: "cadence", match: {...}, intervalDays: 90 }`.
  Small closed vocabulary of kinds; every rule shows its provenance.
- **Home profile facts** — `homes/{homeId}.profile` gains structured fields the
  rules (and chat, recalls, tiering) can read: `climate: "mild" | "cold" | …`,
  `freezeRisk: boolean`, etc. Feedback like "I live in SF" backfills these; the
  existing "Finish your home profile" onboarding collects them proactively —
  same fields, two collectors.

### Where rules apply

1. **Future parses:** parseWorker/commit applies house rules AFTER canonical
   extraction (suppress / retier / recadence before tasks land).
   `planTaskReconciliation` stays pure — rules are passed in as data
   (non-negotiable #3 preserved).
2. **Existing tasks:** a confirmed sweep physically updates task docs (the
   confirm-first list). No runtime filtering needed.

### UX

- Task row/detail → feedback affordance → sheet with chips:
  **Wrong timing/season · Not relevant to my home · Wrong priority · Too often ·
  Duplicate · Discuss…** Chips resolve deterministically (no AI call).
- Resolution proposes a plan: *"Archive this task · mark your home mild-climate ·
  also demote these 3 similar tasks (Dryer, Outdoor Faucet…) — apply?"* —
  user confirms; sweep list always shown before applying.
- **"Discuss"** opens a focused AI chat seeded with the task, its source chunks
  (`sourcePages` → "manual p.31"), the category's taskGeneration config, and the
  home profile. It explains, negotiates, then emits the same structured plan.
- **Settings › House rules** — the learned-rules ledger: every rule listed with
  its provenance sentence, editable/deletable. Nothing the system learned is
  invisible.

### Global graduation (tier 2)

Feedback events carry a pattern signature (chip + task tags + category). When
the same pattern recurs across N distinct homes, it becomes a **candidate eval
case** appended to `scripts/parse-eval/corpus` + a proposed prompt tweak — run
through the goldens harness before any deploy, per the existing rule. Feedback
never mutates the shared prompt directly.

## Phasing

- **A (no AI, high value):** chips + immediate actions (archive/retier/
  reschedule) + `taskFeedback` ledger + confirm-first similar-task sweep +
  Settings rules ledger. Subsumes the old "task_tier_overrides" Phase-4 idea.
- **B:** home-profile facts (climate first) + houseRules applied in the
  parse-commit path; wire the same facts into the profile onboarding.
- **C:** "Discuss" chat with provenance + negotiated multi-action plans +
  safety pushback flow (hazard tasks → pro-handoff offer).
- **D:** global graduation pipeline (pattern aggregation → eval-case
  candidates → prompt tuning via harness).

## Guardrails

- Confirm-before-sweep, always. Single-task actions apply immediately.
- Safety pushback: hazard-adjacent tasks get one cited counter-argument + the
  pro-handoff offer; user's decision is honored and logged. Never silently
  re-promote.
- Rules are visible, attributed, and reversible (delete rule ≠ resurrect
  already-archived tasks; it stops future application).
- Chips are free; only "Discuss" spends an AI call.
