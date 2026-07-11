import { supabase } from "@/integrations/shim/client"
import type { ItemCategory, ItemUnit, ItemUnitStatus } from "@/integrations/types"

export type ServiceResult<T> =
  | { data: T; error: null }
  | { data: null; error: { message: string } }

export type CreateItemUnitInput = {
  home_id: string
  room_id?: string | null
  display_name: string
  category: string
  item_category?: ItemCategory | null
  sub_type?: string | null
  category_fields?: Record<string, unknown> | null
  brand?: string | null
  model?: string | null
  serial_number?: string | null
  purchase_date?: string | null
  install_date?: string | null
  notes?: string | null
}

export type UpdateItemUnitInput = {
  room_id?: string | null
  display_name?: string
  category?: string
  item_category?: ItemCategory | null
  sub_type?: string | null
  category_fields?: Record<string, unknown> | null
  brand?: string | null
  model?: string | null
  serial_number?: string | null
  purchase_date?: string | null
  install_date?: string | null
  status?: ItemUnitStatus
  notes?: string | null
  photo_storage_ref?: string | null
  store_name?: string | null
  price_paid?: number | null
  receipt_storage_path?: string | null
  tags?: string[]
  /** ISO timestamp set when the user flags "I just installed this" (reveals Setup). */
  setup_revealed_at?: string | null
  /** Variant tags (e.g. gas / electric / steam) for per-variant task filtering. */
  variant_tags?: string[]
  /** ISO timestamp set when the user marks the warranty registered. */
  warranty_registered_at?: string | null
}

/**
 * Creates a new item_unit.
 */
export async function createItemUnit(
  input: CreateItemUnitInput
): Promise<ServiceResult<ItemUnit>> {
  const { error, data } = await supabase
    .from("item_unit")
    .insert({
      home_id: input.home_id,
      room_id: input.room_id ?? null,
      display_name: input.display_name,
      category: input.category,
      item_category: input.item_category ?? null,
      sub_type: input.sub_type ?? null,
      category_fields: input.category_fields ?? {},
      brand: input.brand ?? null,
      model: input.model ?? null,
      serial_number: input.serial_number ?? null,
      purchase_date: input.purchase_date ?? null,
      install_date: input.install_date ?? null,
      notes: input.notes ?? null,
    })
    .select()
    .single()

  if (error) return { data: null, error: { message: error.message } }
  return { data: data as ItemUnit, error: null }
}

/**
 * Updates an item_unit.
 */
export async function updateItemUnit(
  homeId: string,
  itemUnitId: string,
  input: UpdateItemUnitInput
): Promise<ServiceResult<ItemUnit>> {
  const updates: Record<string, unknown> = { ...input, updated_at: new Date().toISOString() }
  const { error, data } = await supabase
    .from("item_unit")
    .update(updates)
    .eq("home_id", homeId)
    .eq("item_unit_id", itemUnitId)
    .is("deleted_at", null)
    .select()
    .single()

  if (error) return { data: null, error: { message: error.message } }
  return { data: data as ItemUnit, error: null }
}

/**
 * Fetches item_units for a home. By default returns only active; pass statusFilter for others.
 */
export async function getItemUnits(
  homeId: string,
  options?: { statusFilter?: ItemUnitStatus[] }
): Promise<ServiceResult<ItemUnit[]>> {
  let query = supabase
    .from("item_unit")
    .select("*")
    .eq("home_id", homeId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  if (options?.statusFilter && options.statusFilter.length > 0) {
    query = query.in("status", options.statusFilter)
  } else {
    query = query.eq("status", "active")
  }

  const { error, data } = await query
  if (error) return { data: null, error: { message: error.message } }
  return { data: (data ?? []) as ItemUnit[], error: null }
}

/**
 * Fetches a single item_unit by id.
 */
export async function getItemUnit(
  homeId: string,
  itemUnitId: string
): Promise<ServiceResult<ItemUnit | null>> {
  const { error, data } = await supabase
    .from("item_unit")
    .select("*")
    .eq("home_id", homeId)
    .eq("item_unit_id", itemUnitId)
    .is("deleted_at", null)
    .single()

  if (error) {
    if (error.code === "PGRST116") return { data: null, error: null }
    return { data: null, error: { message: error.message } }
  }
  return { data: data as ItemUnit, error: null }
}

export type SoftDeleteResult =
  | { success: true }
  | { success: false; error: string }

/**
 * Soft-deletes an item_unit (sets deleted_at).
 */
export async function softDeleteItemUnit(
  homeId: string,
  itemUnitId: string
): Promise<SoftDeleteResult> {
  const { error } = await supabase
    .from("item_unit")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("home_id", homeId)
    .eq("item_unit_id", itemUnitId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}
