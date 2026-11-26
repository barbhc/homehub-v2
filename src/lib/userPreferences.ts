import { arrayUnion, doc, getDoc, serverTimestamp, writeBatch } from "firebase/firestore"
import { db } from "@/integrations/firebase"
import {
  PREF_NOTIFICATIONS,
  normalizeNotificationPrefs,
  type NotificationPrefs,
} from "./notificationPreferences"

export const PREF_TOUR_COMPLETED = "tour_completed"
/**
 * Shows the internal tools in Settings (startup diagnostics, admin tools) to
 * this person. Set by hand on the prefs doc; there is no switch in the app.
 */
export const PREF_DEV_TOOLS = "dev_tools"
/** Home ids whose "Add your zip" row on Home has been closed (seventeen fixes,
 *  mock m5). It replaced "Finish your home profile", whose dismissals lived
 *  under "profile_banner_dismissed" — a different question, so they are not
 *  carried over. */
export const PREF_ZIP_ROW_DISMISSED = "zip_row_dismissed"

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
 * "Add your zip" closes, stored on the SERVER, per home.
 *
 * The profile banner before it kept its dismissal in localStorage alone, and
 * the owner reported it coming back after she dismissed it: whatever clears
 * that storage (a WebView data reset, a quota failure, a reinstall) took the
 * dismissal with it. A dismissal is a decision the user made; it should
 * outlive a browser cache.
 */
export async function getDismissedZipRows(userId: string): Promise<string[]> {
  const v = await getPreference<unknown>(userId, PREF_ZIP_ROW_DISMISSED)
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []
}

/** One atomic add (arrayUnion): two closes at once can never drop each other. */
export async function dismissZipRow(userId: string, homeId: string): Promise<void> {
  await setPreference(userId, PREF_ZIP_ROW_DISMISSED, arrayUnion(homeId))
}

/**
 * Whether this person sees Settings' internal tools. Only a stored boolean
 * `true` turns them on; absent, or any other value, is off.
 */
export async function getDevToolsEnabled(userId: string): Promise<boolean> {
  const v = await getPreference<unknown>(userId, PREF_DEV_TOOLS)
  return v === true
}
