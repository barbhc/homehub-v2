import type { PluginListenerHandle } from "@capacitor/core"
import { PushNotifications } from "@capacitor/push-notifications"
import { doc, getDoc, setDoc, arrayUnion, arrayRemove } from "firebase/firestore"
import { db } from "@/integrations/firebase"
import { isNativePlatform } from "./native"
import { parkDeepLink } from "./pushDeepLink"

export { isNativePlatform }

/**
 * Native push registration (Capacitor). The device token is stored in the SAME
 * users/{uid}/private/fcmTokens array the web FCM path uses; the sendPush Cloud
 * Function delivers to it. Replaces the v1 `push_subscription` (Supabase) table.
 *
 * NOTE (owner, post-switch): on iOS this token must be an FCM registration token
 * for the server's FCM multicast to reach it — the native app needs the Firebase
 * Messaging SDK + APNs key wired at build time (see IOS_SETUP.md). No-op on web.
 */

// The token listener fires asynchronously after register(); keep the latest
// user so a re-register re-targets the stored row without re-adding the
// (process-global) Capacitor listeners.
let currentUserId = ""
let listenersReady = false
let tapListenerReady = false
let lastToken = ""
/** The token-persisting listeners, kept so Disable can remove exactly these —
 *  removeAllListeners() also took the notification-TAP listener with it. */
let registrationHandles: PluginListenerHandle[] = []

const tokensDoc = (uid: string) => doc(db, `users/${uid}/private/fcmTokens`)

/**
 * "Reminders off on this phone" — device-local, because Disable removes THIS
 * device's token. ensureNativePushToken re-registers at every boot (via
 * AuthProvider) when permission is granted and the server holds no APNs token,
 * so without this mark the next launch quietly re-added the token and undid
 * the Disable (audit H6 follow-up).
 */
const OFF_KEY = "homehub:native-push-off"

export function isNativePushTurnedOff(): boolean {
  try {
    return localStorage.getItem(OFF_KEY) === "1"
  } catch {
    // Storage unreadable: no mark to honour — reminders behave as before Disable.
    return false
  }
}

/** Disable could not make this phone stop receiving reminders — said as is. */
export class PushOffError extends Error {
  constructor() {
    super("Couldn't turn off reminders on this phone. Try again, or turn off notifications for Homehub in iOS Settings.")
    this.name = "PushOffError"
  }
}

/** How long Disable waits for APNs to name this phone's token. */
export const TOKEN_WAIT_MS = 10_000

async function persistToken(token: string): Promise<void> {
  if (!currentUserId) return
  try {
    await setDoc(tokensDoc(currentUserId), { tokens: arrayUnion(token) }, { merge: true })
  } catch (err) {
    console.error("[nativePush] failed to store token:", err instanceof Error ? err.message : err)
  }
}

/**
 * Register the notification-TAP listener immediately, before anything else.
 *
 * This used to live inside ensureListeners(), which only runs once Firebase
 * auth has resolved and a token registration is attempted — several seconds
 * into boot. iOS delivers the tap to the plugin at LAUNCH, so on a cold start
 * the event fired into a JS runtime with no listener attached and was simply
 * lost: the deep link worked server-side (the notification named the task) and
 * the app still opened on Home. Which is exactly what was reported.
 *
 * Tapping a notification needs no auth and no token, so it must not wait for
 * either. Safe to call from module scope; no-ops on web.
 */
export async function registerDeepLinkListener(): Promise<void> {
  if (!isNativePlatform() || tapListenerReady) return
  tapListenerReady = true
  try {
    await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      parkDeepLink((action.notification.data as { url?: string } | undefined)?.url)
    })
  } catch (err) {
    console.error("[nativePush] tap listener failed:", err instanceof Error ? err.message : err)
    tapListenerReady = false
  }
}

async function ensureListeners(): Promise<void> {
  if (listenersReady) return
  listenersReady = true
  registrationHandles = [
    await PushNotifications.addListener("registration", (token) => {
      lastToken = token.value
      void persistToken(token.value)
    }),
    await PushNotifications.addListener("registrationError", (err) => {
      console.error("[nativePush] registration error:", err)
    }),
  ]
  // The tap listener is NOT registered here — it must exist before auth
  // resolves or a cold-start tap is lost. See registerDeepLinkListener.
  await registerDeepLinkListener()
}

/** Removes listeners; a handle that won't go is logged, never thrown. */
async function removeHandles(handles: PluginListenerHandle[]): Promise<void> {
  await Promise.all(
    handles.map((h) =>
      h.remove().catch((err: unknown) => {
        console.warn("[nativePush] could not remove a push listener:", err instanceof Error ? err.message : err)
      }),
    ),
  )
}

/** Stop persisting tokens (Disable). The tap listener stays: a reminder that
 *  already arrived should still open its task. */
async function removeRegistrationListeners(): Promise<void> {
  const handles = registrationHandles
  registrationHandles = []
  listenersReady = false
  await removeHandles(handles)
}

/**
 * Ask APNs to name this phone's token again and wait for the answer. register()
 * is silent (no prompt) and answers with the same token for this install.
 * Resolves null — never rejects — when no answer comes within TOKEN_WAIT_MS.
 */
