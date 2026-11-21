import type { TaskLevel } from "../../../../shared/tasks/taskLevel"
import { doc, getDoc, runTransaction, serverTimestamp, setDoc, Timestamp, type DocumentData } from "firebase/firestore"
import { db } from "@/integrations/firebase"
import type { CareFacts } from "../../../../shared/care/library"
import type { ServiceResult } from "./homeService"

export type HomeType = "house" | "condo" | "townhouse" | "apartment" | "other"
export type Ownership = "own" | "rent"
export type OwnershipDuration = "new_under_1yr" | "1_to_5yr" | "5_plus"
export type PreferredMode = "ask_first" | "inventory_first" | "unset"
/** Local climate — read by house-rule application (freeze_prep suppression) and tiering. */
export type Climate = "mild" | "moderate" | "cold" | "hot"
/** Who set `climate` / `freeze_risk`: the zip table, or the owner (an answer or a "Not true here"). */
export type ClimateSource = "zip" | "owner"
type Hazard = "earthquake" | "wildfire" | "hurricane"

/**
 * What the zip said, kept with the table version that said it (D8). The zip
 * itself stays in Homehub: it is stored on the home doc and never sent anywhere.
 */
export type HomeArea = {
  /** Hazards shown and still believed true here (a "Not true here" removes one). */
  hazards: Hazard[]
  /** Hazards the owner said are not true here — never offered again on a table refresh. */
  hazardsCorrected: Hazard[]
  hardinessZone: string | null
  county: string | null
  observesDst: boolean | null
  /** The county is on the VA's termite-inspection list (shared/area/termites.ts).
   *  Absent on homes looked up before 2026-11-20: the termite question is asked. */
  termites?: boolean | null
  tableVersion: string
}

export function toArea(v: unknown): HomeArea | null {
  if (!v || typeof v !== "object") return null
  const r = v as Record<string, unknown>
  const hz = (x: unknown): Hazard[] =>
    Array.isArray(x) ? x.filter((h): h is Hazard => h === "earthquake" || h === "wildfire" || h === "hurricane") : []
  const str = (x: unknown) => (typeof x === "string" && x ? x : null)
  const version = str(r.tableVersion)
  if (!version) return null
  return {
    hazards: hz(r.hazards),
    hazardsCorrected: hz(r.hazardsCorrected),
    hardinessZone: str(r.hardinessZone),
    county: str(r.county),
    observesDst: typeof r.observesDst === "boolean" ? r.observesDst : null,
    termites: typeof r.termites === "boolean" ? r.termites : null,
    tableVersion: version,
  }
}

/**
 * Concerns keys are stable strings; labels live in the UI.
 * Add new keys here (and in HomeProfileOnboarding) together.
 */
export const TOP_CONCERN_KEYS = [
  "surprise_repairs",
  "warranty_tracking",
  "seasonal_maintenance",
  "saving_money",
  "not_sure",
] as const
export type TopConcernKey = (typeof TOP_CONCERN_KEYS)[number]

const TOP_CONCERN_KEY_SET = new Set<string>(TOP_CONCERN_KEYS)

function sanitizeTopConcerns(input: unknown): TopConcernKey[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<TopConcernKey>()
  for (const v of input) {
    if (typeof v === "string" && TOP_CONCERN_KEY_SET.has(v)) {
      seen.add(v as TopConcernKey)
    }
  }
  return Array.from(seen)
}

