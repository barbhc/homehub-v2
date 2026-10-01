/**
 * useNotificationsBlocked — round 18's "a bell is never drawn that cannot be
 * rung", read per device (HH-161 S5).
 *
 * The fix for a refusal happens OUTSIDE the app (the phone's Settings), so the
 * hook re-reads when the app comes back; that re-read is what makes S5.4 true:
 * "once notifications are on again, its bell returns without another review".
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"

vi.mock("@/lib/native", () => ({ isNativePlatform: () => false }))
vi.mock("@capacitor/push-notifications", () => ({ PushNotifications: { checkPermissions: vi.fn() } }))

import { useNotificationsBlocked } from "./useNotificationsBlocked"

let permission: NotificationPermission = "default"
function installNotification() {
  Object.defineProperty(window, "Notification", {
    configurable: true,
    value: Object.defineProperty(function Notification() {}, "permission", { configurable: true, get: () => permission }),
  })
}

afterEach(() => {
  Reflect.deleteProperty(window, "Notification")
})

describe("useNotificationsBlocked", () => {
  it("refused → blocked; allowed or not yet asked → not blocked", () => {
    installNotification()
    permission = "denied"
    expect(renderHook(() => useNotificationsBlocked()).result.current).toBe(true)
    permission = "granted"
    expect(renderHook(() => useNotificationsBlocked()).result.current).toBe(false)
    // Not yet asked: the bell can still ring once the ask is answered yes.
    permission = "default"
    expect(renderHook(() => useNotificationsBlocked()).result.current).toBe(false)
  })

  it("a browser with no Notification API cannot ring — blocked (notifyGate's 'unsupported')", () => {
    expect(renderHook(() => useNotificationsBlocked()).result.current).toBe(true)
  })

  it("re-reads when the app comes back, so the bell returns with permission (S5.4)", async () => {
    installNotification()
    permission = "denied"
    const { result } = renderHook(() => useNotificationsBlocked())
    expect(result.current).toBe(true)

    // The owner turned notifications on in the phone's Settings and came back.
    permission = "granted"
    await act(async () => { window.dispatchEvent(new Event("focus")) })
    expect(result.current).toBe(false)
  })
})
