/**
 * The task page's Mark done sheet — the one check-off door that sends its own
 * date instead of markTaskInstanceDone's default.
 *
 * Three things are pinned:
 *  1. The date is the DEVICE's day. The sheet used its own UTC `todayStr()`,
 *     so at 23:30 in California it recorded tomorrow (the default path had the
 *     same bug and is covered in checkoffDate.test.ts).
 *  2. "A few days ago" is five local days back AND says so (`backdated`): the
 *     server now refuses a date that old unless told.
 *  3. A refused check-off is SHOWN. The sheet used to show "Done" whatever the
 *     callable answered — and this change gives the server a new way to say no.
 *
 * The zone is pinned to Pacific so 23:30 is an instant where the UTC date is
 * wrong (asserted), whatever zone the suite runs in.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"

const getTaskDetail = vi.fn()
const markTaskInstanceDone = vi.fn()

vi.mock("@/modules/care", async () => {
  const dates = await vi.importActual<typeof import("@/modules/care/services/nextDueDate")>(
    "@/modules/care/services/nextDueDate",
  )
  return {
    getTaskDetail: (...a: unknown[]) => getTaskDetail(...a),
    markTaskInstanceDone: (...a: unknown[]) => markTaskInstanceDone(...a),
    assignTaskInstance: vi.fn(),
    setTaskReminder: vi.fn(),
    canAssignTasks: () => false,
    computeNextDueDate: dates.computeNextDueDate,
    localDateString: dates.localDateString,
  }
})
vi.mock("@/modules/home", () => ({ getHomeMembers: vi.fn(async () => ({ data: [], error: null })) }))
vi.mock("@/modules/knowledge", () => ({ getManualsByItem: vi.fn(async () => ({ data: [], error: null })) }))
vi.mock("@/hooks/useManualManagement", () => ({ resolveManualUrl: vi.fn() }))
vi.mock("@/components/care/TaskFeedbackSheet", () => ({ TaskFeedbackSheet: () => null }))
vi.mock("@/components/care/ManualDockPanel", () => ({ ManualDockPanel: () => null }))
vi.mock("@/components/tasks/TaskEditSheet", () => ({ TaskEditSheet: () => null }))
vi.mock("@/components/tasks/HowToSteps", () => ({ HowToSteps: () => null }))
vi.mock("@/components/item-care/SupplyRows", () => ({ SupplyRows: () => null }))
vi.mock("react-router-dom", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

import { RefinedTaskDetail } from "./RefinedTaskDetail"

const DETAIL = {
  taskInstanceId: "ti-1",
  taskTemplateId: "tt-1",
  title: "Replace the furnace filter",
  tier: "essential",
  careType: "maintenance",
  justification: null,
  estimatedMinutes: 10,
  dueDate: "2026-09-29",
  assignedTo: null,
  notes: null,
  steps: null,
  supplies: [],
  scheduleType: "monthly",
  intervalDays: null,
  neverCompleted: false,
  manualPage: null,
  itemUnitId: null,
  itemName: null,
  roomName: null,
  schedule: { scheduleType: "monthly", intervalDays: null, season: null },
  remindEnabled: null,
}

beforeAll(() => {
  vi.stubEnv("TZ", "America/Los_Angeles") // Node re-reads TZ at runtime
})
afterAll(() => {
  vi.unstubAllEnvs()
})

beforeEach(() => {
  vi.clearAllMocks()
  getTaskDetail.mockResolvedValue({ data: DETAIL, error: null })
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(2026, 8, 29, 23, 30)) // 23:30 PDT, Sep 29 — 06:30Z on the 30th
})
afterEach(() => {
  vi.useRealTimers()
})

/** Open the page, press Mark done, and wait for the sheet. */
async function openSheet() {
  render(<RefinedTaskDetail taskInstanceId="ti-1" homeId="home-1" onBack={vi.fn()} />)
  await screen.findAllByText("Replace the furnace filter")
  // Both lanes (desktop rail, phone bar) are in the DOM; either opens the sheet.
  fireEvent.click(screen.getAllByRole("button", { name: /mark done/i })[0])
  await screen.findByRole("button", { name: /^confirm$/i })
}

