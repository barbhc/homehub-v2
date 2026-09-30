/**
 * House notes and a room's notes (design/spares-and-notes.md §2): each page
 * shows only its own scope, writes into it, suggests what's missing, and says
 * so when the room is gone instead of pretending it's empty.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import type { CareNote } from "@/integrations/types"

const svc = vi.hoisted(() => ({
  getHomeNotes: vi.fn(),
  createCareNote: vi.fn(),
  updateCareNote: vi.fn(),
  deleteCareNote: vi.fn(),
}))
const home = vi.hoisted(() => ({ getRooms: vi.fn() }))
vi.mock("@/modules/care", () => svc)
vi.mock("@/modules/home", () => ({
  useCurrentHome: () => ({ home: { home_id: "h1", name: "SF Condo" } }),
  getRooms: (...a: unknown[]) => home.getRooms(...a),
}))

const { default: NotesPage } = await import("./NotesPage")

const n = (id: string, scope: CareNote["scope"], content: string, room_id: string | null = null): CareNote => ({
  note_id: id, home_id: "h1", room_id, item_unit_id: scope === "item_unit" ? "furnace" : null, scope, category: null, chunk_type: "care",
  title: null, content, source: "user", source_url: null, task_template_id: null,
  created_at: "2026-09-12T10:00:00Z", updated_at: "2026-09-12T10:00:00Z", deleted_at: null,
})

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/inventory/notes" element={<NotesPage />} />
        <Route path="/inventory/rooms/:roomId/notes" element={<NotesPage />} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  svc.getHomeNotes.mockResolvedValue({
    data: [
      n("h", "home", "Water shutoff: under the kitchen sink"),
      n("k", "room", "Paint: Swiss Coffee, eggshell", "kitchen"),
      n("i", "item_unit", "Quirks: clicks twice"),
    ],
    error: null,
  })
  svc.createCareNote.mockResolvedValue({ data: n("new", "home", "x"), error: null })
  home.getRooms.mockResolvedValue({ data: [{ room_id: "kitchen", name: "Kitchen" }], error: null })
})

describe("House notes", () => {
  it("shows only the house's own notes, and says who can read them", async () => {
    at("/inventory/notes")
    expect(await screen.findByRole("heading", { name: "House notes" })).toBeInTheDocument()
    expect(await screen.findByText("Water shutoff")).toBeInTheDocument()
    expect(screen.queryByText("Paint")).toBeNull()
    expect(screen.queryByText("Quirks")).toBeNull()
    expect(screen.getByText("Shared with everyone in SF Condo")).toBeInTheDocument()
  })

  it("suggests what's missing, and an idea writes a HOUSE note", async () => {
    at("/inventory/notes")
    await screen.findByText("Water shutoff")
    expect(screen.queryByRole("button", { name: "Water shutoff" })).toBeNull() // already written
    fireEvent.click(screen.getByRole("button", { name: "Breaker panel" }))
    const box = await screen.findByLabelText("Note")
    fireEvent.change(box, { target: { value: "Breaker panel: hall closet, left wall" } })
    fireEvent.click(screen.getByRole("button", { name: "Save note" }))
    await waitFor(() => expect(svc.createCareNote).toHaveBeenCalledWith({
      home_id: "h1", scope: "home", room_id: null, item_unit_id: null, content: "Breaker panel: hall closet, left wall", source: "user",
    }))
  })
})

describe("A room's notes", () => {
  it("is titled by the room and shows only that room's notes; a new one is a ROOM note", async () => {
    at("/inventory/rooms/kitchen/notes")
    expect(await screen.findByRole("heading", { name: "Kitchen" })).toBeInTheDocument()
    expect(await screen.findByText("Paint")).toBeInTheDocument()
    expect(screen.queryByText("Water shutoff")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Add a note" }))
    fireEvent.change(await screen.findByLabelText("Note"), { target: { value: "Light bulbs: GU10, 2700K" } })
    fireEvent.click(screen.getByRole("button", { name: "Save note" }))
    await waitFor(() => expect(svc.createCareNote).toHaveBeenCalledWith(expect.objectContaining({ scope: "room", room_id: "kitchen" })))
  })

  it("a room that's gone says so — it doesn't pretend to be empty", async () => {
    home.getRooms.mockResolvedValueOnce({ data: [], error: null })
    at("/inventory/rooms/kitchen/notes")
    expect(await screen.findByText("This room isn't in your home anymore.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Add a note" })).toBeNull()
  })

  it("a failed load says so — never a false 'Nothing noted yet'", async () => {
    svc.getHomeNotes.mockResolvedValueOnce({ data: null, error: { message: "offline" } })
    at("/inventory/notes")
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load notes: offline")
    expect(screen.queryByText("Nothing noted yet")).toBeNull()
  })
})
