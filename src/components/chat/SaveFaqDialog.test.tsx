/**
 * Saving an Ask answer: it always lands on an item.
 *
 * The dialog used to default to "Home (not item-specific)". Those answers were
 * listed only by the Care Guide page (/faq), which the dead-code sweep deleted
 * (audit 2026-09-29, D5) — so a whole-home save would now be written and never
 * shown anywhere. Item saves are what the item page shows (Saved answers /
 * Saved Q&A), and they must keep working exactly as before.
 *
 * And a save that FAILS says so (audit H6): the dialog used to return silently
 * — Save came back, nothing explained why the dialog had not closed, and the
 * natural next tap was a blind retry.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const saveFaq = vi.fn()
const getItemUnits = vi.fn()
vi.mock("@/modules/knowledge", () => ({ saveFaq: (...a: unknown[]) => saveFaq(...a) }))
vi.mock("@/modules/items", () => ({ getItemUnits: (...a: unknown[]) => getItemUnits(...a) }))
const { SaveFaqDialog, SAVE_FAQ_ERROR, SAVE_FAQ_ITEMS_ERROR } = await import("./SaveFaqDialog")

const ITEMS = [
  { item_unit_id: "item-a", display_name: "Carrier Infinity Furnace", brand: "Carrier", model: "59MN7" },
  { item_unit_id: "item-b", display_name: "Bosch Dishwasher", brand: null, model: null },
]

// Radix Select measures and captures the pointer; jsdom implements neither.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.setPointerCapture ??= () => {}
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

beforeEach(() => {
  saveFaq.mockReset()
  saveFaq.mockResolvedValue({ data: { faq_id: "faq-1" }, error: null })
  getItemUnits.mockReset()
  getItemUnits.mockResolvedValue({ data: ITEMS, error: null })
})

function renderDialog(defaultItemUnitId: string | null) {
  const onSaved = vi.fn()
  const onOpenChange = vi.fn()
  render(
    <SaveFaqDialog
      open
      onOpenChange={onOpenChange}
      question="What filter size do I need?"
      answer="A 20x25x5 media filter."
      homeId="home-1"
      defaultItemUnitId={defaultItemUnitId}
      onSaved={onSaved}
    />,
  )
  return { onSaved, onOpenChange }
}

describe("SaveFaqDialog — every saved answer lands on an item", () => {
  it("offers items only: no whole-home option is rendered, and Save waits for a choice", async () => {
    const user = userEvent.setup()
    renderDialog(null)
    const save = screen.getByRole("button", { name: "Save" })
    expect(save).toBeDisabled()

    await user.click(screen.getByRole("combobox"))
    const list = await screen.findByRole("listbox")
    const options = within(list).getAllByRole("option").map((o) => o.textContent)
    expect(options).toEqual(["Carrier Infinity Furnace (Carrier 59MN7)", "Bosch Dishwasher"])
    // Not rendered at all — not merely hidden.
    expect(within(list).queryByRole("option", { name: /home|not item-specific/i })).toBeNull()
    expect(saveFaq).not.toHaveBeenCalled()
  })

  it("a conversation about an item saves onto that item, as before", async () => {
    const user = userEvent.setup()
    const { onSaved } = renderDialog("item-a")
    const save = screen.getByRole("button", { name: "Save" })
    expect(save).toBeEnabled()
    await user.click(save)

    await waitFor(() => expect(saveFaq).toHaveBeenCalledTimes(1))
    expect(saveFaq).toHaveBeenCalledWith({
      home_id: "home-1",
      item_unit_id: "item-a",
      question: "What filter size do I need?",
      answer: "A 20x25x5 media filter.",
    })
    expect(onSaved).toHaveBeenCalledWith("What filter size do I need?", "A 20x25x5 media filter.", "item-a")
  })

  it("an unscoped conversation saves onto the item the person picks", async () => {
    const user = userEvent.setup()
    renderDialog(null)
    await user.click(screen.getByRole("combobox"))
    await user.click(await screen.findByRole("option", { name: "Bosch Dishwasher" }))
    await user.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(saveFaq).toHaveBeenCalledTimes(1))
    expect(saveFaq.mock.calls[0][0]).toMatchObject({ item_unit_id: "item-b" })
  })
})

describe("SaveFaqDialog — a failed save is said, never a success (audit H6)", () => {
  it("shows the error, keeps the dialog open with the chosen item, and Save works again", async () => {
    const user = userEvent.setup()
    saveFaq.mockResolvedValueOnce({ data: null, error: { message: "Missing or insufficient permissions." } })
    const { onSaved, onOpenChange } = renderDialog("item-a")

    await user.click(screen.getByRole("button", { name: "Save" }))

    expect(await screen.findByRole("alert")).toHaveTextContent(SAVE_FAQ_ERROR)
    // No success state anywhere: not "Saved", not the page's notice, not closed.
    expect(screen.queryByText("Saved")).toBeNull()
    expect(onSaved).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    // The person's choice is intact and Save is live again.
    expect(screen.getByRole("combobox")).toHaveTextContent("Carrier Infinity Furnace")
    const save = screen.getByRole("button", { name: "Save" })
    expect(save).toBeEnabled()

    await user.click(save)
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(saveFaq).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("a double tap writes the answer once", async () => {
    let resolve: (v: unknown) => void = () => {}
    saveFaq.mockReturnValueOnce(new Promise((r) => { resolve = r }))
    const { onSaved } = renderDialog("item-a")
    const save = screen.getByRole("button", { name: "Save" })

    // Two taps before the first write answers — the second must not write.
    fireEvent.click(save)
    fireEvent.click(save)
    resolve({ data: { faq_id: "faq-1" }, error: null })

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(saveFaq).toHaveBeenCalledTimes(1)
  })

  it("an item list that fails to load says so with a retry — never an empty picker", async () => {
    const user = userEvent.setup()
    getItemUnits.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } })
    renderDialog(null)

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent(SAVE_FAQ_ITEMS_ERROR)
    await user.click(within(alert).getByRole("button", { name: "Try again" }))

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull())
    expect(getItemUnits).toHaveBeenCalledTimes(2)
    await user.click(screen.getByRole("combobox"))
    expect(await screen.findByRole("option", { name: "Bosch Dishwasher" })).toBeInTheDocument()
  })
})
