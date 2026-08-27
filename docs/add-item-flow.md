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
- The label **never sets the item's name** in this lane. — HH-112, HH-125
- **The words are the homeowner's, not the trade's.** The screen says *label*,
  never *nameplate* — that is what an installer calls it. It names *the brand
  and model*, the two fields on screen, never *both fields*, which describes our
  form rather than their appliance. — owner, 2026-08-27
- **The scan asks for the model number, not the whole label.** "Get the model
  number in the shot" is the instruction, in the control and in the recovery
  tips. The older "the label should fill most of the frame" was untrue and
  worked against itself: it makes people step back, and the read only ever
  needed the model number legible. — owner, 2026-08-27
- The scan control's camera icon sits **on the title line**, not in a tile to
  the left of the whole stack, so the two lines beneath get the full width. On a
  375pt phone the left tile left the first line about 5% of slack; moving it up
  gives roughly 35%. — owner, 2026-08-27
- Rarer routes stay folded under "More ways to identify it". — HH-123
- A matched product shows its specs as **suggestions, never auto-applied** — a
  hallucinated filter size could have someone buy the wrong part. — HH-114
- The match card describes the match in OUR vocabulary — the kind of thing, and
  the brand and model it matched on — never the resolver's raw string when that
  string is a page title ("Bosch SHPM65Z55N/01 Manuals"). Identifying an item is
  not finding its manual, and this screen may not claim one. — HH-138

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
- Three states, not two: no manual · being read · **read, nothing saved yet**.
  A finished-but-uncommitted parse is stage "done" with a null `parsed_at`
  (`commitDraft` is the only writer of it), and the third state holds the space
  without a button — the pickup card above owns that decision. — HH-141

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
- **Both steps are one design.** Step 1 is step 2's design applied to all six
  buckets, not a screen of its own: same rails, same section shape, same
  finding-first sentence, one filled primary. `TIER_RAIL` must define a colour
  for EVERY bucket — a bucket without one falls through to `copy.icon`, and that
  one omission is why step 1 kept the pre-round-10 emoji look through six
  rounds of redesign that all landed on step 2. — HH-140

---

## What guards this

| Guard | Catches | State |
|---|---|---|
| `src/lib/retiredDesigns.test.ts` | Anything rendering a deleted component, a retired route, or a resurrected wizard step | live |
| `src/components/manuals/TaskReviewSheet.saved.test.tsx` | A screen claiming rows are saved while offering the button that saves them | live |
| `src/components/smart-add/addFlowCopy.test.ts` | Copy and step-union drift | live |
| Journey walks + their `snap()` notes | Visual drift — but ONLY if the note states the requirement rather than describing the screen | live |
| **This file** | A change quietly undoing an earlier agreement | new |
| `src/components/manuals/TaskReviewSheet.stepone.test.tsx` | Step 1 drifting from step 2 — asserts every bucket has a rail, so a new bucket cannot reintroduce the emoji look on one door | live |
| `src/components/item-care/CareBlock.awaiting.test.tsx` | The page offering to add a manual it has already read | live |
| `seedUnreviewedManual` in `scripts/seed-emulator.ts` | **The gap, now closed.** A read-but-unsaved manual with no maintenance in it — the state all five repeated reports came from, which no test could visit because every seeded manual was committed and every seeded item already had tasks | live |

The last row was the most valuable thing on this page, and it is now closed.
One seeded pair — the owner's own Sharp microwave, with no tasks, and a manual
whose `previewDraft` survives with no maintenance in it — makes every one of
those five states reachable by a test. Do not stamp its `parsedAt` or commit its
draft to make something else pass: that is what made them untestable before.

## Amending this file

1. If a change alters what the flow **is**, edit this file in the **same PR**.
2. Cite the report or decision that authorised it, the way every rule above does.
3. If the change breaks an existing rule, say so explicitly in the PR body —
   "this supersedes HH-nnn because…". A rule silently disappearing is the exact
   failure this file exists to prevent.
