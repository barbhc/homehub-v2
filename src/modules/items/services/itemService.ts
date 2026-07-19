import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
  Timestamp,
  type DocumentData,
} from "firebase/firestore"
import { db } from "@/integrations/firebase"
import type { ItemCategory, ItemUnit, ItemUnitStatus } from "@/integrations/types"

export type ServiceResult<T> =
  | { data: T; error: null }
  | { data: null; error: { message: string } }

export type CreateItemUnitInput = {
  home_id: string
  room_id?: string | null
  display_name: string
  category: string
  item_category?: ItemCategory | null
  sub_type?: string | null
  category_fields?: Record<string, unknown> | null
  brand?: string | null
  model?: string | null
  serial_number?: string | null
  purchase_date?: string | null
  install_date?: string | null
  price_paid?: number | null
  notes?: string | null
}

export type UpdateItemUnitInput = {
  room_id?: string | null
  display_name?: string
  category?: string
  item_category?: ItemCategory | null
  sub_type?: string | null
  category_fields?: Record<string, unknown> | null
  brand?: string | null
  model?: string | null
  serial_number?: string | null
  purchase_date?: string | null
  install_date?: string | null
  status?: ItemUnitStatus
  notes?: string | null
  photo_storage_ref?: string | null
  store_name?: string | null
  price_paid?: number | null
  receipt_storage_path?: string | null
  warranty_expiry_date?: string | null
  tags?: string[]
  setup_revealed_at?: string | null
  variant_tags?: string[]
  warranty_registered_at?: string | null
}

// ── Edge mappers: Firestore camelCase → curated snake_case ItemUnit ──
function iso(v: unknown): string {
  if (v instanceof Timestamp) return v.toDate().toISOString()
  return typeof v === "string" ? v : ""
}
function isoOrNull(v: unknown): string | null {
  return v == null ? null : iso(v)
}
function toItemUnit(id: string, homeId: string, d: DocumentData): ItemUnit {
  return {
    item_unit_id: id,
    home_id: homeId,
    room_id: d.roomId ?? null,
    display_name: d.displayName ?? "",
    category: d.category ?? "",
    item_category: d.itemCategory ?? null,
    sub_type: d.subType ?? null,
    category_fields: d.categoryFields ?? null,
    brand: d.brand ?? null,
    model: d.model ?? null,
    serial_number: d.serialNumber ?? null,
    purchase_date: d.purchaseDate ?? null,
    install_date: d.installDate ?? null,
    status: (d.status ?? "active") as ItemUnitStatus,
    notes: d.notes ?? null,
    photo_storage_ref: d.photoPath ?? null,
    store_name: d.storeName ?? null,
    price_paid: d.pricePaid ?? null,
    receipt_storage_path: d.receiptPath ?? null,
    warranty_duration_months: d.warrantyDurationMonths ?? null,
    warranty_coverage: d.warrantyCoverage ?? null,
    warranty_expiry_date: d.warrantyExpiryDate ?? null,
    manufactured_year: d.manufacturedYear ?? null,
    recall_status: d.recallStatus ?? null,
    recall_checked_at: isoOrNull(d.recallCheckedAt),
    recall_notes: d.recallNotes ?? null,
    tags: Array.isArray(d.tags) ? d.tags : [],
    setup_revealed_at: isoOrNull(d.setupRevealedAt),
    variant_tags: Array.isArray(d.variantTags) ? d.variantTags : [],
    warranty_exclusions: Array.isArray(d.warrantyExclusions) ? d.warrantyExclusions : undefined,
    warranty_registration_required: d.warrantyRegistrationRequired ?? undefined,
    warranty_registration_url: d.warrantyRegistrationUrl ?? undefined,
    warranty_contact: d.warrantyContact ?? undefined,
    warranty_registered_at: isoOrNull(d.warrantyRegisteredAt),
    created_at: iso(d.createdAt),
    updated_at: iso(d.updatedAt),
    deleted_at: isoOrNull(d.deletedAt),
  }
}

/** UpdateItemUnitInput (snake_case) key → Firestore doc field (camelCase). */
const UPDATE_FIELD_MAP: Record<string, string> = {
  room_id: "roomId",
  display_name: "displayName",
  category: "category",
  item_category: "itemCategory",
  sub_type: "subType",
  category_fields: "categoryFields",
  brand: "brand",
  model: "model",
  serial_number: "serialNumber",
  purchase_date: "purchaseDate",
  install_date: "installDate",
  status: "status",
  notes: "notes",
  photo_storage_ref: "photoPath",
  store_name: "storeName",
  price_paid: "pricePaid",
  receipt_storage_path: "receiptPath",
  warranty_expiry_date: "warrantyExpiryDate",
  tags: "tags",
  setup_revealed_at: "setupRevealedAt",
  variant_tags: "variantTags",
  warranty_registered_at: "warrantyRegisteredAt",
}

function err(e: unknown): { data: null; error: { message: string } } {
  return { data: null, error: { message: e instanceof Error ? e.message : "Request failed" } }
}

