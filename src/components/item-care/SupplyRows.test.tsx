/**
 * SupplyRows — the part inside its task (Item Option B).
 *
 * The write paths matter most: a toggle must persist through the transactional
 * writer, a REJECTED write must roll the toggle back and say so, and "I have
 * one" must key its shopping row to the coming instance.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { SupplyRows } from "./SupplyRows"

const updateTaskSupply = vi.fn()
const addTaskSupply = vi.fn()
const addShoppingItem = vi.fn()
const removeShoppingItem = vi.fn()
vi.mock("@/modules/care", () => ({
  updateTaskSupply: (...a: unknown[]) => updateTaskSupply(...a),
  addTaskSupply: (...a: unknown[]) => addTaskSupply(...a),
  addShoppingItem: (...a: unknown[]) => addShoppingItem(...a),
  removeShoppingItem: (...a: unknown[]) => removeShoppingItem(...a),
}))

const filter = { name: "Furnace filter", category: "filter", part_number: "FPR10", url: "https://filterbuy.com/x", size: "16x25x1", buy_ahead: false }

beforeEach(() => {
  vi.clearAllMocks()
  updateTaskSupply.mockResolvedValue({ data: filter, error: null })
})

describe("SupplyRows", () => {
  it("renders the part with its size, retailer domain and a plain Buy link", () => {
    render(<SupplyRows homeId="h1" taskTemplateId="t1" supplies={[filter]} nextInstanceId="i1" />)
    expect(screen.getByText("Furnace filter")).toBeInTheDocument()
    expect(screen.getByText(/16x25x1 · filterbuy.com · FPR10/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /^Buy/ })).toHaveAttribute("href", "https://filterbuy.com/x")
  })

  it("the buy-ahead toggle writes through the transactional patch", async () => {
    render(<SupplyRows homeId="h1" taskTemplateId="t1" supplies={[filter]} nextInstanceId="i1" />)
    fireEvent.click(screen.getByLabelText("Remind me to buy the next Furnace filter"))
    await waitFor(() => expect(updateTaskSupply).toHaveBeenCalledWith("h1", "t1", 0, { buy_ahead: true }))
    expect(screen.getByLabelText("Remind me to buy the next Furnace filter")).toBeChecked()
  })

  it("a rejected write rolls the toggle back and says so", async () => {
    updateTaskSupply.mockResolvedValueOnce({ data: null, error: { message: "permission denied" } })
    render(<SupplyRows homeId="h1" taskTemplateId="t1" supplies={[filter]} nextInstanceId="i1" />)
    fireEvent.click(screen.getByLabelText("Remind me to buy the next Furnace filter"))
    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("permission denied")
    expect(screen.getByLabelText("Remind me to buy the next Furnace filter")).not.toBeChecked()
  })

  it("'I have one' writes a have row keyed to the coming instance, and Undo removes it", async () => {
    addShoppingItem.mockResolvedValue({ data: { id: "s9" }, error: null })
    removeShoppingItem.mockResolvedValue({ data: true, error: null })
    render(<SupplyRows homeId="h1" taskTemplateId="t1" supplies={[{ ...filter, buy_ahead: true }]} nextInstanceId="i1" />)
    fireEvent.click(screen.getByRole("button", { name: "I have one — Furnace filter" }))
    await waitFor(() => expect(addShoppingItem).toHaveBeenCalledWith("h1", { name: "Furnace filter", supplyItemId: "t1", sourceTaskInstanceId: "i1", status: "have" }))
    expect(await screen.findByText(/Skipping this cycle/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Undo" }))
    await waitFor(() => expect(removeShoppingItem).toHaveBeenCalledWith("h1", "s9"))
  })

  it("saving a link records it and shows the retailer", async () => {
    const noLink = { ...filter, url: null, size: null }
    updateTaskSupply.mockResolvedValue({ data: { ...noLink, url: "https://homedepot.com/p/1" }, error: null })
    const onChange = vi.fn()
    render(<SupplyRows homeId="h1" taskTemplateId="t1" supplies={[noLink]} nextInstanceId={null} onChange={onChange} />)
    fireEvent.click(screen.getByRole("button", { name: "Add link for Furnace filter" }))
    fireEvent.change(screen.getByLabelText("Link for Furnace filter"), { target: { value: "https://homedepot.com/p/1" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(updateTaskSupply).toHaveBeenCalledWith("h1", "t1", 0, { url: "https://homedepot.com/p/1", size: null }))
    expect(await screen.findByRole("link", { name: /^Buy/ })).toHaveAttribute("href", "https://homedepot.com/p/1")
    expect(onChange).toHaveBeenCalled()
  })

  it("'Add a part' appends through addTaskSupply with buy-ahead on", async () => {
    addTaskSupply.mockResolvedValue({ data: { index: 0, supply: { name: "Belt", category: "other", part_number: null, url: null, size: null, buy_ahead: true } }, error: null })
    render(<SupplyRows homeId="h1" taskTemplateId="t1" supplies={[]} nextInstanceId={null} />)
    fireEvent.click(screen.getByRole("button", { name: "Add a part" }))
    fireEvent.change(screen.getByLabelText("Part name"), { target: { value: "Belt" } })
    fireEvent.click(screen.getByRole("button", { name: "Save part" }))
    await waitFor(() => expect(addTaskSupply).toHaveBeenCalledWith("h1", "t1", { name: "Belt", url: null, size: null, buy_ahead: true }))
    expect(await screen.findByText("Belt")).toBeInTheDocument()
  })
})
