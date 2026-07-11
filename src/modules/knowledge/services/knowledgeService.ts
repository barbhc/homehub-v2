import { supabase } from "@/integrations/shim/client"
import type {
  KnowledgeChunk,
  ChunkType,
  DiagramImageUrl,
  ChatFaq,
  ChatFaqInsert,
} from "@/integrations/types"

export type ServiceResult<T> =
  | { data: T; error: null }
  | { data: null; error: { message: string } }

/**
 * Fetches knowledge_chunks for a manual. Used for RAG and display.
 */
export async function getChunksByManual(
  manualId: string,
  chunkTypeFilter?: ChunkType[]
): Promise<ServiceResult<KnowledgeChunk[]>> {
  let query = supabase
    .from("knowledge_chunk")
    .select("*")
    .eq("manual_id", manualId)
    .is("deleted_at", null)
    .order("chunk_type")
    .order("created_at", { ascending: false })

  if (chunkTypeFilter && chunkTypeFilter.length > 0) {
    query = query.in("chunk_type", chunkTypeFilter)
  }

  const { error, data } = await query
  if (error) return { data: null, error: { message: error.message } }
  return { data: (data ?? []) as KnowledgeChunk[], error: null }
}

/**
 * Fetches knowledge_chunks for an item_unit (via manual_document). Groups by chunk_type.
 */
export async function getChunksByItem(
  itemUnitId: string,
  chunkTypeFilter?: ChunkType[]
): Promise<ServiceResult<KnowledgeChunk[]>> {
  const { data: manuals, error: manualErr } = await supabase
    .from("manual_document")
    .select("manual_id")
    .eq("item_unit_id", itemUnitId)
    .is("deleted_at", null)

  if (manualErr) return { data: null, error: { message: manualErr.message } }
  if (!manuals || manuals.length === 0) return { data: [], error: null }

  const manualIds = (manuals as { manual_id: string }[]).map((m) => m.manual_id)

  let query = supabase
    .from("knowledge_chunk")
    .select("*")
    .in("manual_id", manualIds)
    .is("deleted_at", null)
    .order("chunk_type")
    .order("created_at", { ascending: false })

  if (chunkTypeFilter && chunkTypeFilter.length > 0) {
    query = query.in("chunk_type", chunkTypeFilter)
  }

  const { error, data } = await query
  if (error) return { data: null, error: { message: error.message } }
  return { data: (data ?? []) as KnowledgeChunk[], error: null }
}

/**
 * Search knowledge_chunks by text (simple ilike for v1).
 * For full RAG, use embedding_ref + vector search when embeddings are available.
 */
export async function searchChunks(
  itemUnitId: string,
  query: string,
  preferTypes?: ChunkType[]
): Promise<ServiceResult<KnowledgeChunk[]>> {
  const { data: manuals, error: manualErr } = await supabase
    .from("manual_document")
    .select("manual_id")
    .eq("item_unit_id", itemUnitId)
    .is("deleted_at", null)

  if (manualErr) return { data: null, error: { message: manualErr.message } }
  if (!manuals || manuals.length === 0) return { data: [], error: null }

  const manualIds = (manuals as { manual_id: string }[]).map((m) => m.manual_id)

  let dbQuery = supabase
    .from("knowledge_chunk")
    .select("*")
    .in("manual_id", manualIds)
    .is("deleted_at", null)
    .ilike("content", `%${query}%`)

  if (preferTypes && preferTypes.length > 0) {
    dbQuery = dbQuery.in("chunk_type", preferTypes)
  }

  const { error, data } = await dbQuery
    .order("chunk_type")
    .order("created_at", { ascending: false })

  if (error) return { data: null, error: { message: error.message } }
  return { data: (data ?? []) as KnowledgeChunk[], error: null }
}

// --- Chat FAQ (saved Q&A) ---

export async function saveFaq(input: ChatFaqInsert): Promise<ServiceResult<ChatFaq>> {
  const { data, error } = await supabase
    .from("chat_faq")
    .insert(input)
    .select()
    .single()
  if (error) return { data: null, error: { message: error.message } }
  return { data: data as ChatFaq, error: null }
}

export async function getFaqsByHome(homeId: string): Promise<ServiceResult<ChatFaq[]>> {
  const { data, error } = await supabase
    .from("chat_faq")
    .select("*")
    .eq("home_id", homeId)
    .order("created_at", { ascending: false })
  if (error) return { data: null, error: { message: error.message } }
  return { data: (data ?? []) as ChatFaq[], error: null }
}

