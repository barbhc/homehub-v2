# Handoff: Homehub Redesign (Mobile + Desktop)

## Overview
Homehub is a calm home-management app: it tracks everything you own (appliances, fixtures), the upkeep each thing needs, the manuals that explain them, warranties, cleaning, and an AI "Ask" assistant grounded in your own manuals. This package documents the **finished redesign** across two surfaces:

- **`Homehub App.html`** — the mobile (iOS-style) app: the primary, most complete experience.
- **`Homehub Desktop.html`** — the responsive desktop app: a faithful translation of the same design language and feature set.

Both are organized as **pan/zoom design canvases** containing many artboards (one per screen/state). The interactive app shells live on the first artboard(s); the rest are static boards documenting every screen, flow, and state.

## About the Design Files
The files in this bundle are **design references created in HTML/React-via-Babel** — prototypes showing the intended look and behavior. They are **not production code to copy directly.** The task is to **recreate these designs in the target codebase's environment** (e.g. React Native / Swift for mobile, React/Vue for web) using its established patterns, component library, navigation, and state management. If no environment exists yet, choose the most appropriate framework for the product and implement there.

The prototypes use inline-styled React function components transpiled in-browser with Babel. Treat the JSX as a precise spec for structure, tokens, and behavior — not as files to ship.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, radii, shadows, copy, and interactions are all intentional. Recreate the UI faithfully using the codebase's own primitives, matching these tokens and measurements closely.

---

## Core Concept: The "Level" system (progressive disclosure)
Homehub reveals features as a home "grows," to keep first-run calm. There are three levels, set in Settings:

- **Simple** — Home, Items, Tasks, Ask, Settings. Just this week's tasks + items.
- **Standard** — adds **Home upkeep** (recurring home-level tasks) on Home, plus Warranties and Cleaning surfaces.
- **Advanced** — adds **deep-clean guides**, a tasks calendar, and **Service providers**.

On **mobile** the level changes *in-screen content* (the bottom tab bar is fixed at 5: Home · Tasks · Items · Ask · Settings). On **desktop** the level changes *navigation destinations* (the nav grows: Home · Tasks · Items · Clean · Warranties · Providers · Ask). Implement the level as a single piece of app state that gates surfaces on both platforms.

---

## Design Tokens

### Color — Light theme
| Token | Hex | Use |
|---|---|---|
| Brand / primary (teal) | `#1B6B5A` | Primary actions, active nav, accents |
| Teal deep | `#15564A` | Pressed/ink-on-wash teal |
| Teal wash | `#EAF3EF` / `#E8F2EF` | Soft teal backgrounds, glyph tiles |
| Ink (text primary) | `#0B1220` | Headings, body |
| Sub (text secondary) | `#6B7280` | Subtitles, meta |
| Faint (text tertiary) | `#9AA6A2` | Timestamps, hints |
| App background | `#F3F5F4` | Screen background |
| Surface | `#FFFFFF` | Cards, sheets |
| Hairline | `rgba(15,23,42,0.07–0.10)` | Dividers, card borders |
| Dark hero / CTA panel | `#0E2E27` | Inverted promo blocks |

### Color — Tiers (task priority; calm, never alarmist red)
| Tier | fg | soft bg | Label |
|---|---|---|---|
| Essential | `#C2410C` (clay) | `#FBF1EC` | ESSENTIAL |
| Recommended | `#1B6B5A` (teal) | `#E8F2EF` | RECOMMENDED |
| Optional | `#5B748F` (slate) | `#F1F5F8` | OPTIONAL |

> Note: the old design used alarmist red/amber/blue tiers — **do not reintroduce red.** Overdue is shown in clay `#C2410C`, never pure red.

### Color — Accents
| Token | Hex | Use |
|---|---|---|
| Gold (warranty/seasonal text) | `#8A5A12` (mobile), `#7A5A18` (desktop) | Seasonal tag, warranty, due-soon — darkened for AA contrast |
| Gold soft | `#FBF3E2` | Seasonal/warranty chip bg |
| Slate (safety notice) | `#5B748F` | Recall/safety notices |

