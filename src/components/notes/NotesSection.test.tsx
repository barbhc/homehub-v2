/**
 * The item page's Notes (design/spares-and-notes.md §2): ideas start a note,
 * a failed save keeps the sheet and says so, a failed load never claims
 * "Nothing noted yet", and the old single item-notes field shows as a note
 * that editing moves into the notes store.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react"
import type { CareNote, ItemUnit } from "@/integrations/types"

const svc = vi.hoisted(() => ({
  getCareNotesByItem: vi.fn(),
  createCareNote: vi.fn(),
  updateCareNote: vi.fn(),
  deleteCareNote: vi.fn(),
  promoteLegacyItemNote: vi.fn(),
  clearLegacyItemNote: vi.fn(),
}))
vi.mock("@/modules/care", () => svc)
vi.mock("@/modules/home", () => ({ useCurrentHome: () => ({ home: { home_id: "h1", name: "SF Condo" } }) }))

const { NotesSection } = await import("./NotesSection")

const item = (over: Partial<ItemUnit> = {}): ItemUnit =>
  ({ item_unit_id: "furnace", home_id: "h1", display_name: "Carrier Infinity Furnace", category: "furnace", item_category: "system", notes: null, created_at: "2026-03-01T00:00:00Z", updated_at: "2026-03-01T00:00:00Z", ...over }) as ItemUnit
const note = (id: string, content: string): CareNote => ({
  note_id: id, home_id: "h1", room_id: null, item_unit_id: "furnace", scope: "item_unit", category: null, chunk_type: "care",
  title: null, content, source: "user", source_url: null, task_template_id: null,
  created_at: "2026-09-12T10:00:00Z", updated_at: "2026-09-12T10:00:00Z", deleted_at: null,
})

beforeEach(() => {
  vi.clearAllMocks()
  svc.getCareNotesByItem.mockResolvedValue({ data: [], error: null })
  svc.createCareNote.mockResolvedValue({ data: note("n1", "x"), error: null })
  svc.updateCareNote.mockResolvedValue({ data: note("n1", "x"), error: null })
  svc.deleteCareNote.mockResolvedValue({ data: true, error: null })
  svc.promoteLegacyItemNote.mockResolvedValue({ data: note("legacy-furnace", "x"), error: null })
  svc.clearLegacyItemNote.mockResolvedValue({ data: true, error: null })
})

describe("NotesSection — nothing yet", () => {
  it("offers ideas for this kind of item, not fields", async () => {
    render(<NotesSection homeId="h1" item={item()} />)
    expect(await screen.findByText("Nothing noted yet")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "How to reach the filter" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Who services it" })).toBeInTheDocument()
  })

  it("an idea starts the note with its label and shows its hint; Save writes an item note", async () => {
    render(<NotesSection homeId="h1" item={item()} />)
    fireEvent.click(await screen.findByRole("button", { name: "How to reach the filter" }))
    const box = await screen.findByLabelText("Note")
    expect(box).toHaveValue("How to reach the filter: ")
    expect(screen.getByText("Which panel, any tools, anything tricky.")).toBeInTheDocument()
    expect(screen.getByText("Shared with everyone in SF Condo")).toBeInTheDocument()
    // Only the seed → nothing worth saving yet.
    expect(screen.getByRole("button", { name: "Save note" })).toBeDisabled()
    fireEvent.change(box, { target: { value: "How to reach the filter: the left panel lifts off." } })
    fireEvent.click(screen.getByRole("button", { name: "Save note" }))
    await waitFor(() => expect(svc.createCareNote).toHaveBeenCalledWith({
      home_id: "h1", scope: "item_unit", item_unit_id: "furnace", room_id: null,
      content: "How to reach the filter: the left panel lifts off.", source: "user",
    }))
    await waitFor(() => expect(svc.getCareNotesByItem).toHaveBeenCalledTimes(2)) // reloaded
    await waitFor(() => expect(screen.queryByLabelText("Note")).toBeNull()) // sheet closed
  })

  it("a failed save keeps the sheet open with the text and says why", async () => {
    svc.createCareNote.mockResolvedValueOnce({ data: null, error: { message: "permission denied" } })
    render(<NotesSection homeId="h1" item={item()} />)
    fireEvent.click(await screen.findByRole("button", { name: "Add a note" }))
    fireEvent.change(await screen.findByLabelText("Note"), { target: { value: "Clicks twice on startup." } })
    fireEvent.click(screen.getByRole("button", { name: "Save note" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("permission denied")
    expect(screen.getByLabelText("Note")).toHaveValue("Clicks twice on startup.")
  })

  it("a failed load says so with Try again — never a false 'Nothing noted yet'", async () => {
    svc.getCareNotesByItem.mockResolvedValueOnce({ data: null, error: { message: "offline" } })
    render(<NotesSection homeId="h1" item={item()} />)
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load notes: offline")
    expect(screen.queryByText("Nothing noted yet")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByText("Nothing noted yet")).toBeInTheDocument()
  })
})

describe("NotesSection — with notes", () => {
  it("shows each note's heading and text; editing saves the new text", async () => {
    svc.getCareNotesByItem.mockResolvedValue({ data: [note("n1", "Quirks: clicks twice on startup.")], error: null })
    render(<NotesSection homeId="h1" item={item()} />)
    const row = await screen.findByTestId("note-row")
    expect(within(row).getByText("Quirks")).toBeInTheDocument()
    expect(within(row).getByText("Clicks twice on startup.")).toBeInTheDocument() // displayed as a sentence
    fireEvent.click(within(row).getByRole("button", { name: "Edit note: Quirks" }))
    fireEvent.change(await screen.findByLabelText("Note"), { target: { value: "Quirks: clicks twice. Normal." } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(svc.updateCareNote).toHaveBeenCalledWith("h1", "n1", { content: "Quirks: clicks twice. Normal.", title: null }))
  })

  it("the old item-notes text shows as a note; editing moves it into notes and clears the field", async () => {
    const onItemUpdate = vi.fn()
    const legacy = item({ notes: "Filter is behind the left panel" })
    render(<NotesSection homeId="h1" item={legacy} onItemUpdate={onItemUpdate} />)
    const row = await screen.findByTestId("note-row")
    expect(within(row).getByText("Filter is behind the left panel")).toBeInTheDocument()
    fireEvent.click(within(row).getByRole("button", { name: /^Edit note/ }))
    fireEvent.change(await screen.findByLabelText("Note"), { target: { value: "Filter: behind the left panel, no tools." } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(svc.promoteLegacyItemNote).toHaveBeenCalledWith("h1", "furnace", "Filter: behind the left panel, no tools."))
    expect(onItemUpdate).toHaveBeenCalledWith(expect.objectContaining({ notes: null }))
    expect(svc.updateCareNote).not.toHaveBeenCalled()
  })

  it("deleting the old item-notes text clears the field", async () => {
    const onItemUpdate = vi.fn()
    render(<NotesSection homeId="h1" item={item({ notes: "Old note" })} onItemUpdate={onItemUpdate} />)
    fireEvent.click(within(await screen.findByTestId("note-row")).getByRole("button", { name: /^Edit note/ }))
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }))
    await waitFor(() => expect(svc.clearLegacyItemNote).toHaveBeenCalledWith("h1", "furnace"))
    expect(onItemUpdate).toHaveBeenCalledWith(expect.objectContaining({ notes: null }))
    expect(svc.deleteCareNote).not.toHaveBeenCalled()
  })

  it("an idea already written down is no longer offered", async () => {
    svc.getCareNotesByItem.mockResolvedValue({ data: [note("n1", "Who services it: Sunset Heating & Air")], error: null })
    render(<NotesSection homeId="h1" item={item()} />)
    await screen.findByTestId("note-row")
    fireEvent.click(screen.getByRole("button", { name: "Add a note" }))
    await screen.findByLabelText("Note")
    expect(screen.queryByRole("button", { name: "Who services it" })).toBeNull()
    expect(screen.getByRole("button", { name: "Quirks & noises" })).toBeInTheDocument()
  })
})
