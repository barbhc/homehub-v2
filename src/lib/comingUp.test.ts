/**
 * Home's "Coming up" line (design/day-one-home.md): the next due month after
 * this week. A brand-new home has nothing scheduled past this week, so a
 * recurring task in the week counts by the date its next one will take.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { comingUpLine, pickComingUp } from "./homeWeek"
import { deriveDashboardStats } from "./dashboard"

const inst = (id: string, data: Record<string, unknown>) => ({
  id,
  data: { status: "scheduled", careType: "maintenance", priorityTier: "recommended", deletedAt: null, ...data },
})
const statsFor = (live: ReturnType<typeof inst>[]) => deriveDashboardStats({ items: [], recentDone: [], live } as never)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-11-19T09:00:00-08:00"))
})
afterEach(() => vi.useRealTimers())

describe("pickComingUp", () => {
  it("names the earliest month and its first two distinct tasks", () => {
    const c = pickComingUp([
      { date: "2027-05-21", title: "Test smoke and CO alarms", again: true },
      { date: "2027-03-05", title: "Clean the gutters", again: false },
      { date: "2027-03-20", title: "Clean the gutters", again: true },
      { date: "2027-03-28", title: "Flush the water heater", again: false },
      { date: "2027-03-30", title: "Check the extinguisher", again: false },
    ])
    expect(c).toEqual({ date: "2027-03-05", titles: ["Clean the gutters", "Flush the water heater"], again: false })
  })

  it("is null with nothing ahead", () => expect(pickComingUp([])).toBeNull())
})

describe("comingUpLine", () => {
  it("names the month, lowercases the first letter only, and says again when every task is a repeat", () => {
    const line = comingUpLine({ date: "2027-05-21", titles: ["Clean the gutters", "Test smoke and CO alarms"], again: true }, "2026-11-19")
    expect(line).toEqual({ lead: "Coming up in May:", rest: "clean the gutters and test smoke and CO alarms again." })
  })

  it("keeps an acronym's capitals, and says later this month when it is this month", () => {
    expect(comingUpLine({ date: "2026-11-29", titles: ["HVAC service"], again: false }, "2026-11-19")).toEqual({ lead: "Later this month:", rest: "HVAC service." })
  })
})

describe("deriveDashboardStats → comingUp", () => {
  it("a new home with only this week's tasks: their next dates, as repeats", () => {
    const c = statsFor([
      inst("a", { title: "Test smoke and CO alarms", dueDate: "2026-11-21", scheduleType: "semiannual" }),
      inst("b", { title: "Shut off and drain the outdoor taps", dueDate: "2026-11-22", scheduleType: "annual" }),
    ]).comingUp
    expect(c).toEqual({ date: "2027-05-21", titles: ["Test smoke and CO alarms"], again: true })
  })

  it("a task already scheduled past this week wins over a repeat in a later month", () => {
    const c = statsFor([
      inst("a", { title: "Test smoke and CO alarms", dueDate: "2026-11-21", scheduleType: "semiannual" }),
      inst("b", { title: "Replace the air filter", dueDate: "2027-01-10", scheduleType: "quarterly" }),
    ]).comingUp
    expect(c).toEqual({ date: "2027-01-10", titles: ["Replace the air filter"], again: false })
  })

  it("leaves out cleaning and one-off tasks", () => {
    expect(statsFor([
      inst("a", { title: "Deep clean the oven", dueDate: "2027-01-10", scheduleType: "monthly", careType: "cleaning" }),
      inst("b", { title: "Register the warranty", dueDate: "2026-11-21", scheduleType: "setup" }),
    ]).comingUp).toBeNull()
  })
})
