/**
 * Codex review F5 — a task row on Tasks opens from the keyboard.
 *
 * The row's expansion hung on a plain <div> (a click handler on desktop,
 * pointer handlers on the phone): nothing in a closed row could take focus
 * except "Mark done", so a keyboard or switch user could complete a task but
 * never open it — Snooze, the supply line and the task's page were out of
 * reach. The row's text is now a real button, beside Mark done, never around
 * it. Both trees.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { SWRConfig } from "swr"
import { localToday } from "../../../shared/dates/calendar"

const svc = vi.hoisted(() => ({ getWeekAgenda: vi.fn() }))
vi.mock("@/modules/care", () => ({
  getWeekAgenda: (...a: unknown[]) => svc.getWeekAgenda(...a),
  markTaskInstanceDone: vi.fn(),
  snoozeTaskInstance: vi.fn(),
  unsnoozeTaskInstance: vi.fn(),
  previewNextDue: vi.fn(),
  getTaskDetail: vi.fn().mockResolvedValue({ data: null, error: null }),
}))
vi.mock("@/hooks/useCareSuggestions", () => ({
  useCareSuggestions: () => ({ rows: [], loading: false, error: null, add: vi.fn(), dismiss: vi.fn(), reload: vi.fn() }),
}))

const { DesktopTasks } = await import("./DesktopTasks")
const { RefinedWeek } = await import("./RefinedWeek")

const TITLE = "Replace the furnace filter"
const TASK = {
  taskInstanceId: "ti-1", taskTemplateId: "tt-1", title: TITLE, source: "maintenance", priorityTier: "essential",
  estimatedMinutes: 10, dueDate: localToday(), isOverdue: false, pastDue: false, dueKind: "window",
  windowState: "open", duePhrase: "Good to do now", safetyNote: null, trulyOverdue: false,
  itemUnitId: null, itemName: "Furnace", roomName: null,
}

const TREES = [
  ["phone", "phone-task-row", () => <RefinedWeek homeId="h1" />],
  ["desktop", "desktop-task-row", () => <DesktopTasks homeId="h1" />],
] as const

async function mount(tree: () => React.ReactElement, testId: string) {
  render(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <MemoryRouter>{tree()}</MemoryRouter>
    </SWRConfig>,
  )
  await screen.findByText(TITLE)
  return screen.getByTestId(testId)
}
/** The row's own button: the one that says whether the row is open. */
const rowButton = (row: HTMLElement) => within(row).getByRole("button", { expanded: false })

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  svc.getWeekAgenda.mockResolvedValue({ data: [TASK], error: null, withheld: { beyondHorizon: 0, nextDueDate: null, itemCleaning: 0 } })
})

describe.each(TREES)("Tasks row, %s", (_name, testId, tree) => {
  it("is a real button that names the task and says it is closed", async () => {
    const row = await mount(tree, testId)
    const button = rowButton(row)
    expect(button.tagName).toBe("BUTTON")
    expect(button).toHaveAttribute("type", "button")
    expect(button).toHaveAccessibleName(expect.stringContaining(TITLE))
    expect(button).toHaveAttribute("aria-expanded", "false")
  })

  it("Tab reaches it after Mark done, and Enter opens the row", async () => {
    const user = userEvent.setup()
    const row = await mount(tree, testId)
    const markDone = within(row).getByRole("button", { name: "Mark done" })
    const button = rowButton(row)

    markDone.focus()
    await user.tab()
    expect(button).toHaveFocus()

    await user.keyboard("{Enter}")
    expect(button).toHaveAttribute("aria-expanded", "true")
    // What was out of reach: the row's actions, and the way to the task's page.
    expect(await within(row).findByRole("button", { name: /^snooze$/i })).toBeInTheDocument()
    expect(within(row).getByRole("button", { name: `Open ${TITLE}` })).toBeInTheDocument()
  })

  it("Space opens it too, and pressing again closes it", async () => {
    const user = userEvent.setup()
    const row = await mount(tree, testId)
    const button = rowButton(row)
    button.focus()

    await user.keyboard(" ")
    expect(button).toHaveAttribute("aria-expanded", "true")
    await user.keyboard(" ")
    expect(button).toHaveAttribute("aria-expanded", "false")
    expect(within(row).queryByRole("button", { name: /^snooze$/i })).toBeNull()
  })

  it("nests no control inside another — closed or open", async () => {
    const row = await mount(tree, testId)
    const nested = () => row.querySelectorAll("button button, button a, a button, a a, button [role=button]")
    expect(nested()).toHaveLength(0)
    expect(rowButton(row).contains(within(row).getByRole("button", { name: "Mark done" }))).toBe(false)

    fireEvent.click(rowButton(row))
    await within(row).findByRole("button", { name: /^snooze$/i })
    expect(nested()).toHaveLength(0)
  })
})

describe("Tasks row, phone — a tap still opens it once", () => {
  it("the pointer tap toggles, and the click the browser sends after it does not toggle again", async () => {
    const row = await mount(TREES[0][2], "phone-task-row")
    const button = rowButton(row)

    // A finger tap: pointer down and up with no movement, then the click.
    fireEvent.pointerDown(button, { clientX: 100, pointerId: 1 })
    fireEvent.pointerUp(button, { clientX: 100, pointerId: 1 })
    fireEvent.click(button, { detail: 1 })

    expect(button).toHaveAttribute("aria-expanded", "true")
  })

  it("a swipe does not also open the row", async () => {
    const row = await mount(TREES[0][2], "phone-task-row")
    const button = rowButton(row)

    fireEvent.pointerDown(button, { clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(button, { clientX: 130, pointerId: 1 })
    fireEvent.pointerUp(button, { clientX: 130, pointerId: 1 })
    fireEvent.click(button, { detail: 1 })

    expect(button).toHaveAttribute("aria-expanded", "false")
  })
})
