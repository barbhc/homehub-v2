# Task & Reminders Redesign — Requirements

## Overview

Redesign the maintenance task system to distinguish **essential maintenance** (tasks that protect appliance health and longevity) from **optional upkeep** (cleaning, cosmetic tasks). Introduce room-based organization, a smarter dashboard, escalating urgency, and an on-demand "deep clean" mode.

---

## Current State

### What exists today
- `maintenance_tasks` table has a `priority` field (`low | medium | high | critical`) — **not currently used** in any UI or query
- `items` table has a `location_id` FK to a `locations` table — **not currently used** in UI
- Dashboard shows all tasks in one flat list sorted by `next_due_date`
- Task completion recalculates `next_due_date` from today's date
- `maintenance_logs` table tracks completion history
- AI generates tasks during the Add Item wizard (PlanStep) — all tasks get `priority: 'medium'` by default

### Key files
| Area | Files |
|------|-------|
| Schema | `supabase/migrations/20260210000000_homebase_schema.sql` |
| Types | `src/integrations/supabase/types.ts` |
| Dashboard queries | `src/lib/dashboard.ts` |
| Dashboard UI | `src/pages/Dashboard.tsx`, `src/components/dashboard/` |
| Task services | `src/modules/maintenance/services/maintenanceService.ts` |
| Task completion | `markTaskComplete()` in maintenanceService |
| PlanStep (AI tasks) | `src/components/smart-add/PlanStep.tsx` |
| Maintenance page | `src/pages/Maintenance.tsx` |
| Inventory page | `src/pages/Inventory.tsx` |
| Item detail | `src/pages/InventoryDetail.tsx` |
| generate-tasks edge fn | `supabase/functions/generate-tasks/` |

---

## Feature 1: Task Classification System

### 1.1 Replace priority with task tier

Rename/repurpose the existing `priority` enum to a **tier** system that reflects how essential a task is to appliance health:

| Tier | DB value | Meaning | Example |
|------|----------|---------|---------|
| **Essential** | `critical` | Skipping risks damage, failure, or voided warranty | Replace HVAC filter, descale water heater, clean dryer vent |
| **Recommended** | `high` | Extends lifespan, improves efficiency — should do regularly | Clean refrigerator coils, flush tankless water heater |
| **Optional** | `medium` | General upkeep — good to do but no real risk if skipped | Wipe down washer gasket, clean oven interior, polish stainless steel |
| **Low** | `low` | Cosmetic or very infrequent | Clean exterior surfaces, organize shelves |

> **Implementation note:** Reuse the existing `maintenance_priority` enum (`low | medium | high | critical`) — no schema migration needed. The UI maps these to user-friendly labels. Add a `tier` alias/computed field in TypeScript if helpful for readability.

### 1.2 AI assigns tier during plan generation

- Update the `generate-tasks` edge function prompt to classify each task into one of the four tiers
- The AI should use the appliance type, manual content, and task nature to determine the tier
- Update `PlanStep` UI to show the tier badge on each generated task
- Users can override the tier in PlanStep before saving

### 1.3 User can override tier at any time

- Add a tier badge/selector to the task detail view and task edit UI
- When a user changes a tier, store the override (see 1.4)

### 1.4 Learn from reclassifications (future iteration)

- Track when users override AI-assigned tiers in a `task_tier_overrides` table or log
- Schema: `{ task_id, original_tier, user_tier, appliance_type_id, task_title_pattern, created_at }`
- Future: Use override patterns to improve AI classification for similar tasks (e.g., "user always marks 'clean gasket' as essential for washers")
- **V1:** Just store the overrides. Don't build the learning loop yet — capture the data so it can be used later.

---

## Feature 2: Room-Based Organization

### 2.1 Rooms as first-class concept

Repurpose the existing `locations` table as "Rooms":

- Preload common room names during property onboarding: Kitchen, Bathroom, Laundry Room, Garage, Living Room, Bedroom, Basement, Outdoor/Yard, Utility Room
- Users can add custom rooms
- Users can rename or delete rooms (deleting sets `location_id = null` on items)

### 2.2 Assign items to rooms

