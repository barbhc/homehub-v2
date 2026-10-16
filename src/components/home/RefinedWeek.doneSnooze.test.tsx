/**
 * One Done and Snooze everywhere — the Tasks page (owner, 2026-10-15).
 *
 * On main the Tasks rows snoozed for 7 days in silence and marked done in
 * silence, with no Undo for either, and the phone's swipe did the same. Home
 * and the item page snoozed for 14 days with "Snoozed until … · Undo". Now
 * every list shares one hook (useTaskActions):
 *  · Snooze is 14 days, says "Snoozed until {date}", and Undo un-snoozes;
 *  · Done takes the row off, says "Done · next due {date}" with Undo, and is
 *    only WRITTEN when that bar goes — so Undo means nothing was ever written;
 *  · leaving the page writes a Done still in its Undo window (never lost);
 *  · the swipe goes through the same bar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render as rtlRender, screen, waitFor, within } from "@testing-library/react"
import { SWRConfig } from "swr"
import { RefinedWeek } from "./RefinedWeek"
import { DONE_UNDO_MS } from "./tasks/shared"
import { clearDoneQueue, resetDoneQueueForTests } from "./tasks/doneQueue"
import { addDays, localToday } from "../../../shared/dates/calendar"

const render = (ui: React.ReactElement) =>
  rtlRender(<SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>{ui}</SWRConfig>)

const svc = vi.hoisted(() => ({
  getWeekAgenda: vi.fn(),
  markTaskInstanceDone: vi.fn(),
  snoozeTaskInstance: vi.fn(),
  unsnoozeTaskInstance: vi.fn(),
  previewNextDue: vi.fn(),
  getTaskDetail: vi.fn(),
}))
vi.mock("@/modules/care", () => ({
  getWeekAgenda: (...a: unknown[]) => svc.getWeekAgenda(...a),
  markTaskInstanceDone: (...a: unknown[]) => svc.markTaskInstanceDone(...a),
  snoozeTaskInstance: (...a: unknown[]) => svc.snoozeTaskInstance(...a),
  unsnoozeTaskInstance: (...a: unknown[]) => svc.unsnoozeTaskInstance(...a),
  previewNextDue: (...a: unknown[]) => svc.previewNextDue(...a),
  getTaskDetail: (...a: unknown[]) => svc.getTaskDetail(...a),
}))
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }))
// Who is signed in — the queue stamps every Done with it.
const session = vi.hoisted(() => ({ auth: { currentUser: { uid: "user-a" } as { uid: string } | null } }))
vi.mock("@/integrations/firebase", () => ({ auth: session.auth, db: {}, callable: vi.fn(() => vi.fn()) }))
vi.mock("@/hooks/useCareSuggestions", () => ({
  useCareSuggestions: () => ({ rows: [], loading: false, error: null, add: vi.fn(), dismiss: vi.fn(), reload: vi.fn() }),
}))

const TITLE = "Replace the furnace filter"
const TASK = {
  taskInstanceId: "ti-1", taskTemplateId: "tt-1", title: TITLE, source: "maintenance", priorityTier: "essential",
  estimatedMinutes: 10, dueDate: localToday(), isOverdue: false, pastDue: false, dueKind: "window",
  windowState: "open", duePhrase: "Good to do now", safetyNote: null, trulyOverdue: false,
  itemUnitId: null, itemName: null, roomName: null,
}
const NEXT_DUE = addDays(localToday(), 30)
const short = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })

const QUEUE_KEY = "hh:pending-dones:v1"

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  resetDoneQueueForTests()
  session.auth.currentUser = { uid: "user-a" }
  svc.getWeekAgenda.mockResolvedValue({ data: [TASK], error: null, withheld: { beyondHorizon: 0, nextDueDate: null, itemCleaning: 0 } })
  svc.getTaskDetail.mockResolvedValue({ data: { steps: [], infoBlurb: null }, error: null })
  svc.markTaskInstanceDone.mockResolvedValue({ success: true, data: {}, nextInstanceId: "ti-2" })
  svc.snoozeTaskInstance.mockResolvedValue({ success: true })
  svc.unsnoozeTaskInstance.mockResolvedValue({ success: true })
  svc.previewNextDue.mockResolvedValue(NEXT_DUE)
})
afterEach(() => {
  vi.useRealTimers()
})

const settle = async () => {
  const view = render(<RefinedWeek homeId="home-1" />)
  await screen.findByText(TITLE)
  return view
}
const rowEl = () => screen.getByTestId("phone-task-row")
const bar = () => screen.findByRole("status")

/** The row toggles on pointer down/up with no movement; a drag past 72px is a swipe. */
const drag = (dx: number) => {
  const target = screen.getByText(TITLE).closest("div")!.parentElement!
  fireEvent.pointerDown(target, { clientX: 100, pointerId: 1 })
  fireEvent.pointerMove(target, { clientX: 100 + dx, pointerId: 1 })
  fireEvent.pointerUp(target, { clientX: 100 + dx, pointerId: 1 })
}

