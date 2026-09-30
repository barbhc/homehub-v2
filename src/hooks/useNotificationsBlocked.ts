import { useEffect, useState } from "react"
import { PushNotifications } from "@capacitor/push-notifications"
import { isNativePlatform } from "@/lib/native"
import { notificationsBlocked } from "@/lib/notifyGate"

/** What notifyGate asks about this device. */
export type NotifyPermission = NotificationPermission | "unsupported"

function webPermission(): NotifyPermission {
  return typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"
}

/**
 * This device's notification permission, read without asking for it. The
 * native shell answers through the push plugin (a WKWebView has no
 * `Notification`); the web through the Notification API. A browser without
 * one is "unsupported", which notifyGate treats as refused — nothing can ring.
 */
export async function readNotificationPermission(): Promise<NotifyPermission> {
  if (!isNativePlatform()) return webPermission()
  const { receive } = await PushNotifications.checkPermissions()
  return receive === "granted" ? "granted" : receive === "denied" ? "denied" : "default"
}

/**
 * Has this device refused notifications? Round 18's rule, wired at last
 * (HH-161 S5): "a bell is never drawn that cannot be rung" — while this is
 * true the review and the item page draw no bells and say why instead.
 *
 * Re-read whenever the app comes back to the foreground, because the fix for a
 * refusal happens OUTSIDE the app (the phone's Settings). Nothing the owner
 * chose is changed by it: a row keeps its reminder choice, so its bell returns
 * the moment permission does, without another review (S5.4).
 *
 * Unknown (the native read still in flight) counts as not refused — the same
 * as every screen before this hook existed.
 */
export function useNotificationsBlocked(): boolean {
  const [permission, setPermission] = useState<NotifyPermission | null>(() =>
    isNativePlatform() ? null : webPermission())

  useEffect(() => {
    let cancelled = false
    const check = () => {
      readNotificationPermission().then(
        (p) => { if (!cancelled) setPermission(p) },
        (e: unknown) => {
          // Keeps the last answer: a failed read says nothing new about the
          // phone, and flipping to "refused" on a plugin hiccup would hide
          // every bell for a reason that is not true.
          console.warn("[notify] could not read notification permission:", e instanceof Error ? e.message : e)
        },
      )
    }
    const onVisible = () => { if (document.visibilityState === "visible") check() }
    check()
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", check)
    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", check)
    }
  }, [])

  return permission !== null && notificationsBlocked({ permission, alreadySubscribed: permission === "granted" })
}
