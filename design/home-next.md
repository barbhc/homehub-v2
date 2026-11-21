# Home: one task, then what Tasks can't show

Owner-approved 2026-11-21: "I agree with your home pick and the sequence of areas
that you've proposed." Mock: https://claude.ai/artifact/YYnjqdE9ZLfHxH5i7hvR65
(Home tab, "My pick"). Supersedes the one-list Home of `design/home-focus.md`.

## Why

Home's five rows were the first five rows of Tasks (app audit, 2026-11-21). Each tab
now answers its own question; Home's is "what's the one thing today, and what should
I know about my home?"

## Order (mobile top to bottom; desktop two columns, same order down the left first)

| Section | Shows | When it hides |
|---|---|---|
| Ask | one text field and a send button; typing and sending opens Ask with the question asked (`/chat?q=`). Starter chips stay for early homes | never |
| **Next up** | the week's first task as the task card (`design/task-card.md`): status line, title (Title 3), item and minutes, supply, Mark done + Snooze, arrow to the task page. Under it "N more this week ›" to Tasks | replaced by "Nothing due this week" + the next date when the week is empty |
| **Heads up** | a decision waiting or a date within 60 days: a recall on an item, a manual ready to review, a warranty ending within 60 days | hides when empty |
| **Coming up** | up to three tasks after this week, each with a date tile. A window shows its month only ("JUL"); a real deadline shows the day too. "Calendar" link to Tasks | hides when empty |
| (existing next-step slot) | "What's in your home?" for early homes, or "This month at your home" | as today |
| **In a pinch** | fixed: Water shutoff, Gas shutoff, Breaker panel (from house notes whose heading names them), then Your pros (saved providers for plumbing, electrical, heating). An empty row says "Add" | never |
| **Pinned by you** | house, room or item notes the household pinned (a pin on each note row) | hides when nothing is pinned |

Coming up's month-only tile keeps the due-windows rule (`design/due-windows.md`):
a window must never be shown as a day it doesn't have. The mock showed "JUL 1";
the build shows "JUL" for windows.

## Data

- **Pinned:** one new optional field on `homes/{homeId}/careNotes/{noteId}`:
  `pinnedAt` (timestamp, or absent/null = not pinned). Members can already write
  notes; no rules change. Pinning doesn't touch `updatedAt` (it isn't an edit).
- **In a pinch:** read-only over existing house notes (`splitNote` heading) and
  `serviceProviders` (`category`). "Gas shutoff" joins `HOUSE_IDEAS`.
  "Add" opens House notes with that idea's composer open (`/inventory/notes?idea=`).
- **Heads up:** existing feeds only: `notices.recalls`, the scan tray's `ready`,
  `timelyWarranty`.
- **Coming up:** the dashboard's existing `upcoming` list.

## Edge cases

1. **A brand-new home** (no items, no notes, no providers): Next up, maybe Coming
   up, and In a pinch with every row saying "Add". Heads up and Pinned hidden.
2. **A note titled "Water shutoff" written in a room, not the house:** In a pinch
   reads house-scope notes only; a room note never fills a house-wide shutoff.
3. **Two notes headed "Water shutoff":** the most recently updated one wins.

## Failure modes

- **Notes or providers fail to load:** In a pinch says "Couldn't load these. Try
  again" in place. It must never show "Add" for a row it couldn't read; that
  would tell someone their shutoff isn't noted when it is.
- **Pinning fails:** the pin control says so on the row and the note stays as it was.
- **Mark done / Snooze fails on Next up:** the error shows on the card (as today).

## Done means

- Mobile and desktop Home show the sections in this order, each hiding as above.
- Absence tests: no "This week" list on Home (not rendered); Heads up and Pinned
  not rendered when empty; In a pinch never renders "Add" after a failed read.
- Built screens beside the mock; all four emulator suites green.
