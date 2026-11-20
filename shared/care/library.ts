/**
 * The care library — what a home typically needs, beside what its manuals say.
 *
 * Owner, 2026-09-06: "part of Homehub isn't just relying completely on parsing
 * the manual, but it's also about knowing what is pragmatic advice for your
 * home in general and for common appliances in your home." The evidence that
 * day: her Nespresso's descale was parsed but could never remind (the manual
 * gives a light, not an interval); her Levoit had no manual and so no care at
 * all; nothing in any manual will ever mention termites or pigeons.
 *
 * Three ideas, all pure and testable here:
 *
 * 1. KINDS — what an item IS (air purifier, dryer, coffee machine…), resolved
 *    from the fields the item already carries. A kind is what the library keys
 *    on; an item whose kind has no essential care (a blender) gets nothing.
 * 2. ARCHETYPES — canonical care ids (`filter.replace.hepa`, `descale`,
 *    `duct.clean`…). A parsed task is MATCHED to an archetype by title, so
 *    "Replace the HEPA Filter" and "Replace Water Filter Cartridge" are
 *    recognisably the same kind of work, and "any item with a filter" becomes
 *    a structural question instead of a hope.
 * 3. ENTRIES — per kind, the archetypes a home of this kind typically needs,
 *    with a cadence, a why, a how, and a SOURCE. A suggestion is an entry
 *    whose archetype no existing task on the item matches.
 *
 * Rules the whole thing obeys (design/care-library.md):
 *   · The manual wins: a matched archetype is never suggested.
 *   · Provenance is visible: every entry carries `source`.
 *   · Nothing here schedules anything — a suggestion becomes a task only when
 *     the owner adds it, and the reminder is a second, separate choice.
 *   · Filters and safety devices first (owner's Q5, 2026-09-06).
 */
import { titleSimilarity, TITLE_MATCH_THRESHOLD } from "../parse/parseCore.js"

// ── kinds ─────────────────────────────────────────────────────────────────────

export type CareKind =
  | "air_purifier" | "range_hood" | "dishwasher" | "refrigerator" | "furnace" | "hvac"
  | "dryer" | "washer" | "coffee_machine" | "microwave" | "water_heater" | "ceiling_fan"
  | "food_recycler" | "oven_range" | "smoke_alarm"

export interface KindInput {
  display_name?: string | null
  category?: string | null
  brand?: string | null
  model?: string | null
}

/** Ordered: the first pattern that hits wins, so specific beats generic. */
const KIND_RULES: [CareKind, RegExp][] = [
  ["air_purifier", /\b(air[\s-]?purif|purifier|hepa)\b/i],
  ["range_hood", /\b(range[\s-]?hood|hood|vent hood)\b/i],
  ["dishwasher", /\bdishwash/i],
  ["refrigerator", /\b(refrigerator|fridge|freezer)\b/i],
  ["water_heater", /\bwater[\s-]?heater\b/i],
  ["furnace", /\b(furnace|boiler)\b/i],
  ["hvac", /\b(hvac|air[\s-]?condition|heat pump|a\/c|mini[\s-]?split)\b/i],
  ["dryer", /\bdryer\b/i],
  ["washer", /\b(washer|washing machine|laundry)\b/i],
  ["coffee_machine", /\b(nespresso|espresso|coffee|keurig|kettle)\b/i],
  ["microwave", /\bmicrowave\b/i],
  ["ceiling_fan", /\b(ceiling fan|fans?)\b/i],
  ["food_recycler", /\b(foodcycler|food[\s-]?recycler|composter)\b/i],
  ["oven_range", /\b(oven|range|stove|cooktop)\b/i],
  ["smoke_alarm", /\b(smoke|co\b|carbon monoxide)\b.*\b(alarm|detector)\b/i],
]

/** What this item IS, or null when the library has nothing for it. */
export function kindOf(item: KindInput): CareKind | null {
  const text = [item.display_name, item.category, item.brand, item.model].filter(Boolean).join(" ")
  for (const [kind, re] of KIND_RULES) if (re.test(text)) return kind
  return null
}

// ── archetypes ────────────────────────────────────────────────────────────────

