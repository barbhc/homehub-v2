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
      .catch(() => null)
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

/** Delete this device's FCM token (best-effort; caller also removes it server-side). */
export async function deleteFcmToken(): Promise<void> {
  const messaging = await getMessagingIfSupported()
  if (!messaging) return
  try {
    await deleteToken(messaging)
  } catch {
    /* ignore */
  }
}
