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

- **Each lane says what it can do, on the lane.** The camera exists in the
  appliance lane and nowhere else, so that lane's card says "Type it, or scan
  the label." SUPERSEDES the centred caption "Photo of a label? You can snap it
  inside the appliance form." — which described a control on the next screen, in
  our noun, beneath two cards when it was true of one. Round 11 demoted the
  camera and needed the reassurance; round 13 promoted scanning back to a
  first-class control, which retired it. — owner, 2026-08-27

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
- **Nothing in this lane is a typed name.** There is no name field here; the
  hidden "Brand Model" IdentifyStep keeps is only for switching to the simple
  lane. So the item is created named for its TYPE when the category is known
  (a label scan read it) — *Air purifier*, never *Coway AP-1512HH* — and
  otherwise with the exact "Brand Model" placeholder the lookup renames. Only
  the simple lane's visible Name field is the user's name. — HH-112 (audit
  2026-09-29: the hidden name had been reaching `composeItemName` as typed)
- **The words are the homeowner's, not the trade's.** The screen says *label*,
  never *nameplate* — that is what an installer calls it. It names *the brand
  and model*, the two fields on screen, never *both fields*, which describes our
  form rather than their appliance. — owner, 2026-08-27
- **The scan asks for the model number, not the whole label.** The control says
  "Find the model number · We'll do the typing", and the recovery tips (shown
  after a read comes back empty) lead with "Get closer — the model number should
  be big and sharp". The older "the label should fill most of the frame" was
  untrue and worked against itself: it makes people step back, and the read only
  ever needed the model number legible. — owner, 2026-08-27. (The control said
  "Point at the model number" until its lines went to `text-sm` that day and it
  stopped fitting — `e2e/emu/scan-fit.spec.ts`; this line was not amended then.)
- The camera keeps its **tile on the left**, and the copy is sized to fit beside
  it. The text column there is about **165px on a 375pt phone** — small enough
  that a sentence of ordinary length wraps. `e2e/emu/scan-fit.spec.ts` measures
  the real control at 375/390/430 and fails if either line wraps; do not judge
  this from a mockup, whose phone fits materially more characters per line than
  the device does. — owner, 2026-08-27
- Rarer routes stay folded under **"If you can't scan the label"**, and that
  disclosure holds ONLY the two real alternatives — choose an existing photo,
  or no model number at all. SUPERSEDES "More ways to identify it", which named
  a promise it did not keep: the owner opened it expecting more input methods
  and found a tips paragraph. The tips are retired; what mattered in them is
  said on the scan card and under the model field, before the camera opens
  rather than behind it. — HH-123, owner 2026-08-27
- **The scan card's two lines are `text-sm`, not `text-xs`.** They carry the
  whole instruction, and at hint size they read as fine print under a heading
  three steps larger. The text column beside the icon is ~165px on a 375pt
  phone, so copy must fit one line each at 14px — `e2e/emu/scan-fit.spec.ts`
  fails the build if it does not. — owner, 2026-08-27
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
- **Back, then "Add the manual" again, is the same item.** The session holds
  the item it made, and a second confirm re-identifies it in place — never a
  second item with the first orphaned. Same brand and model: what the lookup
  already found is kept. A corrected one is a different product: the old
  findings are dropped and the lookup runs again. — HH-130 (audit 2026-09-29)
- **The same PDF twice is one manual.** An upload is matched to the item's
  manuals by the SHA-256 of its bytes (every upload gets a fresh storage path,
  so a path never repeats); a repeat returns the record already there, its
  scan kept, and the redundant copy is removed. A link is matched by its URL
  and read again. Both doors — this step and the item page — go through
  `createManualDocument`. — HH-154 (audit 2026-09-29)
- **Upload leads** and holds the only filled button. — HH-109, HH-115
- Upload and Paste a link are joined by the same **"or" rule** as the identify
  step's type-or-scan, so the sources read as alternatives, not a list. —
  owner QA, 2026-09-06 (care-library branch)
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
- The item page **watches the scan and never starts one** on arrival. It used
  to re-enqueue any unread manual under ten minutes old — the wizard's own,
  already enqueued — so every add with a manual was charged twice, and again
  on each refetch. — audit 2026-09-29 (HH-159)
