/**
 * Builds src/data/zip-area.json — the zip table onboarding reads (D8).
 *
 *   npx tsx scripts/area/build-zip-area.ts            # download, build, write
 *   npx tsx scripts/area/build-zip-area.ts --check    # build and compare; exit 1 if it differs
 *
 * Refresh it yearly, or when a source publishes a new release: update SOURCES
 * (URL and release line), run, review the diff's summary, commit. The table
 * stamps its build day on every home that uses it (`area.tableVersion`), so a
 * bad value can be traced to the homes that saw it.
 *
 * Nothing here touches Firebase. The downloads are public files, cached under
 * the OS temp directory; `unzip` must be on PATH.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { buildZipArea, hazardRatings, parseDbf, parseDelimited } from "./zipAreaBuild.js"
import { lookupZip, type ZipAreaTable } from "../../shared/area/zipArea.js"

const SOURCES = {
  hardiness: {
    url: "https://prism.oregonstate.edu/phzm/data/2023/phzm_us_zipcode_2023.csv",
    release: "USDA Plant Hardiness Zone Map 2023, by zip (PRISM Climate Group, Oregon State University)",
  },
  zipToCounty: {
    url: "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt",
    release: "US Census Bureau 2020 ZCTA-to-county relationship file",
  },
  hazards: {
    url: "https://www.fema.gov/about/reports-and-data/openfema/nri/v120/NRI_Table_Counties.zip",
    release: "FEMA National Risk Index v1.20 (December 2025), county table: overall risk rating, shown only where the per-building loss rate is in the top 30%",
  },
  climateZones: {
    url: "https://basc.pnnl.gov/sites/default/files/ClimateZoneDataFiles.zip",
    release: "PNNL Guide to Determining Climate Zone by County (IECC 2021), county shapefile",
  },
} as const

const here = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(here, "../../src/data/zip-area.json")
const CACHE = join(tmpdir(), "homehub-zip-area")

async function download(url: string, file: string): Promise<string> {
  const path = join(CACHE, file)
  if (existsSync(path)) return path
  // PNNL's firewall refuses requests without a browser-like user agent.
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (homehub zip-area build)" } })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  const buf = new Uint8Array(await res.arrayBuffer())
  if (file.endsWith(".zip") && !(buf[0] === 0x50 && buf[1] === 0x4b)) throw new Error(`${url}: not a zip file (the server sent something else)`)
  writeFileSync(path, buf)
  return path
}

function unzipOne(zipPath: string, member: string): Buffer {
  return execFileSync("unzip", ["-p", zipPath, member], { maxBuffer: 256 * 1024 * 1024 })
}

/** Spot checks that must hold for any release; a failure stops the write. */
function sanity(table: ZipAreaTable) {
  const expect = (zip: string, check: (a: NonNullable<ReturnType<typeof lookupZip>>) => boolean, what: string) => {
    const a = lookupZip(table, zip)
    if (!a || !check(a)) throw new Error(`sanity: ${zip} ${what} — got ${JSON.stringify(a)}`)
  }
  expect("94110", (a) => a.freezeRisk === false && a.county?.name === "San Francisco County" && a.hazards.some((h) => h.hazard === "earthquake"), "is San Francisco, freeze-free, earthquake-rated")
  expect("55406", (a) => a.freezeRisk === true && a.climate === "cold" && a.hazards.length === 0, "is cold Minneapolis with no hazard shown")
  expect("33139", (a) => a.climate === "hot" && a.hazards.some((h) => h.hazard === "hurricane"), "is hot, hurricane-rated Miami Beach")
  expect("60614", (a) => a.county?.name === "Cook County" && !a.hazards.some((h) => h.hazard === "earthquake"), "is Chicago with no earthquake shown")
  expect("90012", (a) => a.hazards.some((h) => h.hazard === "earthquake"), "is earthquake-rated Los Angeles")
  expect("85004", (a) => a.observesDst === false && a.climate === "hot", "is Phoenix: hot, no clock change")
  const zips = Object.keys(table.zips).length
  if (zips < 35_000) throw new Error(`sanity: only ${zips} zips`)
}

/**
 * `--hazards-only`: re-derive just the three hazard columns from FEMA's county
 * table and keep every other value as built. For a change to how hazards are
 * read (2026-11-24: overall risk → per-building loss rate) without refetching
 * the other three sources, any of which can move or break between builds.
 */
async function hazardsOnly() {
  const table = JSON.parse(readFileSync(OUT, "utf8")) as ZipAreaTable
  const hazardsZip = await download(SOURCES.hazards.url, "nri-counties.zip")
  const rows = new Map<string, Record<string, string>>()
  for (const r of parseDelimited(unzipOne(hazardsZip, "NRI_Table_Counties.csv").toString("utf8"))) if (r.STCOFIPS) rows.set(r.STCOFIPS, r)
  let changed = 0
  for (const [fips, row] of Object.entries(table.counties)) {
    const next = hazardRatings(rows.get(fips))
    if (next.some((v, i) => v !== row[4 + i])) changed++
    row[4] = next[0]
    row[5] = next[1]
    row[6] = next[2]
  }
  table.version = { built: new Date().toISOString().slice(0, 10), sources: { ...table.version.sources, hazards: SOURCES.hazards.release } }
  sanity(table)
  writeFileSync(OUT, JSON.stringify(table) + "\n")
  console.log(`hazards re-derived for ${Object.keys(table.counties).length} counties (${changed} changed) · wrote ${OUT}`)
}

async function main() {
  const check = process.argv.includes("--check")
  mkdirSync(CACHE, { recursive: true })
  if (process.argv.includes("--hazards-only")) return hazardsOnly()
  const hardiness = await download(SOURCES.hardiness.url, "hardiness.csv")
  const zipCounty = await download(SOURCES.zipToCounty.url, "zip-county.txt")
  const hazardsZip = await download(SOURCES.hazards.url, "nri-counties.zip")
  const zonesZip = await download(SOURCES.climateZones.url, "climate-zones.zip")

  const table = buildZipArea({
    hardinessCsv: readFileSync(hardiness, "utf8"),
    zipCountyTxt: readFileSync(zipCounty, "utf8"),
    hazardsCsv: unzipOne(hazardsZip, "NRI_Table_Counties.csv").toString("utf8"),
    climateZones: parseDbf(new Uint8Array(unzipOne(zonesZip, "ClimateZones.dbf"))),
    built: new Date().toISOString().slice(0, 10),
    sources: {
      hardiness: SOURCES.hardiness.release,
      zipToCounty: SOURCES.zipToCounty.release,
      hazards: SOURCES.hazards.release,
      climateZones: SOURCES.climateZones.release,
    },
  })
  sanity(table)
  const json = JSON.stringify(table)

  const counties = Object.keys(table.counties).length
  const zips = Object.values(table.zips)
  console.log(`zips ${zips.length} · counties ${counties} · no zone ${zips.filter((z) => !z[0]).length} · no county ${zips.filter((z) => !z[1]).length} · ${(json.length / 1024).toFixed(0)} KB`)

  if (check) {
    const current = existsSync(OUT) ? (JSON.parse(readFileSync(OUT, "utf8")) as ZipAreaTable) : null
    // The build day always differs; compare everything else.
    const same = current && JSON.stringify({ ...current, version: { ...current.version, built: "" } }) === JSON.stringify({ ...table, version: { ...table.version, built: "" } })
    console.log(same ? "zip-area.json is current" : "zip-area.json differs from a fresh build")
    process.exit(same ? 0 : 1)
  }
  writeFileSync(OUT, json + "\n")
  console.log(`wrote ${OUT}`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
