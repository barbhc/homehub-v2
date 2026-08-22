/**
 * The one review the living-item-page flow asks for.
 *
 * `focus="maintenance"` opens straight on the schedule screen and lists only
 * the upkeep that needs a decision. Cleaning jobs, setup steps and per-use tips
 * are still SAVED — they appear on the item page in their own sections — they
 * just stop being three more things to answer before anything works.
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { TaskReviewSheet } from "./TaskReviewSheet"
import type { PreviewResult, PreviewTask } from "@/modules/knowledge/types/previewTypes"

const task = (
  title: string,
  care_type: PreviewTask["care_type"],
  priority_tier: PreviewTask["priority_tier"],
  schedule_type: PreviewTask["schedule_type"],
): PreviewTask => ({
  title, description: null, care_type, priority_tier, risk_level: "performance",
  estimated_minutes: 15, schedule_type, interval_days: null,
  instructions_text: null, symptom_tags: [], re_check_triggers: [],
})

const DRAFT: PreviewResult = {
  ok: true,
  chunks: [],
  tasks: [
    task("Inspect vent ductwork", "maintenance", "essential", "annual"),
    task("Clean the moisture sensors", "maintenance", "recommended", "monthly"),
    task("Clean the drum", "cleaning", "recommended", "monthly"),
    task("Wipe the door gasket", "cleaning", "optional", "monthly"),
    task("Remove shipping bolts", "maintenance", "essential", "setup"),
  ],
}

function renderSheet(onSave = vi.fn().mockResolvedValue(null)) {
  render(
    <TaskReviewSheet
      open
      onOpenChange={vi.fn()}
      itemName="Dryer"
      previewData={DRAFT}
      saving={false}
      onSave={onSave}
      focus="maintenance"
    />
  )
  return onSave
}

describe("TaskReviewSheet — maintenance focus", () => {
  it("opens on the schedule screen, not the what-is-it step", () => {
    renderSheet()
    expect(screen.getByText("Maintenance · how often & reminders")).toBeInTheDocument()
    expect(screen.queryByText("Step 1 of 2 · What each task is")).not.toBeInTheDocument()
  })

  it("lists maintenance only, and says where the cleaning went", () => {
    renderSheet()
    expect(screen.getByText("Inspect vent ductwork")).toBeInTheDocument()
    expect(screen.getByText("Clean the moisture sensors")).toBeInTheDocument()
    // Scheduled cleaning is real work — it just lives in the guides.
    expect(screen.queryByText("Clean the drum")).not.toBeInTheDocument()
    expect(screen.getByText(/2 cleaning jobs stay in your guides/)).toBeInTheDocument()
    // A setup step has no cadence to choose, so it is not on this screen either.
    expect(screen.queryByText("Remove shipping bolts")).not.toBeInTheDocument()
  })

  it("keeps the full review one tap away", () => {
    renderSheet()
    fireEvent.click(screen.getByRole("button", { name: "Review everything" }))
    expect(screen.getByText("Step 1 of 2 · What each task is")).toBeInTheDocument()
    expect(screen.getByText("Clean the drum")).toBeInTheDocument()
  })

  it("reminders follow the tier, and the switch overrides either way", () => {
    renderSheet()
    const essential = screen.getByRole("switch", { name: /Inspect vent ductwork/ })
    const recommended = screen.getByRole("switch", { name: /Clean the moisture sensors/ })
    expect(essential).toHaveAttribute("aria-checked", "true")
    expect(recommended).toHaveAttribute("aria-checked", "false")

    fireEvent.click(recommended)
    expect(recommended).toHaveAttribute("aria-checked", "true")
    fireEvent.click(essential)
    expect(essential).toHaveAttribute("aria-checked", "false")
  })

  it("SAVES the tasks it never showed — nothing is quietly dropped", async () => {
    const onSave = renderSheet()
    fireEvent.click(screen.getByRole("button", { name: /^Save / }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    const saved = (onSave.mock.calls[0][0] as PreviewTask[]).map((t) => t.title)
    expect(saved).toEqual(expect.arrayContaining([
      "Inspect vent ductwork", "Clean the moisture sensors",
      "Clean the drum", "Wipe the door gasket", "Remove shipping bolts",
    ]))
  })
})
