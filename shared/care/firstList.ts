/**
 * "Worth doing this month" — the short list a new home sees right after its zip
 * (D8, design/first-minute-onboarding.md, "The list: what qualifies and in what
 * order"). Pure: the screen passes in the month, what the zip said and what the
 * owner has answered; this returns the rows and what was left off and why.
 *
 * Every row must pass Relevant, Useful and Timely, and the list is short on
 * purpose: at most three rows, at most two asking a question. Nothing here
 * writes anything — the rows become tasks only when the owner taps Add.
 */
import { archetypeOf, entryByKey, type AreaGate, type CareEntry, type CareFacts, type ExistingTask } from "./library.js"
import { addDays } from "../dates/calendar.js"

export type Climate = "mild" | "moderate" | "cold" | "hot"
export type HomeType = "house" | "condo" | "townhouse" | "apartment" | "other"
type Months = [number, number]

/** The physical system a row belongs to: one row per system (rule 6). */
type System = "alarms" | "hvac" | "water_heater" | "exterior" | "plumbing_outside" | "storm" | "fire_safety"
  // DRAFT systems for the seasonal entries (2026-11-19)
  | "cooling" | "fireplace" | "air_quality" | "plumbing_inside" | "envelope" | "pests" | "alarm_batteries"

interface Starter {
  key: string
  system: System
  /** Inclusive month ranges (1–12), by climate band; "any" fits every month. */
  windows: (climate: Climate | null) => Months[] | "any"
  /** Only these home types. Absent = every type. */
  homeTypes?: HomeType[]
  /** Asked inline when the gating fact is unknown. Absent = no question (the row is pre-checked). */
  question?: (input: FirstListInput) => string
  /** The row's one line of "why now", in the mock's words. */
  reason: (input: FirstListInput, t: { ifNotDoneYet: boolean }) => string | null
  /** Essential freeze work stays offered for one month after its window, worded "If not done yet". */
  graceMonth?: boolean
  /** Not timely on its own: used only to fill a list shorter than two rows. */
  filler?: boolean
  /** DRAFT (2026-11-19): offered by the monthly refresh only, never in onboarding's first list. */
  monthly?: boolean
}

/** The heating season's start, when the filter matters most; cooling season in hot climates. */
const FILTER: Record<Climate | "default", Months> = { cold: [9, 11], moderate: [10, 11], mild: [10, 11], hot: [4, 5], default: [10, 11] }
/** DRAFT: the spring cooling check, before each band's heat (ENERGY STAR: cooling in spring). */
const COOLING: Record<Climate, Months> = { hot: [2, 3], moderate: [4, 4], mild: [4, 5], cold: [5, 5] }
/** DRAFT: the chimney before the first fire, by band. */
const CHIMNEY: Record<Climate, Months> = { cold: [8, 9], moderate: [9, 10], mild: [9, 10], hot: [10, 11] }
/** Autumn work before the first frost, by band (matches shared/care/seasonalWindow.ts). */
const FALL: Record<Climate | "default", Months> = { cold: [9, 10], moderate: [9, 11], mild: [10, 11], hot: [10, 12], default: [9, 11] }
const band = <T,>(t: Record<Climate | "default", T>, c: Climate | null): T => (c ? t[c] : t.default)
const monthBefore = ([from]: Months): Months => { const m = from === 1 ? 12 : from - 1; return [m, m] }

const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const inUnit = (i: FirstListInput) => i.homeType === "condo" || i.homeType === "apartment"
const furnaceQuestion = (i: FirstListInput) => (i.climate === "cold" ? "Does the furnace take a filter?" : "Do you have a furnace or central air?")
const waterHeaterQuestion = (i: FirstListInput) => (inUnit(i) ? "Is there a water heater in your unit?" : "Do you have a water heater?")
/** The month heating (or, in hot climates, cooling) gets going, by band. */
const SEASON_START: Record<Climate, number> = { cold: 10, moderate: 11, mild: 11, hot: 5 }

function filterReason(i: FirstListInput): string {
  if (!i.hasArea || !i.climate) return "Heating season starts in most places this month."
  const what = i.climate === "hot" ? "Cooling" : "Heating"
  const start = SEASON_START[i.climate]
  if (i.month === start) return `${what} season starts here this month.`
  if (next(i.month) === start) return `${what} season starts here next month.`
  return `${what} season is under way here.`
}

