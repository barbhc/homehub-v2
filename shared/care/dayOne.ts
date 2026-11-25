/**
 * Day-one Home (design/day-one-home.md; owner approved the mock 2026-11-19).
 *
 * The pure rules behind Home's one next-step card for an early home:
 *   · "What's in your home?" — which appliances to offer, and each one's typical
 *     care, with essentials pre-checked;
 *   · one question at a time — the next unanswered care fact that would add
 *     something this home does not already have.
 *
 * Nothing here writes. A tap selects; tasks are added only when the person
 * taps Add (suggest, never assume). The manual wins and nothing doubles: an
 * entry whose archetype an existing task already matches is never offered.
 */
import { archetypeOf, entryByKey, kindOf, suggestionsForItem, type AreaGate, type CareEntry, type CareFacts, type CareKind } from "./library.js"

export type ApplianceItemCategory = "major_appliance" | "small_appliance" | "system"

export interface Appliance {
  kind: CareKind
  /** The chip, and the new item's display name. */
  label: string
  /** The default room's name, when the home has a room by that name. */
  room: string | null
  itemCategory: ApplianceItemCategory
  /** Home-level library entries that belong with this appliance. */
  extra?: string[]
  /** The care fact a tap on this chip makes true. */
  fact?: keyof CareFacts
  /** Behind "More…". */
  more?: boolean
}

/**
 * Only kinds the library has care for. A microwave or an oven is left out on
 * purpose: tapping it would give nothing, and an offer that gives nothing is
 * worse than no offer.
 */
export const APPLIANCES: Appliance[] = [
  { kind: "furnace", label: "Furnace", room: "Utility Room", itemCategory: "system", extra: ["home.hvac_service"] },
  { kind: "hvac", label: "Central air", room: "Utility Room", itemCategory: "system", extra: ["home.hvac_service"] },
  { kind: "water_heater", label: "Water heater", room: "Utility Room", itemCategory: "system", extra: ["home.water_heater", "home.quake_straps"], fact: "has_water_heater" },
  { kind: "dishwasher", label: "Dishwasher", room: "Kitchen", itemCategory: "major_appliance" },
  { kind: "washer", label: "Washer", room: "Laundry Room", itemCategory: "major_appliance" },
  { kind: "dryer", label: "Dryer", room: "Laundry Room", itemCategory: "major_appliance" },
  { kind: "refrigerator", label: "Fridge", room: "Kitchen", itemCategory: "major_appliance" },
  { kind: "range_hood", label: "Range hood", room: "Kitchen", itemCategory: "major_appliance" },
  { kind: "air_purifier", label: "Air purifier", room: null, itemCategory: "small_appliance", more: true },
  { kind: "coffee_machine", label: "Coffee machine", room: "Kitchen", itemCategory: "small_appliance", more: true },
  { kind: "food_recycler", label: "Food recycler", room: "Kitchen", itemCategory: "small_appliance", more: true },
]

/** The chips still worth offering: appliances whose kind no item in the home already is. */
export function appliancesToOffer(items: { display_name?: string | null; category?: string | null; brand?: string | null; model?: string | null }[]): Appliance[] {
  const have = new Set(items.map((i) => kindOf(i)).filter(Boolean))
  return APPLIANCES.filter((a) => !have.has(a.kind))
}

export interface CareRow {
  entry: CareEntry
  /** Pre-checked: essentials. The person can change it. */
  checked: boolean
}

export interface HomeContext {
  /** Titles of every task the home already has, home-level and on items. */
  existingTitles: string[]
  /** Library keys dismissed on the home. */
  dismissed?: Iterable<string>
  /** Hazards the zip carries (and the person did not correct). */
  area?: Iterable<AreaGate>
}

/** Not covered by an existing task, not dismissed, and (when area-gated) true here. */
function offerable(entry: CareEntry, covered: Set<string>, gone: Set<string>, here: Set<AreaGate>): boolean {
  if (gone.has(entry.key) || covered.has(entry.archetype)) return false
  return !entry.area || here.has(entry.area)
}

