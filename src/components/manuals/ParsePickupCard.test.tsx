/**
 * "I thought the review was supposed to open" — HH-48, beta round 6 (Chris).
 *
 * He reported the review flow as missing while looking at a page that had a
 * "Review tasks" button on it. The affordance existed; the moment did not. The
 * card now opens the sheet itself — and the risk in doing that is the opposite
 * failure, a sheet that ambushes you every time you open an item you looked at
 * last week. These pin both halves: it opens when the user is waiting on the
 * parse, and it stays shut when they are not.
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"

const { watchParse, readPreviewDraft, isParsePending } = vi.hoisted(() => ({
  watchParse: vi.fn(),
  readPreviewDraft: vi.fn(),
  isParsePending: vi.fn(),
}))

vi.mock("@/modules/knowledge/services/parseManualService", () => ({
  watchParse,
  readPreviewDraft,
  commitReviewedDraft: vi.fn(),
  toUiStage: (s: string) => s,
  // The real list, verbatim — the card's active-banner gate depends on it, and
  // a stub like ["queued"] would quietly change what these tests exercise.
  ACTIVE_PARSE_STAGES: ["queued", "started", "pdf_fetched", "claude_call", "claude_responded", "committing"],
}))
vi.mock("@/lib/parsePickup", () => ({ isParsePending, clearParsePending: vi.fn() }))
vi.mock("@/modules/knowledge/services/parseFeedbackService", () => ({ recordParseFeedback: vi.fn() }))
vi.mock("./ReviewItemTasksButton", () => ({ ReviewItemTasksButton: () => <button>Review tasks</button> }))
vi.mock("./TaskReviewSheet", () => ({
  TaskReviewSheet: ({ open }: { open: boolean }) => (open ? <div data-testid="review-sheet" /> : null),
}))

import { ParsePickupCard } from "./ParsePickupCard"

const DRAFT = { tasks: [{ title: "Replace the HEPA Filter" }], chunks: [] }

/** Drive watchParse through a stage sequence, synchronously on subscribe. */
function stages(...seq: string[]) {
  watchParse.mockImplementation((_home: string, id: string, cb: (s: string, p: unknown) => void) => {
    for (const s of seq) cb(s, { summary: { tasks: 1 } })
    void id
    return () => {}
  })
}

// The once-per-session guard is module-level BY DESIGN — it has to survive the
// item page remounting — which means it also survives between tests here. Each
// case therefore gets its own manual id, and the one case that deliberately
// reuses an id is the one asserting the guard works.
const view = (manualId: string) =>
  render(
    <ParsePickupCard
      homeId="h1"
      itemUnitId="i1"
      itemName="Levoit Core 300"
      manualIds={[manualId]}
      onReviewSaved={() => {}}
    />
  )

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  readPreviewDraft.mockResolvedValue(DRAFT)
  isParsePending.mockReturnValue(false)
})

describe("ParsePickupCard — the parse-to-review handoff", () => {
  it("opens the review when a parse it watched run finishes with a draft", async () => {
    stages("queued", "claude_call", "done")
    view("m-watched")
    await waitFor(() => expect(screen.getByTestId("review-sheet")).toBeInTheDocument())
  })

  it("opens the review for a parse the user's own wizard started", async () => {
    // No active stage observed here — the user left the wizard and came back to
    // a finished parse. The handoff flag is what says they are waiting on it.
    isParsePending.mockReturnValue(true)
    stages("done")
    view("m-wizard")
    await waitFor(() => expect(screen.getByTestId("review-sheet")).toBeInTheDocument())
  })

  it("stays SHUT for a draft that was already sitting there", async () => {
    // The ambush case: an old unreviewed draft, arrived at by opening the item.
    // The card still offers it; nothing opens by itself.
    stages("done")
    view("m-stale")
    await waitFor(() => expect(screen.getByText("Review them")).toBeInTheDocument())
    expect(screen.queryByTestId("review-sheet")).not.toBeInTheDocument()
  })

  it("stays SHUT when the tasks are already committed", async () => {
    // No draft ⇒ nothing is waiting on the user's approval; the tasks are live
    // and reviewing them is a choice, not a step.
    readPreviewDraft.mockResolvedValue(null)
    isParsePending.mockReturnValue(true)
    stages("queued", "done")
    view("m-committed")
    await waitFor(() => expect(screen.getByText("Review tasks")).toBeInTheDocument())
    expect(screen.queryByTestId("review-sheet")).not.toBeInTheDocument()
  })

  it("opens once per manual, not on every return to the item", async () => {
    stages("queued", "done")
    const first = view("m-once")
    await waitFor(() => expect(screen.getByTestId("review-sheet")).toBeInTheDocument())
    first.unmount()

    // Same manual, same session — the user navigated away and came back.
    view("m-once")
    await waitFor(() => expect(screen.getByText("Review them")).toBeInTheDocument())
    expect(screen.queryByTestId("review-sheet")).not.toBeInTheDocument()
  })
})