### Color — Dark theme (mobile `hh-dark.jsx`, desktop `dtTheme(true)`)
| Token | Hex |
|---|---|
| bg | `#0D1411` |
| surface | `#161E1A` |
| raise | `#1E2A24` |
| ink | `#F1F5F3` |
| sub | `#8B9A93` |
| teal (brightened) | `#34B093` |
| teal wash | `rgba(52,176,147,0.16)` |
| clay | `#E8956A` · gold `#D9B978` · slate `#8FB0CC` |

### Typography
- **Font family**: system stack — `-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Inter", system-ui, sans-serif`. Use the platform's native font (SF on iOS, Roboto on Android) or Inter on web.
- **Scale (cozy density, mobile)**: big/H1 ≈ 26–30px / 800; section title ≈ 17–22px / 800; body ≈ 15–16px / 600; small ≈ 13–13.5px; micro/labels ≈ 10.5–12px / 700 uppercase, letter-spacing 0.4–0.6.
- **Headings**: weight 800, letter-spacing −0.4 to −0.8, line-height ~1.1–1.25, `text-wrap: balance`.
- **Body**: weight 500–600, line-height 1.4–1.55, `text-wrap: pretty`.
- **Mono** (serials, counts, dates): `"SF Mono", ui-monospace, "JetBrains Mono", Menlo, monospace`.

### Density scale (`dens()` in `hh-data.jsx` — mobile)
Three densities (spacious/cozy/compact) drive `pad`, `cardPad`, `gap`, `stack`, `radius`, `tap`, `rowPy`, `body`, `small`, `big`. Cozy is the default. Key cozy values: card radius ~18, card padding ~16, screen padding ~16–20, row vertical padding ~13, tap target base ~36–44. **Minimum tap target 40–44px.**

### Radius / shadow
- Card radius: ~14–18px; pills/chips: 99px (full); glyph tiles: 9–16px.
- Card shadow (light): `0 1px 2px rgba(15,23,42,0.05)`; raised: `0 6px 24px rgba(11,26,22,0.08)`.

### Iconography
- **Lucide** icon set throughout (`lucide@latest`). Stroke width 2–2.6. Key semantic icons: house (brand/home), package (Items), list-checks (Tasks), **sparkles (Ask — the assistant, used consistently both platforms)**, settings, shield-check (warranty), megaphone (recall/safety), spray-can (clean), wrench (providers), wind (HVAC), leaf (seasonal), repeat (recurring), book-open (manual), alarm-clock (snooze).

### Brand mark
A rounded-square teal tile (radius ≈ 30% of size) containing a white `house` glyph, followed by the wordmark "Homehub" (weight 800, letter-spacing −0.5).

---

## Navigation

### Mobile — fixed bottom tab bar (5 tabs)
`Home · Tasks · Items · Ask · Settings`. Tasks is the 2nd tab. Active tab = teal icon+label; inactive = sub gray. Tab bar has a translucent blurred background (`rgba(243,245,244,0.85)`, backdrop-blur).

### Desktop — top bar (default) OR left sidebar (optional)
- **Top bar** (default): wordmark + nav tabs + search (`⌘K`) + "Add item" + bell + settings + avatar, on one 60px row.
- **Left sidebar** (offered as an advanced option in Settings): 244px rail, wordmark, vertical nav, a "Homehub level" badge, and a profile/settings footer.
- Nav destinations grow with level via `navFor(level)`: home, tasks, items (Simple) → +clean, +warranties (Standard) → +providers (Advanced). Ask + Settings always present.

---

## Screens / Views

> Each is implemented as one or more artboards. Below: purpose + layout + key components. Exact styling lives in the referenced `.jsx` files.

### 1. Home (`hh-home2.jsx` → `RefinedHome`; desktop `dt-screens-a.jsx` → `DesktopHome`)
- **Purpose**: the day's focus — greeting, the single most-imminent task (hero), an upcoming agenda, and level-gated sections.
- **Mobile layout**: scrolling column — greeting header (date eyebrow in teal uppercase + "Good morning, Barb" H1) → **Focus/hero task card** (tier chip, due+mins, item glyph, title, expandable "See how" with why/supplies/steps/manual snippet) → **Upcoming** agenda (timeline of task cards, each expandable) → level-gated **Home upkeep** + **Deep-clean guides** + **Good-to-know notices**.
- **Desktop layout**: two-column — main (stat cards row, Focus card, Agenda, level sections) + side rail (week strip, notices, guides).
- **Tier chip**: pill with colored dot + uppercase label (Essential/Recommended/Optional).