function alarmReason(i: FirstListInput): string {
  // Clock copy only where the state changes its clocks, and never without a
  // zip (must-be-true 15).
  if (i.hasArea && i.observesDst === true && (i.month === 3 || i.month === 11)) {
    return i.month === 11 ? "The clocks changed this month. Test them together." : "The clocks change this month. Test them together."
  }
  return i.month >= 8 ? "Fall is a good time for the first one." : "Spring is a good time for the first one."
}

const STARTERS: Starter[] = [
  { key: "home.alarm_test", system: "alarms", windows: () => [[3, 4], [10, 11]], reason: alarmReason },
  { key: "home.air_filter", system: "hvac", windows: (c) => [band(FILTER, c)], question: furnaceQuestion, reason: filterReason },
  { key: "home.hvac_service", system: "hvac", windows: (c) => [monthBefore(band(FILTER, c))], question: furnaceQuestion, reason: () => "Book it before the first cold night." },
  { key: "home.quake_straps", system: "water_heater", windows: () => "any", question: waterHeaterQuestion, reason: () => "High earthquake risk in this county." },
  { key: "home.water_heater", system: "water_heater", windows: () => "any", question: waterHeaterQuestion, filler: true, reason: () => "Once a year keeps the sediment down." },
  {
    key: "home.outdoor_taps", system: "plumbing_outside", windows: (c) => [band(FALL, c)], homeTypes: ["house", "townhouse"],
    question: () => "Any outdoor taps or hose bibs?", graceMonth: true,
    reason: (i, t) => (t.ifNotDoneYet ? `If not done yet. Hard freezes start here in ${MONTH[i.month - 1]}.` : "Before the first hard freeze."),
  },
  { key: "home.gutters", system: "exterior", windows: (c) => [[3, 4], band(FALL, c)], question: () => "Does your home have gutters?", reason: (i) => (i.month >= 8 ? "Leaves are down. Clear them before the rain." : "Clear what the winter left.") },
  { key: "home.wildfire_prep", system: "exterior", windows: () => [[5, 6]], homeTypes: ["house", "townhouse"], reason: () => "High wildfire risk in this county. Fire season is close." },
  { key: "home.hurricane_prep", system: "storm", windows: () => [[5, 5]], reason: () => "Hurricane season starts June 1." },
  { key: "home.extinguisher", system: "fire_safety", windows: () => "any", question: () => "Do you have a fire extinguisher?", filler: true, reason: () => "A quick look once a year." },
  // ── DRAFT seasonal starters (2026-11-19): for the owner's review ──
  { key: "home.radon_test", monthly: true, system: "air_quality", windows: () => [[1, 1]], homeTypes: ["house", "townhouse"], reason: () => "January is National Radon Action Month." },
  { key: "home.leak_check", monthly: true, system: "plumbing_inside", windows: () => [[3, 3]], reason: () => "Fix a Leak Week is in March." },
  { key: "home.cooling_service", monthly: true, system: "cooling", windows: (c) => [COOLING[c ?? "moderate"]], question: () => "Do you have central air conditioning?", reason: (i) => (i.climate === "hot" ? "Book it before the heat arrives." : "Book it before the first hot week.") },
  { key: "home.chimney", monthly: true, system: "fireplace", windows: (c) => [CHIMNEY[c ?? "moderate"]], question: () => "Do you have a fireplace or wood stove?", reason: () => "Before the first fire of the season." },
  { key: "home.fire_drill", monthly: true, system: "fire_safety", windows: () => [[4, 4], [10, 10]], reason: (i) => (i.month >= 8 ? "Fire Prevention Week is in October." : "Twice a year keeps it fresh.") },
  { key: "home.draft_seal", monthly: true, system: "envelope", windows: (c) => [c === "hot" ? [4, 5] : band(FALL, c)], reason: (i) => (i.climate === "hot" ? "Before the cooling bills start." : "Before the heating bills start.") },
  { key: "home.alarm_batteries", monthly: true, system: "alarm_batteries", windows: () => [[3, 3], [11, 11]], question: () => "Do you have smoke or CO alarms?", reason: () => "Easy to remember with the clock change. Skip it for sealed 10-year alarms." },
  { key: "home.termite", monthly: true, system: "pests", windows: () => [[4, 5]], homeTypes: ["house", "townhouse"], question: () => "Are termites a known risk where you live?", reason: () => "Termites swarm as it warms." },
]

/** The fact a starter's question answers — the same fact that gates its library entry. */
const factOf = (entry: CareEntry): keyof CareFacts | undefined => entry.fact

