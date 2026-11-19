/**
 * Closing a Done's bar accepts it — the Done is written NOW, not at the timer.
 *
 * The close button used to look up which Done it belonged to in a ref that an
 * effect kept current. Effects run after the bar is on screen, so a close in
 * that gap found no Done, wrote nothing, and left the row hidden until the
 * 6 s timer. Home.checkoff.failure.test.tsx hit it about 1 run in 25 (CI,
 * 2026-11-19). Here the close lands in that gap every time: a layout effect
 * runs after the bar is drawn and before any passive effect.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, waitFor } from "@testing-library/react"
import { useLayoutEffect, useRef } from "react"
import { useTaskActions } from "./shared"
import { resetDoneQueueForTests } from "./doneQueue"

const svc = vi.hoisted(() => ({
  markTaskInstanceDone: vi.fn(),
  snoozeTaskInstance: vi.fn(),
  unsnoozeTaskInstance: vi.fn(),
  previewNextDue: vi.fn(),
}))
vi.mock("@/modules/care", () => ({
  markTaskInstanceDone: (...a: unknown[]) => svc.markTaskInstanceDone(...a),
  snoozeTaskInstance: (...a: unknown[]) => svc.snoozeTaskInstance(...a),
  unsnoozeTaskInstance: (...a: unknown[]) => svc.unsnoozeTaskInstance(...a),
  previewNextDue: (...a: unknown[]) => svc.previewNextDue(...a),
}))
vi.mock("@/integrations/firebase", () => ({ auth: { currentUser: { uid: "user-a" } } }))

/** Taps Done once, then closes the bar in the same commit that first draws it. */
function CloseOnFirstPaint({ onHidden }: { onHidden: (ids: ReadonlySet<string>) => void }) {
  const actions = useTaskActions("home-1", { where: "test" })
  const tapped = useRef(false)
  const closed = useRef(false)
  useLayoutEffect(() => {
    if (!tapped.current) {
      tapped.current = true
      void actions.done("ti-1", "Replace the furnace filter")
    }
    if (actions.bar && !closed.current) {
      closed.current = true
      actions.bar.onDismiss()
    }
  })
  onHidden(actions.hidden)
  return null
}

beforeEach(() => {
  vi.clearAllMocks()
  resetDoneQueueForTests()
  localStorage.clear()
  svc.previewNextDue.mockResolvedValue(null)
})

describe("closing a Done's bar", () => {
  it("writes the Done at once, even when closed before the screen's effects have run", async () => {
    svc.markTaskInstanceDone.mockResolvedValue({ success: true, data: {} })
    render(<CloseOnFirstPaint onHidden={() => {}} />)

    // Well inside the 6 s Undo window: only the close can have written it.
    await waitFor(() => expect(svc.markTaskInstanceDone).toHaveBeenCalledTimes(1))
    expect(svc.markTaskInstanceDone.mock.calls[0].slice(0, 2)).toEqual(["home-1", "ti-1"])
  })

  it("a refused write closed that way brings the row back at once", async () => {
    svc.markTaskInstanceDone.mockResolvedValue({ success: false, error: "INTERNAL" })
    let hidden: ReadonlySet<string> = new Set()
    render(<CloseOnFirstPaint onHidden={(h) => { hidden = h }} />)

    await waitFor(() => expect(svc.markTaskInstanceDone).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(hidden.has("ti-1")).toBe(false))
  })
})
