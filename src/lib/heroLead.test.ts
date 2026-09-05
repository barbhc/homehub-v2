import { describe, it, expect } from "vitest"
import { urgentTasks, heroLeadId } from "./homeHero"

/**
 * The hero names ONE task. "This week at home" must exclude exactly that one
 * — not the whole urgent feed — or a reminder can end up visible nowhere on
 * Home (the smoke-detector case the journey gallery showed).
 */
describe("urgentTasks / heroLeadId", () => {
  const t = (id: string, over: Partial<{ isOverdue: boolean; daysUntilDue: number | null; daysOverdue: number | null }> = {}) =>
    ({ id, isOverdue: false, daysUntilDue: 5, daysOverdue: null, ...over })

  it("keeps overdue and due-today, drops the planning horizon", () => {
    const out = urgentTasks([t("later"), t("today", { daysUntilDue: 0 }), t("late", { isOverdue: true, daysOverdue: 3 })])
    expect(out.map((x) => x.id)).toEqual(["late", "today"])
  })

  it("the lead is the most overdue; nothing urgent → null", () => {
    expect(heroLeadId([t("a", { isOverdue: true, daysOverdue: 1 }), t("b", { isOverdue: true, daysOverdue: 9 })])).toBe("b")
    expect(heroLeadId([t("quiet")])).toBeNull()
  })
})