describe("Tasks — Snooze is the 14-day snooze with a receipt and Undo", () => {
  it("snoozes for 14 days, says until when, and Undo un-snoozes and brings it back", async () => {
    await settle()
    drag(0) // open the row
    fireEvent.click(await screen.findByRole("button", { name: /^snooze$/i }))

    await waitFor(() => expect(svc.snoozeTaskInstance).toHaveBeenCalledWith("home-1", "ti-1", addDays(localToday(), 14)))
    const receipt = await bar()
    expect(receipt).toHaveTextContent(`Snoozed until ${short(addDays(localToday(), 14))}`)
    expect(screen.queryByText(TITLE)).toBeNull()

    const reads = svc.getWeekAgenda.mock.calls.length
    fireEvent.click(within(receipt).getByRole("button", { name: "Undo" }))
    await waitFor(() => expect(svc.unsnoozeTaskInstance).toHaveBeenCalledWith("home-1", "ti-1", null))
    // The agenda is read again, so the task is back where it was.
    await waitFor(() => expect(svc.getWeekAgenda.mock.calls.length).toBeGreaterThan(reads))
    expect(await screen.findByText(TITLE)).toBeInTheDocument()
  })
})

describe("Tasks — Undo of a RE-snooze puts the earlier snooze back", () => {
  it("hands the snooze's prior state to un-snooze", async () => {
    const prior = { status: "snoozed", snoozedUntil: addDays(localToday(), 3) }
    svc.snoozeTaskInstance.mockResolvedValue({ success: true, prior })
    await settle()
    drag(-110)
    fireEvent.click(within(await bar()).getByRole("button", { name: "Undo" }))
    await waitFor(() => expect(svc.unsnoozeTaskInstance).toHaveBeenCalledWith("home-1", "ti-1", prior))
  })
})