export interface FirstListInput {
  /** This month on the home's calendar (1–12). */
  month: number
  climate: Climate | null
  /** null = unknown (no zip, no answer): freeze work stays on. */
  freezeRisk: boolean | null
  homeType: HomeType | null
  /** Hazards the zip rated Relatively High or above, and still true (not corrected). */
  hazards: ("earthquake" | "wildfire" | "hurricane")[]
  facts: CareFacts
  existing?: ExistingTask[]
  dismissed?: Iterable<string>
  /** Which of the inputs are DERIVED defaults (proposed, not her answers) — only those may be named under "Not on your list". */
  derived: { freezeRisk: boolean; buildingHandlesExterior: boolean }
  /** A zip was found in the table. False on the skip path (and for an unknown zip). */
  hasArea: boolean
  /** The zip's state changes its clocks; null without a zip. */
  observesDst: boolean | null
  /** Top a short list up with the year-round fillers (onboarding). The monthly
   *  refresh says false: a filler is not timely, and offering the same one every
   *  month is noise (design/day-one-home.md, release D). Default true. */
  fillers?: boolean
  /** Include the monthly-only starters (the monthly refresh). Default false: onboarding is unchanged. */
  monthly?: boolean
}

export interface FirstListRow {
  entry: CareEntry
  /** The inline Yes / No / Not sure, when the gating fact is unknown. */
  question: { fact: keyof CareFacts; text: string } | null
  /** Pre-checked only when there is no open question (rule 7). */
  checked: boolean
  /** Past its window, still offered: "If not done yet". */
  ifNotDoneYet: boolean
  /** One line of why-now. */
  reason: string | null
}

export type LeftOffReason = "freeze_free" | "building_handles_exterior"
export interface LeftOff {
  reason: LeftOffReason
  /** What the person reads: "Winterizing: it rarely freezes here." */
  label: string
}

const LEFT_OFF_ORDER: LeftOffReason[] = ["freeze_free", "building_handles_exterior"]
const FREEZE_FREE: LeftOff = { reason: "freeze_free", label: "Winterizing: it rarely freezes here." }
const exteriorLeftOff = (i: FirstListInput): LeftOff => ({
  reason: "building_handles_exterior",
  label: `Roof and gutters: usually the building’s job in ${i.homeType === "apartment" ? "an apartment" : "a condo"}.`,
})

export interface FirstList {
  rows: FirstListRow[]
  /** At most two things a derived default removed from THIS month's list (rule 8). */
  leftOff: LeftOff[]
}

const inRange = (m: number, [from, to]: Months) => (from <= to ? m >= from && m <= to : m >= from || m <= to)
const next = (m: number) => (m === 12 ? 1 : m + 1)
/** Months from `m` to the end of the range containing `m` (0 = closes this month). */
const monthsToClose = (m: number, [, to]: Months) => (to - m + 12) % 12

interface Timing { timely: boolean; ifNotDoneYet: boolean; closesIn: number }

function timing(s: Starter, entry: CareEntry, input: FirstListInput): Timing {
  const w = s.windows(input.climate)
  if (w === "any") return { timely: !s.filler, ifNotDoneYet: false, closesIn: 99 }
  let best: Timing = { timely: false, ifNotDoneYet: false, closesIn: 99 }
  for (const r of w) {
    if (inRange(input.month, r)) { best = { timely: true, ifNotDoneYet: false, closesIn: Math.min(best.closesIn, monthsToClose(input.month, r)) }; continue }
    if (inRange(next(input.month), r)) { // opens next month
      const closes = monthsToClose(next(input.month), r) + 1
      if (!best.timely || closes < best.closesIn) best = { timely: true, ifNotDoneYet: false, closesIn: Math.min(best.closesIn, closes) }
      continue
    }
    const graceMonth = r[1] === 12 ? 1 : r[1] + 1
    if (s.graceMonth && entry.priorityTier === "essential" && input.month === graceMonth && !best.timely) {
      best = { timely: true, ifNotDoneYet: true, closesIn: 0 }
    }
  }
  return best
}

const TIER = { essential: 0, recommended: 1, optional: 2 } as const
/** Work the building does when it "handles the exterior" (condos and apartments, by default). */
const EXTERIOR = new Set(["gutters.clean", "wildfire.clear"])

