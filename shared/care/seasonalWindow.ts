/**
 * Seasonal windows, resolved against the home's climate.
 *
 * The last unbuilt piece of design/due-windows.md. A seasonal task is the
 * clearest case against a due date: "clear the gutters" has no deadline, it has
 * a season — and the season lands at different times depending on where the
 * home is. A fixed date is wrong everywhere except by accident.
 *
 * Two things this must not do, both from the product's own principles:
 *
 *   · Never assert a local date we haven't verified. We know a climate BAND
 *     ("cold", "mild"), not a frost date. So the copy names the season and
 *     hedges the timing — "usually November here" — and when the owner has not
 *     answered the climate question at all it says just "usually autumn".
 *   · Never block on a profile fact. A missing climate degrades to a wide
 *     season-wide window; it never suppresses the task or demands an answer.
 */

export type Season = "spring" | "summer" | "fall" | "winter"
export type Climate = "mild" | "moderate" | "cold" | "hot"

/**
 * The months a season's work sensibly happens in, by climate band.
 *
 * Northern hemisphere. Colder homes get an EARLIER, tighter autumn window
 * (first frost arrives sooner and matters more); milder homes get a later,
 * looser one. These are month numbers, inclusive.
 */
const SEASON_MONTHS: Record<Season, Partial<Record<Climate, [number, number]>> & { default: [number, number] }> = {
  // Freeze prep: get ahead of the first hard frost.
  fall:   { cold: [9, 10], moderate: [9, 11], mild: [10, 11], hot: [10, 12], default: [9, 11] },
  // De-winterizing / cooling-season startup.
  spring: { cold: [4, 5], moderate: [3, 5], mild: [3, 4], hot: [2, 4], default: [3, 5] },
  summer: { cold: [6, 8], moderate: [6, 8], mild: [6, 8], hot: [5, 8], default: [6, 8] },
  winter: { cold: [12, 2], moderate: [12, 2], mild: [12, 2], hot: [12, 2], default: [12, 2] },
}

const SEASON_WORD: Record<Season, string> = {
  spring: "spring", summer: "summer", fall: "autumn", winter: "winter",
}
const MONTH_NAME = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

export interface SeasonalWindow {
  /** Inclusive month numbers (1-12). Wraps across the year for winter. */
  months: [number, number]
  /** True when today falls inside the season's months. */
  open: boolean
  /** User-facing phrase. Hedged when climate is unknown. */
  phrase: string
}

function monthOf(dateStr: string): number {
  return Number(dateStr.slice(5, 7))
}

/** Inclusive month test that survives a wrap (winter = 12→2). */
export function monthInRange(month: number, [from, to]: [number, number]): boolean {
  return from <= to ? month >= from && month <= to : month >= from || month <= to
}

/**
 * Resolve a seasonal task's window.
 *
 * `climate` null means the owner has not answered — the window widens to the
 * season's default months and the phrase drops the local claim.
 */
export function seasonalWindow(
  season: Season,
  climate: Climate | null,
  opts?: { today?: string },
): SeasonalWindow {
  const today = opts?.today ?? new Date().toISOString().slice(0, 10)
  const table = SEASON_MONTHS[season]
  const months = (climate && table[climate]) ?? table.default
  const open = monthInRange(monthOf(today), months)
  const word = SEASON_WORD[season]

  // With a climate we can name the month we'd expect locally; without one we
  // must not — "usually November here" is a claim about their home.
  const phrase = climate
    ? `Before ${MONTH_NAME[months[1] - 1]} — usually ${word} here`
    : `Usually ${word}`
  return { months, open, phrase }
}

/**
 * Which season a task belongs to, from its title.
 *
 * Reuses `seasonalFamily` rather than adding a third copy of the winterize
 * keyword list — houseRules.ts and the server's cadence.ts already carry one
 * each, and their shared comment ("keep the keyword families in sync") is a
 * standing admission that duplication is a liability here.
 */
export function seasonForTitle(title: string, family: string | null): Season | null {
  if (family === "freeze_prep") return "fall"
  if (family === "warm_startup") return "spring"
  const t = title.toLowerCase()
  if (/\bgutter|leaves|leaf drop|\bfall\b|\bautumn\b/.test(t)) return "fall"
  if (/\bspring\b/.test(t)) return "spring"
  if (/\bsummer\b/.test(t)) return "summer"
  if (/\bwinter\b/.test(t)) return "winter"
  return null
}
