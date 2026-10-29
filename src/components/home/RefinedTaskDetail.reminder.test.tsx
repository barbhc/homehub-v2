/**
 * The task page's "Remind me when it's due" switch — what it shows, where, and
 * what it writes.
 *
 * Owner, 2026-10-28: "Off wins, no exceptions", and "Just my list" notifies
 * ONLY tasks switched On — a never-set deadline included. A deadline is a
 * one-off task, and the switch used to render for recurring tasks only, so a
 * "Just my list" user had no way to opt a warranty deadline in at all. These
 * pin that the switch is on deadlines, says the truth per style, and writes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"

const getTaskDetail = vi.fn()
const setTaskReminder = vi.fn()
let mode = "curated"

vi.mock("@/modules/care", async () => {
  const dates = await vi.importActual<typeof import("@/modules/care/services/nextDueDate")>(
    "@/modules/care/services/nextDueDate",
  )
  return {
    getTaskDetail: (...a: unknown[]) => getTaskDetail(...a),
    markTaskInstanceDone: vi.fn(),
    assignTaskInstance: vi.fn(),
    setTaskReminder: (...a: unknown[]) => setTaskReminder(...a),
    canAssignTasks: () => false,
    computeNextDueDate: dates.computeNextDueDate,
  }
})
vi.mock("@/modules/home", () => ({ getHomeMembers: vi.fn(async () => ({ data: [], error: null })) }))
vi.mock("@/hooks/usePushMode", () => ({ usePushMode: () => ({ mode }) }))
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

const BASE = {
  taskInstanceId: "ti-1",
  taskTemplateId: "tt-1",
  careType: "maintenance",
  justification: null,
  estimatedMinutes: 10,
  assignedTo: null,
  notes: null,
  steps: null,
  supplies: [],
  intervalDays: null,
  neverCompleted: false,
  manualPage: null,
  itemUnitId: null,
  itemName: null,
  roomName: null,
  remindEnabled: null,
}
/** A one-off deadline, stored with no schedule at all. */
const DEADLINE = {
  ...BASE,
  title: "Register the dishwasher warranty",
  tier: "recommended",
  dueDate: "2099-01-15",
  scheduleType: null,
  schedule: null,
}
/** A one-off that never comes due on its own — no bell. */
const AS_NEEDED = {
  ...BASE,
  title: "Descale the machine",
  tier: "recommended",
  dueDate: "2099-01-15",
  scheduleType: "as_needed",
  schedule: { scheduleType: "as_needed", intervalDays: null, season: null },
}
/** Lapsed safety work, never set, Recommended. */
const LAPSED_SAFETY = {
  ...BASE,
  title: "Test the CO alarm",
  tier: "recommended",
  dueDate: "2020-01-15",
  scheduleType: "monthly",
  schedule: { scheduleType: "monthly", intervalDays: null, season: null },
  isSafetyCritical: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  mode = "curated"
  setTaskReminder.mockResolvedValue({ data: true, error: null })
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia
})

async function open(detail: object) {
  getTaskDetail.mockResolvedValue({ data: detail, error: null })
  render(<RefinedTaskDetail taskInstanceId="ti-1" homeId="home-1" onBack={vi.fn()} />)
  await screen.findAllByText((detail as { title: string }).title)
}
const switches = () => screen.queryAllByRole("checkbox", { name: /Remind me when it/ })

describe("task page reminder switch — deadlines", () => {
  it("Just my list: a never-set deadline shows the switch OFF, and turning it on saves On", async () => {
    await open(DEADLINE)
    const boxes = switches()
    expect(boxes.length).toBeGreaterThan(0) // rendered (both lanes may carry it)
    for (const b of boxes) expect(b).not.toBeChecked()
    expect(screen.getAllByText("Off — Just my list reminds only what you turn on").length).toBeGreaterThan(0)

    fireEvent.click(boxes[0])
    await waitFor(() => expect(setTaskReminder).toHaveBeenCalledWith("home-1", "tt-1", true))
    await waitFor(() => expect(screen.getAllByText("You turned this on").length).toBeGreaterThan(0))
  })

  it("My list + Essential: a never-set deadline is ON by default, and says it is a deadline", async () => {
    mode = "curated+essential"
    await open(DEADLINE)
    for (const b of switches()) expect(b).toBeChecked()
    expect(screen.getAllByText("On by default for deadlines — you can turn it off").length).toBeGreaterThan(0)
  })

  it("Everything on a schedule: a deadline switched Off stays off and says so", async () => {
    mode = "all"
    await open({ ...DEADLINE, remindEnabled: false })
    for (const b of switches()) expect(b).not.toBeChecked()
    expect(screen.getAllByText("You turned this off").length).toBeGreaterThan(0)
  })

  it("an as-needed one-off still has NO switch — it never comes due, so the bell could not ring", async () => {
    await open(AS_NEEDED)
    expect(switches()).toHaveLength(0)
  })
})

describe("task page reminder switch — lapsed safety", () => {
  it("My list + Essential: a never-set lapsed Recommended safety check is ON, and says it is in the weekly summary", async () => {
    mode = "curated+essential"
    await open(LAPSED_SAFETY)
    for (const b of switches()) expect(b).toBeChecked()
    expect(screen.getAllByText("On — skipped safety checks go in your weekly summary").length).toBeGreaterThan(0)
  })

  it("Just my list: the same task is OFF — only what you turn on", async () => {
    await open(LAPSED_SAFETY)
    for (const b of switches()) expect(b).not.toBeChecked()
  })
})
