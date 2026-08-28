/**
 * postCreateLookup — the product lookup, moved off the add screen.
 *
 * Until round 18 the lookup ran on every keystroke of the add form and
 * reported itself in two cards ("We found this item" + spec chips) that the
 * user had to judge mid-flow. The owner's call (2026-08-27): that is a
 * distraction on a screen whose only job is naming the thing, and most runs
 * find nothing anyway. So it now fires exactly once, here, after the item
 * exists — and everything it finds waits on the item page, where the fields
 * it would fill are actually visible.
 *
 * Contract, from the approved mockup:
 *  - The CATEGORY applies silently. It is the one genuinely useful thing the
 *    lookup does, it is visible and reversible on the item page's Category
 *    row, and it only ever fills a blank — never overwrites a choice.
 *  - The NAME follows the category (owner, 2026-08-27): an item named by its
 *    composed "Brand Model" placeholder is renamed to the KIND of thing it is
 *    ("Refrigerator"), with the room appended only when that name is already
 *    taken in this home ("Air filter — Garage"). A name the user typed is
 *    never touched — composeItemName's `typed` short-circuit guarantees it.
 *  - SPECS are stored as suggestions, never applied. The item page renders
 *    them inline on the fields they belong to, each behind its own Add.
 *  - Finding NOTHING writes nothing the user can see. A miss is not an event.
 *
 * Fire-and-forget by design: the caller does not await this, and every
 * failure path ends in a tracked no-op — the item is already saved, so there
 * is nothing to surface and nothing to retry. If the app closes before the
 * lookup lands, the item simply stays as typed, which is exactly what it
 * would have been with the lookup turned off.
 */
import type { ItemUnit } from "@/integrations/types"
import { lookupProduct } from "@/modules/inventory/services/productLookupService"
import { updateItemUnit, getItemUnits } from "@/modules/items"
import { getRooms } from "@/modules/home"
import { mapOcrCategoryToTyped } from "@/modules/inventory/constants/itemCategories"
import { categoryLabel } from "@/lib/categoryLabel"
import { composeItemName } from "@/lib/itemName"
import { isAllowedSpecKey } from "../../../../shared/products/specKeys"
import { track } from "@/lib/analytics"

export async function runPostCreateLookup(item: ItemUnit): Promise<void> {
  const brand = (item.brand ?? "").trim()
  const model = (item.model ?? "").trim()
  if (brand.length < 2 || model.length < 2) return

  const result = await lookupProduct({
    brand,
    model,
    category: item.item_category,
    subType: item.sub_type,
  })
  if (result.error) {
    // The add screen used to warn about quota here; post-create there is no
    // screen to warn on and nothing the user needs to do. Track, stop.
    track("identity_lookup_error", { message: result.error.message.slice(0, 120), phase: "post_create" })
    return
  }
  const r = result.data
  track("identity_lookup_done", {
    outcome: r.identity ? "found" : r.variantCandidates.length > 0 ? "fuzzy" : "miss",
    source: r.identity?.source ?? null,
    cacheHit: r.cacheHit,
    phase: "post_create",
  })

  const updates: Parameters<typeof updateItemUnit>[2] = {}

  // Category: fill a blank, never overwrite. Sub-type rides with it — a
  // sub_type only means anything inside its category.
  const mapped = r.identity ? mapOcrCategoryToTyped(r.identity.rawCategory) : { itemCategory: null, subType: null }
  const fillCategory = item.item_category == null && mapped.itemCategory != null
  if (fillCategory) {
    updates.item_category = mapped.itemCategory
    updates.sub_type = mapped.subType
    if (mapped.subType) updates.category = mapped.subType
  }

  // Name: only the composed "Brand Model" placeholder is ours to replace, and
  // only once we actually know what kind of thing it is.
  const placeholder = `${brand} ${model}`.trim()
  if (fillCategory && item.display_name.trim() === placeholder) {
    const [existing, rooms] = await Promise.all([getItemUnits(item.home_id), getRooms(item.home_id)])
    const renamed = composeItemName({
      typeLabel: categoryLabel({ item_category: mapped.itemCategory, sub_type: mapped.subType }),
      brand,
      model,
      room: rooms.data?.find((rm) => rm.room_id === item.room_id)?.name ?? null,
      existingNames: (existing.data ?? [])
        .filter((i) => i.item_unit_id !== item.item_unit_id)
        .map((i) => i.display_name),
    })
    if (renamed && renamed !== "Item" && renamed !== placeholder) updates.display_name = renamed
  }

  // Specs: suggestions only. Off-schema keys are refused here for the same
  // reason the old Apply handler refused them — a value on a key no field
  // renders is invisible and unremovable — and keys the item already has a
  // value for have nothing to suggest.
  const fields = (item.category_fields ?? {}) as Record<string, unknown>
  const effectiveCategory = (fillCategory ? mapped.itemCategory : item.item_category) ?? null
  const suggestions = r.candidates
    .filter((c) => isAllowedSpecKey(effectiveCategory, c.key))
    .filter((c) => fields[c.key] == null || fields[c.key] === "")
    .map((c) => ({ key: c.key, label: c.label, value: c.value }))
  if (suggestions.length > 0) updates.lookup_suggestions = suggestions

  if (Object.keys(updates).length === 0) return
  const write = await updateItemUnit(item.home_id, item.item_unit_id, updates)
  if (write.error) {
    track("identity_lookup_error", { message: write.error.message.slice(0, 120), phase: "post_create_write" })
  }
}
