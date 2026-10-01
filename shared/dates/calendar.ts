/**
 * Calendar dates — the one module for "which day is it" and day arithmetic.
 *
 * A calendar date (`YYYY-MM-DD`, firestore-model.md §0) only means something in
 * a time zone. The client used to cut "today" from the UTC clock —
 * `new Date().toISOString().slice(0, 10)`, in a dozen hand-rolled copies — and
 * the app's users are in US zones, where from ~5 pm Pacific the UTC date is
 * already TOMORROW: due/overdue labels, "today" rows, due windows and next-due
 * dates were a day off every evening. #220 fixed the check-off date
 * (`localDateString`, and the server's `calendarDateIn`); this module is the
 * follow-up that audit asked for, and those helpers now live here.
 *
 * Three rules, one per section below:
 *
 *  1. TODAY is a calendar day in a zone: the device's (`localToday()`), or a
 *     named IANA zone's (`localToday("America/New_York")`). Never the UTC date.
 *  2. An INSTANT's day is read in a zone: `localDateString(d)` for the device,
 *     `calendarDateIn(tz, d)` for a named zone. `toISOString().slice(0, 10)` is
 *     the UTC day — right only for values that are UTC by construction
 *     (completeTask's noon-UTC stamps, storage keys, quota buckets, logs), and
 *     every place that still does it says why beside the call.
 *  3. ARITHMETIC on `YYYY-MM-DD` is component arithmetic (`addDays`,
 *     `addMonths`, `diffDays`): the date's own year/month/day, with UTC used
 *     purely as a calendar calculator because UTC has no daylight saving. Never
 *     24-hour multiples on a local Date — across a DST change a local day is 23
 *     or 25 hours long — and never a local Date read back through
 *     `toISOString()`, which lands a day early at UTC+13.
 *
 * Pure and dependency-free, and nothing is computed at load: the zone is read
 * on every call (no cached formatter), so a device that changes zone — or a
 * test that pins `TZ` — gets the new zone on the next call. Lives in shared/ so
 * the server can fold its own copies into it (completedOn.ts, cadence.ts,
 * push/lanes.ts) rather than keep a second calendar.
 */

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 86_400_000

const pad2 = (n: number) => String(n).padStart(2, "0")

// ── 1. Today ────────────────────────────────────────────────────────────────

/**
 * Today's date (`YYYY-MM-DD`) on THIS DEVICE's calendar — or, given an IANA
 * zone, on that zone's calendar. The one answer to "what day is it" on the
 * client; the `todayStr()` copies it replaces all returned the UTC date.
 */
export function localToday(timeZone?: string): string {
  const now = new Date()
  return timeZone ? calendarDateIn(timeZone, now) : localDateString(now)
}

// ── 2. An instant's day ─────────────────────────────────────────────────────

/**
 * `YYYY-MM-DD` of `d` on THIS DEVICE's calendar (local time) — never
 * `toISOString().slice(0, 10)`, which is the UTC date and turns anything done
 * after ~5 pm Pacific into tomorrow. (#220's check-off formatter, moved here.)
 */
export function localDateString(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/**
 * The calendar date (`YYYY-MM-DD`) that `instant` falls on in `timeZone`.
 * #220's server helper (firebase/functions/src/tasks/completedOn.ts), verbatim
 * — calendar.test.ts pins the two to the same answers until the server imports
 * this one.
 */
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

// ── 3. Arithmetic on YYYY-MM-DD ─────────────────────────────────────────────

/** The UTC-midnight instant of a calendar date's own components — a pure
 *  calendar calculator. `setUTCFullYear` (not `Date.UTC`) so a year below 100
 *  is not read as 19xx; out-of-range parts roll over (Feb 30 → Mar 2), exactly
 *  as the Date setters these helpers replace did. */
function utcCalendar(year: number, monthIndex: number, day: number): Date {
  const d = new Date(0)
  d.setUTCFullYear(year, monthIndex, day)
  return d
}

function parseYmd(date: string): [number, number, number] | null {
  const m = YMD.exec(date)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

function formatUtcCalendar(d: Date): string {
  return `${String(d.getUTCFullYear()).padStart(4, "0")}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

function requireYmd(date: string, fn: string): [number, number, number] {
  const parts = parseYmd(date)
  // A RangeError, as the toISOString() these replace threw on an Invalid Date:
  // a garbage date must not quietly become "NaN-NaN-NaN" and get written.
  if (!parts) throw new RangeError(`${fn}: ${JSON.stringify(date)} is not a YYYY-MM-DD date`)
  return parts
}

/** A real calendar date in strict `YYYY-MM-DD` form — "2026-02-30" is not one. */
export function isCalendarDate(v: unknown): v is string {
  if (typeof v !== "string") return false
  const parts = parseYmd(v)
  return parts !== null && formatUtcCalendar(utcCalendar(parts[0], parts[1] - 1, parts[2])) === v
}

/**
 * The date `days` after `date` (negative goes back). Component arithmetic, so
 * it is the same answer in every zone and on the DST-change days. Throws a
 * RangeError for anything that isn't `YYYY-MM-DD`.
 */
export function addDays(date: string, days: number): string {
  const [y, m, d] = requireYmd(date, "addDays")
  return formatUtcCalendar(utcCalendar(y, m - 1, d + days))
}

/**
 * The date `months` calendar months after `date`. A day the target month lacks
 * rolls over (Jan 31 + 1 month → Mar 3, or Mar 2 in a leap year) — the
 * Date#setMonth behaviour every copy this replaces had, and the server's
 * cadence math (schedule/cadence.ts) still has, so the client's next-due
 * preview matches what completeTask writes. Throws like `addDays`.
 */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = requireYmd(date, "addMonths")
  return formatUtcCalendar(utcCalendar(y, m - 1 + months, d))
}

/**
 * Whole calendar days from `from` to `to` (both `YYYY-MM-DD`); negative when
 * `to` is earlier. NaN when either side isn't a date — what the Date
 * subtraction it replaces gave — so a malformed stored date never throws
 * inside a render.
 */
export function diffDays(from: string, to: string): number {
  const a = parseYmd(from)
  const b = parseYmd(to)
  if (!a || !b) return Number.NaN
  const ms = utcCalendar(b[0], b[1] - 1, b[2]).getTime() - utcCalendar(a[0], a[1] - 1, a[2]).getTime()
  return Math.round(ms / DAY_MS)
}
