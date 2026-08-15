import { doc, getDoc, serverTimestamp, writeBatch } from "firebase/firestore"
import { db } from "@/integrations/firebase"
import {
  PREF_NOTIFICATIONS,
  normalizeNotificationPrefs,
  type NotificationPrefs,
} from "./notificationPreferences"
import { coerceInterfaceOverride, type InterfaceOverride } from "./interfaceLevel"

export const PREF_TOUR_COMPLETED = "tour_completed"
export const PREF_DASHBOARD_TIERS = "dashboard_tier_filter"
export const PREF_INTERFACE_LEVEL = "interface_level"
/** Home ids whose "Finish your home profile" banner has been dismissed. */
export const PREF_PROFILE_BANNER_DISMISSED = "profile_banner_dismissed"

// v1's (user_id, preference_key) → preference_value table collapses to a single
// prefs doc at users/{uid}/private/preferences, with each preference key as a
// field (firestore-model.md §1). Values are stored verbatim (JSON-compatible).
const prefsRef = (userId: string) => doc(db, `users/${userId}/private/preferences`)

export async function getPreference<T = unknown>(userId: string, key: string): Promise<T | null> {
  const snap = await getDoc(prefsRef(userId))
  if (!snap.exists()) return null
  const v = (snap.data() as Record<string, unknown>)[key]
  return v == null ? null : (v as T)
}

export async function setPreference(userId: string, key: string, value: unknown): Promise<void> {
  await writeBatch(db)
    .set(prefsRef(userId), { [key]: value, updatedAt: serverTimestamp() }, { merge: true })
    .commit()
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

/**
 * "Finish your home profile" dismissals, stored on the SERVER.
 *
 * They lived in localStorage alone, and the owner reported the banner coming
 * back after she dismissed it. Whatever clears that storage — a WebView data
 * reset, a quota failure swallowed by the catch, a reinstall — took the
 * dismissal with it, and the app went back to nagging about something she had
 * already answered. A dismissal is a decision the user made; it should outlive
 * a browser cache.
 *
 * Stored per home, because the banner is per home.
 */
export async function getDismissedProfileBanners(userId: string): Promise<string[]> {
  const v = await getPreference<unknown>(userId, PREF_PROFILE_BANNER_DISMISSED)
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []
}

export async function dismissProfileBanner(userId: string, homeId: string): Promise<void> {
  const current = await getDismissedProfileBanners(userId)
  if (current.includes(homeId)) return
  await setPreference(userId, PREF_PROFILE_BANNER_DISMISSED, [...current, homeId])
}
