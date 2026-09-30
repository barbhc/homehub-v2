# Where the spare is, and notes — design doc

_Chosen by the owner on 2026-09-27 from the "Homehub Spares & Notes" canvas
(https://claude.ai/artifact/EbL8FJ1SHT3QjgBAbScGdt): the part card, **5b**
(Home shows the place as a pill), and **house notes at the top of Items**.
Prompted by Seth Godin's "Replace the filters" (2026-08): keep the reminder,
the link AND where the spare lives, so future-you never has to remember.
One page: data model, edge cases, failure modes, what "done" means._

## 1 · Where the spare is kept (PR 1)

### Data

- `taskTemplates/{id}.supplies[i].location: string | null` — free text
  ("Hall closet, top shelf"). Client type `TemplateSupply.location`.
- Written ONLY by `updateTaskSupply` / `addTaskSupply` (the transactional
  writers, so a concurrent parse write can't clobber a sibling row). The parse
  never writes it; `parsePrompt.ts` is untouched, so no eval gate.
- No rules change: templates are member-writable without field validation.
- Measured 2026-09-27 in SF Condo: 212 live templates, 17 with parts, 18 part
  rows, 0 with a link, 0 with a size, 0 with a place. The card must read well
  with only a name.

### The part card (task page's *You'll need*, and the item page's open row)

- One card per part: a tile, the name as a headline, the facts as **pills**
  (place first, in teal; size and part number plain), **Buy at <store>** as a
  button when a link exists, a pencil for everything else.
- **Tap the place pill** → just that field, inline, with the places this home
  already uses as chips (loaded on open, not on every page view). No place yet
  → a dashed *Where do you keep it?* pill invites it; nothing nags.
- **The pencil** → every field with visible labels: Part · Size · Where you
  keep it · Store link.
- Footer, quieter: *Remind me to buy the next one* as a switch, and *I have
  one* when it's on — unchanged behaviour.

### Home (5b)

The open row's one prep line keeps its sentence; when the task has **exactly
one part and it has a place**, the place follows as the same teal pill the
card uses.

### Edge cases

1. Several parts → Home shows no place (the sentence says "and N more"; one
   place would be a guess about the others).
2. Clearing the field saves `null`; the pill turns back into the invitation.
3. A long place truncates in the pill; the editor shows it whole.

### Failure modes

- A rejected write rolls the card back and says so in place (the existing
  alert), and the editor keeps what was typed.
- The places lookup failing is logged and simply shows no chips — the field
  itself still works, and chips are a convenience, not information.

### Done

Place set on the task page → survives a reload → shows on the item page's row
and in Home's open row. Unit contract for the card and `prepPlace`; the
emulator walk covers set → reload → Home.

## 2 · Notes — house, room, item (PR 2, and PR 3 for Ask)

### Data

- The store already exists: `homes/{homeId}/careNotes/{noteId}` (`CareNote`,
  scope `home | room | item_unit`, member read/write in `firestore.rules`).
  It has only ever been reachable as "care tips" on the unlinked `/faq` page;
  SF Condo holds **0** of them (measured 2026-09-27).
- A note is **just text** (`content`, `source: "user"`, `title: null`). The
  heading is derived at render — the first line's words before a colon ("Paint:
  Benjamin Moore…") — so what she typed is exactly what is stored.
- **Legacy item notes.** 4 of 17 items in SF Condo carry text in the old
  single `items.notes` field, invisible since its card was orphaned. They show
  as ordinary notes (id `legacy-<itemId>`); editing one moves it into
  `careNotes` and clears `items.notes` in one batch; deleting clears it.
  Nothing is written on view.

### Where they live

- **Items page, top:** a *House notes* card (count + first headings) →
  `/inventory/notes`.
- **Room headings** (Room sort): *N notes ›* or a quiet *Add a note* →
  `/inventory/rooms/:roomId/notes`.
- **Item page:** a *Notes* section between the Ask card and Details & records.

### Writing one

A bottom sheet: the scope as a pill (House / Kitchen / Carrier Infinity
Furnace), the text, **ideas** as chips that start the note ("Paint: ") and show
a one-line hint (brand, colour, finish — and where the leftover is), *Everyone
in <home> can see this.*, Save note. Editing adds Delete. Ideas are suggestions,
never fields, and an idea whose note already exists stops being offered.

### Edge cases

1. A room or item is deleted → its notes are hidden with it (not orphaned into
   the house list).
2. Two members edit one note → last write wins; stated, not engineered.
3. Empty or whitespace-only → Save stays disabled.

### Failure modes

- A load failure says so where the notes would be, with Try again — never a
  false "Nothing noted yet".
- A save/delete failure keeps the sheet open with the text and the error.

### Ask (PR 3 — functions deploy, per-deploy approval)

`chatQuery` reads the house notes, the notes of the rooms in scope and the
notes of the items in scope (legacy item text included), as a "Your notes"
block; each answer cites *Your note · House / Kitchen / <item>*.

### Done

Create, edit and delete at all three scopes; each survives a reload; the four
legacy item notes are visible; one failure-path test per writer; an emulator
walk per scope. Ask answers from a note once PR 3 is deployed.
