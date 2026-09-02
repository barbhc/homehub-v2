import useSWR from "swr"
import { useAuth } from "@/modules/auth"
import { getNotificationPrefs } from "@/lib/userPreferences"
import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs, type PushMode } from "@/lib/notificationPreferences"

/**
 * The user's notification preferences, for the surfaces that must agree with
 * the push lanes about what notifies (Home "This week", /week, Buy first).
 *
 * Until the prefs doc arrives the DEFAULT mode is used — "curated+essential",
 * which is today's behavior — so a cold paint never shows an emptier week than
 * the pushes would send. A failed read is surfaced, not swallowed: rendering
 * the default silently would be the write-only-settings bug in a new coat.
 */
export function usePushMode(): {
  mode: PushMode
  prefs: NotificationPrefs
  loading: boolean
  error: Error | null
} {
  const { user } = useAuth()
  const uid = user?.id ?? null
  const { data, error, isLoading } = useSWR<NotificationPrefs>(
    uid ? `prefs:notifications:${uid}` : null,
    () => getNotificationPrefs(uid!),
    { revalidateOnFocus: false }
  )
  const prefs = data ?? DEFAULT_NOTIFICATION_PREFS
  return { mode: prefs.push_mode, prefs, loading: !!uid && isLoading, error: error instanceof Error ? error : null }
}