const coveredBy = (titles: string[]) => new Set(titles.map((t) => archetypeOf(t)).filter((a): a is NonNullable<typeof a> => !!a))

/** One appliance's typical care: its own library entries, then the home-level ones that belong with it. */
export function applianceCare(a: Appliance, ctx: HomeContext): CareRow[] {
  const covered = coveredBy(ctx.existingTitles)
  const gone = new Set(ctx.dismissed ?? [])
  const here = new Set(ctx.area ?? [])
  const own = suggestionsForItem({ display_name: a.label, category: a.kind }, []).map((s) => s.entry)
  const extra = (a.extra ?? []).map((k) => entryByKey(k)).filter((e): e is CareEntry => !!e)
  const rows: CareRow[] = []
  for (const entry of [...own, ...extra]) {
    if (!offerable(entry, covered, gone, here)) continue
    covered.add(entry.archetype) // one per archetype, so a furnace never offers two filter tasks
    rows.push({ entry, checked: entry.priorityTier === "essential" })
  }
  return rows
}

// ── "What's in your home?" on an empty Home (before-friends B2) ───────────────

/**
 * One chip on the empty-Home card. A fact chip is a thing the home has
 * (smoke alarms); an appliance chip becomes an item when its first task is
 * added (D1), as the appliances card already does.
 */
export type HomePick =
  | { type: "fact"; id: string; label: string; fact: keyof CareFacts; entries: string[] }
  | { type: "appliance"; id: string; label: string; appliance: Appliance; more?: boolean }

const applianceOf = (kind: CareKind): Appliance => {
  const a = APPLIANCES.find((x) => x.kind === kind)
  if (!a) throw new Error(`No appliance for kind ${kind}`)
  return a
}
/** Built from APPLIANCES by kind, so there is one list of appliances, not two.
 *  `more` here is this card's own: Range hood sits behind More… on it, while
 *  the old card keeps reading APPLIANCES' flags. */
const appliancePick = (kind: CareKind, more = false): HomePick => {
  const appliance = applianceOf(kind)
  return { type: "appliance", id: kind, label: appliance.label, appliance, ...(more ? { more: true } : {}) }
}

/**
 * The chips, in the mock's groups and order. D3: Smoke alarms offers the alarm
 * test only; the yearly battery change stays where it is offered today (Tasks →
 * Suggested, and the monthly card in March and November).
 */
export const HOME_PICK_GROUPS: { title: string; picks: HomePick[] }[] = [
  {
    title: "Safety",
    picks: [
      { type: "fact", id: "smoke", label: "Smoke alarms", fact: "has_smoke_alarms", entries: ["home.alarm_test"] },
      { type: "fact", id: "co", label: "Carbon monoxide (CO) alarms", fact: "has_co_alarms", entries: ["home.co_alarm_check"] },
      { type: "fact", id: "extinguisher", label: "Fire extinguisher", fact: "has_extinguisher", entries: ["home.extinguisher"] },
    ],
  },
  { title: "Heating and water", picks: [appliancePick("furnace"), appliancePick("hvac"), appliancePick("water_heater")] },
  {
    title: "Appliances",
    picks: [
      appliancePick("dishwasher"), appliancePick("washer"), appliancePick("dryer"), appliancePick("refrigerator"),
      appliancePick("range_hood", true), appliancePick("air_purifier", true), appliancePick("coffee_machine", true), appliancePick("food_recycler", true),
    ],
  },
]

const PICK_ORDER = HOME_PICK_GROUPS.flatMap((g) => g.picks.map((p) => p.id))

export interface PickCareRow {
  pickId: string
  entry: CareEntry
}

/**
 * One list for everything ticked, in group order, one row per archetype. ONE
 * `covered` set runs through every pick, so Furnace plus Central air yields a
 * single "Replace the air filter"; dismissed keys, area gates and the home's
 * existing tasks are skipped exactly as `applianceCare` skips them.
 */
