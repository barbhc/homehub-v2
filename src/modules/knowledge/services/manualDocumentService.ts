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
import { db, callable } from "@/integrations/firebase"
import type { ManualDocument, ManualSourceType, ManualRole } from "@/integrations/types"

export type ServiceResult<T> =
  | { data: T; error: null }
  | { data: null; error: { message: string } }

export type CreateManualDocumentInput = {
  item_unit_id: string
  title: string
  source_type: "upload" | "url" | "email"
  source_ref: string
  role?: "primary" | "reference"
  label?: string | null
  version?: string | null
  language?: string | null
}

// ── Firestore manual doc (camelCase) → curated ManualDocument (snake_case) ──────
function manIso(v: unknown): string | null {
  if (v instanceof Timestamp) return v.toDate().toISOString()
  return typeof v === "string" ? v : null
}
function toManual(id: string, d: DocumentData): ManualDocument {
  return {
    manual_id: id,
    item_unit_id: d.itemUnitId ?? "",
    title: d.title ?? "",
    label: d.label ?? null,
    source_type: (d.sourceType ?? "upload") as ManualSourceType,
    source_ref: d.sourceRef ?? "",
    role: (d.role ?? "primary") as ManualRole,
    version: d.version ?? null,
    language: d.language ?? null,
    parsed_at: manIso(d.parsedAt),
    parse_draft: d.draft ?? null,
    created_at: manIso(d.createdAt) ?? "",
    updated_at: manIso(d.updatedAt) ?? "",
    deleted_at: manIso(d.deletedAt),
  }
}

const ingestReferenceCallable = callable<{ homeId: string; manualId: string }, { ok: boolean; sections_count?: number; error?: string }>(
  "ingestReference"
)

/**
 * Creates a manual_document for an item under homes/{homeId}/manuals.
 */
export async function createManualDocument(
  homeId: string,
  input: CreateManualDocumentInput
): Promise<ServiceResult<ManualDocument>> {
  try {
    const ref = doc(collection(db, `homes/${homeId}/manuals`))
    const now = serverTimestamp()
    await writeBatch(db)
      .set(ref, {
        itemUnitId: input.item_unit_id,
        title: input.title,
        label: input.label ?? null,
        sourceType: input.source_type,
        sourceRef: input.source_ref,
        role: input.role ?? "primary",
        version: input.version ?? null,
        language: input.language ?? null,
        parsedAt: null,
        parse: null,
        draft: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .commit()
    const snap = await getDoc(ref)
    return { data: toManual(ref.id, snap.data() ?? {}), error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to create manual" } }
  }
}

/**
 * Soft-deletes a manual_document by setting deletedAt.
 */
export async function deleteManualDocument(homeId: string, manualId: string): Promise<ServiceResult<true>> {
  try {
    await writeBatch(db)
      .set(doc(db, `homes/${homeId}/manuals/${manualId}`), { deletedAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true })
      .commit()
    return { data: true, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to delete manual" } }
  }
}

/**
 * Triggers light ingestion of a reference document for RAG search (Cloud
 * Function; extracts text sections into knowledge chunks). Phase 4 callable.
 */
export async function ingestReference(homeId: string, manualId: string): Promise<ServiceResult<{ sections_count: number }>> {
  try {
    const res = await ingestReferenceCallable({ homeId, manualId })
    if (!res.ok) return { data: null, error: { message: res.error ?? "Ingestion failed" } }
    return { data: { sections_count: res.sections_count ?? 0 }, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Ingestion failed" } }
  }
}

/**
 * Fetches all manual_documents for a home (across all items), with the owning
 * item's display name for the label.
 */
export async function getManualsByHome(
  homeId: string
): Promise<ServiceResult<(ManualDocument & { display_name: string })[]>> {
  try {
    const [manualSnap, itemSnap] = await Promise.all([
      getDocs(collection(db, `homes/${homeId}/manuals`)),
      getDocs(collection(db, `homes/${homeId}/items`)),
    ])
    const nameById = new Map<string, string>()
    itemSnap.docs.forEach((d) => nameById.set(d.id, d.data().displayName ?? "Unknown"))
    const rows = manualSnap.docs
      .filter((d) => d.data().deletedAt == null)
      .map((d) => ({ ...toManual(d.id, d.data()), display_name: nameById.get(d.data().itemUnitId) ?? "Unknown" }))
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    return { data: rows, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to load manuals" } }
  }
}

/**
 * Updates the user-visible label on a manual_document. Pass null to clear it.
 */
export async function updateManualLabel(
  homeId: string,
  manualId: string,
  label: string | null
): Promise<ServiceResult<ManualDocument>> {
  try {
    const ref = doc(db, `homes/${homeId}/manuals/${manualId}`)
    await writeBatch(db).set(ref, { label, updatedAt: serverTimestamp() }, { merge: true }).commit()
    const snap = await getDoc(ref)
    return { data: toManual(ref.id, snap.data() ?? {}), error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to update label" } }
  }
}

/**
 * Fetches manual_documents for an item_unit.
 */
export async function getManualsByItem(homeId: string, itemUnitId: string): Promise<ServiceResult<ManualDocument[]>> {
  try {
    const snap = await getDocs(query(collection(db, `homes/${homeId}/manuals`), where("itemUnitId", "==", itemUnitId)))
    const rows = snap.docs
      .filter((d) => d.data().deletedAt == null)
      .map((d) => toManual(d.id, d.data()))
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    return { data: rows, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to load manuals" } }
  }
}
