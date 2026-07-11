/**
 * Notification preferences (Phase 4) — **Push-only** (Email was dropped for
 * now, so the redesign's channel matrix ships a single Push column).
 *
 * Stored per-user as a JSONB blob under the `notifications` key in
 * `user_preferences`. The send-push-notifications edge function reads the same
 * shape to gate delivery; this module is the canonical normalizer (the
 * function mirrors `normalizeNotificationPrefs` / `isWithinQuietHours` inline
 * since Deno can't import from `src/`).
 *
 * The pure helpers (normalize, quiet-hours) carry no Supabase import so they
 * stay unit-testable; the DB-touching get/set live in `userPreferences.ts`.
 *
 * Safety & recalls is **locked on** — `normalizeNotificationPrefs` always
 * forces `safety_recalls.push = true`, and the server delivers it regardless
 * of prefs or quiet hours.
 */

export const PREF_NOTIFICATIONS = "notifications"

export type EventChannel = { push: boolean }

export type NotificationEventKey = "task_reminders" | "warranty_expiring" | "safety_recalls"

export type QuietHours = { start: string; end: string; tz: string }

export type NotificationPrefs = {
  events: {
    task_reminders: EventChannel
    warranty_expiring: EventChannel
    /** Locked on — always delivered, on all channels, ignoring quiet hours. */
    safety_recalls: EventChannel
  }
  /** "HH:MM"–"HH:MM" window (may wrap past midnight) in the user's tz; null = off. */
  quiet_hours: QuietHours | null
  /** Notify this many days before a task is due / a warranty expires. */
  lead_time_days: number
}

/** Upper bound on lead time — also the edge function's task-query horizon. */
export const MAX_LEAD_TIME_DAYS = 30

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  events: {
    task_reminders: { push: true },
    warranty_expiring: { push: true },
    safety_recalls: { push: true },
  },
  quiet_hours: null,
  lead_time_days: 0,
}

function normalizeQuietHours(raw: unknown): QuietHours | null {
  if (!raw || typeof raw !== "object") return null
  const q = raw as Partial<QuietHours>
  if (typeof q.start !== "string" || typeof q.end !== "string") return null
  if (!isHHMM(q.start) || !isHHMM(q.end)) return null
  return { start: q.start, end: q.end, tz: typeof q.tz === "string" && q.tz ? q.tz : "UTC" }
}

function isHHMM(s: string): boolean {
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(s)
}

/**
 * Applies defaults to a stored (possibly partial/legacy) prefs blob and
 * enforces the invariants: safety_recalls is always on; lead time is clamped
 * to [0, MAX_LEAD_TIME_DAYS].
 */
export function normalizeNotificationPrefs(raw: unknown): NotificationPrefs {
  const r = (raw ?? {}) as Partial<NotificationPrefs>
  const ev = (r.events ?? {}) as Partial<NotificationPrefs["events"]>
  const lead = typeof r.lead_time_days === "number" && Number.isFinite(r.lead_time_days) ? r.lead_time_days : 0
  return {
    events: {
      task_reminders: { push: ev.task_reminders?.push ?? true },
      warranty_expiring: { push: ev.warranty_expiring?.push ?? true },
      safety_recalls: { push: true },
    },
    quiet_hours: normalizeQuietHours(r.quiet_hours),
    lead_time_days: Math.max(0, Math.min(MAX_LEAD_TIME_DAYS, Math.round(lead))),
  }
}

function toMinutes(hhmm: string): number | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(hhmm)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/**
 * Whether `nowHHMM` (24h "HH:MM") falls inside the quiet-hours window.
 * Supports overnight windows (e.g. 22:00–07:00). A zero-length window
 * (start === end) is treated as "off".
 */
export function isWithinQuietHours(nowHHMM: string, quiet: QuietHours | null): boolean {
  if (!quiet) return false
  const n = toMinutes(nowHHMM)
  const s = toMinutes(quiet.start)
  const e = toMinutes(quiet.end)
  if (n == null || s == null || e == null || s === e) return false
  return s < e ? n >= s && n < e : n >= s || n < e
}
