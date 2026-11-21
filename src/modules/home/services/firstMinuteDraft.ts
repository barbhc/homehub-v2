/**
 * The first minute, held on the device until there is an account
 * (design/account-after-list.md).
 *
 * Zip, area and list run before sign-up, so nothing they choose can be written
 * to Firestore yet. It lives here instead — in memory, mirrored to localStorage
 * so Apple's redirect sign-in (a full page reload) comes back to the same step,
 * the same list choices, and the save they asked for.
 *
 * localStorage is a serialization boundary: whatever comes back is checked
 * field by field before the app believes it. A draft that fails the check is
 * dropped (logged), never half-trusted.
 */
import type { HomeProfileUpsert, HomeType, Climate, ClimateSource } from "./homeProfileService"
import { toArea } from "./homeProfileService"
import type { CareFacts } from "../../../../shared/care/library"
import type { Hazard } from "../../../../shared/area/zipArea"

export const DRAFT_KEY = "homehub:firstMinuteDraft"
/** Set (sessionStorage) when a save is asked for in THIS browser visit. A
 *  waiting save from any other visit — the tab closed with the sheet open, or a
 *  different person on the same device — is never run for whoever signs in next. */
export const SAVE_MARK_KEY = "homehub:firstMinuteSaveAsked"
/** A draft nobody has touched for this long is from a different time; start over. */
export const DRAFT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

export type Step = "zip" | "area" | "list" | "addzip"
export type Answer = "yes" | "no" | "unsure"
export type WhyNot = "building" | "none" | "recent" | "not_for_me"

/** What the steps would have written to the home doc, had there been one. */
export type DraftProfile = Pick<
  HomeProfileUpsert,
  "zip" | "climate" | "freeze_risk" | "climate_source" | "area" | "home_type" | "completed_at" | "care_facts" | "dismissed_care"
>

/** The list screen's choices, so a reload shows the list exactly as it was left. */
export type DraftList = {
  month: number
  answers: Record<string, Answer>
  checked: Record<string, boolean>
  removed: Record<string, WhyNot | "skip">
  corrections: { freeze: boolean | null; hazardsOff: Hazard[] }
  exteriorMine: boolean
}

export type PendingTask = { key: string; due: string }

/** What they asked to save while signed out: their list, or just the home ("Not now"). */
export type Pending =
  | { kind: "add"; patch: DraftProfile; tasks: PendingTask[] }
  | { kind: "keep"; patch: DraftProfile }

export type FirstMinuteDraft = {
  v: 1
  step: Step
  profile: DraftProfile
  list: DraftList | null
  pending: Pending | null
  /** A home this flow created on a save that then failed part way: Try again reuses it. */
  createdHomeId: string | null
  /** Tasks already written on such a save: Try again skips them. */
  addedKeys: string[]
  /** When it was last written (ms), so an old draft can be dropped. */
  savedAt: number
}

export const EMPTY_DRAFT: FirstMinuteDraft = {
  v: 1, step: "zip", profile: {}, list: null, pending: null, createdHomeId: null, addedKeys: [], savedAt: 0,
}

// ── parsing ──────────────────────────────────────────────────────────────────

