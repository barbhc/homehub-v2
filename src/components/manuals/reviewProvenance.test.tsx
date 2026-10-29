/**
 * Provenance on the reviewed-draft commit (decision C, step 1) decides "the
 * reviewer changed this" by comparing each saved row with the draft row it
 * came from, as an UNTOUCHED review would have sent it back —
 * `draftRowAsReviewed` (shared/tasks/fieldProvenance.ts), which the server
 * runs in commitManualDraft. That function mirrors what this sheet does to a
 * row nobody touched (the setup-step correction, kind → cleaning/maintenance,
 * reminder "never chose"). If the sheet's save ever changes those, every
 * untouched row would be recorded as the reviewer's own choice.
 *
 * So this pins the two together on the rendered sheet: open a draft, press
 * Save without touching anything, and every saved task must equal the server's
 * idea of an untouched row on the four fields provenance reads.
 */
import { describe, it, expect, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { TaskReviewSheet } from "./TaskReviewSheet"
import type { PreviewChunk, PreviewResult, PreviewTask } from "@/modules/knowledge/types/previewTypes"
import { draftRowAsReviewed } from "../../../shared/tasks/fieldProvenance"

const task = (over: Partial<PreviewTask> & { title: string }): PreviewTask => ({
  description: null, care_type: "maintenance", priority_tier: "recommended", risk_level: "performance",
  estimated_minutes: 10, schedule_type: "monthly", interval_days: null, instructions_text: null,
  symptom_tags: [], re_check_triggers: [], ...over,
})

const DRAFT: PreviewResult = {
  ok: true,
  chunks: [],
  tasks: [
    task({ title: "Replace the water filter", priority_tier: "essential", risk_level: "prevent_damage", schedule_type: "semiannual" }),
    task({ title: "Clean the door gasket", care_type: "cleaning", priority_tier: "optional" }),
    task({ title: "Inspect the drain hose", care_type: "mixed", schedule_type: "annual" }),
    task({ title: "Descale the boiler", schedule_type: "every_n_days", interval_days: 45 }),
    // The sheet's own correction: a first-use step is setup before anyone sees it.
    task({ title: "Purge Hot Water Lines Before First Use", schedule_type: "as_needed" }),
    task({ title: "Winterize the supply lines", schedule_type: "seasonal" }),
  ],
}

describe("an untouched review row is the manual's value, by the server's own reckoning", () => {
  it("Save with no edits returns exactly draftRowAsReviewed on the provenance fields", () => {
    const onSave = vi.fn<(t: PreviewTask[], c: PreviewChunk[]) => Promise<string | null>>().mockResolvedValue(null)
    render(
      <TaskReviewSheet
        freezeRiskFalse={false}
        notificationsBlocked={false}
        open
        onOpenChange={vi.fn()}
        itemName="Combi boiler"
        previewData={DRAFT}
        onSave={onSave}
        saving={false}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /^(Save all|Save it|Save changes|Done)/ }))
    expect(onSave).toHaveBeenCalledTimes(1)
    const [saved] = onSave.mock.calls[0]
    expect(saved).toHaveLength(DRAFT.tasks.length)
    for (const row of saved) {
      const draft = DRAFT.tasks.find((t) => t.title === row.title)!
      const expected = draftRowAsReviewed({ ...draft, instructions_override: null })
      expect({
        care_type: row.care_type,
        priority_tier: row.priority_tier,
        schedule_type: row.schedule_type,
        remind_enabled: row.remind_enabled ?? null,
      }, row.title).toEqual({
        care_type: expected.care_type,
        priority_tier: expected.priority_tier,
        schedule_type: expected.schedule_type,
        remind_enabled: expected.remind_enabled,
      })
      // The interval: the server normalizes the SAVED row (normalizeTaskRow keeps
      // it only on every_n_days) before comparing, exactly as the draft did.
      const savedInterval = row.schedule_type === "every_n_days" ? (row.interval_days ?? null) : null
      expect(savedInterval, row.title).toBe(expected.interval_days)
    }
  })
})
