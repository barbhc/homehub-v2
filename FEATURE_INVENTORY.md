# HomeHub — Feature Coverage Inventory

> **Purpose:** The authoritative, code-derived list of every screen, action, state, and
> conditional surface in the current app. Use it as the requirements spec when redesigning
> the iOS app (e.g. with claude.ai/design) and as the checklist to confirm **nothing was lost.**
>
> **Source of truth:** generated from an audit of `src/pages/**`, `src/components/**`, and the
> gating hooks (`useUserLevel`, `interfaceLevel`) — not from memory or specs. Regenerate after
> major feature work.
>
> _Last generated: 2026-06-19 (branch `claude/homehub-homepage-redesign-0xfaat`)._
>
> **Stale — read with care (2026-09-30).** Not regenerated since the June audit, so most screen
> sections below describe the pre-redesign app. The one correction made since: the five URL-only
> pages deleted in #229 — `/faq`, `/tasks`, `/care`, `/schedule`, `/cleaning` — are marked
> **Deleted** below, with where each one's job went. Today's routes are in `src/App.tsx`; the
> core journeys in `docs/user-journeys.md`; the add flow in `docs/add-item-flow.md`.

---

## How to use this document

1. **Feed it as the spec, not the screenshots.** Give the redesign tool the relevant screen
   section up front: "this screen must preserve every Action, State, and Conditional Surface
   below." Redesigning from images alone reliably loses states #3–5 (empty/error/gated paths).
2. **Audit each returned screen line-by-line.** For every checkbox, mark where it lives in the
   new design: ✅ kept · 🔀 moved (note where) · ❌ dropped (must be a *deliberate* decision).
3. **Resolve the IA collapse explicitly.** Desktop has ~8 top-level task routes; mobile has 4
   tabs (Home / Inventory / Ask / Settings). The risk isn't losing a feature — it's burying it.
   The "Mobile IA note" on each screen flags where re-homing decisions are required.
4. **Don't skip the cross-cutting sections.** Navigation and the Gating System (below) silently
   change what every screen shows. A redesign that ignores level-gating will over-expose
   features to Simple users — the exact problem we're trying to avoid.

### Coverage tracker

