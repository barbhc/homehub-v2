/**
 * Home hero logic. The corpus mirrors the owner's real home (14 items, all
 * photo-less at the time of writing) because that's the data the first render
 * will actually meet.
 */
import { describe, it, expect } from "vitest"
import { detectWins, comingUp, drawerMeta, dueThisMonth, fmtWhen, GAP_DAYS  } from "./homeHero"
import type { ComingUpRow } from "./homeHero"
import type { ItemUnit } from "@/integrations/types"
import type { MaintenanceTaskFull } from "@/lib/dashboard"

const item = (o: Partial<ItemUnit>): ItemUnit =>
  ({ item_unit_id: Math.random().toString(36).slice(2), display_name: "Thing", category: "Small appliance",
     photo_storage_ref: null, warranty_expiry_date: null, ...o }) as ItemUnit

const task = (o: Partial<MaintenanceTaskFull>): MaintenanceTaskFull =>
  ({ id: Math.random().toString(36).slice(2), title: "T", next_due_date: "2026-08-15",
     itemName: "Furnace", isOverdue: false, ...o }) as MaintenanceTaskFull

const TODAY = "2026-08-05"

describe("detectWins — the face must hide rather than pad", () => {
  it("no true wins → empty array, no manufactured suggestions", () => {
    const items = [item({ photo_storage_ref: "p.jpg" }), item({ photo_storage_ref: "q.jpg" })]
    expect(detectWins(items)).toEqual([])
  })

  it("photo win counts the real gap and needs at least 3 to bother", () => {
    const items = [...Array(8)].map(() => item({})).concat([...Array(6)].map(() => item({ photo_storage_ref: "x" })))
    const wins = detectWins(items)
    expect(wins[0].key).toBe("photos")
    expect(wins[0].why).toContain("8 of your 14 items")
    // Two missing photos is not worth a card.
    expect(detectWins([item({}), item({}), item({ photo_storage_ref: "x" })]).find((w) => w.key === "photos")?.why ?? "none")
      .toBe("none")
  })

  it("warranty win fires only for MAJOR appliances", () => {
    const wins = detectWins([
      item({ display_name: "Washer", category: "Major appliance", photo_storage_ref: "x" }),
      item({ display_name: "Blender", category: "Small Appliance", photo_storage_ref: "x" }),
    ])
    expect(wins).toHaveLength(1)
    expect(wins[0].title).toContain("Washer")
    expect(wins[0].why).toContain("only major appliance")
  })

  it("a covered major appliance produces nothing", () => {
    expect(detectWins([item({ category: "Major Appliance", warranty_expiry_date: "2027-01-01", photo_storage_ref: "x" })])).toEqual([])
  })
})

describe("comingUp — rows, overdue, silences", () => {
  it("sorts by date, formats dates as words, drops undated rows", () => {
    const rows = comingUp([
      task({ title: "B", next_due_date: "2026-08-29" }),
      task({ title: "A", next_due_date: "2026-08-15" }),
      task({ title: "no date", next_due_date: null }),
    ], TODAY)
    expect(rows.map((r) => r.title)).toEqual(["A", "B"])
    expect(rows[0].when).toBe("Sat, Aug 15")
  })

  it("a ≥14-day silence is measurable so the UI can draw it", () => {
    const rows = comingUp([
      task({ next_due_date: "2026-08-15" }),
      task({ next_due_date: "2026-08-29" }),
    ], TODAY)
    expect(rows[1].gapBefore).toBe(GAP_DAYS)
  })

  it("overdue rows lead and carry their day count, never a gap", () => {
    const rows = comingUp([
      task({ next_due_date: "2026-08-20" }),
      task({ title: "late", next_due_date: "2026-06-23", isOverdue: true }),
    ], TODAY)
    expect(rows[0].title).toBe("late")
    expect(rows[0].overdueDays).toBe(43)
    expect(rows[0].gapBefore).toBe(0)
  })
})