describe("Tasks — a Done is never lost after its receipt said Done", () => {
  it("is on this device from the tap, before any write", async () => {
    await settle()
    fireEvent.click(within(rowEl()).getByLabelText(/mark done/i))
    await bar()
    const saved = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]")
    expect(saved).toEqual([expect.objectContaining({ uid: "user-a", homeId: "home-1", id: "ti-1", label: TITLE, completedOn: localToday(), state: "pending" })])
    expect(svc.markTaskInstanceDone).not.toHaveBeenCalled()
  })

  it("offline Done, then leave the screen → the NEXT screen says it failed, and Try again writes it", async () => {
    svc.markTaskInstanceDone.mockResolvedValue({ success: false, error: "You're offline" })
    const tasks = await settle()
    fireEvent.click(within(rowEl()).getByLabelText(/mark done/i))
    await bar()
    // Leave inside the Undo window: the write goes, and is refused, with no row left to say it on.
    tasks.unmount()
    await waitFor(() => expect(svc.markTaskInstanceDone).toHaveBeenCalledTimes(1))

    // The next screen says so — never a silent drop.
    render(<RefinedWeek homeId="home-1" />)
    const line = await screen.findByRole("status")
    expect(line).toHaveTextContent(`Couldn't mark “${TITLE}” done.`)
    svc.markTaskInstanceDone.mockResolvedValue({ success: true, data: {}, nextInstanceId: "ti-2" })
    fireEvent.click(within(line).getByRole("button", { name: "Try again" }))
    await waitFor(() => expect(svc.markTaskInstanceDone).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText(/Couldn't mark/)).toBeNull())
    expect(localStorage.getItem(QUEUE_KEY)).toBeNull()
  })

  it("a Done left unwritten by the last run (app swiped away) is written by the next screen that mounts", async () => {
    localStorage.setItem(QUEUE_KEY, JSON.stringify([
      { uid: "user-a", homeId: "home-1", id: "ti-9", label: "Flush the water heater", completedOn: localToday(), nextDue: NEXT_DUE, state: "pending", error: null },
    ]))
    resetDoneQueueForTests()
    await settle()
    await waitFor(() =>
      expect(svc.markTaskInstanceDone).toHaveBeenCalledWith("home-1", "ti-9", null, { completedOn: localToday(), backdated: false, nextDueOverride: NEXT_DUE }))
    await waitFor(() => expect(localStorage.getItem(QUEUE_KEY)).toBeNull())
  })
})

describe("Tasks — a Done never crosses accounts, and a hopeless one is not retried forever", () => {
  const failedFor = (uid: string) =>
    JSON.stringify([{ uid, homeId: "home-1", id: "ti-9", label: "Flush the water heater", completedOn: localToday(), nextDue: null, state: "failed", error: "You're offline" }])
  const pendingFor = (uid: string) =>
    JSON.stringify([{ uid, homeId: "home-1", id: "ti-8", label: "Test smoke alarms", completedOn: localToday(), nextDue: null, state: "pending", error: null }])

  it("sign out, sign in as someone else → no 'Couldn't mark' line and no write of the last account's Done", async () => {
    svc.markTaskInstanceDone.mockResolvedValue({ success: false, error: "You're offline" })
    const tasks = await settle()
    fireEvent.click(within(rowEl()).getByLabelText(/mark done/i))
    await bar()
    tasks.unmount() // written, refused: now a failed Done waiting to be said
    await waitFor(() => expect(svc.markTaskInstanceDone).toHaveBeenCalledTimes(1))

    clearDoneQueue() // what AuthProvider.signOut does
    session.auth.currentUser = { uid: "user-b" }
    await settle()
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText(/Couldn't mark/)).toBeNull()
    expect(svc.markTaskInstanceDone).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(QUEUE_KEY)).toBeNull()
  })

  it("even if another account's entries survive on disk, they are dropped — never shown, never written", async () => {
    localStorage.setItem(QUEUE_KEY, JSON.stringify([...JSON.parse(failedFor("user-a")), ...JSON.parse(pendingFor("user-a"))]))
    resetDoneQueueForTests()
    session.auth.currentUser = { uid: "user-b" }
    await settle()
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText(/Couldn't mark/)).toBeNull()
    expect(svc.markTaskInstanceDone).not.toHaveBeenCalled()
    expect(localStorage.getItem(QUEUE_KEY)).toBeNull()
  })

  it("a Done the server can never take (task gone) is dropped, not offered as Try again", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    svc.markTaskInstanceDone.mockResolvedValue({ success: false, error: "Task instance not found" })
    localStorage.setItem(QUEUE_KEY, pendingFor("user-a"))
    resetDoneQueueForTests()
    await settle()
    await waitFor(() => expect(svc.markTaskInstanceDone).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(localStorage.getItem(QUEUE_KEY)).toBeNull())
    expect(screen.queryByText(/Couldn't mark/)).toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("ti-8 (home home-1)"), "Task instance not found")
    warn.mockRestore()
  })
})

describe("Tasks — Done from the list: receipt and Undo first, the write after", () => {
  it("says 'Done · next due {date}' with Undo, and Undo means nothing is ever written", async () => {
    const view = await settle()
    fireEvent.click(within(rowEl()).getByLabelText(/mark done/i))

    const receipt = await bar()
    expect(receipt).toHaveTextContent(`Done · next due ${short(NEXT_DUE)}`)
    expect(screen.queryByText(TITLE)).toBeNull()
    expect(svc.markTaskInstanceDone).not.toHaveBeenCalled()

    fireEvent.click(within(receipt).getByRole("button", { name: "Undo" }))
    expect(await screen.findByText(TITLE)).toBeInTheDocument()

    // Not at the timer, and not when the page goes away either.
    view.unmount()
    expect(svc.markTaskInstanceDone).not.toHaveBeenCalled()
  })

  it("is written when the Undo window runs out — with the date the receipt named", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"], shouldAdvanceTime: true })
    await settle()
    fireEvent.click(within(rowEl()).getByLabelText(/mark done/i))
    await bar()
    expect(svc.markTaskInstanceDone).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(DONE_UNDO_MS + 50)
    })
    await waitFor(() =>
      expect(svc.markTaskInstanceDone).toHaveBeenCalledWith("home-1", "ti-1", null, { completedOn: localToday(), backdated: false, nextDueOverride: NEXT_DUE }))
    expect(svc.markTaskInstanceDone).toHaveBeenCalledTimes(1)
  })

  it("leaving the page inside the Undo window still writes the Done — never lost", async () => {
    const view = await settle()
    fireEvent.click(within(rowEl()).getByLabelText(/mark done/i))
    await bar()
    view.unmount()
    expect(svc.markTaskInstanceDone).toHaveBeenCalledTimes(1)
    expect(svc.markTaskInstanceDone).toHaveBeenCalledWith("home-1", "ti-1", null, expect.objectContaining({ completedOn: localToday() }))
  })
})

describe("Tasks — the swipe uses the same bar", () => {
  it("swipe right is Done, with 'Done · next due' and Undo", async () => {
    await settle()
    drag(110)
    const receipt = await bar()
    expect(receipt).toHaveTextContent(`Done · next due ${short(NEXT_DUE)}`)
    expect(within(receipt).getByRole("button", { name: "Undo" })).toBeInTheDocument()
    expect(svc.markTaskInstanceDone).not.toHaveBeenCalled()
  })

  it("swipe left is the 14-day Snooze, with 'Snoozed until' and Undo", async () => {
    await settle()
    drag(-110)
    const receipt = await bar()
    expect(receipt).toHaveTextContent(`Snoozed until ${short(addDays(localToday(), 14))}`)
    expect(within(receipt).getByRole("button", { name: "Undo" })).toBeInTheDocument()
    expect(svc.snoozeTaskInstance).toHaveBeenCalledWith("home-1", "ti-1", addDays(localToday(), 14))
  })
})