export function careForPicks(picks: HomePick[], ctx: HomeContext): PickCareRow[] {
  const covered = coveredBy(ctx.existingTitles)
  const gone = new Set(ctx.dismissed ?? [])
  const here = new Set(ctx.area ?? [])
  const ordered = [...picks].sort((a, b) => PICK_ORDER.indexOf(a.id) - PICK_ORDER.indexOf(b.id))
  const rows: PickCareRow[] = []
  for (const pick of ordered) {
    const entries = pick.type === "fact"
      ? pick.entries.map((k) => entryByKey(k)).filter((e): e is CareEntry => !!e)
      : [
          ...suggestionsForItem({ display_name: pick.appliance.label, category: pick.appliance.kind }, []).map((s) => s.entry),
          ...(pick.appliance.extra ?? []).map((k) => entryByKey(k)).filter((e): e is CareEntry => !!e),
        ]
    for (const entry of entries) {
      if (!offerable(entry, covered, gone, here)) continue
      covered.add(entry.archetype)
      rows.push({ pickId: pick.id, entry })
    }
  }
  return rows
}

/**
 * The add screen's "What is it?" chip for an appliance kind, when it has one
 * (KIND_CHIPS' subTypes in src/components/smart-add/identifyData.ts). Central
 * air, the range hood and the More… kinds have no chip.
 */
export const KIND_SUBTYPE: Partial<Record<CareKind, string>> = {
  dishwasher: "dishwasher",
  washer: "washing-machine",
  dryer: "dryer",
  refrigerator: "refrigerator",
  water_heater: "water-heater",
  furnace: "hvac-furnace",
}

/**
 * Where "Add My Exact Models" goes (before-friends B2 and B4). An item made in
 * this visit is where its brand, model and manual go: one → its page, several
 * → Items. Otherwise the add screen's appliance lane, with the kind pre-picked
 * when exactly one appliance is ticked and the add screen has a chip for it.
 */
export function exactModelsTarget(createdItemIds: string[], tickedKinds: CareKind[]): string {
  if (createdItemIds.length === 1) return `/items/${createdItemIds[0]}`
  if (createdItemIds.length > 1) return "/inventory"
  const sub = tickedKinds.length === 1 ? KIND_SUBTYPE[tickedKinds[0]] : undefined
  return `/inventory/add?lane=appliance${sub ? `&kind=${sub}` : ""}`
}

// ── one question at a time ────────────────────────────────────────────────────

interface Question {
  fact: keyof CareFacts
  text: string
  entries: string[]
}

/** Full questions for Home; the Settings questionnaire keeps its own shorter wording. */
const QUESTIONS: Question[] = [
  { fact: "has_air_filter", text: "Do you have a furnace or central air?", entries: ["home.air_filter"] },
  { fact: "has_water_heater", text: "Is there a water heater that's yours to look after?", entries: ["home.water_heater", "home.quake_straps"] },
  // Before-friends B1: smoke and carbon monoxide (CO) are separate answers.
  { fact: "has_smoke_alarms", text: "Do you have smoke alarms?", entries: ["home.alarm_test", "home.alarm_batteries"] },
  { fact: "has_co_alarms", text: "Do you have carbon monoxide (CO) alarms?", entries: ["home.co_alarm_check"] },
  { fact: "has_extinguisher", text: "Do you have a fire extinguisher?", entries: ["home.extinguisher"] },
  { fact: "has_gutters", text: "Does your home have gutters?", entries: ["home.gutters"] },
]

/** What Yes would add, in words — the hint under the question. */
const ADDS: Record<string, string> = {
  "home.air_filter": "a filter change every 1–3 months",
  "home.water_heater": "a yearly flush",
  "home.quake_straps": "a yearly quake-strap check",
  "home.alarm_test": "an alarm test twice a year",
  "home.alarm_batteries": "a yearly battery change",
  "home.co_alarm_check": "a yearly check of its replace-by date",
  "home.extinguisher": "a 3-minute yearly check",
  "home.gutters": "a gutter clean in spring and fall",
}

