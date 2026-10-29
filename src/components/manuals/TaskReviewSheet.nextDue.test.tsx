/**
 * Review tasks shows where a changed cadence puts the date BEFORE Save — the
 * owner's rule (2026-10-28, "from when you last did it"), computed by the same
 * planFor the save runs (taskReviewService). Pinned here:
 *  - an untouched row claims nothing (no line) — re-saving must not move dates;
 *  - a changed cadence shows "Next due: <date>" counted from the last completion;
 *  - going seasonal with no known season ASKS, and Save waits for the answer,
 *    which then travels to the save;
 *  - "Take off schedule" says there will be no date.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { TaskReviewSheet } from "./TaskReviewSheet"
import type { PreviewChunk, PreviewResult, PreviewTask } from "@/modules/knowledge/types/previewTypes"
import type { CadenceFacts } from "@/modules/care/services/cadenceChangeService"

// The rule reads "today"; pin it so the dates below are stable.
beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-28T10:00:00-07:00")) })
afterAll(() => vi.useRealTimers())

const task = (template_id: string, title: string, over: Partial<PreviewTask> = {}): PreviewTask => ({
  template_id, title, description: "Rinse the mesh and let it dry.", care_type: "maintenance",
  priority_tier: "recommended", risk_level: "performance", estimated_minutes: 10, schedule_type: "monthly",
  interval_days: null, instructions_text: null, symptom_tags: [], re_check_triggers: [], season: null, ...over,
})
const DATA: PreviewResult = { ok: true, chunks: [], tasks: [task("tpl-a", "Clean the pre-filter")] }
const FACTS = new Map<string, CadenceFacts>([[
  "tpl-a",
  {
    scheduleType: "monthly", intervalDays: null, season: null, lastDoneOn: "2026-10-20", addedOn: "2026-03-01",
    open: [{ id: "i-a", status: "scheduled", dueDate: "2026-11-20", snoozedUntil: null }],
  },
]])

function renderSheet() {
  const onSave = vi.fn<(t: PreviewTask[], c: PreviewChunk[]) => Promise<string | null>>().mockResolvedValue(null)
  render(
    <TaskReviewSheet
      freezeRiskFalse={false} notificationsBlocked={false} open onOpenChange={vi.fn()}
      itemName="Coway purifier" previewData={DATA} alreadySaved cadenceFacts={FACTS}
      onSave={onSave} saving={false}
    />,
  )
  fireEvent.click(screen.getByText("Clean the pre-filter").closest("button") as HTMLElement)
  const card = document.querySelector("[data-expanded='true']") as HTMLElement
  return { onSave, card }
}

describe("Review tasks · Next due before Save", () => {
  it("an untouched cadence claims no new date", () => {
    const { card } = renderSheet()
    expect(within(card).queryByTestId("next-due")).toBeNull()
  })

  it("monthly → every 2 weeks shows two weeks after the last completion", () => {
    const { card } = renderSheet()
    fireEvent.click(within(card).getByRole("button", { name: "Something else…" }))
    expect(within(card).getByTestId("next-due")).toHaveTextContent(/^Next due: Nov 3$/)
    fireEvent.click(within(card).getByRole("button", { name: "Quarterly" }))
    expect(within(card).getByTestId("next-due")).toHaveTextContent(/^Next due: Jan 20, 2027$/)
  })

  it("seasonal with no known season asks, holds Save, then carries the answer to the save", () => {
    const { card, onSave } = renderSheet()
    fireEvent.click(within(card).getByRole("button", { name: "Seasonal" }))
    expect(within(card).getByText("Which season?")).toBeInTheDocument()
    expect(within(card).queryByTestId("next-due")).toBeNull()
    const save = screen.getByRole("button", { name: "Save changes" })
    expect(save).toBeDisabled()
    expect(screen.getByText(/Pick a season for “Clean the pre-filter” to save\./)).toBeInTheDocument()

    fireEvent.click(within(card).getByRole("button", { name: "Spring" }))
    expect(within(card).getByTestId("next-due")).toHaveTextContent(/^Next due: Apr 15, 2027$/)
    expect(save).toBeEnabled()
    fireEvent.click(save)
    const [tasks] = onSave.mock.calls[0]
    expect(tasks[0]).toMatchObject({ template_id: "tpl-a", schedule_type: "seasonal", season: "spring" })
  })

  it("taking it off the schedule says there is no date", () => {
    const { card } = renderSheet()
    fireEvent.click(within(card).getByRole("button", { name: "Take off schedule" }))
    expect(within(card).getByTestId("next-due")).toHaveTextContent(/^No due date$/)
  })

  it("an untouched review is 'Done'; a 'last done' date or a new interval makes it 'Save changes'", () => {
    const { card } = renderSheet()
    // The opened card has its own "Done"; the footer's is the one outside it.
    expect(screen.getAllByRole("button", { name: "Done" }).filter((b) => !card.contains(b))).toHaveLength(1)
    fireEvent.click(within(card).getByRole("button", { name: /been doing this already/ }))
    // Claimed today (Oct 28), later than the Oct 20 completion → a month on.
    expect(within(card).getByTestId("next-due")).toHaveTextContent(/^Next due: Nov 28$/)
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument()
  })

  it("an every-N-days interval change counts as a schedule edit", () => {
    const facts = new Map(FACTS)
    facts.set("tpl-a", { ...FACTS.get("tpl-a")!, scheduleType: "every_n_days", intervalDays: 14 })
    const onSave = vi.fn<(t: PreviewTask[], c: PreviewChunk[], e: { schedule: number }) => Promise<string | null>>().mockResolvedValue(null)
    render(
      <TaskReviewSheet
        freezeRiskFalse={false} notificationsBlocked={false} open onOpenChange={vi.fn()}
        itemName="Coway purifier" previewData={{ ok: true, chunks: [], tasks: [task("tpl-a", "Clean the pre-filter", { schedule_type: "every_n_days", interval_days: 14 })] }}
        alreadySaved cadenceFacts={facts} onSave={onSave} saving={false}
      />,
    )
    fireEvent.click(screen.getByText("Clean the pre-filter").closest("button") as HTMLElement)
    const card = document.querySelector("[data-expanded='true']") as HTMLElement
    fireEvent.change(within(card).getByLabelText("Every"), { target: { value: "3" } })
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))
    expect(onSave.mock.calls[0][2].schedule).toBe(1)
  })
})
