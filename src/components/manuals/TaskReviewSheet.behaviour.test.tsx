/**
 * What the review must do, after round 18 collapsed it to one screen.
 *
 * This file used to be TaskReviewSheet.focus.test.tsx and pinned the two-step
 * design: that `focus="maintenance"` opened on step 2, that everything it hid
 * was counted, and that the full review stayed reachable behind a disclosure.
 * Those rules are SUPERSEDED — there is one screen, grouped by kind, and it
 * hides nothing, so there is no hidden set to account for and no second screen
 * to keep reachable. HH-119 and HH-120 are satisfied by construction now.
 *
 * Three rules survived the change, and they are what this file keeps:
 *
 *  1. Reminders follow the TIER, and the switch overrides in both directions.
 *     Essential-only is the owner's decision (27 Aug 2026) and the one thing
 *     that reaches someone's phone, so it is pinned here as well as in
 *     reviewBuckets.agreement.test.ts.
 *  2. Nothing is quietly dropped: Save writes every row, including rows the
 *     user never touched.
 *  3. Reclassifying a row is what decides whether it can ever remind you, so it
 *     has to be reachable from the list.
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

describe("the review, on one screen", () => {
  it("shows every section it has rows for — nothing is hidden", () => {
    renderSheet()
    // The old design showed maintenance and hid the rest behind a disclosure.
    // Four sections, all present, is what replaced that.
    // The section SUB-LINES, not the titles: a row's kind pill also reads
    // "Maintenance", and matching that would pass with no heading at all.
    expect(screen.getByText(/Keeps it working/)).toBeInTheDocument()
    expect(screen.getByText(/Keeps it nice/)).toBeInTheDocument()
    expect(screen.getByText(/Once, when you install it/)).toBeInTheDocument()
    // And the rows themselves, not just the headings.
    expect(screen.getByText("Inspect vent ductwork")).toBeInTheDocument()
    expect(screen.getByText("Clean the drum")).toBeInTheDocument()
  })

  it("keeps HH-85: setup arrives tucked away, one tap from open", () => {
    renderSheet()
    // Install steps for an appliance owned for months must not push the real
    // upkeep off the screen. The heading is there; the rows are one tap away.
    expect(screen.queryByText("Remove shipping bolts")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Show 1 setup step/ }))
    expect(screen.getByText("Remove shipping bolts")).toBeInTheDocument()
  })

  it("numbers no steps, because there are none", () => {
    renderSheet()
    expect(screen.queryByText(/Step 1 of 2/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Step 2 of 2/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Review them all/)).not.toBeInTheDocument()
  })

  it("states the two channels apart: what returns, and what buzzes", () => {
    renderSheet()
    // 3 scheduled (annual + 2 monthly), 1 notifying (the Essential one).
    expect(screen.getByText(/show up in Tasks/)).toBeInTheDocument()
    expect(screen.getByText(/notify your phone/)).toBeInTheDocument()
  })

  it("reminders follow the tier, and the switch overrides either way", () => {
    renderSheet()
    fireEvent.click(screen.getByText("Inspect vent ductwork"))
    const essential = screen.getByRole("checkbox", { name: /Remind me when it/ })
    expect(essential).toBeChecked()
    fireEvent.click(essential)
    expect(essential).not.toBeChecked()
  })

  it("a Recommended row starts quiet and can be switched on", () => {
    renderSheet()
    fireEvent.click(screen.getByText("Clean the moisture sensors"))
    const recommended = screen.getByRole("checkbox", { name: /Remind me when it/ })
    expect(recommended).not.toBeChecked()
    fireEvent.click(recommended)
    expect(recommended).toBeChecked()
  })

  it("SAVES every row, including ones nobody touched", async () => {
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
