/**
 * HH-94 on desktop: the Tasks page with nothing on the list.
 *
 * Item-scoped cleaning never reaches the agenda — it lives in the item's
 * guides and in Deep Clean — so "Nothing due — enjoy the calm." over a home
 * with cleaning scheduled is the invisibility the owner reported three times.
 * The phone page learned to say where the work went; the desktop page kept
 * its own copy of the line and never did. Both now render one implementation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { SWRConfig } from "swr"

const svc = vi.hoisted(() => ({
  getWeekAgenda: vi.fn(),
  countHiddenCleaning: vi.fn(),
}))
vi.mock("@/modules/care", () => ({
  getWeekAgenda: (...a: unknown[]) => svc.getWeekAgenda(...a),
  countHiddenCleaning: (...a: unknown[]) => svc.countHiddenCleaning(...a),
  markTaskInstanceDone: vi.fn(),
  snoozeTaskInstance: vi.fn(),
  getTaskDetail: vi.fn().mockResolvedValue({ data: null, error: null }),
}))
// The standing Suggested group fetches on its own; it is not what this pins.
vi.mock("@/hooks/useCareSuggestions", () => ({
  useCareSuggestions: () => ({ rows: [], loading: false, error: null, add: vi.fn(), dismiss: vi.fn(), reload: vi.fn() }),
}))

const { DesktopTasks } = await import("./DesktopTasks")
const { RefinedWeek } = await import("./RefinedWeek")

const renderWith = (ui: React.ReactElement) =>
  render(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <MemoryRouter>{ui}</MemoryRouter>
    </SWRConfig>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  svc.getWeekAgenda.mockResolvedValue({ data: [], error: null })
})

describe("DesktopTasks — an empty list says where the cleaning went (HH-94)", () => {
  it("names the hidden cleaning instead of 'enjoy the calm'", async () => {
    svc.countHiddenCleaning.mockResolvedValue(3)
    renderWith(<DesktopTasks homeId="h1" />)
    expect(await screen.findByText("Nothing on the schedule — 3 cleaning jobs live in your guides.")).toBeInTheDocument()
    expect(screen.queryByText(/enjoy the calm/)).toBeNull()
  })

  it("one job is one job", async () => {
    svc.countHiddenCleaning.mockResolvedValue(1)
    renderWith(<DesktopTasks homeId="h1" />)
    expect(await screen.findByText("Nothing on the schedule — 1 cleaning job lives in your guides.")).toBeInTheDocument()
  })

  it("with nothing hidden, the calm line stands", async () => {
    svc.countHiddenCleaning.mockResolvedValue(0)
    renderWith(<DesktopTasks homeId="h1" />)
    expect(await screen.findByText("Nothing due — enjoy the calm.")).toBeInTheDocument()
  })

  it("phone and desktop say the same words — one implementation, not two that drift", async () => {
    svc.countHiddenCleaning.mockResolvedValue(2)
    renderWith(<><RefinedWeek homeId="h1" /><DesktopTasks homeId="h1" /></>)
    expect(await screen.findAllByText("Nothing on the schedule — 2 cleaning jobs live in your guides.")).toHaveLength(2)
  })
})
