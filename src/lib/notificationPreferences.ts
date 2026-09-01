/**
 * Re-export shim. The canonical notification-prefs module moved to
 * `shared/notifications/preferences.ts` so the FUNCTIONS side imports the
 * same normalizer instead of mirroring it (the old header here described the
 * v1 Deno mirror; by round 19 the "mirror" had drifted all the way to the
 * server reading no preferences at all). Existing importers keep working
 * through this path; new code may import either.
 */
export {
  PREF_NOTIFICATIONS,
  MAX_LEAD_TIME_DAYS,
  DEFAULT_NOTIFICATION_PREFS,
  DEFAULT_WEEKLY_DIGEST,
  normalizeNotificationPrefs,
  isWithinQuietHours,
  notifiesInMode,
  type EventChannel,
  type NotificationEventKey,
  type QuietHours,
  type PushMode,
  type WeeklyDigestPrefs,
  type NotificationPrefs,
} from "../../shared/notifications/preferences.js"
