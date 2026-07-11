# Desktop Tasks ("This week") — fixes to match the redesign

**Scope:** the desktop **Tasks** tab.
**Source of truth:** the unified "This week" agenda direction (mobile reference: `hh-week.jsx` → `WeekAgenda`; desktop table reference: `dt-screens-a.jsx` → `DesktopTasks`). The "This week" framing with Appliance/Clean source chips is the right direction — keep it. Three things are broken.

> See also **`data-binding-pattern.md`** — this page hits the same "don't flatten the dataset" bug as the Home guides and Item specs.

---

## 1. The list is flooded with granular cleaning micro-steps — fix first
The view shows 35 "tasks," almost all per-item cleaning sub-steps: *Clean Oven Door Exterior, Clean Touch Control Panel, Clean Drawer Guides, Clean bucket, Clean collection lid, Wipe Drawer Window…* These are flattened cleaning-step records, not real tasks.

**Fix:** the Tasks list draws from the **curated maintenance task set** — `HH_TASKS` / `HH_TASKS_ENGAGED` (appliance upkeep) + `HH_UPKEEP` (home upkeep). That's ~8–12 meaningful recurring tasks (Replace HVAC filter, Test smoke & CO alarms, Descale dishwasher, Clean range-hood filters…), NOT every cleaning sub-step. Cleaning micro-steps belong inside a guide, never as top-level tasks.

## 2. Due-date / overdue logic is broken
- Rows show **past calendar dates** (Apr 6, Apr 12, May 5) under a header that says "This week" (today = Jun 23).
- The filter reads "**Overdue · 35**" but only 2 rows are styled overdue; the other 33 show plain dates with no overdue treatment.
- The count, the row styling, and the dates all disagree.

**Fix:** compute due dates relative to today. Anything in the past = overdue (clay text) and must be counted consistently in the "Overdue" filter. "This week" contains only the next 7 days.

## 3. "This week" must actually be time-boxed to the week
35 items spanning April–June can't all be "this week." Scope the default view to the next 7 days (matching the title). Overdue items carried in are fine as a labeled group, but the bulk must be this-week.

## 4. Keep the calm tier signal legible
Tier (Essential / Recommended / Optional → clay / teal / slate) is currently reduced to a tiny 6px dot before the task name, while the prominent column is TYPE (source). Tier is a **core redesign principle** — show it as a real chip or column, not just a dot. Source chips (Appliance/Clean) are a good addition; don't let them replace the tier read.

---

### Columns (desktop table)
`☐ · Task (+ tier chip) · Type (source chip) · Item / Room · Due · actions(snooze / done)`
- Overdue due text = clay, never pure red.
- Row left-edge accent bar = tier color (as in `DesktopTasks`).

**Bottom line:** bind the list to the curated maintenance tasks (not flattened cleaning steps), fix the date/overdue math so the counts and styling agree and the view is actually the next 7 days, and keep the tier signal legible.
