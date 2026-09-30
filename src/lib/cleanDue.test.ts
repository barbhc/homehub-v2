/**
 * The Deep Clean hub's due label speaks the app's calm vocabulary.
 *
 * Only a passed DEADLINE is "Overdue" (shared/care/dueWindow.ts). The hub
 * called every cleaning task past its date "Overdue" — a monthly wipe-down two
 * days late included — while Home and Tasks said "Good to do now" or "Been a
 * while" for the very same task.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { cleanDueLabel } from "./cleanDue"

const task = (over: Partial<Parameters<typeof cleanDueLabel>[0]>) => ({
  title: "Wipe the fridge gaskets",
  dueDate: "2026-09-30",
  scheduleType: "monthly" as string | null,
  isOverdue: false,
  ...over,
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-09-30T12:00:00Z"))
})
afterEach(() => vi.useRealTimers())

describe("cleanDueLabel — only a passed deadline says Overdue", () => {
  it("a monthly clean a few days past its date is still inside its window — not late", () => {
    const label = cleanDueLabel(task({ dueDate: "2026-09-27", isOverdue: true }))
    expect(label.text).toBe("Good to do now")
    expect(label.overdue).toBe(false)
  })

  it("a monthly clean long past its window has 'Been a while' — clay, not 'Overdue'", () => {
    const label = cleanDueLabel(task({ dueDate: "2026-08-01", isOverdue: true }))
    expect(label).toEqual({ text: "Been a while", overdue: true })
  })

  it("a real deadline that has passed is the one thing that says Overdue", () => {
    const label = cleanDueLabel(task({ title: "Renew the water softener warranty", scheduleType: "as_needed", dueDate: "2026-09-01", isOverdue: true }))
    expect(label).toEqual({ text: "Overdue", overdue: true })
  })

  it("never says Overdue for cadence work, however late", () => {
    for (const dueDate of ["2026-09-29", "2026-09-01", "2026-06-01", "2025-01-01"]) {
      for (const scheduleType of ["weekly", "monthly", "quarterly", "annual", null]) {
        expect(cleanDueLabel(task({ dueDate, scheduleType, isOverdue: true })).text, `${scheduleType} due ${dueDate}`).not.toBe("Overdue")
      }
    }
  })

  it("keeps the forward labels", () => {
    expect(cleanDueLabel(task({ dueDate: "2026-09-30" })).text).toBe("Today")
    expect(cleanDueLabel(task({ dueDate: "2026-10-01" })).text).toBe("Tomorrow")
    expect(cleanDueLabel(task({ dueDate: "2026-10-04" })).text).toBe("4 days")
    expect(cleanDueLabel(task({ dueDate: "2026-10-30" })).text).toBe("Later")
  })
})
