/**
 * The hand-off — HH-161's "the top card goes back to its one job".
 *
 * The card used to be three things with three watches: a reading band pinned
 * above the page, round 14's no-maintenance card, and the hand-off. It is now
 * ONE card, fed the page's live manuals as props, and these pin the mock's
 * lines for it (design/mocks/scan-indicator, S2 and S3):
 *
 *  - one card, "We read the manual", and a button that counts what the
 *    review will ask about — its Maintenance section, or every row when there
 *    is no maintenance. It does not repeat the item's name: it sits under the
 *    item's own heading (owner, #228 review);
 *  - no reading band, and nothing of round 14's card, anywhere;
 *  - it opens the review by itself only when the page watched the read finish,
 *    once per read per session (HH-48) — with or without maintenance, EXCEPT
 *    a first read with nothing for Tasks (HH-137, below);
 *  - one review element, ever (HH-120);
 *  - nothing saved before a tap (HH-134): Save, or "Keep these".
 *
 * HH-137 (owner, 2026-11-19, "One-tap 'Keep these'"): a first read with no
 * maintenance and nothing for Tasks has no decision in it. No review opens; the
 * card says what was found and keeps it in one tap — saving exactly what the
 * review's Save would.
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
  it("S2.1 — 'We read the manual' and 'Review 6 upkeep tasks'; the 6 is the review's Maintenance count", async () => {
    svc.readPreviewDraft.mockResolvedValue(BOSCH)
    view([manual("m-bosch")])
    const card = await screen.findByTestId("handoff-card")
    // Not "We read the Bosch dishwasher manual": the card sits under the
    // item's own name, and saying it twice was the owner's first note.
    expect(within(card).getByText("We read the manual")).toBeInTheDocument()
    expect(card.textContent).not.toMatch(/Bosch/)
    const button = within(card).getByRole("button", { name: "Review 6 upkeep tasks" })

    fireEvent.click(button)
    await waitFor(() => expect(reviews()).toHaveLength(1))
    expect(sectionCount("Maintenance")).toBe(6)
  })

  it("S3.1 — no maintenance, read AGAIN: 'Review 6 tips & steps', the 6 being every row the review lists", async () => {
    // A read again can change upkeep the item already has, so it keeps the
    // review (HH-137 is first reads only).
    svc.readPreviewDraft.mockResolvedValue(SHARP)
    view([manual("m-sharp", { parsed_at: "2026-09-01T00:00:00.000Z" })], NONE, "Sharp microwave")
    const card = await screen.findByTestId("handoff-card")
    expect(within(card).getByText("We read the manual")).toBeInTheDocument()
    expect(card.textContent).not.toMatch(/Sharp microwave/)
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

  it("watched → a read AGAIN with NO maintenance opens the same way", async () => {
    svc.readPreviewDraft.mockResolvedValue(SHARP)
    view([manual("m-watched-sharp", { parsed_at: "2026-09-01T00:00:00.000Z" })], new Set(["m-watched-sharp"]), "Sharp microwave")
    expect(await screen.findByText("6 things from the manual")).toBeInTheDocument()
  })

  it("watched → a FIRST read with nothing for Tasks does NOT open the review (HH-137)", async () => {
    svc.readPreviewDraft.mockResolvedValue(SHARP)
    view([manual("m-watched-first")], new Set(["m-watched-first"]), "Sharp microwave")
    const card = await screen.findByTestId("handoff-card")
    await act(async () => {})
    // Not rendered at all — neither in flow nor as a drawer.
    expect(reviews()).toHaveLength(0)
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(within(card).getByRole("button", { name: "Keep these" })).toBeInTheDocument()
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
    const { onReviewSaved } = view([manual("m-save", { parsed_at: "2026-09-01T00:00:00.000Z" })], new Set(["m-save"]), "Sharp microwave")
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

describe("a first read with nothing for Tasks: 'Keep these' (HH-137)", () => {
  it("says what was found, offers Keep these and Review first — and no review button counting rows", async () => {
    svc.readPreviewDraft.mockResolvedValue(SHARP)
    view([manual("m-keep")], NONE, "Sharp microwave")
    const card = await screen.findByTestId("handoff-card")
    expect(within(card).getByText("We read the manual")).toBeInTheDocument()
    // The words Upkeep shows after the save (S3c), said before it.
    expect(within(card).getByText("4 cleaning tips and 2 setup steps. Nothing here goes into Tasks.")).toBeInTheDocument()
    expect(within(card).getByRole("button", { name: "Keep these" })).toBeInTheDocument()
    expect(within(card).getByRole("button", { name: "Review first" })).toBeInTheDocument()
    expect(within(card).queryByRole("button", { name: /Review 6 tips/ })).toBeNull()
    expect(svc.commitReviewedDraft).not.toHaveBeenCalled()
  })

  it("Keep these saves EXACTLY what the review's Save would, then the card goes", async () => {
    svc.readPreviewDraft.mockResolvedValue(SHARP)
    // Via the review: Review first → Save all 6, untouched.
    const viaReview = view([manual("m-via-review")], NONE, "Sharp microwave")
    fireEvent.click(within(await screen.findByTestId("handoff-card")).getByRole("button", { name: "Review first" }))
    fireEvent.click(await screen.findByRole("button", { name: "Save all 6" }))
    await waitFor(() => expect(svc.commitReviewedDraft).toHaveBeenCalledTimes(1))
    viaReview.unmount()

    // Via the card, in one tap.
    const { onReviewSaved } = view([manual("m-via-keep")], NONE, "Sharp microwave")
    fireEvent.click(within(await screen.findByTestId("handoff-card")).getByRole("button", { name: "Keep these" }))
    await waitFor(() => expect(svc.commitReviewedDraft).toHaveBeenCalledTimes(2))

    const [reviewCall, keepCall] = svc.commitReviewedDraft.mock.calls
    expect(keepCall[1]).toBe("m-via-keep")
    // chunks, tasks, and the run the draft came from (Codex finding 1).
    expect(keepCall.slice(2)).toEqual(reviewCall.slice(2))
    expect((keepCall[3] as unknown[]).length).toBe(6)
    await waitFor(() => expect(onReviewSaved).toHaveBeenCalledTimes(1))
    expect(svc.clearParsePending).toHaveBeenCalledWith("m-via-keep")
    expect(screen.queryByTestId("handoff-card")).toBeNull()
    // No corrections were made, so none are recorded as parser feedback.
    expect(svc.recordParseFeedback).not.toHaveBeenCalled()
  })

  it("a failed Keep says so on the card and keeps it — never a success state", async () => {
    svc.readPreviewDraft.mockResolvedValue(SHARP)
    svc.commitReviewedDraft.mockResolvedValue({ ok: false, error: "You're offline." })
    const { onReviewSaved } = view([manual("m-keep-fail")], NONE, "Sharp microwave")
    const card = await screen.findByTestId("handoff-card")
    fireEvent.click(within(card).getByRole("button", { name: "Keep these" }))
    expect(await within(card).findByRole("alert")).toHaveTextContent("Couldn't keep them: You're offline.")
    expect(onReviewSaved).not.toHaveBeenCalled()
    expect(within(card).getByRole("button", { name: "Keep these" })).toBeEnabled()
  })

  it("with maintenance there is no Keep these — that review has a decision in it", async () => {
    svc.readPreviewDraft.mockResolvedValue(BOSCH)
    view([manual("m-bosch-first")])
    const card = await screen.findByTestId("handoff-card")
    expect(within(card).queryByRole("button", { name: "Keep these" })).toBeNull()
    expect(within(card).getByRole("button", { name: "Review 6 upkeep tasks" })).toBeInTheDocument()
  })

  it("a read AGAIN with nothing for Tasks keeps the review — it can change saved upkeep", async () => {
    svc.readPreviewDraft.mockResolvedValue(SHARP)
    view([manual("m-again", { parsed_at: "2026-09-01T00:00:00.000Z" })], NONE, "Sharp microwave")
    const card = await screen.findByTestId("handoff-card")
    expect(within(card).queryByRole("button", { name: "Keep these" })).toBeNull()
  })

  it("the pill's Review still opens the review for it", async () => {
    svc.readPreviewDraft.mockResolvedValue(SHARP)
    view([manual("m-keep-asked")], NONE, "Sharp microwave")
    await screen.findByTestId("handoff-card")
    act(() => { requestReview("m-keep-asked") })
    expect(await screen.findByText("6 things from the manual")).toBeInTheDocument()
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
