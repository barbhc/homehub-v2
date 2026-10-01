import type { ReactNode } from "react"
import { Link, useInRouterContext } from "react-router-dom"
import { NOTIFICATION_SETTINGS_PATH } from "@/lib/notifyGate"

/**
 * "Turn on in Settings" — the way back from a refused notification permission
 * (HH-161 S5.2). It opens the app's own Notifications section, which says
 * where the switch is on this device (notificationsRefusedHelp): the app has
 * no native hook that opens the phone's Settings page for Homehub.
 *
 * It lives only in an OPENED review row, beside the reminder switch. It used
 * to sit in the collapsed row too, which is itself the button that opens the
 * row — a tap on the row's lower half left the review and lost its edits
 * (owner, #228 review) — so it is an ordinary link now, never nested in a
 * button.
 *
 * The review renders without a router in its unit tests, so this falls back to
 * a plain anchor when there is none rather than crashing the sheet.
 */
export function NotificationSettingsLink({ children }: { children: ReactNode }) {
  const className = "underline underline-offset-2"
  return useInRouterContext()
    ? <Link to={NOTIFICATION_SETTINGS_PATH} className={className}>{children}</Link>
    : <a href={NOTIFICATION_SETTINGS_PATH} className={className}>{children}</a>
}