export type Archetype =
  | "filter.replace.hepa" | "filter.replace.carbon" | "filter.replace.water" | "filter.replace.air"
  | "filter.clean.pre" | "filter.clean.mesh" | "filter.clean.lint" | "filter.clean.drain" | "filter.clean.inlet"
  | "sensor.clean" | "descale" | "duct.clean" | "tub.clean" | "coils.clean"
  | "safety.test.alarm" | "battery.replace.alarm" | "flush.tank" | "service.pro"
  | "pest.termite" | "pest.bird" | "pest.rodent" | "gutters.clean" | "extinguisher.check"
  | "quake.strap" | "freeze.taps" | "wildfire.clear" | "hurricane.prep"
  // Seasonal entries for the monthly card (owner approved 2026-11-20)
  | "radon.test" | "leak.check" | "service.cooling" | "chimney.inspect"

const ARCHETYPE_RULES: [Archetype, RegExp][] = [
  ["filter.replace.hepa", /\b(replace|change)\b.*\bhepa\b/i],
  ["filter.replace.carbon", /\b(replace|change)\b.*\b(carbon|charcoal|deodori[sz]ation)\b.*\bfilter/i],
  ["filter.replace.water", /\b(replace|change)\b.*\bwater filter\b/i],
  ["filter.replace.air", /\b(replace|change)\b.*\b(air filter|furnace filter)\b/i],
  ["filter.clean.pre", /\b(clean|wash|vacuum)\b.*\bpre[\s-]?filter\b/i],
  ["filter.clean.lint", /\b(clean|empty)\b.*\blint\b/i],
  ["filter.clean.drain", /\b(clean|clear)\b.*\b(drain|sump)\b.*\b(filter|pump)\b/i],
  ["filter.clean.inlet", /\b(clean|rinse)\b.*\binlet\b.*\b(filters?|screens?)\b/i],
  ["filter.clean.mesh", /\b(clean|wash|degrease)\b.*\b(mesh|grease|baffle|aluminum|aluminium)\b.*\bfilter/i],
  ["sensor.clean", /\b(clean|wipe)\b.*\bsensor\b/i],
  ["descale", /\b(descal|delim|scale|limescale)/i],
  ["duct.clean", /\b(duct\w*|vent)\b.*\b(clean|inspect|lint)\b|\b(clean|inspect)\b.*\b(duct\w*|vent)\b/i],
  ["tub.clean", /\b(tub|drum)\b.*\bclean\b|\bclean\b.*\b(tub|drum)\b/i],
  ["coils.clean", /\b(condenser|coil)/i],
  ["safety.test.alarm", /\btest\b.*\b(smoke|co|carbon monoxide|alarm|detector)/i],
  ["battery.replace.alarm", /\b(replace|change)\b.*\bbatter/i],
  ["flush.tank", /\b(flush|drain)\b.*\b(tank|water heater)\b/i],
  // Before service.pro: these name what is serviced, and must not read as the furnace visit.
  ["service.cooling", /\b(air[\s-]?condition\w*|a\/?c|cooling)\b.*\b(tune[\s-]?up|service|check)\b/i],
  ["chimney.inspect", /\b(chimney|fireplace|wood stove)\b/i],
  ["radon.test", /\bradon\b/i],
  ["leak.check", /\b(toilet|faucet)s?\b.*\bleak|\bleak\w*\b.*\b(toilet|faucet)s?\b/i],
  ["service.pro", /\b(annual|yearly|professional|technician)\b.*\b(service|tune[\s-]?up|inspection)\b/i],
  ["pest.termite", /\btermite/i],
  ["pest.bird", /\b(pigeon|bird)/i],
  ["pest.rodent", /\b(rodent|mouse|mice|rat)\b/i],
  // Before gutters: "Clear leaves from the roof, gutters and vents" is wildfire
  // prep, and must not count as (or suppress) the gutters task.
  ["wildfire.clear", /\bwildfire\b|\bembers?\b|\broof\b.*\bgutters?\b.*\bvents?\b/i],
  ["gutters.clean", /\bgutter/i],
  ["extinguisher.check", /\bextinguisher\b/i],
  ["quake.strap", /\b(quake|earthquake|seismic)\b.*\bstraps?\b|\bwater heater\b.*\bstraps?\b/i],
  ["freeze.taps", /\b(outdoor|outside|exterior)\b.*\b(taps?|faucets?|spigots?|hose ?bibs?)\b|\bhose ?bibs?\b/i],
  ["hurricane.prep", /\bhurricane\b/i],
]

/** Which archetype a task title is, by rule first, then by similarity to the
 *  library's own titles (the one matcher, per non-negotiable #1). */
