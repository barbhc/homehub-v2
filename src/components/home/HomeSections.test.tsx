/**
 * Home's sections render only what they should (design/home-next.md).
 * Absence here means NOT RENDERED (queryBy… → null), per CLAUDE.md rule 3.
 */
import { describe, expect, it } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { CareNote } from "@/integrations/types"
import { ComingUp, HeadsUp, InAPinch, PinnedNotes } from "./HomeSections"

const wrap = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)
const note = (over: Partial<CareNote>): CareNote => ({
  note_id: "n", home_id: "h", room_id: null, item_unit_id: null, scope: "home", category: null, chunk_type: "care",
  title: null, content: "", source: "user", source_url: null, task_template_id: null,
  created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", deleted_at: null, pinned_at: null, ...over,
})

describe("In a pinch", () => {
  it("a failed read says so and NEVER renders 'Add' — that would say a shutoff isn't noted when it may be", () => {
    wrap(<InAPinch notes={null} notesError="permission-denied" providers={[]} providersError={false} onRetry={() => {}} />)
    const section = screen.getByTestId("in-a-pinch")
    expect(within(section).getByRole("alert")).toHaveTextContent("Couldn't load these.")
    expect(within(section).queryByText("Add")).toBeNull()
    expect(within(section).getByRole("button", { name: "Try again" })).toBeInTheDocument()
  })

  it("a failed providers read is a failure too", () => {
    wrap(<InAPinch notes={[]} notesError={null} providers={[]} providersError onRetry={() => {}} />)
    expect(screen.getByRole("alert")).toBeInTheDocument()
    expect(screen.queryByText("Add")).toBeNull()
  })

  it("while loading it renders nothing rather than a guess", () => {
    wrap(<InAPinch notes={null} notesError={null} providers={null} providersError={false} onRetry={() => {}} />)
    expect(screen.queryByTestId("in-a-pinch")).toBeNull()
  })

  it("a new home: every row says Add, and Add opens that idea's note", () => {
    wrap(<InAPinch notes={[]} notesError={null} providers={[]} providersError={false} onRetry={() => {}} />)
    const rows = screen.getAllByTestId("pinch-row")
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Water shutoff"), expect.stringContaining("Gas shutoff"),
      expect.stringContaining("Breaker panel"), expect.stringContaining("Your pros"),
    ])
    expect(rows.filter((r) => /Add$/.test(r.textContent ?? ""))).toHaveLength(4)
    expect(rows[1]).toHaveAttribute("href", "/inventory/notes?idea=Gas%20shutoff")
  })

  it("a noted shutoff shows where it is, with no Add", () => {
    wrap(<InAPinch notes={[note({ content: "Water shutoff: Garage" })]} notesError={null} providers={[]} providersError={false} onRetry={() => {}} />)
    const water = screen.getAllByTestId("pinch-row")[0]
    expect(water).toHaveTextContent("Garage")
    expect(water).not.toHaveTextContent(/Add$/)
  })
})

describe("sections that hide when they have nothing to say", () => {
  it("Heads up is not rendered with nothing timely", () => {
    wrap(<HeadsUp recalls={[]} ready={[]} warranties={[]} />)
    expect(screen.queryByTestId("heads-up")).toBeNull()
  })

  it("Pinned by you is not rendered when nothing is pinned", () => {
    wrap(<PinnedNotes notes={[note({ content: "Wi-Fi: Maple-5G" })]} />)
    expect(screen.queryByTestId("pinned")).toBeNull()
  })

  it("Coming up is not rendered with nothing after this week", () => {
    wrap(<ComingUp upcoming={[]} />)
    expect(screen.queryByTestId("coming-up")).toBeNull()
  })

  it("Pinned by you shows a pinned note's heading and first line", () => {
    wrap(<PinnedNotes notes={[note({ content: "Furnace filter size: 16 × 25 × 1", pinned_at: "2026-11-01T00:00:00Z" })]} />)
    const row = screen.getByTestId("pinned-row")
    expect(row).toHaveTextContent("Furnace filter size")
    expect(row).toHaveTextContent("16 × 25 × 1")
  })
})
