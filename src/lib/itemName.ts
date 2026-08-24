/**
 * What an item is called when the owner hasn't named it.
 *
 * Round 11 (owner): "The name doesn't need to include the room, otherwise every
 * item in the Kitchen will start with the same word. The one exception is if
 * there is more than one item with the same name — like Air Filter — in which
 * case add the room after the item type."
 *
 * Before this, HH-23 composed "Brand Model" — so a fridge was called
 * "Fisher & Paykel RF135BDRUX4", which is a part number, not a name, and made
 * `itemSubtitle` suppress the only line that carried the brand. What a person
 * recognises is the KIND of thing: Refrigerator, Dishwasher, Air filter. The
 * model number stays on the record where it belongs.
 *
 * The room is a disambiguator, not a prefix. Prefixing every name with its room
 * makes an alphabetical list read "Kitchen… Kitchen… Kitchen…" and buries the
 * word that actually distinguishes one row from the next. So it is appended,
 * and only when it has work to do.
 */

/** Case- and punctuation-insensitive, so "Air filter" collides with "air-filter". */
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")

export interface ComposeItemNameInput {
  /** What the owner typed. Wins outright — we never rename someone's choice. */
  typed?: string | null
  /** Human item type, e.g. from `categoryLabel()`. The preferred name. */
  typeLabel?: string | null
  brand?: string | null
  model?: string | null
  /** Room name, used only to break a collision. */
  room?: string | null
  /** Display names already in this home. */
  existingNames?: readonly string[]
}

const clean = (s: string | null | undefined) => (s ?? "").trim()

/**
 * The display name for a new item.
 *
 * Order: what they typed → the item type → the item type plus its room (only if
 * the plain type is taken) → plus the brand (only if that is taken too) →
 * brand + model → "Item", which exists so a save can never fail for want of a
 * name.
 */
export function composeItemName(input: ComposeItemNameInput): string {
  const typed = clean(input.typed)
  if (typed) return typed

  const taken = new Set((input.existingNames ?? []).map((n) => squash(clean(n))).filter(Boolean))
  const isTaken = (candidate: string) => taken.has(squash(candidate))

  const typeLabel = clean(input.typeLabel)
  const room = clean(input.room)
  const brand = clean(input.brand)
  const model = clean(input.model)

  if (typeLabel) {
    if (!isTaken(typeLabel)) return typeLabel

    // Taken. The room is what the owner asked us to add — but only now.
    if (room) {
      const qualified = `${typeLabel} — ${room}`
      if (!isTaken(qualified)) return qualified
    }

    // Two of the same type in the same room. The brand is the next real
    // distinction; a numeric suffix would name it after our bookkeeping.
    if (brand) {
      const branded = room ? `${typeLabel} — ${room} (${brand})` : `${typeLabel} (${brand})`
      if (!isTaken(branded)) return branded
    }

    // Give up gracefully rather than loop: a duplicate name is survivable,
    // and the two rows still differ by brand, model and photo.
    return room ? `${typeLabel} — ${room}` : typeLabel
  }

  // No type yet — the lookup hasn't answered, or this is the simple lane.
  const fromProduct = [brand, model].filter(Boolean).join(" ")
  if (fromProduct) return fromProduct

  return "Item"
}
