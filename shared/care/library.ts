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
  | "filter.clean.pre" | "filter.clean.mesh" | "filter.clean.lint" | "filter.clean.drain"
  | "sensor.clean" | "descale" | "duct.clean" | "tub.clean" | "coils.clean"
  | "safety.test.alarm" | "battery.replace.alarm" | "flush.tank" | "service.pro"
  | "pest.termite" | "pest.bird" | "pest.rodent" | "gutters.clean" | "extinguisher.check"

const ARCHETYPE_RULES: [Archetype, RegExp][] = [
  ["filter.replace.hepa", /\b(replace|change)\b.*\bhepa\b/i],
  ["filter.replace.carbon", /\b(replace|change)\b.*\b(carbon|charcoal|deodori[sz]ation)\b.*\bfilter/i],
  ["filter.replace.water", /\b(replace|change)\b.*\bwater filter\b/i],
  ["filter.replace.air", /\b(replace|change)\b.*\b(air filter|furnace filter)\b/i],
  ["filter.clean.pre", /\b(clean|wash|vacuum)\b.*\bpre[\s-]?filter\b/i],
  ["filter.clean.lint", /\b(clean|empty)\b.*\blint\b/i],
  ["filter.clean.drain", /\b(clean|clear)\b.*\b(drain|sump)\b.*\b(filter|pump)\b/i],
  ["filter.clean.mesh", /\b(clean|wash|degrease)\b.*\b(mesh|grease|baffle|aluminum|aluminium)\b.*\bfilter/i],
  ["sensor.clean", /\b(clean|wipe)\b.*\bsensor\b/i],
  ["descale", /\b(descal|delim|scale|limescale)/i],
  ["duct.clean", /\b(duct\w*|vent)\b.*\b(clean|inspect|lint)\b|\b(clean|inspect)\b.*\b(duct\w*|vent)\b/i],
  ["tub.clean", /\b(tub|drum)\b.*\bclean\b|\bclean\b.*\b(tub|drum)\b/i],
  ["coils.clean", /\b(condenser|coil)/i],
  ["safety.test.alarm", /\btest\b.*\b(smoke|co|carbon monoxide|alarm|detector)/i],
  ["battery.replace.alarm", /\b(replace|change)\b.*\bbatter/i],
  ["flush.tank", /\b(flush|drain)\b.*\b(tank|water heater)\b/i],
  ["service.pro", /\b(annual|yearly|professional|technician)\b.*\b(service|tune[\s-]?up|inspection)\b/i],
  ["pest.termite", /\btermite/i],
  ["pest.bird", /\b(pigeon|bird)/i],
  ["pest.rodent", /\b(rodent|mouse|mice|rat)\b/i],
  ["gutters.clean", /\bgutter/i],
  ["extinguisher.check", /\bextinguisher\b/i],
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
  /** Home-level entries apply only when this profile fact is true. */
  fact?: keyof CareFacts
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
}

const MFR = "Typical manufacturer guidance for this category"
const NFPA = "NFPA and USFA guidance on alarm testing"
const PEST = "Pest-industry guidance (annual inspections; quarterly bird control)"

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
  { key: "food_recycler.carbon", kind: "food_recycler", archetype: "filter.replace.carbon", title: "Replace the carbon filters", careType: "maintenance", priorityTier: "recommended", riskLevel: "performance", scheduleType: "quarterly", minutes: 5, cadenceLabel: "Every 3–6 months", why: "Spent filters are why the unit starts to smell.", how: "Open the filter compartment, swap the cartridges, reset the indicator.", source: MFR },
  // ── descaling and the indicator-driven backstop ──
  { key: "coffee_machine.descale", kind: "coffee_machine", archetype: "descale", title: "Descale the machine", careType: "maintenance", priorityTier: "essential", riskLevel: "prevent_damage", scheduleType: "quarterly", minutes: 25, cadenceLabel: "About every 3 months", why: "Scale narrows the boiler and is the usual cause of a machine that runs cool or slow.", how: "Descaling solution per the manual, run the descale program, rinse twice.", source: MFR, indicator: true },
  // ── safety devices ──
  { key: "home.alarm_test", kind: "home", archetype: "safety.test.alarm", title: "Test smoke and CO alarms", careType: "maintenance", priorityTier: "essential", riskLevel: "safety", scheduleType: "semiannual", minutes: 5, cadenceLabel: "Twice a year", why: "The one test that has to work on the night it matters.", how: "Press and hold the test button on each unit until it sounds.", source: NFPA, fact: "has_smoke_alarms" },
  { key: "home.alarm_batteries", kind: "home", archetype: "battery.replace.alarm", title: "Replace alarm batteries", careType: "maintenance", priorityTier: "essential", riskLevel: "safety", scheduleType: "annual", minutes: 15, cadenceLabel: "Yearly", why: "A chirping alarm gets pulled down; a dead one stays silent.", how: "Fresh batteries in every unit at once; note the date inside the cover.", source: NFPA, fact: "has_smoke_alarms" },
  { key: "home.extinguisher", kind: "home", archetype: "extinguisher.check", title: "Check the fire extinguisher", careType: "maintenance", priorityTier: "recommended", riskLevel: "safety", scheduleType: "annual", minutes: 3, cadenceLabel: "Yearly", why: "Gauge in the green, pin in place, nothing blocking it.", how: "Read the gauge, check the tag date, shake a dry-chemical unit.", source: NFPA, fact: "has_extinguisher" },
  { key: "home.water_heater", kind: "home", archetype: "flush.tank", title: "Flush the water heater", careType: "maintenance", priorityTier: "recommended", riskLevel: "prevent_damage", scheduleType: "annual", minutes: 45, cadenceLabel: "Yearly", why: "Sediment shortens the tank's life and makes it noisy and slow.", how: "Power off, hose on the drain valve, drain a few gallons until clear.", source: MFR, fact: "has_water_heater" },
  { key: "home.hvac_service", kind: "home", archetype: "service.pro", title: "Furnace or HVAC service", careType: "maintenance", priorityTier: "recommended", riskLevel: "prevent_damage", scheduleType: "annual", minutes: 60, cadenceLabel: "Yearly, before heating season", why: "A tune-up catches the failures that happen on the first cold night.", how: "Book a technician; ask for the heat-exchanger check.", source: MFR, pro: true, fact: "has_hvac_service" },
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
    if (!hit) { out.push({ entry }); continue }
    if (entry.indicator && !(hit.scheduleType && RECURRING.has(hit.scheduleType))) out.push({ entry, backstopFor: hit })
  }
  return out
}

/** Home-level entries whose fact is true and which no home-scoped task already covers. */
export function suggestionsForHome(facts: CareFacts, existing: ExistingTask[], dismissed: Iterable<string> = []): Suggestion[] {
  const gone = new Set(dismissed)
  const matched = new Set(existing.map((t) => archetypeOf(t.title)).filter(Boolean))
  return LIBRARY
    .filter((e) => e.kind === "home" && e.fact && facts[e.fact] === true && !gone.has(e.key) && !matched.has(e.archetype))
    .filter((e) => !(e.archetype.startsWith("pest.") && facts.building_handles_pests) && !(e.archetype === "gutters.clean" && facts.building_handles_exterior))
    .map((entry) => ({ entry }))
}

export function entryByKey(key: string): CareEntry | undefined {
  return LIBRARY.find((e) => e.key === key)
}
