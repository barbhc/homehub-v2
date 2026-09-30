/**
 * The completion-date rule for `completeTask`: which calendar day a check-off
 * is recorded on, and which `completedOn` values the callable accepts.
 *
 * `completedOn` is a calendar date, so it only means something in a timezone.
 * Both ends used to compute it in UTC (the client's `todayStr()` and this
 * callable's own fallback), which recorded every check-off made after ~5 pm
 * Pacific as TOMORROW and slid the next due date a day. The client now sends
 * its device-local date; this module checks it against the HOME's calendar
 * (`homes/{id}.timezone`, default America/Los_Angeles — the value
 * homeService.createHome writes) and supplies that calendar's today when the
 * caller sends none.
 *
 * Pure and dependency-free: the callable maps a refusal to an HttpsError, and
 * scripts/ops/repair-completed-on.ts uses `calendarDateIn` so the repair reads
 * "the home's date" exactly the way a check-off does.
 *
 * Deliberately local to this callable. FOLLOW-UP (audit 2026-09-29, refactor
 * #2): one shared date module (localToday(tz), addDays, daysBetween, fmt*)
 * replacing the ~10 UTC `todayStr()` copies across ~22 client and server
 * files. Fold this into it then — do not grow it into that module here.
 */

/** Every home gets this unless it says otherwise (homeService.createHome). */
export const DEFAULT_HOME_TIMEZONE = "America/Los_Angeles"

/**
 * How far `completedOn` may sit from the home's today. The client sends the
 * DEVICE's calendar date, and a device can be one day either side of the home
 * (travelling, a phone set to another zone, a tap either side of midnight) —
 * never two. Anything further is a wrong clock or a wrong field, and it would
 * silently move the next due date by the same amount.
 */
export const COMPLETED_ON_TOLERANCE_DAYS = 1

/**
 * How far back an EXPLICITLY back-dated completion may go. The task page's
 * "A few days ago" — the only back-dating control — sends device-today − 5,
 * which is −4…−6 against the home's calendar; 7 leaves a day for a sheet left
 * open across midnight. Widen this on purpose if a date picker ever lands.
 */
export const BACKDATE_MAX_DAYS = 7

const YMD = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000

/** The calendar date (YYYY-MM-DD) that `instant` falls on in `timeZone`. */
export function calendarDateIn(timeZone: string, instant: Date): string {
  // formatToParts rather than a locale's date pattern: the parts are
  // specified, the pattern ("en-CA" gives YYYY-MM-DD today) is not.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant)
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  return `${part("year")}-${part("month")}-${part("day")}`
}

function isKnownTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz })
    return true
  } catch {
    // RangeError: not a zone ICU knows. The caller decides what that means.
    return false
  }
}

/**
 * The zone a home's calendar runs in: `homes/{id}.timezone` when it names a
 * real zone, otherwise the default. Nothing in the app lets anyone set it yet
 * (createHome always writes the default), so an unusable value is a data bug —
 * logged, never fatal: a check-off must not fail over it.
 */
export function homeTimeZone(raw: unknown, homeId = "?"): string {
  if (raw == null || raw === "") return DEFAULT_HOME_TIMEZONE
  if (typeof raw === "string" && isKnownTimeZone(raw)) return raw
  console.warn(
    `[completeTask] home ${homeId} has an unusable timezone ${JSON.stringify(raw)}; using ${DEFAULT_HOME_TIMEZONE}`,
  )
  return DEFAULT_HOME_TIMEZONE
}

/** A real calendar date in strict YYYY-MM-DD form — "2026-02-30" is not one. */
export function isCalendarDate(v: unknown): v is string {
  if (typeof v !== "string" || !YMD.test(v)) return false
  const t = Date.parse(`${v}T00:00:00Z`)
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v
}

/** Whole calendar days from `from` to `to` (both YYYY-MM-DD); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}

export type CompletedOnCheck = { ok: true; completedOn: string } | { ok: false; message: string }

/**
 * Decide the date a completion is recorded on.
 *
 *  - no `completedOn` (absent or null) → the home's today;
 *  - otherwise a real YYYY-MM-DD within ±COMPLETED_ON_TOLERANCE_DAYS of it;
 *  - with `backdated: true` it may instead be up to BACKDATE_MAX_DAYS in the
 *    past — and still never later than tomorrow.
 *
 * The input is `unknown` on purpose: it comes straight off the wire, and the
 * callable's type annotation on `request.data` proves nothing at runtime.
 */
export function checkCompletedOn(
  input: { completedOn?: unknown; backdated?: unknown },
  homeToday: string,
): CompletedOnCheck {
  const { completedOn, backdated } = input
  if (backdated != null && typeof backdated !== "boolean") {
    return { ok: false, message: "backdated must be true or false." }
  }
  if (completedOn == null) return { ok: true, completedOn: homeToday }
  if (!isCalendarDate(completedOn)) {
    const shown =
      typeof completedOn === "string" ? JSON.stringify(completedOn.slice(0, 40)) : `a value of type ${typeof completedOn}`
    return { ok: false, message: `Can't record this as done: ${shown} isn't a date (expected YYYY-MM-DD).` }
  }
  const offset = daysBetween(homeToday, completedOn)
  const earliest = backdated === true ? -BACKDATE_MAX_DAYS : -COMPLETED_ON_TOLERANCE_DAYS
  if (offset < earliest && backdated === true) {
    return {
      ok: false,
      message: `Can't record this as done on ${completedOn}: that's more than ${BACKDATE_MAX_DAYS} days ago.`,
    }
  }
  if (offset < earliest || offset > COMPLETED_ON_TOLERANCE_DAYS) {
    return {
      ok: false,
      message: `Can't record this as done on ${completedOn}: today at this home is ${homeToday}. Check this device's date and time.`,
    }
  }
  return { ok: true, completedOn }
}
