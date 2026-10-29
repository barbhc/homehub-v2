/**
 * The item page's "Review tasks" hands back rows that say WHICH stored task
 * each one is (`template_id`), so its save writes by identity, not by title.
 *
 * Two "Clean the filter" tasks on one item are two tasks. When the review was
 * keyed by title, both rows' edits landed on one of them (audit 2026-10-28);
 * the save service now refuses any row without an id it loaded
 * (taskReviewIdentity.integration.test.ts proves that against the emulator).
 * This pins the sheet's half: every row it hands back still carries its id,
 * including a row turned into a tip, which leaves as a chunk.
 */
import { describe, it, expect, vi } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { TaskReviewSheet } from "./TaskReviewSheet"
import type { PreviewChunk, PreviewResult, PreviewTask } from "@/modules/knowledge/types/previewTypes"
import { USAGE_TIP_TAG } from "../../../shared/tasks/taxonomy"

const task = (template_id: string, title: string): PreviewTask => ({
  template_id, title, description: "Rinse the mesh and let it dry.", care_type: "maintenance",
  priority_tier: "recommended", risk_level: "performance", estimated_minutes: 10, schedule_type: "monthly",
  interval_days: null, instructions_text: null, symptom_tags: [], re_check_triggers: [],
})

const TWINS: PreviewResult = {
  ok: true,
  chunks: [],
  tasks: [task("tpl-a", "Clean the filter"), task("tpl-b", "Clean the filter"), task("tpl-c", "Check the drain hose")],
}

function renderSheet() {
  const onSave = vi.fn<(t: PreviewTask[], c: PreviewChunk[]) => Promise<string | null>>().mockResolvedValue(null)
  render(
    <TaskReviewSheet
      freezeRiskFalse={false}
      notificationsBlocked={false}
      open
      onOpenChange={vi.fn()}
      itemName="Range hood"
      previewData={TWINS}
      alreadySaved
      onSave={onSave}
      saving={false}
    />,
  )
  return onSave
}

describe("existing-task review carries each task's id to the save", () => {
  it("both same-titled rows come back, each with its own id", () => {
    const onSave = renderSheet()
    fireEvent.click(screen.getByRole("button", { name: /^(Done|Save changes)$/ }))
    const [tasks] = onSave.mock.calls[0]
    expect(tasks.map((t) => [t.title, t.template_id])).toEqual([
      ["Clean the filter", "tpl-a"], ["Clean the filter", "tpl-b"], ["Check the drain hose", "tpl-c"],
    ])
  })

  it("turning ONE of the twins into a tip sends that twin's id on the tip, and keeps the other as a task", () => {
    const onSave = renderSheet()
    // The second "Clean the filter" row — the one that is tpl-b.
    const secondTwin = screen.getAllByText("Clean the filter")[1].closest("button") as HTMLElement
    fireEvent.click(secondTwin)
    const expanded = document.querySelector("[data-expanded='true']") as HTMLElement
    fireEvent.click(within(expanded).getByRole("button", { name: /Usage/ }))
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }))

    const [tasks, chunks] = onSave.mock.calls[0]
    expect(tasks.map((t) => t.template_id)).toEqual(["tpl-a", "tpl-c"])
    const tips = chunks.filter((c) => (c.tags ?? []).includes(USAGE_TIP_TAG))
    expect(tips.map((c) => [c.title, c.template_id])).toEqual([["Clean the filter", "tpl-b"]])
  })
})