export function archetypeOf(title: string): Archetype | null {
  for (const [a, re] of ARCHETYPE_RULES) if (re.test(title)) return a
  let best: { a: Archetype; s: number } | null = null
  for (const e of LIBRARY) {
    const s = titleSimilarity(title, e.title)
    if (s >= TITLE_MATCH_THRESHOLD && (!best || s > best.s)) best = { a: e.archetype, s }
  }
  return best?.a ?? null
}

// ── entries ───────────────────────────────────────────────────────────────────

export type LibrarySchedule = "weekly" | "monthly" | "quarterly" | "semiannual" | "annual" | "every_n_days"

export interface CareEntry {
  /** Stable key — what a dismissal and a task's provenance point at. */
  key: string
  kind: CareKind | "home"
  archetype: Archetype
  title: string
  careType: "maintenance" | "cleaning"
  priorityTier: "essential" | "recommended" | "optional"
  riskLevel: "safety" | "prevent_damage" | "performance" | "comfort"
  scheduleType: LibrarySchedule
  intervalDays?: number
  minutes: number
  /** "Every 6–8 months" — the human range; scheduleType is the cadence we set. */
  cadenceLabel: string
  why: string
  how: string
  /** Where this typical cadence comes from. Visible on the row. */
  source: string
  /** Someone to book, not something to do. */
  pro?: boolean
  /** The appliance signals this itself; the library cadence is a BACKSTOP the
   *  owner may add, never a due date we assert. */
  indicator?: boolean
  /** Only ever a cadence behind a task the manual already has — never a new
   *  suggestion. Not every unit has the part: Samsung's top-load washers have
   *  no pump filter at all, so offering "clean the drain pump filter" to every
   *  washer would assert something nobody checked. */
  backstopOnly?: boolean
  /** Home-level entries apply only when this profile fact is true. */
  fact?: keyof CareFacts
  /** Offered only where the home's area carries this (D8). */
  area?: AreaGate
}

/** Answers from the home-setup questionnaire that gate home-level entries. */
export interface CareFacts {
  has_smoke_alarms?: boolean
  has_extinguisher?: boolean
  has_water_heater?: boolean
  has_hvac_service?: boolean
  termite_risk?: boolean
  birds_roosting?: boolean
  rodents?: boolean
  has_gutters?: boolean
  /** The building handles pests / exterior — suppresses those entries. */
  building_handles_pests?: boolean
  building_handles_exterior?: boolean
  /** A furnace or central air, i.e. an air filter to change (D8). */
  has_air_filter?: boolean
  /** Central air conditioning (the spring tune-up). */
  has_central_air?: boolean
  /** A fireplace or wood stove (the yearly chimney inspection). */
  has_fireplace?: boolean
  /** Outdoor taps (hose bibs) that can freeze (D8). */
  has_outdoor_taps?: boolean
}

/** What the home's zip says (shared/area/zipArea.ts). An entry gated on one is
 *  offered only to a home whose area carries it — never by default. */
export type AreaGate = "earthquake" | "wildfire" | "hurricane" | "freeze"

const MFR = "Typical manufacturer guidance for this category"
const NFPA = "NFPA and USFA guidance on alarm testing"
const PEST = "Pest-industry guidance (annual inspections; quarterly bird control)"
// D8 starter entries (design/first-minute-onboarding.md), each checked 2026-11-19.
const ENERGY_STAR = "ENERGY STAR: check the filter monthly, change it at least every 3 months"
const RED_CROSS = "American Red Cross guidance on preventing frozen pipes"
const ECA = "Earthquake Country Alliance: strap the tank top and bottom to the wall studs"
const FIREWISE = "NFPA Firewise USA: keep roofs, gutters and vents clear of leaves and needles"
const NWS = "National Weather Service: prepare before the season starts on June 1"
// Seasonal sources, each checked 2026-11-19 (owner approved the set 2026-11-20).
const EPA_RADON = "EPA: test your home for radon (January is National Radon Action Month); retest every two years (Surgeon General and EPA guidance)"
const EPA_LEAKS = "EPA WaterSense Fix a Leak Week (every March): the food-colouring toilet test and the faucet check"
const ENERGY_STAR_SEASONAL = "ENERGY STAR maintenance checklist: check the cooling system in spring and the heating system in fall"
const NFPA_211 = "NFPA 211: chimneys, fireplaces and vents inspected at least once a year"

