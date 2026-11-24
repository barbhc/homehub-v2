/**
 * Codex review F3, on the phone: Home's nudge goes away only once this phone's
 * token is stored. Run over the REAL nativePush (see useReminderAsk.native.test).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
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
  doc: vi.fn(() => ({ path: "users/u1/private/fcmTokens" })),
  getDoc: (...a: unknown[]) => fs.getDoc(...a),
  setDoc: (...a: unknown[]) => fs.setDoc(...a),
  arrayUnion: (t: string) => ({ union: t }),
  arrayRemove: (t: string) => ({ remove: t }),
}))
vi.mock("@/lib/pushNotifications", () => ({ isPushSupported: () => false, isSubscribed: async () => false, subscribeToPush: vi.fn() }))

const { PushOptInNudge } = await import("./PushOptInNudge")

const APNS = "a".repeat(64)
const FAILED = "Couldn't turn on reminders on this phone. Try again."
const nudge = () => render(<MemoryRouter><PushOptInNudge userId="u1" homeId="h1" /></MemoryRouter>)
const enable = async () => fireEvent.click(await screen.findByRole("button", { name: "Enable notifications" }))

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  cap.api!.permission.receive = "prompt"
  cap.api!.apnsNames(APNS)
  fs.setDoc.mockResolvedValue(undefined)
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("Home's notifications nudge on the phone", () => {
  it("goes away once the token is stored", async () => {
    nudge()
    await enable()
    await waitFor(() => expect(screen.queryByText("Turn on notifications")).toBeNull())
    expect(fs.setDoc).toHaveBeenCalledWith(expect.anything(), { tokens: { union: APNS } }, { merge: true })
  })

  it("the token cannot be stored → it stays, says so, and offers the button again", async () => {
    fs.setDoc.mockRejectedValue(new Error("unavailable"))
    nudge()
    await enable()

    expect(await screen.findByRole("alert")).toHaveTextContent(FAILED)
    expect(screen.getByText("Turn on notifications")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Enable notifications" })).toBeEnabled()
  })

  it("after a failed turn-on the nudge is still offered on the next visit — permission alone is not 'on'", async () => {
    fs.setDoc.mockRejectedValue(new Error("unavailable"))
    const first = nudge()
    await enable()
    await screen.findByRole("alert")
    first.unmount()

    // iOS now reports permission granted; the token was never stored.
    nudge()
    expect(await screen.findByText("Turn on notifications")).toBeInTheDocument()
  })
})
