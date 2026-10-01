/**
 * The hand-off's review answers the freeze question from the home profile.
 *
 * Found 2026-08-30: `TaskReviewSheet` defaulted `freezeRiskFalse` to false, and
 * one door — the item page's manual section — passed nothing. The server
 * applies the same suppression at save, so on that door a freeze-free home was
 * shown winterizing tasks in the review that then vanished on saving.
 *
 * HH-161 moved that door's review here: every read on the item page now ends in
 * the hand-off card's review, and the manual section opens none of its own.
 * These are the same three cases (they lived in ManualSection.freeze.test.tsx),
 * pinned on the door that now owns them.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { ManualDocument } from "@/integrations/types"
import type { PreviewResult } from "@/modules/knowledge/types/previewTypes"

let freezeRisk: boolean | null = null
const readPreviewDraft = vi.fn()

vi.mock("@/modules/home", () => ({
  useHomeProfile: () => ({ profile: { freeze_risk: freezeRisk }, isLoading: false, error: undefined, refresh: vi.fn() }),
}))
vi.mock("@/modules/knowledge/services/parseManualService", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  readPreviewDraft: (...a: unknown[]) => readPreviewDraft(...a),
  commitReviewedDraft: vi.fn(),
}))
vi.mock("@/modules/knowledge/services/parseFeedbackService", () => ({ recordParseFeedback: vi.fn() }))
vi.mock("@/hooks/useNotificationsBlocked", () => ({ useNotificationsBlocked: () => false }))

import { ParsePickupCard } from "./ParsePickupCard"

const task = (over: Record<string, unknown> = {}) => ({
  title: "Clean the Filter System", description: "", justification: null,
  care_type: "maintenance", priority_tier: "essential", risk_level: "prevent_damage",
  estimated_minutes: 10, schedule_type: "quarterly", interval_days: null,
  instructions_text: "", source_page: 1, tags: [], ...over,
})
const draft = {
  ok: true,
  tasks: [task(), task({ title: "Winterize the Dishwasher", schedule_type: "seasonal" })],
  chunks: [],
} as unknown as PreviewResult

const manual = { manual_id: "m-freeze", item_unit_id: "i1", title: "Manual", label: null, source_type: "upload",
  source_ref: "x.pdf", role: "primary", version: null, language: "en", parsed_at: null, parse_stage: "done",
  parse_mode: "preview", parse_request_id: "req-1", parse_stage_at: null, parse_pages: null, parse_tasks: 2,
  has_preview_draft: true, parse_draft: null, created_at: "", updated_at: "", deleted_at: null } as ManualDocument

async function openReview() {
  render(
    <MemoryRouter>
      <ParsePickupCard homeId="home-1" itemUnitId="i1" itemName="Bosch SHPM65Z55N" manuals={[manual]} watched={new Set()} onReviewSaved={vi.fn()} />
    </MemoryRouter>,
  )
  const card = await screen.findByTestId("handoff-card")
  fireEvent.click(within(card).getByRole("button", { name: /^Review/ }))
  await screen.findByText(/things? from the manual/)
}

beforeEach(() => {
  readPreviewDraft.mockResolvedValue(draft)
})

describe("the hand-off's review door answers from the home profile", () => {
  it("a freeze-free home is not shown freeze prep the server would drop at save", async () => {
    freezeRisk = false
    await openReview()
    expect(screen.getByText(/Clean the Filter System/)).toBeInTheDocument()
    expect(screen.queryByText(/Winterize/)).toBeNull()
  })

  it("a home that freezes still sees its winterizing task", async () => {
    freezeRisk = true
    await openReview()
    expect(screen.getByText(/Winterize the Dishwasher/)).toBeInTheDocument()
  })

  it("an unanswered profile never suppresses anything", async () => {
    freezeRisk = null
    await openReview()
    expect(screen.getByText(/Winterize the Dishwasher/)).toBeInTheDocument()
  })
})
