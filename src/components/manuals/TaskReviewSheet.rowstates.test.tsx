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
import { render, screen, within, fireEvent } from "@testing-library/react"
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

/**
 * Two defects the built screen showed and no test did. Both were caught by
 * looking at a screenshot next to the mockup — rule 2 — and both are the kind
 * that survive a green suite because the wrong output is still well-formed.
 */
describe("what the screenshots caught", () => {
  it("does not echo the section name back as a pill on its own rows", () => {
    renderSheet()
    // The old rule excluded only Setup and Tips, because those were the only
    // sections named after a kind. Now every section is, so a Maintenance row
    // inside Maintenance was captioned "Maintenance".
    const row = rowFor("Replace the furnace filter")
    expect(within(row).queryByText("Maintenance")).toBeNull()
    const cleaningRow = rowFor("Clean the drawer guides")
    expect(within(cleaningRow).queryByText("Cleaning")).toBeNull()
  })

  it("hides the kind on every row a fresh parse can produce", () => {
    // Worth stating plainly, because writing this test is what showed it: under
    // kind grouping the bucket is DERIVED from the kind, so the two agree on
    // every row the parser can produce and the pill never renders.
    //
    // The `kind.id !== b` guard is kept rather than deleted because one case
    // can still diverge — a user picking Usage on safety work, which the
    // taxonomy re-routes to Maintenance rather than letting it become a tip.
    // Then the row is in Maintenance and captioned "Usage", which is exactly
    // the disagreement worth surfacing. It is unreachable from a parse, so it
    // is asserted at the routing level in reviewBuckets.test.ts instead of
    // faked here.
    renderSheet()
    for (const label of ["Maintenance", "Cleaning", "Usage", "Setup"]) {
      const pills = screen.queryAllByText(label).filter((el) => el.closest("button")?.dataset.id !== undefined)
      expect(pills, `${label} appears as a row pill`).toHaveLength(0)
    }
  })

  it("never points at a step that no longer exists", () => {
    renderSheet()
    fireEvent.click(screen.getByText("Replace the furnace filter"))
    // "adjust it on the next step" survived the two-screen deletion: still
    // grammatical, still plausible, pointing at nothing.
    expect(screen.queryByText(/next step/)).toBeNull()
    expect(screen.getByText(/change it below/)).toBeInTheDocument()
  })
})
