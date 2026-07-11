# Homehub Redesign — Backend Plan (backend-first)

> Decided: **fix backend gaps before UI**; **Push-only** notifications (Email dropped for now).
> Source: gap analysis against the live schema + services (see commit history / chat).
> Each phase is one reviewable PR: migration (ALTER-only, never DROP existing) + service +
> unit test, gated on `npm run build` + `/review`, and `/codex:rescue` for migrations & sync paths.

## Default decisions made (flag if you disagree)
- **E. Level persistence → per-user** in `user_preferences` (key `interface_level`); localStorage stays as offline cache.
- **F. Shopping list → included** (since "fix everything"): new `shopping_list_item` table.
- **A. Recurrence → Postgres RPC** (`complete_task_instance`) rather than a trigger, so completion can take a confirmed date + an optional ±-week next-due override and stay atomic across mobile/web/cron.
- **B. Legacy task model → retire**, not migrate (it targets a dropped table). Confirm against live DB first.

---

## Phase order

### Phase 1 — Recurrence loop (gap A) 🔴 *blocker, do first*
The redesign's completion UX ("Mark done → confirm next date → next occurrence appears") needs the next instance generated on completion. Today `markTaskInstanceDone` only flips `status='done'`.

- **Migration:** `complete_task_instance(p_home_id uuid, p_task_instance_id uuid, p_completed_on date, p_next_due_override date default null)` — `SECURITY DEFINER`, RLS-checked. Marks the instance done, then for `is_active` templates with a recurring `schedule_rule`, inserts the **next** `task_instance` with `due_date` = override, else computed **from `p_completed_on`** (rolling) or **next** season anchor (seasonal). Non-recurring (`as_needed`/`after_each_use`/`setup`) → no new instance.
- **Fix** the seasonal bug in `resolveDueDate` (returns current-year anchor even when passed → rolls to next year).
- **Service:** `markTaskInstanceDone()` calls the RPC; add optional `completedOn` + `nextDueOverride`.
- **Tests:** rolling (weekly/every_n_days from completion date), seasonal roll-to-next, one-off no-regeneration, backdated completion.

### Phase 2 — Unify on the v1.1 task model (gap B) 🔴 ✅ DONE
> Resolved: the `20260228_cho_data_model_v1_1` migration **drops `maintenance_tasks` CASCADE**
> ("no real user data yet"), so the table is absent in the live DB and `maintenanceService` was
> dead code that errored against it → **retired** (no backfill needed). Built `getWeekAgenda`
> (unified read model on `task_instance` ⋈ `task_template`; `scope_type`/`care_type` → source
> chip) + `createTasksFromEditable` (v1.1 create path). Migrated SmartAddItem, InventoryItemSetup
> (create) and the Maintenance page (complete/snooze/tier) to v1.1; deleted the unused legacy
> `ItemDetailView` (`/inventory/:id` already redirects to `/items/:id`) and the maintenance module.

- **Confirm** via live DB whether `maintenance_tasks` exists (table/view/absent) and holds rows.
- If empty/absent: **retire** `maintenanceService.ts` + legacy `/maintenance` data path (the redesign's `WeekAgenda` replaces it on `task_instance`). If rows exist: one-time backfill into `task_template`/`task_instance` mapping `critical→essential, high→recommended, medium/low→optional`.
- Single read model for the unified "This week" agenda: `task_instance` joined to `task_template` (`scope_type` = appliance vs home; `care_type` = cleaning vs maintenance) — drives the source chips.

### Phase 3 — Task assignment (gap C) 🟠 ✅ DONE
> Migration `20260622000002_task_assignment`: `task_instance.assigned_to` + `task_template.default_assignee`
> (ALTER-only), index `(home_id, assigned_to)`, BEFORE trigger enforcing assignee ∈ `home_members`,
> and `complete_task_instance` re-emitted to inherit the assignee on recurrence. Service:
> `assignTaskInstance` + pure helpers (`canAssignTasks`, `isValidAssignee`, `resolveInheritedAssignee`).
> UI gate (`canAssignTasks`, member count > 1) lands with the redesigned Task-detail screen.

### Phase 4 — Notifications prefs, Push-only (gap D) 🟠 ✅ DONE
> No DDL — prefs live under a new `notifications` key in the existing `user_preferences`.
> Client: `src/lib/notificationPreferences.ts` (pure, tested: `normalizeNotificationPrefs`
> forces `safety_recalls` on + clamps lead time; `isWithinQuietHours` handles overnight windows)
> + `getNotificationPrefs`/`setNotificationPrefs` in `userPreferences.ts`. Server: rewrote
> `send-push-notifications` to read per-user prefs and send one prioritized push
> (recall > safety task > task reminder > warranty), honoring lead time + quiet hours (user tz)
> and **forcing** safety/recall regardless of prefs. The channel-matrix UI (Push-only) lands
> with the redesign frontend. Cron-path change → run `/codex:rescue` before deploy.

- **Storage:** typed JSONB in `user_preferences` key `notifications`:
  `{ events: { task_reminders:{push:bool}, warranty_expiring:{push:bool}, safety_recalls:{push:true/*locked*/} }, quiet_hours:{start,end,tz}, lead_time_days:int }`.
- **No Email**: matrix UI ships Push-only (no Email column).
- **Server:** update the push cron / `send-push-notifications` to read prefs, respect quiet hours + lead time, and **force** safety/recall regardless of prefs.

### Phase 5 — Level persistence (gap E) 🟡 ✅ DONE
> No DDL — stored as `{ level }` under the `interface_level` key in `user_preferences`.
> `getInterfaceLevelPref`/`setInterfaceLevelPref` in `userPreferences.ts`; pure
> `coerceInterfaceOverride` (tested) in `interfaceLevel.ts`. localStorage stays the synchronous
> UI cache; `useInterfaceLevelSync` (mounted in AppLayout) hydrates it from the DB once per
> session, and InterfaceLevelSection writes both cache + DB on change. Derived level is still
> the first-run default.

### Phase 6 — Shopping list (gap F) 🟡 ✅ DONE
> Migration `20260622000003_shopping_list`: `shopping_list_item` table per spec
> (supply_item_id / source_task_instance_id `ON DELETE SET NULL`, status check, soft delete) +
> home_members RLS + updated_at trigger. Service `shoppingListService` (add/list/setStatus/remove);
> pure, tested `toggleShoppingStatus` in `shoppingStatus.ts`. Powers Task-detail "Add to list".

---

## Status — all six backend phases complete ✅
Phases 1–6 landed on `claude/homehub-homepage-redesign-0xfaat`. Migrations are committed but
**not applied** (run on deploy / `supabase db push`). Pre-deploy: `/codex:rescue` on the SQL
migrations (1–3, 6) and the cron path (4). The consuming UI — week agenda, assignment control,
notification channel-matrix, level segmented control, shopping list — lands in the redesign frontend.

---

## Cross-cutting guardrails
- **Never DROP** existing tables/columns; ALTER-only. New tables get RLS scoped via `home_members`.
- Every migration idempotent (`IF NOT EXISTS` / guarded constraint swaps).
- Validate each PR: `npm run build` (not just `tsc --noEmit`), unit tests, `/review`, `/codex:rescue` on Phases 1–2 & 4 (sync + cron paths).
- Confirm against the **live DB** before Phase 2 cutover.