describe("drawerMeta — the closed row still answers", () => {
  it("quiet month reads count + next date", () => {
    const rows = comingUp([task({ next_due_date: "2026-08-15" }), task({ next_due_date: "2026-08-29" })], TODAY)
    expect(drawerMeta(rows, TODAY)).toBe("2 in August · next Sat, Aug 15")
  })

  it("overdue leads the meta", () => {
    const rows = comingUp([
      task({ next_due_date: "2026-06-23", isOverdue: true }),
      task({ next_due_date: "2026-08-15" }),
    ], TODAY)
    expect(drawerMeta(rows, TODAY)).toBe("1 overdue · 1 in August")
  })

  it("empty schedule says so honestly — never '0 in August'", () => {
    expect(drawerMeta([], TODAY)).toBe("Nothing scheduled yet")
  })

  it("nothing due THIS month falls back to the next date", () => {
    const rows = comingUp([task({ next_due_date: "2026-10-12" })], TODAY)
    expect(drawerMeta(rows, TODAY)).toBe("Next: Mon, Oct 12")
  })

  // Owner, 2026-09-01: "5 in September · next Wed, Sep 2" sat above a row
  // reading "Good to do now" — one drawer, two vocabularies. A window row has
  // no date to promise; the header says a date only for a real deadline.
  it("a window row never earns a weekday date in the header", () => {
    const rows = comingUp([
      task({ next_due_date: "2026-08-15", duePhrase: "Good to do now" }),
      task({ next_due_date: "2026-08-29", duePhrase: "Aug-ish" }),
    ], TODAY)
    expect(drawerMeta(rows, TODAY)).toBe("2 in August")
    expect(drawerMeta(rows, TODAY)).not.toMatch(/Sat|Sun|Mon|Tue|Wed|Thu|Fri/)
  })

  it("nothing this month + a window row → its phrase, not its date", () => {
    const rows = comingUp([task({ next_due_date: "2026-10-12", duePhrase: "Oct-ish" })], TODAY)
    expect(drawerMeta(rows, TODAY)).toBe("Next: Oct-ish")
  })
})

describe("dueThisMonth", () => {
  it("counts only this month's future, non-overdue tasks", () => {
    expect(dueThisMonth([
      task({ next_due_date: "2026-08-15" }),
      task({ next_due_date: "2026-08-29" }),
      task({ next_due_date: "2026-08-02" }),                      // already past, not overdue-flagged
      task({ next_due_date: "2026-06-23", isOverdue: true }),     // overdue — its own bucket
      task({ next_due_date: "2026-10-12" }),                      // later
    ], TODAY)).toBe(2)
  })
})

describe("fmtWhen", () => {
  it("words, not blocks", () => {
    expect(fmtWhen("2026-08-15")).toBe("Sat, Aug 15")
  })
})

describe("comingUp — item context, the reason rows are legible", () => {
  it("carries the item id so a row can open where its context lives", () => {
    const rows = comingUp([
      { id: "i1", title: "Check Grate Support Bumpers", itemName: "GE Profile Gas Range",
        item_id: "range", next_due_date: "2026-08-15", isOverdue: false },
    ], TODAY)
    expect(rows[0].itemId).toBe("range")
    // The title alone ("Check Grate Support Bumpers") doesn't say what it's FOR.
    expect(rows[0].itemName).toBe("GE Profile Gas Range")
  })

  it("a home-scoped task has no item id — the row falls back, never dead-ends", () => {
    const rows = comingUp([
      { id: "h1", title: "Test smoke & CO detectors", itemName: null,
        next_due_date: "2026-08-20", isOverdue: false },
    ], TODAY)
    expect(rows[0].itemId).toBeNull()
    expect(rows[0].itemName).toBeNull()
  })
})

describe("drawerMeta under due windows", () => {
  const row = (over: Partial<ComingUpRow>): ComingUpRow => ({
    id: "r", title: "T", itemName: null, itemId: null, when: "Fri, Aug 21",
    dueDate: "2026-08-10", overdueDays: 5, duePhrase: "Been a while", gapBefore: 0, ...over,
  })

  it("never says '0 overdue' — the count is zero precisely because none are", () => {
    const meta = drawerMeta([row({}), row({ id: "r2" })], "2026-08-20")
    expect(meta).not.toMatch(/overdue/)
    expect(meta).toBe("2 waiting")
  })

  it("still counts a real deadline as overdue", () => {
    // No duePhrase = the caller judged it a genuine deadline.
    const meta = drawerMeta([row({ duePhrase: null })], "2026-08-20")
    expect(meta).toMatch(/1 overdue/)
  })
})

describe("HH-92 — an empty drawer with a scheduled future tells the truth", () => {
  it("names the day the next window opens instead of denying the schedule", () => {
    // The reported screen: two tasks due Sep 21, feed empty, drawer reading
    // "Nothing scheduled yet". With the readback it says when.
    expect(drawerMeta([], "2026-08-21", { dueDate: "2026-09-21", windowStart: "2026-09-14" }))
      .toBe("Next window opens Sep 14")
  })

  it("still says nothing-yet when there genuinely is nothing", () => {
    expect(drawerMeta([], "2026-08-21", null)).toBe("Nothing scheduled yet")
    expect(drawerMeta([], "2026-08-21")).toBe("Nothing scheduled yet")
  })
})
