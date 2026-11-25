/**
 * Before-friends PR D: Replace or Keep Both, in the review.
 *
 * Must be true (design/before-friends-plan.md, PD1, and mock r4-m2-replace as
 * the owner amended it — plain, short, no last-done promise):
 *  - a matched maintenance row says, inside its row, "Replaces your typical
 *    task “…”" (Replace) or "Same as your typical task “…”?" (Keep Both), over
 *    a two-option radiogroup;
 *  - the default is Replace for a same-job (archetype) match and Keep Both for
 *    a wording-only (similarity) match (D11);
 *  - Save sends her answer as `onSave`'s fourth argument; toggling changes it;
 *  - a matched row she skips, or re-files as cleaning, shows nothing and
 *    sends nothing;
 *  - with no `typicalTasks` (the stored-task review) none of it is rendered.
 */
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { TaskReviewSheet } from "./TaskReviewSheet"
import type { PreviewResult, PreviewTask } from "@/modules/knowledge/types/previewTypes"
import type { TypicalTask } from "../../../shared/care/manualReplaces"

const task = (title: string, over: Partial<PreviewTask> = {}): PreviewTask => ({
  title, description: null, care_type: "maintenance", priority_tier: "recommended", risk_level: "performance",
  estimated_minutes: 10, schedule_type: "monthly", interval_days: null, instructions_text: null,
  symptom_tags: [], re_check_triggers: [], ...over,
})

const DRAFT: PreviewResult = {
  ok: true, chunks: [],
  tasks: [task("Clean the filter"), task("Replace water filter", { schedule_type: "semiannual" }), task("Run a cleaning cycle")],
}
const TYPICAL: TypicalTask[] = [
  { templateId: "t-dish", title: "Clean the dishwasher filter", libraryKey: "dishwasher.filter" },
  { templateId: "t-water", title: "Replace the water filter", libraryKey: "refrigerator.water" },
]

function renderSheet(typicalTasks: TypicalTask[] | null = TYPICAL) {
  const onSave = vi.fn().mockResolvedValue(null)
  render(
    <TaskReviewSheet freezeRiskFalse={false} notificationsBlocked={false} open onOpenChange={vi.fn()}
      itemName="Dishwasher" previewData={DRAFT} saving={false} onSave={onSave} focus="maintenance"
      presentation="inline" typicalTasks={typicalTasks ?? undefined} />,
  )
  return onSave
}

const panels = () => screen.queryAllByTestId("typical-replace")
const panelFor = (typicalTitle: string) => panels().find((p) => p.textContent?.includes(typicalTitle))!
const save = async (onSave: ReturnType<typeof vi.fn>) => {
  fireEvent.click(screen.getByRole("button", { name: /^Save all/ }))
  await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
  return onSave.mock.calls[0][3]
}

describe("Replace or Keep Both in the review (PR D)", () => {
  it("asks inside each matched row, with the D11 defaults", () => {
    renderSheet()
    expect(panels()).toHaveLength(2)

    const water = panelFor("Replace the water filter")
    expect(water).toHaveTextContent("Replaces your typical task “Replace the water filter”")
    expect(within(water).getByRole("radio", { name: "Replace" })).toHaveAttribute("aria-checked", "true")
    expect(within(water).getByRole("radio", { name: "Keep Both" })).toHaveAttribute("aria-checked", "false")

    // "Clean the filter" only shares wording with "Clean the dishwasher filter".
    const dish = panelFor("Clean the dishwasher filter")
    expect(dish).toHaveTextContent("Same as your typical task “Clean the dishwasher filter”?")
    expect(within(dish).getByRole("radio", { name: "Keep Both" })).toHaveAttribute("aria-checked", "true")
    expect(within(dish).getByRole("radiogroup")).toBeInTheDocument()

    // The row with no match asks nothing.
    expect(screen.getByText("Run a cleaning cycle").closest("[data-testid='typical-replace']")).toBeNull()
    // No promise the build does not keep (D2).
    expect(screen.queryByText(/last done date carries over/i)).toBeNull()
  })

  it("Save sends the defaults as the fourth argument", async () => {
    const onSave = renderSheet()
    expect(await save(onSave)).toEqual([
      { title: "Clean the filter", templateId: "t-dish", choice: "keep_both" },
      { title: "Replace water filter", templateId: "t-water", choice: "replace" },
    ])
  })

  it("toggling changes the line and what Save sends", async () => {
    const onSave = renderSheet()
    fireEvent.click(within(panelFor("Clean the dishwasher filter")).getByRole("radio", { name: "Replace" }))
    fireEvent.click(within(panelFor("Replace the water filter")).getByRole("radio", { name: "Keep Both" }))
    expect(panelFor("Clean the dishwasher filter")).toHaveTextContent("Replaces your typical task “Clean the dishwasher filter”")
    expect(panelFor("Replace the water filter")).toHaveTextContent("Same as your typical task “Replace the water filter”?")
    expect(await save(onSave)).toEqual([
      { title: "Clean the filter", templateId: "t-dish", choice: "replace" },
      { title: "Replace water filter", templateId: "t-water", choice: "keep_both" },
    ])
  })

  it("a skipped matched row shows nothing and sends nothing", async () => {
    const onSave = renderSheet()
    fireEvent.click(screen.getByLabelText("Skip Replace water filter"))
    expect(panels()).toHaveLength(1)
    expect(await save(onSave)).toEqual([{ title: "Clean the filter", templateId: "t-dish", choice: "keep_both" }])
  })

  it("a matched row re-filed as cleaning shows nothing and sends nothing", async () => {
    const onSave = renderSheet()
    fireEvent.click(screen.getByText("Clean the filter"))
    fireEvent.click(screen.getByRole("button", { name: /Cleaning/, pressed: false }))
    // Re-filed, it leaves Maintenance (Cleaning arrives tucked away, D4).
    expect(panels().map((p) => p.textContent)).toEqual([expect.stringContaining("Replace the water filter")])
    expect(await save(onSave)).toEqual([{ title: "Replace water filter", templateId: "t-water", choice: "replace" }])
  })

  it("the opened row asks the same question, so the walk never hides an answer Save will send", () => {
    renderSheet()
    fireEvent.click(screen.getByText("Replace water filter"))
    const opened = panelFor("Replace the water filter")
    expect(opened.closest("[data-expanded='true']")).not.toBeNull()
  })

  it("no typicalTasks (the stored-task review): not rendered at all, and Save sends none", async () => {
    const onSave = renderSheet(null)
    expect(screen.queryAllByTestId("typical-replace")).toHaveLength(0)
    expect(screen.queryAllByRole("radiogroup")).toHaveLength(0)
    expect(await save(onSave)).toEqual([])
  })
})

describe("the choice is a keyboard radio group (Codex review, PR D)", () => {
  it("one tab stop, and the arrow keys move the choice", () => {
    renderSheet()
    const water = panelFor("Replace the water filter")
    const replace = within(water).getByRole("radio", { name: "Replace" })
    const keep = within(water).getByRole("radio", { name: "Keep Both" })
    expect(replace).toHaveAttribute("tabindex", "0")
    expect(keep).toHaveAttribute("tabindex", "-1")
    fireEvent.keyDown(replace, { key: "ArrowRight" })
    expect(keep).toHaveAttribute("aria-checked", "true")
    expect(keep).toHaveFocus()
  })
})
