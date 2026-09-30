/**
 * The notes' doors on Items: the house card up top, and each room heading's
 * link — a count when there are notes, a quiet "Add a note" when not.
 */
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { CareNote } from "@/integrations/types"
import { HouseNotesCard, RoomNotesLink } from "./ItemsNotes"
import { roomNoteCounts } from "@/lib/notes"

const n = (scope: CareNote["scope"], content: string, room_id: string | null = null) =>
  ({ note_id: content, scope, room_id, content, title: null }) as CareNote
const inRouter = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe("HouseNotesCard", () => {
  it("summarises the house notes and links to them", () => {
    inRouter(<HouseNotesCard notes={[n("home", "Water shutoff: sink"), n("home", "Breaker panel: hall"), n("home", "Router & modem: TV"), n("room", "Paint: x", "k")]} error={null} />)
    const card = screen.getByTestId("house-notes-card")
    expect(card).toHaveAttribute("href", "/inventory/notes")
    expect(card).toHaveTextContent("House notes · 3")
    expect(card).toHaveTextContent("Water shutoff, breaker panel and 1 more")
  })
  it("with none yet it invites; on a failed load it says so", () => {
    const { unmount } = inRouter(<HouseNotesCard notes={[]} error={null} />)
    expect(screen.getByTestId("house-notes-card")).toHaveTextContent("Shutoffs, breakers, paint colors and more")
    unmount()
    inRouter(<HouseNotesCard notes={null} error="offline" />)
    expect(screen.getByTestId("house-notes-card")).toHaveTextContent("Couldn't load notes")
  })
})

describe("RoomNotesLink", () => {
  it("counts a room's notes", () => {
    expect(roomNoteCounts([n("room", "a", "k"), n("room", "b", "k"), n("home", "c")]).get("k")).toBe(2)
    inRouter(<RoomNotesLink roomId="k" roomName="Kitchen" count={2} />)
    expect(screen.getByRole("link", { name: "2 notes for Kitchen" })).toHaveAttribute("href", "/inventory/rooms/k/notes")
  })
  it("no notes → a quiet way to add one", () => {
    inRouter(<RoomNotesLink roomId="l" roomName="Laundry room" count={0} />)
    expect(screen.getByRole("link", { name: "Add a note for Laundry room" })).toHaveAttribute("href", "/inventory/rooms/l/notes")
  })
})
