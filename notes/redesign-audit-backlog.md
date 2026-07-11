# Redesign audit — discrepancy backlog

Tracks gaps between the shipped app and the redesign spec in `design/`
(`hh-*.jsx` mobile, `dt-*.jsx` desktop, tokens in `design/README.md` +
`design/CLAUDE.md`). Source of truth precedence: the JSX prototypes > the
README prose where they disagree.

Status: ✅ done · 🟡 in progress · ⬜ backlog

> ⚠️ **Action required (ops):** the Ask conversation-history feature ships with a
> migration `supabase/migrations/20260623000001_chat_conversations.sql` that must be
> applied to the Supabase project (`supabase db push`, or via the dashboard) before
> history persists. Until applied, Ask runs in-memory with the Recent list hidden —
> no errors. (Save-to-item works without any migration.)

---

## Done (this branch)

- ✅ **Optional tier color** → spec slate `#5B748F` / soft `#F1F5F8`
  (was `#94A3B8` / `#F1F5F9`). `src/lib/redesign/tokens.ts`. _(commit 840dd67)_
- ✅ **Mobile tab bar fixed at 5** at every level (Home · Tasks · Items · Ask ·
  Settings) — level no longer hides Tasks. `src/components/AppLayout.tsx`. _(840dd67)_
- ✅ **Desktop nav grows with level** — Deep Clean unlocks at engaged+.
  `src/components/AppLayout.tsx`. _(840dd67)_  (Warranties/Providers destinations
  pending — see backlog.)
- ✅ **Desktop Task detail** — two-column main + sticky action rail (reuses
  existing logic; mobile unchanged). `RefinedTaskDetail.tsx`, `TaskDetail.tsx`. _(0121129)_
- ✅ **Item-detail content suite** — desktop header card + main/rail two-column
  with tabs (Tasks · Guides · Fix-it · Saved answers · Activity) + rail (Warranty
  · Manuals · Specs · Tags), Edit dialog; mobile gap-fill (Habits/Knowledge/Saved
  Q&A/Specs/Manuals/Activity, each self-guarding on empty data); "No recalls" /
  Safety-notice badge on both surfaces. `DesktopItemDetail.tsx` (new),
  `ItemDetailPage.tsx`, `RefinedItemDetail.tsx`. _(2cbea8d)_
- ✅ **Item Specs data-binding fix** — Specs now renders concise scalar k/v from
  `item.category_fields` (short label/value pairs only), not manual prose; **Saved
  answers** tab always shown. `DesktopItemDetail.tsx`. _(a6583f7)_
- ✅ **Tasks: "See how" → "Task not found" root cause** — `getTaskDetail` selected
  the non-existent `task_template.notes` column, erroring every expand; repointed
  read + write to `instructions_override`. `taskService.ts`, `taskScheduleService.ts`,
  `useTaskExpandDetail.ts`. _(65a6c1d)_
- ✅ **Desktop Tasks curated to spec** — dropped the per-item cleaning flood from the
  agenda (binding fix in `weekAgenda.ts`), so only real maintenance + home cleaning
  remains; **overdue = past-due, clay, counted consistently**; Overdue + 7-day groups,
  `TierChip` + left-edge accent bar, filter pills, column headers, Snooze/Done.
  `DesktopTasks.tsx`. _(5d5edec)_
- ✅ **Desktop Ask two-column shell** — fixed the `lg:items-start` height-collapse that
  hid the answered thread (explicit `lg:h-[calc(100vh-48px)]`); 260px history rail with
  empty hint, launcher as the right-pane empty state, cited-answer view. `ChatPage.tsx`. _(2e7ec36)_
- ✅ **Warranties bound to real per-item data** — row subtitle `{brand} · {room}`,
  per-item `ItemThumb` icon (not a uniform shield), real coverage end date (`addMonths`)
  + Covered/Lapsed status hint; rooms via `getRooms`. `WarrantiesPage.tsx`. _(8968a95)_
- ✅ **Clean lands on the hub** — `CleanHub` (Start/Resume hero, curated guides grid via
  `getDeepCleanGuides`, "This week" list) is the default view; session setup behind
  "Start a session"; removed the invented Session-type toggle, spec time budgets
  (15/30/60/No-limit), first room + 30 min preselected so "Let's clean" is enabled.
  `DeepClean.tsx`. _(ab67d0a)_

