/**
 * Owner's standing rule: a homeowner is never shown DIY steps for hazardous
 * work (gas, combustion, live electrical). The item page enforced it; every
 * other door to the same task did not — "See details" from Home opened the
 * task page, and the Tasks rows on phone and desktop expanded, straight into
 * the numbered steps. Each surface here must answer the SAME way for the same
 * task: hazardous → the "Leave this to a licensed professional" notice and NO
 * steps in the DOM; DIY → the steps, as before.
 *
 * Absence is asserted as "not rendered" (queryByText → null), which is what
 * the rule means: the steps must not exist on the page, hidden or not.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { SWRConfig } from "swr"
import type { ReactElement } from "react"
import { localToday } from "../../../shared/dates/calendar"

const svc = vi.hoisted(() => ({
  getWeekAgenda: vi.fn(),
  getTaskDetail: vi.fn(),
  getItemCleanGuide: vi.fn(),
}))
vi.mock("@/modules/care", async () => {
  const dates = await vi.importActual<typeof import("@/modules/care/services/nextDueDate")>(
    "@/modules/care/services/nextDueDate",
  )
  return {
    getWeekAgenda: (...a: unknown[]) => svc.getWeekAgenda(...a),
    getTaskDetail: (...a: unknown[]) => svc.getTaskDetail(...a),
    markTaskInstanceDone: vi.fn(),
    snoozeTaskInstance: vi.fn(),
    assignTaskInstance: vi.fn(),
    setTaskReminder: vi.fn(),
    canAssignTasks: (n: number) => n > 1,
    computeNextDueDate: dates.computeNextDueDate,
  }
})
vi.mock("@/modules/home", () => ({
  getHomeMembers: vi.fn(async () => ({ data: [], error: null })),
  useCurrentHome: () => ({ home: { home_id: "home-1" } }),
}))
vi.mock("@/modules/knowledge", () => ({ getManualsByItem: vi.fn(async () => ({ data: [], error: null })) }))
vi.mock("@/hooks/useManualManagement", () => ({ resolveManualUrl: vi.fn() }))
vi.mock("@/components/care/TaskFeedbackSheet", () => ({ TaskFeedbackSheet: () => null }))
vi.mock("@/components/care/ManualDockPanel", () => ({ ManualDockPanel: () => null }))
vi.mock("@/components/tasks/TaskEditSheet", () => ({ TaskEditSheet: () => null }))
vi.mock("@/components/item-care/SupplyRows", () => ({ SupplyRows: () => null }))
vi.mock("@/hooks/useCareSuggestions", () => ({
  useCareSuggestions: () => ({ rows: [], loading: false, error: null, add: vi.fn(), dismiss: vi.fn(), reload: vi.fn() }),
}))
vi.mock("@/lib/cleanSession", () => ({ getItemCleanGuide: (...a: unknown[]) => svc.getItemCleanGuide(...a) }))

const { RefinedTaskDetail } = await import("@/components/home/RefinedTaskDetail")
const { RefinedWeek } = await import("@/components/home/RefinedWeek")
const { DesktopTasks } = await import("@/components/home/DesktopTasks")
const { default: CleanGuide } = await import("@/pages/CleanGuide")

// ── The two tasks ────────────────────────────────────────────────────────────
// A pilot relight whose steps work the gas valve — what a furnace or water
// heater manual actually prints. The classifier marks it hazardous.
const GAS_TITLE = "Relight the gas furnace pilot"
const GAS_STEPS = [
  "Turn the gas valve to OFF and wait five minutes.",
  "Hold the pilot knob down and press the igniter.",
  "Turn the gas valve back to ON once the pilot stays lit.",
]
const DIY_TITLE = "Replace the furnace filter"
const DIY_STEPS = [
  "Switch the thermostat off at the wall.",
  "Slide the old filter out of the return grille.",
  "Slide the new filter in with the arrow pointing toward the blower.",
]
const numbered = (steps: string[]) => steps.map((s, i) => `${i + 1}. ${s}`).join("\n")

const detailOf = (id: string, title: string, steps: string[]) => ({
  taskInstanceId: id, taskTemplateId: `tt-${id}`, title, tier: "essential", careType: "maintenance",
  justification: null, estimatedMinutes: 15, dueDate: localToday(), assignedTo: null,
  notes: numbered(steps), steps, supplies: [], scheduleType: "annual", intervalDays: null,
  neverCompleted: false, manualPage: null, itemUnitId: null, itemName: null, roomName: null,
  schedule: { scheduleType: "annual", intervalDays: null, season: null }, remindEnabled: null,
})
const DETAILS: Record<string, ReturnType<typeof detailOf>> = {
  "ti-gas": detailOf("ti-gas", GAS_TITLE, GAS_STEPS),
  "ti-diy": detailOf("ti-diy", DIY_TITLE, DIY_STEPS),
}
const agendaRow = (id: string, title: string) => ({
  taskInstanceId: id, taskTemplateId: `tt-${id}`, title, source: "maintenance", priorityTier: "essential",
  estimatedMinutes: 15, dueDate: localToday(), isOverdue: false, pastDue: false,
  dueKind: "window", windowState: "open", duePhrase: "Good to do now", safetyNote: null, trulyOverdue: false,
  itemUnitId: null, itemName: null, roomName: null,
})

const PRO_NOTICE = "Leave this to a licensed professional"
/** The hazardous task's steps are not rendered at all — not merely hidden. */
const expectNoGasSteps = (scope: HTMLElement = document.body) => {
  for (const s of GAS_STEPS) expect(within(scope).queryByText(s)).toBeNull()
}
const expectDiySteps = (scope: HTMLElement = document.body) => {
  for (const s of DIY_STEPS) expect(within(scope).getByText(s)).toBeInTheDocument()
}

