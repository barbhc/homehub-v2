/**
 * HeroCard's inline editing — the desktop Edit dialog's field rows.
 *
 * The rows share one input ref, which focuses whichever field you start
 * editing. It used to reach each row through a props helper called during
 * render (H5, react-hooks/refs) and is now passed to each row directly.
 * Pinned: starting an edit focuses that field's input, and Enter saves it.
 */
import { describe, it, expect, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ItemUnit } from "@/integrations/types"

const updateItemUnit = vi.hoisted(() => vi.fn())
vi.mock("@/modules/items", () => ({ updateItemUnit: (...a: unknown[]) => updateItemUnit(...a) }))
vi.mock("@/modules/home", () => ({ createRoom: vi.fn() }))
vi.mock("@/modules/inventory/services/storageService", () => ({
  uploadItemPhoto: vi.fn(), uploadReceiptImage: vi.fn(),
}))
vi.mock("@/components/inventory/PhotoSearchSheet", () => ({ PhotoSearchSheet: () => null }))
vi.mock("@/hooks/useStorageUrl", () => ({ useStorageUrl: () => null }))

const { HeroCard } = await import("./HeroCard")

const ITEM = {
  item_unit_id: "i1", home_id: "h1", display_name: "Dishwasher", brand: null, model: "SHPM65Z55N",
  category: null, room_id: null, tags: [], photo_storage_ref: null, receipt_storage_path: null,
} as unknown as ItemUnit

function renderCard(onItemUpdate = vi.fn()) {
  // sidebarMode, as the item page's Edit dialog mounts it: the field rows are
  // always out, not behind "Details ›".
  render(
    <HeroCard
      item={ITEM} rooms={[]} homeId="h1" userId="u1" allHomeTags={[]}
      onItemUpdate={onItemUpdate} onTagsChange={vi.fn()} onDelete={vi.fn()} deleting={false}
      sidebarMode
    />,
  )
  return onItemUpdate
}

describe("HeroCard · inline field editing", () => {
  it("starting an edit focuses that field's input, and Enter saves the value", async () => {
    updateItemUnit.mockResolvedValue({ data: { ...ITEM, brand: "Bosch" }, error: null })
    const onItemUpdate = renderCard()

    fireEvent.click(screen.getByText("Add brand"))
    const input = screen.getByPlaceholderText("Add brand")
    await waitFor(() => expect(document.activeElement).toBe(input))

    fireEvent.change(input, { target: { value: "Bosch" } })
    fireEvent.keyDown(input, { key: "Enter" })
    await waitFor(() => expect(updateItemUnit).toHaveBeenCalledWith("h1", "i1", { brand: "Bosch" }))
    await waitFor(() => expect(onItemUpdate).toHaveBeenCalledWith(expect.objectContaining({ brand: "Bosch" })))
  })

  it("the ref follows the field being edited", async () => {
    renderCard()
    // The model shows twice (under the name, and as its row); the row is the
    // one with the label beside it.
    const modelRow = screen.getByText("Model").parentElement as HTMLElement
    fireEvent.click(modelRow)
    const model = screen.getByDisplayValue("SHPM65Z55N")
    await waitFor(() => expect(document.activeElement).toBe(model))
  })
})
