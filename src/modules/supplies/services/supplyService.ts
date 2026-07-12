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
import type { SupplyItem, SupplyOption, SupplyCategory, SupplyOptionType } from "@/integrations/types"

export type ServiceResult<T> =
  | { data: T; error: null }
  | { data: null; error: { message: string } }

export type CreateSupplyItemInput = {
  name: string
  category: SupplyCategory
  oem_part_number?: string | null
  brand?: string | null
  model?: string | null
  spec?: string | null
}
export type CreateSupplyOptionInput = {
  supply_item_id: string
  option_type: SupplyOptionType
  seller?: string | null
  url?: string | null
  is_preferred?: boolean
  notes?: string | null
}

function iso(v: unknown): string {
  if (v instanceof Timestamp) return v.toDate().toISOString()
  return typeof v === "string" ? v : ""
}
function toItem(id: string, d: DocumentData): SupplyItem {
  return {
    supply_item_id: id,
    name: d.name ?? "",
    category: (d.category ?? "other") as SupplyCategory,
    oem_part_number: d.oemPartNumber ?? null,
    brand: d.brand ?? null,
    model: d.model ?? null,
    spec: d.spec ?? null,
    created_at: iso(d.createdAt),
    updated_at: iso(d.updatedAt),
    deleted_at: d.deletedAt == null ? null : iso(d.deletedAt),
  }
}
function toOption(supplyItemId: string, id: string, d: DocumentData): SupplyOption {
  return {
    supply_option_id: id,
    supply_item_id: supplyItemId,
    option_type: (d.optionType ?? "search") as SupplyOptionType,
    seller: d.seller ?? null,
    url: d.url ?? null,
    is_preferred: !!d.isPreferred,
    notes: d.notes ?? null,
    created_at: iso(d.createdAt),
    updated_at: iso(d.updatedAt),
    deleted_at: d.deletedAt == null ? null : iso(d.deletedAt),
  }
}
function err(e: unknown): { data: null; error: { message: string } } {
  return { data: null, error: { message: e instanceof Error ? e.message : "Request failed" } }
}

// supplyCatalog is GLOBAL and server-write-only (firestore.rules). Client reads
// are allowed; create* helpers write via a batch (rules gate them — the catalog
// is populated by parse/import server-side).
export async function getSupplyItems(): Promise<ServiceResult<SupplyItem[]>> {
  try {
    const snap = await getDocs(query(collection(db, "supplyCatalog"), where("deletedAt", "==", null)))
    return { data: snap.docs.map((d) => toItem(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name)), error: null }
  } catch (e) {
    return err(e)
  }
}

export async function getSupplyOptions(supplyItemId: string): Promise<ServiceResult<SupplyOption[]>> {
  try {
    const snap = await getDocs(query(collection(db, `supplyCatalog/${supplyItemId}/options`), where("deletedAt", "==", null)))
    const opts = snap.docs
      .map((d) => toOption(supplyItemId, d.id, d.data()))
      .sort((a, b) => Number(b.is_preferred) - Number(a.is_preferred) || (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    return { data: opts, error: null }
  } catch (e) {
    return err(e)
  }
}

export async function createSupplyItem(input: CreateSupplyItemInput): Promise<ServiceResult<SupplyItem>> {
  try {
    const ref = doc(collection(db, "supplyCatalog"))
    const now = serverTimestamp()
    await writeBatch(db)
      .set(ref, {
        name: input.name,
        category: input.category,
        oemPartNumber: input.oem_part_number ?? null,
        brand: input.brand ?? null,
        model: input.model ?? null,
        spec: input.spec ?? null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .commit()
    const snap = await getDoc(ref)
    return { data: toItem(ref.id, snap.data() ?? {}), error: null }
  } catch (e) {
    return err(e)
  }
}

export async function createSupplyOption(input: CreateSupplyOptionInput): Promise<ServiceResult<SupplyOption>> {
  try {
    const ref = doc(collection(db, `supplyCatalog/${input.supply_item_id}/options`))
    const now = serverTimestamp()
    await writeBatch(db)
      .set(ref, {
        optionType: input.option_type,
        seller: input.seller ?? null,
        url: input.url ?? null,
        isPreferred: input.is_preferred ?? false,
        notes: input.notes ?? null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .commit()
    const snap = await getDoc(ref)
    return { data: toOption(input.supply_item_id, ref.id, snap.data() ?? {}), error: null }
  } catch (e) {
    return err(e)
  }
}
