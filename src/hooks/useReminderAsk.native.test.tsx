/**
 * Codex review F3, on the phone: the reminder ask says "Reminders are on" only
 * once this phone's token is stored.
 *
 * The sheet itself always did what registerNativePush told it — and
 * registerNativePush said success as soon as register() returned, before APNs
 * had named a token or anything was written. So this runs the sheet over the
 * REAL nativePush, with only the Capacitor plugin and Firestore stood in.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useEffect } from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import type { FakePush } from "@/test/fakeCapacitorPush"

const cap = vi.hoisted(() => ({ api: null as null | FakePush }))
const fs = vi.hoisted(() => ({ setDoc: vi.fn(), getDoc: vi.fn() }))
vi.mock("@capacitor/push-notifications", async () => {
  cap.api = (await import("@/test/fakeCapacitorPush")).createFakePush()
  return { PushNotifications: cap.api.PushNotifications }
})
vi.mock("@/lib/native", () => ({ isNativePlatform: () => true }))
vi.mock("@/lib/pushDeepLink", () => ({ parkDeepLink: vi.fn() }))
vi.mock("@/integrations/firebase", () => ({ db: {} }))
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => ({ path: "users/uid-1/private/fcmTokens" })),
  getDoc: (...a: unknown[]) => fs.getDoc(...a),
  setDoc: (...a: unknown[]) => fs.setDoc(...a),
  arrayUnion: (t: string) => ({ union: t }),
  arrayRemove: (t: string) => ({ remove: t }),
}))
vi.mock("@/lib/pushNotifications", () => ({ isPushSupported: () => false, isSubscribed: async () => false, subscribeToPush: vi.fn() }))
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }))
// Only the date's wording comes from here; the real module pulls in the whole task layer.
vi.mock("@/components/home/tasks/shared", () => ({ receiptDate: (ymd: string) => ymd }))

const { useReminderAsk } = await import("./useReminderAsk")
type DoneTask = import("./useReminderAsk").DoneTask

const APNS = "a".repeat(64)
const FAILED = "Couldn't turn on reminders on this phone. Try again."
const TASK: DoneTask = { title: "Test smoke and CO alarms", essential: true, itemName: null, nextDue: "2027-05-21" }
let offer: (t: DoneTask) => Promise<void> = async () => {}
const setOffer = (o: typeof offer) => { offer = o }
function Harness() {
  const ask = useReminderAsk("uid-1", "home-1")
  useEffect(() => setOffer(ask.offer), [ask.offer])
  return <>{ask.sheet}</>
}
const turnOn = async () => {
  render(<Harness />)
  await act(async () => { await offer(TASK) })
  fireEvent.click(screen.getByRole("button", { name: "Turn on reminders" }))
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  cap.api!.permission.receive = "prompt"
  cap.api!.apnsNames(APNS)
  fs.setDoc.mockResolvedValue(undefined)
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("the reminder ask on the phone", () => {
  it("says 'Reminders are on' once the token is stored", async () => {
    await turnOn()
    expect(await screen.findByText("Reminders are on")).toBeInTheDocument()
    expect(fs.setDoc).toHaveBeenCalledWith(expect.anything(), { tokens: { union: APNS } }, { merge: true })
  })

  it("the token cannot be stored → it says so and keeps the button, never 'on'", async () => {
    fs.setDoc.mockRejectedValue(new Error("unavailable"))
    await turnOn()

    expect(await screen.findByRole("alert")).toHaveTextContent(FAILED)
    expect(screen.queryByText("Reminders are on")).toBeNull()
    expect(screen.getByRole("button", { name: "Turn on reminders" })).toBeEnabled()
  })

  it("APNs refuses the registration → it says so, never 'on'", async () => {
    cap.api!.apnsRefuses("no valid aps-environment entitlement")
    await turnOn()

    expect(await screen.findByRole("alert")).toHaveTextContent(FAILED)
    expect(screen.queryByText("Reminders are on")).toBeNull()
    expect(fs.setDoc).not.toHaveBeenCalled()
  })

  it("Turn on again after a failure works, and then says on", async () => {
    fs.setDoc.mockRejectedValueOnce(new Error("unavailable"))
    await turnOn()
    await screen.findByRole("alert")

    fireEvent.click(screen.getByRole("button", { name: "Turn on reminders" }))
    expect(await screen.findByText("Reminders are on")).toBeInTheDocument()
  })
})
