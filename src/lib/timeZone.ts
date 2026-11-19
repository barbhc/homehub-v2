/**
 * The person's time zone, from this phone or browser (2026-11-19).
 *
 * Reminders ran on Pacific time for everyone: 8am Pacific is 11am in New
 * York. The push sweep now runs each person's lanes on their own clock and
 * reads the zone from `time_zone` in users/{uid}/private/preferences
 * (firebase/functions/src/push/lanes.ts). Per person, not per home: the phone
 * is what wakes them, and a traveller's reminders should follow them.
 *
 * Written at sign-in, and again only when this device's zone changes — the
 * last value written here is remembered on the device, so an ordinary boot
 * costs no write and no read.
 */
import { setPreference } from "./userPreferences"

export const PREF_TIME_ZONE = "time_zone"
const syncedKey = (uid: string) => `homehub:tz-synced:${uid}`

/** This device's IANA zone, or null when the runtime cannot say. */
export function deviceTimeZone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return typeof tz === "string" && tz.length > 0 && tz.length <= 64 ? tz : null
  } catch {
    // No Intl zone data (very old runtimes): unknown, so the server keeps Pacific.
    return null
  }
}

/** Records this device's zone for the person, if it is new here. Never throws. */
export async function syncTimeZone(uid: string): Promise<void> {
  const tz = deviceTimeZone()
  if (!tz) return
  let last: string | null = null
  try {
    last = window.localStorage.getItem(syncedKey(uid))
  } catch {
    // Storage blocked: write every boot instead; the write is one small merge.
  }
  if (last === tz) return
  try {
    await setPreference(uid, PREF_TIME_ZONE, tz)
  } catch (e) {
    // Reminders keep the previous zone (or Pacific) until the next boot tries again.
    console.warn("[timeZone] could not record this device's time zone:", e instanceof Error ? e.message : e)
    return
  }
  try {
    window.localStorage.setItem(syncedKey(uid), tz)
  } catch {
    // Only the shortcut is lost: the next boot writes the same value again.
  }
}