type Obj = Record<string, unknown>
const isObj = (x: unknown): x is Obj => !!x && typeof x === "object" && !Array.isArray(x)
const STEPS: readonly Step[] = ["zip", "area", "list", "addzip"]
const HOME_TYPES: readonly HomeType[] = ["house", "condo", "townhouse", "apartment", "other"]
const CLIMATES: readonly Climate[] = ["mild", "moderate", "cold", "hot"]
const SOURCES: readonly ClimateSource[] = ["zip", "owner"]
const ANSWERS: readonly Answer[] = ["yes", "no", "unsure"]
const WHY: readonly (WhyNot | "skip")[] = ["building", "none", "recent", "not_for_me", "skip"]
const HAZARDS: readonly Hazard[] = ["earthquake", "wildfire", "hurricane"]
/** A real calendar date, YYYY-MM-DD (not just the shape: 2026-99-99 fails). */
function isDate(x: unknown): x is string {
  if (typeof x !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return false
  const d = new Date(`${x}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === x
}
/** Every CareFacts key — a Record so adding a fact without listing it here is a type error. */
const CARE_FACT_KEYS: Record<keyof CareFacts, true> = {
  has_smoke_alarms: true, has_extinguisher: true, has_water_heater: true, has_hvac_service: true, termite_risk: true,
  birds_roosting: true, rodents: true, has_gutters: true, building_handles_pests: true, building_handles_exterior: true,
  has_air_filter: true, has_central_air: true, has_fireplace: true, has_outdoor_taps: true,
}
const isFactKey = (k: string): k is keyof CareFacts => Object.hasOwn(CARE_FACT_KEYS, k)

function oneOf<T extends string>(list: readonly T[], x: unknown): T | undefined {
  return list.find((v) => v === x)
}
function boolOrNull(x: unknown): boolean | null | undefined {
  return x === null || typeof x === "boolean" ? x : undefined
}
function stringRecord<T>(x: unknown, pick: (v: unknown) => T | undefined): Record<string, T> {
  const out: Record<string, T> = {}
  if (!isObj(x)) return out
  for (const [k, v] of Object.entries(x)) {
    const ok = pick(v)
    if (ok !== undefined) out[k] = ok
  }
  return out
}

function parseFacts(x: unknown): CareFacts {
  // Only known facts, and only booleans: anything else never reaches the home doc.
  const out: CareFacts = {}
  if (isObj(x)) for (const [k, v] of Object.entries(x)) if (isFactKey(k) && typeof v === "boolean") out[k] = v
  return out
}

export function parseProfile(x: unknown): DraftProfile {
  if (!isObj(x)) return {}
  const p: DraftProfile = {}
  if (typeof x.zip === "string" && /^\d{5}$/.test(x.zip)) p.zip = x.zip
  const climate = oneOf(CLIMATES, x.climate)
  if (climate) p.climate = climate
  const freeze = boolOrNull(x.freeze_risk)
  if (freeze !== undefined) p.freeze_risk = freeze
  const source = oneOf(SOURCES, x.climate_source)
  if (source) p.climate_source = source
  if (x.area !== undefined) p.area = toArea(x.area)
  const type = oneOf(HOME_TYPES, x.home_type)
  if (type) p.home_type = type
  if (typeof x.completed_at === "string" && !Number.isNaN(Date.parse(x.completed_at))) p.completed_at = x.completed_at
  if (x.care_facts !== undefined) p.care_facts = parseFacts(x.care_facts)
  if (Array.isArray(x.dismissed_care)) p.dismissed_care = x.dismissed_care.filter((k): k is string => typeof k === "string")
  return p
}

function parseList(x: unknown): DraftList | null {
  if (!isObj(x)) return null
  const month = typeof x.month === "number" && Number.isInteger(x.month) && x.month >= 1 && x.month <= 12 ? x.month : null
  if (month === null) return null
  const c = isObj(x.corrections) ? x.corrections : {}
  return {
    month,
    answers: stringRecord(x.answers, (v) => oneOf(ANSWERS, v)),
    checked: stringRecord(x.checked, (v) => (typeof v === "boolean" ? v : undefined)),
    removed: stringRecord(x.removed, (v) => oneOf(WHY, v)),
    corrections: {
      freeze: boolOrNull(c.freeze) ?? null,
      hazardsOff: Array.isArray(c.hazardsOff) ? c.hazardsOff.flatMap((h) => oneOf(HAZARDS, h) ?? []) : [],
    },
    exteriorMine: x.exteriorMine === true,
  }
}

function parsePending(x: unknown): Pending | null {
  if (!isObj(x)) return null
  const patch = parseProfile(x.patch)
  if (x.kind === "keep") return { kind: "keep", patch }
  if (x.kind !== "add" || !Array.isArray(x.tasks)) return null
  const tasks = x.tasks.flatMap((t): PendingTask[] =>
    isObj(t) && typeof t.key === "string" && isDate(t.due) ? [{ key: t.key, due: t.due }] : [])
  return tasks.length ? { kind: "add", patch, tasks } : null
}

/** A stored draft, checked; null when there is none or it doesn't hold up. */
export function parseDraft(raw: string | null): FirstMinuteDraft | null {
  if (!raw) return null
  let x: unknown
  try {
    x = JSON.parse(raw)
  } catch (err) {
    console.warn("[first minute] stored draft is not JSON; starting over:", err instanceof Error ? err.message : err)
    return null
  }
  if (!isObj(x) || x.v !== 1) return null
  return {
    v: 1,
    step: oneOf(STEPS, x.step) ?? "zip",
    profile: parseProfile(x.profile),
    list: parseList(x.list),
    pending: parsePending(x.pending),
    createdHomeId: typeof x.createdHomeId === "string" && x.createdHomeId ? x.createdHomeId : null,
    addedKeys: Array.isArray(x.addedKeys) ? x.addedKeys.filter((k): k is string => typeof k === "string") : [],
    savedAt: typeof x.savedAt === "number" && Number.isFinite(x.savedAt) ? x.savedAt : 0,
  }
}

// ── storage ──────────────────────────────────────────────────────────────────
// Storage can be missing or throw (private mode, blocked site data). The flow
// still works in memory then; only the resume after a redirect is lost, so each
// failure is logged and the caller carries on.

export function loadDraft(now = Date.now()): FirstMinuteDraft | null {
  try {
    const d = parseDraft(window.localStorage.getItem(DRAFT_KEY))
    if (!d || now - d.savedAt > DRAFT_MAX_AGE_MS) return null
    return d
  } catch (err) {
    console.warn("[first minute] could not read the saved draft:", err instanceof Error ? err.message : err)
    return null
  }
}

export function saveDraft(d: FirstMinuteDraft): void {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, savedAt: Date.now() }))
  } catch (err) {
    console.warn("[first minute] could not keep the draft on this device:", err instanceof Error ? err.message : err)
  }
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY)
    window.sessionStorage.removeItem(SAVE_MARK_KEY)
  } catch (err) {
    console.warn("[first minute] could not clear the draft:", err instanceof Error ? err.message : err)
  }
}

/** A save was asked for in this browser visit (survives Apple's redirect reload, which keeps the tab). */
export function markSaveAsked(): void {
  try {
    window.sessionStorage.setItem(SAVE_MARK_KEY, "1")
  } catch (err) {
    console.warn("[first minute] could not mark the save; it won't resume after a redirect:", err instanceof Error ? err.message : err)
  }
}
export function clearSaveAsked(): void {
  try {
    window.sessionStorage.removeItem(SAVE_MARK_KEY)
  } catch (err) {
    console.warn("[first minute] could not clear the save mark:", err instanceof Error ? err.message : err)
  }
}

/**
 * The draft to start from. A waiting save, and any half-finished save's
 * progress, count only if they were asked for in this browser visit — never
 * for a later visit or a different person on the same device.
 */
export function startingDraft(): FirstMinuteDraft {
  const d = loadDraft()
  if (!d) return EMPTY_DRAFT
  let asked = false
  try {
    asked = window.sessionStorage.getItem(SAVE_MARK_KEY) === "1"
  } catch (err) {
    console.warn("[first minute] could not read the save mark:", err instanceof Error ? err.message : err)
  }
  return asked ? d : { ...d, pending: null, createdHomeId: null, addedKeys: [] }
}
