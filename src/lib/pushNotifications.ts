import { supabase } from "@/integrations/shim/client"

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? ""

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && !!VAPID_PUBLIC_KEY
}

export async function getPermissionState(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied"
  return Notification.permission
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null
  try {
    return await navigator.serviceWorker.register("/sw.js")
  } catch {
    console.error("Service worker registration failed")
    return null
  }
}

export async function subscribeToPush(
  userId: string,
  homeId: string
): Promise<{ success: boolean; error?: string }> {
  if (!isPushSupported()) return { success: false, error: "Push notifications not supported" }

  try {
    const permission = await Notification.requestPermission()
    if (permission !== "granted") return { success: false, error: "Permission denied" }

    const registration = await registerServiceWorker()
    if (!registration) return { success: false, error: "Service worker failed" }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    })

    const json = subscription.toJSON()
    const { error } = await supabase.from("push_subscription").upsert(
      {
        user_id: userId,
        home_id: homeId,
        endpoint: json.endpoint!,
        p256dh: json.keys!.p256dh,
        auth: json.keys!.auth,
      },
      { onConflict: "user_id,endpoint" }
    )

    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" }
  }
}

export async function unsubscribeFromPush(userId: string): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (subscription) {
      await subscription.unsubscribe()
      await supabase
        .from("push_subscription")
        .delete()
        .eq("user_id", userId)
        .eq("endpoint", subscription.endpoint)
    }
  } catch {
    // Silent fail on unsubscribe
  }
}

export async function isSubscribed(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    return !!subscription
  } catch {
    return false
  }
}
