# Add an item — the canonical flow

**This is the agreement. Check any change to the add-item flow against it, and
amend it in the same PR when a redesign changes what the flow is.**

Owner, 2026-08-26: *"it's good to keep a canonical version of the add item flow,
since it's been redesigned so often, and has been the source of days of bugs and
drift. Use this as part of the eval with any change to the add item flow and
update it when redesigns and fixes amend this flow."*

## Why this file exists

Six reports of reaching a screen a later redesign was supposed to replace, across
seven rounds. Every fix landed on the screen that was reported, and the next
report came from a door nobody had listed.

The drift was not carelessness in any single change. It was that **there was no
one place saying what the flow is**, so each fix got judged against the last
screenshot instead of against the whole. A rule agreed in round 11 could be
undone in round 15 by someone — me — who had no way to notice.

Every rule below cites the report that established it. If a change would break
one, that is not automatically wrong, but it **must be a decision, not a
side effect**, and this file must change with it.

Rendered version with every screen drawn:
https://claude.ai/code/artifact/9da89320-5023-48d8-838d-4e357ba3fd3b

---

## Entry — one door

`/inventory/add`, rendered by `SmartAddItem`.

- **Only `SmartAddItem` creates items.** The old onboarding route redirects
  here; `/inventory/:id/setup` was a second wizard and is deleted. — HH-81
- Pinned by `src/lib/retiredDesigns.test.ts`, which fails if a second creator
  appears.

## Screen 1 — Lane chooser

"What are you adding?"

- **Appliance or device** — has a brand & model; leads to a manual.
- **Everything else** — a name is enough; **no manual step at all**.
- The chooser is a **state, not a route**, which is why Back exists on the next
  screen and why removing it would strand anyone who picked the wrong lane. — HH-110

## Screen 2 — Identify it (appliance lane)

- **Two fields and nothing else.** No stepper anywhere in the flow. — HH-110
- The subtitle names **both routes** before either is used: type the brand and
  model, or scan the label. — HH-123
- Scanning is a **first-class choice** under an "or" rule — never buried under
  "Can't find the model?", which framed the camera as what you do after
  failing. — HH-123
- A label photo **overwrites** brand and model, and the two move **as a pair**.
  Taking one field from the photo and one from memory manufactures a product
  that does not exist. — HH-139
- The nameplate **never sets the item's name** in this lane. — HH-112, HH-125
- Rarer routes stay folded under "More ways to identify it". — HH-123
- A matched product shows its specs as **suggestions, never auto-applied** — a
  hallucinated filter size could have someone buy the wrong part. — HH-114
- **OPEN (HH-138):** the card must not claim a manual was found. Identifying an
  item is not finding its manual.

## Screen 2 — Simple lane

- Name-first. On confirm the wizard **ends immediately at the item page** — no
  manual step.

## Screen 3 — Add the manual (appliance lane only)

- The subtitle carries **the brand and model just typed**, and Back returns to
  them. — HH-130
- **Upload leads** and holds the only filled button. — HH-109, HH-115
- Paste a link says it **must end in .pdf**, and offers a pre-filled Google
  search for this exact model. — HH-129
- "Let us find it" is **last, muted, badged Beta**, and says how it goes
  wrong. — HH-107, HH-115
- **Zero-byte files are refused** before any upload or AI spend. — HH-128
- At capacity the button **stands down** and says the scan is queued and will
  start itself. — HH-124, HH-131
- "I'll add it later" ends the wizard **at the item page**, never at a retired
  step. — round 14 audit

## The wizard ends here

The scan is **started and never awaited**. The worker runs server-side; the item
page watches it.

- Leaving is safe and **said out loud** on every surface showing a live
  scan. — HH-116, HH-117
- The tray **stands down** on a page already showing that scan. — HH-118

## The item page — where the value arrives

- **The name is the first thing.** The photo is a 44px control beside it, never
  a block above it. — HH-136
- Renaming lives **on the name**. — HH-125
- Scanning shows **one line and an indeterminate rail**, not a paragraph. The
  rail sweeps rather than fills: we know the page count, not how far through
  them the model is. — HH-135
- Purchase, warranty and category fields live in **Details & records**,
  scrollable to the last field with the keyboard open. — HH-96, HH-111, HH-133
- Category fields **match the category** — no fuel type on a microwave. — HH-133
- **OPEN (HH-141):** needs a third state — *has a manual, nothing scheduled*.
  Today a finished-but-uncommitted parse is neither parsed nor parsing, so the
  page offers to add the manual it just read.

## The review — the one decision

- **A sheet may interrupt for a DECISION, never for an announcement.** With
  maintenance it opens; without, a card reports. — HH-121, HH-127
- Opens on **the schedule screen**, focused on maintenance. That is the
  **default**, not a prop a caller might forget. — HH-119
- **Exactly one review** is ever mounted. — HH-120
- It never claims rows are saved while the button underneath is what saves
  them. `runParse` writes `previewDraft` only; `commitDraft` is what
  saves. — HH-134
- When nothing needs a reminder it **says why**: no maintenance was
  found. — HH-137
- **OPEN (HH-140):** "Review them all" leads to step 1, which no redesign has
  ever reached — emoji instead of tier rails, two competing primaries, a
  cryptic `◦ ×`, and "Save all 8" under a line saying nothing needs a schedule.

---

## What guards this

| Guard | Catches | State |
|---|---|---|
| `src/lib/retiredDesigns.test.ts` | Anything rendering a deleted component, a retired route, or a resurrected wizard step | live |
| `src/components/manuals/TaskReviewSheet.saved.test.tsx` | A screen claiming rows are saved while offering the button that saves them | live |
| `src/components/smart-add/addFlowCopy.test.ts` | Copy and step-union drift | live |
| Journey walks + their `snap()` notes | Visual drift — but ONLY if the note states the requirement rather than describing the screen | live |
| **This file** | A change quietly undoing an earlier agreement | new |
| A no-maintenance manual in the seed | **MISSING.** Every one of the five repeated reports came from a state no test visits, because the seed only has manuals that produce maintenance | gap |

The last row is the most valuable thing on this page. Fixing it would have
caught five reports before the owner saw any of them.

## Amending this file

1. If a change alters what the flow **is**, edit this file in the **same PR**.
2. Cite the report or decision that authorised it, the way every rule above does.
3. If the change breaks an existing rule, say so explicitly in the PR body —
   "this supersedes HH-nnn because…". A rule silently disappearing is the exact
   failure this file exists to prevent.
