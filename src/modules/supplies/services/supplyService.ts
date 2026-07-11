import { supabase } from "@/integrations/shim/client"
import type {
  SupplyItem,
  SupplyOption,
  SupplyCategory,
  SupplyOptionType,
} from "@/integrations/types"

export type ServiceResult<T> =
  | { data: T; error: null }
  | { data: null; error: { message: string } }

export type CreateSupplyItemInput = {
  name: string
  category: SupplyCategory
  oem_part_number?: string | null
  brand?: string | null
  model?: string | null
  spec?: string | null
}

export type CreateSupplyOptionInput = {
  supply_item_id: string
  option_type: SupplyOptionType
  seller?: string | null
  url?: string | null
  is_preferred?: boolean
  notes?: string | null
}

/**
 * Creates a supply_item.
 */
export async function createSupplyItem(
  input: CreateSupplyItemInput
): Promise<ServiceResult<SupplyItem>> {
  const { error, data } = await supabase
    .from("supply_item")
    .insert(input)
    .select()
    .single()

  if (error) return { data: null, error: { message: error.message } }
  return { data: data as SupplyItem, error: null }
}

/**
 * Fetches supply_items.
 */
export async function getSupplyItems(): Promise<ServiceResult<SupplyItem[]>> {
  const { error, data } = await supabase
    .from("supply_item")
    .select("*")
    .is("deleted_at", null)
    .order("name")

  if (error) return { data: null, error: { message: error.message } }
  return { data: (data ?? []) as SupplyItem[], error: null }
}

/**
 * Fetches supply_options for a supply_item.
 */
export async function getSupplyOptions(
  supplyItemId: string
): Promise<ServiceResult<SupplyOption[]>> {
  const { error, data } = await supabase
    .from("supply_option")
    .select("*")
    .eq("supply_item_id", supplyItemId)
    .is("deleted_at", null)
    .order("is_preferred", { ascending: false })
    .order("created_at", { ascending: false })

  if (error) return { data: null, error: { message: error.message } }
  return { data: (data ?? []) as SupplyOption[], error: null }
}

/**
 * Creates a supply_option.
 */
export async function createSupplyOption(
  input: CreateSupplyOptionInput
): Promise<ServiceResult<SupplyOption>> {
  const { error, data } = await supabase
    .from("supply_option")
    .insert({
      ...input,
      is_preferred: input.is_preferred ?? false,
    })
    .select()
    .single()

  if (error) return { data: null, error: { message: error.message } }
  return { data: data as SupplyOption, error: null }
}
