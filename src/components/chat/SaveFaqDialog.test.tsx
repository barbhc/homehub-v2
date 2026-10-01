/**
 * Saving an Ask answer: it always lands on an item.
 *
 * The dialog used to default to "Home (not item-specific)". Those answers were
 * listed only by the Care Guide page (/faq), which the dead-code sweep deleted
 * (audit 2026-09-29, D5) — so a whole-home save would now be written and never
 * shown anywhere. Item saves are what the item page shows (Saved answers /
 * Saved Q&A), and they must keep working exactly as before.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const saveFaq = vi.fn()
vi.mock("@/modules/knowledge", () => ({ saveFaq: (...a: unknown[]) => saveFaq(...a) }))
vi.mock("@/modules/items", () => ({
  getItemUnits: async () => ({
    data: [
      { item_unit_id: "item-a", display_name: "Carrier Infinity Furnace", brand: "Carrier", model: "59MN7" },
      { item_unit_id: "item-b", display_name: "Bosch Dishwasher", brand: null, model: null },
    ],
    error: null,
  }),
}))
const { SaveFaqDialog } = await import("./SaveFaqDialog")

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
})

function renderDialog(defaultItemUnitId: string | null) {
  const onSaved = vi.fn()
  render(
    <SaveFaqDialog
      open
      onOpenChange={() => {}}
      question="What filter size do I need?"
      answer="A 20x25x5 media filter."
      homeId="home-1"
      defaultItemUnitId={defaultItemUnitId}
      onSaved={onSaved}
    />,
  )
  return { onSaved }
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
