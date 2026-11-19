/**
 * The reminder ask's sheet (design/day-one-home.md, release C): once per
 * device, only when the system prompt is still unspent, previewing the real
 * push for the task just done — and every failure said, never a false "on".
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useEffect } from "react"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"

const push = vi.hoisted(() => ({
  supported: true,
  subscribed: false,
  subscribe: vi.fn(async () => ({ success: true }) as { success: boolean; error?: string }),
}))
vi.mock("@/lib/pushNotifications", () => ({
  isPushSupported: () => push.supported,
  isSubscribed: async () => push.subscribed,
  subscribeToPush: () => push.subscribe(),
}))
vi.mock("@/lib/nativePush", () => ({
  isNativePlatform: () => false,
  isNativePushRegistered: async () => false,
  isNativePushTurnedOff: () => false,
  nativePushPermission: async () => "denied",
  registerNativePush: vi.fn(),
}))
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }))

const { useReminderAsk } = await import("./useReminderAsk")
type DoneTask = import("./useReminderAsk").DoneTask

const TASK: DoneTask = { title: "Test smoke and CO alarms", essential: true, itemName: null, nextDue: "2027-05-21" }
let offer: (t: DoneTask) => Promise<void> = async () => {}
const setOffer = (o: typeof offer) => { offer = o }
function Harness() {
  const ask = useReminderAsk("uid-1", "home-1")
  useEffect(() => setOffer(ask.offer), [ask.offer])
  return <>{ask.sheet}</>
}
const setPermission = (p: NotificationPermission) => {
  Object.defineProperty(globalThis, "Notification", { value: { permission: p }, configurable: true, writable: true })
}

beforeEach(() => {
  window.localStorage.clear()
  push.supported = true
  push.subscribed = false
  push.subscribe.mockReset()
  push.subscribe.mockResolvedValue({ success: true })
  setPermission("default")
})

const open = async (t = TASK) => {
  render(<Harness />)
  await act(async () => { await offer(t) })
}

describe("useReminderAsk", () => {
  it("previews the real push for the task, with the day it would arrive", async () => {
    await open()
    expect(screen.getByText("Want a heads-up next time?")).toBeInTheDocument()
    expect(screen.getByText("We'd send this on May 21, the day it's due.")).toBeInTheDocument()
    expect(screen.getByText("Today: Test smoke and CO alarms")).toBeInTheDocument()
    expect(screen.getByText("You asked to be reminded for this one.")).toBeInTheDocument()
    expect(screen.getByText("A Sunday summary of your week")).toBeInTheDocument()
  })

  it("Turn on asks the system once and says it is on only when it is", async () => {
    await open()
    fireEvent.click(screen.getByRole("button", { name: "Turn on reminders" }))
    expect(await screen.findByText("Reminders are on")).toBeInTheDocument()
    expect(push.subscribe).toHaveBeenCalledTimes(1)
  })

  it("a failed turn-on says why and keeps the button — never 'on'", async () => {
    push.subscribe.mockResolvedValue({ success: false, error: "Could not obtain a push token" })
    await open()
    fireEvent.click(screen.getByRole("button", { name: "Turn on reminders" }))
    expect(await screen.findByText("Could not obtain a push token")).toBeInTheDocument()
    expect(screen.queryByText("Reminders are on")).toBeNull()
    expect(screen.getByRole("button", { name: "Turn on reminders" })).toBeEnabled()
  })

  it("Not now is final on this device", async () => {
    await open()
    fireEvent.click(screen.getByRole("button", { name: "Not now" }))
    await waitFor(() => expect(screen.queryByText("Want a heads-up next time?")).toBeNull())
    await act(async () => { await offer(TASK) })
    expect(screen.queryByText("Want a heads-up next time?")).toBeNull()
  })

  it("never asks when the answer is known: refused, already on, Home's nudge declined, or not Essential", async () => {
    setPermission("denied")
    await open()
    expect(screen.queryByText("Want a heads-up next time?")).toBeNull()

    setPermission("default")
    push.subscribed = true
    await act(async () => { await offer(TASK) })
    expect(screen.queryByText("Want a heads-up next time?")).toBeNull()

    push.subscribed = false
    window.localStorage.setItem("homehub:push_nudge_dismissed:home-1", "1")
    await act(async () => { await offer(TASK) })
    expect(screen.queryByText("Want a heads-up next time?")).toBeNull()

    window.localStorage.clear()
    await act(async () => { await offer({ ...TASK, essential: false }) })
    expect(screen.queryByText("Want a heads-up next time?")).toBeNull()
  })

  it("without a next date it still says when", async () => {
    await open({ ...TASK, nextDue: null })
    expect(screen.getByText("We'd send this on the day it's due.")).toBeInTheDocument()
  })
})
