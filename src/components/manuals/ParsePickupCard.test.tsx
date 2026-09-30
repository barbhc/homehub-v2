/**
 * The hand-off — HH-161's "the top card goes back to its one job".
 *
 * The card used to be three things with three watches: a reading band pinned
 * above the page, round 14's no-maintenance card, and the hand-off. It is now
 * ONE card, fed the page's live manuals as props, and these pin the mock's
 * lines for it (design/mocks/scan-indicator, S2 and S3):
 *
 *  - one card, "We read the ‹item› manual", and a button that counts what the
 *    review will ask about — its Maintenance section, or every row when there
 *    is no maintenance;
 *  - no reading band, and nothing of round 14's card, anywhere;
 *  - it opens the review by itself only when the page watched the read finish,
 *    once per read per session (HH-48) — with or without maintenance;
 *  - one review element, ever (HH-120);
 *  - nothing saved before Save (HH-134).
 *
 * The review is the REAL TaskReviewSheet, so "the count on the card equals the
 * count in the review" is read off the review itself, not asserted twice.
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { ManualDocument } from "@/integrations/types"
import type { PreviewResult, PreviewTask } from "@/modules/knowledge/types/previewTypes"

const svc = vi.hoisted(() => ({
  readPreviewDraft: vi.fn(),
  commitReviewedDraft: vi.fn(),
  recordParseFeedback: vi.fn(),
  isParsePending: vi.fn(),
  clearParsePending: vi.fn(),
}))

vi.mock("@/modules/knowledge/services/parseManualService", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  readPreviewDraft: (...a: unknown[]) => svc.readPreviewDraft(...a),
  commitReviewedDraft: (...a: unknown[]) => svc.commitReviewedDraft(...a),
}))
vi.mock("@/modules/knowledge/services/parseFeedbackService", () => ({
  recordParseFeedback: (...a: unknown[]) => svc.recordParseFeedback(...a),
}))
vi.mock("@/lib/parsePickup", () => ({
  isParsePending: (id: string) => svc.isParsePending(id),
  clearParsePending: (id: string) => svc.clearParsePending(id),
}))
vi.mock("@/hooks/useNotificationsBlocked", () => ({ useNotificationsBlocked: () => false }))
vi.mock("@/modules/home", () => ({
  useHomeProfile: () => ({ profile: null, isLoading: false, error: undefined, refresh: vi.fn() }),
}))

import { ParsePickupCard } from "./ParsePickupCard"
import { requestReview } from "@/lib/reviewRequest"

const t = (title: string, care_type: PreviewTask["care_type"], schedule_type: PreviewTask["schedule_type"], priority_tier: PreviewTask["priority_tier"] = "recommended"): PreviewTask => ({
  title, description: null, care_type, priority_tier, risk_level: "performance", estimated_minutes: 10,
  schedule_type, interval_days: null, instructions_text: null, symptom_tags: [], re_check_triggers: [],
})

/** S4's dishwasher: six maintenance rows, four cleaning, two setup — twelve. */
const BOSCH: PreviewResult = {
  ok: true, chunks: [],
  tasks: [
    t("Check the door seal", "maintenance", "annual", "essential"),
    t("Clean the filter", "maintenance", "monthly"),
    t("Descale", "maintenance", "quarterly"),
    t("Clean the spray arms", "maintenance", "semiannual"),
    t("Clean the drain pump", "maintenance", "annual", "optional"),
    t("Check the drain hose", "maintenance", "annual", "optional"),
    t("Clean the tub and door edges", "cleaning", "monthly"),
    t("Clean the cutlery basket", "cleaning", "monthly", "optional"),
    t("Wipe the door", "cleaning", "as_needed"),
    t("Wipe the panel", "cleaning", "as_needed", "optional"),
    t("Level the dishwasher", "maintenance", "setup"),
    t("Connect the drain", "maintenance", "setup"),
  ],
}

/** S3b's microwave: four cleaning and two setup — no maintenance at all. */
const SHARP: PreviewResult = {
  ok: true, chunks: [],
  tasks: [
    t("Clean the waveguide cover", "cleaning", "monthly"),
    t("Wipe the drawer interior", "cleaning", "weekly", "optional"),
    t("Clean the door seals", "cleaning", "as_needed"),
    t("Wipe the control panel", "cleaning", "as_needed", "optional"),
    t("Verify the drawer is grounded", "maintenance", "setup", "essential"),
    t("Level the drawer front", "maintenance", "setup"),
  ],
}

/** A live manual doc, as useItemManuals maps it. */
const manual = (id: string, over: Partial<ManualDocument> = {}): ManualDocument => ({
  manual_id: id, item_unit_id: "i1", title: "Owner's manual", label: null, source_type: "upload",
  source_ref: `homes/h1/manuals/${id}.pdf`, role: "primary", version: null, language: "en",
  parsed_at: null, parse_stage: "done", parse_mode: "preview", parse_request_id: `req-${id}`,
  parse_stage_at: "2026-09-30T10:00:00.000Z", parse_pages: 42, parse_tasks: 12, has_preview_draft: true,
  parse_draft: null, content_hash: null, created_at: "2026-09-30T09:00:00.000Z", updated_at: "2026-09-30T10:00:00.000Z",
  deleted_at: null, ...over,
})

