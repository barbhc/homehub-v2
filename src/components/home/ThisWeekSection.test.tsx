/**
 * Home · "This week at home" — Option 2.
 *
 * Pinned: rows complete in place through Home's own handler; the Buy-first
 * strip rides at the end of the same card; an unticked (mode-hidden) task
 * never appears (the lens is upstream, so the section renders exactly what
 * it is given); and a failed load is VISIBLE — never a calm "nothing this
 * week" over a broken fetch.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render as rtlRender, screen, fireEvent, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"
import { ThisWeekSection } from "./ThisWeekSection"

const getWeekReminders = vi.fn()
const listShoppingItems = vi.fn()
const addShoppingItem = vi.fn()
const navigate = vi.fn()
vi.mock("@/modules/care", () => ({
  getWeekReminders: (...a: unknown[]) => getWeekReminders(...a),
  listShoppingItems: (...a: unknown[]) => listShoppingItems(...a),
  addShoppingItem: (...a: unknown[]) => addShoppingItem(...a),
}))
vi.mock("@/hooks/usePushMode", () => ({ usePushMode: () => ({ mode: "curated", prefs: {}, loading: false, error: null }) }))
vi.mock("react-router-dom", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => <a href={to} {...rest}>{children}</a>,
  useNavigate: () => navigate,
}))

const render = (ui: React.ReactElement) =>
  rtlRender(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>{ui}</SWRConfig>)

const soon = new Date(); soon.setDate(soon.getDate() + 2)
const iso = (d: Date) => d.toISOString().slice(0, 10)
const row = (over: Record<string, unknown> = {}) => ({
  taskInstanceId: "i1", taskTemplateId: "t1", title: "Replace the furnace filter", source: "appliance", priorityTier: "essential",
  estimatedMinutes: 10, dueDate: iso(soon), duePhrase: "This week", itemUnitId: "u1", itemName: "Furnace", roomName: null, remindEnabled: true,
  supplies: [{ name: "Furnace filter", category: "filter", part_number: null, url: "https://filterbuy.com/x", size: "16x25x1", buy_ahead: true }],
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  listShoppingItems.mockResolvedValue({ data: [], error: null })
})

describe("ThisWeekSection", () => {
  it("renders the week as a checklist with the Buy-first strip in the same card", async () => {
    getWeekReminders.mockResolvedValue({ data: { items: [row(), row({ taskInstanceId: "i2", title: "Test smoke alarms", supplies: [] })], hiddenCount: 0 }, error: null })
    const onComplete = vi.fn()
    render(<ThisWeekSection homeId="h1" completingId={null} onComplete={onComplete} />)
    await waitFor(() => expect(screen.getByText("Replace the furnace filter")).toBeInTheDocument())
    expect(screen.getByText("This week at home")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "2 this week" })).toHaveAttribute("href", "/week")
    expect(screen.getByText("Buy first: Furnace filter · 16x25x1")).toBeInTheDocument()
    expect(screen.getByText("Your link: filterbuy.com")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: 'Mark "Test smoke alarms" done' }))
    expect(onComplete).toHaveBeenCalledWith("i2")
  })

  it("'Have one' writes a have row keyed to the instance", async () => {
    getWeekReminders.mockResolvedValue({ data: { items: [row()], hiddenCount: 0 }, error: null })
    addShoppingItem.mockResolvedValue({ data: { id: "s1" }, error: null })
    render(<ThisWeekSection homeId="h1" completingId={null} onComplete={vi.fn()} />)
    fireEvent.click(await screen.findByRole("button", { name: "I have one — Furnace filter" }))
    await waitFor(() => expect(addShoppingItem).toHaveBeenCalledWith("h1", expect.objectContaining({ sourceTaskInstanceId: "i1", status: "have" })))
  })

  it("hides what the hero already lists, and says so — the same task never appears twice", async () => {
    getWeekReminders.mockResolvedValue({ data: { items: [row(), row({ taskInstanceId: "i2", title: "Test smoke alarms", supplies: [] })], hiddenCount: 0 }, error: null })
    render(<ThisWeekSection homeId="h1" completingId={null} onComplete={vi.fn()} excludeInstanceIds={["i1"]} />)
    await screen.findByText("Test smoke alarms")
    expect(screen.queryByText("Replace the furnace filter")).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "2 this week" })).toBeInTheDocument()
    // buy-first still counts the hero's task — the part is needed regardless of where the row sits
    expect(screen.getByText("Buy first: Furnace filter · 16x25x1")).toBeInTheDocument()
  })

  it("when the hero already has the whole week, it says so instead of repeating it", async () => {
    getWeekReminders.mockResolvedValue({ data: { items: [row({ supplies: [] })], hiddenCount: 0 }, error: null })
    render(<ThisWeekSection homeId="h1" completingId={null} onComplete={vi.fn()} excludeInstanceIds={["i1"]} />)
    await screen.findByText("Everything for this week is up top.")
    expect(screen.queryByText("Nothing needs you this week.")).not.toBeInTheDocument()
  })

  it("an empty week is a calm invitation to Your reminders", async () => {
    getWeekReminders.mockResolvedValue({ data: { items: [], hiddenCount: 4 }, error: null })
    render(<ThisWeekSection homeId="h1" completingId={null} onComplete={vi.fn()} />)
    await screen.findByText("Nothing needs you this week.")
    expect(screen.getByRole("link", { name: "Your reminders" })).toHaveAttribute("href", "/reminders")
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("a failed fetch is a VISIBLE error with retry — never a false 'nothing this week'", async () => {
    getWeekReminders.mockResolvedValueOnce({ data: null, error: { message: "offline" } })
    render(<ThisWeekSection homeId="h1" completingId={null} onComplete={vi.fn()} />)
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("Couldn't load this week")
    expect(alert).toHaveTextContent("offline")
    expect(screen.queryByText("Nothing needs you this week.")).not.toBeInTheDocument()
    getWeekReminders.mockResolvedValueOnce({ data: { items: [row()], hiddenCount: 0 }, error: null })
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    await waitFor(() => expect(screen.getByText("Replace the furnace filter")).toBeInTheDocument())
  })
})
