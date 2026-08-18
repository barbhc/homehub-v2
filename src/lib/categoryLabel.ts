/**
 * One way to say what an item is.
 *
 * Items carry three category fields and the UI was reading the wrong one.
 * `itemCategory` is a clean enum on every item (`small_appliance`), `subType` is
 * a clean id when known (`air-purifier`) — but `category` is free text that has
 * drifted for as long as the app has existed. A live read of one home:
 *
 *     category="Small Appliance"   category="Small appliance"   ← same thing
 *     category="air-purifier"      category="air-fryer"         ← a subtype id
 *
 * The item page rendered `category` verbatim, which is why an air purifier
 * announced itself as "air-purifier" next to a properly-cased room name.
 *
 * So: derive the label from the fields that are trustworthy, most specific
 * first, and treat `category` as a last-resort string to tidy rather than a
 * source of truth. No migration — the display stops depending on the mess.
 */
import {
  getCategoryDefinition,
  getSubTypeLabel,
  type ItemCategoryId,
} from "@/modules/inventory/constants/itemCategories"

type CategoryBearing = {
  category?: string | null
  item_category?: string | null
  sub_type?: string | null
}

/** Title-case a slug or a drifted label: "air-purifier" → "Air purifier". */
export function prettifyCategory(raw: string): string {
  const words = raw.replace(/[-_]+/g, " ").trim().toLowerCase()
  if (!words) return ""
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * What to show. Returns null when the item genuinely has no category, so
 * callers can omit the chip rather than render an empty one.
 */
export function categoryLabel(item: CategoryBearing): string | null {
  const cat = (item.item_category ?? null) as ItemCategoryId | null

  // Most specific first: a subtype is what the owner would actually call it.
  if (cat && item.sub_type) {
    const label = getSubTypeLabel(cat, item.sub_type)
    // getSubTypeLabel echoes the id back when it doesn't recognise it; that is
    // the raw-slug case we are here to stop.
    if (label && label !== item.sub_type) return label
  }

  if (cat) {
    const def = getCategoryDefinition(cat)
    if (def?.label) return def.label
  }

  // Legacy rows with no typed category at all. Tidy the free text rather than
  // showing a slug, and let a subtype id resolve if it matches any category.
  const raw = item.category?.trim()
  if (!raw) return null
  const asSubType = getSubTypeLabel("small_appliance" as ItemCategoryId, raw)
  if (asSubType && asSubType !== raw) return asSubType
  return prettifyCategory(raw)
}