const NONE: ReadonlySet<string> = new Set()

function view(manuals: ManualDocument[], watched: ReadonlySet<string> = NONE, itemName = "Bosch dishwasher", onReviewSaved = vi.fn()) {
  const r = render(
    <MemoryRouter>
      <ParsePickupCard homeId="h1" itemUnitId="i1" itemName={itemName} manuals={manuals} watched={watched} onReviewSaved={onReviewSaved} />
    </MemoryRouter>,
  )
  return { ...r, onReviewSaved }
}

/** The review's own heading — "‹item›" over "N things from the manual". */
const reviews = () => screen.queryAllByText(/\d+ things? from the manual/)
/** A review section header's count, read off the review itself. */
const sectionCount = (title: string) => {
  const heading = screen.getAllByText(new RegExp(`^${title}$`)).find((el) => el.closest("div")?.textContent?.match(/\d+$/))!
  return Number(heading.closest("div")!.textContent!.match(/(\d+)$/)![1])
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  svc.isParsePending.mockReturnValue(false)
  svc.commitReviewedDraft.mockResolvedValue({ ok: true, chunks: 0, tasks: 12 })
})

describe("the hand-off card — one job (S2, S3)", () => {
  it("S2.1 — 'We read the Bosch dishwasher manual' and 'Review 6 upkeep tasks'; the 6 is the review's Maintenance count", async () => {
    svc.readPreviewDraft.mockResolvedValue(BOSCH)
    view([manual("m-bosch")])
    const card = await screen.findByTestId("handoff-card")
    expect(within(card).getByText("We read the Bosch dishwasher manual")).toBeInTheDocument()
    const button = within(card).getByRole("button", { name: "Review 6 upkeep tasks" })

    fireEvent.click(button)
    await waitFor(() => expect(reviews()).toHaveLength(1))
    expect(sectionCount("Maintenance")).toBe(6)
  })

  it("S3.1 — no maintenance: 'Review 6 tips & steps', the 6 being every row the review lists", async () => {
    svc.readPreviewDraft.mockResolvedValue(SHARP)
    view([manual("m-sharp")], NONE, "Sharp microwave")
    const card = await screen.findByTestId("handoff-card")
    expect(within(card).getByText("We read the Sharp microwave manual")).toBeInTheDocument()
    fireEvent.click(within(card).getByRole("button", { name: "Review 6 tips & steps" }))
    expect(await screen.findByText("6 things from the manual")).toBeInTheDocument()
  })

  it("S3.2 — no other card, and round 14's sentence is nowhere (not rendered)", async () => {
    svc.readPreviewDraft.mockResolvedValue(SHARP)
    view([manual("m-sharp-2")], NONE, "Sharp microwave")
    await screen.findByTestId("handoff-card")
    expect(screen.getAllByTestId("handoff-card")).toHaveLength(1)
    expect(document.body.textContent).not.toMatch(/No maintenance in this manual/)
    expect(document.body.textContent).not.toMatch(/nothing will remind you/)
    expect(screen.queryByText(/We finished reading/)).toBeNull()
    expect(screen.queryByRole("button", { name: "See what we found" })).toBeNull()
  })

  it("S1.1 / S2.2 — it never renders a reading line or rail, whatever the manual is doing", async () => {
    svc.readPreviewDraft.mockResolvedValue(BOSCH)
    view([manual("m-reading", { parse_stage: "claude_call", has_preview_draft: false })])
    await act(async () => {})
    expect(screen.queryByRole("progressbar")).toBeNull()
    expect(screen.queryByText(/Reading the manual/)).toBeNull()
    expect(screen.queryByTestId("handoff-card")).toBeNull()
  })

  it("renders nothing for a manual whose findings are saved", async () => {
    svc.readPreviewDraft.mockResolvedValue(null)
    view([manual("m-saved", { parsed_at: "2026-09-30T10:05:00.000Z", has_preview_draft: false })])
    await act(async () => {})
    expect(screen.queryByTestId("handoff-card")).toBeNull()
    expect(svc.readPreviewDraft).not.toHaveBeenCalled()
  })
})