- **One scan per manual at a time — enforced by the server too.** Any door
  that asks again for a manual that is being read (a scan tapped mid-read, a
  second device) **follows the scan already running** — same result, charged
  once — instead of starting a second, separately billed one. A scan that
  stops writing for 35 minutes is ended as an error the manual card can
  restart, never left "reading" forever; a scan retrying after a transient
  failure shows as queued, not failed. — audit 2026-09-29, Package C (C1/C2)

## The item page — where the value arrives

### What the background lookup may do here — round 18

- **Category fills silently, blank-only.** Visible and reversible on the
  Category row; a category the user chose is never overwritten.
- **The name follows the category** (owner, 2026-08-27): the composed
  "Brand Model" placeholder becomes the KIND of thing — *Refrigerator* — with
  the room appended only when that name is taken (*Air filter — Garage*, via
  `composeItemName`). A name the user typed is never touched. Editable like any
  field.
- **Decided against the item as it is when the lookup lands**, not as it was
  when it started: a rename on the name (HH-125) or a category chosen
  meanwhile is kept, and an item re-identified on Back (HH-130) gets none of
  the old product's findings. — audit 2026-09-29
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
- A task's part is a **card** inside its row (and on the task page's *You'll
  need*): the name, the facts as pills — **where the spare is kept** first, in
  teal — Buy as a button, everything else behind the pencil. One tap on the
  place edits just the place. — design/spares-and-notes.md (2026-09-27)
- **Notes** sit between the Ask card and Details & records (in the rail on
  desktop): free text started by ideas, never fields. The item's old single
  notes text shows there as an ordinary note. — design/spares-and-notes.md
  (2026-09-27)
- Three states, not two: no manual · being read · **read, nothing saved yet**.
  A finished-but-uncommitted parse is stage "done" with a null `parsed_at`
  (`commitDraft` is the only writer of it), and the third state holds the space
  without a button — the pickup card above owns that decision. — HH-141