const renderApp = (ui: ReactElement, path = "/") =>
  render(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </SWRConfig>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  svc.getTaskDetail.mockImplementation(async (_home: string, id: string) => ({ data: DETAILS[id] ?? null, error: null }))
  svc.getWeekAgenda.mockResolvedValue({
    data: [agendaRow("ti-gas", GAS_TITLE), agendaRow("ti-diy", DIY_TITLE)],
    error: null,
    withheld: { beyondHorizon: 0, nextDueDate: null, itemCleaning: 0 },
  })
})

describe("task page (Home → See details)", () => {
  it("a hazardous task shows the pro notice and NOT its steps", async () => {
    renderApp(<RefinedTaskDetail taskInstanceId="ti-gas" homeId="home-1" onBack={vi.fn()} />)
    await screen.findByText(PRO_NOTICE)
    expectNoGasSteps()
    // "Find a pro" goes to the providers list, not Settings.
    expect(screen.getByRole("link", { name: /Find a pro/ })).toHaveAttribute("href", "/providers")
  })

  it("a DIY task still shows its steps, with no pro notice", async () => {
    renderApp(<RefinedTaskDetail taskInstanceId="ti-diy" homeId="home-1" onBack={vi.fn()} />)
    await screen.findByText(DIY_STEPS[0])
    expectDiySteps()
    expect(screen.queryByText(PRO_NOTICE)).toBeNull()
  })
})

describe("Tasks row — phone (RefinedWeek)", () => {
  const rowOf = (title: string) =>
    screen.getAllByTestId("phone-task-row").find((r) => within(r).queryByText(title))!
  /** The phone row toggles on a tap expressed as pointerdown+pointerup with no move. */
  const expand = async (title: string) => {
    const target = screen.getByText(title).closest("div")!.parentElement!
    fireEvent.pointerDown(target, { clientX: 10, pointerId: 1 })
    fireEvent.pointerUp(target, { clientX: 10, pointerId: 1 })
    await within(rowOf(title)).findByRole("button", { name: /^snooze$/i })
    await waitFor(() => expect(within(rowOf(title)).queryByText("Loading…")).toBeNull())
  }

  it("a hazardous task's open row shows the pro notice and NOT its steps", async () => {
    renderApp(<RefinedWeek homeId="home-1" />)
    await screen.findByText(GAS_TITLE)
    await expand(GAS_TITLE)
    expect(within(rowOf(GAS_TITLE)).getByText(PRO_NOTICE)).toBeInTheDocument()
    expectNoGasSteps()
  })

  it("a DIY task's open row still shows its steps", async () => {
    renderApp(<RefinedWeek homeId="home-1" />)
    await screen.findByText(DIY_TITLE)
    await expand(DIY_TITLE)
    expectDiySteps(rowOf(DIY_TITLE))
    expect(screen.queryByText(PRO_NOTICE)).toBeNull()
  })
})

describe("Tasks row — desktop (DesktopTasks)", () => {
  const rowOf = (title: string) =>
    screen.getByText(title).closest<HTMLElement>('[data-testid="desktop-task-row"]')!
  const expand = async (title: string) => {
    fireEvent.click(screen.getByText(title))
    await within(rowOf(title)).findByRole("button", { name: /^Snooze$/ })
    await waitFor(() => expect(within(rowOf(title)).queryByText("Loading…")).toBeNull())
  }

  it("a hazardous task's open row shows the pro notice and NOT its steps", async () => {
    renderApp(<DesktopTasks homeId="home-1" />)
    await screen.findByText(GAS_TITLE)
    await expand(GAS_TITLE)
    expect(within(rowOf(GAS_TITLE)).getByText(PRO_NOTICE)).toBeInTheDocument()
    expectNoGasSteps()
  })

  it("a DIY task's open row still shows its steps", async () => {
    renderApp(<DesktopTasks homeId="home-1" />)
    await screen.findByText(DIY_TITLE)
    await expand(DIY_TITLE)
    expectDiySteps(rowOf(DIY_TITLE))
    expect(screen.queryByText(PRO_NOTICE)).toBeNull()
  })
})

describe("deep-clean guide (CleanGuide)", () => {
  it("a hazardous section shows the pro notice and NOT its steps; a DIY section keeps its steps", async () => {
    svc.getItemCleanGuide.mockResolvedValue({
      itemUnitId: "i1", itemName: "Gas Range", roomName: "Kitchen", totalMinutes: 30,
      tasks: [
        { taskTemplateId: "t-gas", title: GAS_TITLE, estimatedMinutes: 15, instructions: null, steps: GAS_STEPS, supplies: [] },
        { taskTemplateId: "t-diy", title: DIY_TITLE, estimatedMinutes: 15, instructions: null, steps: DIY_STEPS, supplies: [] },
      ],
    })
    renderApp(
      <Routes><Route path="/clean/:itemUnitId" element={<CleanGuide />} /></Routes>,
      "/clean/i1",
    )
    await screen.findByText(PRO_NOTICE)
    expectNoGasSteps()
    expectDiySteps()
  })
})
