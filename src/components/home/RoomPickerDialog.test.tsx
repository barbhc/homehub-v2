/**
 * The item page's room picker.
 *
 * Its row used to be a component declared INSIDE the dialog (H5,
 * react-hooks/static-components): a new type every render, so every row was
 * unmounted and remounted whenever the dialog re-rendered. It is a module-level
 * component now. Pinned: what a row shows and what picking it does are
 * unchanged, and typing a new room's name no longer replaces the rows.
 */
import { describe, it, expect, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import type { Room } from "@/integrations/types"
import { RoomPickerDialog } from "./RoomPickerDialog"

vi.mock("@/modules/home", () => ({ createRoom: vi.fn() }))

const room = (room_id: string, name: string): Room =>
  ({ room_id, home_id: "h1", name, created_at: "", updated_at: "", deleted_at: null }) as Room
const ROOMS = [room("r1", "Kitchen"), room("r2", "Garage")]

function renderPicker(currentRoomId: string | null) {
  const onPick = vi.fn()
  const onOpenChange = vi.fn()
  render(
    <RoomPickerDialog
      open onOpenChange={onOpenChange} homeId="h1" rooms={ROOMS}
      currentRoomId={currentRoomId} onPick={onPick} onRoomCreated={vi.fn()}
    />,
  )
  return { onPick, onOpenChange }
}

describe("RoomPickerDialog", () => {
  it("marks the current room, and picking another hands it back and closes", () => {
    const { onPick, onOpenChange } = renderPicker("r1")
    const kitchen = screen.getByRole("button", { name: "Kitchen" })
    expect(kitchen.querySelector("svg")).not.toBeNull()
    expect(screen.getByRole("button", { name: "Garage" }).querySelector("svg")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Garage" }))
    expect(onPick).toHaveBeenCalledWith("r2")
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("'No room' picks null, and is the marked one when the item has no room", () => {
    const { onPick } = renderPicker(null)
    const none = screen.getByRole("button", { name: "No room" })
    expect(none.querySelector("svg")).not.toBeNull()
    fireEvent.click(none)
    expect(onPick).toHaveBeenCalledWith(null)
  })

  it("typing a new room's name keeps the same row elements (no remount per keystroke)", () => {
    renderPicker("r1")
    const before = screen.getByRole("button", { name: "Garage" })
    fireEvent.change(screen.getByLabelText("New room name"), { target: { value: "Gar" } })
    expect(screen.getByRole("button", { name: "Garage" })).toBe(before)
  })
})
