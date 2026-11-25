/**
 * Before-friends PR D, the card's half: the review is handed the item's
 * typical (care library) tasks, and Save sends her answers. A failed read of
 * the item's tasks must never cost the review: it opens, asks nothing, saves.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { ManualDocument, TaskTemplate } from "@/integrations/types"
import type { PreviewResult } from "@/modules/knowledge/types/previewTypes"

const svc = vi.hoisted(() => ({
  readPreviewDraft: vi.fn(),
  commitReviewedDraft: vi.fn(),
  getTaskTemplatesByItem: vi.fn(),
}))
vi.mock("@/modules/knowledge/services/parseManualService", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  readPreviewDraft: (...a: unknown[]) => svc.readPreviewDraft(...a),
  commitReviewedDraft: (...a: unknown[]) => svc.commitReviewedDraft(...a),
}))
vi.mock("@/modules/care/services/taskService", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getTaskTemplatesByItem: (...a: unknown[]) => svc.getTaskTemplatesByItem(...a),
}))
vi.mock("@/modules/knowledge/services/parseFeedbackService", () => ({ recordParseFeedback: vi.fn() }))
vi.mock("@/lib/parsePickup", () => ({ isParsePending: () => false, clearParsePending: vi.fn() }))
vi.mock("@/hooks/useNotificationsBlocked", () => ({ useNotificationsBlocked: () => false }))
vi.mock("@/modules/home", () => ({
  useHomeProfile: () => ({ profile: null, isLoading: false, error: undefined, refresh: vi.fn() }),
}))

import { ParsePickupCard } from "./ParsePickupCard"

const DRAFT: PreviewResult = {
  ok: true, chunks: [], draftRequestId: "run-1",
  tasks: [{
    title: "Replace water filter", description: null, care_type: "maintenance", priority_tier: "recommended", risk_level: "performance",
    estimated_minutes: 5, schedule_type: "semiannual", interval_days: null, instructions_text: null, symptom_tags: [], re_check_triggers: [],
  }],
}
const manual = (id: string): ManualDocument => ({
  manual_id: id, item_unit_id: "i1", title: "Owner's manual", label: null, source_type: "upload",
  source_ref: `homes/h1/manuals/${id}.pdf`, role: "primary", version: null, language: "en",
  parsed_at: null, parse_stage: "done", parse_mode: "preview", parse_request_id: `req-${id}`,
  parse_stage_at: "2026-11-24T10:00:00.000Z", parse_pages: 42, parse_tasks: 1, has_preview_draft: true,
  parse_draft: null, content_hash: null, created_at: "2026-11-24T09:00:00.000Z", updated_at: "2026-11-24T10:00:00.000Z",
  deleted_at: null,
})
const template = (id: string, title: string, external_key: string | null) =>
  ({ task_template_id: id, title, external_key, is_active: true, deleted_at: null }) as unknown as TaskTemplate

/** Watched, so the review opens by itself as the page's next section. */
const view = (id: string) =>
  render(
    <MemoryRouter>
      <ParsePickupCard homeId="h1" itemUnitId="i1" itemName="Fridge" manuals={[manual(id)]} watched={new Set([id])} onReviewSaved={vi.fn()} />
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  svc.readPreviewDraft.mockResolvedValue(DRAFT)
  svc.commitReviewedDraft.mockResolvedValue({ ok: true, chunks: 0, tasks: 1 })
})

describe("the review is handed the item's typical tasks (PR D)", () => {
  it("only library tasks are offered, and Save sends her answer", async () => {
    svc.getTaskTemplatesByItem.mockResolvedValue({
      data: [
        template("t-water", "Replace the water filter", "library:refrigerator.water"),
        template("t-own", "Replace the water filter cartridge", null),
      ],
      error: null,
    })
    view("m-typ")
    expect(await screen.findByTestId("typical-replace")).toHaveTextContent("Replaces your typical task “Replace the water filter”")
    expect(screen.getAllByTestId("typical-replace")).toHaveLength(1)
    expect(svc.getTaskTemplatesByItem).toHaveBeenCalledWith("h1", "i1")

    fireEvent.click(screen.getByRole("button", { name: "Save it" }))
    await waitFor(() => expect(svc.commitReviewedDraft).toHaveBeenCalledTimes(1))
    expect(svc.commitReviewedDraft.mock.calls[0]).toEqual([
      "h1", "m-typ", [], expect.any(Array), "run-1",
      [{ title: "Replace water filter", templateId: "t-water", choice: "replace" }],
    ])
  })

  it.each([
    ["answers with an error", () => svc.getTaskTemplatesByItem.mockResolvedValue({ data: null, error: { message: "denied" } })],
    ["throws", () => svc.getTaskTemplatesByItem.mockRejectedValue(new Error("offline"))],
  ])("a read of the item's tasks that %s still lets the review open and save, asking nothing", async (_label, arrange) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    arrange()
    view(`m-fail-${_label.length}`)
    const save = await screen.findByRole("button", { name: "Save it" })
    expect(screen.queryAllByTestId("typical-replace")).toHaveLength(0)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("item i1 (home h1)"), expect.anything())

    fireEvent.click(save)
    await waitFor(() => expect(svc.commitReviewedDraft).toHaveBeenCalledTimes(1))
    expect(svc.commitReviewedDraft.mock.calls[0][5]).toEqual([])
  })
})

describe("the typical-task read never holds the review back (CI, PR D)", () => {
  it("a read that never answers: the review opens at once, asks nothing, and saves", async () => {
    svc.getTaskTemplatesByItem.mockReturnValue(new Promise(() => {}))
    view("m-hang")
    // findBy's 1s default: well inside LOAD_TIMEOUT_MS, so this fails if the
    // review waits for the item's tasks.
    fireEvent.click(await screen.findByRole("button", { name: "Save it" }))
    expect(screen.queryAllByTestId("typical-replace")).toHaveLength(0)
    await waitFor(() => expect(svc.commitReviewedDraft).toHaveBeenCalledTimes(1))
    expect(svc.commitReviewedDraft.mock.calls[0][5]).toEqual([])
  })
})