export const LIBRARY: CareEntry[] = [
  // ── filters first ──
  { key: "air_purifier.hepa", kind: "air_purifier", archetype: "filter.replace.hepa", title: "Replace the HEPA filter", careType: "maintenance", priorityTier: "essential", riskLevel: "performance", scheduleType: "semiannual", minutes: 5, cadenceLabel: "Every 6–8 months", why: "A clogged HEPA stops cleaning the air and strains the fan.", how: "Unplug, open the base, swap the filter, reset the indicator if there is one.", source: MFR },
  { key: "air_purifier.prefilter", kind: "air_purifier", archetype: "filter.clean.pre", title: "Clean the pre-filter", careType: "maintenance", priorityTier: "recommended", riskLevel: "performance", scheduleType: "every_n_days", intervalDays: 21, minutes: 5, cadenceLabel: "Every 2–4 weeks", why: "It catches the hair and dust that would clog the HEPA filter early.", how: "Vacuum the outer mesh; don't wash it.", source: MFR },
  { key: "air_purifier.sensor", kind: "air_purifier", archetype: "sensor.clean", title: "Wipe the air-quality sensor lens", careType: "cleaning", priorityTier: "optional", riskLevel: "performance", scheduleType: "monthly", minutes: 2, cadenceLabel: "Monthly", why: "A dusty sensor keeps the fan on auto at the wrong speed.", how: "Dry cotton swab on the sensor window.", source: MFR },
  { key: "range_hood.mesh", kind: "range_hood", archetype: "filter.clean.mesh", title: "Clean the mesh grease filters", careType: "maintenance", priorityTier: "essential", riskLevel: "safety", scheduleType: "monthly", minutes: 15, cadenceLabel: "Monthly", why: "Grease-clogged filters cut airflow and are the fuel in a hood fire.", how: "Release the clips, wash in hot soapy water or the dishwasher, dry fully.", source: MFR },
  { key: "range_hood.charcoal", kind: "range_hood", archetype: "filter.replace.carbon", title: "Replace the charcoal filter", careType: "maintenance", priorityTier: "recommended", riskLevel: "performance", scheduleType: "semiannual", minutes: 5, cadenceLabel: "Every 6 months (recirculating hoods)", why: "It is what removes odours on a hood that does not vent outside.", how: "Slide the old cartridge out, fit the new one, note the date.", source: MFR },
  { key: "dishwasher.filter", kind: "dishwasher", archetype: "filter.clean.drain", title: "Clean the dishwasher filter", careType: "maintenance", priorityTier: "essential", riskLevel: "performance", scheduleType: "monthly", minutes: 10, cadenceLabel: "Monthly", why: "A clogged filter is the usual cause of gritty dishes and smells.", how: "Twist out the cylinder filter under the lower spray arm; rinse; scrub the flat screen.", source: MFR },
  { key: "refrigerator.water", kind: "refrigerator", archetype: "filter.replace.water", title: "Replace the water filter", careType: "maintenance", priorityTier: "recommended", riskLevel: "performance", scheduleType: "semiannual", minutes: 5, cadenceLabel: "Every 6 months", why: "Past its life the filter stops filtering and can slow the dispenser.", how: "Twist out the cartridge, fit the new one, run a few litres through.", source: MFR },
  { key: "refrigerator.coils", kind: "refrigerator", archetype: "coils.clean", title: "Vacuum the condenser coils", careType: "maintenance", priorityTier: "recommended", riskLevel: "prevent_damage", scheduleType: "semiannual", minutes: 20, cadenceLabel: "Every 6 months", why: "Dusty coils make the compressor work harder and fail sooner.", how: "Unplug, pull the fridge out or remove the kick plate, brush and vacuum.", source: MFR },
  { key: "furnace.filter", kind: "furnace", archetype: "filter.replace.air", title: "Replace the air filter", careType: "maintenance", priorityTier: "essential", riskLevel: "prevent_damage", scheduleType: "quarterly", minutes: 10, cadenceLabel: "Every 1–3 months", why: "A choked filter starves airflow and can overheat the heat exchanger.", how: "Note the size on the frame, slide the old one out, arrow toward the blower.", source: MFR },
  { key: "hvac.filter", kind: "hvac", archetype: "filter.replace.air", title: "Replace the air filter", careType: "maintenance", priorityTier: "essential", riskLevel: "prevent_damage", scheduleType: "quarterly", minutes: 10, cadenceLabel: "Every 1–3 months", why: "A choked filter starves airflow and ices the coil.", how: "Note the size on the frame, slide the old one out, arrow toward the unit.", source: MFR },
  { key: "dryer.lint", kind: "dryer", archetype: "filter.clean.lint", title: "Clean the lint filter", careType: "maintenance", priorityTier: "essential", riskLevel: "safety", scheduleType: "weekly", minutes: 2, cadenceLabel: "Every load, or at least weekly", why: "Lint is what dryer fires are made of.", how: "Pull the screen, roll the lint off, wash the screen monthly if softener leaves a film.", source: MFR },
  { key: "dryer.duct", kind: "dryer", archetype: "duct.clean", title: "Clean the dryer vent duct", careType: "maintenance", priorityTier: "essential", riskLevel: "safety", scheduleType: "annual", minutes: 45, cadenceLabel: "Yearly", why: "A lint-packed duct is the leading cause of dryer fires and slow drying.", how: "Disconnect the duct, brush or vacuum its full length, check the outside flap opens.", source: MFR },
  { key: "washer.tub", kind: "washer", archetype: "tub.clean", title: "Run a tub-clean cycle", careType: "maintenance", priorityTier: "recommended", riskLevel: "performance", scheduleType: "monthly", minutes: 5, cadenceLabel: "Monthly", why: "Residue and mould build in the drum and the gasket; this is what removes them.", how: "Empty drum, washer cleaner or bleach per the panel, run the Tub Clean cycle.", source: MFR },
  // D4, owner 2026-11-18: "the most critical tasks are cleaning filters … for
  // appliances that you forget to maintain". Manuals leave both of these "when
  // needed", so they never reached Tasks. The cadences are the makers' own
  // (checked 2026-11-20): LG and Samsung say monthly for the pump filter,
  // Whirlpool "every few months", Electrolux every two — quarterly is the
  // starting offer, and the row says so. LG and Samsung put the inlet screens
  // at about twice a year.
  { key: "washer.drain_filter", kind: "washer", archetype: "filter.clean.drain", title: "Clean the drain pump filter", careType: "maintenance", priorityTier: "recommended", riskLevel: "prevent_damage", scheduleType: "quarterly", minutes: 15, cadenceLabel: "Every 1–3 months", why: "Lint, coins and hair collect here; a blocked filter stops the washer draining.", how: "Towel and shallow tray under the access door, drain the hose, unscrew the filter, rinse, refit.", source: MFR, indicator: true, backstopOnly: true },
  { key: "washer.inlet_filter", kind: "washer", archetype: "filter.clean.inlet", title: "Clean the water inlet filters", careType: "maintenance", priorityTier: "recommended", riskLevel: "performance", scheduleType: "semiannual", minutes: 15, cadenceLabel: "About twice a year", why: "Grit and scale clog the small screens where the hoses connect, and the washer fills slowly.", how: "Taps off, unscrew the hoses at the washer, pull the screens with pliers, rinse, refit.", source: MFR, indicator: true, backstopOnly: true },
  { key: "food_recycler.carbon", kind: "food_recycler", archetype: "filter.replace.carbon", title: "Replace the carbon filters", careType: "maintenance", priorityTier: "recommended", riskLevel: "performance", scheduleType: "quarterly", minutes: 5, cadenceLabel: "Every 3–6 months", why: "Spent filters are why the unit starts to smell.", how: "Open the filter compartment, swap the cartridges, reset the indicator.", source: MFR },
  // ── descaling and the indicator-driven backstop ──
  { key: "coffee_machine.descale", kind: "coffee_machine", archetype: "descale", title: "Descale the machine", careType: "maintenance", priorityTier: "essential", riskLevel: "prevent_damage", scheduleType: "quarterly", minutes: 25, cadenceLabel: "About every 3 months", why: "Scale narrows the boiler and is the usual cause of a machine that runs cool or slow.", how: "Descaling solution per the manual, run the descale program, rinse twice.", source: MFR, indicator: true },
  // ── safety devices ──
  { key: "home.alarm_test", kind: "home", archetype: "safety.test.alarm", title: "Test smoke and CO alarms", careType: "maintenance", priorityTier: "essential", riskLevel: "safety", scheduleType: "semiannual", minutes: 5, cadenceLabel: "Twice a year", why: "The one test that has to work on the night it matters.", how: "Press and hold the test button on each unit until it sounds.", source: NFPA, fact: "has_smoke_alarms" },
  { key: "home.alarm_batteries", kind: "home", archetype: "battery.replace.alarm", title: "Replace alarm batteries", careType: "maintenance", priorityTier: "essential", riskLevel: "safety", scheduleType: "annual", minutes: 15, cadenceLabel: "Yearly", why: "A chirping alarm gets pulled down; a dead one stays silent.", how: "Fresh batteries in every unit at once; note the date inside the cover.", source: NFPA, fact: "has_smoke_alarms" },
  { key: "home.extinguisher", kind: "home", archetype: "extinguisher.check", title: "Check the fire extinguisher", careType: "maintenance", priorityTier: "recommended", riskLevel: "safety", scheduleType: "annual", minutes: 3, cadenceLabel: "Yearly", why: "Gauge in the green, pin in place, nothing blocking it.", how: "Read the gauge, check the tag date, shake a dry-chemical unit.", source: NFPA, fact: "has_extinguisher" },
  { key: "home.water_heater", kind: "home", archetype: "flush.tank", title: "Flush the water heater", careType: "maintenance", priorityTier: "recommended", riskLevel: "prevent_damage", scheduleType: "annual", minutes: 45, cadenceLabel: "Yearly", why: "Sediment shortens the tank's life and makes it noisy and slow.", how: "Power off, hose on the drain valve, drain a few gallons until clear.", source: MFR, fact: "has_water_heater" },
  { key: "home.air_filter", kind: "home", archetype: "filter.replace.air", title: "Replace the air filter", careType: "maintenance", priorityTier: "recommended", riskLevel: "prevent_damage", scheduleType: "quarterly", minutes: 10, cadenceLabel: "Every 1–3 months", why: "A clogged filter makes the system work harder, raises the bill and shortens its life.", how: "Note the size on the old filter's frame, slide it out, fit the new one with the arrow toward the unit.", source: ENERGY_STAR, fact: "has_air_filter" },
  { key: "home.hvac_service", kind: "home", archetype: "service.pro", title: "Furnace or HVAC service", careType: "maintenance", priorityTier: "recommended", riskLevel: "prevent_damage", scheduleType: "annual", minutes: 60, cadenceLabel: "Yearly, before heating season", why: "A tune-up catches the failures that happen on the first cold night.", how: "Book a technician; ask for the heat-exchanger check.", source: MFR, pro: true, fact: "has_hvac_service" },
  { key: "home.quake_straps", kind: "home", archetype: "quake.strap", title: "Check the water heater's quake straps", careType: "maintenance", priorityTier: "recommended", riskLevel: "safety", scheduleType: "annual", minutes: 5, cadenceLabel: "Yearly", why: "A tank that tips in a quake can break its gas or water line.", how: "Look for two metal straps, one near the top and one near the bottom, screwed into the wall studs; plumber's tape is not enough.", source: ECA, fact: "has_water_heater", area: "earthquake" },
  // ── weather and the outside ──
  { key: "home.outdoor_taps", kind: "home", archetype: "freeze.taps", title: "Shut off and drain the outdoor taps", careType: "maintenance", priorityTier: "essential", riskLevel: "prevent_damage", scheduleType: "annual", minutes: 10, cadenceLabel: "Yearly, before the first freeze", why: "Water left in an outdoor tap's pipe freezes, splits it, and leaks inside the wall.", how: "Close the shut-off valve indoors, open the outdoor tap to let it drain, and take the hose off.", source: RED_CROSS, fact: "has_outdoor_taps", area: "freeze" },
  { key: "home.wildfire_prep", kind: "home", archetype: "wildfire.clear", title: "Clear leaves from the roof, gutters and vents", careType: "maintenance", priorityTier: "recommended", riskLevel: "safety", scheduleType: "annual", minutes: 60, cadenceLabel: "Yearly, before fire season", why: "Embers land in dry leaves and needles; that is how most homes catch fire in a wildfire.", how: "Clear the roof, gutters and the first five feet around the house; check that vent screens are intact.", source: FIREWISE, area: "wildfire" },
  { key: "home.hurricane_prep", kind: "home", archetype: "hurricane.prep", title: "Get ready for hurricane season", careType: "maintenance", priorityTier: "recommended", riskLevel: "safety", scheduleType: "annual", minutes: 60, cadenceLabel: "Yearly, before June", why: "Supplies, shutters and insurance all take time; once a storm is named it is too late.", how: "Check your evacuation zone, restock water and batteries, test shutters, and review your flood cover.", source: NWS, area: "hurricane" },
  // ── seasonal entries: the monthly card only (owner approved 2026-11-20) ──
  { key: "home.radon_test", kind: "home", archetype: "radon.test", title: "Test for radon", careType: "maintenance", priorityTier: "recommended", riskLevel: "safety", scheduleType: "every_n_days", intervalDays: 730, minutes: 10, cadenceLabel: "Every 2 years, in January", why: "Radon is invisible and odourless, and a test is the only way to know your level.", how: "Put a short-term test kit on the lowest floor you live on for the days the kit says, then mail it to the lab.", source: EPA_RADON },
  { key: "home.leak_check", kind: "home", archetype: "leak.check", title: "Check toilets and faucets for leaks", careType: "maintenance", priorityTier: "recommended", riskLevel: "prevent_damage", scheduleType: "annual", minutes: 10, cadenceLabel: "Yearly, in March", why: "Small leaks are easy to miss and run all day.", how: "Put a few drops of food colouring in each toilet tank and wait 10 minutes without flushing; colour in the bowl means a leak. Look for drips at every faucet and showerhead.", source: EPA_LEAKS },
  { key: "home.cooling_service", kind: "home", archetype: "service.cooling", title: "Air-conditioning tune-up", careType: "maintenance", priorityTier: "recommended", riskLevel: "prevent_damage", scheduleType: "annual", minutes: 60, cadenceLabel: "Yearly, before cooling season", why: "Technicians are booked solid once the heat arrives, and a tune-up catches the failure before the first hot week.", how: "Book an HVAC technician for a cooling check before summer.", source: ENERGY_STAR_SEASONAL, pro: true, fact: "has_central_air" },
  { key: "home.chimney", kind: "home", archetype: "chimney.inspect", title: "Chimney and fireplace inspection", careType: "maintenance", priorityTier: "recommended", riskLevel: "safety", scheduleType: "annual", minutes: 60, cadenceLabel: "Yearly, before the first fire", why: "Creosote and blockages build up unseen and cause chimney fires.", how: "Book a certified chimney sweep for an inspection before you light the first fire of the season.", source: NFPA_211, pro: true, fact: "has_fireplace" },
  // ── pests and the building ──
  { key: "home.termite", kind: "home", archetype: "pest.termite", title: "Termite inspection", careType: "maintenance", priorityTier: "recommended", riskLevel: "prevent_damage", scheduleType: "annual", minutes: 60, cadenceLabel: "Yearly, late spring", why: "Colonies swarm as it warms; catching them early is the cheap version.", how: "Book a licensed inspector; keep the report.", source: PEST, pro: true, fact: "termite_risk" },
  { key: "home.birds", kind: "home", archetype: "pest.bird", title: "Pigeon deterrent check", careType: "maintenance", priorityTier: "recommended", riskLevel: "prevent_damage", scheduleType: "quarterly", minutes: 15, cadenceLabel: "Quarterly", why: "Deterrents shift and nests start fast; droppings damage surfaces and carry disease.", how: "Check spikes, netting and ledges; clear nesting material before eggs.", source: PEST, fact: "birds_roosting" },
  { key: "home.rodents", kind: "home", archetype: "pest.rodent", title: "Rodent entry check", careType: "maintenance", priorityTier: "recommended", riskLevel: "prevent_damage", scheduleType: "quarterly", minutes: 20, cadenceLabel: "Quarterly", why: "Gaps the width of a pencil are enough; sealing beats trapping.", how: "Walk the perimeter and utility penetrations; seal gaps; check bait or traps.", source: PEST, fact: "rodents" },
  { key: "home.gutters", kind: "home", archetype: "gutters.clean", title: "Clean the gutters", careType: "maintenance", priorityTier: "recommended", riskLevel: "prevent_damage", scheduleType: "semiannual", minutes: 90, cadenceLabel: "Spring and fall", why: "Blocked gutters push water into the fascia and foundation.", how: "Clear by hand or scoop, flush the downspouts, check the hangers.", source: "Consumer home-maintenance checklists (seasonal)", fact: "has_gutters" },
]

