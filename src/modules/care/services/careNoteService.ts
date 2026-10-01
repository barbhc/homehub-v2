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

// ── Notes (design/spares-and-notes.md §2) ────────────────────────────────────

/** Every live note in the home — house, room and item — in one read, newest first. */
export async function getHomeNotes(homeId: string): Promise<ServiceResult<CareNote[]>> {
  try {
    const snap = await getDocs(query(notesCol(homeId), where("deletedAt", "==", null)))
    const notes = snap.docs
      .map((d) => toCareNote(homeId, d.id, d.data()))
      .sort((a, b) => (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at))
    return { data: notes, error: null }
  } catch (e) {
    return err(e)
  }
}

/**
 * The item's old single `notes` text becomes a real note and the field clears,
 * in ONE batch — so there is never a moment with both, or neither. The note's
 * id is fixed (`legacy-<itemId>`), so doing it twice is doing it once.
 */
export async function promoteLegacyItemNote(homeId: string, itemUnitId: string, content: string): Promise<ServiceResult<CareNote>> {
  try {
    const ref = doc(notesCol(homeId), `legacy-${itemUnitId}`)
    const now = serverTimestamp()
    await writeBatch(db)
      .set(ref, {
        roomId: null,
        itemUnitId,
        scope: "item_unit",
        category: null,
        chunkType: "care",
        title: null,
        content,
        source: "user",
        sourceUrl: null,
        taskTemplateId: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .set(doc(db, `homes/${homeId}/items/${itemUnitId}`), { notes: null, updatedAt: now }, { merge: true })
      .commit()
    const snap = await getDoc(ref)
    return { data: toCareNote(homeId, ref.id, snap.data() ?? {}), error: null }
  } catch (e) {
    return err(e)
  }
}

/** Deleting the legacy note = clearing the old field. */
export async function clearLegacyItemNote(homeId: string, itemUnitId: string): Promise<ServiceResult<true>> {
  try {
    await writeBatch(db)
      .set(doc(db, `homes/${homeId}/items/${itemUnitId}`), { notes: null, updatedAt: serverTimestamp() }, { merge: true })
      .commit()
    return { data: true, error: null }
  } catch (e) {
    return err(e)
  }
}
