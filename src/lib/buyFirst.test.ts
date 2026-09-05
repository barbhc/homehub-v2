import { describe, it, expect } from "vitest"
import { buyFirstRows } from "./buyFirst"
import type { WeekReminder } from "@/modules/care/services/weekReminders"
import type { ShoppingListItem, TemplateSupply } from "@/integrations/types"

const supply = (over: Partial<TemplateSupply> = {}): TemplateSupply => ({
  name: "Furnace filter", category: "filter", part_number: "FPR10", url: "https://filterbuy.com/x", size: "16x25x1", buy_ahead: true, ...over,
})
const reminder = (over: Partial<WeekReminder> = {}): WeekReminder =>
  ({ taskInstanceId: "i1", taskTemplateId: "t1", title: "Replace the furnace filter", itemName: "Furnace", dueDate: "2026-09-12", duePhrase: "Sat", supplies: [supply()], ...over }) as WeekReminder
const shop = (over: Partial<ShoppingListItem> = {}): ShoppingListItem =>
  ({ id: "s1", home_id: "h", supply_item_id: "t1", name: "Furnace filter", quantity: null, status: "have", source_task_instance_id: "i1", created_at: "", updated_at: "", deleted_at: null, ...over }) as ShoppingListItem

describe("buyFirstRows", () => {
  it("lists buy-ahead supplies of the week's reminders, soonest first", () => {
    const rows = buyFirstRows(
      [reminder({ taskInstanceId: "later", dueDate: "2026-09-20" }), reminder({ taskInstanceId: "soon", dueDate: "2026-09-10" })],
      []
    )
    expect(rows.map((r) => r.taskInstanceId)).toEqual(["soon", "later"])
    expect(rows[0].supply.url).toContain("filterbuy")
  })

  it("ignores supplies without buy_ahead", () => {
    expect(buyFirstRows([reminder({ supplies: [supply({ buy_ahead: false })] })], [])).toEqual([])
  })

  it("'I have one' for THIS instance hides the row; a different instance does not", () => {
    expect(buyFirstRows([reminder()], [shop({ status: "have" })])).toEqual([])
    expect(buyFirstRows([reminder()], [shop({ status: "bought" })])).toEqual([])
    // next cycle = new instance id → the skip expires by itself
    expect(buyFirstRows([reminder({ taskInstanceId: "i2" })], [shop({ source_task_instance_id: "i1" })])).toHaveLength(1)
  })

  it("a deleted or still-needed shopping row covers nothing", () => {
    expect(buyFirstRows([reminder()], [shop({ deleted_at: "2026-09-01" })])).toHaveLength(1)
    expect(buyFirstRows([reminder()], [shop({ status: "needed" })])).toHaveLength(1)
  })

  it("matches by supply name case-insensitively", () => {
    expect(buyFirstRows([reminder()], [shop({ name: "  furnace FILTER " })])).toEqual([])
  })
})
