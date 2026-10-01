import { doc, setDoc } from "firebase/firestore"
import { db } from "@/integrations/firebase"
import { arrayUnion, arrayRemove } from "firebase/firestore"
import { getFcmToken, deleteFcmToken, isFcmConfigured } from "@/integrations/firebase/messaging"

/**
 * Web push via FCM. A device token (getFcmToken) is stored in the user's
 * fcmTokens array at users/{uid}/private/fcmTokens; the sendPush / sendPushDaily
 * Cloud Functions deliver to it. Replaces the v1 VAPID + push_subscription
 * (Supabase) path. `homeId` is accepted for call-site compatibility but unused —
 * FCM tokens are per-user in the v2 model.
 */
const tokensDoc = (uid: string) => doc(db, `users/${uid}/private/fcmTokens`)

export function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && isFcmConfigured()
}

export async function getPermissionState(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied"
  return Notification.permission
}

export async function subscribeToPush(
  userId: string,
  _homeId: string
): Promise<{ success: boolean; error?: string }> {
  if (!isPushSupported()) return { success: false, error: "Push notifications not supported" }
  try {
    const permission = await Notification.requestPermission()
    if (permission !== "granted") return { success: false, error: "Permission denied" }

    const token = await getFcmToken()
    if (!token) return { success: false, error: "Could not obtain a push token" }

    await setDoc(tokensDoc(userId), { tokens: arrayUnion(token) }, { merge: true })
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" }
  }
}

/**
 * Turns web push off for this browser: removes its token from the server, then
 * deletes it locally.
 *
 * Both failures that would leave reminders arriving THROW, so Settings says so
 * instead of showing "off" (audit H6):
 *  - the server write (it used to be swallowed — "Silent fail on unsubscribe");
 *  - a token we cannot READ while the browser still has permission (e.g. the
 *    service worker failed to register offline): the server may well hold it,
 *    and "nothing to remove" would be a guess. Only without permission is an
 *    unreadable token genuinely nothing — nothing can be delivered here.
 */
export async function unsubscribeFromPush(userId: string): Promise<void> {
  let token: string | null
  try {
    token = await getFcmToken()
  } catch (e) {
    const granted = typeof Notification !== "undefined" && Notification.permission === "granted"
    if (granted) throw e
    console.warn("[push] could not read this browser's push token, and it has no notification permission — nothing to remove:", e instanceof Error ? e.message : e)
    token = null
  }
  if (token) {
    await setDoc(tokensDoc(userId), { tokens: arrayRemove(token) }, { merge: true })
  }
  await deleteFcmToken()
}

export async function isSubscribed(): Promise<boolean> {
  // FCM tokens are opaque; treat a granted permission as "subscribed" for the UI.
  return "Notification" in window && Notification.permission === "granted"
}
