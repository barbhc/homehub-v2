/**
 * The review's "Re-scan" button.
 *
 * It called the same fire-and-forget `onSubmit` as Send feedback, with
 * `rescan: true`. Every caller persisted that boolean on a feedback document
 * and nothing acted on it — so someone who reported that the extracted tasks
 * were wrong and pressed Re-scan got "Thanks", no new read, and no trace. The
 * existing-task review could not have re-scanned anything even in principle:
 * it has no single manual behind it (`manualId: null`).
 *
 * A button is either wired or absent. (Codex adversarial review 2026-10-29,
 * finding 6.)
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { TaskReviewFeedback, type RescanOutcome, type ReviewEditSummary } from "./TaskReviewFeedback"

const edits: ReviewEditSummary = { tier: 1, kind: 0, schedule: 0, skipped: 0, total: 1, details: [] }

async function openSheet(onRescan?: () => Promise<RescanOutcome>) {
  const onSubmit = vi.fn()
  const user = userEvent.setup()
  render(<TaskReviewFeedback edits={edits} onSubmit={onSubmit} onRescan={onRescan} />)
  await user.click(screen.getByRole("button", { name: /tell us what's off/i }))
  return { user, onSubmit }
}

const rescanButton = () => screen.queryByRole("button", { name: /^re-scan$/i })

describe("Re-scan is offered only where a read can actually start", () => {
  it("no handler, no button — rather than a button that does nothing", async () => {
    await openSheet(undefined)
    expect(rescanButton()).toBeNull()
    // The sheet is still useful: the feedback half is what it was.
    expect(screen.getByRole("button", { name: /send feedback/i })).toBeTruthy()
  })

  it("with a handler, the button is there", async () => {
    await openSheet(async () => ({ ok: true }))
    expect(rescanButton()).toBeTruthy()
  })
})

describe("pressing Re-scan", () => {
  it("starts the read and records the corrections that came with it", async () => {
    const onRescan = vi.fn<() => Promise<RescanOutcome>>().mockResolvedValue({ ok: true })
    const { user, onSubmit } = await openSheet(onRescan)

    await user.click(rescanButton()!)

    await waitFor(() => expect(onRescan).toHaveBeenCalledTimes(1))
    // The corrections are the corpus this loop exists to collect; a re-scan
    // must not cost us them.
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ rescan: true, edits }))
    await waitFor(() => expect(rescanButton()).toBeNull(), { timeout: 2000 })
  })

  it("a refused read keeps the sheet open and says so — it never says Thanks", async () => {
    const onRescan = vi.fn<() => Promise<RescanOutcome>>().mockResolvedValue({
      ok: false,
      message: "That manual is already being read.",
    })
    const { user, onSubmit } = await openSheet(onRescan)

    await user.click(rescanButton()!)

    expect(await screen.findByRole("alert")).toHaveTextContent(/already being read/i)
    // Still open, so the person can try the other button or close it.
    expect(rescanButton()).toBeTruthy()
    expect(screen.queryByText(/thanks — that helps us/i)).toBeNull()
    // The feedback still went in: a failed read must not also lose the report.
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ rescan: true }))
  })

  it("a read queued for capacity closes, and says it is queued instead of Thanks", async () => {
    // Not a failure — the server parks it and the sweep starts it — so the
    // sheet closes, but the footer must not claim the generic thank-you.
    const onRescan = vi.fn<() => Promise<RescanOutcome>>().mockResolvedValue({
      ok: true,
      message: "We'll scan this a bit later — usually within a few hours.",
    })
    const { user } = await openSheet(onRescan)

    await user.click(rescanButton()!)

    expect(await screen.findByText(/a bit later/i)).toBeTruthy()
    expect(screen.queryByText(/thanks — that helps us/i)).toBeNull()
  })

  it("a second press while the first is in flight does not start two reads", async () => {
    let release!: (o: RescanOutcome) => void
    const onRescan = vi.fn<() => Promise<RescanOutcome>>().mockReturnValue(
      new Promise<RescanOutcome>((res) => { release = res }),
    )
    const { user } = await openSheet(onRescan)

    await user.click(rescanButton()!)
    await waitFor(() => expect(screen.getByRole("button", { name: /starting/i })).toBeDisabled())
    release({ ok: true })

    await waitFor(() => expect(onRescan).toHaveBeenCalledTimes(1))
  })
})
