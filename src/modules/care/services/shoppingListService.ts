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
import type { ShoppingListItem, ShoppingStatus } from "@/integrations/types"
import type { ServiceResult } from "./taskService"

/**
 * Shopping list. Home-scoped (`homes/{homeId}/shoppingList`); rows soft-deleted.
 * The pure `toggleShoppingStatus` lives in ./shoppingStatus.
 */
export { toggleShoppingStatus } from "./shoppingStatus"

function iso(v: unknown): string {
  if (v instanceof Timestamp) return v.toDate().toISOString()
  return typeof v === "string" ? v : ""
}
function toItem(homeId: string, id: string, d: DocumentData): ShoppingListItem {
  return {
    id,
    home_id: homeId,
    supply_item_id: d.supplyItemId ?? null,
    name: d.name ?? "",
    quantity: d.quantity ?? null,
    status: (d.status ?? "needed") as ShoppingStatus,
    source_task_instance_id: d.sourceTaskInstanceId ?? null,
    created_at: iso(d.createdAt),
    updated_at: iso(d.updatedAt),
    deleted_at: d.deletedAt == null ? null : iso(d.deletedAt),
  }
}
function err(e: unknown): { data: null; error: { message: string } } {
  return { data: null, error: { message: e instanceof Error ? e.message : "Request failed" } }
}
const listCol = (homeId: string) => collection(db, `homes/${homeId}/shoppingList`)

export type AddShoppingItemInput = {
  name: string
  quantity?: string | null
  supplyItemId?: string | null
  sourceTaskInstanceId?: string | null
  /** Round 19: "I have one" writes a row born as `have` — the skip-a-cycle
   *  marker keyed to the current instance. Defaults to "needed". */
  status?: ShoppingStatus
}

export async function addShoppingItem(homeId: string, input: AddShoppingItemInput): Promise<ServiceResult<ShoppingListItem>> {
  try {
    const ref = doc(listCol(homeId))
    const now = serverTimestamp()
    await writeBatch(db)
      .set(ref, {
        name: input.name.trim(),
        quantity: input.quantity ?? null,
        supplyItemId: input.supplyItemId ?? null,
        sourceTaskInstanceId: input.sourceTaskInstanceId ?? null,
        status: input.status ?? "needed",
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .commit()
    const snap = await getDoc(ref)
    return { data: toItem(homeId, ref.id, snap.data() ?? {}), error: null }
  } catch (e) {
    return err(e)
  }
}

export async function listShoppingItems(
  homeId: string,
  opts?: { includeBought?: boolean }
): Promise<ServiceResult<ShoppingListItem[]>> {
  try {
    const snap = await getDocs(query(listCol(homeId), where("deletedAt", "==", null)))
    const items = snap.docs
      .map((d) => toItem(homeId, d.id, d.data()))
      .filter((i) => (opts?.includeBought ? true : i.status !== "bought"))
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    return { data: items, error: null }
  } catch (e) {
    return err(e)
  }
}

export async function setShoppingItemStatus(homeId: string, id: string, status: ShoppingStatus): Promise<ServiceResult<ShoppingListItem>> {
  try {
    const ref = doc(db, `homes/${homeId}/shoppingList/${id}`)
    await writeBatch(db).set(ref, { status, updatedAt: serverTimestamp() }, { merge: true }).commit()
    const snap = await getDoc(ref)
    if (!snap.exists()) return { data: null, error: { message: "Item not found" } }
    return { data: toItem(homeId, ref.id, snap.data()), error: null }
  } catch (e) {
    return err(e)
  }
}

export async function removeShoppingItem(homeId: string, id: string): Promise<ServiceResult<true>> {
  try {
    const now = serverTimestamp()
    await writeBatch(db).set(doc(db, `homes/${homeId}/shoppingList/${id}`), { deletedAt: now, updatedAt: now }, { merge: true }).commit()
    return { data: true, error: null }
  } catch (e) {
    return err(e)
  }
}
