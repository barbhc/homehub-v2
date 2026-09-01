/**
 * /week — the digest's in-app destination.
 *
 * The failure path matters most here: this page is what a push tap lands on,
 * so "Couldn't load" must be VISIBLE with a retry, never a calm empty state
 * that reads as "nothing this week" while the fetch actually failed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render as rtlRender, screen, fireEvent, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"
import YourWeek from "./YourWeek"

// A fresh SWR cache per render: the page keys on homeId+mode, and without this
// test 2 would read test 1's cached week instead of its own mocked service.
const render = (ui: React.ReactElement) =>
  rtlRender(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>{ui}</SWRConfig>)

const getWeekReminders = vi.fn()
const listShoppingItems = vi.fn()
const addShoppingItem = vi.fn()

vi.mock("@/modules/home", () => ({ useCurrentHome: () => ({ home: { home_id: "h1" } }) }))
vi.mock("@/hooks/usePushMode", () => ({
  usePushMode: () => ({
    mode: "curated",
    prefs: { weekly_digest: { enabled: true, day: 0, hour: 17 } },
    loading: false,
    error: null,
  }),
}))
vi.mock("@/modules/care", () => ({
  getWeekReminders: (...a: unknown[]) => getWeekReminders(...a),
  listShoppingItems: (...a: unknown[]) => listShoppingItems(...a),
  addShoppingItem: (...a: unknown[]) => addShoppingItem(...a),
}))
vi.mock("react-router-dom", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => <a href={to} {...rest}>{children}</a>,
}))

const soon = new Date(); soon.setDate(soon.getDate() + 2)
const far = new Date(); far.setDate(far.getDate() + 20)
const iso = (d: Date) => d.toISOString().slice(0, 10)

const row = (over: Record<string, unknown> = {}) => ({
  taskInstanceId: "i1", taskTemplateId: "t1", title: "Replace the furnace filter", source: "appliance",
  priorityTier: "recommended", estimatedMinutes: 10, dueDate: iso(soon), isOverdue: false, pastDue: false,
  dueKind: "window", windowState: "open", duePhrase: "This week", safetyNote: null, trulyOverdue: false,
  itemUnitId: "u1", itemName: "Furnace", roomName: null, remindEnabled: true,
  supplies: [{ name: "Furnace filter", category: "filter", part_number: "FPR10", url: "https://filterbuy.com/x", size: "16x25x1", buy_ahead: true }],
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  listShoppingItems.mockResolvedValue({ data: [], error: null })
})

describe("YourWeek", () => {
  it("renders this week's reminders, a Buy first row with the retailer link, and coming-up", async () => {
    getWeekReminders.mockResolvedValue({
      data: { items: [row(), row({ taskInstanceId: "i2", title: "Descale the Nespresso", dueDate: iso(far), supplies: [] })], hiddenCount: 3 },
      error: null,
    })
    render(<YourWeek />)
    await waitFor(() => expect(screen.getAllByText("Replace the furnace filter").length).toBeGreaterThan(0))
    expect(screen.getByText("Buy first")).toBeInTheDocument()
    expect(screen.getByText("Furnace filter · 16x25x1")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /^Buy/ })).toHaveAttribute("href", "https://filterbuy.com/x")
    expect(screen.getByText("Coming up")).toBeInTheDocument()
    expect(screen.getByText("Descale the Nespresso")).toBeInTheDocument()
    // honesty footer: what the mode hid is countable, and it links to Tasks
    expect(screen.getByText(/3 more tasks in Tasks/)).toHaveAttribute("href", "/maintenance")
    expect(screen.getByText(/arrives Sundays at 5 PM/)).toBeInTheDocument()
  })

  it("'I have one' writes a have row for THIS instance and refreshes", async () => {
    getWeekReminders.mockResolvedValue({ data: { items: [row()], hiddenCount: 0 }, error: null })
    addShoppingItem.mockResolvedValue({ data: { id: "s1" }, error: null })
    render(<YourWeek />)
    await waitFor(() => expect(screen.getByText("Buy first")).toBeInTheDocument())
    fireEvent.click(screen.getByRole("button", { name: "I have one" }))
    await waitFor(() => expect(addShoppingItem).toHaveBeenCalledWith("h1", expect.objectContaining({
      name: "Furnace filter", supplyItemId: "t1", sourceTaskInstanceId: "i1", status: "have",
    })))
  })

  it("empty week is a calm invitation, not an error", async () => {
    getWeekReminders.mockResolvedValue({ data: { items: [], hiddenCount: 0 }, error: null })
    render(<YourWeek />)
    await waitFor(() => expect(screen.getAllByText("Nothing needs you this week.").length).toBeGreaterThan(0))
    expect(screen.getByRole("link", { name: "Your reminders" })).toHaveAttribute("href", "/settings#reminders")
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("a failed load is VISIBLE with a retry — never a false empty week", async () => {
    getWeekReminders.mockResolvedValueOnce({ data: null, error: { message: "network down" } })
    render(<YourWeek />)
    const alert = await screen.findAllByRole("alert")
    expect(alert[0]).toHaveTextContent("Couldn't load your week")
    expect(alert[0]).toHaveTextContent("network down")
    expect(screen.queryByText("Nothing needs you this week.")).not.toBeInTheDocument()

    getWeekReminders.mockResolvedValueOnce({ data: { items: [row()], hiddenCount: 0 }, error: null })
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    await waitFor(() => expect(screen.getAllByText("Replace the furnace filter").length).toBeGreaterThan(0))
  })
})