/** Entries for one kind. Kinds with nothing here are deliberate — a blender has
 *  no essential care, and "nothing" is the honest suggestion (owner's Q6). */
export function entriesForKind(kind: CareKind | null): CareEntry[] {
  return kind ? LIBRARY.filter((e) => e.kind === kind) : []
}

// ── suggestions ───────────────────────────────────────────────────────────────

export interface ExistingTask {
  title: string
  /** as_needed / after_each_use / setup / null — anything not recurring. */
  scheduleType: string | null
}

export interface Suggestion {
  entry: CareEntry
  /** For an indicator-driven task that already exists: the template it would
   *  back up, so the offer is "add a backstop", not "add a task". */
  backstopFor?: ExistingTask
}

const RECURRING = new Set(["weekly", "monthly", "quarterly", "semiannual", "annual", "seasonal", "every_n_days"])

/**
 * What the library would offer for one item, given what it already has.
 * The manual wins: an archetype any existing task matches is never suggested —
 * EXCEPT an indicator entry whose match has no recurring cadence, which comes
 * back as a backstop offer rather than a task.
 */
export function suggestionsForItem(item: KindInput, existing: ExistingTask[], dismissed: Iterable<string> = []): Suggestion[] {
  const kind = kindOf(item)
  if (!kind) return []
  const gone = new Set(dismissed)
  const matched = new Map<Archetype, ExistingTask>()
  for (const t of existing) {
    const a = archetypeOf(t.title)
    if (a && !matched.has(a)) matched.set(a, t)
  }
  const out: Suggestion[] = []
  for (const entry of entriesForKind(kind)) {
    if (gone.has(entry.key)) continue
    const hit = matched.get(entry.archetype)
    if (!hit) { if (!entry.backstopOnly) out.push({ entry }); continue }
    if (entry.indicator && !(hit.scheduleType && RECURRING.has(hit.scheduleType))) out.push({ entry, backstopFor: hit })
  }
  return out
}

