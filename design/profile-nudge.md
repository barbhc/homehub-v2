# When to ask for the home profile — and how to make it worth answering

**Status**: **approved direction (owner, 2026-08-21)** — scheduled in `BACKLOG.md`.
Option B + C with A for climate is the chosen shape; the other options below are
kept as the record of what was considered and why they lost.
Written 2026-08-21 from the owner's own report (HH-80) and her follow-up: *"The questions in the set up your home are
completely separate from adding items. Think about when it makes sense to nudge
a user to complete that setup, and make sure they understand the value."*

## What the profile actually is today

Five steps, in this order:

| # | Question | Stored as |
|---|---|---|
| 0 | House / condo / townhouse / apartment | `homeType` |
| 1 | Own or rent, and how long | `ownership`, `ownershipDuration` |
| 2 | **Climate where you live** | `climate` → derives `freezeRisk` |
| 3 | Top concerns | `topConcerns` |
| 4 | Preferred mode | `preferredMode` |

Skipping at any step leaves `completed_at` null, and `profileIncomplete` is
exactly `completed_at === null` — so a partial answer is treated identically to
no answer, and the banner returns forever.

## The measurement that should drive this

Consumers of each answer, counted outside the profile's own service and UI:

| Answer | Readers | What it changes |
|---|---|---|
| `climate` | **7** | Seasonal windows (`seasonalWindow.ts`), the agenda, task feedback, category defaults |
| `freezeRisk` (derived from climate) | 2 | **`commitDraft` suppresses the entire freeze-prep family at parse time** for a freeze-free home |
| `ownership` | 3 | `homeService`, Terms, the Discuss assistant |
| `topConcerns` | 2 | Ranking weight on the dashboard |
| `homeType` | 1 | Grounding context for the Discuss assistant |
| `preferredMode` | 1 | Whether Home leads with Ask |
| `ownershipDuration` | **0** | Nothing reads it |

Three things fall out of that table, and they are the whole design:

1. **One answer carries almost all the value, and it is climate.** It is the only
   one that changes which tasks exist. A mild-climate home never gets the
   winterizing family at all — that suppression happens in `commitDraft`, at
   parse time, so climate answered *before* the first manual is parsed changes
   the result and climate answered after does not.
2. **Climate is question three of five.** It sits behind home type, ownership and
   duration — the two cheapest answers to give and the two least load-bearing.
3. **`ownershipDuration` has no readers.** We interrupt people for it.

## Why the current nudge fails

It fires on the wrong signal and says the wrong thing.

- **Wrong moment.** The banner shows whenever the profile is incomplete and the
  home has items. In HH-80 that meant a home with one item, no manual and no
  tasks — a screen with nothing to do — where the loudest element asked for
  profile answers that would still have produced zero tasks. (Fixed narrowly in
  #144: the nag now yields to the add-a-manual prompt. That is a precedence
  patch, not an answer to this question.)
- **Wrong claim.** *"A few quick questions help tailor maintenance reminders,
  warranty tracking, and the assistant to your home"* is unfalsifiable. It
  promises tailoring in general and names no consequence the user can picture.
- **All-or-nothing.** Answering four of five and stopping leaves the banner
  identical to answering none.

## Options

**A — Ask each question at the moment it would change something.**
Climate when a seasonal task first appears or before the first parse commits;
ownership when a task is landlord-versus-tenant; concerns when the dashboard
first has enough to rank. Context supplies the value argument for free — *"Freeze
prep is on this list. Do winters get below freezing where you are?"* needs no
explanation. Cost: five surfaces to build and maintain instead of one screen.

**B — Unbundle, reorder, and retire the dead question.**
Climate becomes a single question asked on its own; `ownershipDuration` is
deleted rather than asked; the rest move to Settings and are never nudged.
Cheapest real improvement, and it makes the ask honest — one question, one
sentence of why.

**C — Nudge once, after the first successful parse.**
The user has just watched tasks appear. That is the only moment they have
something concrete to tune, and the pitch writes itself: *"These came from your
manual. Tell us your climate and we'll drop the ones that don't apply to you."*
Risk: it arrives *after* the parse that climate would have improved, so the first
item's tasks are already wrong for a mild climate — mitigated by re-running house
rules on answer, which `applyHouseRules` already supports.

**D — Never nudge; attach it to the thing it fixes.**
No banner. A seasonal task carries a quiet "does this apply here?" control; the
answer is stored as climate. Strongest fit with *suggest, never assume*, weakest
at getting the answer before it matters.

**E — One question per visit, in value order.**
Progressive, never more than one interruption. Feels considerate, but stretches a
two-minute task across a week and keeps the incomplete state alive the whole time.

## The decision (owner-approved 2026-08-21)

**B + C, with A for climate specifically.** Concretely:

1. Delete `ownershipDuration` — asking for something nothing reads is the
   clearest defect on this list.
2. Pull climate out of the sequence and ask it as one question, with the
   consequence stated: *"We'll skip freeze prep entirely if winters are mild
   where you are."*
3. Ask it **before the first parse commits**, not on a banner — that is the last
   moment the answer can change the tasks the user is about to receive, and it is
   a moment they are already engaged.
4. Everything else moves to Settings, discoverable and never nudged. `completed_at`
   stops meaning "all five" and starts meaning "climate answered", so the nag can
   actually end.

## Edge cases

1. **Answer arrives after the parse.** Re-run `applyHouseRules` against existing
   templates with the new `freezeRiskFalse` — the confirm-first sweep from the
   task-feedback work already does exactly this shape, so it is not new machinery.
2. **Multi-home.** Climate is per home, not per user. A second home in a different
   climate must ask again rather than inherit — see HH-80's Mission condo.
3. **User declines.** Null climate already degrades correctly everywhere
   (`seasonalWindow` drops the local claim and widens the window). Declining must
   stay free, and must stop the asking.
4. **Changed answer.** Moving from cold to mild should offer to suppress
   freeze-prep tasks already committed — confirm-first, never silent deletion.

## Done means

- No screen asks for `ownershipDuration`, and the field is gone.
- A new user is asked exactly one profile question before their first parse, and
  can see what it will change.
- Answering it ends the nudging permanently, whether or not the other four are
  answered.
- A mild-climate home that answers before its first parse never receives a
  winterizing task — verifiable end to end against the emulator, which is where
  `commitDraft`'s suppression is already tested.
