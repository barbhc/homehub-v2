/**
 * Pure recurring-cadence math, shared by the roll-forward scheduler (Phase 4)
 * and completeTask (Phase 5). Mirrors v1 migration 20260701000002's roll-forward
 * cadence map. Calendar dates are "YYYY-MM-DD" strings (firestore-model.md §0).
 *
 * Non-recurring types (after_each_use / as_needed / seasonal / setup) return null
 * → the caller leaves the instance where it is (a genuinely lapsed one-off keeps
 * its real overdue date; seasonal re-anchoring is handled elsewhere).
 */
export type ScheduleType =
  | "after_each_use"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "annual"
  | "seasonal"
  | "every_n_days"
  | "as_needed"
  | "setup"

/** Parse a "YYYY-MM-DD" string to a UTC Date at midnight. */
function parseYmd(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`)
}
function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function addDays(ymd: string, days: number): string {
  const d = parseYmd(ymd)
  d.setUTCDate(d.getUTCDate() + days)
  return toYmd(d)
}
function addMonths(ymd: string, months: number): string {
  const d = parseYmd(ymd)
  d.setUTCMonth(d.getUTCMonth() + months)
  return toYmd(d)
}

/**
 * Next due date for a recurring cadence, computed FROM `from` (usually today for
 * roll-forward, or the completion date for completeTask). Returns null for
 * non-recurring types.
 */
export function addCadence(from: string, scheduleType: ScheduleType, intervalDays: number | null): string | null {
  switch (scheduleType) {
    case "weekly":
      return addDays(from, 7)
    case "monthly":
      return addMonths(from, 1)
    case "quarterly":
      return addMonths(from, 3)
    case "semiannual":
      return addMonths(from, 6)
    case "annual":
      return addMonths(from, 12)
    case "every_n_days":
      return addDays(from, intervalDays && intervalDays > 0 ? intervalDays : 30)
    // after_each_use / as_needed / seasonal / setup → not rolled forward.
    default:
      return null
  }
}

export const SEASONS = ["spring", "summer", "fall", "winter"] as const
export type Season = (typeof SEASONS)[number]

/** Anchor month-day for the window each season's task is ACTED in. */
const SEASON_ANCHOR: Record<Season, string> = { spring: "04-15", summer: "07-15", fall: "10-15", winter: "01-15" }

/**
 * Next occurrence of a season's anchor date on/after `from` (rolls to next year
 * if already passed). Null for an unknown/empty season. Shared by commitDraft
 * (initial schedule) and completeTask (next cycle) so a "winterize" task lands in
 * fall, not on the parse/completion date.
 */
export function seasonalNextDue(season: string, from: string): string | null {
  const md = SEASON_ANCHOR[season as Season]
  if (!md) return null
  const year = Number(from.slice(0, 4))
  const candidate = `${year}-${md}`
  return candidate > from ? candidate : `${year + 1}-${md}`
}

/**
 * Deterministic season for a seasonal task. Uses an explicit `season` if the
 * extractor ever provides one, else infers from title/tags. Maps to the season
 * the task is ACTED in — winterize / cold-storage prep is a FALL job (before
 * winter), not the winter it guards against. Returns null when it can't tell, so
 * the caller leaves the task unscheduled rather than dumping it on "today".
 * (A future parsePrompt change can emit `season` directly; this stays the fallback.)
 */
export function seasonForTask(t: {
  title?: string | null
  tags?: string[] | null
  description?: string | null
  season?: string | null
}): Season | null {
  const explicit = (t.season ?? "").toLowerCase()
  if ((SEASONS as readonly string[]).includes(explicit)) return explicit as Season
  const hay = `${t.title ?? ""} ${(t.tags ?? []).join(" ")} ${t.description ?? ""}`.toLowerCase()
  if (/winteri[sz]|cold[- ]?storage|freeze[- ]?protect|frost[- ]?protect|heating season|before winter|pre[- ]?winter/.test(hay)) return "fall"
  if (/summeri[sz]|de[- ]?winteri[sz]|cooling season|spring (?:prep|start|open|startup)/.test(hay)) return "spring"
  if (/\bwinter\b/.test(hay)) return "winter"
  if (/\bsummer\b/.test(hay)) return "summer"
  if (/\bspring\b/.test(hay)) return "spring"
  if (/\bfall\b|\bautumn\b|gutter|leaves|leaf drop/.test(hay)) return "fall"
  return null
}
