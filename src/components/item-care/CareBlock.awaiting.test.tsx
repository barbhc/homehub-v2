/**
 * The item page may not offer to add a manual it has already read.
 *
 * HH-141. `commitDraft` is the only thing that stamps `parsedAt`, and a preview
 * parse never calls it — "Preview NEVER commits — it writes previewDraft only".
 * So a finished-but-unsaved parse sits at stage "done" with a draft waiting,
 * which satisfied neither `hasManual` nor "being read", and the page fell
 * through to its no-manual state: "No upkeep yet — add the manual", under a
 * card reporting on the manual it had just read.
 *
 * Two screens on one page disagreeing about whether a manual exists — the same
 * shape as HH-134, where one screen disagreed with its own button.
 *
 * This is a BEHAVIOURAL check, not a grep: render each of the four states and
 * read what CareBlock actually says. A grep cannot see a contradiction that
 * only exists once two branches are chosen by the same data.
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { ItemUnit } from "@/integrations/types"
import { CareBlock } from "./CareBlock"
import { anyAwaitingReview, type ManualParseFacts } from "@/lib/manualReviewState"
import type { ManualReading } from "@/lib/manualReviewState"

vi.mock("@/modules/care", () => ({ getTaskInstances: vi.fn().mockResolvedValue({ data: [], error: null }) }))
vi.mock("@/pages/item-detail/useSetupCompletion", () => ({
  useSetupCompletion: () => ({ done: new Set<string>(), toggle: vi.fn(), allDone: false }),
}))

const item = { item_unit_id: "i1", display_name: "Sharp SMD2470ASY24" } as ItemUnit

function renderCare(props: { hasManual?: boolean; reading?: ManualReading | null; manualAwaitingReview?: boolean }) {
  render(
    <MemoryRouter>
      <CareBlock
        item={item}
        homeId="h1"
        tasks={[]}
        chunks={[]}
        hasManual={false}
        notificationsBlocked={false}
        onAddManual={vi.fn()}
        {...props}
      />
    </MemoryRouter>,
  )
}

/** The door that must not appear beside a card saying the manual was read. */
const addManualButton = () => screen.queryByRole("button", { name: /Add the manual/i })

describe("a manual that was read but never saved", () => {
  it("does not offer to add the manual it just read", () => {
    renderCare({ manualAwaitingReview: true })
    expect(addManualButton()).toBeNull()
    expect(screen.queryByText(/No upkeep yet/)).toBeNull()
  })

  it("holds the space, in the mock's words (HH-161 S2.5, S3.4)", () => {
    renderCare({ manualAwaitingReview: true })
    expect(screen.getByText("Upkeep lands here once you save the review.")).toBeTruthy()
  })

  it("carries no button of its own — the hand-off card owns that decision", () => {
    renderCare({ manualAwaitingReview: true })
    // Two primaries for one decision is what the review consolidation removed;
    // re-adding one here would put it straight back on this page.
    expect(screen.queryAllByRole("button")).toHaveLength(0)
  })
})

describe("the states it must not disturb", () => {
  it("still offers the manual when there genuinely isn't one", () => {
    renderCare({})
    expect(addManualButton()).toBeTruthy()
    expect(screen.getByText(/No upkeep yet/)).toBeTruthy()
  })

  it("still waits, without a door, while a manual is read", () => {
    renderCare({ reading: { stage: "claude_call", pages: 42 } })
    expect(addManualButton()).toBeNull()
    expect(screen.queryByText(/No upkeep yet/)).toBeNull()
    expect(screen.getByText("Reading the manual")).toBeTruthy()
  })

  it("still reports an empty result when the manual WAS saved", () => {
    renderCare({ hasManual: true })
    expect(addManualButton()).toBeNull()
    expect(screen.getByText(/No upkeep found in this manual yet/)).toBeTruthy()
  })
})

describe("the signal itself — one definition (lib/manualReviewState)", () => {
  const m = (parse_stage: string | null, parsed_at: string | null, has_preview_draft = true, parse_mode: string | null = "preview"): ManualParseFacts =>
    ({ parse_stage, parsed_at, has_preview_draft, parse_mode })
  const SAVED = "2026-08-26T00:00:00.000Z"

  it("is true for a finished read with a draft nobody saved", () => {
    expect(anyAwaitingReview([m("done", null)])).toBe(true)
  })

  it("is false once Save has cleared the draft", () => {
    expect(anyAwaitingReview([m("done", SAVED, false)])).toBe(false)
  })

  it("is TRUE for a manual read again after it was saved — the rescan the tray saw and the page did not (HH-161)", () => {
    // Settings' Rescan and the item page's Read again are previews now: the
    // manual keeps the parsedAt of its last save and gains a new draft.
    expect(anyAwaitingReview([m("done", SAVED, true, "preview")])).toBe(true)
  })

  it("is false for a stale draft a later commit-mode run (Fill gaps) overtook", () => {
    expect(anyAwaitingReview([m("done", SAVED, true, "fill_gaps")])).toBe(false)
    expect(anyAwaitingReview([m("done", SAVED, true, "commit")])).toBe(false)
  })

  it("is false mid-read, on error, and for a pre-parse-era doc", () => {
    expect(anyAwaitingReview([m("claude_call", null)])).toBe(false)
    expect(anyAwaitingReview([m("error", null)])).toBe(false)
    expect(anyAwaitingReview([m(null, null, false, null)])).toBe(false)
  })

  it("catches a second manual awaiting review beside a saved one", () => {
    expect(anyAwaitingReview([m("done", SAVED, false), m("done", null)])).toBe(true)
  })
})
