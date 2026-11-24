/**
 * Codex review F1 — the hand-off card when its draft cannot be read.
 *
 * The manual's read finished, the pill says "Review", and the card's own read
 * of the draft failed: the card simply did not appear, and pressing Review
 * (the pill's, or the manual row's) bumped a counter the read did not depend
 * on — so nothing happened, with nothing said. A failed read is now said where
 * the card would be, with Try again; and a Review asked for reads again.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { ManualDocument } from "@/integrations/types"
import type { PreviewResult } from "@/modules/knowledge/types/previewTypes"

const svc = vi.hoisted(() => ({ readPreviewDraft: vi.fn() }))
vi.mock("@/modules/knowledge/services/parseManualService", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  readPreviewDraft: (...a: unknown[]) => svc.readPreviewDraft(...a),
  commitReviewedDraft: vi.fn(),
}))
vi.mock("@/modules/knowledge/services/parseFeedbackService", () => ({ recordParseFeedback: vi.fn() }))
vi.mock("@/lib/parsePickup", () => ({ isParsePending: () => false, clearParsePending: vi.fn() }))
vi.mock("@/hooks/useNotificationsBlocked", () => ({ useNotificationsBlocked: () => false }))
vi.mock("@/modules/home", () => ({
  useHomeProfile: () => ({ profile: null, isLoading: false, error: undefined, refresh: vi.fn() }),
}))

import { ParsePickupCard } from "./ParsePickupCard"
import { requestReview, takeReviewRequest } from "@/lib/reviewRequest"

const DRAFT: PreviewResult = {
  ok: true, chunks: [],
  tasks: [{
    title: "Clean the filter", description: null, care_type: "maintenance", priority_tier: "recommended", risk_level: "performance",
    estimated_minutes: 10, schedule_type: "monthly", interval_days: null, instructions_text: null, symptom_tags: [], re_check_triggers: [],
  }],
}
const manual = (id: string): ManualDocument => ({
  manual_id: id, item_unit_id: "i1", title: "Owner's manual", label: null, source_type: "upload",
  source_ref: `homes/h1/manuals/${id}.pdf`, role: "primary", version: null, language: "en",
  parsed_at: null, parse_stage: "done", parse_mode: "preview", parse_request_id: `req-${id}`,
  parse_stage_at: "2026-09-30T10:00:00.000Z", parse_pages: 42, parse_tasks: 1, has_preview_draft: true,
  parse_draft: null, content_hash: null, created_at: "2026-09-30T09:00:00.000Z", updated_at: "2026-09-30T10:00:00.000Z",
  deleted_at: null,
})
const view = (id: string) =>
  render(
    <MemoryRouter>
      <ParsePickupCard homeId="h1" itemUnitId="i1" itemName="Bosch dishwasher" manuals={[manual(id)]} watched={new Set()} onReviewSaved={vi.fn()} />
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

describe("the draft read fails", () => {
  it("says so where the card would be, with Try again — never an empty space", async () => {
    svc.readPreviewDraft.mockRejectedValue(new Error("unavailable"))
    view("m-f1")

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("Couldn't load what we found.")
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeInTheDocument()
    // Not the hand-off card, which promises a review it cannot open.
    expect(screen.queryByTestId("handoff-card")).toBeNull()
    expect(screen.queryByText("We read the manual")).toBeNull()
  })

  it("Try again reads again, and the card arrives", async () => {
    svc.readPreviewDraft.mockRejectedValueOnce(new Error("unavailable")).mockResolvedValue(DRAFT)
    view("m-f1-retry")

    fireEvent.click(within(await screen.findByRole("alert")).getByRole("button", { name: "Try again" }))

    expect(await screen.findByTestId("handoff-card")).toBeInTheDocument()
    expect(svc.readPreviewDraft).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("a Review asked for elsewhere (the pill) reads again and opens the review — it used to do nothing", async () => {
    svc.readPreviewDraft.mockRejectedValueOnce(new Error("unavailable")).mockResolvedValue(DRAFT)
    view("m-f1-pill")
    await screen.findByRole("alert")

    act(() => requestReview("m-f1-pill"))

    await waitFor(() => expect(svc.readPreviewDraft).toHaveBeenCalledTimes(2))
    expect(await screen.findByText("1 thing from the manual")).toBeInTheDocument()
    expect(screen.queryByRole("alert")).toBeNull()
  })
})

describe("the read answers with no draft", () => {
  it("stays quiet when nobody asked (it was saved elsewhere a moment ago)", async () => {
    svc.readPreviewDraft.mockResolvedValue(null)
    view("m-f1-none")
    await act(async () => {})
    expect(screen.queryByRole("alert")).toBeNull()
    expect(screen.queryByTestId("handoff-card")).toBeNull()
  })

  it("says so when a Review was asked for — a button that does nothing is the bug", async () => {
    svc.readPreviewDraft.mockResolvedValue(null)
    view("m-f1-asked")
    await act(async () => {})

    act(() => requestReview("m-f1-asked"))

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("Couldn't load what we found.")
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeInTheDocument()
    takeReviewRequest("m-f1-asked") // leave nothing pending for the next test
  })
})