/** Creates a new item_unit. */
export async function createItemUnit(input: CreateItemUnitInput): Promise<ServiceResult<ItemUnit>> {
  try {
    const ref = doc(collection(db, `homes/${input.home_id}/items`))
    const now = serverTimestamp()
    await writeBatch(db)
      .set(ref, {
        roomId: input.room_id ?? null,
        displayName: input.display_name,
        category: input.category,
        itemCategory: input.item_category ?? null,
        subType: input.sub_type ?? null,
        categoryFields: input.category_fields ?? {},
        brand: input.brand ?? null,
        model: input.model ?? null,
        serialNumber: input.serial_number ?? null,
        purchaseDate: input.purchase_date ?? null,
        installDate: input.install_date ?? null,
        pricePaid: input.price_paid ?? null,
        notes: input.notes ?? null,
        status: "active",
        tags: [],
        variantTags: [],
        recallStatus: null,
        photoPath: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .commit()
    const snap = await getDoc(ref)
    return { data: toItemUnit(ref.id, input.home_id, snap.data() ?? {}), error: null }
  } catch (e) {
    return err(e)
  }
}

/** Updates an item_unit. Only provided fields are written. */
export async function updateItemUnit(
  homeId: string,
  itemUnitId: string,
  input: UpdateItemUnitInput
): Promise<ServiceResult<ItemUnit>> {
  try {
    const updates: Record<string, unknown> = { updatedAt: serverTimestamp() }
    for (const [k, v] of Object.entries(input)) {
      const field = UPDATE_FIELD_MAP[k]
      if (field !== undefined) updates[field] = v
    }
    const ref = doc(db, `homes/${homeId}/items/${itemUnitId}`)
    await writeBatch(db).set(ref, updates, { merge: true }).commit()
    const snap = await getDoc(ref)
    if (!snap.exists()) return { data: null, error: { message: "Item not found" } }
    return { data: toItemUnit(ref.id, homeId, snap.data()), error: null }
  } catch (e) {
    return err(e)
  }
}

/** Fetches item_units for a home. Defaults to active; pass statusFilter for others. */
export async function getItemUnits(
  homeId: string,
  options?: { statusFilter?: ItemUnitStatus[] }
): Promise<ServiceResult<ItemUnit[]>> {
  try {
    const statuses = options?.statusFilter?.length ? options.statusFilter : (["active"] as ItemUnitStatus[])
    // Two equality-class filters (status in / deletedAt ==) use single-field
    // indexes; sort client-side to avoid a composite index for the order-by.
    const snap = await getDocs(
      query(collection(db, `homes/${homeId}/items`), where("deletedAt", "==", null), where("status", "in", statuses))
    )
    const items = snap.docs
      .map((docSnap) => toItemUnit(docSnap.id, homeId, docSnap.data()))
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    return { data: items, error: null }
  } catch (e) {
    return err(e)
  }
}

/** Fetches a single item_unit by id. */
export async function getItemUnit(homeId: string, itemUnitId: string): Promise<ServiceResult<ItemUnit | null>> {
  try {
    const snap = await getDoc(doc(db, `homes/${homeId}/items/${itemUnitId}`))
    if (!snap.exists() || snap.get("deletedAt") != null) return { data: null, error: null }
    return { data: toItemUnit(snap.id, homeId, snap.data()), error: null }
  } catch (e) {
    return err(e)
  }
}

export type SoftDeleteResult = { success: true } | { success: false; error: string }

/**
 * Soft-deletes an item_unit AND cascades to the work it generated.
 *
 * Without the cascade, deleting an item left its task templates + scheduled
 * instances live forever — they kept surfacing on Home/Tasks for an appliance
 * the owner had removed (observed in prod: a deleted duplicate "Cafe Range"
 * still driving 9 tasks, which read as duplicates of the kept item's tasks).
 *
 * COMPLETED instances are deliberately preserved: they're real history of work
 * that was actually done, and the completion timeline should keep showing them.
 */
export async function softDeleteItemUnit(homeId: string, itemUnitId: string): Promise<SoftDeleteResult> {
  try {
    const now = serverTimestamp()
    const batch = writeBatch(db)
    batch.set(doc(db, `homes/${homeId}/items/${itemUnitId}`), { deletedAt: now, updatedAt: now }, { merge: true })

    // The item's task templates.
    const tplSnap = await getDocs(
      query(collection(db, `homes/${homeId}/taskTemplates`), where("itemUnitId", "==", itemUnitId))
    )
    for (const d of tplSnap.docs) {
      if (d.get("deletedAt") != null) continue
      batch.set(d.ref, { isActive: false, deletedAt: now, updatedAt: now }, { merge: true })
    }

    // Their still-open instances (status filtered client-side to avoid a composite index).
    const instSnap = await getDocs(
      query(collection(db, `homes/${homeId}/taskInstances`), where("itemUnitId", "==", itemUnitId))
    )
    for (const d of instSnap.docs) {
      const status = d.get("status")
      if (d.get("deletedAt") == null && (status === "scheduled" || status === "snoozed")) {
        batch.set(d.ref, { deletedAt: now, updatedAt: now }, { merge: true })
      }
    }

    await batch.commit()
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Request failed" }
  }
}
