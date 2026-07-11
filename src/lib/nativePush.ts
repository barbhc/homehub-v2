import { PushNotifications } from "@capacitor/push-notifications"
import { supabase } from "@/integrations/shim/client"
import { isNativePlatform, getNativePlatform } from "./native"

export { isNativePlatform }

/**
 * Native push (APNs on iOS) registration.
 *
 * Reuses the `push_subscription` table the web-push path already uses: a native
 * row stores the device token in `endpoint` with `platform="ios"` and no web
 * keys (p256dh/auth are null). The send-push-notifications edge function
 * branches on `platform` to deliver via APNs instead of the Web Push protocol.
 *
 * Requires the Xcode "Push Notifications" capability + an APNs auth key
 * configured server-side — see IOS_SETUP.md. No-op on the web.
 */

// The token listener fires asynchronously after register(); keep the latest
// user/home so a home switch re-targets the stored row without re-adding the
// (process-global) Capacitor listeners.
let currentUserId = ""
let currentHomeId = ""
let listenersReady = false

async function persistToken(token: string): Promise<void> {
  if (!currentUserId || !currentHomeId) return
  const { error } = await supabase.from("push_subscription").upsert(
    {
      user_id: currentUserId,
      home_id: currentHomeId,
      endpoint: token,
      platform: getNativePlatform(),
    },
    { onConflict: "user_id,endpoint" }
  )
  if (error) console.error("[nativePush] failed to store token:", error.message)
}

async function ensureListeners(): Promise<void> {
  if (listenersReady) return
  listenersReady = true
  await PushNotifications.addListener("registration", (token) => {
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
  homeId: string
): Promise<{ success: boolean; error?: string }> {
  if (!isNativePlatform()) return { success: false, error: "Not a native platform" }
  currentUserId = userId
  currentHomeId = homeId
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
    await supabase
      .from("push_subscription")
      .delete()
      .eq("user_id", userId)
      .eq("platform", getNativePlatform())
  } catch {
    // best-effort
  }
}