/**
 * Home-level entries whose fact is true and which no home-scoped task already covers.
 * An entry gated on the home's area is offered only when `area` names it — so a
 * caller that knows nothing about the area (every caller before D8) never sees
 * quake straps in Ohio.
 */
export function suggestionsForHome(facts: CareFacts, existing: ExistingTask[], dismissed: Iterable<string> = [], area: Iterable<AreaGate> = []): Suggestion[] {
  const gone = new Set(dismissed)
  const here = new Set(area)
  const matched = new Set(existing.map((t) => archetypeOf(t.title)).filter(Boolean))
  return LIBRARY
    .filter((e) => e.kind === "home" && e.fact && facts[e.fact] === true && !gone.has(e.key) && !matched.has(e.archetype))
    .filter((e) => !e.area || here.has(e.area))
    .filter((e) => !(e.archetype.startsWith("pest.") && facts.building_handles_pests) && !(e.archetype === "gutters.clean" && facts.building_handles_exterior))
    .map((entry) => ({ entry }))
}

/** "Typical for washers" — the plural the review prints beside a usual interval. */
const KIND_PLURAL: Record<CareKind, string> = {
  air_purifier: "air purifiers", range_hood: "range hoods", dishwasher: "dishwashers", refrigerator: "refrigerators",
  furnace: "furnaces", hvac: "heating and cooling systems", dryer: "dryers", washer: "washers",
  coffee_machine: "coffee machines", microwave: "microwaves", water_heater: "water heaters", ceiling_fan: "ceiling fans",
  food_recycler: "food recyclers", oven_range: "ovens and ranges", smoke_alarm: "smoke alarms",
}

