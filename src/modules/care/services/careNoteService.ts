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
import type { CareNote, CareNoteInsert, CareNoteScope } from "@/integrations/types"

export type ServiceResult<T> =
  | { data: T; error: null }
  | { data: null; error: { message: string } }

// ── Edge mapper: Firestore camelCase → curated snake_case CareNote ──
function iso(v: unknown): string {
  if (v instanceof Timestamp) return v.toDate().toISOString()
  return typeof v === "string" ? v : ""
}
function toCareNote(homeId: string, id: string, d: DocumentData): CareNote {
  return {
    note_id: id,
    home_id: homeId,
    room_id: d.roomId ?? null,
    item_unit_id: d.itemUnitId ?? null,
    scope: (d.scope ?? "home") as CareNoteScope,
    category: d.category ?? null,
    chunk_type: (d.chunkType ?? "care") as CareNote["chunk_type"],
    title: d.title ?? null,
    content: d.content ?? "",
    source: (d.source ?? "user") as CareNote["source"],
    source_url: d.sourceUrl ?? null,
    task_template_id: d.taskTemplateId ?? null,
    created_at: iso(d.createdAt),
    updated_at: iso(d.updatedAt),
    deleted_at: d.deletedAt == null ? null : iso(d.deletedAt),
  }
}
function err(e: unknown): { data: null; error: { message: string } } {
  return { data: null, error: { message: e instanceof Error ? e.message : "Request failed" } }
}
const notesCol = (homeId: string) => collection(db, `homes/${homeId}/careNotes`)

export async function getCareNotesByScope(homeId: string, scope: CareNoteScope): Promise<ServiceResult<CareNote[]>> {
  try {
    const snap = await getDocs(query(notesCol(homeId), where("deletedAt", "==", null), where("scope", "==", scope)))
    const notes = snap.docs
      .map((d) => toCareNote(homeId, d.id, d.data()))
      .sort((a, b) => (a.category ?? "").localeCompare(b.category ?? "") || (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    return { data: notes, error: null }
  } catch (e) {
    return err(e)
  }
}

export async function getCareNotesByItem(homeId: string, itemUnitId: string): Promise<ServiceResult<CareNote[]>> {
  try {
    const snap = await getDocs(query(notesCol(homeId), where("deletedAt", "==", null), where("itemUnitId", "==", itemUnitId)))
    const notes = snap.docs
      .map((d) => toCareNote(homeId, d.id, d.data()))
      .sort((a, b) => (a.chunk_type ?? "").localeCompare(b.chunk_type ?? "") || (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    return { data: notes, error: null }
  } catch (e) {
    return err(e)
  }
}

/** All item-scoped care notes for a home, with item + room metadata (client join). */
export async function getCareNotesByHome(
  homeId: string
): Promise<ServiceResult<(CareNote & { item_name: string; item_category: string | null; room_name: string | null })[]>> {
  try {
    const [notesSnap, itemsSnap, roomsSnap] = await Promise.all([
      getDocs(query(notesCol(homeId), where("deletedAt", "==", null), where("scope", "==", "item_unit"))),
      getDocs(query(collection(db, `homes/${homeId}/items`), where("deletedAt", "==", null))),
      getDocs(query(collection(db, `homes/${homeId}/rooms`), where("deletedAt", "==", null))),
    ])
    const roomNames = new Map(roomsSnap.docs.map((r) => [r.id, (r.get("name") as string) ?? ""]))
    const itemMap = new Map(
      itemsSnap.docs.map((i) => [
        i.id,
        { display_name: (i.get("displayName") as string) ?? "", category: (i.get("category") as string | null) ?? null, room_id: (i.get("roomId") as string | null) ?? null },
      ])
    )
    const result = notesSnap.docs.map((d) => {
      const n = toCareNote(homeId, d.id, d.data())
      const item = n.item_unit_id ? itemMap.get(n.item_unit_id) : null
      return {
        ...n,
        item_name: item?.display_name ?? "Unknown",
        item_category: item?.category ?? null,
        room_name: item?.room_id ? roomNames.get(item.room_id) ?? null : null,
      }
    })
    return { data: result, error: null }
  } catch (e) {
    return err(e)
  }
}

export async function createCareNote(input: CareNoteInsert): Promise<ServiceResult<CareNote>> {
  try {
    const ref = doc(notesCol(input.home_id))
    const now = serverTimestamp()
    await writeBatch(db)
      .set(ref, {
        roomId: input.room_id ?? null,
        itemUnitId: input.item_unit_id ?? null,
        scope: input.scope,
        category: input.category ?? null,
        chunkType: input.chunk_type ?? "care",
        title: input.title ?? null,
        content: input.content,
        source: input.source ?? "user",
        sourceUrl: input.source_url ?? null,
        taskTemplateId: input.task_template_id ?? null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .commit()
    const snap = await getDoc(ref)
    return { data: toCareNote(input.home_id, ref.id, snap.data() ?? {}), error: null }
  } catch (e) {
    return err(e)
  }
}

export async function updateCareNote(
  homeId: string,
  noteId: string,
  updates: Partial<Pick<CareNote, "title" | "content" | "category" | "chunk_type" | "task_template_id">>
): Promise<ServiceResult<CareNote>> {
  try {
    const patch: Record<string, unknown> = { updatedAt: serverTimestamp() }
    if (updates.title !== undefined) patch.title = updates.title
    if (updates.content !== undefined) patch.content = updates.content
    if (updates.category !== undefined) patch.category = updates.category
    if (updates.chunk_type !== undefined) patch.chunkType = updates.chunk_type
    if (updates.task_template_id !== undefined) patch.taskTemplateId = updates.task_template_id
    const ref = doc(db, `homes/${homeId}/careNotes/${noteId}`)
    await writeBatch(db).set(ref, patch, { merge: true }).commit()
    const snap = await getDoc(ref)
    if (!snap.exists()) return { data: null, error: { message: "Care note not found" } }
    return { data: toCareNote(homeId, ref.id, snap.data()), error: null }
  } catch (e) {
    return err(e)
  }
}

export async function deleteCareNote(homeId: string, noteId: string): Promise<ServiceResult<true>> {
  try {
    const now = serverTimestamp()
    await writeBatch(db)
      .set(doc(db, `homes/${homeId}/careNotes/${noteId}`), { deletedAt: now, updatedAt: now }, { merge: true })
      .commit()
    return { data: true, error: null }
  } catch (e) {
    return err(e)
  }
}
