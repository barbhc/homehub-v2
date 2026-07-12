import { supabase } from "@/integrations/shim/client"
import {
  collection,
  deleteDoc,
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
import type {
  KnowledgeChunk,
  ChunkType,
  DiagramImageUrl,
  ChatFaq,
  ChatFaqInsert,
} from "@/integrations/types"

// ── Firestore chatFaqs doc (camelCase) → curated ChatFaq (snake_case) ──────────
function faqIso(v: unknown): string {
  if (v instanceof Timestamp) return v.toDate().toISOString()
  return typeof v === "string" ? v : ""
}
function toFaq(homeId: string, id: string, d: DocumentData): ChatFaq {
  return {
    faq_id: id,
    home_id: homeId,
    item_unit_id: d.itemUnitId ?? null,
    question: d.question ?? "",
    answer: d.answer ?? "",
    created_at: faqIso(d.createdAt),
  }
}

// ── Firestore chunk doc (camelCase) → curated KnowledgeChunk (snake_case) ──────
function toChunk(id: string, d: DocumentData): KnowledgeChunk {
  return {
    chunk_id: id,
    manual_id: d.manualId ?? "",
    chunk_type: (d.chunkType ?? "reference") as ChunkType,
    content_level: d.contentLevel ?? null,
    title: d.title ?? null,
    content: d.content ?? "",
    tags: d.tags ?? [],
    scenarios: d.scenarios ?? null,
    source_pages: d.sourcePages ?? null,
    metadata: d.metadata ?? {},
    section_category: d.sectionCategory ?? null,
    applies_to: Array.isArray(d.appliesTo) ? d.appliesTo : [],
    external_key: d.externalKey ?? null,
    embedding_ref: d.embeddingRef ?? null,
    created_at: faqIso(d.createdAt),
    updated_at: faqIso(d.updatedAt),
    deleted_at: d.deletedAt == null ? null : faqIso(d.deletedAt),
  }
}

function sortChunks(list: KnowledgeChunk[]): KnowledgeChunk[] {
  return [...list].sort(
    (a, b) => (a.chunk_type ?? "").localeCompare(b.chunk_type ?? "") || (b.created_at ?? "").localeCompare(a.created_at ?? "")
  )
}

export type ServiceResult<T> =
  | { data: T; error: null }
  | { data: null; error: { message: string } }

/**
 * Fetches knowledge_chunks for a manual. Used for RAG and display.
 */
export async function getChunksByManual(
  homeId: string,
  manualId: string,
  chunkTypeFilter?: ChunkType[]
): Promise<ServiceResult<KnowledgeChunk[]>> {
  try {
    const snap = await getDocs(collection(db, `homes/${homeId}/manuals/${manualId}/chunks`))
    let list = snap.docs.filter((d) => d.data().deletedAt == null).map((d) => toChunk(d.id, d.data()))
    if (chunkTypeFilter && chunkTypeFilter.length > 0) {
      list = list.filter((c) => chunkTypeFilter.includes(c.chunk_type))
    }
    return { data: sortChunks(list), error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to load chunks" } }
  }
}

/**
 * Fetches knowledge_chunks for an item_unit (via manual_document). Groups by chunk_type.
 */
export async function getChunksByItem(
  homeId: string,
  itemUnitId: string,
  chunkTypeFilter?: ChunkType[]
): Promise<ServiceResult<KnowledgeChunk[]>> {
  try {
    // Manuals for this item → their chunks.
    const manualSnap = await getDocs(
      query(collection(db, `homes/${homeId}/manuals`), where("itemUnitId", "==", itemUnitId))
    )
    const manualIds = manualSnap.docs.filter((m) => m.data().deletedAt == null).map((m) => m.id)
    if (manualIds.length === 0) return { data: [], error: null }
    const perManual = await Promise.all(
      manualIds.map((mid) => getDocs(collection(db, `homes/${homeId}/manuals/${mid}/chunks`)))
    )
    let list: KnowledgeChunk[] = []
    perManual.forEach((snap) => snap.docs.forEach((d) => { if (d.data().deletedAt == null) list.push(toChunk(d.id, d.data())) }))
    if (chunkTypeFilter && chunkTypeFilter.length > 0) {
      list = list.filter((c) => chunkTypeFilter.includes(c.chunk_type))
    }
    return { data: sortChunks(list), error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to load chunks" } }
  }
}

/**
 * Search knowledge_chunks by text (simple ilike for v1).
 * For full RAG, use embedding_ref + vector search when embeddings are available.
 */
export async function searchChunks(
  homeId: string,
  itemUnitId: string,
  queryText: string,
  preferTypes?: ChunkType[]
): Promise<ServiceResult<KnowledgeChunk[]>> {
  try {
    const res = await getChunksByItem(homeId, itemUnitId, preferTypes)
    if (res.error) return res
    const needle = queryText.toLowerCase()
    // Client-side substring match (v1 used ilike; full RAG is a later pass).
    const list = (res.data ?? []).filter((c) => (c.content ?? "").toLowerCase().includes(needle))
    return { data: list, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to search chunks" } }
  }
}

// --- Chat FAQ (saved Q&A) ---

/** Sorts FAQs newest-first (client-side — avoids a composite index on the
 *  item-scoped query, which pairs an equality filter with the order). */
function sortFaqs(list: ChatFaq[]): ChatFaq[] {
  return [...list].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
}

export async function saveFaq(input: ChatFaqInsert): Promise<ServiceResult<ChatFaq>> {
  try {
    const ref = doc(collection(db, `homes/${input.home_id}/chatFaqs`))
    await writeBatch(db)
      .set(ref, {
        itemUnitId: input.item_unit_id ?? null,
        question: input.question,
        answer: input.answer,
        createdAt: serverTimestamp(),
      })
      .commit()
    const snap = await getDoc(ref)
    return { data: toFaq(input.home_id, ref.id, snap.data() ?? {}), error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to save Q&A" } }
  }
}

export async function getFaqsByHome(homeId: string): Promise<ServiceResult<ChatFaq[]>> {
  try {
    const snap = await getDocs(collection(db, `homes/${homeId}/chatFaqs`))
    return { data: sortFaqs(snap.docs.map((d) => toFaq(homeId, d.id, d.data()))), error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to load Q&A" } }
  }
}

export async function getFaqsByItem(homeId: string, itemUnitId: string): Promise<ServiceResult<ChatFaq[]>> {
  try {
    const snap = await getDocs(
      query(collection(db, `homes/${homeId}/chatFaqs`), where("itemUnitId", "==", itemUnitId))
    )
    return { data: sortFaqs(snap.docs.map((d) => toFaq(homeId, d.id, d.data()))), error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to load Q&A" } }
  }
}

export async function deleteFaq(homeId: string, faqId: string): Promise<ServiceResult<true>> {
  try {
    await deleteDoc(doc(db, `homes/${homeId}/chatFaqs/${faqId}`))
    return { data: true, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to delete Q&A" } }
  }
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
  try {
    const [itemSnap, manualSnap, roomSnap] = await Promise.all([
      getDocs(collection(db, `homes/${homeId}/items`)),
      getDocs(collection(db, `homes/${homeId}/manuals`)),
      getDocs(collection(db, `homes/${homeId}/rooms`)),
    ])

    const itemNames = new Map<string, string>()
    const itemCategories = new Map<string, string | null>()
    const roomIdByItem = new Map<string, string | null>()
    itemSnap.docs
      .filter((d) => d.data().deletedAt == null)
      .forEach((d) => {
        const x = d.data()
        itemNames.set(d.id, x.displayName ?? "Unknown")
        itemCategories.set(d.id, x.category ?? null)
        roomIdByItem.set(d.id, x.roomId ?? null)
      })
    const roomNamesById = new Map<string, string>()
    roomSnap.docs.forEach((d) => roomNamesById.set(d.id, d.data().name ?? ""))

    const liveManuals = manualSnap.docs.filter((m) => m.data().deletedAt == null)
    const itemByManual = new Map<string, string>()
    liveManuals.forEach((m) => itemByManual.set(m.id, m.data().itemUnitId ?? ""))
    if (liveManuals.length === 0) return { data: [], error: null }

    const perManual = await Promise.all(
      liveManuals.map((m) =>
        getDocs(collection(db, `homes/${homeId}/manuals/${m.id}/chunks`)).then((snap) => ({ manualId: m.id, snap }))
      )
    )

    const withItemMeta: ChunkWithItemMeta[] = []
    for (const { manualId, snap } of perManual) {
      const iuId = itemByManual.get(manualId) ?? ""
      const roomId = iuId ? roomIdByItem.get(iuId) ?? null : null
      const room_name = iuId && roomId ? roomNamesById.get(roomId) ?? null : null
      const item_name = iuId ? itemNames.get(iuId) ?? "Unknown" : "Unknown"
      const item_category = iuId ? itemCategories.get(iuId) ?? null : null
      for (const d of snap.docs) {
        if (d.data().deletedAt != null) continue
        const c = toChunk(d.id, d.data())
        if (!types.includes(c.chunk_type)) continue
        withItemMeta.push({ ...c, item_name, item_unit_id: iuId, item_category, room_name })
      }
    }
    return { data: sortChunks(withItemMeta) as ChunkWithItemMeta[], error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to load knowledge" } }
  }
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