/**
 * The usual interval for a FILTER task the manual left "when needed" — D4.
 *
 * Owner, 2026-11-18: the filters people forget (dishwasher, washer, range hood,
 * purifier, heater) are the tasks that matter most, and a manual that says
 * "clean when needed" keeps them off the schedule for good. The review offers
 * the library's cadence in the manual's place, labelled as typical, and the row
 * can be put back to "when needed" before anything is saved.
 *
 * Narrow on purpose:
 *   - only `as_needed` — a manual that names its own cadence wins, always;
 *   - only filter care, and never the lint screen, which she cleans as she
 *     goes ("as opposed to cleaning out regularly like the lint filter");
 *   - only when the library has that filter for THIS kind of appliance.
 */
export function typicalFilterCadence(
  item: KindInput,
  task: { title: string; scheduleType: string | null },
): { entry: CareEntry; kindLabel: string } | null {
  if (task.scheduleType !== "as_needed") return null
  const kind = kindOf(item)
  if (!kind) return null
  const a = archetypeOf(task.title)
  if (!a || !a.startsWith("filter.") || a === "filter.clean.lint") return null
  const entry = entriesForKind(kind).find((e) => e.archetype === a)
  return entry ? { entry, kindLabel: KIND_PLURAL[kind] } : null
}

export function entryByKey(key: string): CareEntry | undefined {
  return LIBRARY.find((e) => e.key === key)
}
