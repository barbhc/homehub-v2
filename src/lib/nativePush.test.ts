/**
 * Turning reminders OFF on the phone (audit H6 follow-up).
 *
 * Disable removed `lastToken` from the server — but the token arrives through
 * the `registration` event, and AuthProvider's boot path only re-registers when
 * the server holds NO APNs token. So on a normal launch `lastToken` was empty,
 * Disable returned normally, Settings showed "off", and the server kept the
 * token and kept sending. And had it worked, the next launch's
 * ensureNativePushToken would have re-registered and put the token back.
 *
 * Now: ask APNs for this phone's token and remove THAT; if APNs never answers,
 * release the APNs registration instead; if neither works, say so. A phone
 * turned off here is marked so the boot re-registration leaves it alone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type Listener = (payload: unknown) => void
const cap = vi.hoisted(() => {
  const listeners = new Map<string, Set<Listener>>()
  const emit = (event: string, payload: unknown) => {
    for (const fn of [...(listeners.get(event) ?? [])]) fn(payload)
  }
  return {
    listeners,
    emit,
    PushNotifications: {
      addListener: vi.fn(async (event: string, fn: Listener) => {
        if (!listeners.has(event)) listeners.set(event, new Set())
        listeners.get(event)!.add(fn)
        return { remove: vi.fn(async () => { listeners.get(event)!.delete(fn) }) }
      }),
      register: vi.fn(),
      unregister: vi.fn(),
      checkPermissions: vi.fn(async () => ({ receive: "granted" })),
      requestPermissions: vi.fn(async () => ({ receive: "granted" })),
      removeAllListeners: vi.fn(async () => listeners.clear()),
    },
  }
})
const fs = vi.hoisted(() => ({ setDoc: vi.fn(), getDoc: vi.fn() }))

vi.mock("@capacitor/push-notifications", () => ({ PushNotifications: cap.PushNotifications }))
vi.mock("./native", () => ({ isNativePlatform: () => true }))
vi.mock("./pushDeepLink", () => ({ parkDeepLink: vi.fn() }))
vi.mock("@/integrations/firebase", () => ({ db: {} }))
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => ({ path: "users/uid-1/private/fcmTokens" })),
  getDoc: (...a: unknown[]) => fs.getDoc(...a),
  setDoc: (...a: unknown[]) => fs.setDoc(...a),
  arrayUnion: (t: string) => ({ union: t }),
  arrayRemove: (t: string) => ({ remove: t }),
}))

const APNS = "a".repeat(64)
const OFF_KEY = "homehub:native-push-off"
/** A fresh module per test: `lastToken` and the listener handles are module state. */
const load = async () => {
  vi.resetModules()
  return import("./nativePush")
}
/** APNs answering register() with this phone's token, as the plugin does. */
const apnsAnswers = () => cap.PushNotifications.register.mockImplementation(async () => {
  queueMicrotask(() => cap.emit("registration", { value: APNS }))
})

beforeEach(() => {
  vi.clearAllMocks()
  cap.listeners.clear()
  localStorage.clear()
  fs.setDoc.mockResolvedValue(undefined)
  fs.getDoc.mockResolvedValue({ get: () => [] })
  cap.PushNotifications.register.mockResolvedValue(undefined)
  cap.PushNotifications.unregister.mockResolvedValue(undefined)
})
afterEach(() => vi.useRealTimers())

describe("unregisterNativePush — only claims off when it is true", () => {
  it("with no token from this launch, asks APNs for it and removes THAT from the server", async () => {
    apnsAnswers()
    const { unregisterNativePush } = await load()

    await unregisterNativePush("uid-1")

    expect(cap.PushNotifications.register).toHaveBeenCalled()
    expect(fs.setDoc).toHaveBeenCalledWith(expect.anything(), { tokens: { remove: APNS } }, { merge: true })
    expect(localStorage.getItem(OFF_KEY)).toBe("1")
  })

  it("the token-persisting listener cannot put the token back while it is removed", async () => {
    apnsAnswers()
    const { registerNativePush, unregisterNativePush } = await load()
    await registerNativePush("uid-1", "home-1")
    await vi.waitFor(() => expect(fs.setDoc).toHaveBeenCalledWith(expect.anything(), { tokens: { union: APNS } }, { merge: true }))
    fs.setDoc.mockClear()

    await unregisterNativePush("uid-1")
    // Another registration after Disable (e.g. the OS refreshing it) adds nothing.
    cap.emit("registration", { value: APNS })
    await Promise.resolve()

    expect(fs.setDoc.mock.calls.map((c) => c[1])).toEqual([{ tokens: { remove: APNS } }])
    // The notification-TAP listener survives Disable — a reminder already
    // delivered should still open its task.
    expect(cap.listeners.get("pushNotificationActionPerformed")?.size).toBe(1)
  })

  it("if APNs never answers, releases this phone's APNs registration instead — and says off", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const { unregisterNativePush, TOKEN_WAIT_MS } = await load()

    const off = unregisterNativePush("uid-1")
    await vi.advanceTimersByTimeAsync(TOKEN_WAIT_MS)
    await off

    expect(cap.PushNotifications.unregister).toHaveBeenCalled()
    expect(fs.setDoc).not.toHaveBeenCalled()
    expect(localStorage.getItem(OFF_KEY)).toBe("1")
  })

  it("if neither works, says 'Couldn't turn off reminders on this phone' and claims nothing", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    cap.PushNotifications.unregister.mockRejectedValue(new Error("UNIMPLEMENTED"))
    const { unregisterNativePush, TOKEN_WAIT_MS, PushOffError } = await load()

    const off = unregisterNativePush("uid-1")
    const settled = expect(off).rejects.toBeInstanceOf(PushOffError)
    await vi.advanceTimersByTimeAsync(TOKEN_WAIT_MS)
    await settled
    await expect(off).rejects.toThrow("Couldn't turn off reminders on this phone")
    expect(localStorage.getItem(OFF_KEY)).toBeNull()
  })

  it("a server removal that fails is a failure, and the phone is not marked off", async () => {
    apnsAnswers()
    fs.setDoc.mockRejectedValue(new Error("permission-denied"))
    const { unregisterNativePush } = await load()

    await expect(unregisterNativePush("uid-1")).rejects.toThrow("permission-denied")
    expect(localStorage.getItem(OFF_KEY)).toBeNull()
  })
})

describe("a phone turned off here stays off", () => {
  it("the boot re-registration (ensureNativePushToken) leaves it alone, and Settings reads it as off", async () => {
    localStorage.setItem(OFF_KEY, "1")
    const { ensureNativePushToken, isNativePushRegistered } = await load()

    expect(await ensureNativePushToken("uid-1")).toBe(false)
    expect(cap.PushNotifications.register).not.toHaveBeenCalled()
    expect(await isNativePushRegistered()).toBe(false)
  })

  it("turning it back on clears the mark", async () => {
    localStorage.setItem(OFF_KEY, "1")
    apnsAnswers()
    const { registerNativePush, isNativePushRegistered } = await load()

    expect(await registerNativePush("uid-1", "home-1")).toEqual({ success: true })
    expect(localStorage.getItem(OFF_KEY)).toBeNull()
    expect(await isNativePushRegistered()).toBe(true)
  })
})
