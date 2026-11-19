/**
 * What a US zip code says about a home's upkeep — read from a table that ships
 * with the app, so the zip never leaves Homehub (D7 must-be-true 6; design/
 * first-minute-onboarding.md, "Data").
 *
 * Pure: the table is passed in. `scripts/area/build-zip-area.ts` builds it from
 * four public files (USDA/PRISM hardiness by zip, the Census 2020 zip-to-county
 * file, FEMA's National Risk Index by county, PNNL's IECC 2021 climate zone by
 * county) and records their versions in `version`.
 *
 * Everything derived here is a PROPOSED default (Suggest, never assume): the
 * onboarding screen shows it with its source and a "Not true here", and an
 * owner's correction always wins over the table.
 */

/** FEMA NRI risk ratings, as small numbers. 0 = no rating (not applicable,
 *  insufficient data, or a county the table could not place). */
export const RATING_LABELS = ["No rating", "Very Low", "Relatively Low", "Relatively Moderate", "Relatively High", "Very High"] as const
export type Rating = 0 | 1 | 2 | 3 | 4 | 5
/** An area fact is shown only at this rating or above (spec: "Relatively High or Very High"). */
export const SHOWN_FROM: Rating = 4

/** One county: [name, state abbreviation, IECC 2021 zone (0 = unknown), IECC moisture regime ("" = unknown),
 *  earthquake, wildfire, hurricane]. */
export type CountyRow = [string, string, number, string, Rating, Rating, Rating]
/** One zip: [USDA hardiness half-zone ("" = unknown), county FIPS ("" = unknown),
 *  how many counties the zip touches]. */
export type ZipRow = [string, string, number]

export interface ZipAreaTable {
  version: {
    /** The day the table was built (YYYY-MM-DD). */
    built: string
    /** One line per source: what it is and which release. */
    sources: Record<"hardiness" | "zipToCounty" | "hazards" | "climateZones", string>
  }
  counties: Record<string, CountyRow>
  zips: Record<string, ZipRow>
}

export type Climate = "mild" | "moderate" | "cold" | "hot"
export type Hazard = "earthquake" | "wildfire" | "hurricane"

export interface ZipArea {
  zip: string
  /** "10b" — null when the hardiness file has no row for this zip. */
  hardinessZone: string | null
  /** The coldest-night range the zone stands for, in °F: [low, high). */
  coldestNightF: [number, number] | null
  county: { fips: string; name: string; state: string; touches: number } | null
  /** IECC 2021 climate zone number (1–8), null when unknown. */
  iecc: number | null
  /** Derived. null only when there is no hardiness zone to derive from. */
  freezeRisk: boolean | null
  /** Derived. null only when there is no hardiness zone to derive from. */
  climate: Climate | null
  /** Hazards rated Relatively High or Very High for the county — the only ones shown. */
  hazards: { hazard: Hazard; rating: Rating; label: string }[]
  /** Whether the state changes its clocks. null when the state is unknown. */
  observesDst: boolean | null
  /** The table's build day, stamped on the home as `area.tableVersion`. */
  tableVersion: string
}

const ZONE = /^(\d{1,2})([ab])$/

/** "10b" → 10.5; "7a" → 7. Null for anything else. */
export function zoneValue(zone: string | null | undefined): number | null {
  const m = typeof zone === "string" ? ZONE.exec(zone) : null
  if (!m) return null
  return Number(m[1]) + (m[2] === "b" ? 0.5 : 0)
}

/**
 * The USDA scale: zone 1a starts at −60°F and each half-zone is 5°F wide.
 * "10b" → [35, 40). Used only to say what the zone means, never to decide.
 */
export function coldestNightF(zone: string | null | undefined): [number, number] | null {
  const v = zoneValue(zone)
  if (v === null) return null
  const low = -60 + (v - 1) * 10
  return [low, low + 5]
}

/**
 * Pipes can freeze here unless the zone is 10a or warmer (coldest nights at or
 * above 30°F). Zone 9 stays TRUE on purpose — Texas, February 2021: a rare
 * freeze is exactly the one nobody prepared for.
 */
export function freezeRiskFromZone(zone: string | null | undefined): boolean | null {
  const v = zoneValue(zone)
  return v === null ? null : v < 10
}

/** cold ≤ 6b; moderate 7a–9b; mild ≥ 10a; hot wherever the IECC zone is 1 or 2. */
export function climateFrom(zone: string | null | undefined, iecc: number | null): Climate | null {
  if (iecc === 1 || iecc === 2) return "hot"
  const v = zoneValue(zone)
  if (v === null) return null
  if (v < 7) return "cold"
  if (v < 10) return "moderate"
  return "mild"
}

/** States and territories that keep standard time all year. */
const NO_DST = new Set(["AZ", "HI", "PR", "VI", "GU", "AS", "MP"])
export function observesDst(state: string | null | undefined): boolean | null {
  if (!state) return null
  return !NO_DST.has(state)
}

const ZIP5 = /^\d{5}$/
/** Five digits after trimming; anything else is not a zip we can look up. */
export function normalizeZip(input: string): string | null {
  const z = input.trim()
  return ZIP5.test(z) ? z : null
}

/** What the table knows about one zip, or null when the zip is not in it. */
export function lookupZip(table: ZipAreaTable, input: string): ZipArea | null {
  const zip = normalizeZip(input)
  if (!zip) return null
  const row = table.zips[zip]
  if (!row) return null
  const [zone, fips, touches] = row
  const c = fips ? table.counties[fips] : undefined
  const iecc = c && c[2] > 0 ? c[2] : null
  const hazards: ZipArea["hazards"] = []
  if (c) {
    const pairs: [Hazard, Rating][] = [["earthquake", c[4]], ["wildfire", c[5]], ["hurricane", c[6]]]
    for (const [hazard, rating] of pairs) if (rating >= SHOWN_FROM) hazards.push({ hazard, rating, label: RATING_LABELS[rating] })
  }
  return {
    zip,
    hardinessZone: zone || null,
    coldestNightF: coldestNightF(zone),
    county: c ? { fips, name: c[0], state: c[1], touches } : null,
    iecc,
    freezeRisk: freezeRiskFromZone(zone),
    climate: climateFrom(zone, iecc),
    hazards,
    observesDst: observesDst(c?.[1]),
    tableVersion: table.version.built,
  }
}
