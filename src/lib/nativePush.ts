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

const tokensDoc = (uid: string) => doc(db, `users/${uid}/private/fcmTokens`)

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
  await PushNotifications.addListener("registration", (token) => {
    lastToken = token.value
    void persistToken(token.value)
  })
  await PushNotifications.addListener("registrationError", (err) => {
    console.error("[nativePush] registration error:", err)
  })
  // The tap listener is NOT registered here — it must exist before auth
  // resolves or a cold-start tap is lost. See registerDeepLinkListener.
  await registerDeepLinkListener()
}

/**
 * Request OS permission, register with APNs, and store the device token.
 * Mirrors `subscribeToPush()`'s return shape so opt-in UI can call either path.
 */
export async function registerNativePush(
  userId: string,
  _homeId: string
): Promise<{ success: boolean; error?: string }> {
  if (!isNativePlatform()) return { success: false, error: "Not a native platform" }
  currentUserId = userId
  try {
    const perm = await PushNotifications.requestPermissions()
    if (perm.receive !== "granted") return { success: false, error: "Permission denied" }
    await ensureListeners()
    await PushNotifications.register()
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
 */
export async function ensureNativePushToken(userId: string): Promise<boolean> {
  if (!isNativePlatform()) return false
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

/** True if native push permission is already granted on this device. */
export async function isNativePushRegistered(): Promise<boolean> {
  if (!isNativePlatform()) return false
  try {
    const perm = await PushNotifications.checkPermissions()
    return perm.receive === "granted"
  } catch {
    return false
  }
}

/** Remove this device's native token(s) from the server (best-effort). */
export async function unregisterNativePush(userId: string): Promise<void> {
  if (!isNativePlatform()) return
  try {
    await PushNotifications.removeAllListeners()
    listenersReady = false
    if (lastToken) {
      await setDoc(tokensDoc(userId), { tokens: arrayRemove(lastToken) }, { merge: true })
      lastToken = ""
    }
  } catch {
    // best-effort
  }
}
