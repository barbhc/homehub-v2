/**
 * The notes' door on Items: the house card up top. (Each room heading's link
 * was removed 2026-11-21; room notes are reached from House notes.)
 */
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { CareNote } from "@/integrations/types"
import { HouseNotesCard } from "./ItemsNotes"

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
