import { supabase } from "@/integrations/shim/client"

export type ManualSourceType = "url" | "upload"

export type CreateManualSourceInput = {
  item_id: string
  property_id: string
  source_type: ManualSourceType
  url?: string | null
  storage_path?: string | null
  title?: string | null
  domain?: string | null
  file_type?: string | null
  confidence?: number | null
}

export type ManualSourceResult =
  | { data: { id: string }; error: null }
  | { data: null; error: { message: string } }

export type ManualSource = {
  id: string
  item_id: string
  property_id: string
  source_type: ManualSourceType
  url: string | null
  storage_path: string | null
  title: string | null
  domain: string | null
  file_type: string | null
  confidence: number | null
  created_at: string
}

/**
 * Create or upsert manual source for an item (one per item).
 */
export async function upsertManualSource(
  input: CreateManualSourceInput
): Promise<ManualSourceResult> {
  const { error, data } = await supabase
    .from("manual_sources")
    .upsert(
      {
        item_id: input.item_id,
        property_id: input.property_id,
        source_type: input.source_type,
        url: input.url ?? null,
        storage_path: input.storage_path ?? null,
        title: input.title ?? null,
        domain: input.domain ?? null,
        file_type: input.file_type ?? null,
        confidence: input.confidence ?? null,
      },
      { onConflict: "item_id" }
    )
    .select("id")
    .single()

  if (error) return { data: null, error: { message: error.message } }
  return { data: { id: data.id } as { id: string }, error: null }
}

/**
 * Get manual source for an item if it exists.
 */
export async function getManualSource(
  propertyId: string,
  itemId: string
): Promise<ManualSource | null> {
  const { data, error } = await supabase
    .from("manual_sources")
    .select("*")
    .eq("property_id", propertyId)
    .eq("item_id", itemId)
    .maybeSingle()

  if (error || !data) return null
  return data as ManualSource
}
