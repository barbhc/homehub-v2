import { PushNotifications } from "@capacitor/push-notifications"
import { doc, setDoc, arrayUnion, arrayRemove } from "firebase/firestore"
import { db } from "@/integrations/firebase"
import { isNativePlatform } from "./native"

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
  // Tapping a notification deep-links via the `url` we set in the APNs payload.
  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const url = (action.notification.data as { url?: string } | undefined)?.url
    if (url) window.location.assign(url)
  })
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
