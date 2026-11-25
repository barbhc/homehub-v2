/**
 * The item page's no-manual card (before-friends mock 2, owner-approved
 * 2026-11-24; superseding HH-91's "No upkeep yet — add the manual").
 *
 * An item with no manual and no tasks used to say only that upkeep comes from
 * a manual. Now a known kind lists up to two of its typical tasks inside the
 * same card, each with an outlined Add and a text Don't Add, and Add the Manual
 * stays the card's one filled button. Each `it` is one line of the mock's
 * must-be-true list. Rendered, not grepped.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { ItemUnit } from "@/integrations/types"
import type { ManualReading } from "@/lib/manualReviewState"
import { entryByKey } from "../../../shared/care/library"

const care = vi.hoisted(() => ({
  addLibraryTask: vi.fn(),
  dismissLibrarySuggestion: vi.fn(),
}))
vi.mock("@/modules/care", async (orig) => ({
  ...(await orig<typeof import("@/modules/care")>()),
  getTaskInstances: vi.fn().mockResolvedValue({ data: [], error: null }),
  addLibraryTask: care.addLibraryTask,
  dismissLibrarySuggestion: care.dismissLibrarySuggestion,
}))
vi.mock("@/pages/item-detail/useSetupCompletion", () => ({
  useSetupCompletion: () => ({ done: new Set<string>(), toggle: vi.fn(), allDone: false }),
}))

import { CareBlock } from "./CareBlock"

const named = (display_name: string) => ({ item_unit_id: "i1", display_name, dismissed_care: [] }) as unknown as ItemUnit

function renderCare(item: ItemUnit, props: { hasManual?: boolean; reading?: ManualReading | null; manualAwaitingReview?: boolean; onTaskAdded?: () => void } = {}) {
  return render(
    <MemoryRouter>
      <CareBlock
        item={item}
        homeId="h1"
        tasks={[]}
        chunks={[]}
        hasManual={false}
        notificationsBlocked={false}
        onAddManual={vi.fn()}
        {...props}
      />
    </MemoryRouter>,
  )
}

const card = () => screen.getByTestId("no-upkeep-card")
const rows = () => screen.queryAllByTestId("suggested-card-row")
const addManual = () => screen.getByRole("button", { name: "Add the Manual" })

beforeEach(() => {
  care.addLibraryTask.mockReset().mockResolvedValue({ data: {}, error: null })
  care.dismissLibrarySuggestion.mockReset().mockResolvedValue({ data: true, error: null })
})

describe("the no-manual card", () => {
  it("a dishwasher: No upkeep yet, the most-dishwashers line, one row with Add and Don't Add, then Add the Manual", () => {
    renderCare(named("Dishwasher"))
    expect(within(card()).getByText("No upkeep yet")).toBeInTheDocument()
    expect(within(card()).getByText("Here's what most dishwashers need. Add the manual for this one's exact schedule.")).toBeInTheDocument()
    expect(rows()).toHaveLength(1)
    const row = rows()[0]
    expect(row).toHaveTextContent("Clean the dishwasher filter")
    expect(row).toHaveTextContent("Monthly · 10 min")
    expect(within(row).getByRole("button", { name: "Add Clean the dishwasher filter" })).toHaveTextContent(/^Add$/)
    expect(within(row).getByRole("button", { name: "Don't add Clean the dishwasher filter" })).toHaveTextContent("Don't Add")
    expect(addManual()).toBeInTheDocument()
    // The old headline and the band's furniture are gone from this card.
    expect(screen.queryByText(/No upkeep yet — add the manual/)).toBeNull()
    expect(screen.queryByText(/Not this one/i)).toBeNull()
    expect(within(card()).queryByText("Suggested")).toBeNull()
  })

  it("a fridge: two rows, under the 'most fridges' line", () => {
    renderCare(named("Fridge"))
    expect(within(card()).getByText("Here's what most fridges need. Add the manual for this one's exact schedule.")).toBeInTheDocument()
    expect(rows().map((r) => r.querySelector("span")?.textContent)).toEqual(["Replace the water filter", "Vacuum the condenser coils"])
  })

  it("at most two rows, even for a kind with more", () => {
    renderCare(named("Air purifier"))
    expect(rows()).toHaveLength(2)
  })

  it("an unknown kind: no rows, today's line, and Add the Manual", () => {
    renderCare(named("Sharp SMD2470ASY24"))
    expect(within(card()).getByText("No upkeep yet")).toBeInTheDocument()
    expect(within(card()).getByText("The manual is where this item's schedule, warranty window and answers come from.")).toBeInTheDocument()
    expect(screen.queryAllByTestId("suggested-card-row")).toHaveLength(0)
    expect(screen.queryByText(/Here's what most/)).toBeNull()
    expect(addManual()).toBeInTheDocument()
  })

  it("Add calls addLibraryTask once with that entry and tells the page", async () => {
    const onTaskAdded = vi.fn()
    renderCare(named("Dishwasher"), { onTaskAdded })
    fireEvent.click(screen.getByRole("button", { name: "Add Clean the dishwasher filter" }))
    await waitFor(() => expect(onTaskAdded).toHaveBeenCalledTimes(1))
    expect(care.addLibraryTask).toHaveBeenCalledTimes(1)
    expect(care.addLibraryTask).toHaveBeenCalledWith("h1", "i1", entryByKey("dishwasher.filter"))
    expect(care.dismissLibrarySuggestion).not.toHaveBeenCalled()
  })

  it("a failed Add shows the reason on the row, keeps the row and its Add, and claims nothing", async () => {
    care.addLibraryTask.mockResolvedValue({ data: null, error: { message: "You're offline" } })
    const onTaskAdded = vi.fn()
    renderCare(named("Dishwasher"), { onTaskAdded })
    fireEvent.click(screen.getByRole("button", { name: "Add Clean the dishwasher filter" }))
    const row = rows()[0]
    await waitFor(() => expect(within(row).getByRole("alert")).toHaveTextContent("You're offline"))
    expect(within(row).getByRole("button", { name: "Add Clean the dishwasher filter" })).toHaveTextContent(/^Add$/)
    expect(screen.queryByText(/Added/)).toBeNull()
    expect(onTaskAdded).not.toHaveBeenCalled()
  })

  it("Don't Add saves the key on the item and the row goes; the next suggestion takes its place", async () => {
    renderCare(named("Air purifier"))
    const [first, second] = rows().map((r) => r.querySelector("span")?.textContent ?? "")
    const firstKey = entryKeyByTitle(first)
    fireEvent.click(screen.getByRole("button", { name: `Don't add ${first}` }))
    await waitFor(() => expect(screen.queryByText(first)).toBeNull())
    expect(care.dismissLibrarySuggestion).toHaveBeenCalledWith("h1", "i1", firstKey)
    expect(care.addLibraryTask).not.toHaveBeenCalled()
    const now = rows().map((r) => r.querySelector("span")?.textContent)
    expect(now).toHaveLength(2)
    expect(now[0]).toBe(second)
    expect(now).not.toContain(first)
  })

  it("has exactly one filled button, Add the Manual; each Add is outlined, Don't Add is text", () => {
    renderCare(named("Fridge"))
    const filled = within(card()).getAllByRole("button").filter((b) => (b.getAttribute("style") ?? "").includes("--hh-teal-fill"))
    expect(filled.map((b) => b.textContent)).toEqual(["Add the Manual"])
    for (const row of rows()) {
      const [add, dont] = within(row).getAllByRole("button")
      expect(add.className).toMatch(/\bborder\b/)
      expect(add.getAttribute("style")).not.toContain("--hh-teal-fill")
      expect(dont.className).not.toMatch(/\bborder\b/)
      expect(dont.className).toMatch(/min-h-11/)
      expect(add.className).toMatch(/min-h-11/)
    }
    expect(addManual().className).toMatch(/min-h-11/)
  })

  it.each([
    ["while the manual is read", { reading: { stage: "claude_call", pages: 42 } as ManualReading }],
    ["while a read waits for review", { manualAwaitingReview: true }],
  ])("renders none of this %s (not rendered)", (_label, props) => {
    renderCare(named("Dishwasher"), props)
    expect(screen.queryByTestId("no-upkeep-card")).toBeNull()
    expect(screen.queryAllByTestId("suggested-card-row")).toHaveLength(0)
    expect(screen.queryByRole("button", { name: "Add the Manual" })).toBeNull()
  })

  it("a manual with nothing found keeps today's card, with no typical care in it", () => {
    renderCare(named("Dishwasher"), { hasManual: true })
    expect(within(card()).getByText("No upkeep found in this manual yet.")).toBeInTheDocument()
    expect(screen.queryAllByTestId("suggested-card-row")).toHaveLength(0)
    expect(screen.queryByText("No upkeep yet")).toBeNull()
  })
})

function entryKeyByTitle(title: string): string {
  for (const key of ["air_purifier.hepa", "air_purifier.prefilter", "air_purifier.sensor"]) {
    if (entryByKey(key)?.title === title) return key
  }
  throw new Error(`no air purifier entry titled ${title}`)
}
