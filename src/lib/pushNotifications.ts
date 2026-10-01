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
 * The server write THROWS on failure. It used to be swallowed ("Silent fail on
 * unsubscribe"), so Settings showed notifications off while the server still
 * held the token and kept sending (audit H6).
 */
export async function unsubscribeFromPush(userId: string): Promise<void> {
  const token = await getFcmToken().catch((e: unknown) => {
    // No readable token means this browser holds none to remove (unsupported,
    // or permission already gone) — nothing is being delivered to it.
    console.warn("[push] could not read this browser's push token; nothing to remove:", e instanceof Error ? e.message : e)
    return null
  })
  if (token) {
    await setDoc(tokensDoc(userId), { tokens: arrayRemove(token) }, { merge: true })
  }
  await deleteFcmToken()
}

export async function isSubscribed(): Promise<boolean> {
  // FCM tokens are opaque; treat a granted permission as "subscribed" for the UI.
  return "Notification" in window && Notification.permission === "granted"
}
