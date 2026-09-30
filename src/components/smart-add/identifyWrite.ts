/**
 * What the add form writes to the item — on the first "Add the manual" (or
 * "Add item"), and again when Back brings the user round to it a second time.
 *
 * HH-130: Back from the manual step returns to the brand and model, as the
 * owner asked — but pressing "Add the manual" again CREATED a second item and
 * left the first one orphaned, with nothing attached to it. The wizard session
 * already holds the item it made, so a second confirm re-identifies that item
 * in place instead.
 *
 * HH-112: only a name the user actually TYPED is theirs. The appliance lane
 * has no name field at all — IdentifyStep keeps a hidden "Brand Model" there,
 * so the simple lane can start from it — and passing that as the typed name
 * made composeItemName keep a part number. The kind of thing ("Air purifier")
 * could then only arrive later, and only if the product lookup found a
 * category. Now the type-based name applies at creation whenever the category
 * is known, and a blank category still leaves the exact "Brand Model"
 * placeholder that runPostCreateLookup recognises as ours to rename.
 */
import type { ItemCategory, ItemUnit } from "@/integrations/types"
import { composeItemName } from "@/lib/itemName"
import { categoryLabel } from "@/lib/categoryLabel"
import type { IdentifyData, IdentifyMode } from "./IdentifyStep"

/**
 * The name the user typed, or null.
 *
 * The simple lane's Name field is the only place a name can be typed; whatever
 * it shows when "Add item" is pressed is the user's choice. Nothing in the
 * appliance lane was typed as a name, whatever `data.name` holds.
 */
export function typedItemName(mode: IdentifyMode, data: Pick<IdentifyData, "name">): string | null {
  if (mode !== "simple") return null
  return data.name.trim() || null
}

/** The identity fields the add form owns — what a create writes, and a re-identify rewrites. */
export interface IdentityFields {
  room_id: string | null
  display_name: string
  category: string
  item_category: ItemCategory | null
  sub_type: string | null
  category_fields: Record<string, unknown>
  brand: string | null
  model: string | null
  serial_number: string | null
  purchase_date: string | null
  price_paid: number | null
}

export interface IdentityWrite {
  fields: IdentityFields
  /**
   * The item is still the product it was: same brand, same model. Always false
   * for a first confirm. When false, whatever the product lookup found for the
   * item describes some other product and must not survive the rewrite.
   */
  sameProduct: boolean
}

const orNull = (s: string | null | undefined) => (s ?? "").trim() || null

export function identityWrite(input: {
  mode: IdentifyMode
  data: IdentifyData
  /** The item this wizard session already created, as it is NOW — null on a first confirm. */
  current: ItemUnit | null
  /** The chosen room's name — the name only uses it to break a collision. */
  roomName: string | null
  /** Display names of every OTHER item in the home. */
  otherNames: readonly string[]
}): IdentityWrite {
  const { mode, data, current } = input
  const brand = orNull(data.brand)
  const model = orNull(data.model)
  const sameProduct = !!current && orNull(current.brand) === brand && orNull(current.model) === model

  // A category the form carries (the simple lane's picker, or a label scan) is
  // the user's. Without one, a re-identified item keeps the category the
  // lookup filled in — but only while it is still the same product.
  const keep = !data.itemCategory && sameProduct && current?.item_category ? current : null
  const itemCategory: ItemCategory | null = keep ? keep.item_category : data.itemCategory
  const subType = keep ? keep.sub_type : data.subType
  const category = keep ? keep.category : data.subType ?? "other"

  const display_name = composeItemName({
    typed: typedItemName(mode, data),
    typeLabel: categoryLabel({ item_category: itemCategory, sub_type: subType }),
    brand,
    model,
    room: input.roomName,
    existingNames: input.otherNames,
  })

  return {
    sameProduct,
    fields: {
      room_id: data.locationId,
      display_name,
      category,
      item_category: itemCategory,
      sub_type: subType,
      category_fields: data.categoryFields,
      brand,
      model,
      serial_number: orNull(data.serialNumber),
      purchase_date: orNull(data.purchaseDate),
      price_paid: data.purchasePrice,
    },
  }
}