export async function getFaqsByItem(itemUnitId: string): Promise<ServiceResult<ChatFaq[]>> {
  const { data, error } = await supabase
    .from("chat_faq")
    .select("*")
    .eq("item_unit_id", itemUnitId)
    .order("created_at", { ascending: false })
  if (error) return { data: null, error: { message: error.message } }
  return { data: (data ?? []) as ChatFaq[], error: null }
}

export async function deleteFaq(faqId: string): Promise<ServiceResult<true>> {
  const { error } = await supabase.from("chat_faq").delete().eq("faq_id", faqId)
  if (error) return { data: null, error: { message: error.message } }
  return { data: true, error: null }
}

/** Chunk with item metadata for FAQ display. */
export type ChunkWithItemMeta = KnowledgeChunk & {
  item_name: string
  item_unit_id: string
  item_category: string | null
  room_name: string | null
}

/** Returns care/how_to/troubleshooting chunks for all items in a home, with item metadata. */
export async function getKnowledgeChunksByHome(
  homeId: string,
  types: ChunkType[] = ["care", "how_to", "troubleshooting"]
): Promise<ServiceResult<ChunkWithItemMeta[]>> {
  const { data: items, error: itemsErr } = await supabase
    .from("item_unit")
    .select("item_unit_id, display_name, room_id, category")
    .eq("home_id", homeId)
    .is("deleted_at", null)
  if (itemsErr) return { data: null, error: { message: itemsErr.message } }
  if (!items?.length) return { data: [], error: null }

  const itemIds = items.map((i) => i.item_unit_id)
  const itemByManual = new Map<string, string>()
  const itemNames = new Map<string, string>()
  const itemCategories = new Map<string, string | null>()
  const roomIdByItem = new Map<string, string | null>()

  for (const i of items as Array<{ item_unit_id: string; display_name: string; room_id: string | null; category: string }>) {
    itemNames.set(i.item_unit_id, i.display_name)
    itemCategories.set(i.item_unit_id, i.category ?? null)
    roomIdByItem.set(i.item_unit_id, i.room_id ?? null)
  }

  const { data: manuals, error: manualsErr } = await supabase
    .from("manual_document")
    .select("manual_id, item_unit_id")
    .in("item_unit_id", itemIds)
    .is("deleted_at", null)
  if (manualsErr) return { data: null, error: { message: manualsErr.message } }
  if (!manuals?.length) return { data: [], error: null }

  const manualIds = manuals.map((m) => m.manual_id)
  for (const m of manuals as Array<{ manual_id: string; item_unit_id: string }>) {
    itemByManual.set(m.manual_id, m.item_unit_id)
  }

  const roomIds = [...new Set(
    items
      .filter((i) => (i as { room_id?: string | null }).room_id)
      .map((i) => (i as { room_id: string }).room_id)
  )] as string[]
  let roomNamesById = new Map<string, string>()
  if (roomIds.length > 0) {
    const { data: rooms } = await supabase
      .from("room")
      .select("room_id, name")
      .in("room_id", roomIds)
    roomNamesById = new Map((rooms ?? []).map((r) => [(r as { room_id: string; name: string }).room_id, (r as { name: string }).name]))
  }

  const query = supabase
    .from("knowledge_chunk")
    .select("*")
    .in("manual_id", manualIds)
    .is("deleted_at", null)
    .in("chunk_type", types)
    .order("chunk_type")
    .order("created_at", { ascending: false })

  const { data: chunks, error } = await query
  if (error) return { data: null, error: { message: error.message } }

  const withItemMeta = (chunks ?? []).map((c) => {
    const manualId = (c as KnowledgeChunk).manual_id
    const iuId = itemByManual.get(manualId) ?? ""
    const roomId = iuId ? roomIdByItem.get(iuId) ?? null : null
    const room_name = iuId && roomId ? roomNamesById.get(roomId) ?? null : null
    const item_name = iuId ? itemNames.get(iuId) ?? "Unknown" : "Unknown"
    const item_category = iuId ? (itemCategories.get(iuId) ?? null) : null
    return {
      ...(c as KnowledgeChunk),
      item_name,
      item_unit_id: iuId,
      item_category,
      room_name,
    }
  })
  return { data: withItemMeta, error: null }
}

/**
 * Reclassifies a task_template as a knowledge chunk (how_to or troubleshooting).
 * Creates a new knowledge_chunk from the task's content and archives the task.
 */
