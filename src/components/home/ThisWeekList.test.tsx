/**
 * Home · This week — the accordion contract (design/home-focus.md):
 * the first task opens by default, any row opens the same way and closes the
 * other, the open row shows its pills and ONE prep line, a failed detail load
 * says so in place, and the quiet week is one sentence.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { DashboardTask, MaintenanceTaskFull } from "@/lib/dashboard"

const detailFor = vi.hoisted(() => ({ map: {} as Record<string, unknown>, error: null as string | null }))
vi.mock("@/components/home/tasks/shared", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useTaskDetail: (_h: string | null, id: string | null) => ({
    detail: id ? (detailFor.map[id] ?? null) : null,
    loading: false,
    error: detailFor.error,
  }),
}))

const { ThisWeekList, TimelyWarrantyLine } = await import("./ThisWeekList")

const iso = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10) }

const urgent = (id: string, name: string, over: Partial<DashboardTask> = {}): DashboardTask =>
  ({ id, name, dueDate: iso(-6), isOverdue: true, isDueSoon: false, itemName: "Range Hood", itemId: "i1", priority: "high", effort: null, daysOverdue: 6, daysUntilDue: null, dueKind: "window", windowState: "lapsed", duePhrase: "Been a while", safetyNote: null, trulyOverdue: false, neverStarted: false, ...over }) as unknown as DashboardTask
const ahead = (id: string, title: string, days: number): MaintenanceTaskFull =>
  ({ id, title, next_due_date: iso(days), item_id: "i2", itemName: "Washer", priority: "medium", duePhrase: "In Sep", isOverdue: false }) as unknown as MaintenanceTaskFull

const renderList = (tasks: DashboardTask[], upcoming: MaintenanceTaskFull[], over: Partial<React.ComponentProps<typeof ThisWeekList>> = {}) => {
  const onComplete = vi.fn(), onSnooze = vi.fn()
  render(<MemoryRouter><ThisWeekList homeId="h1" tasks={tasks} upcoming={upcoming} completingId={null} onComplete={onComplete} onSnooze={onSnooze} {...over} /></MemoryRouter>)
  return { onComplete, onSnooze }
}

beforeEach(() => {
  detailFor.map = {
    lead: { title: "Clean Aluminum Mesh Filters", estimatedMinutes: 15, scheduleType: "monthly", intervalDays: null, supplies: [], justification: null, notes: null },
    tub: { title: "Run Tub Clean Cycle", estimatedMinutes: 30, scheduleType: "monthly", intervalDays: null, supplies: [{ name: "Affresh washer tablet" }], justification: null, notes: null },
  }
  detailFor.error = null
})

describe("ThisWeekList", () => {
  it("opens the first task by default, with its pills and no prep line when it needs nothing", async () => {
    renderList([urgent("lead", "Clean Aluminum Mesh Filters")], [ahead("tub", "Run Tub Clean Cycle", 3)])
    const rows = screen.getAllByTestId("week-row")
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveAttribute("data-open", "true")
    expect(rows[1]).toHaveAttribute("data-open", "false")
    const body = within(rows[0]).getByTestId("week-row-body")
    expect(body.textContent).toMatch(/Been a while/)
    expect(body.textContent).toMatch(/Monthly/)
    expect(body.textContent).toMatch(/15 min/)
    expect(within(rows[0]).queryByTestId("prep-line")).toBeNull()
    expect(within(rows[0]).getByRole("link", { name: /See details/ })).toHaveAttribute("href", "/tasks/lead")
  })

  it("tapping another row opens it the same way and closes the first; its prep line names the supply", async () => {
    renderList([urgent("lead", "Clean Aluminum Mesh Filters")], [ahead("tub", "Run Tub Clean Cycle", 3)])
    fireEvent.click(screen.getByRole("button", { name: /^Run Tub Clean Cycle/ }))
    const rows = screen.getAllByTestId("week-row")
    await waitFor(() => expect(rows[1]).toHaveAttribute("data-open", "true"))
    expect(rows[0]).toHaveAttribute("data-open", "false")
    expect(within(rows[1]).getByTestId("prep-line").textContent).toBe("You'll need an Affresh washer tablet.")
  })

  it("Mark done and Snooze act on the open task's instance", () => {
    const { onComplete, onSnooze } = renderList([urgent("lead", "Clean Aluminum Mesh Filters")], [])
    fireEvent.click(screen.getByRole("button", { name: "Mark done" }))
    expect(onComplete).toHaveBeenCalledWith("lead")
    fireEvent.click(screen.getByRole("button", { name: /Snooze/ }))
    expect(onSnooze).toHaveBeenCalledWith("lead")
  })

  it("a failed detail load says so inside the row, with a retry — never a silent blank", () => {
    detailFor.error = "permission-denied"
    renderList([urgent("lead", "Clean Aluminum Mesh Filters")], [])
    const alert = screen.getByRole("alert")
    expect(alert.textContent).toMatch(/permission-denied/)
    expect(within(alert).getByRole("button", { name: /Try again/ })).toBeTruthy()
    // The row is still a row: its actions did not disappear with the details.
    expect(screen.getByRole("button", { name: "Mark done" })).toBeTruthy()
  })

  it("an empty window is one calm sentence plus the next two ahead — not an empty card", () => {
    renderList([], [ahead("a", "Replace the Air Filter", 9), ahead("b", "Replace carbon filters", 20), ahead("c", "Later", 40)])
    const quiet = screen.getByTestId("quiet-week")
    expect(quiet.textContent).toMatch(/All quiet until/)
    expect(quiet.textContent).toMatch(/Next up: replace the air filter/)
    expect(screen.getAllByTestId("next-up-row")).toHaveLength(2)
    expect(screen.queryByTestId("week-row")).toBeNull()
  })

  it("the footer is the only door out, and it says where it goes", () => {
    renderList([urgent("lead", "Clean Aluminum Mesh Filters")], [])
    expect(screen.getByRole("link", { name: /All tasks/ })).toHaveAttribute("href", "/maintenance")
    expect(screen.queryByText(/in their window|across your home/)).toBeNull()
  })
})

describe("TimelyWarrantyLine", () => {
  it("shows the one warranty ending inside 60 days, and nothing otherwise", () => {
    const { rerender } = render(<MemoryRouter><TimelyWarrantyLine warranties={[{ item_unit_id: "c", display_name: "Coway Air Purifier", warranty_expiry_date: iso(26), days_remaining: 26 }]} /></MemoryRouter>)
    expect(screen.getByTestId("timely-warranty").textContent).toMatch(/Coway Air Purifier warranty ends/)
    rerender(<MemoryRouter><TimelyWarrantyLine warranties={[{ item_unit_id: "f", display_name: "Fridge", warranty_expiry_date: iso(80), days_remaining: 80 }]} /></MemoryRouter>)
    expect(screen.queryByTestId("timely-warranty")).toBeNull()
  })
})