- **One tree for the width, never two.** The page renders the phone layout OR
  the desktop one (`useIsDesktop`, Tailwind's `lg`), not both with CSS hiding
  one: a portaled dialog escapes `display:none`, so two trees meant one tap
  opened two add-manual dialogs and two reviews. — HH-159
- **"Add the manual" works on the first tap, from every door** — Upkeep, the
  drop-zone, Paste a link, Find it for me, the compact button, Re-upload. Each
  opens through the same handler, which names its panel (upload unless the door
  says otherwise) and clears the last attempt's error and document type; what
  was picked goes to the scan as an argument, never as state set a moment
  before. — HH-159
- The page's own load has four states, and **slow is not failed**: after 10 s
  the skeleton stays and says "Still loading…" with Try again, a late answer
  still wins, and only a failure is the dead end. A refetch keeps the item on
  screen. The error banner is for actions and scans only. — HH-160

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
- **Every read ends here — a rescan too.** Settings → Manuals' Rescan starts a
  PREVIEW and hands off to the item page exactly as the wizard does
  (`markParsePending`); "Rescan all" reads one manual at a time and leaves each
  for its review; a manual already "Read — not saved" offers Review, not
  another read. None of them commits. They used to run in commit mode and
  write tasks with no review at all. — audit 2026-09-29
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
| HH-120: *"exactly one review is ever mounted"* | Satisfied by construction — there is one screen, and the item page renders one tree. (It briefly was not: with both trees mounted, the manual section's review and add dialog opened twice — HH-159.) |
| HH-137: the finding-first sentence | Replaced by the two-channel summary, because "nothing here will remind you" contradicted the weekly cadences beneath it. |


---

## What guards this

| Guard | Catches | State |
|---|---|---|
| `src/lib/retiredDesigns.test.ts` | Anything rendering a deleted component, a retired route, or a resurrected wizard step | live |
| `src/lib/designContracts.test.ts` | This file's rules as behaviour, not names: the item page renders one tree and one add-manual dialog at 390px and desktop, and never starts a scan on arrival; zero-byte refusal and the capacity stand-down; every review door gets the one screen, in order; the two-step review's sentences, absent app-wide; one indeterminate rail and the tray's stand-down. A rule the code does not meet yet is an `it.todo` naming its package | live |
| `src/components/manuals/TaskReviewSheet.saved.test.tsx` | A screen claiming rows are saved while offering the button that saves them | live |
| `src/components/smart-add/addFlowCopy.test.ts` | Copy and step-union drift | live |
| Journey walks + their `snap()` notes | Visual drift — but ONLY if the note states the requirement rather than describing the screen | live |
| **This file** | A change quietly undoing an earlier agreement | live |
| `src/components/manuals/TaskReviewSheet.sections.test.tsx` | A bucket with no rail — the HH-140 mechanism, now impossible because `SECTION_RAIL` is typed `Record<ReviewBucket, string>` | live |
| `src/components/manuals/TaskReviewSheet.rowstates.test.tsx` | The three timing states drifting — asserts a quiet row's chip is byte-identical to a notifying row's | live |
| `src/lib/reviewBuckets.agreement.test.ts` | The review, the task page and `sendPush` disagreeing about whether one task notifies | live |
| `remindsByDefault(tier: PriorityTierName)` | **The compiler.** Passing a bucket where a tier belongs fails `tsc -b`; a runtime test could not catch it, because today the bucket for a scheduled row IS the tier | live |
| `src/components/item-care/CareBlock.awaiting.test.tsx` | The page offering to add a manual it has already read | live |
| `src/pages/item-detail/ManualSection.addManual.test.tsx` | An item-page door that fails its first "Add the manual", a retry that re-sends the previous file, or a reopened dialog still carrying the last error, document type or panel (HH-159) | live |
| `e2e/emu/item-add-manual.spec.ts` | Two add-manual dialogs or two item headings in the DOM at 390px or desktop, or more than one scan started per add (HH-159) | live |
| `e2e/emu/item-page-manual.spec.ts` | The item page's link lane, from a seeded appliance with no manual: one dialog opening on the link field, the Google search for this model, one scan, the live rail, the tray standing down here and counting it elsewhere, no second scan on return. HH-161's "Upkeep never offers a manual it is reading" is `test.fixme` until E2 | live |
| `e2e/emu/smart-add.spec.ts`, the wizard hand-off | More than ONE enqueue per add with a manual, counted only after the item page has finished loading (HH-159) | live |
| `src/pages/item-detail/useItemDetailLoad.test.ts` | A stall treated as a failure, a late success that does not win, or a refetch that swaps the page for the skeleton (HH-160) | live |
| `src/pages/SmartAddItem.test.tsx` + `src/components/smart-add/identifyWrite.test.ts` | Back → "Add the manual" again creating a second item; the appliance lane's hidden "Brand Model" reaching the name as typed (HH-130, HH-112) | live |
| `e2e/emu/smart-add.spec.ts`, Back from the manual step | More than one item — in Firestore or on the Items list — after Add the manual → Back → Add the manual (HH-130) | live |
| `src/modules/inventory/services/postCreateLookup.test.ts`, "as it is now" | A lookup landing on an item renamed, re-categorised or re-identified while it ran (HH-125, HH-130) | live |
| `src/modules/knowledge/services/manualDedupe.test.ts` | A re-upload of the same PDF — at a new path, as every upload is — minting a second record (HH-154) | live |
| `e2e/emu/smart-add.spec.ts`, the same PDF twice | Through the real Storage and Firestore emulators: a scan retried with the same file leaving two records, or two stored PDFs (HH-154) | live |
| `src/lib/manualRescan.test.ts` | A rescan from Settings that commits instead of ending in the review | live |
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
