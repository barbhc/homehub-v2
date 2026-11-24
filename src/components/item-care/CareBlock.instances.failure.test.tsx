/**
 * Codex review F8 — the item page's Upkeep, when its occurrences cannot be read.
 *
 * A row's due phrase and its Mark done / Snooze come from the task's open
 * occurrence, which CareBlock reads for itself. A failed read was treated as
 * "no occurrences": the dates and the buttons simply were not there, with
 * nothing said — an item whose upkeep looked unscheduled. The failure is now
 * said above the rows, with Try again.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { ItemUnit } from "@/integrations/types"
import { addDays, localToday } from "../../../shared/dates/calendar"

const care = vi.hoisted(() => ({ getTaskInstances: vi.fn() }))
vi.mock("@/modules/care", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getTaskInstances: (...a: unknown[]) => care.getTaskInstances(...a),
  markTaskInstanceDone: vi.fn(),
  snoozeTaskInstance: vi.fn(),
  unsnoozeTaskInstance: vi.fn(),
  previewNextDue: vi.fn(),
}))
vi.mock("@/pages/item-detail/useSetupCompletion", () => ({
  useSetupCompletion: () => ({ done: new Set<string>(), toggle: vi.fn(), allDone: false }),
}))

const { CareBlock } = await import("./CareBlock")

const item = { item_unit_id: "i1", display_name: "LG dryer" } as ItemUnit
const TASK = {
  task_template_id: "t1", title: "Clean the vent duct", care_type: "maintenance", scope_type: "item_unit", item_unit_id: "i1",
  priority_tier: "essential", risk_level: "safety", estimated_minutes: 30, is_active: true, deleted_at: null,
  next_due_date: addDays(localToday(), 3), schedule_rule: [{ schedule_type: "monthly", interval_days: null }],
}
const OPEN = { task_instance_id: "ti-1", task_template_id: "t1", due_date: addDays(localToday(), 3), status: "scheduled" }
const FAILED = { data: null, error: { message: "unavailable" } }
const answer = (open: unknown[]) => (_h: string, opts: { status?: string[] }) =>
  Promise.resolve({ data: opts.status?.includes("done") ? [] : open, error: null })
const MESSAGE = "Couldn't load this item's due dates."

const block = (tasks: unknown[]) => (
  <MemoryRouter>
    <CareBlock item={item} homeId="h1" tasks={tasks as never} chunks={[]} hasManual notificationsBlocked={false} onAddManual={vi.fn()} />
  </MemoryRouter>
)
const renderBlock = () => render(block([TASK]))
/** Open the (first) row; its actions, or null when it has none. */
async function rowActions() {
  await screen.findByText("Clean the vent duct")
  fireEvent.click(screen.getAllByRole("button", { name: /See how/i })[0])
  return screen.queryByTestId("row-actions")
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

describe("CareBlock — the occurrence read fails", () => {
  it("a read answered with an error says so above the rows, with Try again", async () => {
    care.getTaskInstances.mockResolvedValue(FAILED)
    renderBlock()

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent(MESSAGE)
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeInTheDocument()
    // The task itself is still listed: only its dates are in question.
    expect(screen.getByText("Clean the vent duct")).toBeInTheDocument()
  })

  it("a read that rejects says the same", async () => {
    care.getTaskInstances.mockRejectedValue(new Error("network"))
    renderBlock()
    expect(await screen.findByRole("alert")).toHaveTextContent(MESSAGE)
  })

  it("only ONE of the two reads failing is still a failure", async () => {
    care.getTaskInstances.mockImplementation((_h: string, opts: { status?: string[] }) =>
      Promise.resolve(opts.status?.includes("done") ? FAILED : { data: [OPEN], error: null }))
    renderBlock()
    expect(await screen.findByRole("alert")).toHaveTextContent(MESSAGE)
  })

  it("Try again reads again; the message goes and the row gets its actions back", async () => {
    care.getTaskInstances.mockResolvedValueOnce(FAILED).mockResolvedValueOnce(FAILED)
    renderBlock()
    const alert = await screen.findByRole("alert")

    care.getTaskInstances.mockImplementation(answer([OPEN]))
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }))

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull())
    expect(care.getTaskInstances).toHaveBeenCalledTimes(4)
    const actions = await rowActions()
    expect(actions).not.toBeNull()
    expect(within(actions!).getByRole("button", { name: "Mark done" })).toBeInTheDocument()
  })

  it("without the read, the row has no actions at all — which is why it has to be said", async () => {
    care.getTaskInstances.mockResolvedValue(FAILED)
    renderBlock()
    await screen.findByRole("alert")
    expect(await rowActions()).toBeNull()
  })

  it("a refresh that fails after a good read keeps what it had, and says so", async () => {
    care.getTaskInstances.mockImplementation(answer([OPEN]))
    const view = renderBlock()
    await waitFor(() => expect(care.getTaskInstances).toHaveBeenCalledTimes(2))
    expect(await rowActions()).not.toBeNull()
    expect(screen.queryByRole("alert")).toBeNull()

    // The task set changes (a re-read of the manual landed) and the refetch fails.
    care.getTaskInstances.mockResolvedValue(FAILED)
    view.rerender(block([TASK, { ...TASK, task_template_id: "t2", title: "Clean the lint screen housing" }]))

    expect(await screen.findByRole("alert")).toHaveTextContent(MESSAGE)
    // The first row keeps the occurrence it already had: its actions stay.
    expect(screen.getByTestId("row-actions")).toBeInTheDocument()
  })

  it("a good read shows no message", async () => {
    care.getTaskInstances.mockImplementation(answer([OPEN]))
    renderBlock()
    await screen.findByText("Clean the vent duct")
    await waitFor(() => expect(care.getTaskInstances).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole("alert")).toBeNull()
  })
})
