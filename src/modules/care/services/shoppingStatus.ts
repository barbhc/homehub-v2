import type { ShoppingStatus } from "@/integrations/types"

/**
 * Pure shopping-list status logic (Phase 6), kept Supabase-free so it stays
 * unit-testable (the service that touches the DB re-exports it).
 *
 * Check-off toggle: bought ⇄ needed; "have" (already own) flips to bought.
 */
export function toggleShoppingStatus(status: ShoppingStatus): ShoppingStatus {
  return status === "bought" ? "needed" : "bought"
}
