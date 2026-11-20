/**
 * D4 — the review after a scan, as approved (mock 2026-11-19, both screens):
 * https://claude.ai/artifact/Ao4AvquYrsTwZDs4oUUSuo
 *
 * Each `it` is one line of the mock's "Must be true when it is built" list, and
 * says which. The example is the mock's own: an LG washer whose read found 13
 * things, on a home at "Recommended too".
 *
 * Absence is asserted the way CLAUDE.md rule 3 asks: `not.toBeInTheDocument()`
 * here means NOT RENDERED (a tucked row is not in the DOM at all), which is
 * what "not listed until tapped" means.
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { TaskReviewSheet } from "./TaskReviewSheet"
import type { PreviewChunk, PreviewResult, PreviewTask } from "@/modules/knowledge/types/previewTypes"
import type { ReviewEditSummary } from "./TaskReviewFeedback"
import type { TaskLevel } from "../../../shared/tasks/taskLevel"

const t = (
  title: string,
  care_type: PreviewTask["care_type"] | "operating",
  schedule_type: PreviewTask["schedule_type"],
  priority_tier: PreviewTask["priority_tier"],
): PreviewTask => ({
  // "operating" is what the parser sends for a usage habit; the stored type is narrower.
  title, description: null, care_type: care_type as PreviewTask["care_type"], priority_tier, risk_level: "performance",
  estimated_minutes: 10, schedule_type, interval_days: null,
  instructions_text: null, symptom_tags: [], re_check_triggers: [],
})

const WASHER: PreviewResult = {
  ok: true,
  chunks: [],
  tasks: [
    t("Check the Water Inlet Hoses for Cracks", "maintenance", "annual", "essential"),
    t("Run the Tub Clean Cycle", "maintenance", "monthly", "recommended"),
    t("Clean the Drain Pump Filter", "maintenance", "as_needed", "recommended"),
    t("Clean the Water Inlet Filters", "maintenance", "as_needed", "recommended"),
    t("Check That the Washer Is Level", "maintenance", "annual", "optional"),
    t("Clean the Detergent Dispenser Drawer", "cleaning", "monthly", "recommended"),
    t("Clean the Exterior", "cleaning", "as_needed", "optional"),
    t("Wipe the Door Gasket and Glass", "cleaning", "after_each_use", "recommended"),
    t("Leave the Door Open After a Wash", "operating", "after_each_use", "recommended"),
    t("Use HE Detergent Only", "operating", "after_each_use", "recommended"),
    t("Remove the Shipping Bolts", "maintenance", "setup", "essential"),
    t("Connect the Drain Hose", "maintenance", "setup", "essential"),
    t("Level the Washer", "maintenance", "setup", "recommended"),
  ],
}
const LG = { display_name: "LG Front Load Washer", category: "washer" }
type Save = (tasks: PreviewTask[], chunks: PreviewChunk[], edits: ReviewEditSummary) => Promise<string | null>

function review(over: {
  taskLevel?: TaskLevel; careItem?: typeof LG | undefined; alreadySaved?: boolean; data?: PreviewResult
  onChangeTaskLevel?: () => void
} = {}) {
  const onSave = vi.fn<Save>().mockResolvedValue(null)
  render(
    <TaskReviewSheet freezeRiskFalse={false} notificationsBlocked={false} open onOpenChange={vi.fn()}
      itemName="LG Front Load Washer" previewData={over.data ?? WASHER} saving={false} onSave={onSave}
      taskLevel={"taskLevel" in over ? over.taskLevel : "recommended"}
      careItem={"careItem" in over ? over.careItem : LG}
      alreadySaved={over.alreadySaved}
      onChangeTaskLevel={over.onChangeTaskLevel ?? vi.fn()} />,
  )
  return onSave
}
const row = (title: string) => screen.getByText(title).closest("button") as HTMLElement
const skipOf = (title: string) => document.querySelector(`[aria-label="Skip ${title}"]`)
const bringBackOf = (title: string) => document.querySelector(`[aria-label="Bring back ${title}"]`)

describe("forgettable filters get a usual interval (must-be-true 1, 2, 6)", () => {
  it("a filter the manual leaves 'when needed' shows the usual interval and says whose it is", () => {
    review()
    const drain = row("Clean the Drain Pump Filter")
    expect(drain).toHaveTextContent("Quarterly")
    expect(drain).toHaveTextContent("Typical for washers")
    expect(drain).not.toHaveTextContent("when needed")
    const inlet = row("Clean the Water Inlet Filters")
    expect(inlet).toHaveTextContent("Twice a year")
    expect(inlet).toHaveTextContent("Typical for washers")
  })

  it("only when the care list has one for this kind of appliance", () => {
    review({ careItem: { display_name: "Vitamix Blender", category: "blender" } })
    expect(row("Clean the Drain Pump Filter")).toHaveTextContent("when needed")
    expect(screen.queryByText(/Typical for/)).not.toBeInTheDocument()
  })

  it("the manual's own cadence is never replaced", () => {
    review()
    expect(row("Run the Tub Clean Cycle")).toHaveTextContent("Monthly")
    expect(row("Run the Tub Clean Cycle")).not.toHaveTextContent("Typical for")
  })

  it("the count includes them: 4 will show up in Tasks", () => {
    review()
    expect(screen.getByText("4 will show up in Tasks")).toBeInTheDocument()
  })

  it("can be set back to 'when needed' before saving — and then stops calling itself typical", () => {
    review()
    fireEvent.click(row("Clean the Drain Pump Filter"))
    fireEvent.click(screen.getByRole("button", { name: /^As needed$/ }))
    fireEvent.click(screen.getByRole("button", { name: /^Done$/ }))
    expect(row("Clean the Drain Pump Filter")).toHaveTextContent("when needed")
    expect(row("Clean the Drain Pump Filter")).not.toHaveTextContent("Typical for")
    expect(screen.getByText("3 will show up in Tasks")).toBeInTheDocument()
  })

  it("can be skipped like any other row", () => {
    review()
    fireEvent.click(skipOf("Clean the Drain Pump Filter")!)
    expect(bringBackOf("Clean the Drain Pump Filter")).not.toBeNull()
    expect(screen.getByText("3 will show up in Tasks")).toBeInTheDocument()
  })

  it("saves the usual interval, and does not report it as a correction of the parser", async () => {
    const onSave = review()
    fireEvent.click(screen.getByRole("button", { name: "Save all 12" }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const [tasks, , edits] = onSave.mock.calls[0]
    const saved = Object.fromEntries(tasks.map((x) => [x.title, x.schedule_type]))
    expect(saved["Clean the Drain Pump Filter"]).toBe("quarterly")
    expect(saved["Clean the Water Inlet Filters"]).toBe("semiannual")
    expect(edits.total).toBe(0)
  })
})

describe("the task level (must-be-true 3, 4)", () => {
  it("at Recommended too, an Optional task headed for Tasks starts skipped and can be brought back", () => {
    review()
    expect(bringBackOf("Check That the Washer Is Level")).not.toBeNull()
    expect(skipOf("Check the Water Inlet Hoses for Cracks")).not.toBeNull()
    expect(skipOf("Run the Tub Clean Cycle")).not.toBeNull()
    fireEvent.click(bringBackOf("Check That the Washer Is Level")!)
    expect(skipOf("Check That the Washer Is Level")).not.toBeNull()
    expect(screen.getByText("5 will show up in Tasks")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save all 13" })).toBeInTheDocument()
  })

  it("at Essential only, Recommended tasks headed for Tasks start skipped too", () => {
    review({ taskLevel: "essential" })
    expect(bringBackOf("Run the Tub Clean Cycle")).not.toBeNull()
    expect(bringBackOf("Clean the Drain Pump Filter")).not.toBeNull()
    expect(skipOf("Check the Water Inlet Hoses for Cracks")).not.toBeNull()
    expect(screen.getByText("1 will show up in Tasks")).toBeInTheDocument()
  })

  it("at Everything, nothing starts skipped", () => {
    review({ taskLevel: "everything" })
    expect(document.querySelectorAll('[aria-label^="Bring back"]')).toHaveLength(0)
  })

  it("a skipped row is not saved, and being skipped by the level is not the reviewer's edit", async () => {
    const onSave = review()
    fireEvent.click(screen.getByRole("button", { name: "Save all 12" }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const [tasks, , edits] = onSave.mock.calls[0]
    expect(tasks.map((x) => x.title)).not.toContain("Check That the Washer Is Level")
    expect(edits.skipped).toBe(0)
  })

  it("only rows headed for Tasks are skipped: an Optional cleaning job that lives on the item page is kept", async () => {
    const onSave = review()
    fireEvent.click(screen.getByRole("button", { name: "Save all 12" }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0].map((x) => x.title)).toContain("Clean the Exterior")
  })

  it("names the level and offers Change", () => {
    const onChangeTaskLevel = vi.fn()
    review({ onChangeTaskLevel })
    expect(screen.getByText(/Task level:/)).toHaveTextContent("Task level: Recommended too")
    fireEvent.click(screen.getByRole("button", { name: "Change" }))
    expect(onChangeTaskLevel).toHaveBeenCalledTimes(1)
  })

  it("a home that never picked a level sees the review it always had: no level line, nothing skipped", () => {
    review({ taskLevel: undefined })
    expect(screen.queryByText(/Task level:/)).not.toBeInTheDocument()
    expect(document.querySelectorAll('[aria-label^="Bring back"]')).toHaveLength(0)
  })
})

describe("Cleaning and Usage arrive tucked away (must-be-true 5)", () => {
  it("their rows are not rendered until the Show button is tapped", () => {
    review()
    expect(screen.queryByText("Clean the Detergent Dispenser Drawer")).not.toBeInTheDocument()
    expect(screen.queryByText("Leave the Door Open After a Wash")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Show 2 cleaning jobs" }))
    expect(screen.getByText("Clean the Detergent Dispenser Drawer")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Show 3 tips" }))
    expect(screen.getByText("Leave the Door Open After a Wash")).toBeInTheDocument()
  })

  it("they are still saved to the item's page", async () => {
    const onSave = review()
    fireEvent.click(screen.getByRole("button", { name: "Save all 12" }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    const [tasks, chunks] = onSave.mock.calls[0]
    expect(tasks.map((x) => x.title)).toContain("Clean the Detergent Dispenser Drawer")
    expect(chunks.map((c) => c.title)).toContain("Leave the Door Open After a Wash")
  })

  it("a read with no Maintenance tucks nothing — there is nothing to make room for", () => {
    review({ data: { ok: true, chunks: [], tasks: [t("Clean the Exterior", "cleaning", "monthly", "recommended")] } })
    expect(screen.getByText("Clean the Exterior")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /^Show \d+ cleaning/ })).not.toBeInTheDocument()
  })
})

describe("re-reviewing tasks you already have (must-be-true 7)", () => {
  it("skips nothing, tucks nothing, re-times nothing, and names no level", () => {
    review({ alreadySaved: true, taskLevel: undefined, careItem: undefined })
    expect(document.querySelectorAll('[aria-label^="Bring back"]')).toHaveLength(0)
    expect(screen.getByText("Clean the Detergent Dispenser Drawer")).toBeInTheDocument()
    expect(row("Clean the Drain Pump Filter")).toHaveTextContent("when needed")
    expect(screen.queryByText(/Typical for/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Task level:/)).not.toBeInTheDocument()
  })
})
