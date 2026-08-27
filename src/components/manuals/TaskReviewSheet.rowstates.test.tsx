/**
 * The row's timing slot has three states, and they must stay distinguishable.
 *
 * Round 18, from the owner's review of the mockup: "I don't like the green chip
 * with the bell in it. I like to have the cadence be standardized, and then I
 * would like a bell … to just show that notifications are on."
 *
 * An earlier draft coloured the CHIP when a row notified. That makes the
 * cadences incomparable down the column — which is the one thing a column of
 * cadences is for. So:
 *
 *   scheduled + notifies   a plain chip, and a bell BESIDE it
 *   scheduled, quiet       the identical chip, no bell
 *   no cadence             no chip at all — "when needed", and no bell offered
 *
 * The bell's ABSENCE carries as much meaning as its presence, so these assert
 * both directions.
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { TaskReviewSheet } from "./TaskReviewSheet"
import type { PreviewResult, PreviewTask } from "@/modules/knowledge/types/previewTypes"

const task = (
  title: string,
  care_type: PreviewTask["care_type"],
  priority_tier: PreviewTask["priority_tier"],
  schedule_type: PreviewTask["schedule_type"],
): PreviewTask => ({
  title, description: null, care_type, priority_tier, risk_level: "performance",
  estimated_minutes: 10, schedule_type, interval_days: null,
  instructions_text: null, symptom_tags: [], re_check_triggers: [],
})

/** One row in each of the three states, plus a Usage row that has no timing. */
const DRAFT: PreviewResult = {
  ok: true,
  chunks: [],
  tasks: [
    task("Replace the furnace filter", "maintenance", "essential", "monthly"),   // notifies
    task("Clean the drawer guides", "cleaning", "recommended", "weekly"),        // quiet
    task("Descale when the light comes on", "maintenance", "recommended", "as_needed"), // no cadence
    task("Wipe the vent after use", "cleaning", "optional", "after_each_use"),   // Usage
  ],
}

function renderSheet() {
  render(
    <TaskReviewSheet open onOpenChange={vi.fn()} itemName="Furnace"
      previewData={DRAFT} saving={false} onSave={vi.fn().mockResolvedValue(null)} />,
  )
}

/** The row button containing this title. */
const rowFor = (title: string) => screen.getByText(title).closest("button") as HTMLElement

describe("state 1 — scheduled and notifying", () => {
  it("shows the cadence and a bell", () => {
    renderSheet()
    const row = rowFor("Replace the furnace filter")
    expect(within(row).getByText("Monthly")).toBeInTheDocument()
    expect(within(row).getByLabelText("Notifies you")).toBeInTheDocument()
  })
})

describe("state 2 — scheduled, quiet", () => {
  it("shows the same cadence chip and NO bell", () => {
    renderSheet()
    const row = rowFor("Clean the drawer guides")
    expect(within(row).getByText("Weekly")).toBeInTheDocument()
    expect(within(row).queryByLabelText("Notifies you")).toBeNull()
  })

  it("its chip is styled identically to the notifying row's", () => {
    renderSheet()
    const notifying = within(rowFor("Replace the furnace filter")).getByText("Monthly")
    const quiet = within(rowFor("Clean the drawer guides")).getByText("Weekly")
    // The whole point of the owner's note: only the bell varies.
    expect(quiet.className).toBe(notifying.className)
  })
})

describe("state 3 — no cadence", () => {
  it("says when needed, without a chip, and offers no bell", () => {
    renderSheet()
    const row = rowFor("Descale when the light comes on")
    expect(within(row).getByText("when needed")).toBeInTheDocument()
    expect(within(row).queryByLabelText("Notifies you")).toBeNull()
  })

  it("a Usage row states no timing at all", () => {
    renderSheet()
    const row = rowFor("Wipe the vent after use")
    expect(within(row).queryByText("when needed")).toBeNull()
    expect(within(row).queryByLabelText("Notifies you")).toBeNull()
  })
})

describe("the column as a whole", () => {
  it("marks exactly the rows that will reach the phone", () => {
    renderSheet()
    // Essential-only is the default (owner, 27 Aug), so one of four.
    expect(screen.getAllByLabelText("Notifies you")).toHaveLength(1)
    expect(screen.getByText(/of those will also notify your phone/)).toBeInTheDocument()
  })
})