function relevance(s: Starter, entry: CareEntry, input: FirstListInput, gates: { freeze: boolean; exterior: boolean }): "in" | "out" | "derived_out" {
  // Outside work depends on the building; with no home type (the zip was
  // skipped, so step 2 was too) it is not offered at all.
  if ((s.homeTypes || EXTERIOR.has(entry.archetype)) && !input.homeType) return "out"
  if (s.homeTypes && input.homeType && !s.homeTypes.includes(input.homeType)) return "out"
  if (entry.area) {
    const ok = entry.area === "freeze" ? gates.freeze : input.hazards.includes(entry.area as Exclude<AreaGate, "freeze">)
    if (!ok) return entry.area === "freeze" && input.freezeRisk === false && input.derived.freezeRisk ? "derived_out" : "out"
  }
  const fact = factOf(entry)
  if (fact && input.facts[fact] === false) return "out"
  if (EXTERIOR.has(entry.archetype) && !gates.exterior) {
    return input.derived.buildingHandlesExterior ? "derived_out" : "out"
  }
  return "in"
}

export function firstList(input: FirstListInput): FirstList {
  const gone = new Set(input.dismissed ?? [])
  const covered = new Set((input.existing ?? []).map((t) => archetypeOf(t.title)).filter(Boolean))
  const gates = {
    // Unknown freeze risk keeps freeze work on: silence about a freeze is the costly mistake.
    freeze: input.freezeRisk !== false,
    exterior: input.facts.building_handles_exterior !== true,
  }

  type Candidate = FirstListRow & { system: System; t: Timing; filler: boolean }
  const candidates: Candidate[] = []
  const leftOff = new Map<LeftOffReason, LeftOff>()

  for (const s of STARTERS) {
    if (s.monthly && !input.monthly) continue
    const entry = entryByKey(s.key)
    if (!entry || gone.has(entry.key) || covered.has(entry.archetype)) continue
    if (entry.priorityTier === "optional") continue // rule 2: Useful
    const t = timing(s, entry, input)
    const rel = relevance(s, entry, input, gates)
    if (rel === "derived_out") {
      // Rule 8: name it only if it would have been timely anyway.
      if (t.timely) {
        if (entry.area === "freeze") leftOff.set("freeze_free", FREEZE_FREE)
        else leftOff.set("building_handles_exterior", exteriorLeftOff(input))
      }
      continue
    }
    if (rel === "out") continue
    const fact = factOf(entry)
    const open = !!fact && s.question !== undefined && input.facts[fact] !== true
    candidates.push({
      entry,
      question: open ? { fact: fact!, text: s.question!(input) } : null,
      checked: !open,
      ifNotDoneYet: t.ifNotDoneYet,
      reason: s.reason(input, t),
      system: s.system,
      t,
      filler: !!s.filler,
    })
  }

  // Freeze-free also removes winterizing a condo would never have been offered
  // as a task; it is still worth naming, because it is a default about her home
  // (it suppresses winterize steps in every manual Homehub reads for her).
  if (input.freezeRisk === false && input.derived.freezeRisk && inRange(input.month, band(FALL, input.climate)) && !leftOff.has("freeze_free")) {
    leftOff.set("freeze_free", FREEZE_FREE)
  }

  const order = (a: Candidate, b: Candidate) =>
    a.t.closesIn - b.t.closesIn ||
    TIER[a.entry.priorityTier] - TIER[b.entry.priorityTier] ||
    Number(!!a.question) - Number(!!b.question) ||
    a.entry.minutes - b.entry.minutes

  const rows: Candidate[] = []
  const take = (pool: Candidate[], limit: number) => {
    for (const c of pool.sort(order)) {
      if (rows.length >= limit) return
      if (rows.some((r) => r.system === c.system)) continue // rule 6
      if (c.question && rows.filter((r) => r.question).length >= 2) continue // rule 5
      rows.push(c)
    }
  }
  take(candidates.filter((c) => c.t.timely), 3)
  if (rows.length < 2 && input.fillers !== false) take(candidates.filter((c) => c.filler), 2)

  return {
    rows: rows.map(({ entry, question, checked, ifNotDoneYet, reason }) => ({ entry, question, checked, ifNotDoneYet, reason })),
    leftOff: LEFT_OFF_ORDER.flatMap((r) => leftOff.get(r) ?? []).slice(0, 2),
  }
}

/**
 * When the tasks added from the list are first due: the coming weekend, inside
 * Home's 7-day week, so they appear under This week the same day (must-be-true
 * 11). The first row Saturday, the rest Sunday — the approved mock's Home.
 * Saturday itself counts as "coming"; on a Sunday it is the next weekend.
 */
export function firstDueDates(today: string, count: number): string[] {
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay() // 0 = Sunday
  const toSaturday = weekday === 6 ? 0 : 6 - weekday
  const saturday = addDays(today, toSaturday)
  const sunday = addDays(saturday, 1)
  return Array.from({ length: count }, (_, i) => (i === 0 ? saturday : sunday))
}
