import { getMessaging, getToken, deleteToken, isSupported, type Messaging } from "firebase/messaging"
import { firebaseApp } from "./app"

/**
 * FCM web messaging. Tokens are stored at users/{uid}/private/fcmTokens
 * ({ tokens: string[] }) by pushNotifications.ts and consumed by the sendPush /
 * sendPushDaily Cloud Functions. Requires VITE_FIREBASE_VAPID_KEY (the web-push
 * certificate key pair from the Firebase console) + the firebase-messaging-sw.js
 * service worker at the site root.
 */
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY ?? ""

let messagingPromise: Promise<Messaging | null> | null = null

/** Resolves to a Messaging instance, or null where FCM isn't supported (e.g.
 *  Safari without the right flags, or SSR). Cached so we probe support once. */
export async function getMessagingIfSupported(): Promise<Messaging | null> {
  if (!messagingPromise) {
    messagingPromise = isSupported()
      .then((ok) => (ok ? getMessaging(firebaseApp) : null))
      .catch((e: unknown) => {
        // A probe that throws is treated as "unsupported" (web push is then
        // simply not offered) — but logged, so a broken SDK is not mistaken
        // for a browser that never had push.
        console.warn("[messaging] support check failed; web push treated as unavailable:", e instanceof Error ? e.message : e)
        return null
      })
  }
  return messagingPromise
}

/** True when a VAPID key is configured (otherwise token requests can't work). */
export function isFcmConfigured(): boolean {
  return !!VAPID_KEY
}

/** Register the FCM service worker + fetch a device token. Null if unsupported,
 *  unconfigured, or permission not granted. */
export async function getFcmToken(): Promise<string | null> {
  const messaging = await getMessagingIfSupported()
  if (!messaging || !VAPID_KEY) return null
  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js")
  return getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration })
}

/** Delete this device's FCM token. Logged, never thrown: the caller has already
 *  removed it from the server, which is what stops delivery. */
export async function deleteFcmToken(): Promise<void> {
  const messaging = await getMessagingIfSupported()
  if (!messaging) return
  try {
    await deleteToken(messaging)
  } catch (e) {
    console.warn("[messaging] could not delete this browser's push token (the server copy is already removed):", e instanceof Error ? e.message : e)
  }
}
