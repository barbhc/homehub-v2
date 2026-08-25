/**
 * identityApply — pure apply/undo mechanics for the "We found this" card.
 *
 * Design contract (add-item Flow A): the identity card NEVER auto-applies and
 * NEVER overwrites what the user typed. "Use this" fills only blank fields,
 * records exactly what it changed, and "Undo" restores precisely those priors —
 * nothing else. Pure functions so the contract is unit-testable.
 */
import type { IdentifyData } from "@/components/smart-add/IdentifyStep"
import type { ProductIdentity } from "@/modules/inventory/services/productLookupService"
import { mapOcrCategoryToTyped } from "@/modules/inventory/constants/itemCategories"
import { isUsableProductName } from "@/lib/itemName"

/** Priors for exactly the fields applyIdentity changed (undo restores these). */
export type IdentitySnapshot = {
  name: string | null
  itemCategory: IdentifyData["itemCategory"] | null
  subType: string | null
  /** Which fields the apply actually touched — undo restores only these. */
  touched: { name: boolean; category: boolean }
}

export function applyIdentity(
  data: IdentifyData,
  identity: ProductIdentity,
  opts?: { nameIsPlaceholder?: boolean },
): { next: IdentifyData; snapshot: IdentitySnapshot } {
  const mapped = mapOcrCategoryToTyped(identity.rawCategory)
  // A name the appliance lane auto-composed ("LG WM4000HWA") is a placeholder,
  // not a user decision — the identity's real product name may replace it.
  // The caller owns placeholder tracking (IdentifyStep's placeholderNamesRef).
  const nameIsPlaceholder = !data.name.trim() || !!opts?.nameIsPlaceholder
  // HH-125: a resolved "name" is not automatically a name. "Pan for NSLACO5"
  // came from a manual heading and was kept verbatim, because composeItemName
  // treats anything already in this field as the user's own choice. When the
  // resolver's name fails that test we leave the field alone and let
  // composeItemName fall back to the item TYPE — which is what HH-112 asked for.
  const fillName = nameIsPlaceholder && isUsableProductName(identity.name, data.model)
  // Category+subType move together (a subType only makes sense inside its
  // category) — fill only when the user hasn't picked a category yet.
  const fillCategory = data.itemCategory == null && mapped.itemCategory != null

  const next: IdentifyData = {
    ...data,
    name: fillName ? identity.name : data.name,
    itemCategory: fillCategory ? mapped.itemCategory : data.itemCategory,
    subType: fillCategory ? mapped.subType : data.subType,
  }
  const snapshot: IdentitySnapshot = {
    name: data.name,
    itemCategory: data.itemCategory,
    subType: data.subType,
    touched: { name: fillName, category: fillCategory },
  }
  return { next, snapshot }
}

export function undoIdentity(data: IdentifyData, snapshot: IdentitySnapshot): IdentifyData {
  return {
    ...data,
    name: snapshot.touched.name ? (snapshot.name ?? "") : data.name,
    itemCategory: snapshot.touched.category ? snapshot.itemCategory : data.itemCategory,
    subType: snapshot.touched.category ? snapshot.subType : data.subType,
  }
}