describe("task page — Mark done", () => {
  it("records the device's day at 23:30 Pacific, not the UTC day", async () => {
    expect(new Date().toISOString().slice(0, 10)).toBe("2026-09-30") // what the old sheet sent
    markTaskInstanceDone.mockResolvedValue({ success: true, data: {}, nextInstanceId: "ti-2" })
    await openSheet()

    fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }))

    await waitFor(() => expect(markTaskInstanceDone).toHaveBeenCalledTimes(1))
    expect(markTaskInstanceDone).toHaveBeenCalledWith("home-1", "ti-1", null, {
      completedOn: "2026-09-29",
      backdated: false,
      nextDueOverride: "2026-10-29", // a month from the 29th
    })
    expect((await screen.findAllByText(/Done · next due Oct 29/)).length).toBeGreaterThan(0)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("'A few days ago' sends five local days back, marked backdated", async () => {
    markTaskInstanceDone.mockResolvedValue({ success: true, data: {}, nextInstanceId: "ti-2" })
    await openSheet()

    fireEvent.click(screen.getByRole("button", { name: /^adjust$/i }))
    fireEvent.click(screen.getByRole("button", { name: /a few days ago/i }))
    fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }))

    await waitFor(() => expect(markTaskInstanceDone).toHaveBeenCalledTimes(1))
    expect(markTaskInstanceDone).toHaveBeenCalledWith("home-1", "ti-1", null, {
      completedOn: "2026-09-24",
      backdated: true,
      nextDueOverride: "2026-10-24",
    })
  })

  describe("on a device at UTC+13 (Auckland, daylight time from Sep 27)", () => {
    beforeAll(() => {
      vi.stubEnv("TZ", "Pacific/Auckland")
    })
    afterAll(() => {
      vi.stubEnv("TZ", "America/Los_Angeles")
    })

    it("sends the next window it shows — not a day early", async () => {
      // The sheet's next window goes through addDays even with no adjust; it
      // formatted local noon as UTC, and local noon at UTC+13 is 23:00Z the
      // day before, so the override it sent was Oct 28.
      expect(new Date(2026, 9, 29, 12).toISOString().slice(0, 10)).toBe("2026-10-28")
      markTaskInstanceDone.mockResolvedValue({ success: true, data: {}, nextInstanceId: "ti-2" })
      await openSheet()

      fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }))

      await waitFor(() => expect(markTaskInstanceDone).toHaveBeenCalledTimes(1))
      expect(markTaskInstanceDone).toHaveBeenCalledWith("home-1", "ti-1", null, {
        completedOn: "2026-09-29",
        backdated: false,
        nextDueOverride: "2026-10-29",
      })
    })
  })

  it("a refused check-off says why and leaves the task NOT done", async () => {
    markTaskInstanceDone.mockResolvedValue({
      success: false,
      error: "Can't record this as done on 2026-10-02: today at this home is 2026-09-29. Check this device's date and time.",
    })
    await openSheet()

    fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }))

    // One note per lane (desktop rail + phone bar); CSS shows one of them.
    const alerts = await screen.findAllByRole("alert")
    expect(alerts.length).toBeGreaterThan(0)
    for (const a of alerts) expect(a).toHaveTextContent(/today at this home is 2026-09-29/)
    // Not rendered at all — not merely hidden: nothing claims it is done.
    expect(screen.queryByText(/^Done/)).not.toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: /mark done/i }).length).toBeGreaterThan(0)
  })

  it("any other failure reads as Home and Tasks say it — never a raw code, never a third wording", async () => {
    markTaskInstanceDone.mockResolvedValue({ success: false, error: "INTERNAL" })
    await openSheet()

    fireEvent.click(screen.getByRole("button", { name: /^confirm$/i }))

    const alerts = await screen.findAllByRole("alert")
    for (const a of alerts) {
      expect(a).toHaveTextContent("Couldn't mark this done. Check your connection and try again.")
      expect(a).not.toHaveTextContent("INTERNAL")
    }
    expect(screen.queryByText(/^Done/)).not.toBeInTheDocument()
  })
})
