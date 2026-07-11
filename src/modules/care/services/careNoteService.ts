import { supabase } from "@/integrations/shim/client"
import type {
  CareNote,
  CareNoteInsert,
  CareNoteScope,
} from "@/integrations/types"

export type ServiceResult<T> =
  | { data: T; error: null }
  | { data: null; error: { message: string } }

export async function getCareNotesByScope(
  homeId: string,
  scope: CareNoteScope
): Promise<ServiceResult<CareNote[]>> {
  const { data, error } = await supabase
    .from("care_note")
    .select("*")
    .eq("home_id", homeId)
    .eq("scope", scope)
    .is("deleted_at", null)
    .order("category")
    .order("created_at", { ascending: false })
  if (error) return { data: null, error: { message: error.message } }
  return { data: (data ?? []) as CareNote[], error: null }
}

export async function getCareNotesByItem(
  itemUnitId: string
): Promise<ServiceResult<CareNote[]>> {
  const { data, error } = await supabase
    .from("care_note")
    .select("*")
    .eq("item_unit_id", itemUnitId)
    .is("deleted_at", null)
    .order("chunk_type")
    .order("created_at", { ascending: false })
  if (error) return { data: null, error: { message: error.message } }
  return { data: (data ?? []) as CareNote[], error: null }
}

/** Fetch all item-scoped care notes for a home, with item metadata. */
export async function getCareNotesByHome(
  homeId: string
): Promise<
  ServiceResult<
    (CareNote & {
      item_name: string
      item_category: string | null
      room_name: string | null
    })[]
  >
> {
  const { data: notes, error } = await supabase
    .from("care_note")
    .select("*")
    .eq("home_id", homeId)
    .eq("scope", "item_unit")
    .is("deleted_at", null)
  if (error) return { data: null, error: { message: error.message } }
  if (!notes?.length) return { data: [], error: null }

  const itemIds = [
    ...new Set(
      notes.filter((n) => n.item_unit_id).map((n) => n.item_unit_id as string)
    ),
  ]
  const { data: items } = await supabase
    .from("item_unit")
    .select("item_unit_id, display_name, category, room_id")
    .in("item_unit_id", itemIds)

  const itemMap = new Map(
    (items ?? []).map((i) => [
      (i as { item_unit_id: string }).item_unit_id,
      i as { display_name: string; category: string | null; room_id: string | null },
    ])
  )
  const roomIds = [
    ...new Set(
      (items ?? [])
        .filter((i) => (i as { room_id?: string | null }).room_id)
        .map((i) => (i as { room_id: string }).room_id)
    ),
  ]
  let roomNames = new Map<string, string>()
  if (roomIds.length > 0) {
    const { data: rooms } = await supabase
      .from("room")
      .select("room_id, name")
      .in("room_id", roomIds)
    roomNames = new Map(
      (rooms ?? []).map((r) => [
        (r as { room_id: string }).room_id,
        (r as { name: string }).name,
      ])
    )
  }

  const result = (notes as CareNote[]).map((n) => {
    const item = n.item_unit_id ? itemMap.get(n.item_unit_id) : null
    const roomId = item?.room_id ?? null
    return {
      ...n,
      item_name: item?.display_name ?? "Unknown",
      item_category: item?.category ?? null,
      room_name: roomId ? roomNames.get(roomId) ?? null : null,
    }
  })
  return { data: result, error: null }
}

export async function createCareNote(
  input: CareNoteInsert
): Promise<ServiceResult<CareNote>> {
  const { data, error } = await supabase
    .from("care_note")
    .insert(input)
    .select()
    .single()
  if (error) return { data: null, error: { message: error.message } }
  return { data: data as CareNote, error: null }
}

export async function updateCareNote(
  noteId: string,
  updates: Partial<
    Pick<
      CareNote,
      "title" | "content" | "category" | "chunk_type" | "task_template_id"
    >
  >
): Promise<ServiceResult<CareNote>> {
  const { data, error } = await supabase
    .from("care_note")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("note_id", noteId)
    .select()
    .single()
  if (error) return { data: null, error: { message: error.message } }
  return { data: data as CareNote, error: null }
}

export async function deleteCareNote(
  noteId: string
): Promise<ServiceResult<true>> {
  const { error } = await supabase
    .from("care_note")
    .update({ deleted_at: new Date().toISOString() })
    .eq("note_id", noteId)
  if (error) return { data: null, error: { message: error.message } }
  return { data: true, error: null }
}
