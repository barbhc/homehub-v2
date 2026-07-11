import { supabase } from "@/integrations/shim/client"
import type { Item, Category, ItemCategory, Location } from "@/integrations/types"

export type CreateItemInput = {
  property_id: string
  name: string
  brand?: string | null
  model?: string | null
  serial_number?: string | null
  location_id?: string | null
  category_id?: string | null
  item_category?: ItemCategory | null
  sub_type?: string | null
  category_fields?: Record<string, unknown> | null
  purchase_date?: string | null
  purchase_price?: number | null
  specs?: Record<string, unknown> | null
}

export type ServiceResult<T> =
  | { data: T; error: null }
  | { data: null; error: { message: string } }

/**
 * Creates a new item. All other fields use schema defaults (status: owned, etc.).
 */
export async function createItem(input: CreateItemInput): Promise<ServiceResult<Item>> {
  const { error, data } = await supabase
    .from("items")
    .insert({
      property_id: input.property_id,
      name: input.name,
      brand: input.brand ?? null,
      model: input.model ?? null,
      serial_number: input.serial_number ?? null,
      location_id: input.location_id ?? null,
      category_id: input.category_id ?? null,
      item_category: input.item_category ?? null,
      sub_type: input.sub_type ?? null,
      category_fields: input.category_fields ?? {},
      purchase_date: input.purchase_date ?? null,
      purchase_price: input.purchase_price ?? null,
      specs: input.specs ?? null,
    })
    .select()
    .single()

  if (error) return { data: null, error: { message: error.message } }
  return { data: data as Item, error: null }
}

export type UpdateItemInput = {
  name?: string
  brand?: string | null
  model?: string | null
  serial_number?: string | null
  location_id?: string | null
  category_id?: string | null
  item_category?: ItemCategory | null
  sub_type?: string | null
  category_fields?: Record<string, unknown> | null
  notes?: string | null
  purchase_date?: string | null
  purchase_price?: number | null
  store_name?: string | null
  warranty_expiration_date?: string | null
  specs?: Record<string, unknown> | null
}

/**
 * Updates an item by id. Only provided fields are updated.
 */
export async function updateItem(
  propertyId: string,
  itemId: string,
  input: UpdateItemInput
): Promise<ServiceResult<Item>> {
  const updates: Record<string, unknown> = {}
  if (input.name !== undefined) updates.name = input.name
  if (input.brand !== undefined) updates.brand = input.brand
  if (input.model !== undefined) updates.model = input.model
  if (input.serial_number !== undefined) updates.serial_number = input.serial_number
  if (input.location_id !== undefined) updates.location_id = input.location_id
  if (input.category_id !== undefined) updates.category_id = input.category_id
  if (input.item_category !== undefined) updates.item_category = input.item_category
  if (input.sub_type !== undefined) updates.sub_type = input.sub_type
  if (input.category_fields !== undefined) updates.category_fields = input.category_fields
  if (input.notes !== undefined) updates.notes = input.notes
  if (input.purchase_date !== undefined) updates.purchase_date = input.purchase_date
  if (input.purchase_price !== undefined) updates.purchase_price = input.purchase_price
  if (input.store_name !== undefined) updates.store_name = input.store_name
  if (input.warranty_expiration_date !== undefined) updates.warranty_expiration_date = input.warranty_expiration_date
  if (input.specs !== undefined) updates.specs = input.specs
  updates.updated_at = new Date().toISOString()

  const { error, data } = await supabase
    .from("items")
    .update(updates)
    .eq("id", itemId)
    .eq("property_id", propertyId)
    .select()
    .single()

  if (error) return { data: null, error: { message: error.message } }
  return { data: data as Item, error: null }
}

/**
 * Fetches items for a property. Only returns status = 'owned' (non-archived).
 */
export async function getItems(propertyId: string): Promise<ServiceResult<Item[]>> {
  const { error, data } = await supabase
    .from("items")
    .select("*")
    .eq("property_id", propertyId)
    .eq("status", "owned")
    .is("archived_at", null)
    .order("created_at", { ascending: false })

  if (error) return { data: null, error: { message: error.message } }
  return { data: (data ?? []) as Item[], error: null }
}

/**
 * Fetches a single item by id. Returns null if not found or not in user's property.
 */
export async function getItem(propertyId: string, itemId: string): Promise<ServiceResult<Item | null>> {
  const { error, data } = await supabase
    .from("items")
    .select("*")
    .eq("property_id", propertyId)
    .eq("id", itemId)
    .single()

  if (error) {
    if (error.code === "PGRST116") return { data: null, error: null } // no rows
    return { data: null, error: { message: error.message } }
  }
  return { data: data as Item, error: null }
}

/**
 * Fetches categories for a property.
 */
export async function getCategories(propertyId: string): Promise<ServiceResult<Category[]>> {
  const { error, data } = await supabase
    .from("categories")
    .select("*")
    .eq("property_id", propertyId)
    .order("name")

  if (error) return { data: null, error: { message: error.message } }
  return { data: (data ?? []) as Category[], error: null }
}

/**
 * Fetches locations for a property.
 */
export async function getLocations(propertyId: string): Promise<ServiceResult<Location[]>> {
  const { error, data } = await supabase
    .from("locations")
    .select("*")
    .eq("property_id", propertyId)
    .order("name")

  if (error) return { data: null, error: { message: error.message } }
  return { data: (data ?? []) as Location[], error: null }
}

export type ArchiveReason = "sold" | "donated" | "disposed"

export type ArchiveResult =
  | { success: true }
  | { success: false; error: string }

/**
 * Archive an item: set status and archived_at.
 * TODO: Add archived_reason, archived_note columns; for now stored in specs.
 */
export async function archiveItem(
  propertyId: string,
  itemId: string,
  reason: ArchiveReason,
  note?: string | null
): Promise<ArchiveResult> {
  const item = await getItem(propertyId, itemId)
  if (item.error || !item.data) return { success: false, error: item.error?.message ?? "Item not found" }

  const specs = (item.data.specs as Record<string, unknown>) ?? {}
  const updatedSpecs = {
    ...specs,
    archivedReason: reason,
    archivedNote: note ?? null,
  }

  const { error } = await supabase
    .from("items")
    .update({
      status: reason,
      archived_at: new Date().toISOString(),
      specs: updatedSpecs,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId)
    .eq("property_id", propertyId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export type DeleteResult =
  | { success: true }
  | { success: false; error: string }

/**
 * Permanently delete an item.
 */
export async function deleteItem(propertyId: string, itemId: string): Promise<DeleteResult> {
  const { error } = await supabase
    .from("items")
    .delete()
    .eq("id", itemId)
    .eq("property_id", propertyId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}
