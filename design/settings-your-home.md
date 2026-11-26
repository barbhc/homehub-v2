# Settings is a menu; the house has one page

_Owner-approved 2026-11-21 (the "Structure" mockups, screens 3 and 4: real app
pages, edited). Audit findings 9, 10, 11 and 12. What moved, and why._

## Why

Settings was about ten phone screens: twenty sections down one page, in one
2,160-line component. Most of it was not a setting. Five places described the
home, rooms and custom tasks were managed far from the lists they change, a
three-way "interface" picker competed with the task level, and two pages
("Your reminders", "Your week") were reachable only from a card at the bottom.

Now Settings is **one short menu**. A row opens a page. What was never a
setting lives where it is used.

## The menu (`/settings`)

Rows are `ListSection` / `ListCard` / `ListRow` (`components/layout/RowList.tsx`),
the same list Home and Your home use. One column, 640px at most, on every width;
the desktop "On this page" rail is gone.

| Group | Row | Second line or value | Opens |
|---|---|---|---|
| | Account (the person's name, or "Your account") | email | `/settings/account` |
| This home | Your home | "Zip, home type, shutoffs and notes" | `/your-home` |
| | Pros | "N saved", or "Your trusted pros" | `/providers` |
| | Members | "Just you" or "N people" | `/settings/members` |
| | Task level | Essential only / Recommended too / Everything | `/settings/task-level` |
| | Homes | this home's name | `/settings/homes` |
| App | Notifications (only where the device can get pushes) | On / Off | `/settings/notifications` |
| | Appearance | Light / Dark / System | `/settings/appearance` |
| Your data | Export your data | | `/settings/export` |
| | Data & privacy | | `/settings/privacy` |
| | Report a problem | | `/settings/help` |
| Internal (only with `dev_tools`) | Internal tools | | `/settings/internal` |
| | **Sign out** (clay, full width) | | |

**A row only says what was read.** A count or level that is still loading, or
that failed to load, is left off the row and the failure is logged. "Just you"
over a members read that failed would be a confident wrong answer.

## The pages (`/settings/:pane`)

`account`, `members`, `task-level`, `homes`, `notifications`, `appearance`,
`export`, `privacy`, `help`, `internal`. Each is `SubPage`: a 44pt "‹ Settings"
link, the page's name as the h1, then the section that used to sit on the long
page, with its own heading removed where it repeated the h1. An unknown pane
goes back to the menu.

`pages/Settings.tsx` only decides which page an address means. Each pane is a
component under `components/settings/` with its own state, reads and failure
handling, moved without changing how it saves, loads or rolls back.

`internal` holds what only the team uses: Beta features, the manuals list with
its bulk rescan, startup diagnostics, admin tools. Without `dev_tools: true` on
the person's prefs doc there is no row, and the address returns to the menu.

## Your home (`/your-home`, finding 10)

One page for what Homehub knows about the house; it was five places (Home
profile and "Your home" in Settings, House notes under Items, House rules, and
the setup questions at `/home-setup`). Top to bottom: **The basics** (home
type, own or rent, zip, with the county and climate in one line under them),
**What it has** (the yes/no questions behind whole-home care,
`design/care-library.md`), **Suggested for your home** once an answer could
have unlocked something, **In a pinch** (water shutoff, gas shutoff, breaker
panel), **Notes**, **Rules**. A row opens the editor that already existed, and
which editor is open rides in the URL (`?part=basics`, `?part=rules`,
`?part=<category>`), so Back closes it and other screens link straight to one.

## What moved

| Was in Settings | Now | Opened by |
|---|---|---|
| Home profile, "Your home" card, House rules | **Your home** (`/your-home`), with House notes | Settings → Your home; Home's banner |
| Rooms | **Rooms** (`/inventory/rooms`, `RoomsManager`) | "Edit rooms" under the Items list |
| Custom tasks | **Your own tasks** (`/maintenance/custom`, `OwnTasksManager`) | "Add your own task" under the Upkeep list |
| Service providers card | the Pros page it already linked to | Settings → Pros |
| Manuals, Beta features, diagnostics, admin tools | Settings → Internal tools | `dev_tools` only |

**Your own tasks** replaces two forms. Settings' "Custom tasks" created a
cleaning task without saying so; Your home's "Add something the library missed"
created an upkeep task. The one form asks **Shows in: Upkeep** (default,
`addCustomHomeTask`, now with optional minutes) **or Cleaning**
(`saveRoutineTask`, as Settings always did). The list and delete are unchanged.

**Pending the owner's look:** the two entry links, "Edit rooms" and "Add your
own task", were not in the approved mock. They are quiet text links after each
list, in the phone tree and the desktop tree. Also not in the mock: the
Internal row, the wording of the Notifications page where pushes are
unsupported ("This browser can't show Homehub notifications."), and the
"Shows in" control's look.

## What was removed

- **The Simple / Standard / Advanced picker** (finding 11). Everyone gets what
  Standard gave: the level derived from the home (`useUserLevel`). The stored
  choice (localStorage `homehub:interface-level`, prefs `interface_level`) is
  read by nothing, so someone who had picked Simple or Advanced is on the
  derived level too. `InterfaceLevelSection` is on the retired list.
- **The "Feature tour" restart card.** The tour itself is untouched.

## What is parked

**"Your reminders" (`/reminders`) and "Your week" (`/week`)** (finding 12).
Their Settings card is gone and no route renders them. The files
(`pages/YourReminders.tsx`, `pages/YourWeek.tsx`) and their unit tests stay.

- `/reminders` redirects to Settings → Notifications; `/week` redirects to Tasks
  (`lib/viewRedirects.ts`, `PARKED_REDIRECTS`). The weekly-summary and
  buy-ahead pushes still say `/week?home=…`; they land on Tasks for that home.
- Untouched: the per-task reminder bell, and the whole Notifications page,
  weekly-summary switch included.
- **Lost with it for now:** "Buy first", the list of parts to buy for this
  week's tasks, was only on Your week.
- **To restore one:** lazy-load the page in `App.tsx`, add its `<Route>`, and
  remove its line from `PARKED_REDIRECTS` (`retiredDesigns.test.ts` and
  `viewRedirects.test.tsx` pin the parked state and will say what else to
  change). Add a row or link that opens it; `e2e/emu/your-week.spec.ts` and
  `your-reminders.spec.ts` are in git history at 49b6ebf.

## Old links

`/settings#<anchor>` redirects (replace) to where the section lives
(`lib/settingsPaths.ts`); in-app links name the new address directly.

| Anchor | Lands on |
|---|---|
| `#account` `#members` `#homes` `#appearance` `#privacy` `#task-level` `#notifications` | `/settings/<same name>` |
| `#data` | `/settings/export` |
| `#reminders` | `/settings/notifications` |
| `#home-profile` | `/your-home?part=basics` |
| `#home-setup` | `/your-home` |
| `#house-rules` | `/your-home?part=rules` |
| `#providers` | `/providers` |
| `#rooms` | `/inventory/rooms` |
| `#tasks` | `/maintenance/custom` |
| `#manuals` `#beta` `#level` | `/settings` |

`/home-setup` redirects to `/your-home`.

## Edge cases

1. **A home switch while a page is open.** Rooms and Your own tasks read by one
   function and land through one apply; an answer for the home just left lands
   nowhere, and an add started for home A is written to A and says nothing on B
   (`useIsCurrent`, `useDepsChanged`). The menu's counts are keyed by home.
2. **`/settings/internal` without the flag**, or before the flag is read:
   nothing is drawn until the prefs doc answers, then the address returns to
   the menu. A failed read counts as no flag, and is logged.
3. **A device that can't get pushes.** No Notifications row (as before). An old
   link can still open the page, which says so in one line instead of showing
   switches that do nothing.

## Failure modes

- A menu read fails (members, task level, providers, push state): the row
  shows no value; the failure is in the console with the home id.
- Sign out fails: "Couldn't sign out. Check your connection and try again."
  under the button, still signed in. (It was an unhandled rejection.)
- Rooms or own tasks can't be read: "Couldn't load…" with Try again, never an
  empty list. A refused add keeps what was typed; a refused rename keeps the
  editor open; a refused delete keeps the row. Each says so.
- Export: if any section, the manual list included, can't be read, nothing is
  downloaded and the page says so.

## Done means

The menu shows each row with a read value and omits one that failed; every
pane has its heading once and a way back; the dev-only row and page are closed
without the flag; every old anchor, `/reminders` and `/week` redirect; the
level ignores a stored override; Upkeep and Cleaning call their own service;
both entry links are in both trees. Pinned in `Settings.test.tsx`,
`Settings.failures.test.tsx`, `settingsPaths.test.ts`, `viewRedirects.test.tsx`,
`useUserLevel.hook.test.tsx`, `RoomsManager.*.test.tsx`,
`OwnTasksManager.*.test.tsx`, `ItemsEditRooms.test.tsx`, `DesktopTasks.test.tsx`,
`AppLayout.test.tsx`, `retiredDesigns.test.ts`, and on the emulator in
`e2e/emu/settings-menu.spec.ts`, `parked-pages.spec.ts`, `auth-home.spec.ts`.
