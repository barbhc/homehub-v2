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
// Only the COMPONENT is stubbed. `draftMaintenanceCount` is deliberately kept
// real: it is the shared definition of "is there maintenance here", and the
// entire point of HH-127 is that the gate and the sheet cannot disagree about
// it. Mocking the whole module would have replaced the thing under test with
// `undefined` and made the gate look broken — which is exactly what happened
// on the first run of this change.
vi.mock("./TaskReviewSheet", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./TaskReviewSheet")>()),
  TaskReviewSheet: ({ open, presentation }: { open: boolean; presentation?: string }) =>
    open ? <div data-testid="review-sheet" data-presentation={presentation ?? "sheet"} /> : null,
}))

import { ParsePickupCard } from "./ParsePickupCard"

// HH-127: this fixture used to be `{ title }` and nothing else, which passed
// only because the old gate asked "is it not cleaning?". The gate now uses the
// review sheet's OWN definition — included, on a schedule, and maintenance —
// so the fixture has to look like a real parsed task. A stub thin enough to
// pass a weaker check is how the two definitions drifted apart unnoticed.
const DRAFT = {
  tasks: [{ title: "Replace the HEPA Filter", care_type: "maintenance", schedule_type: "monthly" }],
  chunks: [],
}

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
    await waitFor(() => expect(screen.getByText("Review & schedule")).toBeInTheDocument())
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
    await waitFor(() => expect(screen.getByText("Review & schedule")).toBeInTheDocument())
    expect(screen.queryByTestId("review-sheet")).not.toBeInTheDocument()
  })
})

/**
 * HH-120. PR #167 gave the review an `inline` mode so it could be a section of
 * the page rather than a drawer — and rendered it INSIDE this card, a narrow
 * horizontal flex row built for a one-line status. The review collapsed to one
 * word per line and sat behind the drawer another caller had opened, so two
 * review surfaces were mounted at once.
 *
 * The guarantee is structural, not visual: in flow the card is REPLACED by the
 * review, never wrapped around it.
 */
describe("ParsePickupCard — the in-flow review replaces the card", () => {
  it("renders the review INSTEAD of the card once a watched scan finishes", async () => {
    isParsePending.mockReturnValue(true)
    readPreviewDraft.mockResolvedValue(DRAFT)
    // A run we sat and watched: active stages, then done.
    stages("queued", "claude_call", "done")

    render(
      <ParsePickupCard homeId="h1" itemUnitId="i1" manualIds={["m-inline"]} itemName="Dryer"
        onReviewSaved={vi.fn()} />
    )

    const sheet = await screen.findByTestId("review-sheet")
    expect(sheet).toHaveAttribute("data-presentation", "inline")
    // The card's own chrome is gone — not merely hidden behind the review.
    expect(screen.queryByRole("button", { name: /Dismiss/ })).not.toBeInTheDocument()
  })

  it("keeps the drawer for someone who came back later", async () => {
    isParsePending.mockReturnValue(true)
    readPreviewDraft.mockResolvedValue(DRAFT)
    // Already finished on arrival: we never watched it run.
    stages("done")

    render(
      <ParsePickupCard homeId="h1" itemUnitId="i1" manualIds={["m-return"]} itemName="Dryer"
        onReviewSaved={vi.fn()} />
    )

    const sheet = await screen.findByTestId("review-sheet")
    expect(sheet).toHaveAttribute("data-presentation", "sheet")
  })

  it("never mounts two reviews at once", async () => {
    isParsePending.mockReturnValue(true)
    readPreviewDraft.mockResolvedValue(DRAFT)
    stages("queued", "done")

    render(
      <ParsePickupCard homeId="h1" itemUnitId="i1" manualIds={["m-single"]} itemName="Dryer"
        onReviewSaved={vi.fn()} />
    )

    await screen.findByTestId("review-sheet")
    await waitFor(() => expect(screen.getAllByTestId("review-sheet")).toHaveLength(1))
  })
})

/**
 * HH-121 — "I'm not sure what this page is. It just popped up."
 *
 * Round 12's default flip was right, but it made the NO-MAINTENANCE branch the
 * thing that auto-opens — a full-height sheet with nothing to decide, arriving
 * unannounced ninety-five minutes after the scan.
 *
 * The rule these pin: a sheet may interrupt for a DECISION, never for an
 * announcement.
 */
describe("ParsePickupCard — nothing opens itself without a decision to make", () => {
  const NO_MAINTENANCE = {
    tasks: [
      { title: "Clean the waveguide cover", care_type: "cleaning" },
      { title: "Wipe vent area after use", care_type: "cleaning" },
    ],
    chunks: [],
  }

  it("does NOT open a sheet when the scan found no maintenance", async () => {
    isParsePending.mockReturnValue(true)
    readPreviewDraft.mockResolvedValue(NO_MAINTENANCE)
    stages("queued", "done")

    render(
      <ParsePickupCard homeId="h1" itemUnitId="i1" manualIds={["m-none"]} itemName="Sharp microwave"
        onReviewSaved={vi.fn()} />
    )

    await screen.findByText(/We finished reading the Sharp microwave manual/)
    expect(screen.queryByTestId("review-sheet")).not.toBeInTheDocument()
  })

  it("still opens it when there IS maintenance to decide about", async () => {
    isParsePending.mockReturnValue(true)
    readPreviewDraft.mockResolvedValue({
      tasks: [{ title: "Replace the HEPA Filter", care_type: "maintenance" }],
      chunks: [],
    })
    stages("queued", "done")

    render(
      <ParsePickupCard homeId="h1" itemUnitId="i1" manualIds={["m-some"]} itemName="Air purifier"
        onReviewSaved={vi.fn()} />
    )

    expect(await screen.findByTestId("review-sheet")).toBeInTheDocument()
  })

  it("names the item and says how many things it saved", async () => {
    isParsePending.mockReturnValue(true)
    readPreviewDraft.mockResolvedValue(NO_MAINTENANCE)
    stages("queued", "done")

    render(
      <ParsePickupCard homeId="h1" itemUnitId="i1" manualIds={["m-count"]} itemName="Sharp microwave"
        onReviewSaved={vi.fn()} />
    )

    await screen.findByText(/We finished reading the Sharp microwave manual/)
    // "some things" would be useless; the count is the reassurance.
    //
    // HH-134: this asserted "We saved 2 …" about a draft that runParse had NOT
    // committed — commitDraft, which the review's Save triggers, is what writes
    // them. The test held the false tense in place for three rounds. The count
    // is still the reassurance; the tense is now true.
    expect(screen.getByText(/2 guides, setup steps and tips are ready to keep/)).toBeInTheDocument()
    // HH-137: the card says what was FOUND before saying nothing will remind
    // you. Unlike the sheet, this card IS about a manual it just read, so
    // naming it here is honest.
    expect(screen.getByText(/No maintenance in this manual, so nothing will remind you/)).toBeInTheDocument()
    // And the button must not offer to schedule what the card just said needs
    // no reminder.
    expect(screen.getByRole("button", { name: "See what we found" })).toBeInTheDocument()
  })
})