- ✅ **Ask: Save-to-item** — wired the existing `SaveFaqDialog`/`saveFaq` into
  ChatPage's previously no-op `onSaveFaq` (mobile + desktop). Works now. _(9c8de6b)_
- ✅ **Ask: conversation history** — new additive migration + `conversationService`
  + desktop history rail ("New question" + Recent) and mobile Recent list, with
  graceful degradation (in-memory until the migration is applied). _(9c8de6b)_
- ✅ **Warranties + Providers pages** + desktop nav growth complete — `/warranties`
  (real `item_unit` warranty data, Active/Expiring/Lapsed, gold framing) and
  `/providers` (reuses `ServiceProvidersSection`); nav grows Clean+Warranties at
  engaged, Providers at power; "See all" warranties link on Home (mobile entry). _(8623df9)_
- ✅ **Desktop Home rebuilt to spec** — added the missing "This week" **WeekStrip**
  card (real task due-dates, tier dots, today highlighted); moved **Home upkeep**
  into the main column as a live checkable list (home-level tasks, non-essentials);
  Good-to-know warranties + "See all"; deep-clean entry at power; fixed the clipped
  date eyebrow (top padding). `DesktopHome.tsx`. _(b38ed4c)_
- ✅ **Dark theme + Appearance control** — light/dark `--hh-*` CSS vars in index.css,
  var-based tier tokens, a theme provider (`src/lib/theme.ts`: light/dark/system,
  persisted, no-flash init in index.html) and a Settings **Appearance** segmented
  control; all redesign components converted off hardcoded hex. _(ae8919a)_

## In progress

_(none — awaiting next pick)_

## Backlog

### Tokens / theme
- ✅ **Dark theme + Appearance (Light/Dark/System)** — done _(ae8919a)_. Full `--hh-*`
  light/dark vars, theme provider, no-flash init, Settings control.
- ⬜ A few non-mapped accent literals stay light in dark mode (gradient stops, gold
  warranty accents `#FAF6EC/#EFE6CE/#9A7B3A`, recall border `#DBE6EF`, muted
  `#5A6863`, chevron `#C2CBD4`) — refine these dark variants later if desired.
- ⬜ Reconcile Essential soft bg: README table `#FBF1EC` vs `dt-kit` `#FFF1E8`
  (impl follows dt-kit). Designer to confirm. Low.
- ⬜ Purge leftover red/amber/blue from **dead legacy code** in `src/pages/Home.tsx`
  (`HealthRing` `#ef4444`, `FocusTaskRow` `border-l-red-500`, insight accents,
  `warrantyUrgency`). Currently inside `hidden` blocks; cleanest fix is to delete
  the dead blocks. Low (not shipped UI).

### Navigation / surfaces
- ✅ **Warranties page** + desktop nav at engaged+ — done _(8623df9)_.
- ✅ **Providers page** — rebuilt as the redesign's **two-column directory**
  (`300px` category-grouped rail + detail pane: Call/Email/Website actions, fields,
  Notes). Bound to **real `service_provider` data** via a new shared
  `useServiceProviders` hook (Settings' `ServiceProvidersSection` now consumes the
  same hook). Empty state gated on zero providers. _(d1ef117)_  Originally standalone
  reusing Settings' section _(8623df9)_.
  - ⬜ **"Worked on" items list** in the detail pane — deliberately omitted:
    `service_provider` has no linked-items / job-history schema, so there's nothing
    real to render. Add when that relationship exists.
  - Note: the prototype's `PV_SEED` 4 providers are **mock data**, not in the DB —
    a real account with no providers correctly shows the empty state.
- ✅ Desktop top bar: **Search · Bell · Avatar** added (all functional, route to
  items/settings) alongside Add item + gear + Sign out. _(9e93646)_
- ⬜ Optional left-sidebar nav layout + "level up" toast (`LevelToast`). Low.

### Item detail (residuals from the suite — need data wiring)
- ⬜ **Per-task inline steps / supplies / manual snippet** on the desktop Tasks
  tab (`ExpandableTaskRow`). Task rows currently show justification + instructions
  only; richer step/supply/snippet derivation lives in the full TaskDetail flow.
