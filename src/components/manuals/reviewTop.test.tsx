/**
 * The part of the review above the tasks, and the two bugs it was showing.
 *
 * All of it from one QA pass on a Bosch dishwasher: two boxes saying the same
 * three facts, the top one styled like a button, a freeze task in a home with
 * no freeze risk, and a first-use step filed as recurring upkeep.
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { TaskReviewSheet } from "./TaskReviewSheet"
import type { PreviewResult } from "@/modules/knowledge"

const task = (over: Record<string, unknown> = {}) => ({
  title: "Clean the Filter System", description: "", justification: null,
  care_type: "maintenance", priority_tier: "essential", risk_level: "prevent_damage",
  estimated_minutes: 10, schedule_type: "quarterly", interval_days: null,
  instructions_text: "", source_page: 1, tags: [], ...over,
})

const preview = (tasks: unknown[]): PreviewResult =>
  ({ tasks, chunks: [], cleaning_guide: null, warranty: null } as unknown as PreviewResult)

const sheet = (data: PreviewResult, props: Record<string, unknown> = {}) =>
  render(
    <TaskReviewSheet
      open onOpenChange={vi.fn()} itemName="Bosch SHPM65Z55N/01"
      previewData={data} onSave={vi.fn()} saving={false} focus="all" {...props}
    />,
  )

describe("the explainer", () => {
  it("says when tasks appear without naming a due date or a cadence", () => {
    sheet(preview([task()]))
    expect(screen.getByText(/will show up in Tasks/)).toBeInTheDocument()
    expect(screen.queryByText(/cadence/i)).toBeNull()
    expect(screen.queryByText(/on its due date/i)).toBeNull()
  })

  it("drops the editorialising", () => {
    sheet(preview([task()]))
    expect(screen.queryByText(/never chase you/i)).toBeNull()
  })

  it("no longer says the same facts twice in two boxes", () => {
    // The white summary used to restate the teal explainer as numbers.
    sheet(preview([task()]))
    expect(screen.queryByText(/Here’s what saving these does/)).toBeNull()
    expect(screen.getAllByText(/will show up in Tasks/)).toHaveLength(1)
  })

  it("offers BOTH routes through the list", () => {
    sheet(preview([task()]))
    expect(screen.getByRole("button", { name: /Go through them one by one/ })).toBeInTheDocument()
    expect(screen.getByText(/or tap any task to change it/)).toBeInTheDocument()
  })
})

describe("the two bugs it was showing", () => {
  it("hides freeze prep in a home with no freeze risk", () => {
    const data = preview([task(), task({ title: "Winterize the Dishwasher", schedule_type: "seasonal" })])
    sheet(data, { freezeRiskFalse: true })
    expect(screen.queryByText(/Winterize/)).toBeNull()
    expect(screen.getByText(/Clean the Filter System/)).toBeInTheDocument()
  })

  it("still shows it when the home DOES freeze", () => {
    const data = preview([task({ title: "Winterize the Dishwasher", schedule_type: "seasonal" })])
    sheet(data, { freezeRiskFalse: false })
    expect(screen.getByText(/Winterize/)).toBeInTheDocument()
  })

  it("files a first-use step under Setup, not Maintenance", () => {
    const data = preview([task({
      title: "Purge Hot Water Lines Before First Use", schedule_type: "as_needed",
    })])
    sheet(data)
    // Setup arrives collapsed by design (HH-85), so the row itself is not on
    // screen. What matters is where it was FILED: a Setup section exists, and
    // the upkeep list the user is asked to schedule no longer contains it.
    expect(screen.getByText(/^Setup$/)).toBeInTheDocument()
    expect(screen.queryByText(/^Maintenance$/)).toBeNull()
  })
})
