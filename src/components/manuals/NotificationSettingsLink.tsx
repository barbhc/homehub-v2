import type { KeyboardEvent, MouseEvent, ReactNode } from "react"
import { useInRouterContext, useNavigate } from "react-router-dom"
import { NOTIFICATION_SETTINGS_PATH } from "@/lib/notifyGate"

/**
 * "turn on in Settings" — the way back from a refused notification permission
 * (HH-161 S5.2). It opens the app's own Notifications section: the app has no
 * native hook that opens the phone's Settings page for Homehub, so that section
 * — whose Enable asks the OS — is the one door there is.
 *
 * It can sit INSIDE a review row, which is itself a button, so it is a
 * `role="link"` span that stops the row from expanding rather than a nested
 * anchor. `focusable={false}` keeps it out of the tab order there (the row is
 * the tab stop; the expanded row carries a focusable copy).
 *
 * The review renders without a router in its unit tests, so this falls back to
 * a plain link when there is none rather than crashing the sheet.
 */
export function NotificationSettingsLink({ children, focusable = true }: { children: ReactNode; focusable?: boolean }) {
  return useInRouterContext()
    ? <RoutedLink focusable={focusable}>{children}</RoutedLink>
    : <a href={NOTIFICATION_SETTINGS_PATH} className="underline underline-offset-2">{children}</a>
}

function RoutedLink({ children, focusable }: { children: ReactNode; focusable: boolean }) {
  const navigate = useNavigate()
  const go = (e: MouseEvent | KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    navigate(NOTIFICATION_SETTINGS_PATH)
  }
  return (
    <span
      role="link"
      tabIndex={focusable ? 0 : -1}
      onClick={go}
      onKeyDown={(e) => { if (e.key === "Enter") go(e) }}
      className="cursor-pointer underline underline-offset-2"
    >
      {children}
    </span>
  )
}
