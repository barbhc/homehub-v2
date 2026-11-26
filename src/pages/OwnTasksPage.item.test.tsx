/**
 * "Add Your Own Task" from an item page (seventeen fixes, mock m4): the form
 * opens with that item picked, and the task it saves lives on the item.
 *
 * Quoted: "Add Your Own Task opens the form with this item picked. The saved
 * task shows on the item's page." (The second half is proven against the
 * emulator in e2e/emu/item-own-task.spec.ts.)
 *
 * `?item=` is URL input: an id that doesn't look like one is ignored, and one
 * that isn't this home's item reads as no item. A failed read is said — the
 * form never quietly becomes a whole-home form for a task meant for an item.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"

const m = vi.hoisted(() => ({
  getRoutineTemplates: vi.fn(),
  saveRoutineTask: vi.fn(),
  deleteRoutineTask: vi.fn(),
  addCustomHomeTask: vi.fn(),
  getItemUnit: vi.fn(),
}))

vi.mock("@/modules/home", () => ({ useCurrentHome: () => ({ home: { home_id: "home-1", name: "Test Home" } }) }))
vi.mock("@/lib/cleanSession", () => ({
  getRoutineTemplates: (...a: unknown[]) => m.getRoutineTemplates(...a),
  saveRoutineTask: (...a: unknown[]) => m.saveRoutineTask(...a),
  deleteRoutineTask: (...a: unknown[]) => m.deleteRoutineTask(...a),
}))
vi.mock("@/modules/care", () => ({ addCustomHomeTask: (...a: unknown[]) => m.addCustomHomeTask(...a) }))
vi.mock("@/modules/items/services/itemService", () => ({ getItemUnit: (...a: unknown[]) => m.getItemUnit(...a) }))

const { default: OwnTasksPage } = await import("./OwnTasksPage")
const { readItemParam } = await import("@/lib/itemParam")

const renderAt = (url: string) => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes><Route path="/maintenance/custom" element={<OwnTasksPage />} /></Routes>
  </MemoryRouter>,
)

beforeEach(() => {
  vi.clearAllMocks()
  m.getRoutineTemplates.mockResolvedValue([])
  m.addCustomHomeTask.mockResolvedValue({ data: { task_template_id: "t1" }, error: null })
  m.getItemUnit.mockResolvedValue({ data: { item_unit_id: "item-7", display_name: "Kitchen faucet" }, error: null })
})

describe("readItemParam", () => {
  it.each([
    ["item-7", "item-7"],
    ["AbC_123", "AbC_123"],
    [null, null],
    ["", null],
    ["../homes/x", null],
    ["a/b", null],
    ["a b", null],
    ["x".repeat(129), null],
  ])("%s → %s", (raw, out) => {
    expect(readItemParam(raw)).toBe(out)
  })
})

describe("/maintenance/custom?item=", () => {
  it("opens with the item picked, asks no 'Shows in', and saves the task ON that item", async () => {
    renderAt("/maintenance/custom?item=item-7")
    expect(await screen.findByTestId("own-task-for-item")).toHaveTextContent("For Kitchen faucet")
    expect(m.getItemUnit).toHaveBeenCalledWith("home-1", "item-7")
    expect(screen.queryByRole("radiogroup", { name: "Shows in" })).toBeNull()
    // Back goes to the item it came from.
    expect(screen.getByRole("link", { name: "Kitchen faucet" })).toHaveAttribute("href", "/inventory/item-7")
    fireEvent.change(screen.getByLabelText("Task name"), { target: { value: "Clean the aerator" } })
    fireEvent.click(screen.getByRole("button", { name: "Add task" }))
    await waitFor(() => expect(m.addCustomHomeTask).toHaveBeenCalledWith("home-1", "Clean the aerator", "weekly", null, null, "item-7"))
    const status = await screen.findByRole("status")
    expect(status).toHaveTextContent("Added Clean the aerator to Kitchen faucet.")
    expect(screen.getByRole("link", { name: "See it there" })).toHaveAttribute("href", "/inventory/item-7")
  })

  it("Whole home instead drops the item; the usual form comes back", async () => {
    renderAt("/maintenance/custom?item=item-7")
    fireEvent.click(await screen.findByRole("button", { name: "Whole home instead" }))
    expect(await screen.findByRole("radiogroup", { name: "Shows in" })).toBeInTheDocument()
    expect(screen.queryByTestId("own-task-for-item")).toBeNull()
  })

  it("an id that doesn't look like one is never read: the usual whole-home form", async () => {
    renderAt("/maintenance/custom?item=..%2Fhomes%2Fx")
    expect(await screen.findByRole("radiogroup", { name: "Shows in" })).toBeInTheDocument()
    expect(m.getItemUnit).not.toHaveBeenCalled()
  })

  it("an item that isn't this home's reads as no item", async () => {
    m.getItemUnit.mockResolvedValue({ data: null, error: null })
    renderAt("/maintenance/custom?item=other-home-item")
    expect(await screen.findByRole("radiogroup", { name: "Shows in" })).toBeInTheDocument()
    expect(screen.queryByTestId("own-task-for-item")).toBeNull()
  })

  it("a failed read of the item is said, with Try again — never a whole-home form in its place", async () => {
    m.getItemUnit.mockResolvedValueOnce({ data: null, error: { message: "offline" } })
    renderAt("/maintenance/custom?item=item-7")
    expect(await screen.findByText("Couldn't load that item")).toBeInTheDocument()
    expect(screen.queryByLabelText("Task name")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /try again/i }))
    expect(await screen.findByTestId("own-task-for-item")).toHaveTextContent("Kitchen faucet")
  })

  it("a failed add keeps what was typed and says so", async () => {
    m.addCustomHomeTask.mockResolvedValue({ data: null, error: { message: "offline" } })
    renderAt("/maintenance/custom?item=item-7")
    await screen.findByTestId("own-task-for-item")
    fireEvent.change(screen.getByLabelText("Task name"), { target: { value: "Clean the aerator" } })
    fireEvent.click(screen.getByRole("button", { name: "Add task" }))
    expect(await screen.findByText("Couldn't add that task. Check your connection and try again.")).toBeInTheDocument()
    expect(screen.getByLabelText("Task name")).toHaveValue("Clean the aerator")
  })
})