describe("it opens by itself only when the page watched the read finish (HH-48, S2.4, S3.3)", () => {
  it("watched → the review opens in place of the card, with maintenance", async () => {
    svc.readPreviewDraft.mockResolvedValue(BOSCH)
    view([manual("m-watched")], new Set(["m-watched"]))
    await waitFor(() => expect(reviews()).toHaveLength(1))
    // In flow it REPLACES the card — never wrapped inside it (HH-120).
    expect(screen.queryByTestId("handoff-card")).toBeNull()
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("watched → it opens the same way with NO maintenance (round 14's 'never opens by itself' is gone)", async () => {
    svc.readPreviewDraft.mockResolvedValue(SHARP)
    view([manual("m-watched-sharp")], new Set(["m-watched-sharp"]), "Sharp microwave")
    expect(await screen.findByText("6 things from the manual")).toBeInTheDocument()
  })

  it("not watched → the card waits, even for a read the wizard flagged", async () => {
    svc.isParsePending.mockReturnValue(true)
    svc.readPreviewDraft.mockResolvedValue(BOSCH)
    view([manual("m-came-back")])
    await screen.findByTestId("handoff-card")
    expect(reviews()).toHaveLength(0)
  })

  it("once per read per session — coming back to the item does not open it again", async () => {
    svc.readPreviewDraft.mockResolvedValue(BOSCH)
    const first = view([manual("m-once")], new Set(["m-once"]))
    await waitFor(() => expect(reviews()).toHaveLength(1))
    first.unmount()

    view([manual("m-once")], new Set(["m-once"]))
    await screen.findByTestId("handoff-card")
    expect(reviews()).toHaveLength(0)
  })

  it("a NEW read of the same manual, watched, is news of its own", async () => {
    svc.readPreviewDraft.mockResolvedValue(BOSCH)
    const first = view([manual("m-twice")], new Set(["m-twice"]))
    await waitFor(() => expect(reviews()).toHaveLength(1))
    first.unmount()

    view([manual("m-twice", { parse_request_id: "req-second-read" })], new Set(["m-twice"]))
    await waitFor(() => expect(reviews()).toHaveLength(1))
  })
})

describe("one review, and only Save saves (HH-120, HH-134)", () => {
  it("never mounts two reviews — the card's tap opens ONE drawer", async () => {
    svc.readPreviewDraft.mockResolvedValue(BOSCH)
    view([manual("m-one")])
    const card = await screen.findByTestId("handoff-card")
    fireEvent.click(within(card).getByRole("button", { name: /Review 6 upkeep tasks/ }))
    await waitFor(() => expect(reviews()).toHaveLength(1))
    expect(screen.getAllByRole("dialog")).toHaveLength(1)
  })

  it("nothing is committed until Save — then the draft is committed, feedback-free, and the page refreshes", async () => {
    svc.readPreviewDraft.mockResolvedValue(SHARP)
    const { onReviewSaved } = view([manual("m-save")], new Set(["m-save"]), "Sharp microwave")
    await screen.findByText("6 things from the manual")
    expect(svc.commitReviewedDraft).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Save all 6" }))
    await waitFor(() => expect(svc.commitReviewedDraft).toHaveBeenCalledTimes(1))
    expect(svc.commitReviewedDraft.mock.calls[0][1]).toBe("m-save")
    await waitFor(() => expect(onReviewSaved).toHaveBeenCalledTimes(1))
    expect(svc.clearParsePending).toHaveBeenCalledWith("m-save")
    // The live list has not heard of the save yet (these props still say
    // "waiting"): the card must not flash back for that moment (S3c.5).
    expect(screen.queryByTestId("handoff-card")).toBeNull()
    expect(reviews()).toHaveLength(0)
  })
})

describe("the pill's Review opens this review in place (S2.3)", () => {
  it("a request for this manual opens the drawer — no navigation, and even over a dismissed card", async () => {
    svc.readPreviewDraft.mockResolvedValue(BOSCH)
    view([manual("m-asked")])
    const card = await screen.findByTestId("handoff-card")
    fireEvent.click(within(card).getByRole("button", { name: "Dismiss" }))
    expect(screen.queryByTestId("handoff-card")).toBeNull()

    act(() => { requestReview("m-asked") })
    await waitFor(() => expect(reviews()).toHaveLength(1))
    expect(screen.getAllByRole("dialog")).toHaveLength(1)
  })

  it("a request for another item's manual leaves this page alone", async () => {
    svc.readPreviewDraft.mockResolvedValue(BOSCH)
    view([manual("m-here")])
    await screen.findByTestId("handoff-card")
    act(() => { requestReview("m-elsewhere") })
    await act(async () => {})
    expect(reviews()).toHaveLength(0)
  })
})

describe("a read that failed", () => {
  it("is said, when this page watched it", async () => {
    view([manual("m-err", { parse_stage: "error", has_preview_draft: false })], new Set(["m-err"]))
    expect(await screen.findByText(/We couldn.t finish reading the manual/)).toBeInTheDocument()
  })

  it("stays quiet for an old failure nobody is waiting on", async () => {
    view([manual("m-old-err", { parse_stage: "error", has_preview_draft: false })])
    await act(async () => {})
    expect(screen.queryByText(/We couldn.t finish reading the manual/)).toBeNull()
  })
})