export async function reclassifyTaskAsChunk(
  taskTemplateId: string,
  homeId: string,
  itemUnitId: string,
  targetType: "how_to" | "troubleshooting"
): Promise<ServiceResult<KnowledgeChunk>> {
  // 1. Fetch the task template
  const { data: task, error: taskErr } = await supabase
    .from("task_template")
    .select("*")
    .eq("task_template_id", taskTemplateId)
    .single()

  if (taskErr || !task) {
    return { data: null, error: { message: taskErr?.message ?? "Task not found" } }
  }

  // 2. Find the item's first manual (for manual_id FK)
  const { data: manuals, error: manualErr } = await supabase
    .from("manual_document")
    .select("manual_id")
    .eq("item_unit_id", itemUnitId)
    .is("deleted_at", null)
    .limit(1)

  if (manualErr) return { data: null, error: { message: manualErr.message } }
  if (!manuals || manuals.length === 0) {
    return { data: null, error: { message: "Item has no manual — cannot reclassify" } }
  }

  const manualId = (manuals[0] as { manual_id: string }).manual_id
  const content = (task as Record<string, unknown>).instructions_override as string | null
    ?? (task as Record<string, unknown>).description as string | null
    ?? ""

  // 3. Create the knowledge chunk
  const { data: chunk, error: chunkErr } = await supabase
    .from("knowledge_chunk")
    .insert({
      manual_id: manualId,
      chunk_type: targetType as ChunkType,
      title: (task as Record<string, unknown>).title as string,
      content,
      tags: [],
      metadata: {},
    })
    .select()
    .single()

  if (chunkErr) return { data: null, error: { message: chunkErr.message } }

  // 4. Archive the task template (deactivate + soft-delete instances)
  const now = new Date().toISOString()
  await supabase
    .from("task_instance")
    .update({ deleted_at: now, updated_at: now })
    .eq("home_id", homeId)
    .eq("task_template_id", taskTemplateId)
    .in("status", ["scheduled", "snoozed"])
    .is("deleted_at", null)

  await supabase
    .from("task_template")
    .update({ is_active: false, updated_at: now })
    .eq("task_template_id", taskTemplateId)

  return { data: chunk as KnowledgeChunk, error: null }
}

/**
 * Logs a user's reclassification during parse review so the parser can learn.
 */
export async function logParseCorrection(
  homeId: string,
  originalType: string,
  correctedType: string,
  itemTitle: string,
  itemContent?: string | null
): Promise<ServiceResult<true>> {
  const { error } = await supabase.from("parse_correction").insert({
    home_id: homeId,
    original_type: originalType,
    corrected_type: correctedType,
    item_title: itemTitle,
    item_content: itemContent ?? null,
  })
  if (error) return { data: null, error: { message: error.message } }
  return { data: true, error: null }
}

/**
 * Fetches parse corrections for a home (used to build few-shot examples for the parser).
 */
export async function getParseCorrections(
  homeId: string,
  limit = 30
): Promise<ServiceResult<Array<{ original_type: string; corrected_type: string; item_title: string; item_content: string | null }>>> {
  const { data, error } = await supabase
    .from("parse_correction")
    .select("original_type, corrected_type, item_title, item_content")
    .eq("home_id", homeId)
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) return { data: null, error: { message: error.message } }
  return { data: data as Array<{ original_type: string; corrected_type: string; item_title: string; item_content: string | null }>, error: null }
}

/**
 * Converts a task_template into a knowledge_chunk during parse review.
 * Unlike reclassifyTaskAsChunk (used from item detail), this operates during
 * the add-item flow where the task may have just been created.
 */
export async function convertTaskToChunk(
  taskTemplateId: string,
  homeId: string,
  targetType: "how_to" | "troubleshooting",
  manualId: string
): Promise<ServiceResult<KnowledgeChunk>> {
  // Fetch the task
  const { data: task, error: taskErr } = await supabase
    .from("task_template")
    .select("*")
    .eq("task_template_id", taskTemplateId)
    .single()

  if (taskErr || !task) {
    return { data: null, error: { message: taskErr?.message ?? "Task not found" } }
  }

  const content = (task as Record<string, unknown>).instructions_override as string | null
    ?? (task as Record<string, unknown>).description as string | null
    ?? ""

  // Create the knowledge chunk
  const { data: chunk, error: chunkErr } = await supabase
    .from("knowledge_chunk")
    .insert({
      manual_id: manualId,
      chunk_type: targetType as ChunkType,
      title: (task as Record<string, unknown>).title as string,
      content,
      tags: [],
      metadata: {},
    })
    .select()
    .single()

  if (chunkErr) return { data: null, error: { message: chunkErr.message } }

  // Archive the task template
  const now = new Date().toISOString()
  await supabase
    .from("task_instance")
    .update({ deleted_at: now, updated_at: now })
    .eq("home_id", homeId)
    .eq("task_template_id", taskTemplateId)
    .in("status", ["scheduled", "snoozed"])
    .is("deleted_at", null)

  await supabase
    .from("task_template")
    .update({ is_active: false, updated_at: now })
    .eq("task_template_id", taskTemplateId)

  return { data: chunk as KnowledgeChunk, error: null }
}

