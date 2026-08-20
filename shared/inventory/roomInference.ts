/**
 * Where a thing probably lives, from what kind of thing it is.
 *
 * HH-23 (Chris → owner, beta round 6). The add form asked for a room before
 * anything on the screen knew what the item was, and the owner's instruction
 * was to fill in what we can and only ask the user to verify — "or if it's too
 * general, such as an air filter could be in any room".
 *
 * That last clause is the whole design. This map is deliberately INCOMPLETE:
 *
 *   · A dishwasher is in the kitchen. That is not a guess.
 *   · An air purifier could be in any room in the house, and so could a TV, a
 *     sofa, a vacuum, or a faucet (kitchen or bathroom — the ambiguity is the
 *     point). Those are ABSENT, and absence means ASK.
 *
 * Filling every subtype in would score better on coverage and worse on truth,
 * and a confidently wrong room is more annoying than an honest question — it is
 * "never assert what we haven't verified" applied to a dropdown. Anything not
 * listed here returns null, and the caller asks.
 *
 * Room names match DEFAULT_ROOMS in homeService, which every home is seeded
 * with. A home that renamed or deleted one just gets no match, which degrades
 * to the same honest question.
 */

/** The nine rooms every home starts with. Keep in sync with homeService. */
export const SEEDED_ROOMS = [
  "Kitchen", "Bathroom", "Laundry Room", "Garage", "Living Room",
  "Bedroom", "Basement", "Outdoor/Yard", "Utility Room",
] as const
export type SeededRoom = (typeof SEEDED_ROOMS)[number]

/**
 * Subtypes whose room is a fact about the appliance, not a guess about the home.
 *
 * The bar for entry: if you can picture the same item somewhere else without
 * straining, it does not belong here.
 */
const ROOM_BY_SUBTYPE: Record<string, SeededRoom> = {
  // Kitchen — these are defined by the room they're plumbed or vented into.
  refrigerator: "Kitchen",
  "wine-fridge": "Kitchen",
  dishwasher: "Kitchen",
  "oven-range": "Kitchen",
  microwave: "Kitchen",
  "range-hood": "Kitchen",
  "garbage-disposal": "Kitchen",
  "coffee-maker": "Kitchen",
  toaster: "Kitchen",
  blender: "Kitchen",
  "air-fryer": "Kitchen",
  "instant-pot": "Kitchen",

  // Laundry.
  "washing-machine": "Laundry Room",
  dryer: "Laundry Room",

  // Bathroom — fixtures and the grooming devices that plug in beside them.
  toilet: "Bathroom",
  showerhead: "Bathroom",
  "hair-dryer": "Bathroom",
  "flat-iron": "Bathroom",
  "electric-shaver": "Bathroom",
  "electric-toothbrush": "Bathroom",

  // Garage — where the loud things with engines are kept.
  "garage-door": "Garage",
  "lawn-mower": "Garage",
  "snow-blower": "Garage",
  "power-washer": "Garage",
  chainsaw: "Garage",

  // Outdoors — parts of the building envelope and the yard.
  roof: "Outdoor/Yard",
  gutters: "Outdoor/Yard",
  siding: "Outdoor/Yard",
  foundation: "Outdoor/Yard",
  deck: "Outdoor/Yard",
  fence: "Outdoor/Yard",
  grill: "Outdoor/Yard",
  "pool-hot-tub": "Outdoor/Yard",
  "outdoor-furniture": "Outdoor/Yard",
  "irrigation-system": "Outdoor/Yard",
  "solar-panels": "Outdoor/Yard",

  // Utility — the building's own machinery.
  "water-heater": "Utility Room",
  "tankless-water-heater": "Utility Room",
  "water-softener": "Utility Room",
  "whole-house-filter": "Utility Room",
  "electrical-panel": "Utility Room",
  "plumbing-main": "Utility Room",
  "hvac-furnace": "Utility Room",
}

/**
 * Subtypes we KNOW we cannot place, listed so the ambiguity is a decision
 * someone made rather than an entry nobody got round to adding.
 *
 * Behaviourally identical to being absent — this exists to be read.
 */
export const ROOM_AMBIGUOUS = new Set([
  "air-purifier", "humidifier", "air-conditioner", "vacuum", "iron",
  "faucet", "light-fixture", "ceiling-fan", "windows", "doors",
  "television", "soundbar", "speakers", "projector", "receiver-avr",
  "streaming-device", "game-console",
  "sofa", "mattress", "dining-table", "desk", "cabinets", "bed-frame",
  "sump-pump", "septic", "well-pump",
  "other",
])

/**
 * The room to pre-fill, or null to ask.
 *
 * `availableRooms` is the home's actual room list: a suggestion for a room this
 * home does not have is worse than no suggestion, because the user has to
 * notice and undo it. Pass it whenever you have it.
 */
export function inferRoom(
  subType: string | null | undefined,
  availableRooms?: readonly string[],
): SeededRoom | null {
  if (!subType) return null
  const guess = ROOM_BY_SUBTYPE[subType]
  if (!guess) return null
  if (availableRooms && !availableRooms.some((r) => r.toLowerCase() === guess.toLowerCase())) return null
  return guess
}

/** True when we deliberately have no opinion — the caller should ask. */
export function roomIsAmbiguous(subType: string | null | undefined): boolean {
  return !subType || !(subType in ROOM_BY_SUBTYPE)
}