export interface NextQuestion {
  fact: keyof CareFacts
  text: string
  /** "Yes adds a yearly flush. You choose before anything is added." */
  hint: string
  /** What Yes would offer, in order. Never empty. */
  entries: CareEntry[]
}

/**
 * The next question worth asking: its fact is unanswered, the person has not
 * skipped it here, no task the home has already answers it, and Yes would
 * offer at least one task the home lacks.
 * Null when there is nothing left to ask.
 */
export function nextQuestion(facts: CareFacts, ctx: HomeContext & { skipped?: Iterable<string> }): NextQuestion | null {
  const covered = coveredBy(ctx.existingTitles)
  const gone = new Set(ctx.dismissed ?? [])
  const here = new Set(ctx.area ?? [])
  const skipped = new Set(ctx.skipped ?? [])
  for (const q of QUESTIONS) {
    if (facts[q.fact] !== undefined || skipped.has(q.fact)) continue
    if (q.fact === "has_gutters" && facts.building_handles_exterior) continue
    // A task the home already has answers the question (an alarm test means
    // there are alarms): asking it anyway reads as not listening.
    if (q.entries.some((k) => { const e = entryByKey(k); return !!e && covered.has(e.archetype) })) continue
    const entries = q.entries.map((k) => entryByKey(k)).filter((e): e is CareEntry => !!e && offerable(e, covered, gone, here))
    if (entries.length === 0) continue
    const adds = entries.map((e) => ADDS[e.key] ?? e.title.toLowerCase())
    return { fact: q.fact, text: q.text, hint: `Yes adds ${adds.join(" and ")}. You choose before anything is added.`, entries }
  }
  return null
}

// ── two starter questions under Ask (release B) ─────────────────────────────

export interface AskStarter {
  /** The chip. */
  label: string
  /** What is sent to Ask. */
  question: string
}

/**
 * Two questions this home would plausibly ask this month, from what the zip
 * said. Shown on an early home only, once Ask can answer without a manual.
 * The questions are the eval's own (evals/ask-general/goldens.json).
 */
export function askStarters(input: { month: number; freezeRisk: boolean | null; hazards: readonly string[] }): AskStarter[] {
  const out: AskStarter[] = []
  const freezeSeason = [10, 11, 12, 1, 2].includes(input.month)
  if (input.freezeRisk !== false && freezeSeason) out.push({ label: "Before the first freeze?", question: "What should I do before the first freeze?" })
  if (input.hazards.includes("hurricane") && input.month >= 4 && input.month <= 10) out.push({ label: "Hurricane prep?", question: "When should I start preparing for hurricane season?" })
  if (input.hazards.includes("wildfire")) out.push({ label: "Wildfire-ready?", question: "How can I protect my house from wildfire?" })
  if (input.hazards.includes("earthquake")) out.push({ label: "Earthquake-ready?", question: "How do I get my home ready for an earthquake?" })
  out.push({ label: "Air filter: how often?", question: "How often should I change my air filter?" })
  out.push({ label: "This month's upkeep?", question: "What should I do for my home this month?" })
  return out.slice(0, 2)
}

/**
 * The starters for one home today — the ONE place a home's profile becomes
 * starter questions. Home (under the Ask bar) and the Ask tab's chips both
 * read it, so neither suggests an appliance the home may not have.
 * `today` is a local YYYY-MM-DD.
 */
export function askStartersForHome(
  profile: { freeze_risk?: boolean | null; area?: { hazards: readonly string[] } | null } | null | undefined,
  today: string,
): AskStarter[] {
  return askStarters({
    month: Number(today.slice(5, 7)),
    freezeRisk: profile?.freeze_risk ?? null,
    hazards: profile?.area?.hazards ?? [],
  })
}
