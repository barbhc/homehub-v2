import { supabase } from "@/integrations/shim/client"
import {
  PREF_NOTIFICATIONS,
  normalizeNotificationPrefs,
  type NotificationPrefs,
} from "./notificationPreferences"
import { coerceInterfaceOverride, type InterfaceOverride } from "./interfaceLevel"

export const PREF_TOUR_COMPLETED = "tour_completed"
export const PREF_DASHBOARD_TIERS = "dashboard_tier_filter"
export const PREF_INTERFACE_LEVEL = "interface_level"

export async function getPreference<T = unknown>(
  userId: string,
  key: string
): Promise<T | null> {
  const { data, error } = await supabase
    .from("user_preferences")
    .select("preference_value")
    .eq("user_id", userId)
    .eq("preference_key", key)
    .maybeSingle()

  if (error) throw new Error(`Failed to load preference: ${error.message}`)
  return data ? (data.preference_value as T) : null
}

export async function setPreference(
  userId: string,
  key: string,
  value: unknown
): Promise<void> {
  const { error } = await supabase
    .from("user_preferences")
    .upsert(
      {
        user_id: userId,
        preference_key: key,
        preference_value: value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,preference_key" }
    )

  if (error) throw new Error(`Failed to save preference: ${error.message}`)
}

/** Loads a user's notification prefs, normalized (safety locked on, defaults applied). */
export async function getNotificationPrefs(userId: string): Promise<NotificationPrefs> {
  const raw = await getPreference(userId, PREF_NOTIFICATIONS)
  return normalizeNotificationPrefs(raw)
}

/** Persists notification prefs (re-normalized so invariants always hold on write). */
export async function setNotificationPrefs(userId: string, prefs: NotificationPrefs): Promise<void> {
  await setPreference(userId, PREF_NOTIFICATIONS, normalizeNotificationPrefs(prefs))
}

/**
 * Loads the user's persisted interface level (Phase 5), or null if never set
 * (so the caller can fall back to the localStorage cache / derived default).
 * Stored as `{ level }` under the `interface_level` key.
 */
export async function getInterfaceLevelPref(userId: string): Promise<InterfaceOverride | null> {
  const raw = await getPreference<{ level?: unknown }>(userId, PREF_INTERFACE_LEVEL)
  if (!raw || raw.level == null) return null
  return coerceInterfaceOverride(raw.level)
}

/** Persists the chosen interface level for cross-device sync. */
export async function setInterfaceLevelPref(userId: string, level: InterfaceOverride): Promise<void> {
  await setPreference(userId, PREF_INTERFACE_LEVEL, { level: coerceInterfaceOverride(level) })
}
