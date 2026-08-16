/**
 * Which spec keys each item category can actually display.
 *
 * The lookup model used to be told to return "typical keys: wattage,
 * filter_type, filter_size, merv, voltage, dimensions, capacity_gallons,
 * fuel_type, tonnage, seer, hspf, btu, cadr" — and only four of those exist in
 * any category's field schema. So the model would return `power` (label "Power
 * (W)") for an air fryer whose only real field is `wattage`, the user tapped
 * Apply, and the value landed on a key the wizard form cannot render: the form
 * showed no change, the suggestion still said "Applied", and the item was saved
 * carrying BOTH `wattage: 1690` and `power: 700`. The desktop item page renders
 * unknown keys generically, so the contradiction then showed up as two spec rows
 * disagreeing with each other.
 *
 * This file is the allowlist, and it lives in `shared/` so the Cloud Function
 * and the client validate against the SAME set — the client's own
 * `itemCategories.ts` cannot be imported by functions (it pulls in lucide
 * icons). `specKeys.test.ts` asserts this map still matches that schema exactly,
 * so the two cannot drift.
 */

export const SPEC_KEYS_BY_CATEGORY: Record<string, readonly string[]> = {
  major_appliance: ["fuel_type", "installation_date", "filter_type", "service_provider"],
  small_appliance: ["wattage", "filter_type", "descaling_interval"],
  fixture: ["finish", "installation_date", "bulb_type", "has_light"],
  system: ["installation_date", "last_inspection", "service_provider", "service_interval"],
  structure: ["material", "last_inspection", "contractor", "warranty_type", "dimensions"],
  outdoor: ["fuel_type", "seasonal_storage", "oil_type"],
  furniture: ["material", "dimensions", "care_instructions"],
  media: ["connectivity", "mount_type", "subscription"],
  smart_home: ["power_source", "battery_type", "account_app", "firmware_auto_update"],
} as const

/** Every key any category can show — the fallback when the category is unknown. */
export function allSpecKeys(): string[] {
  return Array.from(new Set(Object.values(SPEC_KEYS_BY_CATEGORY).flat())).sort()
}

/** Keys valid for a category; the union when the category is unknown, so an
 *  un-categorised item still gets suggestions rather than none. */
export function allowedSpecKeys(category: string | null | undefined): string[] {
  if (!category) return allSpecKeys()
  const keys = SPEC_KEYS_BY_CATEGORY[category]
  return keys ? [...keys] : allSpecKeys()
}

/** The gate. A suggestion whose key fails this must never be offered for Apply:
 *  applying it writes a value the user cannot see, edit, or correct. */
export function isAllowedSpecKey(category: string | null | undefined, key: string): boolean {
  return allowedSpecKeys(category).includes(key)
}
