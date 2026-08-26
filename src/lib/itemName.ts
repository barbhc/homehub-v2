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


/**
 * Is a name that came from the identity resolver actually a NAME?
 *
 * HH-125: an item arrived called "Pan for NSLACO5" — a phrase lifted out of a
 * rice cooker's manual, carried into the name field by the identity card, and
 * then kept by composeItemName, which treats anything in that field as the
 * user's own decision.
 *
 * The rule is narrow on purpose. Rejecting too much would throw away the good
 * case ("Rice Cooker") and land everyone back on brand + model, which is what
 * HH-112 was about. So it rejects only the two shapes that cannot be a name a
 * person would use out loud:
 *
 *  - it repeats the MODEL NUMBER, which is what the user is naming the thing to
 *    avoid having to remember;
 *  - it reads as a fragment of a sentence rather than a noun ("Pan for …",
 *    "Cover with …") — a manual heading, not a thing.
 */
export function isUsableProductName(name: string | null | undefined, model?: string | null): boolean {
  const n = clean(name)
  if (!n) return false
  if (n.length > 48) return false
  // Only a model that LOOKS like a model number disqualifies a name. A partial
  // model can be an ordinary word — the withdraw suite caught this with
  // "Levoit Core Series Air Purifiers" against a half-typed model of "Core",
  // which is a perfectly good name being thrown away. A model number has a
  // digit in it; "Core" does not, "NS-LAC05" does.
  const m = clean(model)
  const looksLikeModelNumber = !!m && m.length >= 4 && /\d/.test(m)
  if (looksLikeModelNumber && squash(n).includes(squash(m))) return false
  if (/\b(for|with|from|of|in)\b/i.test(n)) return false
  if (looksLikePageTitle(n)) return false
  return true
}

/**
 * Is this string a search RESULT rather than a product?
 *
 * HH-138: the resolver returned "Bosch SHPM65Z55N/01 Manuals" — a web page's
 * <title> — and the identity card printed it verbatim, so the identify screen
 * appeared to announce it had found the manual. It had found a model.
 *
 * Deliberately narrower than `isUsableProductName`, and separate from it,
 * because the two answer different questions. That function asks "would a
 * person CALL it this?", and rejects "LG WM4000HWA Front Load Washer" for
 * repeating the model number the name exists to replace (HH-125). That is the
 * right rule for the name field and the wrong one for a card describing a
 * match, where the same string is exactly what the user wants to read.
 *
 * Only the TRAILING shape is rejected here. Products really are called "Manual
 * Espresso Machine" and "Manual Coffee Grinder"; nothing is called "… Manual".
 */
export function looksLikePageTitle(name: string | null | undefined): boolean {
  const n = clean(name)
  if (!n) return false
  if (/\b(user|owner'?s|service|instruction|installation)?\s*manuals?$/i.test(n)) return true
  if (/\b(pdf|datasheet|spec\s*sheet|specs|download|downloads)$/i.test(n)) return true
  return false
}