- Add room selector to the Add Item wizard (Step 1 — the AddItemForm)
- Add room selector to item detail/edit view
- Add room selector to the Setup Existing Item flow (InventoryItemSetup confirm step)

### 2.3 Inventory grouped by room

- `/inventory` page displays items grouped by room (collapsible sections)
- Items with no room assigned go in an "Unassigned" group at the bottom
- Room headers show item count
- Maintain a flat list toggle or search for quick access

### 2.4 Rooms UI

- `/settings` or a dedicated section for managing rooms (add, rename, delete)
- Room list shown during onboarding after property setup, before inventory

---

## Feature 3: Redesigned Dashboard

### 3.1 Must-Do section (top of dashboard)

- Shows only **Essential** and **Recommended** tier tasks that are due or overdue
- Sorted by urgency: overdue first (oldest first), then due soon (soonest first)
- Each task card shows: task title, item name, room, tier badge, due date, days overdue/until due
- "Mark complete" action directly on each card (existing behavior)

### 3.2 Escalating urgency display for must-do tasks

Visual urgency indicators based on due status:

| Status | Time range | Visual treatment |
|--------|-----------|-----------------|
| Upcoming | 7+ days out | Neutral/muted styling |
| Due soon | 1-7 days out | Subtle highlight (amber/yellow) |
| Due today | Today | Strong highlight (amber) |
| Overdue | 1-14 days past | Warning (red text/border) |
| Critically overdue | 14+ days past | Urgent (red background, bold) |

### 3.3 Suggested Tasks section (below must-do)

- Appears when there are zero or few must-do tasks ("Everything's on track")
- Shows **Recommended** and **Optional** tier tasks that haven't been done in a while
- Sorted by "staleness" — longest time since last completion (or never completed) first
- Limited to 3-5 suggestions, grouped or filterable by room
- Header: "Suggested maintenance" or "While you're at it"

### 3.4 Remove cleaning tasks from default dashboard

- **Optional** and **Low** tier tasks do NOT appear in the must-do section
- They only appear in: Suggested Tasks section, Deep Clean mode, Maintenance page full list
- The full `/maintenance` page still shows all tasks with filtering

---

## Feature 4: Deep Clean Mode

### 4.1 Entry point

- Accessible from dashboard ("Deep clean" button) and from maintenance page
- Selecting it opens a flow: **Pick room** -> **Set time** -> **Get prioritized checklist**

### 4.2 Room + time selection

- Step 1: Select one or more rooms (grid of room cards)
- Step 2: Choose available time: 15 min, 30 min, 1 hour, 2 hours, custom
- Based on the room and time, generate a prioritized checklist of tasks

### 4.3 Prioritized checklist

- Shows tasks for the selected room(s), prioritized by:
  1. Overdue essential/recommended tasks first
  2. Tasks not completed in the longest time
  3. Estimated effort fits within the time budget
- User can reorder, add, or remove tasks from the list
- Each task has a checkbox — checking it marks it complete (updates `maintenance_logs`, recalculates `next_due_date`)

### 4.4 Task effort category

Add an `effort` field to `maintenance_tasks` using a simple category system:

| Category | Label | Meaning |
|----------|-------|---------|
| `short` | Quick | Less than 5 minutes |
| `medium` | Medium | 5–20 minutes |
| `long` | Long | Over 20 minutes |

- AI assigns effort during plan generation
- Used by deep clean mode to fit tasks within time budget (short ~3 min, medium ~12 min, long ~30 min for estimation)
- Users can override effort category
- Shown as a small label/icon on task cards

### 4.5 Session summary

- After completing a deep clean session, show a summary: X tasks completed, time spent
- Congratulatory/motivating message

---

## Feature 5: Smarter Task Completion & Scheduling

### 5.1 Next due date from completion date

- **Current behavior (keep):** When marking a task complete, `next_due_date` is calculated from the completion date (not the original due date)
- Verify this works correctly for all frequency units (days, weeks, months, years)

### 5.2 Completion streaks / history

- On the task detail view, show a simple completion history timeline
- Data already exists in `maintenance_logs` — just needs a UI

---

## Feature 6: Full Maintenance Page Improvements

### 6.1 Filtering and grouping

