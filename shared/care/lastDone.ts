/**
 * "I've been doing this already" — validating the date the user hands us.
 *
 * HH-56 (Chris, beta round 6): adding an appliance he had owned for months
 * restarted every one of its schedules from zero. The owner's call was to let
 * him say when he last did the work, and derive the first window from that
 * instead of from the day he happened to add the item.
 *
 * That date arrives from a form, through a callable, as `unknown` — the exact
 * boundary where TypeScript stops helping — so it is parsed rather than cast.
 * Shared so the picker cannot offer a value the server would reject.
 */

/** How far back we will believe. Beyond this it is almost certainly a typo
 *  (a mistyped year), and a wrong anchor silently mis-schedules the task. */
export const MAX_LAST_DONE_YEARS = 10

const YMD = /^\d{4}-\d{2}-\d{2}$/

/**
 * Returns the date as `YYYY-MM-DD`, or null if it is unusable.
 *
 * Null is the correct degradation everywhere this is used: the caller falls
 * back to anchoring on today, which is the behaviour that already shipped. A
 * bad date never fails the save — losing a whole reviewed manual over a
 * malformed anchor would be the worse outcome by far.
 */
export function parseLastDone(value: unknown, today: string): string | null {
  if (typeof value !== "string" || !YMD.test(value)) return null

  // Round-trip through Date to reject the impossible ones the regex allows —
  // 2026-02-31 parses as 2 March, so a mismatch means it never existed.
  const d = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return null

  // The future is not a thing you have already done.
  if (value > today) return null

  const floor = new Date(`${today}T00:00:00Z`)
  floor.setUTCFullYear(floor.getUTCFullYear() - MAX_LAST_DONE_YEARS)
  if (value < floor.toISOString().slice(0, 10)) return null

  return value
}

/** The earliest date a picker should offer, so the UI and the server agree. */
export function earliestLastDone(today: string): string {
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCFullYear(d.getUTCFullYear() - MAX_LAST_DONE_YEARS)
  return d.toISOString().slice(0, 10)
}
