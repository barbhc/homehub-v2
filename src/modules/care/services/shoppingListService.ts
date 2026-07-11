import { supabase } from "@/integrations/shim/client"
import type { ShoppingListItem, ShoppingStatus } from "@/integrations/types"
import type { ServiceResult } from "./taskService"

/**
 * Shopping list (Phase 6). Powers the Task-detail "Add to list" action and the
 * standalone shopping surface. Home-scoped (RLS via home_members); rows are
 * soft-deleted. The pure `toggleShoppingStatus` lives in ./shoppingStatus.
 */

export { toggleShoppingStatus } from "./shoppingStatus"

export type AddShoppingItemInput = {
  name: string
  quantity?: string | null
  supplyItemId?: string | null
  sourceTaskInstanceId?: string | null
}

/** Adds an item to the home's shopping list (defaults to status 'needed'). */
export async function addShoppingItem(
  homeId: string,
  input: AddShoppingItemInput
): Promise<ServiceResult<ShoppingListItem>> {
  const { data, error } = await supabase
    .from("shopping_list_item")
    .insert({
      home_id: homeId,
      name: input.name.trim(),
      quantity: input.quantity ?? null,
      supply_item_id: input.supplyItemId ?? null,
      source_task_instance_id: input.sourceTaskInstanceId ?? null,
      status: "needed",
      deleted_at: null,
    })
    .select()
    .single()

  if (error) return { data: null, error: { message: error.message } }
  return { data: data as ShoppingListItem, error: null }
}

/** Lists the home's shopping items, newest first. Excludes bought by default. */
export async function listShoppingItems(
  homeId: string,
  opts?: { includeBought?: boolean }
): Promise<ServiceResult<ShoppingListItem[]>> {
  let query = supabase
    .from("shopping_list_item")
    .select("*")
    .eq("home_id", homeId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  if (!opts?.includeBought) query = query.neq("status", "bought")

  const { data, error } = await query
  if (error) return { data: null, error: { message: error.message } }
  return { data: (data ?? []) as ShoppingListItem[], error: null }
}

/** Sets an item's status (needed / have / bought). */
export async function setShoppingItemStatus(
  homeId: string,
  id: string,
  status: ShoppingStatus
): Promise<ServiceResult<ShoppingListItem>> {
  const { data, error } = await supabase
    .from("shopping_list_item")
    .update({ status })
    .eq("home_id", homeId)
    .eq("id", id)
    .is("deleted_at", null)
    .select()
    .single()

  if (error) return { data: null, error: { message: error.message } }
  return { data: data as ShoppingListItem, error: null }
}

/** Soft-removes an item from the list. */
export async function removeShoppingItem(homeId: string, id: string): Promise<ServiceResult<true>> {
  const { error } = await supabase
    .from("shopping_list_item")
    .update({ deleted_at: new Date().toISOString() })
    .eq("home_id", homeId)
    .eq("id", id)
    .is("deleted_at", null)

  if (error) return { data: null, error: { message: error.message } }
  return { data: true, error: null }
}
