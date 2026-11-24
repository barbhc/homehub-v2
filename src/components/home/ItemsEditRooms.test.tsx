/**
 * "Edit rooms" — the door to the rooms list, which left Settings for Items
 * (design/settings-your-home.md). The Items page mounts a phone tree and a
 * desktop tree; each carries the link after its list, in the Items view only.
 */
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { ItemUnit } from "@/integrations/types"
import { RefinedItems } from "./RefinedItems"
import { DesktopItems } from "./DesktopItems"

const washer = {
  item_unit_id: "i1", home_id: "h1", room_id: "r1", display_name: "Washer",
  category: "washing-machine", item_category: "major_appliance", sub_type: "washing-machine",
  brand: "LG", model: null, status: "active", deleted_at: null, created_at: "2026-09-01T00:00:00Z",
} as ItemUnit
const rooms = [{ room_id: "r1", name: "Laundry Room" }]

const renderAt = (at: string) =>
  render(
    <MemoryRouter initialEntries={[at]}>
      <div data-testid="phone"><RefinedItems rooms={rooms} items={[washer]} /></div>
      <div data-testid="desktop"><DesktopItems rooms={rooms} items={[washer]} /></div>
    </MemoryRouter>,
  )

describe("Items · Edit rooms", () => {
  it("follows the room list in the phone tree and in the desktop tree, and opens Rooms", () => {
    renderAt("/inventory")
    for (const tree of ["phone", "desktop"]) {
      const within_ = screen.getByTestId(tree)
      const link = within_.querySelector<HTMLAnchorElement>('a[data-testid="edit-rooms"]')
      expect(link, tree).not.toBeNull()
      expect(link).toHaveTextContent("Edit rooms")
      expect(link).toHaveAttribute("href", "/inventory/rooms")
      // After the list: the item's row comes first in the document.
      const row = within_.querySelector('a[href="/items/i1"]')!
      expect(row.compareDocumentPosition(link!) & Node.DOCUMENT_POSITION_FOLLOWING, tree).toBeTruthy()
    }
    expect(screen.getAllByRole("link", { name: "Edit rooms" })).toHaveLength(2)
  })

  it("is not rendered in the Warranties view, in either tree", () => {
    renderAt("/inventory?view=warranties")
    expect(screen.queryAllByRole("link", { name: "Edit rooms" })).toHaveLength(0)
    expect(screen.queryAllByTestId("edit-rooms")).toHaveLength(0)
  })
})