| Area | Screens | Status |
|------|---------|--------|
| Global nav + gating | AppLayout, useUserLevel | ☐ |
| Onboarding & auth | Index, Onboarding ×2, AcceptInvite, ResetPassword, NotFound | ☐ |
| Home / dashboard | Home | ☐ |
| Inventory & items | Inventory, SmartAddItem, ItemSetup, ItemDetail | ☐ |
| Tasks / cleaning | Maintenance (Tasks), DeepClean — Care, Tasks, Schedule, Cleaning deleted (#229) | ☐ |
| Ask & knowledge | Chat — FAQ deleted (#229) | ☐ |
| Settings | Settings (+ sections) | ☐ |

---

## Cross-cutting #1 — Global Navigation (`AppLayout`)

**Tabs (gated):** Home `/home` (always) · Tasks `/maintenance` (**hidden at `essentials`**) ·
Inventory `/inventory` (always) · Ask `/chat` (always) · Settings `/settings`.

- ☐ Desktop: horizontal nav (Home · Tasks · Inventory · Ask) + Settings gear + Sign out, top-right
- ☐ Mobile: bottom tab bar; Settings is a full tab; Tasks tab hidden at `essentials`
- ☐ Active-link detection: `/inventory` matches sub-routes; `/settings` exact match only
- ☐ Safe-area insets: `env(safe-area-inset-top)` (Dynamic Island) + `-bottom` (home bar)
- ☐ Sign out uses `replace: true` so back button can't loop to an authed screen

> **Mobile IA note:** 5 desktop top-level destinations (Home, Tasks, Inventory, Ask, Settings)
> already fit the bottom bar, but **Deep Clean** has no tab — decide where it lives (nested under
> Tasks? under Home? under a "More"?). Care, Schedule, Cleaning and FAQ needed no home: they
> were deleted in #229 (see their sections below).

## Cross-cutting #2 — Gating System (`useUserLevel` + `interfaceLevel`)

**Levels** (auto-derived from signals): `itemCount`, `homeCount`, `profileCompleted`.
- `homeCount > 1 || itemCount >= 15` → **power**
- `itemCount >= 3 && profileCompleted` → **engaged**
- else → **essentials**

**Manual override** (Settings → Interface Level, stored in `localStorage`): Simple → force
`essentials` · Standard → derived · Advanced → force `power`. Default while loading = `engaged`
(so existing users never flash the reduced surface).

**`preferred_mode`** (home profile): `ask_first` → Home shows AskFirstHero instead of the task
dashboard · `inventory_first` / unset → default dashboard.

**Every level-gated surface (must be preserved in redesign):**

| Surface | essentials | engaged | power |
|---------|:---:|:---:|:---:|
| Tasks tab `/maintenance` in nav | ❌ hidden | ✅ | ✅ |
| Home quick-action `/maintenance`, `/clean` | ❌ | ✅ | ✅ |
| Home "Fix a problem" link | ❌ | ✅ | ✅ |
| Maintenance: filters, group-by, tier chips | ❌ | ✅ | ✅ |
| Maintenance: multi-select + bulk action bar | ❌ | ❌ | ✅ |
| Settings → Admin Tools (classifier, CSV export) | ❌ | ❌ | ✅ |

- ☐ `LevelUnlockBanner` on Home when real `derivedLevel` outgrows a forced "simple" override

---

## Onboarding & Auth

### Index — `/`
- ☐ **Actions:** sign in · sign up (email/password/name) · forgot password (reset email) · ProductShowcase 4-slide hero
- ☐ **States:** loading · unauthenticated (login form) · authed+no-home (HomeOnboarding) · authed→redirect `/home` · authed+returnTo→invite
- ☐ **Edge:** `returnTo` param preserved for post-login (invite flows); invite signups skip home creation

### Onboarding: Profile — `/onboarding/profile`
- ☐ **Actions:** 4-step Q&A — home type · ownership + duration · top concerns (multi, "not_sure" exclusive) · preferred mode → Finish
- ☐ Next/Back/**Skip for now** (saves partial, `completed_at` stays null) on every step
- ☐ **States:** loading · no-home→redirect `/` · saving · error · 4-step progress bar
- ☐ **Edge:** answers persist on every transition; Finish sets `completed_at` then → `/onboarding/inventory`

### Onboarding: Inventory — `/onboarding/inventory`
- ☐ **Actions:** AddItemForm (category → sub-type → category-specific fields → room → name/brand/model) → create item, form clears, counter increments
- ☐ **Skip for now** → `/home` (replace)
- ☐ **Edge:** auto-name from sub-type unless manually edited; unlimited items in one session; `subTypeToLegacyApplianceTypeId` mapping

### AcceptInvite — `/invite/:token`
- ☐ **States:** loading · auth-required (Sign In, returnTo) · ready (Join Home) · accepting · success (Go to Dashboard, full reload) · error (invalid/used/expired)
- ☐ **Edge:** validation sequence token→found→not-used→not-expired; success does full page reload to refresh home context

### ResetPassword — Supabase callback
- ☐ **Actions:** new password + confirm → Update password
- ☐ **States:** verifying link (waits for `PASSWORD_RECOVERY`) · ready · submitting · success (auto-redirect 2s) · error
- ☐ **Edge:** match + min-8 validation; redirect not cancelable

### NotFound — `*`
- ☐ "Page not found" + Go home link

---

## Home / Dashboard — `/home`

> See `Home.tsx`. Already the subject of redesign mockups; this is the full functional spec.

**Actions**
- ☐ Mark task complete (FocusTaskRow circle) → `markTaskInstanceDone`; re-animates health ring
- ☐ Task / agenda / warranty rows → `/inventory/{itemId}` (or `/maintenance`)
- ☐ Health card "Fix now / View" → `/maintenance`
- ☐ Quick actions: Add Item `/inventory/add` · Inventory · All Tasks `/maintenance` · Deep Clean `/clean` · Fix a problem (`/chat` desktop, `/troubleshoot` mobile)
- ☐ Calendar prev/next month; day-select filters agenda (**mobile only**)
- ☐ Warranty card "See all / Show less" inline expand

**States**
- ☐ Loading (HomeSkeleton) · error card + "Try again" · **new-user empty hero** (0 items) + 3 feature bullets
- ☐ Today empty ("all set") vs FocusTaskRow list (overdue essential + due today)
- ☐ This Week agenda (renders null if empty)

**Conditional surfaces** (each is dismissible / gated — preserve the gating)
- ☐ ProfileCompletionBanner (profile incomplete) · PushOptInNudge (push supported, not subscribed/denied/dismissed)
- ☐ WhatsNewBanner (per user+version) · LevelUnlockBanner (derived>override) · AskFirstHero (`preferred_mode==='ask_first'`)
- ☐ Feature tour auto-run on first visit (`useFeatureTour`, restartable)
- ☐ Quick-action set varies by level (see Gating table)

**Edge / logic to preserve**
- ☐ Health score formula (essential overdue ×15 cap45, non-essential ×3 cap15, completed −×2 cap12) + ring color thresholds (90/80/70/55)
- ☐ Calendar shows critical+high only; "overdue" is a hard deadline only for essential/critical
- ☐ Warranty window = next 90 days, sorted by expiry; insights = seasonal (month + optional sub_type regex) + universal tips
- ☐ Dashboard load error is surfaced explicitly (must NOT fall through to the empty-state hero)

---

## Inventory & Items

### Inventory list — `/inventory`
- ☐ **Actions:** Add Item → `/inventory/add` · item card → `/items/{id}`
- ☐ **Filters:** room tab bar (only if multiple rooms have items); per-room counts
- ☐ **States:** loading (skeleton grid) · empty · error · room-grouped grid
- ☐ **Badges:** task-due dot · recall (red, `recall_status==='found'`) · warranty-expiring (amber, ≤60d) · brand if set
- ☐ **Edge:** icon resolution = display-name keyword → category → generic; "Unassigned" sorts last

### Smart Add Item (routed flow) — `/inventory/add`
- ☐ **Steps:** Identify (name/brand/model/serial/location/category/sub-type) → Manual (upload **or** URL) → Parsing (upload→reading→extracting) → Review (edit chunks+tasks) → Plan (manual task editor) → Purchase (price/date/store/warranty)
- ☐ **Document-type classification gate** (manual vs warranty vs install-guide; "Use anyway" / "Replace" when uncertain, confidence ≥0.45)
- ☐ Skip manual → jump to Plan; failed parse falls back to Plan
- ☐ **Session resume:** "Resume setup / Start fresh" if an incomplete session exists for this property (localStorage)
- ☐ **States/edge:** per-step error+retry · soft-delete prior manual on Replace · 700ms settle before review
- ☐ **Legacy `AddItem.tsx` exists but is NOT routed** (rollback only) — do not redesign

### Item Setup (enrichment) — `/items/{id}/setup`
- ☐ **Steps:** Confirm (name/brand/model/appliance-type grid/room) → Manual (URL/upload/skip tabs) → Plan (task templates)
- ☐ **Edge:** upload size validation (`MAX_UPLOAD_BYTES` ~25MB) with friendly error; seeds confirm data once

### Item Detail — `/items/{id}` (the deepest screen — many subsections)
**Hero / metadata**
- ☐ Inline edit: display name, brand, model, room, serial, category, status (active/stored/removed)
- ☐ Inline edit: purchase/install date, manufactured year (1900..+1 validation), store name, price paid
- ☐ Warranty fields: expiry date, duration months, coverage text
- ☐ Photo upload **+ PhotoSearchSheet** (image search & save) · receipt upload
- ☐ Tags add/remove with autocomplete from home-scoped tags · **delete item (two-step confirm)**

**Tasks section** (tabs: Tasks · How To · Troubleshooting)
- ☐ Tier filter (all/essential/recommended/optional) · mark complete (date + optional notes) · edit (TaskEditPopover: tier, schedule_type, interval, estimated_minutes, risk_level) · delete
- ☐ Reclassify task → How To / Troubleshooting chunk · view manual page (ManualPageSheet PDF viewer)
- ☐ **Session mode:** pick (by tier + care_type) → active checklist (check off, expand guidance, reorder up/down) → end
- ☐ **Setup checklist** (schedule_type=`setup`): check/uncheck one-offs, re-check triggers (safety/comfort badges)
- ☐ **Habits** (`as_needed` / `after_each_use`): grouped, non-scheduled reminders

**Knowledge / manuals / specs / notes / history / recall**
- ☐ Manual section: add (URL/upload, primary vs reference role) · label (preset+custom) · parse / rescan / fill-gaps / delete · ManualParseReviewSheet
- ☐ Knowledge: cleaning guides + saved Q&A (delete) — only if a parsed manual exists
- ☐ Specs (manual-extracted title/value pairs) · Notes (inline textarea) · History timeline (completions + tier changes, grouped by day)
- ☐ Recall banner: check for recalls (edge function) · Warranty card status
- ☐ **Desktop-only SidebarActions:** scroll-to Manual/History/Specs · Fix a problem `/chat?item={id}` · Rescan (if parsed)

**Edge/logic**
- ☐ Auto-parse manuals created in last 10 min · chunk delete = soft-archive · chunk rendering supports numbered steps / Symptom-Cause-Fix / prose
- ☐ Tier split: setup (one-off) vs habit vs regular · completions logged, not deleted (filtered)

---

## Tasks / Cleaning

> **Redundancy resolved (#229, audit 2026-09-29).** Of the six overlapping screens this section
> listed, `Maintenance` (the Tasks tab) and `DeepClean` remain. `Care`, `Tasks`, `Schedule` and
> `Cleaning` were reachable only by typing their URLs and rendered pre-redesign screens; they were
> deleted with their routes — see each one's entry below for where its job went.

### Care — `/care` — **Deleted (#229)**
- Its list (mark done, snooze a week) is the Tasks tab, `/maintenance`.

### Maintenance ("All Tasks") — `/maintenance` *(canonical; level-gated)*
- ☐ **Actions:** mark complete (single + bulk) · snooze single + **bulk dropdown (7/14/30d)** · **change tier (bulk)** · **Add task** (AddTaskSheet: title, type maint/clean, frequency, priority, room, est minutes)
- ☐ **Filters (hidden at essentials):** status tabs (All/Overdue/Due Soon/Upcoming/No Date + counts) · tier chips · room dropdown · group-by (None/Room/Tier)
- ☐ **Selection mode + bulk action bar:** power only
- ☐ **TaskDetailSheet:** metadata grid · notes (auto-save on blur) · **TaskEditPopover** (schedule_type, interval_days, est minutes, tier, risk_level)
- ☐ **States:** loading skeleton · error+Try again · empty (no match) · grouped list · fixed bulk bar
- ☐ **Badges/edge:** tier badge with legacy fold (critical→essential, high→recommended, medium/low→optional) · overdue badge red **only for critical** · due-soon blue · frequency · last-completed · expandable description · essential-only overdue stat (excludes recommended/optional past-due)

### Tasks — `/tasks` — **Deleted (#229)**
- Its list is the Tasks tab, `/maintenance` (grouped by urgency, room or item). The task page,
  `/tasks/:taskInstanceId`, is a different route and stays.

### Deep Clean — `/clean` *(primary session workflow)*
- ☐ **Setup:** session type (cleaning/maintenance) · room(s) or whole-home (exclusive) · time budget (30m/1h/2h/Deep=∞)
- ☐ **Checklist:** load tasks (`getCleaningTasks`, room-filtered, priority-sorted) · toggle complete (local) · skip item category · expand details (parsed steps + cautions) · running time total · bonus "if you have more time" section
- ☐ **Add custom task** (source=custom) · **Finish** → batch `markTaskInstanceDone` + summary stats
- ☐ **Summary:** motivating message, counts, minutes, rooms · save uncompleted custom tasks to routine (`saveRoutineTask`)
- ☐ **Edge:** time ∞ = no cap · instruction parsing (JSON/numbered/inline/prose) + caution split · completions only persist on Finish

### Schedule — `/schedule` — **Deleted (#229)**
- Its month calendar is on the Tasks tab, `/maintenance`: the Calendar lens on phones, the
  calendar beside the list on desktop.

### Cleaning — `/cleaning` — **Deleted (#229)**
- It had no feature Deep Clean (`/clean`) lacks; cleaning sessions are Deep Clean's.

---

## Ask & Knowledge

### Chat ("Ask") — `/chat`
- ☐ **Actions:** send message (button + Enter) · room filter (multi, additive) · item filter (single; auto-set via `/chat?item=ID`) · web-search augment · **Save answer** (it lands on an item — the FAQ page it used to land on was deleted in #229)
- ☐ Suggestion chips (vary by item vs room vs general); clear filters
- ☐ **States:** empty (centered hero + chips) · conversation (compact filter strip) · streaming (typing indicator, input disabled) · error
- ☐ **Edge:** `?item=` scoping is the "Fix a problem" entry point; switching to item clears rooms; web search re-queries with prior context; can infer item from answer

### FAQ ("Care Guide") — `/faq` — **Deleted (#229)**
- House and room tips are House notes (`/inventory/notes`, and each room's notes); an item's tips,
  manual content and saved answers are on its item page. `scripts/ops/migrate-whole-home-faq.ts`
  copies whole-home answers saved before then into House notes.

---

## Settings — `/settings`

- ☐ **Account:** save profile name (optimistic CAS guard) · **Sign out** (confirm)
- ☐ **Home Profile:** home type · own/rent · duration · top concerns (multi, "not_sure" clears others) · preferred mode (ask-first/inventory-first/balanced) · Save
- ☐ **Interface Level:** Simple / Standard / Advanced (writes localStorage; drives global gating)
- ☐ **Notifications** (only if push supported): enable/disable · "Send test notification" (native only)
- ☐ **Rooms:** add (inline) · rename (inline, Enter/Esc/blur) · delete (confirm dialog; items move to "No room")
- ☐ **Home Members:** create invite (auto-copy link, expiry countdown) · copy link · revoke · remove member (**owner only**, confirm; can't remove self)
- ☐ **Custom Tasks:** add (title, schedule type, optional minutes) · delete
- ☐ **Manuals:** Rescan All (sequential, 5s spacing) · Retry N Failed
- ☐ **Export:** Export All Data (JSON: items/tasks/knowledge/FAQs/manuals)
- ☐ **Service Providers:** add/edit (name/category/phone/email/website/notes) · delete (soft)
- ☐ **Feature tour:** Restart Tour
- ☐ **Admin Tools (power only):** export tasks CSV (UTF-8 BOM, audit columns) · classify dry-run (preview care_type/schedule_type/is_reference) · classify apply
- ☐ **States:** loading · saving · saved (✓ auto-dismiss ~2.4s) · error · room edit mode · dry-run report · apply report
- ☐ **Conditional:** Custom Tasks/Rooms/Providers/Members only if `homeId`; Admin Tools only `power`; Notifications only if push supported; native test only if `isNative && pushSubscribed`

---

## Redirects & legacy (don't lose, don't redesign)

- ☐ `/troubleshoot` → `/chat` (preserves `?item=` scope) — the "Fix a problem" path
- ☐ `/dashboard` → `/home`
- `AddItem.tsx` (legacy) and `/cleaning` (minimal) — both gone. No legacy add page exists (App.tsx's
  `AddItem` is a lazy alias for `SmartAddItem`); `/cleaning` was deleted with the other URL-only
  pages in #229.
