/**
 * useWeekAgenda + useCareSuggestions — the Tasks page's data, shared.
 *
 * /maintenance mounts RefinedWeek AND DesktopTasks (CSS shows one), and each
 * used to fetch the agenda and the suggestions itself: every visit paid for
 * both reads twice. Two consumers of one key must cost ONE fetch.
 *
 * Also pinned: a failed read is an error (never an empty agenda, never
 * persisted), and a check-off's local removal reaches every consumer and the
 * persisted snapshot — so a relaunch can't show a finished task as to-do.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { useEffect } from "react"
import { act, render, screen, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"
import type { WeekAgendaItem } from "@/modules/care"

const svc = vi.hoisted(() => ({
  getWeekAgenda: vi.fn(),
  countHiddenCleaning: vi.fn(),
  getTaskTemplates: vi.fn(),
  getItemUnits: vi.fn(),
  getHomeProfile: vi.fn(),
}))
vi.mock("@/modules/care", () => ({
  getWeekAgenda: (...a: unknown[]) => svc.getWeekAgenda(...a),
  countHiddenCleaning: (...a: unknown[]) => svc.countHiddenCleaning(...a),
  getTaskTemplates: (...a: unknown[]) => svc.getTaskTemplates(...a),
  addLibraryTask: vi.fn(),
  dismissLibrarySuggestion: vi.fn(),
  applyLibraryBackstop: vi.fn(),
}))
vi.mock("@/modules/items", () => ({ getItemUnits: (...a: unknown[]) => svc.getItemUnits(...a) }))
vi.mock("@/modules/home", () => ({ getHomeProfile: (...a: unknown[]) => svc.getHomeProfile(...a) }))

const { useWeekAgenda, TASKS_HORIZON_DAYS } = await import("./useWeekAgenda")
const { useCareSuggestions } = await import("./useCareSuggestions")

const task = (id: string, title: string) => ({ taskInstanceId: id, title, dueDate: "2026-10-01", priorityTier: "essential" }) as WeekAgendaItem
const ok = <T,>(data: T) => ({ data, error: null })
const never = () => new Promise<never>(() => {})

let removeFromFirst: (id: string) => void = () => {}
const exposeRemoveTask = (remove: (id: string) => void) => { removeFromFirst = remove }
function Agenda({ name, exposeRemove = false }: { name: string; exposeRemove?: boolean }) {
  const a = useWeekAgenda("h1")
  const { removeTask } = a
  useEffect(() => { if (exposeRemove) exposeRemoveTask(removeTask) }, [exposeRemove, removeTask])
  return (
    <section aria-label={name}>
      {a.error && <p role="alert">{a.error.message}</p>}
      {a.data?.items.map((t) => <p key={t.taskInstanceId}>{t.title}</p>)}
    </section>
  )
}
function Suggestions({ name }: { name: string }) {
  const c = useCareSuggestions("h1")
  return <section aria-label={name}>{c.loading ? "loading" : `${c.rows.length} suggestions`}</section>
}

function renderWith(ui: React.ReactElement, fallback: Record<string, unknown> = {}) {
  return render(<SWRConfig value={{ provider: () => new Map(), fallback, shouldRetryOnError: false }}>{ui}</SWRConfig>)
}
const persistedWeek = () => {
  const entries = JSON.parse(localStorage.getItem("hh-swr-dashboard-cache") ?? "[]") as [string, { items: WeekAgendaItem[] }][]
  return Object.fromEntries(entries)["week:v1:h1"]
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  svc.countHiddenCleaning.mockResolvedValue(0)
})

describe("useWeekAgenda", () => {
  it("dedupes: two consumers (RefinedWeek + DesktopTasks) cost ONE agenda read", async () => {
    svc.getWeekAgenda.mockResolvedValue(ok([task("t1", "Replace the furnace filter")]))

    renderWith(<><Agenda name="phone" /><Agenda name="desktop" /></>)

    expect(await screen.findAllByText("Replace the furnace filter")).toHaveLength(2)
    expect(svc.getWeekAgenda).toHaveBeenCalledTimes(1)
    expect(svc.getWeekAgenda).toHaveBeenCalledWith("h1", { days: TASKS_HORIZON_DAYS, refuseOfflineEmpty: true })
    // A non-empty agenda never pays for the hidden-cleaning count.
    expect(svc.countHiddenCleaning).not.toHaveBeenCalled()
    // …and the result is persisted for the next launch.
    expect(persistedWeek()).toEqual({ items: [task("t1", "Replace the furnace filter")], hiddenCleaning: 0 })
  })

  it("an empty agenda carries the hidden-cleaning count, counted once", async () => {
    svc.getWeekAgenda.mockResolvedValue(ok([]))
    svc.countHiddenCleaning.mockResolvedValue(3)

    renderWith(<><Agenda name="phone" /><Agenda name="desktop" /></>)

    await waitFor(() => expect(persistedWeek()).toEqual({ items: [], hiddenCleaning: 3 }))
    expect(svc.countHiddenCleaning).toHaveBeenCalledTimes(1)
  })

  it("a failed read is an error on every consumer — never an empty agenda, never persisted", async () => {
    svc.getWeekAgenda.mockResolvedValue({ data: null, error: { message: "Couldn't reach the server to load your tasks." } })

    renderWith(<><Agenda name="phone" /><Agenda name="desktop" /></>)

    expect(await screen.findAllByRole("alert")).toHaveLength(2)
    expect(svc.getWeekAgenda).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem("hh-swr-dashboard-cache")).toBeNull()
  })

  it("removeTask reaches every consumer and the persisted snapshot, without refetching", async () => {
    svc.getWeekAgenda.mockResolvedValue(ok([task("t1", "Replace the furnace filter"), task("t2", "Test the smoke alarms")]))
    renderWith(<><Agenda name="phone" exposeRemove /><Agenda name="desktop" /></>)
    expect(await screen.findAllByText("Replace the furnace filter")).toHaveLength(2)

    act(() => removeFromFirst("t1"))

    expect(screen.queryByText("Replace the furnace filter")).toBeNull() // gone from BOTH trees
    expect(screen.getAllByText("Test the smoke alarms")).toHaveLength(2)
    expect(persistedWeek()?.items.map((t) => t.taskInstanceId)).toEqual(["t2"])
    expect(svc.getWeekAgenda).toHaveBeenCalledTimes(1)
  })

  it("removing from a persisted snapshot the server hasn't confirmed yet asks for a fresh read", async () => {
    // Warm start: the snapshot is on screen and this session's read is in flight.
    // SWR discards a read that started before a local change, so without a new
    // one the page would keep a list the server never confirmed.
    svc.getWeekAgenda.mockReturnValueOnce(never()).mockResolvedValue(ok([task("t2", "Test the smoke alarms")]))
    renderWith(<Agenda name="phone" exposeRemove />, {
      "week:v1:h1": { items: [task("t1", "Replace the furnace filter"), task("t2", "Test the smoke alarms")], hiddenCleaning: 0 },
    })
    await waitFor(() => expect(svc.getWeekAgenda).toHaveBeenCalledTimes(1))

    act(() => removeFromFirst("t1"))

    expect(screen.queryByText("Replace the furnace filter")).toBeNull()
    await waitFor(() => expect(svc.getWeekAgenda).toHaveBeenCalledTimes(2))
    expect(await screen.findByText("Test the smoke alarms")).toBeInTheDocument()
  })
})

describe("useCareSuggestions", () => {
  it("dedupes: two consumers cost one read each of items, templates and the home doc", async () => {
    svc.getItemUnits.mockResolvedValue(ok([]))
    svc.getTaskTemplates.mockResolvedValue(ok([]))
    svc.getHomeProfile.mockResolvedValue(ok(null))

    renderWith(<><Suggestions name="phone" /><Suggestions name="desktop" /></>)

    expect(await screen.findAllByText("0 suggestions")).toHaveLength(2)
    expect(svc.getItemUnits).toHaveBeenCalledTimes(1)
    expect(svc.getTaskTemplates).toHaveBeenCalledTimes(1)
    expect(svc.getHomeProfile).toHaveBeenCalledTimes(1)
  })
})