export type HomeProfile = {
  home_id: string
  /** D4: how much of a manual's upkeep this home wants in Tasks. null = the
   *  home has never picked one (it predates the setting) and behaves as
   *  "everything" — read it through taskLevelOf(). */
  task_level: TaskLevel | null
  /** D4: how many of the home's tasks the level is hiding — written with the
   *  level, so Home and Tasks only ask WHICH ones when the answer is not "none"
   *  (no extra read for a home that never lowered its level). */
  task_level_hidden: number
  home_type: HomeType | null
  ownership: Ownership | null
  ownership_duration: OwnershipDuration | null
  top_concerns: TopConcernKey[]
  preferred_mode: PreferredMode
  /** Local climate (mild/moderate/cold/hot); null until the owner answers. */
  climate: Climate | null
  /** True if pipes/appliances can freeze here. `false` suppresses winterizing
   *  (freeze_prep) tasks during a parse; null = unknown (no effect). */
  freeze_risk: boolean | null
  /** Five-digit zip, or null (skipped, or a home from before D8). */
  zip: string | null
  area: HomeArea | null
  /** Who set climate/freeze_risk; null for a home from before D8. */
  climate_source: ClimateSource | null
  /** Home-setup answers that gate the care library's building-level entries. */
  care_facts: CareFacts
  /** Home-level suggestion keys the owner dismissed. */
  dismissed_care: string[]
  /** HH-166: when someone answered the Settings winterizing offer ("Keep
   *  them" or a turn-off) for this home; null = never asked or never answered. */
  winterizing_offer_answered_at: string | null
  /** "YYYY-MM": the month whose "This month at your home" card was answered (Add or Not now) — design/day-one-home.md, release D. */
  refresh_answered_month: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type HomeProfileUpsert = {
  home_type?: HomeType | null
  ownership?: Ownership | null
  ownership_duration?: OwnershipDuration | null
  top_concerns?: TopConcernKey[]
  preferred_mode?: PreferredMode
  climate?: Climate | null
  freeze_risk?: boolean | null
  zip?: string | null
  area?: HomeArea | null
  climate_source?: ClimateSource | null
  /** When omitted, caller hasn't finished the flow. Pass `new Date().toISOString()` on completion. */
  completed_at?: string | null
  care_facts?: CareFacts
  dismissed_care?: string[]
  refresh_answered_month?: string | null
}

// home_profile is folded onto the home doc (firestore-model.md §2).
function hpIso(v: unknown): string | null {
  if (v instanceof Timestamp) return v.toDate().toISOString()
  return typeof v === "string" ? v : null
}
function toHomeProfile(homeId: string, d: DocumentData): HomeProfile {
  return {
    home_id: homeId,
    task_level: d.taskLevel === "essential" || d.taskLevel === "recommended" || d.taskLevel === "everything" ? d.taskLevel : null,
    task_level_hidden: typeof d.taskLevelHidden === "number" && d.taskLevelHidden > 0 ? d.taskLevelHidden : 0,
    home_type: (d.homeType ?? null) as HomeType | null,
    ownership: (d.ownership ?? null) as Ownership | null,
    ownership_duration: (d.ownershipDuration ?? null) as OwnershipDuration | null,
    top_concerns: sanitizeTopConcerns(d.topConcerns),
    preferred_mode: (d.preferredMode ?? "unset") as PreferredMode,
    climate: (d.climate ?? null) as Climate | null,
    freeze_risk: typeof d.freezeRisk === "boolean" ? d.freezeRisk : null,
    zip: typeof d.zip === "string" && /^\d{5}$/.test(d.zip) ? d.zip : null,
    area: toArea(d.area),
    climate_source: d.climateSource === "zip" || d.climateSource === "owner" ? d.climateSource : null,
    care_facts: (d.careFacts && typeof d.careFacts === "object") ? (d.careFacts as CareFacts) : {},
    dismissed_care: Array.isArray(d.dismissedCare) ? d.dismissedCare.filter((k: unknown) => typeof k === "string") : [],
    winterizing_offer_answered_at: hpIso(d.winterizingOfferAnsweredAt),
    refresh_answered_month: typeof d.refreshAnsweredMonth === "string" && /^\d{4}-\d{2}$/.test(d.refreshAnsweredMonth) ? d.refreshAnsweredMonth : null,
    completed_at: hpIso(d.profileCompletedAt),
    created_at: hpIso(d.createdAt) ?? "",
    updated_at: hpIso(d.updatedAt) ?? "",
  }
}

/** Maps a curated upsert patch to the home doc's camelCase fields. */
function patchToFields(patch: HomeProfileUpsert): DocumentData {
  const f: DocumentData = {}
  if (patch.home_type !== undefined) f.homeType = patch.home_type
  if (patch.ownership !== undefined) f.ownership = patch.ownership
  if (patch.ownership_duration !== undefined) f.ownershipDuration = patch.ownership_duration
  if (patch.top_concerns !== undefined) f.topConcerns = sanitizeTopConcerns(patch.top_concerns)
  if (patch.preferred_mode !== undefined) f.preferredMode = patch.preferred_mode
  if (patch.climate !== undefined) f.climate = patch.climate
  if (patch.freeze_risk !== undefined) f.freezeRisk = patch.freeze_risk
  if (patch.zip !== undefined) f.zip = patch.zip
  if (patch.area !== undefined) f.area = patch.area
  if (patch.climate_source !== undefined) f.climateSource = patch.climate_source
  if (patch.care_facts !== undefined) f.careFacts = patch.care_facts
  if (patch.refresh_answered_month !== undefined) f.refreshAnsweredMonth = patch.refresh_answered_month
  if (patch.dismissed_care !== undefined) f.dismissedCare = patch.dismissed_care
  if (patch.completed_at !== undefined)
    f.profileCompletedAt = patch.completed_at ? Timestamp.fromDate(new Date(patch.completed_at)) : null
  return f
}

export async function getHomeProfile(homeId: string): Promise<ServiceResult<HomeProfile | null>> {
  try {
    const snap = await getDoc(doc(db, `homes/${homeId}`))
    if (!snap.exists()) return { data: null, error: null }
    return { data: toHomeProfile(homeId, snap.data()), error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to load home profile" } }
  }
}

/**
 * Record that the Settings winterizing offer was answered for this home (HH-166),
 * so a home already set to Mild/Hot is asked once, not on every visit.
 *
 * Writes ONLY this field — deliberately not `updatedAt`, which the profile
 * form uses as its compare-and-set guard: answering the offer must not make
 * the next Save fail as "updated by another session".
 */
export async function markWinterizingOfferAnswered(homeId: string): Promise<ServiceResult<true>> {
  try {
    await setDoc(doc(db, `homes/${homeId}`), { winterizingOfferAnsweredAt: serverTimestamp() }, { merge: true })
    return { data: true, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Couldn't save your answer" } }
  }
}

export async function upsertHomeProfile(
  homeId: string,
  patch: HomeProfileUpsert,
  /**
   * When provided, the update is guarded by a CAS check: the write is only
   * applied if the stored `updated_at` still matches this value.  Pass the
   * `updated_at` that was last read from the DB to prevent silent overwrites
   * from concurrent edits in two tabs or by two home members.
   *
   * Omit (or pass undefined) for initial-creation flows where no row exists
   * yet — the call falls back to a regular upsert.
   */
  knownUpdatedAt?: string,
): Promise<ServiceResult<HomeProfile>> {
  const fields = patchToFields(patch)
  const ref = doc(db, `homes/${homeId}`)

  try {
    // ── CAS update path ──────────────────────────────────────────────────────
    // When the caller knows the current updated_at, a transaction compares the
    // stored timestamp so a concurrent write from another tab/member can't
    // silently win.
    if (knownUpdatedAt !== undefined) {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref)
        const current = snap.exists() ? hpIso(snap.data().updatedAt) : null
        if (current !== knownUpdatedAt) {
          throw new Error(
            "Your home profile was updated by another session. Please refresh and try again."
          )
        }
        tx.set(ref, { ...fields, updatedAt: serverTimestamp() }, { merge: true })
      })
    } else {
      // ── Upsert path (initial creation / onboarding) ──────────────────────────
      await runTransaction(db, async (tx) => {
        tx.set(ref, { ...fields, updatedAt: serverTimestamp() }, { merge: true })
      })
    }

    const snap = await getDoc(ref)
    return { data: toHomeProfile(homeId, snap.data() ?? {}), error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to save home profile" } }
  }
}
