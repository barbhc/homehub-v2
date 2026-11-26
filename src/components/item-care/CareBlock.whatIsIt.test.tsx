/**
 * "What is it?" on the item page's no-manual card (before-friends PR C, mock
 * r4-m2-nokind). Must be true: "An item whose kind is unknown shows the 'What
 * is it?' chips; picking one saves the kind and shows that kind's typical
 * care." Plus the plan's rules: only kinds with item-level care, the name
 * changes only while it is the "Brand Model" placeholder, and a failed write
 * shows an error and keeps the chips. Rendered, not grepped.
 *
 * Seventeen fixes, mock m4 (owner-approved 2026-11-25) narrowed it: the chips
 * show ONLY while the name is still that placeholder. An item she named
 * herself ("Kitchen faucet") was asked if it was a dishwasher; it now gets
 * "No typical care for this yet…" with Add the Manual and Add Your Own Task.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { useState } from "react"
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { ItemUnit } from "@/integrations/types"
import type { ManualReading } from "@/lib/manualReviewState"
import { KIND_CHIPS, WHAT_IS_IT_CHIPS } from "@/components/smart-add/identifyData"
import { suggestionsForItem } from "../../../shared/care/library"

const svc = vi.hoisted(() => ({
  updateItemUnit: vi.fn(),
  getItemUnits: vi.fn(),
  getRooms: vi.fn(),
}))
vi.mock("@/modules/items/services/itemService", async (orig) => ({
  ...(await orig<typeof import("@/modules/items/services/itemService")>()),
  updateItemUnit: svc.updateItemUnit,
  getItemUnits: svc.getItemUnits,
}))
vi.mock("@/modules/home", async (orig) => ({
  ...(await orig<typeof import("@/modules/home")>()),
  getRooms: svc.getRooms,
}))
vi.mock("@/modules/care", async (orig) => ({
  ...(await orig<typeof import("@/modules/care")>()),
  getTaskInstances: vi.fn().mockResolvedValue({ data: [], error: null }),
}))
vi.mock("@/pages/item-detail/useSetupCompletion", () => ({
  useSetupCompletion: () => ({ done: new Set<string>(), toggle: vi.fn(), allDone: false }),
}))

import { CareBlock } from "./CareBlock"

const unit = (over: Partial<ItemUnit>) =>
  ({ item_unit_id: "i1", home_id: "h1", display_name: "Bosch SHPM88Z75N", brand: "Bosch", model: "SHPM88Z75N",
    category: "other", item_category: null, sub_type: null, room_id: "r-kitchen", dismissed_care: [], ...over }) as unknown as ItemUnit

/** The page as it is: CareBlock's item comes from the page, and a write's
 *  result goes back through onItemUpdate. */
function Page({ initial, onItemUpdate, props = {} }: {
  initial: ItemUnit
  onItemUpdate?: (i: ItemUnit) => void
  props?: { hasManual?: boolean; reading?: ManualReading | null; manualAwaitingReview?: boolean; noItemUpdate?: boolean }
}) {
  const [item, setItem] = useState(initial)
  return (
    <MemoryRouter>
      <CareBlock
        item={item}
        homeId="h1"
        tasks={[]}
        chunks={[]}
        hasManual={props.hasManual ?? false}
        reading={props.reading}
        manualAwaitingReview={props.manualAwaitingReview}
        notificationsBlocked={false}
        onAddManual={vi.fn()}
        onItemUpdate={props.noItemUpdate ? undefined : (i) => { onItemUpdate?.(i); setItem(i) }}
      />
    </MemoryRouter>
  )
}

const card = () => screen.getByTestId("no-upkeep-card")
const chips = () => within(screen.getByRole("group", { name: "What is it?" })).getAllByRole("button")

beforeEach(() => {
  svc.updateItemUnit.mockReset().mockImplementation(async (_h: string, id: string, input: Record<string, unknown>) =>
    ({ data: { ...unit({}), item_unit_id: id, ...input }, error: null }))
  svc.getItemUnits.mockReset().mockResolvedValue({ data: [], error: null })
  svc.getRooms.mockReset().mockResolvedValue({ data: [{ room_id: "r-kitchen", name: "Kitchen" }], error: null })
})

