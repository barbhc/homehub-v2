/**
 * The one-at-a-time walk, and what a NEW draft does to the review.
 *
 * Both were restructured for the whole-app lint (H5) and neither had a unit
 * test: the walk's Keep / Skip used to be a callback handed into a render
 * helper (react-hooks/refs — it read the scroll ref), and the reset on a new
 * draft was setState in an effect (set-state-in-effect). Behaviour pinned:
 *
 *  - Skip ✕ excludes the row and moves on; Keep → keeps it and moves on; Keep
 *    on the last row leaves the walk, and every step scrolls back to the top.
 *  - Outside the walk the same card says "Done" and only closes.
 *  - A different draft starts the review over: decisions, the open card and
 *    the walk are all reset to the new rows.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { TaskReviewSheet } from "./TaskReviewSheet"
import type { PreviewResult, PreviewTask } from "@/modules/knowledge/types/previewTypes"

const task = (title: string, schedule_type: PreviewTask["schedule_type"] = "monthly"): PreviewTask => ({
  title, description: null, care_type: "maintenance", priority_tier: "essential", risk_level: "performance",
  estimated_minutes: 15, schedule_type, interval_days: null,
  instructions_text: null, symptom_tags: [], re_check_triggers: [],
})

const draft = (...titles: string[]): PreviewResult => ({ ok: true, chunks: [], tasks: titles.map((t) => task(t)) })

const DRYER = draft("Inspect vent ductwork", "Clean the moisture sensors", "Check the drum seal")

function Sheet({ previewData, onSave }: { previewData: PreviewResult; onSave: ReturnType<typeof vi.fn> }) {
  return (
    <TaskReviewSheet
      freezeRiskFalse={false} notificationsBlocked={false} open onOpenChange={vi.fn()}
      itemName="Dryer" previewData={previewData} saving={false} onSave={onSave}
    />
  )
}

const header = () => screen.getByText(/Deciding each task|from the manual/)

describe("the one-at-a-time walk", () => {
  const scrollTo = vi.fn()
  const realScrollTo = Element.prototype.scrollTo
  beforeEach(() => {
    scrollTo.mockClear()
    Element.prototype.scrollTo = scrollTo as unknown as typeof Element.prototype.scrollTo
  })
  afterEach(() => {
    Element.prototype.scrollTo = realScrollTo
  })

  it("Skip excludes and moves on, Keep keeps and moves on, the last Keep leaves the walk", async () => {
    const onSave = vi.fn().mockResolvedValue(null)
    render(<Sheet previewData={DRYER} onSave={onSave} />)

    fireEvent.click(screen.getByRole("button", { name: /Go through them one by one/ }))
    expect(header()).toHaveTextContent("Deciding each task · 1 of 3")
    expect(screen.getByText("Inspect vent ductwork")).toBeInTheDocument()

    scrollTo.mockClear()
    fireEvent.click(screen.getByRole("button", { name: "Skip ✕" }))
    expect(header()).toHaveTextContent("Deciding each task · 2 of 3")
    expect(screen.getByText("Clean the moisture sensors")).toBeInTheDocument()
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 })

    scrollTo.mockClear()
    fireEvent.click(screen.getByRole("button", { name: "Keep →" }))
    expect(header()).toHaveTextContent("Deciding each task · 3 of 3")
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 })

    scrollTo.mockClear()
    fireEvent.click(screen.getByRole("button", { name: "Keep →" }))
    // Out of the walk: back on the list, which offers the walk again.
    expect(header()).toHaveTextContent("3 things from the manual")
    expect(screen.getByRole("button", { name: /one by one again/ })).toBeInTheDocument()
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 })

    // The skipped row is the one thing Save leaves out.
    fireEvent.click(screen.getByRole("button", { name: "Save all 2" }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0].map((t: PreviewTask) => t.title)).toEqual([
      "Clean the moisture sensors",
      "Check the drum seal",
    ])
  })

  it("outside the walk the card says Done and only closes", () => {
    render(<Sheet previewData={DRYER} onSave={vi.fn()} />)
    fireEvent.click(screen.getByText("Check the drum seal").closest("button") as HTMLElement)
    expect(screen.queryByRole("button", { name: "Keep →" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    // Closed, and still on the list — not moved into a walk.
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull()
    expect(header()).toHaveTextContent("3 things from the manual")
  })
})

describe("a new draft starts the review over", () => {
  it("drops the old rows, the old decisions and the walk", async () => {
    const onSave = vi.fn().mockResolvedValue(null)
    const { rerender } = render(<Sheet previewData={DRYER} onSave={onSave} />)

    // A decision and a walk in progress on the first draft.
    fireEvent.click(screen.getByRole("button", { name: /Go through them one by one/ }))
    fireEvent.click(screen.getByRole("button", { name: "Skip ✕" }))
    expect(header()).toHaveTextContent("Deciding each task · 2 of 3")

    const RESCAN = draft("Replace the lint screen", "Inspect vent ductwork")
    rerender(<Sheet previewData={RESCAN} onSave={onSave} />)

    expect(header()).toHaveTextContent("2 things from the manual")
    expect(screen.queryByText("Clean the moisture sensors")).toBeNull()
    expect(screen.getByRole("button", { name: /Go through them one by one →/ })).toBeInTheDocument()
    // The skip belonged to the old draft's row, so nothing is excluded now.
    fireEvent.click(screen.getByRole("button", { name: "Save all 2" }))
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave.mock.calls[0][0].map((t: PreviewTask) => t.title)).toEqual([
      "Replace the lint screen",
      "Inspect vent ductwork",
    ])
  })
})
