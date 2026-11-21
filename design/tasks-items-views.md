# Tasks and Items get views — Clean and Warranties move in

_Owner-approved 2026-11-21 (the "Structure" tab of the structure mockups:
real app pages, edited). What moved, and why._

## Why

Clean and Warranties were pages of their own. On a phone neither had a tab, so
each was reachable only from a link somewhere else; on desktop each was a
level-gated header entry beside Tasks and Items. But both are a second way of
looking at a page that already had a tab — cleaning is upkeep you do, a
warranty is a fact about an item you own. Apple's HIG has a control for
exactly that: a **segmented control** switches between closely related views
of one screen (equal-width segments, noun labels, no more than five on iPhone).

## What moved

| Was | Now | Old address |
|---|---|---|
| Clean page (`/clean`) | **Tasks → Cleaning** (`/maintenance?view=cleaning`) | redirects (replace) |
| Warranties page (`/warranties`) | **Items → Warranties** (`/inventory?view=warranties`) | redirects (replace) |
| Desktop nav: Clean, Warranties | — (removed; Providers remains) | |

- **One control, shared:** `src/components/ui/SegmentedControl.tsx`. Each
  segment is ≥44pt and takes an equal share; the selected one is raised on the
  surface fill. It is a tab list for assistive tech (`role="tablist"`/`"tab"`,
  `aria-selected`), with one Tab stop and arrow/Home/End keys.
- **The view lives in the URL** (`src/hooks/usePageView.ts`): `?view=` on the
  page's own path, absent for the page's first view, so `/maintenance` and
  `/inventory` are exactly what they were. Switching replaces the history
  entry — it is looking at the page another way, not going somewhere.
- **Tasks: Upkeep | Cleaning**, under the "Tasks" title and count, phone and
  desktop. Upkeep is the agenda, unchanged. Cleaning is Clean's "Start
  cleaning" card and its cleaning guides; the count reads "N cleaning guides";
  Upkeep's lenses (Urgency/Room/Item/Calendar), priority filter and desktop
  calendar aside are not drawn. Clean's own **"This week" list is gone** — the
  week is one list, in Upkeep. (The item-scoped cleaning it used to surface is
  still in every cleaning session's checklist and in each appliance's guide;
  the agenda withholds it by the 2026-07-29 taxonomy, and its footer — "N
  cleaning jobs for your items live in **Cleaning** →" — links to the view.)
- **Items: Items | Warranties**, under the "Items" title. Items is the list,
  unchanged. Warranties is the old page without its own title and subtitle,
  drawn from the items and rooms the Items page already read (no second read).
  With **no items** the page is the "Add your first item" lane chooser and the
  control is not shown.
- `/clean/:itemUnitId` (an appliance's cleaning guide) stays a page; its empty
  state's link reads "Back to Cleaning" and goes to the view.

## How it is built

Phone and desktop trees are both mounted (CSS shows one), so each draws its own
header and control, and the page mounts the second view's content **once**
below both — `Maintenance.tsx` → `CleaningView` (`pages/DeepClean.tsx`),
`Inventory.tsx` → `WarrantiesView` (`pages/WarrantiesPage.tsx`). The guides are
read through one SWR key (`useCleaningGuides`) shared by the count line and the
list, so a visit costs one read and there is one cleaning session, not two.

## Edge cases

1. **A link to the old address** (a bookmark, Home's own links while Home is
   rebuilt in parallel): the redirect lands it on the view; Back skips the
   redirecting address. `retiredDesigns.test.ts` lists the Home files still
   linking `/clean` / `/warranties` — shrink it as they move to the constants.
2. **A cleaning session under way, then Upkeep:** the session ends (it lived
   only in the page's memory, as it did when leaving `/clean`); the hub offers
   "Start cleaning" again.
3. **`?view=` with an unknown value:** the page's first view.

## Failure modes

- Guides read fails: the view says "Couldn't load your cleaning guides." with
  Try again; the count line says nothing (never "0 cleaning guides").
- Items read fails: the Items page's own failure state; there is no Warranties
  view to show and no control.

## Done means

The control switches views and writes `?view=`; `/clean` and `/warranties`
redirect; Cleaning renders no "This week" list and none of Upkeep's controls;
Items shows no control at zero items; the nav has no Clean or Warranties entry
— each pinned in unit tests (`Maintenance`, `Inventory`, `viewRedirects`,
`AppLayout`, `SegmentedControl`) and in `e2e/emu/clean.spec.ts` /
`warranties.spec.ts`.
