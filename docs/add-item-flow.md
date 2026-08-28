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
- **The scan asks for the model number, not the whole label.** "Point at the
  model number" is the instruction, in the control and in the recovery tips. The
  older "the label should fill most of the frame" was untrue and worked against
  itself: it makes people step back, and the read only ever needed the model
  number legible. — owner, 2026-08-27
- The camera keeps its **tile on the left**, and the copy is sized to fit beside
  it. The text column there is about **165px on a 375pt phone** — small enough
  that a sentence of ordinary length wraps. `e2e/emu/scan-fit.spec.ts` measures
  the real control at 375/390/430 and fails if either line wraps; do not judge
  this from a mockup, whose phone fits materially more characters per line than
  the device does. — owner, 2026-08-27
- Rarer routes stay folded under "More ways to identify it". — HH-123
- **The lookup does not run on this screen.** No debounced search, no "We found
  this item" card, no spec chips — the screen the user types on never changes
  under them. The lookup fires once, after the item is created, and everything
  it finds waits on the item page. SUPERSEDES the per-keystroke lookup and both
  of its cards; HH-114's suggestions-never-auto-applied rule moves to the item
  page below, and HH-138's vocabulary rule retires with the card it governed.
  — owner, 2026-08-27 (round 18)

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

### What the background lookup may do here — round 18

- **Category fills silently, blank-only.** Visible and reversible on the
  Category row; a category the user chose is never overwritten.
- **The name follows the category** (owner, 2026-08-27): the composed
  "Brand Model" placeholder becomes the KIND of thing — *Refrigerator* — with
  the room appended only when that name is taken (*Air filter — Garage*, via
  `composeItemName`). A name the user typed is never touched. Editable like any
  field.
- **Specs arrive as suggestions inline on their own field rows** — italic,
  greyed, behind a per-field Add — never as a card announcing a find, and never
  auto-applied (HH-114's rule, relocated here). Applied-ness is DERIVED: a key
  with a value stops suggesting.
- **One provenance line** under the rows: "We found these on a product page,
  not in your manual. Hide them." Hiding stamps `lookup_dismissed_at` and is
  permanent for that item.
- **Finding nothing shows nothing.** No card, no message, no trace a search
  happened.

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

**Round 18 rewrote this section.** The review is now ONE screen grouped by what
a task IS, not how much it matters. Owner: *"categorizing essential recommended
and optional is less helpful than categorizing maintenance, cleaning, usage and
setup."*

- **One screen, four sections: Maintenance → Cleaning → Usage → Setup.**
  Setup sits below Usage — install steps for a thing owned for months must not
  outrank the work you live with. — HH-144, and HH-85 for the ordering
- **Importance is a rail, not a heading.** Essential/Recommended/Optional are a
  property of the row. `SECTION_RAIL` and `TIER_RAIL` are separate maps, because
  one map holding both is exactly how HH-140 happened. — HH-144
- **No maintenance simply means no Maintenance section.** No special screen, no
  card instead of a sheet, no sentence explaining an absence. — HH-142
- **The summary states TWO channels, apart.** How many show up in Tasks when due
  (always on, no permission), and how many also notify (opt-in). Owner: *"there
  are items that are scheduled to be reminded within the app even if there's no
  notification."* — HH-144
- **Essential is the only notify-by-default**, and the switch overrides in both
  directions. Priority and interruption stay independent. — owner, 2026-08-27
- **The cadence chip is identical on every scheduled row**; the bell beside it is
  the only thing that varies. Colouring the chip makes cadences incomparable
  down the column. — HH-144
- **A bell is never drawn that cannot be rung.** If permission was refused, the
  screen says so instead. — round 18
- It never claims rows are saved while the button underneath is what saves
  them. `runParse` writes `previewDraft` only; `commitDraft` is what
  saves. — HH-134
- **The one-by-one walkthrough survives**, speaking the same four words.
  Reclassifying a row visibly moves it between sections. It is the only route
  tasks from older parses have into the new vocabulary. — HH-144

### Superseded by round 18

Named here rather than deleted, because a rule vanishing silently is the failure
this file exists to prevent.

| Rule | Why it no longer applies |
|---|---|
| HH-121 / HH-127: *"with maintenance it opens; without, a card reports"* | The owner rejected both the long list AND round 14's card: *"it really is unsatisfying as somebody who has just waited to see their manual scanned."* One screen serves both cases. |
| HH-119: *"opens on the schedule screen, focused on maintenance"* | There is no second screen to open on. |
| HH-120: *"exactly one review is ever mounted"* | Satisfied by construction — there is one screen. |
| HH-137: the finding-first sentence | Replaced by the two-channel summary, because "nothing here will remind you" contradicted the weekly cadences beneath it. |


---

## What guards this

| Guard | Catches | State |
|---|---|---|
| `src/lib/retiredDesigns.test.ts` | Anything rendering a deleted component, a retired route, or a resurrected wizard step | live |
| `src/components/manuals/TaskReviewSheet.saved.test.tsx` | A screen claiming rows are saved while offering the button that saves them | live |
| `src/components/smart-add/addFlowCopy.test.ts` | Copy and step-union drift | live |
| Journey walks + their `snap()` notes | Visual drift — but ONLY if the note states the requirement rather than describing the screen | live |
| **This file** | A change quietly undoing an earlier agreement | new |
| `src/components/manuals/TaskReviewSheet.sections.test.tsx` | A bucket with no rail — the HH-140 mechanism, now impossible because `SECTION_RAIL` is typed `Record<ReviewBucket, string>` | live |
| `src/components/manuals/TaskReviewSheet.rowstates.test.tsx` | The three timing states drifting — asserts a quiet row's chip is byte-identical to a notifying row's | live |
| `src/lib/reviewBuckets.agreement.test.ts` | The review, the task page and `sendPush` disagreeing about whether one task notifies | live |
| `remindsByDefault(tier: PriorityTierName)` | **The compiler.** Passing a bucket where a tier belongs fails `tsc -b`; a runtime test could not catch it, because today the bucket for a scheduled row IS the tier | live |
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