describe("the chips", () => {
  it("are the add screen's labels for exactly the kinds with item-level care", () => {
    expect(WHAT_IS_IT_CHIPS.map((k) => k.label)).toEqual(["Dishwasher", "Washer", "Dryer", "Fridge", "Furnace"])
    const picked = (subType: string) => ({ display_name: "Bosch SHPM88Z75N", category: subType, brand: "Bosch", model: "SHPM88Z75N" })
    for (const k of KIND_CHIPS) {
      const offers = suggestionsForItem(picked(k.subType), []).length
      if (WHAT_IS_IT_CHIPS.includes(k)) expect(offers, k.label).toBeGreaterThan(0)
      // Water heater and Oven or range: picking them would show nothing.
      else expect(offers, k.label).toBe(0)
    }
  })
})

describe("an item we couldn't identify", () => {
  it("with a brand and model: the model line, the five chips, then the manual line and Add the Manual", () => {
    render(<Page initial={unit({})} />)
    expect(within(card()).getByText("No upkeep yet")).toBeInTheDocument()
    expect(within(card()).getByText("We couldn't tell what this is from its model. Pick one to see its typical care.")).toBeInTheDocument()
    expect(chips().map((b) => b.textContent)).toEqual(["Dishwasher", "Washer", "Dryer", "Fridge", "Furnace"])
    expect(within(card()).getByText("Or add the manual for the exact schedule.")).toBeInTheDocument()
    // Order on the card: line, chips, manual line, Add the Manual.
    const text = card().textContent ?? ""
    expect(text.indexOf("Pick one")).toBeLessThan(text.indexOf("Dishwasher"))
    expect(text.indexOf("Furnace")).toBeLessThan(text.indexOf("Or add the manual"))
    expect(text.indexOf("Or add the manual")).toBeLessThan(text.indexOf("Add the Manual"))
    // Add the Manual stays the card's ONE filled button; the chips are outlined, 44pt.
    const filled = within(card()).getAllByRole("button").filter((b) => (b.getAttribute("style") ?? "").includes("--hh-teal-fill"))
    expect(filled.map((b) => b.textContent)).toEqual(["Add the Manual"])
    for (const c of chips()) {
      expect(c.className).toMatch(/\bborder\b/)
      expect(c.className).toMatch(/min-h-11/)
    }
    expect(svc.updateItemUnit).not.toHaveBeenCalled()
  })

  it("picking Washer files it, renames the placeholder, and the card shows washers' typical care", async () => {
    const onItemUpdate = vi.fn()
    render(<Page initial={unit({})} onItemUpdate={onItemUpdate} />)
    fireEvent.click(screen.getByRole("button", { name: "Washer" }))
    await waitFor(() => expect(onItemUpdate).toHaveBeenCalledTimes(1))
    expect(svc.updateItemUnit).toHaveBeenCalledTimes(1)
    expect(svc.updateItemUnit).toHaveBeenCalledWith("h1", "i1", {
      item_category: "major_appliance", sub_type: "washing-machine", category: "washing-machine", display_name: "Washer",
    })
    expect(within(card()).getByText("Here's what most washers need. Add the manual for this one's exact schedule.")).toBeInTheDocument()
    expect(screen.getAllByTestId("suggested-card-row")[0]).toHaveTextContent("Run a tub-clean cycle")
    // The question is answered: the chips are not rendered any more.
    expect(screen.queryByRole("group", { name: "What is it?" })).toBeNull()
    expect(screen.queryByText("Or add the manual for the exact schedule.")).toBeNull()
  })

  it("a taken name gets the room, by the lookup's rule", async () => {
    svc.getItemUnits.mockResolvedValue({ data: [{ item_unit_id: "other", display_name: "Dryer" }], error: null })
    render(<Page initial={unit({})} />)
    fireEvent.click(screen.getByRole("button", { name: "Dryer" }))
    await waitFor(() => expect(svc.updateItemUnit).toHaveBeenCalledTimes(1))
    expect(svc.updateItemUnit.mock.calls[0][2]).toMatchObject({ display_name: "Dryer — Kitchen" })
  })

  it("a failed write shows the error, keeps the chips, and claims nothing", async () => {
    svc.updateItemUnit.mockResolvedValue({ data: null, error: { message: "offline" } })
    const onItemUpdate = vi.fn()
    render(<Page initial={unit({})} onItemUpdate={onItemUpdate} />)
    fireEvent.click(screen.getByRole("button", { name: "Fridge" }))
    await waitFor(() => expect(within(card()).getByRole("alert")).toHaveTextContent("Couldn't save that. Try again."))
    expect(chips()).toHaveLength(5)
    for (const c of chips()) expect(c).toBeEnabled()
    expect(onItemUpdate).not.toHaveBeenCalled()
    expect(screen.queryByText(/Here's what most/)).toBeNull()
    // A retry that lands clears the error.
    svc.updateItemUnit.mockImplementation(async (_h: string, id: string, input: Record<string, unknown>) =>
      ({ data: { ...unit({}), item_unit_id: id, ...input }, error: null }))
    fireEvent.click(screen.getByRole("button", { name: "Fridge" }))
    await waitFor(() => expect(onItemUpdate).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole("alert")).toBeNull()
  })
})

describe("where it does not render (not rendered: toBeNull)", () => {
  it.each([
    ["a known kind with typical care", unit({ display_name: "Dishwasher" }), {}],
    ["a known kind with none (a microwave)", unit({ display_name: "Sharp Microwave Drawer" }), {}],
    ["a kind she filed it under that the library has no care for", unit({ item_category: "major_appliance", sub_type: "garbage-disposal", category: "garbage-disposal" }), {}],
    ["a manual with nothing found", unit({}), { hasManual: true }],
    ["while the manual is read", unit({}), { reading: { stage: "claude_call", pages: 42 } as ManualReading }],
    ["while a read waits for review", unit({}), { manualAwaitingReview: true }],
    ["without the page's item update (the pick could not show)", unit({}), { noItemUpdate: true }],
  ])("%s", (_label, item, props) => {
    render(<Page initial={item} props={props} />)
    expect(screen.queryByTestId("what-is-it")).toBeNull()
    expect(screen.queryByText(/We couldn't tell what this is/)).toBeNull()
    expect(screen.queryByText("Or add the manual for the exact schedule.")).toBeNull()
  })
})

describe("an item she named herself (mock m4)", () => {
  // Quoted must-be-true lines:
  //  "An item she named herself, of a kind the library doesn't cover, shows no chips and no 'Pick what this is'."
  //  "An item still named by its brand and model keeps the chips, as shipped on Nov 25."
  //  "The card reads 'No typical care for this yet. Add its manual, or add your own task.'"
  //  "Add Your Own Task opens the form with this item picked."
  //  "Add the Manual is the one filled button."
  it.each([
    ["no brand or model", unit({ display_name: "Kitchen faucet", brand: null, model: null })],
    ["a brand and model, but a name she typed", unit({ display_name: "Kitchen faucet", brand: "Moen", model: "7594ESRS" })],
  ])("%s: no chips, the m4 line, Add the Manual (filled) over Add Your Own Task (outlined)", (_l, item) => {
    render(<Page initial={item} />)
    // Not rendered (toBeNull), not merely hidden.
    expect(screen.queryByTestId("what-is-it")).toBeNull()
    expect(screen.queryByText(/Pick what this is/)).toBeNull()
    expect(screen.queryByText(/Pick one to see/)).toBeNull()
    expect(within(card()).getByText("No typical care for this yet. Add its manual, or add your own task.")).toBeInTheDocument()
    const actions = screen.getByTestId("no-typical-care-actions")
    const manual = within(actions).getByRole("button", { name: "Add the Manual" })
    const own = within(actions).getByRole("link", { name: "Add Your Own Task" })
    expect(own).toHaveAttribute("href", "/maintenance/custom?item=i1")
    // Stacked at one width; the manual is the card's ONE filled control.
    expect(actions.className).toContain("flex-col")
    expect(manual.className).toContain("w-full")
    expect(own.className).toContain("w-full")
    const filled = [...card().querySelectorAll("button, a")].filter((b) => (b.getAttribute("style") ?? "").includes("--hh-teal-fill"))
    expect(filled.map((b) => b.textContent)).toEqual(["Add the Manual"])
    expect(own.className).toMatch(/\bborder\b/)
  })

  it("an item still called by its brand and model keeps the chips", () => {
    render(<Page initial={unit({})} />)
    expect(chips()).toHaveLength(5)
    expect(screen.queryByText("No typical care for this yet. Add its manual, or add your own task.")).toBeNull()
    expect(screen.queryByRole("link", { name: "Add Your Own Task" })).toBeNull()
  })

  it("a kind whose typical care she passed on keeps its sentence (Don't Add stays as it is)", () => {
    render(<Page initial={unit({ display_name: "Dishwasher", dismissed_care: ["dishwasher.filter"] })} />)
    expect(screen.queryAllByTestId("suggested-card-row")).toHaveLength(0)
    expect(screen.queryByText("No typical care for this yet. Add its manual, or add your own task.")).toBeNull()
    expect(within(card()).getByText("The manual is where this item's schedule, warranty window and answers come from.")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Add Your Own Task" })).toBeNull()
  })
})