### 2. Home upkeep (`hh-advanced.jsx` → `HomeUpkeep`; desktop `DesktopHomeUpkeep`)
- **Purpose**: the due-soon slice of recurring **home-level** tasks (smoke alarms, furnace service, pest control) — the same model as Settings → Custom tasks. Live rows.
- **Row** (mobile, 2-line, no glyph to avoid crowding): check circle (24px) · title (wraps; inline leaf icon if seasonal) · subline "`{cadence} · Due in {n}`" (gold if ≤10 days) · snooze icon (40px tap target). A **suggestion** row at the bottom (sparkles + title + "Add" → confirm cadence → becomes live). Header "Home upkeep" + "Manage" link → Custom tasks manager.
- Completing reschedules; seasonal items show a "Seasonal" treatment.

### 3. Tasks → **This week** unified agenda (`hh-week.jsx` → `WeekAgenda`)
- **Purpose**: one proactive weekly view merging **appliance upkeep + home upkeep + cleaning**.
- **Layout**: H1 "This week" + count/mins summary → segmented toggle **By day** (default) / **By type** → grouped cards.
  - *By day*: sections Today / Tomorrow / weekday (date + count), task rows within.
  - *By type*: sections Appliance upkeep / Home upkeep / Cleaning, rows show their day.
- **Row**: check circle · title (inline leaf if seasonal) · **source chip** (Appliance=teal/package, Home=gold/house, Clean=slate/spray-can) + "`{sub} · {mins} min`". Item-source rows open the task detail.
- (The older per-level Tasks views — list/filters/calendar in `hh-tasks.jsx` — are retained for reference but the live app uses the unified agenda.)

### 4. Items (`hh-items.jsx` → `ItemsTab`; desktop `DesktopItems`)
- **Purpose**: the home's appliances & fixtures.
- **Layout**: H1 + count → room/sort filter pills (All + per-room, with counts; sort by Room/Type/Recent) → grouped grid of item cards. **Card**: thumbnail glyph, name, brand, category/room, task-count, a colored dot if a task is due soon.

### 5. Item detail (`hh-items.jsx` / `hh-item-manage.jsx`; desktop `dt-screens-b.jsx` → `DesktopItemDetail`)
- **Purpose**: everything about one thing.
- **Layout**: header (large glyph, name, brand·model, safety/no-recall badge, key fields: Room/Serial/Purchased/Warranty/Category) → **tabs**: **Tasks** (expandable rows with manual-backed instructions), **Guides** (how-to + care knowledge + cleaning guides), **Fix it** (troubleshooting accordions), **Saved answers**, **Activity** (history). Side rail (desktop): warranty progress, **Manuals** (open viewer / Manage), specs, tags.
- **Manual viewer**: a faux-PDF reader with search/download + "Ask Homehub about this page."
- **Manuals manager**: add (upload/link → role → label → "reads it" → review extracted specs/care/fixes), set primary, rescan, delete.
- **Edit page** (desktop `DesktopItemEdit`): full form — photo, identity, location (room pills), purchase, warranty toggle, tags, delete.

