import { getNativePlatform } from "@/lib/native"
import { notificationsRefusedHelp } from "@/lib/notifyGate"
import { useNotificationPermission } from "@/hooks/useNotificationsBlocked"

/**
 * Settings → Notifications, on a device that has refused notifications: where
 * the switch is (owner, #228 review). The review's "Turn on in Settings" lands
 * on this section, and the Enable button above cannot help once the OS has
 * said no — the OS never asks twice — so the section names the phone's own
 * menu instead. Nothing while permission is granted, unanswered or unknown.
 *
 * Re-read when the app comes back to the foreground (useNotificationPermission),
 * so the sentence leaves once the phone's Settings has been changed.
 */
export function NotificationsRefusedNote() {
  const permission = useNotificationPermission()
  if (permission !== "denied") return null
  return (
    <p data-testid="notifications-refused" className="mt-1.5 text-sm text-foreground">
      {notificationsRefusedHelp(getNativePlatform())}
    </p>
  )
}