function freshRegistrationToken(): Promise<string | null> {
  return new Promise((resolve) => {
    let handles: PluginListenerHandle[] = []
    let settled = false
    const finish = (token: string | null, why?: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      void removeHandles(handles)
      if (token === null) console.warn("[nativePush] could not get this phone's push token:", why instanceof Error ? why.message : why)
      resolve(token)
    }
    const timer = setTimeout(() => finish(null, `no registration within ${TOKEN_WAIT_MS}ms`), TOKEN_WAIT_MS)
    Promise.all([
      PushNotifications.addListener("registration", (t) => finish(t.value)),
      PushNotifications.addListener("registrationError", (err) => finish(null, err.error)),
    ])
      .then((hs) => {
        // Settled while these were still being attached (the wait ran out):
        // they missed finish()'s cleanup, so remove them here.
        if (settled) return removeHandles(hs)
        handles = hs
        return PushNotifications.register()
      })
      .catch((err: unknown) => finish(null, err))
  })
}

/**
 * Request OS permission, register with APNs, and store the device token.
 * Mirrors `subscribeToPush()`'s return shape so opt-in UI can call either path.
 */
export async function registerNativePush(
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  if (!isNativePlatform()) return { success: false, error: "Not a native platform" }
  currentUserId = userId
  try {
    const perm = await PushNotifications.requestPermissions()
    if (perm.receive !== "granted") return { success: false, error: "Permission denied" }
    await ensureListeners()
    await PushNotifications.register()
    // Turned back on: the boot re-registration may look after this phone again.
    try {
      localStorage.removeItem(OFF_KEY)
    } catch {
      // Storage blocked: the mark can't be read either (isNativePushTurnedOff → false).
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" }
  }
}

/**
 * Re-register with APNs when the OS says permission is granted but the server
 * holds no device token for this user.
 *
 * The UI treated "permission granted" as "set up", so a device that had granted
 * permission never called register() again — and the token, dropped by the old
 * AppDelegate, was never recovered. Permission is not a token: only the
 * `registration` callback produces one, and it fires only after register().
 *
 * register() is idempotent and silent once permission exists (no prompt), so
 * this is safe to run at every boot. Returns true if a registration was kicked
 * off, so callers can log/diagnose.
 *
 * Never on a phone whose reminders were turned off here: re-registering would
 * put back the token Disable removed.
 */
export async function ensureNativePushToken(userId: string): Promise<boolean> {
  if (!isNativePlatform() || isNativePushTurnedOff()) return false
  try {
    const perm = await PushNotifications.checkPermissions()
    if (perm.receive !== "granted") return false

    const snap = await getDoc(tokensDoc(userId))
    const stored = (snap.get("tokens") as string[] | undefined) ?? []
    // A raw APNs device token is 64 hex chars; FCM web tokens never match.
    if (stored.some((t) => /^[0-9a-f]{64}$/i.test(t))) return false

    currentUserId = userId
    await ensureListeners()
    await PushNotifications.register()
    return true
  } catch (err) {
    console.error("[nativePush] re-register failed:", err instanceof Error ? err.message : err)
    return false
  }
}

/** True if native push permission is granted on this device and its reminders
 *  were not turned off here (permission outlives a Disable). */
export async function isNativePushRegistered(): Promise<boolean> {
  if (!isNativePlatform() || isNativePushTurnedOff()) return false
  try {
    const perm = await PushNotifications.checkPermissions()
    return perm.receive === "granted"
  } catch (err) {
    // Unreadable permission reads as "not registered": Settings offers Enable.
    console.warn("[nativePush] could not read notification permission:", err instanceof Error ? err.message : err)
    return false
  }
}

/**
 * Turn reminders off on this phone — and only claim it when it is true.
 *
 *  1. Stop persisting tokens, so nothing below re-adds the one being removed.
 *  2. Name this phone's token: the one this launch received, or — usually, as
 *     registration fired in an earlier launch — ask APNs again and wait.
 *  3. Remove it from the server (a failure THROWS; Settings says so).
 *     If APNs never answers, stop delivery at the source instead:
 *     unregister() releases this install's APNs registration.
 *  4. Mark the phone "off", so the boot re-registration doesn't undo it.
 *
 * Throws PushOffError when neither removal nor unregister() is possible. It
 * used to return quietly with no token in hand: Settings showed off while the
 * server kept the token and kept sending (audit H6 follow-up).
 */
export async function unregisterNativePush(userId: string): Promise<void> {
  if (!isNativePlatform()) return
  await removeRegistrationListeners()
  const token = lastToken || (await freshRegistrationToken())
  if (token) {
    await setDoc(tokensDoc(userId), { tokens: arrayRemove(token) }, { merge: true })
    lastToken = ""
  } else {
    try {
      await PushNotifications.unregister()
    } catch (err) {
      console.warn("[nativePush] could not unregister this phone from APNs:", err instanceof Error ? err.message : err)
      throw new PushOffError()
    }
  }
  try {
    localStorage.setItem(OFF_KEY, "1")
  } catch (err) {
    // Off for now, but the next launch's re-registration would undo it.
    console.warn("[nativePush] could not mark this phone off; the next launch would turn reminders back on:", err instanceof Error ? err.message : err)
    throw new PushOffError()
  }
}
