/**
 * Notification preferences — the ONE normalizer, shared by web and functions.
 *
 * This module moved here from `src/lib/notificationPreferences.ts` (which now
 * re-exports it) for a reason worth keeping in view: the old header said "the
 * send-push function mirrors normalizeNotificationPrefs inline since Deno
 * can't import from src/". v2's functions CAN import shared/, and the mirror
 * had already drifted into the worst version of that arrangement — the server
 * read no preferences at all, so every Settings toggle was a write-only
 * control. A preference two modules normalize differently is a preference the
 * app lies about; from here on both sides import THIS file.
 *
 * Safety & recalls stays **locked on** — `normalizeNotificationPrefs` always
 * forces `safety_recalls.push = true`, and delivery ignores prefs and quiet
 * hours for it.
 */

import { remindsWhenDue } from "../tasks/reviewBuckets.js"

export const PREF_NOTIFICATIONS = "notifications"

export type EventChannel = { push: boolean }

export type NotificationEventKey = "task_reminders" | "warranty_expiring" | "safety_recalls" | "buy_ahead"

export type QuietHours = { start: string; end: string; tz: string }

/**
 * How wide the notification net is — the owner's 2026-08-31 decision that
 * breadth is a USER MODE, not a hard predicate:
 *
 *  - "curated": only tasks whose bell was explicitly turned on ("Just my
 *    list" — nothing else notifies).
 *  - "curated+essential": the explicit list plus tier-default Essentials —
 *    exactly today's `remindsWhenDue` behavior, and the default, so safety
 *    work keeps reminding unless someone deliberately opts down.
 *  - "all": everything on a schedule.
 *
 * The lapsed-safety-critical exception rides in every mode, decided at the
 * call sites that own that data — this predicate is only about breadth.
 */
export type PushMode = "curated" | "curated+essential" | "all"

export type WeeklyDigestPrefs = {
  enabled: boolean
  /** 0 = Sunday … 6 = Saturday. */
  day: number
  /** 0–23, in the delivery timezone (today: America/Los_Angeles, everywhere). */
  hour: number
}

export type NotificationPrefs = {
  events: {
    task_reminders: EventChannel
    warranty_expiring: EventChannel
    /** Locked on — always delivered, ignoring prefs and quiet hours. */
    safety_recalls: EventChannel
    /** "Order the next filter" pushes, ~lead time ahead of the task. */
    buy_ahead: EventChannel
  }
  push_mode: PushMode
  weekly_digest: WeeklyDigestPrefs
  /** "HH:MM"–"HH:MM" window (may wrap past midnight) in the user's tz; null = off. */
  quiet_hours: QuietHours | null
  /** Notify this many days before a task is due / a warranty expires. */
  lead_time_days: number
}

/** Upper bound on lead time — also the push sweep's buy-ahead horizon cap. */
export const MAX_LEAD_TIME_DAYS = 30

export const DEFAULT_WEEKLY_DIGEST: WeeklyDigestPrefs = { enabled: true, day: 0, hour: 17 }

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  events: {
    task_reminders: { push: true },
    warranty_expiring: { push: true },
    safety_recalls: { push: true },
    buy_ahead: { push: true },
  },
  push_mode: "curated+essential",
  weekly_digest: DEFAULT_WEEKLY_DIGEST,
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

function normalizeMode(raw: unknown): PushMode {
  return raw === "curated" || raw === "all" ? raw : "curated+essential"
}

function intIn(raw: unknown, min: number, max: number, fallback: number): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.round(raw) : NaN
  return Number.isNaN(n) || n < min || n > max ? fallback : n
}

function normalizeDigest(raw: unknown): WeeklyDigestPrefs {
  const d = (raw ?? {}) as Partial<WeeklyDigestPrefs>
  return {
    enabled: typeof d.enabled === "boolean" ? d.enabled : DEFAULT_WEEKLY_DIGEST.enabled,
    day: intIn(d.day, 0, 6, DEFAULT_WEEKLY_DIGEST.day),
    hour: intIn(d.hour, 0, 23, DEFAULT_WEEKLY_DIGEST.hour),
  }
}

/**
 * Applies defaults to a stored (possibly partial/legacy) prefs blob and
 * enforces the invariants: safety_recalls is always on; lead time is clamped
 * to [0, MAX_LEAD_TIME_DAYS]; digest day/hour are clamped to real values.
 * Pre-mode blobs (no push_mode/weekly_digest/buy_ahead keys) normalize to the
 * defaults, which reproduce their old behavior exactly.
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
      buy_ahead: { push: ev.buy_ahead?.push ?? true },
    },
    push_mode: normalizeMode(r.push_mode),
    weekly_digest: normalizeDigest(r.weekly_digest),
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

/**
 * THE breadth predicate — the Home "This week" section, /week, and every push
 * lane answer "does this task notify?" through this one function, so what the
 * user sees can never disagree with what buzzes their phone.
 */
export function notifiesInMode(
  mode: PushMode,
  remindEnabled: boolean | null | undefined,
  priorityTier: string | null | undefined
): boolean {
  if (mode === "all") return true
  if (mode === "curated") return remindEnabled === true
  return remindsWhenDue(priorityTier, remindEnabled)
}
