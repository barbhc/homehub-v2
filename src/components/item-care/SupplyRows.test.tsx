/**
 * The part card — the part inside its task (Item Option B), redesigned
 * 2026-09-27 from the "Homehub Spares & Notes" canvas: facts as pills, the
 * place editable in one tap, Buy as a button, the rest behind the pencil.
 *
 * The write paths matter most: every edit persists through the transactional
 * writer, a REJECTED write rolls back and says so, and "I have one" keys its
 * shopping row to the coming instance.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react"
import { SupplyRows } from "./SupplyRows"
import type { TemplateSupply } from "@/integrations/types"

const updateTaskSupply = vi.fn()
const addTaskSupply = vi.fn()
const addShoppingItem = vi.fn()
const removeShoppingItem = vi.fn()
const getSupplyPlaces = vi.fn()
vi.mock("@/modules/care", () => ({
  updateTaskSupply: (...a: unknown[]) => updateTaskSupply(...a),
  addTaskSupply: (...a: unknown[]) => addTaskSupply(...a),
  addShoppingItem: (...a: unknown[]) => addShoppingItem(...a),
  removeShoppingItem: (...a: unknown[]) => removeShoppingItem(...a),
  getSupplyPlaces: (...a: unknown[]) => getSupplyPlaces(...a),
}))

const filter: TemplateSupply = {
  name: "Furnace filter", category: "filter", part_number: "FPR10", url: "https://filterbuy.com/x",
  size: "16x25x1", location: null, buy_ahead: false,
}
const card = (supplies: TemplateSupply[], nextInstanceId: string | null = "i1", onChange?: () => void) =>
  render(<SupplyRows homeId="h1" taskTemplateId="t1" supplies={supplies} nextInstanceId={nextInstanceId} onChange={onChange} />)

beforeEach(() => {
  vi.clearAllMocks()
  updateTaskSupply.mockResolvedValue({ data: filter, error: null })
  getSupplyPlaces.mockResolvedValue({ data: ["Hall closet", "Laundry room"], error: null })
})

describe("the part card — reading it", () => {
  it("names the part, shows its facts as pills and Buy as a button with the store", () => {
    card([filter])
    expect(screen.getByText("Furnace filter")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Size 16x25x1/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Part number FPR10/ })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Buy at filterbuy.com" })).toHaveAttribute("href", "https://filterbuy.com/x")
    // The old run-on line of grey text is gone.
    expect(screen.queryByText(/16x25x1 · filterbuy.com · FPR10/)).toBeNull()
  })

  it("with a place, the place is the teal pill; without one, a dashed pill invites it", () => {
    const { unmount } = card([{ ...filter, location: "Hall closet, top shelf" }])
    expect(screen.getByRole("button", { name: /^Kept in Hall closet, top shelf/ })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Where do you keep it?" })).toBeNull()
    unmount()
    card([filter])
    expect(screen.getByRole("button", { name: "Where do you keep it?" })).toBeInTheDocument()
  })

  it("a part with only a name still reads as a card: no empty pills, no Buy", () => {
    card([{ ...filter, part_number: null, url: null, size: null }])
    expect(screen.queryByRole("link", { name: /^Buy/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /^Size/ })).toBeNull()
    expect(screen.getByRole("button", { name: "Where do you keep it?" })).toBeInTheDocument()
  })
})

describe("the part card — where the spare is kept", () => {
  it("one tap opens just that field, with the places this home already uses", async () => {
    card([filter])
    fireEvent.click(screen.getByRole("button", { name: "Where do you keep it?" }))
    expect(screen.getByLabelText("Where you keep Furnace filter")).toHaveFocus()
    expect(getSupplyPlaces).toHaveBeenCalledWith("h1")
    expect(await screen.findByRole("button", { name: "Hall closet" })).toBeInTheDocument()
    // Only the place field — not the whole form.
    expect(screen.queryByLabelText("Store link for Furnace filter")).toBeNull()
  })

  it("a chip fills the field; Save writes only the place and the pill shows it", async () => {
    const onChange = vi.fn()
    card([filter], "i1", onChange)
    fireEvent.click(screen.getByRole("button", { name: "Where do you keep it?" }))
    fireEvent.click(await screen.findByRole("button", { name: "Hall closet" }))
    fireEvent.change(screen.getByLabelText("Where you keep Furnace filter"), { target: { value: "Hall closet, top shelf" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(updateTaskSupply).toHaveBeenCalledWith("h1", "t1", 0, { location: "Hall closet, top shelf" }))
    expect(await screen.findByRole("button", { name: /^Kept in Hall closet, top shelf/ })).toBeInTheDocument()
    expect(onChange).toHaveBeenCalled()
  })

  it("clearing the field saves null and the invitation comes back", async () => {
    card([{ ...filter, location: "Garage" }])
    fireEvent.click(screen.getByRole("button", { name: /^Kept in Garage/ }))
    fireEvent.change(screen.getByLabelText("Where you keep Furnace filter"), { target: { value: "  " } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(updateTaskSupply).toHaveBeenCalledWith("h1", "t1", 0, { location: null }))
    expect(await screen.findByRole("button", { name: "Where do you keep it?" })).toBeInTheDocument()
  })

  it("a rejected place write rolls back, says so, and the card shows what was saved before", async () => {
    updateTaskSupply.mockResolvedValueOnce({ data: null, error: { message: "permission denied" } })
    card([filter])
    fireEvent.click(screen.getByRole("button", { name: "Where do you keep it?" }))
    fireEvent.change(screen.getByLabelText("Where you keep Furnace filter"), { target: { value: "Garage" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("permission denied")
    // The editor stays open with what was typed; the pill never claimed "Garage".
    expect(screen.getByLabelText("Where you keep Furnace filter")).toHaveValue("Garage")
    expect(screen.queryByRole("button", { name: /^Kept in Garage/ })).toBeNull()
  })

  it("a failed places lookup leaves the field working, with no chips", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    getSupplyPlaces.mockResolvedValueOnce({ data: null, error: { message: "offline" } })
    card([filter])
    fireEvent.click(screen.getByRole("button", { name: "Where do you keep it?" }))
    await waitFor(() => expect(warn).toHaveBeenCalled())
    expect(screen.queryByText("Places you've used")).toBeNull()
    expect(screen.getByLabelText("Where you keep Furnace filter")).toBeEnabled()
    warn.mockRestore()
  })
})

describe("the part card — the pencil and the footer", () => {
  it("the pencil opens every field, labelled; one save carries name, size, place and link", async () => {
    const vague = { ...filter, name: "Field-supplied return air filter (e.g. 16×25 or 20×25)", url: null, size: null, part_number: null }
    updateTaskSupply.mockResolvedValue({ data: null, error: null })
    card([vague])
    fireEvent.click(screen.getByRole("button", { name: `Edit ${vague.name}` }))
    expect(screen.getByText("Store link")).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(`Part name for ${vague.name}`), { target: { value: "16×25×1 MERV 8 filter" } })
    fireEvent.change(screen.getByLabelText(`Size for ${vague.name}`), { target: { value: "16x25x1" } })
    fireEvent.change(screen.getByLabelText(`Where you keep it for ${vague.name}`), { target: { value: "Hall closet" } })
    fireEvent.change(screen.getByLabelText(`Store link for ${vague.name}`), { target: { value: "https://homedepot.com/p/1" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(updateTaskSupply).toHaveBeenCalledWith("h1", "t1", 0, {
      name: "16×25×1 MERV 8 filter", size: "16x25x1", location: "Hall closet", url: "https://homedepot.com/p/1",
    }))
    expect(await screen.findByText("16×25×1 MERV 8 filter")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Buy at homedepot.com" })).toBeInTheDocument()
    expect(screen.queryByText(vague.name)).toBeNull()
  })

  it("the buy-ahead switch writes through the transactional patch", async () => {
    card([filter])
    const sw = screen.getByRole("switch", { name: "Remind me to buy the next Furnace filter" })
    expect(sw).not.toBeChecked()
    fireEvent.click(sw)
    await waitFor(() => expect(updateTaskSupply).toHaveBeenCalledWith("h1", "t1", 0, { buy_ahead: true }))
    expect(sw).toBeChecked()
  })

  it("a rejected switch write rolls back and says so", async () => {
    updateTaskSupply.mockResolvedValueOnce({ data: null, error: { message: "permission denied" } })
    card([filter])
    const sw = screen.getByRole("switch", { name: "Remind me to buy the next Furnace filter" })
    fireEvent.click(sw)
    expect(await screen.findByRole("alert")).toHaveTextContent("permission denied")
    expect(sw).not.toBeChecked()
  })

  it("'I have one' writes a have row keyed to the coming instance, and Undo removes it", async () => {
    addShoppingItem.mockResolvedValue({ data: { id: "s9" }, error: null })
    removeShoppingItem.mockResolvedValue({ data: true, error: null })
    card([{ ...filter, buy_ahead: true }])
    fireEvent.click(screen.getByRole("button", { name: "I have one — Furnace filter" }))
    await waitFor(() => expect(addShoppingItem).toHaveBeenCalledWith("h1", { name: "Furnace filter", supplyItemId: "t1", sourceTaskInstanceId: "i1", status: "have" }))
    expect(await screen.findByText(/Skipping this cycle/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Undo" }))
    await waitFor(() => expect(removeShoppingItem).toHaveBeenCalledWith("h1", "s9"))
  })

  it("'Add a part' has labelled fields and appends through addTaskSupply with buy-ahead on", async () => {
    addTaskSupply.mockResolvedValue({ data: { index: 0, supply: { name: "Belt", category: "other", part_number: null, url: null, size: null, location: "Garage", buy_ahead: true } }, error: null })
    card([], null)
    fireEvent.click(screen.getByRole("button", { name: "Add a part" }))
    const form = screen.getByText("Part").closest("div")!.parentElement!
    fireEvent.change(within(form).getByLabelText("Part"), { target: { value: "Belt" } })
    fireEvent.change(within(form).getByLabelText("Where you keep it"), { target: { value: "Garage" } })
    fireEvent.click(screen.getByRole("button", { name: "Save part" }))
    await waitFor(() => expect(addTaskSupply).toHaveBeenCalledWith("h1", "t1", { name: "Belt", url: null, size: null, location: "Garage", buy_ahead: true }))
    expect(await screen.findByText("Belt")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /^Kept in Garage/ })).toBeInTheDocument()
  })
})