The `/maintenance` page should support:
- Filter by tier: Essential, Recommended, Optional, Low
- Filter by room
- Filter by status: Overdue, Due soon, Upcoming, No date
- Group by: Room, Tier, Item (toggle)

### 6.2 Bulk actions

- Select multiple tasks -> Mark complete, Change tier, Snooze (push due date)

---

## Data Model Changes

### New/modified fields

```sql
-- Add effort category to maintenance_tasks
-- Values: 'short' (<5 min), 'medium' (5-20 min), 'long' (>20 min)
CREATE TYPE task_effort AS ENUM ('short', 'medium', 'long');
ALTER TABLE maintenance_tasks ADD COLUMN effort task_effort;

-- Add tier override tracking
CREATE TABLE task_tier_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES maintenance_tasks(id) ON DELETE CASCADE,
  original_tier maintenance_priority NOT NULL,
  user_tier maintenance_priority NOT NULL,
  appliance_type_id TEXT, -- from item.specs->>'applianceTypeId'
  task_title TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default rooms when a property is created (or via onboarding)
-- Use existing locations table — no schema change needed
```

### No breaking changes
- `priority` enum values stay the same (`low | medium | high | critical`)
- `locations` table structure stays the same — just used as "rooms"
- `location_id` on `items` already exists

---

## AI Prompt Updates

### generate-tasks edge function

Update the system prompt to:
1. Assign a **tier** (critical/high/medium/low) to each task based on:
   - Is skipping this task likely to cause damage, reduce lifespan, or void warranty? -> critical (Essential)
   - Does this task meaningfully extend lifespan or improve efficiency? -> high (Recommended)
   - Is this general cleaning or cosmetic upkeep? -> medium (Optional)
   - Is this very minor or infrequent cosmetic? -> low (Low)
2. Assign an **effort** category to each task: `short` (<5 min), `medium` (5–20 min), `long` (>20 min)
3. Return both fields in the JSON response

### Response schema update
```json
{
  "tasks": [
    {
      "title": "Replace HVAC filter",
      "instructions": "...",
      "frequencyValue": 3,
      "frequencyUnit": "months",
      "priority": "critical",
      "effort": "short"
    }
  ]
}
```

---

## UI Component Changes Summary

| Component | Changes |
|-----------|---------|
| `Dashboard.tsx` | Split into Must-Do + Suggested sections; add urgency styling; add Deep Clean entry point |
| `UrgentTasksCard.tsx` | Rename/rework — filter to Essential + Recommended only; add escalating urgency colors |
| `UpcomingTasksCard.tsx` | Rework into Suggested Tasks with staleness sorting |
| `Maintenance.tsx` | Add filters (tier, room, status); add grouping toggle; add bulk actions |
| `PlanStep.tsx` | Show tier badge on generated tasks; allow tier override before saving |
| `AddItemForm.tsx` | Add room selector dropdown |
| `Inventory.tsx` | Group items by room with collapsible sections |
| `InventoryDetail.tsx` | Add room display/edit; show task completion history |
| `InventoryItemSetup.tsx` | Add room selector to confirm step |
| New: `DeepClean.tsx` | Room picker -> time picker -> prioritized checklist -> summary |
| New: `TierBadge.tsx` | Reusable badge component for Essential/Recommended/Optional/Low |
| New: `RoomPicker.tsx` | Reusable room selector (grid or dropdown) |

---

## Implementation Order (Suggested Phases)

### Phase 1: Foundation (rooms + tiers)
1. Seed default rooms during onboarding
2. Add room selector to Add Item, item detail, inventory setup
3. Update generate-tasks to assign tier + effort
4. Update PlanStep to show/edit tiers
5. Inventory page: group by room

### Phase 2: Dashboard redesign
6. Dashboard: Must-Do section with tier filtering + escalating urgency
7. Dashboard: Suggested Tasks section
8. Tier badge component used across app

### Phase 3: Maintenance page + Deep Clean
9. Maintenance page: filters, grouping, bulk actions
10. Deep Clean mode (room + time -> checklist -> summary)

### Phase 4: Learning + polish
11. Store tier overrides, build override tracking table
12. Completion history timeline on task detail
13. Future: Use override data to improve AI tier assignment
