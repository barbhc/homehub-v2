import type { WeekReminder } from "@/modules/care/services/weekReminders"
import type { ShoppingListItem, TemplateSupply } from "@/integrations/types"

/**
 * "Buy first" — the parts to have in hand before the week's reminders land.
 *
 * Pure. A row is a (reminder, supply) pair where the supply is flagged
 * buy_ahead, MINUS anything the shopping list already says is covered for
 * THIS instance: a `have` row (the owner tapped "I have one" — the skip-a-cycle
 * marker, keyed to the instance so it expires by itself when the next cycle
 * mints a new id) or a `bought` row. No inventory counting anywhere; the
 * signal is the instance key, nothing else.
 */
export type BuyFirstRow = {
  taskInstanceId: string
  taskTemplateId: string
  taskTitle: string
  itemName: string | null
  dueDate: string
  duePhrase: string
  supply: TemplateSupply
  supplyIndex: number
}

export function buyFirstRows(items: WeekReminder[], shopping: ShoppingListItem[]): BuyFirstRow[] {
  const covered = new Set(
    shopping
      .filter((s) => s.deleted_at == null && (s.status === "have" || s.status === "bought") && s.source_task_instance_id)
      .map((s) => `${s.source_task_instance_id}::${s.name.trim().toLowerCase()}`)
  )
  const rows: BuyFirstRow[] = []
  for (const r of items) {
    r.supplies.forEach((supply, supplyIndex) => {
      if (!supply.buy_ahead) return
      if (covered.has(`${r.taskInstanceId}::${supply.name.trim().toLowerCase()}`)) return
      rows.push({
        taskInstanceId: r.taskInstanceId,
        taskTemplateId: r.taskTemplateId,
        taskTitle: r.title,
        itemName: r.itemName,
        dueDate: r.dueDate,
        duePhrase: r.duePhrase,
        supply,
        supplyIndex,
      })
    })
  }
  return rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}
