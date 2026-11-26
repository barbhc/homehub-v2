import { kindOf, type CareKind } from "../../shared/care/library"

/**
 * Does an item match what was typed into the Items search? (seventeen fixes,
 * 2026-11-25: "fridge" found nothing while the list held an LG French Door
 * Refrigerator, because search read the name and the brand only.)
 *
 * It matches when the words appear in the name, brand, model or room — or when
 * the query names the same KIND of thing as the item. Kinds come from the care
 * library's own rules (`kindOf`), so fridge/refrigerator, washer/washing
 * machine, dryer, dishwasher, water heater and furnace are kept in one place.
 *
 * Two everyday words the library's rules don't carry are added here, for
 * search only: "AC" / "air conditioner" (its HVAC rule reads "air condition"
 * as a whole word) and a bare "heater". They are deliberately NOT added to the
 * library — a kind there turns on care suggestions, and a portable AC is not a
 * central system with a filter to replace.
 */
const SEARCH_ONLY_KINDS: [CareKind, RegExp][] = [
  ["hvac", /\b(ac|a\/c|air[\s-]?condition\w*)\b/i],
  ["furnace", /(?<!water[\s-])\bheaters?\b/i],
]

function kindsOfText(text: string): Set<CareKind> {
  const kinds = new Set<CareKind>()
  const k = kindOf({ display_name: text })
  if (k) kinds.add(k)
  for (const [kind, re] of SEARCH_ONLY_KINDS) if (re.test(text)) kinds.add(kind)
  return kinds
}

/** The kinds a query names, or none. */
export function kindsInQuery(q: string): CareKind[] {
  const text = q.trim()
  return text ? [...kindsOfText(text)] : []
}

export interface SearchableItem {
  display_name: string
  brand: string | null
  model: string | null
  category: string | null
}

/** The item's kinds: the library's answer, plus the search-only words. */
function kindsOfItem(item: SearchableItem): Set<CareKind> {
  const kinds = kindsOfText([item.display_name, item.category?.replace(/-/g, " "), item.brand, item.model].filter(Boolean).join(" "))
  const k = kindOf(item)
  if (k) kinds.add(k)
  return kinds
}

export function itemMatchesQuery(item: SearchableItem, roomName: string | null, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const fields = [item.display_name, item.brand, item.model, item.category?.replace(/-/g, " "), roomName]
  if (fields.some((f) => (f ?? "").toLowerCase().includes(q))) return true
  const wanted = kindsInQuery(q)
  if (!wanted.length) return false
  const has = kindsOfItem(item)
  return wanted.some((k) => has.has(k))
}