/**
 * Converts a knowledge_chunk into a task_template during parse review.
 */
export async function convertChunkToTask(
  chunkId: string,
  homeId: string,
  itemUnitId: string,
  targetCareType: "maintenance" | "cleaning"
): Promise<ServiceResult<{ task_template_id: string; title: string }>> {
  // Fetch the chunk
  const { data: chunk, error: chunkErr } = await supabase
    .from("knowledge_chunk")
    .select("*")
    .eq("chunk_id", chunkId)
    .single()

  if (chunkErr || !chunk) {
    return { data: null, error: { message: chunkErr?.message ?? "Chunk not found" } }
  }

  const c = chunk as KnowledgeChunk

  // Create task template
  const { data: task, error: taskErr } = await supabase
    .from("task_template")
    .insert({
      home_id: homeId,
      scope_type: "item_unit" as const,
      item_unit_id: itemUnitId,
      source: "manual" as const,
      supplies_mode: "none" as const,
      is_user_editable: true,
      is_active: true,
      title: c.title ?? "Untitled task",
      description: c.content?.slice(0, 1000) ?? null,
      care_type: targetCareType,
      priority_tier: "recommended" as const,
      risk_level: "comfort" as const,
      instructions_override: c.content?.slice(0, 2000) ?? null,
    })
    .select("task_template_id, title")
    .single()

  if (taskErr || !task) {
    return { data: null, error: { message: taskErr?.message ?? "Task creation failed" } }
  }

  // Create a default schedule rule
  await supabase.from("schedule_rule").insert({
    task_template_id: (task as { task_template_id: string }).task_template_id,
    schedule_type: "as_needed",
    window_days_before: 7,
    window_days_after: 14,
  })

  // Archive the chunk
  await supabase
    .from("knowledge_chunk")
    .update({ deleted_at: new Date().toISOString() })
    .eq("chunk_id", chunkId)

  return { data: task as { task_template_id: string; title: string }, error: null }
}

/**
 * Soft-deletes a knowledge_chunk by setting deleted_at.
 */
export async function archiveChunk(chunkId: string): Promise<ServiceResult<true>> {
  const { error } = await supabase
    .from("knowledge_chunk")
    .update({ deleted_at: new Date().toISOString() })
    .eq("chunk_id", chunkId)
  if (error) return { data: null, error: { message: error.message } }
  return { data: true, error: null }
}

/**
 * Merges `diagram_image_urls` into knowledge_chunk.metadata while preserving other keys.
 */
export async function updateChunkDiagramUrls(
  chunkId: string,
  imageUrls: DiagramImageUrl[]
): Promise<ServiceResult<void>> {
  const { data: row, error: fetchErr } = await supabase
    .from("knowledge_chunk")
    .select("metadata")
    .eq("chunk_id", chunkId)
    .is("deleted_at", null)
    .single()

  if (fetchErr) return { data: null, error: { message: fetchErr.message } }

  const existingMeta =
    row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {}

  const nextMeta = {
    ...existingMeta,
    diagram_image_urls: imageUrls,
  }

  const { error: updateErr } = await supabase
    .from("knowledge_chunk")
    .update({ metadata: nextMeta })
    .eq("chunk_id", chunkId)
    .is("deleted_at", null)

  if (updateErr) return { data: null, error: { message: updateErr.message } }
  return { data: undefined, error: null }
}

/**
 * Updates a knowledge chunk's source_pages array.
 */
export async function updateChunkSourcePages(
  chunkId: string,
  sourcePages: number[]
): Promise<ServiceResult<true>> {
  const { error } = await supabase
    .from("knowledge_chunk")
    .update({ source_pages: sourcePages })
    .eq("chunk_id", chunkId)
    .is("deleted_at", null)
  if (error) return { data: null, error: { message: error.message } }
  return { data: true, error: null }
}
