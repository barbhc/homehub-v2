import {
  addDoc,
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
import { archiveTaskTemplate, createTaskTemplate } from "@/modules/care/services/taskService"
import type {
  KnowledgeChunk,
  ChunkType,
  DiagramImageUrl,
  ChatFaq,
  ChatFaqInsert,
} from "@/integrations/types"

/** A fresh chunk doc under homes/{homeId}/manuals/{manualId}/chunks. */
function chunkDoc(manualId: string, chunkType: ChunkType, title: string | null, content: string): DocumentData {
  const now = serverTimestamp()
  return {
    manualId,
    chunkType,
    contentLevel: null,
    title: title ?? null,
    content,
    tags: [],
    scenarios: null,
    sourcePages: null,
    appliesTo: [],
    sectionCategory: null,
    externalKey: null,
    embeddingRef: null,
    metadata: {},
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
}

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
  try {
    const taskSnap = await getDoc(doc(db, `homes/${homeId}/taskTemplates/${taskTemplateId}`))
    if (!taskSnap.exists()) return { data: null, error: { message: "Task not found" } }
    const task = taskSnap.data()

    // Find the item's first (live) manual to host the new chunk.
    const manualSnap = await getDocs(query(collection(db, `homes/${homeId}/manuals`), where("itemUnitId", "==", itemUnitId)))
    const manual = manualSnap.docs.find((m) => m.data().deletedAt == null)
    if (!manual) return { data: null, error: { message: "Item has no manual — cannot reclassify" } }

    const content = (task.instructionsOverride as string | null) ?? (task.description as string | null) ?? ""
    const chunkRef = doc(collection(db, `homes/${homeId}/manuals/${manual.id}/chunks`))
    await writeBatch(db).set(chunkRef, chunkDoc(manual.id, targetType, task.title ?? null, content)).commit()
    await archiveTaskTemplate(homeId, taskTemplateId)
    const snap = await getDoc(chunkRef)
    return { data: toChunk(chunkRef.id, snap.data() ?? {}), error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to reclassify" } }
  }
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
  try {
    await addDoc(collection(db, `homes/${homeId}/parseCorrections`), {
      originalType,
      correctedType,
      itemTitle,
      itemContent: itemContent ?? null,
      createdAt: serverTimestamp(),
    })
    return { data: true, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to log correction" } }
  }
}

/**
 * Fetches parse corrections for a home (used to build few-shot examples for the parser).
 */
export async function getParseCorrections(
  homeId: string,
  limit = 30
): Promise<ServiceResult<Array<{ original_type: string; corrected_type: string; item_title: string; item_content: string | null }>>> {
  try {
    const snap = await getDocs(collection(db, `homes/${homeId}/parseCorrections`))
    const rows = snap.docs
      .map((d) => d.data())
      .sort((a, b) => faqIso(b.createdAt).localeCompare(faqIso(a.createdAt)))
      .slice(0, limit)
      .map((x) => ({
        original_type: x.originalType ?? "",
        corrected_type: x.correctedType ?? "",
        item_title: x.itemTitle ?? "",
        item_content: x.itemContent ?? null,
      }))
    return { data: rows, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to load corrections" } }
  }
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
  try {
    const taskSnap = await getDoc(doc(db, `homes/${homeId}/taskTemplates/${taskTemplateId}`))
    if (!taskSnap.exists()) return { data: null, error: { message: "Task not found" } }
    const task = taskSnap.data()
    const content = (task.instructionsOverride as string | null) ?? (task.description as string | null) ?? ""
    const chunkRef = doc(collection(db, `homes/${homeId}/manuals/${manualId}/chunks`))
    await writeBatch(db).set(chunkRef, chunkDoc(manualId, targetType, task.title ?? null, content)).commit()
    await archiveTaskTemplate(homeId, taskTemplateId)
    const snap = await getDoc(chunkRef)
    return { data: toChunk(chunkRef.id, snap.data() ?? {}), error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to convert task" } }
  }
}

/**
 * Converts a knowledge_chunk into a task_template during parse review. The chunk
 * lives under its manual, so the caller passes the owning manualId.
 */
export async function convertChunkToTask(
  homeId: string,
  manualId: string,
  chunkId: string,
  itemUnitId: string,
  targetCareType: "maintenance" | "cleaning"
): Promise<ServiceResult<{ task_template_id: string; title: string }>> {
  try {
    const chunkSnap = await getDoc(doc(db, `homes/${homeId}/manuals/${manualId}/chunks/${chunkId}`))
    if (!chunkSnap.exists()) return { data: null, error: { message: "Chunk not found" } }
    const c = chunkSnap.data()
    const content = (c.content as string | null) ?? ""

    // Reuse the verified template writer (inlines an as_needed schedule).
    const tplRes = await createTaskTemplate({
      home_id: homeId,
      scope_type: "item_unit",
      item_unit_id: itemUnitId,
      title: c.title ?? "Untitled task",
      description: content.slice(0, 1000) || null,
      care_type: targetCareType,
      priority_tier: "recommended",
      risk_level: "comfort",
      instructions_override: content.slice(0, 2000) || null,
      supplies_mode: "none",
      source: "manual",
    })
    if (tplRes.error || !tplRes.data) return { data: null, error: { message: tplRes.error?.message ?? "Task creation failed" } }

    // Archive the chunk.
    await writeBatch(db)
      .set(chunkSnap.ref, { deletedAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true })
      .commit()

    return { data: { task_template_id: tplRes.data.task_template_id, title: tplRes.data.title }, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to convert chunk" } }
  }
}

/**
 * Soft-deletes a knowledge_chunk by setting deleted_at.
 */
export async function archiveChunk(homeId: string, manualId: string, chunkId: string): Promise<ServiceResult<true>> {
  try {
    await writeBatch(db)
      .set(doc(db, `homes/${homeId}/manuals/${manualId}/chunks/${chunkId}`), { deletedAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true })
      .commit()
    return { data: true, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to archive chunk" } }
  }
}

/**
 * Merges `diagram_image_urls` into the chunk's metadata, preserving other keys.
 */
export async function updateChunkDiagramUrls(
  homeId: string,
  manualId: string,
  chunkId: string,
  imageUrls: DiagramImageUrl[]
): Promise<ServiceResult<void>> {
  try {
    const ref = doc(db, `homes/${homeId}/manuals/${manualId}/chunks/${chunkId}`)
    const snap = await getDoc(ref)
    if (!snap.exists() || snap.data().deletedAt != null) return { data: null, error: { message: "Chunk not found" } }
    const meta = snap.data().metadata
    const existingMeta = meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>) : {}
    await writeBatch(db)
      .set(ref, { metadata: { ...existingMeta, diagram_image_urls: imageUrls }, updatedAt: serverTimestamp() }, { merge: true })
      .commit()
    return { data: undefined, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to update diagrams" } }
  }
}

/**
 * Updates a knowledge chunk's sourcePages array.
 */
export async function updateChunkSourcePages(
  homeId: string,
  manualId: string,
  chunkId: string,
  sourcePages: number[]
): Promise<ServiceResult<true>> {
  try {
    await writeBatch(db)
      .set(doc(db, `homes/${homeId}/manuals/${manualId}/chunks/${chunkId}`), { sourcePages, updatedAt: serverTimestamp() }, { merge: true })
      .commit()
    return { data: true, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to update source pages" } }
  }
}