### 6. Task detail / "full view" (`task-fullview.jsx` + `task-fullview-versions.jsx` → `FullViewB`; desktop `dt-shell.jsx` → `DesktopTaskDetail`)
- **Purpose**: the enriched, scannable task view (chosen "Reference" direction).
- **Contents**: header (glyph, tier chip, title, meta: time·item/room·due) → **recurrence strip** ("Repeats every 90 days · Next Sep 12") → why-it-matters → supplies with **"Add to list"** → steps → **"From your manual"** card (opens viewer) → **troubleshooting** ("If it goes wrong") → **Assignment** (only if home has >1 member) → **Notes** (user's own). Sticky **Mark done** + overflow (Snooze/Skip/Reassign).
- **Completion = "confirm next date"** (chosen P2-7 option B): Mark done opens a bottom sheet — "When did you do it?" (Today / a few days ago) + computed **Next due** date with +/− week adjust + Confirm. On confirm, a calm "Done · next due {date}" bar appears with Undo. Seasonal tasks anchor to a month; rolling tasks roll forward an interval.

### 7. Ask (`hh-ask.jsx`; desktop `DesktopAsk`)
- **Purpose**: AI assistant grounded in the user's manuals.
- **Layout**: every conversation has a **scope** (whole home, or one item) shown as a chip; answers **cite the source manual** and offer **"Save to {item}"** (saved answers attach to that item). Desktop: conversation rail + scoped chat + composer. Icon = **sparkles**.

### 8. Clean (`hh-clean.jsx`; desktop `dt-screens-c.jsx` → `DesktopClean`)
- **Purpose**: guided cleaning + how-to guides.
- **Flow**: hub (start/resume session + guide grid + this-week rail) → **guide reader** (why, cautions, supplies, checkable steps, manual snippet) → **guided session**: setup (rooms + time budget → sized checklist) → run (check off, expand steps, set aside) → celebratory **summary** with stats.

### 9. Warranties (`hh-warranty.jsx`; desktop `DesktopWarranties`)
- Coverage across the home, grouped Expiring soon / Active / Lapsed, with summary counts. Calm gold/teal/faint tones.

### 10. Service providers (`hh-providers.jsx`; desktop `DesktopProviders`)
- Trusted pros grouped by trade; provider detail with call/email/website, notes, and items they've worked on.

### 11. Settings (`hh-settings*.jsx`; desktop `DesktopSettings`)
- **Level** segmented control (Simple/Standard/Advanced) — the disclosure driver. Appearance (Light/Dark). Profile, Home profile, Rooms, **Home members** (with **Invite** modal: email + role + share link; recipient gets an accept-and-join screen), and managers: **Rooms** and **Custom tasks** (unified with Home upkeep; editor has a rolling-vs-seasonal cadence toggle).

### 12. Notifications (`hh-settings-sub.jsx` → `NotificationsScreen`)
- **Channel matrix** (chosen P2-9 option B): rows = event types (Task reminders, Warranty expiring, **Safety & recalls** — locked on), columns = **Push / Email** toggle cells. Plus Timing (Quiet hours, lead time). Recalls always delivered on all channels. (Weekly digest intentionally omitted for now.)

### 13. Add an item (`hh-additem.jsx` → `AddItemFlow`; desktop `DesktopAddItem`)
- **Flow**: identify (methods ordered by reliability — **scan rating label**, **type model** first; photo framed as best-effort) → confirm match → pick room → added. Then **background manual search**: on the "added" screen it auto-searches; resolves to **found** (View / Add manual) or — the realistic default — **not found** (falls back to upload). Receipt is the other optional step.

### 14. Onboarding (`hh-onboarding.jsx`; desktop `DesktopOnboarding`)
- Centered wizard: welcome → home type → what matters most → add first item → done. Picked concerns lead the Home screen afterward.

### 15. Auth (`hh-auth.jsx`; desktop `DesktopAuth`)
- Sign in / create / reset. **"Continue with Apple" / "Sign up with Apple"** (black button, real Apple logo) + magic-link option. Desktop is a split-screen (brand panel + form).

### 16. Landing / marketing (`hh-landing.jsx`; desktop `DesktopLanding`)
- Calm hero with a live-looking product preview, feature grid, 3-step how-it-works, CTA. (No fake customer testimonials/counts.)

### 17. Cross-app states (`hh-states.jsx`, `hh-empty.jsx`; desktop `DesktopLoading/Empty/Error`)
- **Loading** skeletons (shimmer), **empty** new-user state (one clear "add first item" action + short value props), **error** (reassuring, with retry — never red), **offline** (quiet banner, "showing last sync"). On desktop these route live via the "Home data state" tweak.

---

## Interactions & Behavior
- **Expand/collapse**: task & guide rows expand inline to reveal steps/why/manual. Chevron rotates.
- **Complete a recurring task**: opens the confirm-next-date sheet (see Task detail). Updates the schedule; shows next-due.
- **Snooze**: pushes due date (e.g. +2 weeks).
- **Add suggestion to schedule**: inline confirm of cadence → becomes a live task.
- **Manual search** (add item): ~1.8s simulated async → found/not-found branch.
- **Level up**: raising the level shows a calm sheet/toast naming exactly what appeared, with a way back down.
- **Tweaks panel** (prototype-only): both apps expose a Tweaks panel (density, level, appearance, connection/offline, nav paradigm, data state). This is a prototyping affordance — in production these map to real settings/state, not a floating panel.
- **Transitions**: gentle; respect `prefers-reduced-motion`. No infinite decorative loops.

## State Management
Key state to model in the target app:
- `level`: 'simple' | 'standard' | 'advanced' — gates surfaces/nav.
- `appearance`: 'light' | 'dark'.
- `activeTab` / current route; `sub`-navigation stack (item detail, task detail, managers, etc.).
- **Items**: id, name, brand, model, serial, room, category, purchased, warranty {ends, active, soon}, manuals[], specs[], care[], troubleshooting[], history[], tags[].
- **Tasks** (appliance): id, name, item, due (days), tier, mins, how-to {why, supplies[], steps[], manual snippet}.
- **Home upkeep / custom tasks** (unified model): id, title, cat, **recur: 'rolling' | 'seasonal'**, every (interval label) | season, area, due. Next-date computed on completion.
- **Cleaning**: tasks {room, mins, steps, caution}, guides, session {rooms, budget, done/skipped}.
- **Providers**, **members** (drives Assignment visibility), **saved answers** (attached to items), **notifications** prefs (per event × channel).
- **Multiple properties** (future, not yet built): a `properties[]` + `activePropertyId`; the whole app scopes to the active property (no cross-property merging).

## Assets
- **Icons**: Lucide (open-source). No custom illustration assets — item/category imagery uses Lucide glyphs on tinted tiles. Replace placeholders with real product imagery where available in production.
- **Fonts**: system fonts / Inter. No licensed fonts bundled.
- **Logo**: the house-tile + wordmark is drawn in code (see Brand mark) — recreate or supply a real SVG.

## Files
### Live apps (recreate these)
- `Homehub App.html` — mobile app shell + canvas. Loads, in order: `design-canvas.jsx`, `icon.jsx`, `tweaks-panel.jsx`, `hh-data.jsx`, `hh-frame.jsx`, `hh-home-data.jsx`, `hh-home2.jsx`, `hh-advanced.jsx`, `hh-items.jsx`, `hh-tasks.jsx`, `hh-ask.jsx`, `hh-settings.jsx`, `hh-settings-sub.jsx`, `hh-settings-managers.jsx`, `hh-auth.jsx`, `hh-landing.jsx`, `hh-help.jsx`, `hh-dark.jsx`, `hh-empty.jsx`, `hh-additem.jsx`, `hh-clean.jsx`, `hh-warranty.jsx`, `hh-item-manage.jsx`, `hh-providers.jsx`, `hh-careguide.jsx`, `hh-states.jsx`, `hh-onboarding.jsx`, `hh-parse.jsx`, `hh-levelup.jsx`, `task-fullview.jsx`, `task-fullview-versions.jsx`, `hh-week.jsx`, `hh-app.jsx`.
- `Homehub Desktop.html` — desktop app shell + canvas. Loads shared `hh-*` data files plus `dt-kit.jsx`, `dt-content.jsx`, `dt-screens-a.jsx`, `dt-screens-b.jsx`, `dt-screens-c.jsx`, `dt-shell.jsx`, `dt-flows-a.jsx`, `dt-flows-b.jsx`, `dt-manuals.jsx`.

### Shared infra
- `icon.jsx` (Lucide wrapper), `design-canvas.jsx` (canvas — prototype scaffolding only, **not** part of the product), `tweaks-panel.jsx` (prototype tweaks — not product).

### Explorations (reference only — see `explorations/`)
- `Homehub Feature Explorations.html` (+ `feat-shared/feat-due/feat-agenda/feat-notif.jsx`) — option sets for due-date math, the week agenda, and notifications. **Chosen & already integrated**: due-date = confirm-next-date (B), agenda = by-day default + by-type toggle (A+B), notifications = channel matrix (B, no weekly digest).
- `Homehub Future Features.html` (+ `feat-future.jsx`) — **not yet built**: multiple-properties switcher (3 options) and task→pro handoff (saved / find flows). Documented here for the roadmap.

### Notes for the developer
- `design-canvas.jsx` and `tweaks-panel.jsx` are **prototyping scaffolds** — do not port them. The real app is the screen components inside the artboards.
- Read components as specs: structure + tokens + behavior. Use the target codebase's component library, navigation, and state tools.
- Keep the **calm tier system** (no alarmist red) and the **level-based progressive disclosure** — they're central to the product's character.
