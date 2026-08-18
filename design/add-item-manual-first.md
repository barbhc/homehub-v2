# Add item, manual-first

Round-5 feedback, stated plainly by the owner: *"this is a dead end for a user
that doesn't realize that the manual is the key source of the tasks and cleaning
guides."*

That sentence is the whole diagnosis. Homehub's value chain is
**manual → parsed tasks → agenda → reminders**. The add flow is organised around
a different goal — identifying the product and recording what she paid for it —
so a user can complete every step we ask for and still end up with an item that
does nothing.

## What she actually got

She added a Levoit Core 300 and landed on an item page with:

- the wrong name — "Levoit Core Air Purifiers", the manufacturer's *series* page,
  while the subtitle underneath correctly read "Levoit · Core 300"
- a category chip reading `air-purifier`, lowercase, with no way to change it
- **Upkeep: "Add this item's manual to unlock recommended upkeep."** — a sentence,
  no button
- no tasks

Meanwhile the Fisher & Paykel fridge two screens away — added with a manual — has
five scheduled tasks, a variant filter, and an Ask box grounded in its manual.
The gap between those two item pages *is* the product.

## The three principles

1. **The manual is the spine.** Everything in the add flow either helps us find
   the manual or gets out of the way. We already have `findManual` (Brave-backed,
   deployed, ranked, manufacturer-first) — it is behind a tap in one place out of
   three.
2. **Identity is proposed, never applied.** A single search hit is a suggestion.
   Auto-applying it is how "Core 300" became "Core Series Air Purifiers" — and it
   breaks *suggest, never assume*.
3. **Nothing that can be added later is asked for now.** Serial, purchase date,
   price, warranty and spec fields never block the path to tasks.

## The flow

### Step 1 — Identify

```
Brand  [ Levoit            ]
Model  [ Core 300          ]
       On the nameplate — usually inside the door or on the back

       ▸ Find the model another way
         (Scan the label · Choose a photo · No model number?)
```

Changes from today:

- The three floating affordances collapse into ONE labelled disclosure. "From
  library" becomes "Choose a photo" — *library* reads as a manual library here,
  which is the one thing it isn't.
- Lookup does not fire on partial input. It runs when the model field settles
  (debounced, on blur or 800ms idle) and **re-runs when the model changes** —
  today "Core" resolves to a series and completing it to "Core 300" changes
  nothing.

### Step 2 — Is this it?

One card, shown only when a lookup returns something:

```
┌──────────────────────────────────────────┐
│ [photo]  Levoit Core 300 True HEPA        │
│          Air Purifier                     │
│          Small appliance · levoit.com     │
│                                           │
│          📄 Manual found — levoit.com  ✓  │
│                                           │
│  [ Yes, that's it ]   [ Show 3 others ]   │
│  Not my product                           │
└──────────────────────────────────────────┘
```

- The manual search runs **automatically and in parallel** with the product
  lookup as soon as brand + model are known. It is not a card the user has to
  discover and tap.
- Alternatives are always reachable ("Show 3 others"), which is the direct answer
  to *"the specific model wasn't offered"*.
- If the lookup finds nothing, this step is skipped silently. It never becomes a
  dead end.

### Step 3 — Where it lives

```
Room       [ Bedroom            ▾ ]
Name       [ Levoit Core 300      ]   prefilled, editable
Category   Small appliance › Air purifier   [Change]
```

Category becomes a *value with a Change affordance*, not a twelve-tile grid
mid-form — and it uses the same picker the item page will use.

### Step 4 — Manual → parse → review

Unchanged, except the manual is usually already attached from step 2, so this is
a confirmation rather than a chore.

### Gone from the flow

Serial, purchase date, price, warranty, spec fields. All of it moves to
**Details & records** on the item page, where the copy already promises it can be
added later. Adding an item should take four fields, three of which we fill in.

## Cross-page consistency

Three behaviours have to be identical wherever they appear. Today none of them
are.

| Behaviour | Wizard | Item page — Upkeep | Item page — Add manual dialog |
|---|---|---|---|
| Find the manual | ✅ `FindManualCard`, behind a tap | ❌ sentence, no button | ❌ generic web-search link |
| Category | 12-tile grid, labelled twice | raw slug, read-only | — |
| Room | ✅ picker | ✅ picker | — |

**Target:** one `FindManualCard` on all three surfaces; one category component
(label + picker) everywhere it appears; room stays as it is — it is the model the
other two should copy.

The item-page Upkeep empty state becomes:

```
┌──────────────────────────────────────────┐
│  This item has no manual yet — that's     │
│  where its upkeep comes from.             │
│                                           │
│  [ Find the manual ]  Add it myself       │
└──────────────────────────────────────────┘
```

"Find the manual" runs the same `findManual` search inline, right there on the
page. No detour to a search engine.

## What this does not fix

She asked for a brand → manual URL database, "or at minimum land on the brand's
manuals page for that category". A curated per-brand support-URL table is a real
asset and worth building, but it is a data project, not a UI change. The interim
step inside this scope: when `findManual` returns nothing, link to the
**brand's own support page** rather than a generic web search — a small
brand→support-URL map covers the top ~40 appliance brands and degrades to today's
behaviour for the rest.

## Build order

| PR | Scope | Est |
|---|---|---|
| 1 | **Bugs.** `pointer-events-none` on the swipe layer; portal + z-index for `TaskEditSheet` | 1h |
| 2 | **Identity.** Debounce + re-run lookup; never auto-apply; "Is this it?" card with alternatives | 4h |
| 3 | **Manual everywhere.** `FindManualCard` in the Upkeep empty state and the add-manual dialog; auto-run in the wizard | 3h |
| 4 | **Category.** One label vocabulary + picker on item page and add form; backfill display of legacy values | 3h |
| 5 | **Slimming.** Move purchase/spec fields to the item page; fix step-1 copy; collapse the model affordances | 4h |
| 6 | Photo: persist the download URL, reserve space, fade in | 1h |
