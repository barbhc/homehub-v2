import { supabase } from "@/integrations/shim/client"
import type { ManualDocument } from "@/integrations/types"

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

/**
 * Creates a manual_document for an item.
 */
export async function createManualDocument(
  input: CreateManualDocumentInput
): Promise<ServiceResult<ManualDocument>> {
  const { error, data } = await supabase
    .from("manual_document")
    .insert(input)
    .select()
    .single()

  if (error) return { data: null, error: { message: error.message } }
  return { data: data as ManualDocument, error: null }
}

/**
 * Soft-deletes a manual_document by setting deleted_at.
 */
export async function deleteManualDocument(
  manualId: string
): Promise<ServiceResult<true>> {
  const { error } = await supabase
    .from("manual_document")
    .update({ deleted_at: new Date().toISOString() })
    .eq("manual_id", manualId)

  if (error) return { data: null, error: { message: error.message } }
  return { data: true, error: null }
}

/**
 * Triggers light ingestion of a reference document for RAG search.
 * Calls the ingest-reference edge function which extracts text sections
 * and stores them as knowledge_chunk rows with chunk_type='reference'.
 */
export async function ingestReference(
  manualId: string
): Promise<ServiceResult<{ sections_count: number }>> {
  const { data, error } = await supabase.functions.invoke("ingest-reference", {
    body: { manual_id: manualId },
  })
  if (error) return { data: null, error: { message: error.message } }
  if (!data?.ok) return { data: null, error: { message: data?.error ?? "Ingestion failed" } }
  return { data: { sections_count: data.sections_count ?? 0 }, error: null }
}

/**
 * Fetches all manual_documents for a home (across all items).
 */
export async function getManualsByHome(
  homeId: string
): Promise<ServiceResult<(ManualDocument & { display_name: string })[]>> {
  const { error, data } = await supabase
    .from("manual_document")
    .select("*, item_unit!inner(display_name, home_id)")
    .eq("item_unit.home_id", homeId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  if (error) return { data: null, error: { message: error.message } }
  const rows = (data ?? []).map((row: Record<string, unknown>) => {
    const item = row.item_unit as { display_name: string } | null
    return { ...row, display_name: item?.display_name ?? "Unknown" } as ManualDocument & { display_name: string }
  })
  return { data: rows, error: null }
}

/**
 * Updates the user-visible label on a manual_document.
 * Pass null to clear the label.
 */
export async function updateManualLabel(
  manualId: string,
  label: string | null
): Promise<ServiceResult<ManualDocument>> {
  const { data, error } = await supabase
    .from("manual_document")
    .update({ label, updated_at: new Date().toISOString() })
    .eq("manual_id", manualId)
    .select()
    .single()

  if (error) return { data: null, error: { message: error.message } }
  return { data: data as ManualDocument, error: null }
}

/**
 * Fetches manual_documents for an item_unit.
 */
export async function getManualsByItem(
  itemUnitId: string
): Promise<ServiceResult<ManualDocument[]>> {
  const { error, data } = await supabase
    .from("manual_document")
    .select("*")
    .eq("item_unit_id", itemUnitId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  if (error) return { data: null, error: { message: error.message } }
  return { data: (data ?? []) as ManualDocument[], error: null }
}
