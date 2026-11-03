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
import type { KnowledgeChunk } from "@/integrations/types"
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
// The reminder switch reads the notification style (no AuthProvider here); these tests use the default style.
vi.mock("@/hooks/usePushMode", () => ({ usePushMode: () => ({ mode: "curated+essential" }) }))
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
const { GuideCard, TroubleshootCard } = await import("@/components/home/DesktopItemDetail")
const { CleaningGuideCard } = await import("@/components/knowledge/CleaningGuideCard")

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

const detailOf = (id: string, title: string, steps: string[], description: string | null = null) => ({
  taskInstanceId: id, taskTemplateId: `tt-${id}`, title, tier: "essential", careType: "maintenance",
  justification: null, description, estimatedMinutes: 15, dueDate: localToday(), assignedTo: null,
  notes: numbered(steps), steps, supplies: [], scheduleType: "annual", intervalDays: null,
  neverCompleted: false, manualPage: null, itemUnitId: null, itemName: null, roomName: null,
  schedule: { scheduleType: "annual", intervalDays: null, season: null }, remindEnabled: null,
})
// Hazard named ONLY in the template's description — the item page classifies
// from it, so the task page must too (one task, one answer).
const DESC_STEPS = ["Press and hold the reset button for three seconds.", "Wait for the unit to restart."]
const DETAILS: Record<string, ReturnType<typeof detailOf>> = {
  "ti-gas": detailOf("ti-gas", GAS_TITLE, GAS_STEPS),
  "ti-diy": detailOf("ti-diy", DIY_TITLE, DIY_STEPS),
  "ti-desc": detailOf("ti-desc", "Restart the boiler", DESC_STEPS, "Works on the gas supply valve to the boiler."),
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

  it("a hazard named only in the description still hides the steps", async () => {
    renderApp(<RefinedTaskDetail taskInstanceId="ti-desc" homeId="home-1" onBack={vi.fn()} />)
    await screen.findByText(PRO_NOTICE)
    for (const s of DESC_STEPS) expect(screen.queryByText(s)).toBeNull()
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
  /** The phone row opens on its opener (a button with aria-expanded). */
  const expand = async (title: string) => {
    fireEvent.click(within(rowOf(title)).getByRole("button", { expanded: false }))
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

// ── Manual sections on the item page (Guides / Fix-it tabs, cleaning guide) ──
// Same rule, same classifier: a section about hazardous work hands over the pro
// notice, not its steps. Fix-it used to carry its own pro regex that only
// added a "Needs a pro?" card BELOW the steps.
const chunk = (id: string, title: string, scenarios: { condition: string; steps: string[] }[], over: Record<string, unknown> = {}) => ({
  chunk_id: id, manual_id: "m1", chunk_type: "how_to", content_level: null, title, content: "", tags: [],
  scenarios, source_pages: null, metadata: {}, embedding_ref: null,
  created_at: "", updated_at: "", deleted_at: null, ...over,
}) as unknown as KnowledgeChunk

describe("item page — Guides tab (GuideCard)", () => {
  it("a hazardous guide shows the pro notice and NOT its steps", () => {
    renderApp(<GuideCard chunk={chunk("c-gas", "Lighting instructions", [{ condition: "", steps: GAS_STEPS }])} />)
    // The collapsed meta doesn't advertise steps it won't show.
    expect(screen.queryByText(/3 steps/)).toBeNull()
    fireEvent.click(screen.getByText("Lighting instructions"))
    expect(screen.getByText(PRO_NOTICE)).toBeInTheDocument()
    expectNoGasSteps()
  })

  it("a DIY guide still shows its steps", () => {
    renderApp(<GuideCard chunk={chunk("c-diy", "Changing the filter", [{ condition: "", steps: DIY_STEPS }])} />)
    fireEvent.click(screen.getByText("Changing the filter"))
    expectDiySteps()
    expect(screen.queryByText(PRO_NOTICE)).toBeNull()
  })
})

describe("item page — Fix-it tab (TroubleshootCard)", () => {
  it("a hazardous fix shows the pro notice and the likely cause, NOT the fix steps", () => {
    renderApp(<TroubleshootCard chunk={chunk("t-gas", "Furnace won't heat", [{ condition: "The pilot has gone out", steps: GAS_STEPS }])} />)
    fireEvent.click(screen.getByText("Furnace won't heat"))
    expect(screen.getByText(PRO_NOTICE)).toBeInTheDocument()
    expect(screen.getByText("The pilot has gone out")).toBeInTheDocument()
    expect(screen.queryByText("The fix")).toBeNull()
    expectNoGasSteps()
  })

  it("a DIY fix still shows its steps", () => {
    renderApp(<TroubleshootCard chunk={chunk("t-diy", "Weak airflow", [{ condition: "A clogged filter", steps: DIY_STEPS }])} />)
    fireEvent.click(screen.getByText("Weak airflow"))
    expectDiySteps()
    expect(screen.queryByText(PRO_NOTICE)).toBeNull()
  })
})

describe("item page — cleaning guide card (phone)", () => {
  const cleaning = (title: string, steps: string[]) =>
    chunk("cg", title, [], { chunk_type: "cleaning_guide", tags: ["weekly"], content: JSON.stringify({ steps }) })

  it("a hazardous cleaning section shows the pro notice and NOT its steps", () => {
    renderApp(<CleaningGuideCard chunks={[cleaning("Burner care", GAS_STEPS)]} />)
    expect(screen.getByText(PRO_NOTICE)).toBeInTheDocument()
    expectNoGasSteps()
  })

  it("a DIY cleaning section still shows its steps", () => {
    renderApp(<CleaningGuideCard chunks={[cleaning("Weekly wipe-down", DIY_STEPS)]} />)
    expectDiySteps()
    expect(screen.queryByText(PRO_NOTICE)).toBeNull()
  })
})
