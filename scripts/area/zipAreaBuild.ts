/**
 * The pure half of build-zip-area.ts: four public files in, one ZipAreaTable
 * out. Gated by vitest like product code — a wrong join here tells a homeowner
 * something false about where they live.
 *
 * Joins (design/first-minute-onboarding.md, "Data"):
 *   · zip → hardiness half-zone: USDA/PRISM 2023 zip file, as published.
 *   · zip → county: Census 2020 ZCTA-to-county file; a zip that crosses county
 *     lines takes the county holding the most of its LAND (and records how
 *     many it touches, so the screen can name the county it chose).
 *   · county → earthquake / wildfire / hurricane: FEMA National Risk Index.
 *   · county → IECC 2021 climate zone: PNNL's county shapefile attributes.
 *
 * Connecticut: FEMA rates its nine planning regions (09110–09190); the Census
 * 2020 zip file still uses its eight old counties, which those regions cut
 * across. A region's rating cannot be placed on an old county without guessing,
 * and silence beats a confident wrong answer — so the old CT counties carry no
 * hazard ratings. Their climate zone (PNNL uses the old counties) is kept.
 */
import type { CountyRow, Rating, ZipAreaTable, ZipRow } from "../../shared/area/zipArea.js"

/** RFC 4180-ish: quoted fields, doubled quotes, any delimiter. Enough for these files. */
export function parseDelimited(text: string, delimiter = ","): Record<string, string>[] {
  const rows: string[][] = []
  let field = ""
  let row: string[] = []
  let quoted = false
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += ch
      continue
    }
    if (ch === '"') quoted = true
    else if (ch === delimiter) { row.push(field); field = "" }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++
      row.push(field); field = ""
      if (row.length > 1 || row[0] !== "") rows.push(row)
      row = []
    } else field += ch
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row) }
  const [header, ...body] = rows
  if (!header) return []
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])))
}

/** dBASE III table (a shapefile's .dbf): every field read as trimmed text. */
export function parseDbf(buf: Uint8Array): Record<string, string>[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const count = view.getUint32(4, true)
  const headerLen = view.getUint16(8, true)
  const recordLen = view.getUint16(10, true)
  const fields: { name: string; len: number }[] = []
  for (let off = 32; buf[off] !== 0x0d; off += 32) {
    const raw = buf.subarray(off, off + 11)
    const end = raw.indexOf(0)
    fields.push({ name: new TextDecoder("latin1").decode(end === -1 ? raw : raw.subarray(0, end)), len: buf[off + 16] })
  }
  const dec = new TextDecoder("latin1")
  const out: Record<string, string>[] = []
  for (let r = 0; r < count; r++) {
    let p = headerLen + r * recordLen
    if (buf[p] === 0x2a) continue // deleted record
    p += 1
    const rec: Record<string, string> = {}
    for (const f of fields) {
      rec[f.name] = dec.decode(buf.subarray(p, p + f.len)).trim()
      p += f.len
    }
    out.push(rec)
  }
  return out
}

const RATING: Record<string, Rating> = {
  "Very Low": 1, "Relatively Low": 2, "Relatively Moderate": 3, "Relatively High": 4, "Very High": 5,
}
/** Anything else ("No Rating", "Insufficient Data", "Not Applicable", blank) is 0. */
export const ratingOf = (label: string | undefined): Rating => RATING[(label ?? "").trim()] ?? 0

/** FIPS state code → USPS abbreviation, for counties FEMA does not list. */
const STATE_BY_FIPS: Record<string, string> = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE", "11": "DC",
  "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY",
  "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT",
  "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH",
  "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT",
  "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI", "56": "WY",
  "60": "AS", "66": "GU", "69": "MP", "72": "PR", "78": "VI",
}

export interface BuildInput {
  /** phzm_us_zipcode_2023.csv: zipcode, zone, trange, zonetitle */
  hardinessCsv: string
  /** tab20_zcta520_county20_natl.txt (pipe-delimited) */
  zipCountyTxt: string
  /** NRI_Table_Counties.csv */
  hazardsCsv: string
  /** ClimateZones.dbf rows */
  climateZones: Record<string, string>[]
  built: string
  sources: ZipAreaTable["version"]["sources"]
}

export function buildZipArea(input: BuildInput): ZipAreaTable {
  // ── zip → county, by largest land overlap ──
  const parts = new Map<string, Map<string, number>>()
  for (const r of parseDelimited(input.zipCountyTxt, "|")) {
    const zip = r.GEOID_ZCTA5_20
    const county = r.GEOID_COUNTY_20
    if (!zip || !county) continue
    const m = parts.get(zip) ?? new Map<string, number>()
    m.set(county, (m.get(county) ?? 0) + Number(r.AREALAND_PART || 0))
    parts.set(zip, m)
  }
  const zipCounty = new Map<string, { fips: string; touches: number }>()
  for (const [zip, m] of parts) {
    // Ties break on the lower FIPS, so a rebuild never flips a zip at random.
    const [fips] = [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
    zipCounty.set(zip, { fips, touches: m.size })
  }

  // ── county facts ──
  const hazards = new Map<string, Record<string, string>>()
  for (const r of parseDelimited(input.hazardsCsv)) if (r.STCOFIPS) hazards.set(r.STCOFIPS, r)
  const zones = new Map<string, Record<string, string>>()
  for (const r of input.climateZones) {
    const fips = (r.GEOID ?? "").replace(/^G/, "")
    if (/^\d{5}$/.test(fips)) zones.set(fips, r)
  }

  const counties: Record<string, CountyRow> = {}
  const used = new Set([...zipCounty.values()].map((v) => v.fips))
  for (const fips of [...used].sort()) {
    const h = hazards.get(fips)
    const z = zones.get(fips)
    const state = h?.STATEABBRV || STATE_BY_FIPS[fips.slice(0, 2)] || ""
    // "San Francisco County", "Orleans Parish", "Anchorage Municipality": the
    // name the screen shows (step 2's "94110 · San Francisco County").
    const name = h?.COUNTY ? `${h.COUNTY} ${h.COUNTYTYPE ?? ""}`.trim() : (z?.Country ?? "")
    const iecc = Number(z?.IECC21 || 0)
    counties[fips] = [
      name,
      state,
      Number.isInteger(iecc) && iecc >= 1 && iecc <= 8 ? iecc : 0,
      z?.Moisture21 ?? "",
      ratingOf(h?.ERQK_RISKR),
      ratingOf(h?.WFIR_RISKR),
      ratingOf(h?.HRCN_RISKR),
    ]
  }

  // ── zips: every zip either file knows ──
  const hardiness = new Map<string, string>()
  for (const r of parseDelimited(input.hardinessCsv)) {
    if (/^\d{5}$/.test(r.zipcode) && /^\d{1,2}[ab]$/.test(r.zone)) hardiness.set(r.zipcode, r.zone)
  }
  const zips: Record<string, ZipRow> = {}
  for (const zip of [...new Set([...hardiness.keys(), ...zipCounty.keys()])].sort()) {
    const c = zipCounty.get(zip)
    zips[zip] = [hardiness.get(zip) ?? "", c?.fips ?? "", c?.touches ?? 0]
  }

  return { version: { built: input.built, sources: input.sources }, counties, zips }
}
