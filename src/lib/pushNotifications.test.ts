/**
 * Turning web push OFF (audit H6 follow-up).
 *
 * A token that could not be READ was treated as "nothing to remove", so the
 * server's copy stayed and Settings showed notifications off while reminders
 * kept arriving — e.g. when the service worker failed to register offline.
 * Only without notification permission is an unreadable token genuinely
 * nothing (nothing can be delivered to this browser); with it, the failure
 * must reach Settings.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({ getFcmToken: vi.fn(), deleteFcmToken: vi.fn(), setDoc: vi.fn() }))
vi.mock("@/integrations/firebase", () => ({ db: {} }))
vi.mock("@/integrations/firebase/messaging", () => ({
  getFcmToken: (...a: unknown[]) => m.getFcmToken(...a),
  deleteFcmToken: (...a: unknown[]) => m.deleteFcmToken(...a),
  isFcmConfigured: () => true,
}))
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => ({ path: "users/uid-1/private/fcmTokens" })),
  setDoc: (...a: unknown[]) => m.setDoc(...a),
  arrayRemove: (t: string) => ({ remove: t }),
  arrayUnion: (t: string) => ({ union: t }),
}))

const { unsubscribeFromPush } = await import("./pushNotifications")

const permission = (p: NotificationPermission) => vi.stubGlobal("Notification", { permission: p })

beforeEach(() => {
  vi.clearAllMocks()
  m.getFcmToken.mockResolvedValue("tok-1")
  m.deleteFcmToken.mockResolvedValue(undefined)
  m.setDoc.mockResolvedValue(undefined)
  permission("granted")
})
afterEach(() => vi.unstubAllGlobals())

describe("unsubscribeFromPush", () => {
  it("a token it cannot read, with permission granted, is a FAILURE — never a quiet 'off'", async () => {
    m.getFcmToken.mockRejectedValue(new Error("Failed to register a ServiceWorker: offline"))
    await expect(unsubscribeFromPush("uid-1")).rejects.toThrow(/ServiceWorker/)
    expect(m.setDoc).not.toHaveBeenCalled()
  })

  it("a token it cannot read, without permission, is genuinely nothing to remove", async () => {
    permission("denied")
    m.getFcmToken.mockRejectedValue(new Error("messaging/permission-blocked"))
    await expect(unsubscribeFromPush("uid-1")).resolves.toBeUndefined()
    expect(m.setDoc).not.toHaveBeenCalled()
  })

  it("removes the browser's token from the server, then locally (the control case)", async () => {
    await unsubscribeFromPush("uid-1")
    expect(m.setDoc).toHaveBeenCalledWith(expect.anything(), { tokens: { remove: "tok-1" } }, { merge: true })
    expect(m.deleteFcmToken).toHaveBeenCalled()
  })

  it("a server removal that fails is a failure", async () => {
    m.setDoc.mockRejectedValue(new Error("permission-denied"))
    await expect(unsubscribeFromPush("uid-1")).rejects.toThrow("permission-denied")
  })
})
