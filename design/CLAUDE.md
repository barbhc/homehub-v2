# CLAUDE.md — Homehub Redesign Handoff

You are implementing the **Homehub** redesign (mobile + desktop) in a real frontend codebase. This repo is a **design handoff**, not shippable code. Read this first, then `README.md`.

## Start here
1. Read **`README.md`** — full design system: tokens, the level/disclosure system, all 17 screens (layout + components + copy), interactions, and the state model.
2. Open the two **canvas HTMLs** in a browser to see the *actual* live prototypes:
   - `Homehub App.html` — mobile (iOS-style), the primary experience.
   - `Homehub Desktop.html` — responsive desktop, same design language.
   Each is a pan/zoom canvas of artboards (one per screen/state). The first artboard(s) are the interactive app shell; the rest document every screen and state.
3. Read the **`.jsx` files as precise component specs** — structure, exact tokens, and behavior. They are inline-styled React-via-Babel prototypes; treat them as the source of truth for layout and measurements.

## How to build
- **Recreate** these designs using the target codebase's own framework, component library, navigation, and state tools. Do **not** copy the prototype JSX into production — read it as a spec and rebuild idiomatically.
- Match tokens and measurements closely (high fidelity): colors, type scale, spacing/density, radii, shadows, copy, and interactions are all intentional.
- If no app environment exists yet, choose the most appropriate stack for the product (e.g. React Native / Swift for mobile, React for web) and implement there.

## Do NOT port these (prototype scaffolding only)
- `design-canvas.jsx` — the pan/zoom canvas harness that frames the artboards.
- `tweaks-panel.jsx` — the floating Tweaks panel (density/level/appearance/etc.).
These are prototyping affordances. In production, the "tweaks" map to **real app state/settings** (theme, level, etc.), not a floating panel. Build the **screen components inside the artboards**, not the harness around them.

## Two non-negotiable product principles
1. **Calm tier system — never alarmist red.** Task priority is Essential (clay `#C2410C`) / Recommended (teal `#1B6B5A`) / Optional (slate `#5B748F`). Overdue is clay, never pure red. Do not reintroduce the old red/amber/blue tiers.
2. **Level-based progressive disclosure.** One piece of app state — `level: simple | standard | advanced` — gates surfaces. Mobile changes in-screen content (bottom tabs stay fixed at 5); desktop grows the nav destinations. Keep this central.

## File map
### Mobile (`Homehub App.html` loads, in order)
`design-canvas.jsx`, `icon.jsx`, `tweaks-panel.jsx`, `hh-data.jsx`, `hh-frame.jsx`, `hh-home-data.jsx`, `hh-home2.jsx`, `hh-advanced.jsx`, `hh-items.jsx`, `hh-tasks.jsx`, `hh-ask.jsx`, `hh-settings.jsx`, `hh-settings-sub.jsx`, `hh-settings-managers.jsx`, `hh-auth.jsx`, `hh-landing.jsx`, `hh-help.jsx`, `hh-dark.jsx`, `hh-empty.jsx`, `hh-additem.jsx`, `hh-clean.jsx`, `hh-warranty.jsx`, `hh-item-manage.jsx`, `hh-providers.jsx`, `hh-careguide.jsx`, `hh-states.jsx`, `hh-onboarding.jsx`, `hh-parse.jsx`, `hh-levelup.jsx`, `task-fullview.jsx`, `task-fullview-versions.jsx`, `hh-week.jsx`, `hh-app.jsx`

### Desktop (`Homehub Desktop.html`)
Shared `hh-*` data files + `dt-kit.jsx`, `dt-content.jsx`, `dt-screens-a.jsx`, `dt-screens-b.jsx`, `dt-screens-c.jsx`, `dt-shell.jsx`, `dt-flows-a.jsx`, `dt-flows-b.jsx`, `dt-manuals.jsx`

### Key screen → file
- Home → `hh-home2.jsx` (`RefinedHome`) / `dt-screens-a.jsx` (`DesktopHome`)
- Home upkeep → `hh-advanced.jsx` (`HomeUpkeep`) / `DesktopHomeUpkeep`
- Tasks (unified "This week" agenda) → `hh-week.jsx` (`WeekAgenda`)
- Items / Item detail → `hh-items.jsx`, `hh-item-manage.jsx` / `dt-screens-b.jsx`
- Task full view (confirm-next-date on complete) → `task-fullview*.jsx` / `dt-shell.jsx` (`DesktopTaskDetail`)
- Ask → `hh-ask.jsx` / `DesktopAsk`
- Clean → `hh-clean.jsx` / `dt-screens-c.jsx`
- Warranties → `hh-warranty.jsx`; Providers → `hh-providers.jsx`
- Settings + managers → `hh-settings*.jsx` / `DesktopSettings`
- Notifications (channel matrix) → `hh-settings-sub.jsx` (`NotificationsScreen`)
- Add item (background manual search) → `hh-additem.jsx` / `DesktopAddItem`
- Onboarding / Auth (Apple sign-in) / Landing → `hh-onboarding.jsx` / `hh-auth.jsx` / `hh-landing.jsx`
- States (loading/empty/error/offline) → `hh-states.jsx`, `hh-empty.jsx`

### `explorations/` — roadmap, NOT built into the live apps
Option canvases for: due-date math, the week agenda, notifications (these three are **chosen & already integrated** into the live apps — see README), plus **multiple properties** and **task → service-provider handoff** (designed, **not yet implemented**). Use only when you're told to build those features.

## Suggested first prompt
> Read `README.md`, then recreate `Homehub App.html` in <stack>, starting with Home, Items, and the Tasks "This week" agenda. Match the tokens exactly and keep the level system + calm tiers.
