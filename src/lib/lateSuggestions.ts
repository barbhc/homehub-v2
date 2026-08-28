/**
 * What the add screen would have offered, had it known then what we know now.
 *
 * The room and the item's name are both decided at creation time from the
 * item's TYPE. When the type arrives late — and since round 18 it usually
 * does, because the product lookup moved off the add screen and the manual
 * parse finishes minutes later — those two decisions were already made
 * without it.
 *
 * The owner hit both at once on a Bosch dishwasher: no room, and a name of
 * "Bosch SHPM65Z55N/01" rather than "Dishwasher". Neither is wrong exactly;
 * both are answers given before the question could be answered properly.
 *
 * So the item page re-offers them, once, as one-tap chips. Suggestions, not
 * corrections: the room is a fact only the owner knows, and a name someone is
 * currently looking at should not rearrange itself under them.
 */
import type { ItemUnit, Room } from "@/integrations/types"
import { suggestedRoomForSubType } from "@/modules/inventory/constants/itemCategories"
import { categoryLabel } from "@/lib/categoryLabel"

/** The room this item's type implies, if the home actually has one like it. */
export function lateRoomSuggestion(item: ItemUnit, rooms: Room[]): Room | null {
  if (item.room_id) return null
  const hint = suggestedRoomForSubType(item.sub_type)
  if (!hint) return null
  const h = hint.toLowerCase()
  // Same loose match the add screen uses: a home's "Laundry Room" should
  // satisfy a hint of "Laundry", and "Kitchen" either way round.
  return rooms.find((r) => {
    const rn = r.name.toLowerCase()
    return rn.includes(h) || h.includes(rn)
  }) ?? null
}

/**
 * The type-based name this item would have been given, if the type had been
 * known at creation.
 *
 * Offered ONLY when the current name is still the composed "Brand Model"
 * placeholder — that string is ours, not a choice anyone made. A name the user
 * typed, or one already equal to the type, is left alone.
 */
export function lateNameSuggestion(item: ItemUnit): string | null {
  const label = categoryLabel(item)
  if (!label) return null
  const current = item.display_name.trim()
  if (!current || current === label) return null
  const placeholder = `${(item.brand ?? "").trim()} ${(item.model ?? "").trim()}`.trim()
  if (!placeholder || current !== placeholder) return null
  return label
}
