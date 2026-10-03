/**
 * The per-appliance deep-clean guide (/clean/:itemUnitId).
 *
 * "Loading guide…" used to be set inside the effect that reads (H5,
 * react-hooks/set-state-in-effect); now it is set in the render that asks.
 * Pinned: it loads the item's guide; a failed read says so with Try again,
 * which shows "Loading guide…" and reads again; an item with no cleaning tasks
 * says so.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"

const getItemCleanGuide = vi.hoisted(() => vi.fn())
vi.mock("@/lib/cleanSession", () => ({ getItemCleanGuide: (...a: unknown[]) => getItemCleanGuide(...a) }))
vi.mock("@/modules/home", () => ({ useCurrentHome: () => ({ home: HOME }) }))
vi.mock("@/components/tasks/HowToSteps", () => ({ HowToSteps: () => null }))

const HOME = { home_id: "home-1" }
const { default: CleanGuide } = await import("./CleanGuide")

const GUIDE = {
  itemUnitId: "i1", itemName: "Bosch 800 Series Dishwasher", roomName: "Kitchen", totalMinutes: 20,
  tasks: [{ taskTemplateId: "t1", title: "Clean the filter", estimatedMinutes: 10, instructions: null, steps: [], supplies: [] }],
}

function renderGuide() {
  render(
    <MemoryRouter initialEntries={["/clean/i1"]}>
      <Routes>
        <Route path="/clean/:itemUnitId" element={<CleanGuide />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe("CleanGuide", () => {
  beforeEach(() => getItemCleanGuide.mockReset())

  it("loads the item's guide", async () => {
    getItemCleanGuide.mockResolvedValue(GUIDE)
    renderGuide()
    expect(screen.getByText("Loading guide…")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText("Clean the Bosch 800 Series Dishwasher")).toBeInTheDocument())
    expect(getItemCleanGuide).toHaveBeenCalledWith("home-1", "i1")
  })

  it("a failed read says so, and Try again loads it — showing Loading meanwhile", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    getItemCleanGuide.mockRejectedValueOnce(new Error("unavailable"))
    renderGuide()
    await waitFor(() => expect(screen.getByText("Couldn't load this guide")).toBeInTheDocument())

    let finish!: (g: typeof GUIDE) => void
    getItemCleanGuide.mockReturnValueOnce(new Promise((r) => { finish = r }))
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }))
    expect(screen.getByText("Loading guide…")).toBeInTheDocument()
    finish(GUIDE)
    await waitFor(() => expect(screen.getByText("Clean the Bosch 800 Series Dishwasher")).toBeInTheDocument())
  })

  it("an item with no cleaning tasks says so", async () => {
    getItemCleanGuide.mockResolvedValue(null)
    renderGuide()
    await waitFor(() => expect(screen.getByText("No cleaning guide for this item yet.")).toBeInTheDocument())
  })
})
