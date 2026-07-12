import { doc, getDoc, runTransaction, serverTimestamp, Timestamp, type DocumentData } from "firebase/firestore"
import { db } from "@/integrations/firebase"
import type { ServiceResult } from "./homeService"

export type HomeType = "house" | "condo" | "townhouse" | "apartment" | "other"
export type Ownership = "own" | "rent"
export type OwnershipDuration = "new_under_1yr" | "1_to_5yr" | "5_plus"
export type PreferredMode = "ask_first" | "inventory_first" | "unset"

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
  home_type: HomeType | null
  ownership: Ownership | null
  ownership_duration: OwnershipDuration | null
  top_concerns: TopConcernKey[]
  preferred_mode: PreferredMode
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
  /** When omitted, caller hasn't finished the flow. Pass `new Date().toISOString()` on completion. */
  completed_at?: string | null
}

// home_profile is folded onto the home doc (firestore-model.md §2).
function hpIso(v: unknown): string | null {
  if (v instanceof Timestamp) return v.toDate().toISOString()
  return typeof v === "string" ? v : null
}
function toHomeProfile(homeId: string, d: DocumentData): HomeProfile {
  return {
    home_id: homeId,
    home_type: (d.homeType ?? null) as HomeType | null,
    ownership: (d.ownership ?? null) as Ownership | null,
    ownership_duration: (d.ownershipDuration ?? null) as OwnershipDuration | null,
    top_concerns: sanitizeTopConcerns(d.topConcerns),
    preferred_mode: (d.preferredMode ?? "unset") as PreferredMode,
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
