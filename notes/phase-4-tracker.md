# Phase 4 Tracker — Unified Troubleshooting Flow

**Last updated:** 2026-04-25 by Claude
**Total scope:** ~3 weeks across 4 sub-phases
**Why this exists:** so neither of us loses the thread when we move fast across a multi-week phase. Scan this any time you're disoriented; tell Claude when something here is wrong or stale.

---

## 🎯 Where you are right now

**Status:** Phase 4 complete ✅. All four sub-phases shipped and verified in production.

### Immediate next action
Phase 4 is done. Next up: Phase 3 (cleaning/maintenance UI separation) per the decisions log — both touch item-detail layout, so one coordinated pass now.

---

## 🗂️ Sub-phase status

| Sub | Title | Scope | Status |
|-----|-------|-------|--------|
| **4a** | Setup tasks foundation (schema + parser + Setup checklist UI) | ~1 week | ✅ Complete (4a/1, 4a/2, 4a/3 shipped + verified) |
| **4b** | Troubleshoot flow MVP (replace TroubleshootPage with structured flow) | ~1 week | ✅ Complete (#129 shipped + verified) |
| **4c** | AI synthesis layer (chat-query reuse for "3 things to try") | ~3–4 days | ✅ Complete (#130 shipped) |
| **4d** | Cross-surface entry points ("Something's not right?" button + service provider routing) | ~3–4 days | ✅ Complete (#131 shipped) |

---

## ✅ What to verify in the app right now

Take 5 minutes before we kick off Phase 4a:

1. **Home page** — confirm there's only ONE push opt-in surface (the bigger card titled "Reminders for essential tasks" with a "Manage in Settings" link). The smaller inline banner should be gone.
2. **Settings → Admin tools** — confirm the section is visible, "Dry run" returns a table with the **Schedule** column rendering blue chips on habit-type schedules.
3. **Settings → Service providers** — confirm category chips render with tappable phone/email/website links.
4. **Item detail (any item with a manual)** — open a maintenance task and look for the `justification` field on it. Newly-parsed tasks (post-Phase-1) will have one; older tasks won't until you Apply the dry-run.

If anything looks off, tell Claude before we start 4a.

---

## 📋 Decisions log

Every architectural choice with a one-line "why." Add new ones here immediately when they happen in chat.

| Date | Decision | Why |
|------|----------|-----|
| 2026-04-25 | **Phase 4 ships before Phase 3** (cleaning/maintenance UI separation) | Both touch item-detail layout — one coordinated layout pass instead of two |
| 2026-04-25 | **Adopt Option B (multi-trigger task) over Option A (simple split)** for setup tasks | Single source of truth per task; the "Something's not right?" affordance becomes the front door for unified troubleshooting (which evolves the existing TroubleshootPage / chat / `troubleshooting_case` schema into one flow) |
| 2026-04-25 | **Symptom taxonomy = 12–15 canonical tags in `src/lib/symptomTaxonomy.ts`** | Constants file, not a DB table — small enough that schema overhead isn't worth it. Joins setup tasks ↔ maintenance tasks ↔ knowledge chunks |
| 2026-04-25 | **Cleaning/maintenance classifier is consequence-based, not keyword-based** | "Clean dishwasher filter" is maintenance because skipping it damages the pump. The word "clean" doesn't determine classification |
| 2026-04-25 | **Asymmetric ambiguity rule: when unsure, choose maintenance** | False positives are visible and recoverable; false negatives hide real obligations |
| 2026-04-25 | **`justification` is nullable on task_template** | Older tasks pre-Phase-1 don't have one; chunks converted via `convertChunkToTask` don't either. Backfill via Phase 2 dry-run handles this; UI must render gracefully when null |
| 2026-04-25 | **No fork — single codebase with a power-user toggle when needed** | Solo dev; doubling deploy + DB + migrations is wrong. Personal regressions get reverted, not branched off |
| 2026-04-25 | **Only Essential tasks can go "overdue"** + only Essentials trigger notifications | Tier semantics actually differ: Essential = real deadline, Recommended = "consider soon," Optional = reference only |
| 2026-04-25 | **Cleaning vs maintenance is one axis; schedule cadence is another** | The 2D matrix `(care_type, schedule_type)` routes every parsed task: scheduled-maintenance → Tasks list, scheduled-cleaning → Deep Clean, habit-anything → Habits & Reminders, setup-anything → Setup checklist |
| 2026-04-25 | **Reuse existing `troubleshooting_case` and `troubleshooting_step` tables** in Phase 4b | They've been in the schema unused since the v1.1 data model migration; Phase 4 is what they were designed for |
| 2026-04-25 | **Extend the classifier to also propose `schedule_type`** (not just care_type) before applying the backfill | Dry-run review surfaced parser overconfidence with calendar cadences (e.g. "Clean Drawer Guides" given `weekly` when it's really `as_needed`). Conservative rule: only change schedule when classifier is confident; otherwise echo current. Never propose-change INTO `every_n_days` (no manual context for `interval_days`). Apply once with both axes corrected |
| 2026-04-25 | **Behavioral realism axis added to habit-task classification** | Found via dry-run: classifier was elevating "Wipe waveguide after each use" to safety-critical maintenance based on real fire-risk consequence. But unrealistic habits (nobody wipes their microwave every use) become guilt-noise the user ignores. New rule: habit-shaped tasks (`after_each_use`, `as_needed`) only earn the `maintenance` label when ALL THREE are true: sharp/immediate consequence + real safety/warranty severity + realistic to actually do every use (e.g. emptying lint trap qualifies; wiping waveguide doesn't). Otherwise → `cleaning`, with the consequence preserved in `justification`. Scheduled-task rule unchanged. |
| 2026-04-25 | **Classifier also detects operational reference (not-a-task)** rows | Dry-run review surfaced parser extraction errors: rows like "Empty Pockets Before Washing," "Unload Dishwasher in Correct Order," "Use Oven Probe for Temperature Monitoring" are how-tos / usage instructions that the parser shouldn't have extracted as `task_template` rows. Classifier now emits `proposed_is_reference: true` for these. On Apply, the row's `is_active` is set to false (still in DB, reversible) and removed from the task feed. The information is recoverable via chat with the manual context. Parser quality fix at the source comes in Phase 4a. |

---

## ❓ Open questions for you

None right now. Phase 4a will surface UI questions (placement of the Setup checklist on item detail, copy for the "Re-do if…" trigger badge); we'll resolve those at that checkpoint.

---

## 🔔 Background follow-ups (interruptible, not blocking Phase 4)

These are tracked separately so they don't pile up forgotten, but Phase 4 takes priority. Fit between sub-phases at natural pause points.

- **BG-1: Sentry stale-chunk MIME-type regression** — one occurrence week of 2026-04-17, after PR #105 was supposed to close this class. Investigate where the gap is (~30–60 min).
- **BG-2: `/inventory/add` perf** — 1.01s → 2.50s with 5 samples. Wait for more data (20+ samples) before acting.

Both also live in the project_backlog memory under "Background follow-ups."

---

## 🌿 Pending branches / PRs

None — `main` is clean, ready to fork Phase 4a from.

Recently merged (for context, last 7 days):
- #114 — Notification banner cleanup
- #115 — Classifier Phase 1 (schema + parser)
- #116 — Classifier Phase 2 (backfill edge fn + Admin tools UI)
- #117 — schedule_type column in dry-run report
- #118 — Phase 4 tracker (this file)
- #119 — Classifier extension: also re-propose schedule_type
- #120 — Classifier prompt v3: behavioral realism axis for habits
- #121 — Classifier detects + deactivates non-task rows
- #122 — Track Sentry follow-ups in Phase 4 tracker
- #123 — Export tasks to CSV for async audit
- #124 — Phase 4a/1: setup-task schema + symptom taxonomy + types
- #125 — Phase 4a/2: parse-manual + classifier detect setup tasks + symptom_tags
- #126 — Classifier fix: preserve before-extended-absence tasks (not references)
- #127 — Fix: apply passes dry-run results to edge function (no re-classification)
- #128 — Phase 4a/3: Setup Checklist UI on item detail + fix setup task instance generation
- #129 — Phase 4b: Symptom-first troubleshooting flow (replaces old TroubleshootPage)
- #130 — Phase 4c: AI synthesis layer — "3 things to try" on troubleshoot brief
- #131 — Phase 4d: Cross-surface entry points (desktop nav + Home quick actions + resolved service providers)

---

## 🛠️ Process commitments for Phase 4

How Claude will work through this phase to keep you oriented:

1. **PR descriptions open with "What you'll see in the app:"** — plain language, user-visible behavior first. Code/scope detail goes below. The merged PR list reads like a product changelog when you scroll back later.
2. **Mandatory checkpoint between sub-phases** — before starting 4b, Claude writes a structured message: what shipped, what to verify in the app (~5 min), what's coming next, ready to continue? You don't approve moving to 4b just because 4a's PR is merged. You approve it because the app feels right.
3. **Decision log updated immediately** — when we decide something in chat, it lands in this file before the conversation ends, not "later." Every decision has a date and one-line context.
4. **Verification gates that block** — if a checkpoint says "verify X in the app," Claude doesn't start the next sub-phase until you confirm. Saying "looks fine, move on" is fine. Saying "haven't tested" means we wait.
5. **Tracker is the source of truth** — anything important enough to track lives here. Backlog memory has the strategic queue; this file has the tactical Phase 4 state.

---

## 🧭 Related artifacts

- **Project backlog** (strategic queue, all phases) — in Claude's memory at `~/.claude/projects/-Users-barbchang-Projects-Homehub/memory/project_backlog.md`
- **Audit report** — `AUDIT_REPORT.md` at repo root
- **Setup task UI mockup** (Option A vs B comparison from 2026-04-25) — `/tmp/homehub-setup-task-mockup.html` (will need re-generating if /tmp is cleared; ask Claude)
- **Project guidelines** — `CLAUDE.md` at repo root