- ⬜ **Saved-answer source provenance** (manual vs Ask vs note) + inline **Add note** —
  `chat_faq` has no source field; all render "Saved from Ask" today.
- ⬜ **Dedicated desktop manual viewer/PDF panel** in the rail (`DesktopManualViewer`).
  Rail currently reuses the `ManualSection` manager; PDF opens via `ManualPageSheet`.
- ⬜ Interactive **recall serial check** (affected/not-affected → "Find a servicer").
- ⬜ "Complete this item" gap nudges (Add manual → unlocks tasks; Add proof of
  purchase → unlocks warranty). `hh-items.jsx`.

### Task detail (needs data wiring into the TaskDetail model)
- ⬜ **Supplies / "Add to list"**, **numbered steps**, **"From your manual"**
  snippet, **"If it goes wrong"** troubleshooting, and rail **Snooze / Skip**.
  None have backing fields in the `TaskDetail` type today.

### Home
- ✅ Desktop Home rebuilt to the fixes doc — centered 1180px, grid proportions,
  type scale (greeting 28 / focus 23 / labels 12px), compact stat cards, focus-card
  single-row layout. _(76fb712)_
- ✅ "Good to know" rail — recall + warranty NoticeCards + add-details nudge
  (`getHomeNotices`, real item_unit data). _(76fb712)_
- ✅ Deep-clean guides — curated, **capped at 5** (`getDeepCleanGuides`: home routines,
  else de-duped-by-item) + "All →" /clean; power level. (Round-2 fix for the 30+ row
  over-render.) _(9066eca)_
- ✅ Home-upkeep live list — `getHomeUpkeep` (home-scoped recurring instances + schedule):
  mark-done + snooze 2 weeks + **cadence label + "Seasonal" tag** + Manage link;
  renders nothing when empty. _(9066eca)_
- ⬜ Home-upkeep "suggested upkeep" row (sparkles + Add→confirm) — no suggested-upkeep
  source exists; omitted until one does.
- ✅ "See how" inline expand on Focus/hero (why/meta/notes + Open full view). _(a3269aa, 65a6c1d)_
  Remaining: steps/supplies/manual snippet (no data fields) + desktop agenda-row expand.

### Ask
- ✅ Conversation history (persisted + graceful fallback) and Save-to-item — done _(9c8de6b)_.
  Recent questions list included. Migration still needs applying (see ops note up top).
- ✅ Desktop Ask rebuilt to spec — rail is now **New question + Recent history only**;
  scope/launchers/suggestions moved to the main area; "Topic · {scope}" chip above
  the conversation. _(9e93646)_

### Settings (partly backend)
- ✅ **Appearance** (Light/Dark/System) control — done _(ae8919a)_.
- ✅ **Notifications preferences matrix** — per-event Push toggles (task reminders,
  warranty expiring, safety & recalls locked-on) + reminder lead-time + quiet hours,
  wired to the existing `getNotificationPrefs`/`setNotificationPrefs` store. _(3b009dd)_
  **Push-only by design** — `notificationPreferences.ts` dropped Email (model + send-push
  edge fn are push-only), so no Email column (would be a dead control); revisit if/when
  an email backend exists.
- ⬜ Custom-task **rolling-vs-seasonal cadence** toggle.
- ⬜ "Navigation layout: Top bar / Left sidebar" option (Advanced/LABS).

### Tasks
- ✅ Desktop Tasks aligned to spec — **All/Overdue/Due soon/Later** filter pills,
  column headers, per-row **Snooze + Done**; the curation + consistent past-due
  overdue model superseded the earlier "Essential-only overdue" approach (see
  Done list, _5d5edec_). _(f48518d, 9e93646, 5d5edec)_
- ✅ "See how" no longer errors — lazy fetch moved out of the setState updater. _(af163dc)_
- ⬜ (Intentional divergence, per README) Desktop uses the unified "This week"
  agenda rather than the `dt-screens-a.jsx DesktopTasks` table (filter pills,
  tier column, calendar view). Revisit only if the table direction is wanted.
- ⬜ Seasonal "leaf" indicator on task rows.
