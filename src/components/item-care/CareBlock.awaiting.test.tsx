/**
 * The item page may not offer to add a manual it has already read.
 *
 * HH-141. `commitDraft` is the only thing that stamps `parsedAt`, and a preview
 * parse never calls it — "Preview NEVER commits — it writes previewDraft only".
 * So a finished-but-unsaved parse sits at stage "done" with `parsed_at: null`,
 * which satisfied neither `hasManual` nor `parsingManual`, and the page fell
 * through to its no-manual state: "No upkeep yet — add the manual", under a
 * ParsePickupCard reporting on the manual it had just read.
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
import { anyAwaitingReview } from "@/lib/manualReviewState"

vi.mock("@/modules/care", () => ({ getTaskInstances: vi.fn().mockResolvedValue({ data: [], error: null }) }))
vi.mock("@/pages/item-detail/useSetupCompletion", () => ({
  useSetupCompletion: () => ({ done: new Set<string>(), toggle: vi.fn(), allDone: false }),
}))

const item = { item_unit_id: "i1", display_name: "Sharp SMD2470ASY24" } as ItemUnit

function renderCare(props: { hasManual?: boolean; parsingManual?: boolean; manualAwaitingReview?: boolean }) {
  render(
    <MemoryRouter>
      <CareBlock
        item={item}
        homeId="h1"
        tasks={[]}
        chunks={[]}
        hasManual={false}
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

  it("says the manual was read, and where the upkeep goes", () => {
    renderCare({ manualAwaitingReview: true })
    expect(screen.getByText(/We read the manual/)).toBeTruthy()
    expect(screen.getByText(/once you save what we found/)).toBeTruthy()
  })

  it("carries no button of its own — the pickup card owns that decision", () => {
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

  it("still waits, without a door, while a parse is running", () => {
    renderCare({ parsingManual: true })
    expect(addManualButton()).toBeNull()
    expect(screen.getByText(/Reading the manual/)).toBeTruthy()
  })

  it("still reports an empty result when the manual WAS saved", () => {
    renderCare({ hasManual: true })
    expect(addManualButton()).toBeNull()
    expect(screen.getByText(/No upkeep found in this manual yet/)).toBeTruthy()
  })
})

describe("the signal itself", () => {
  const m = (parse_stage: string | null, parsed_at: string | null) => ({ parse_stage, parsed_at })

  it("is true only for a finished parse nobody saved", () => {
    expect(anyAwaitingReview([m("done", null)])).toBe(true)
  })

  it("is false once Save has stamped parsedAt", () => {
    expect(anyAwaitingReview([m("done", "2026-08-26T00:00:00.000Z")])).toBe(false)
  })

  it("is false mid-parse, on error, and for a pre-parse-era doc", () => {
    expect(anyAwaitingReview([m("claude_call", null)])).toBe(false)
    expect(anyAwaitingReview([m("error", null)])).toBe(false)
    expect(anyAwaitingReview([m(null, null)])).toBe(false)
  })

  it("catches a second manual awaiting review beside a saved one", () => {
    expect(anyAwaitingReview([m("done", "2026-08-26T00:00:00.000Z"), m("done", null)])).toBe(true)
  })
})
