import { supabase } from "@/integrations/shim/client"
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

export async function getHomeProfile(homeId: string): Promise<ServiceResult<HomeProfile | null>> {
  // Typed as unknown table until supabase types are regenerated; cast narrowly.
  const { data, error } = await (supabase as unknown as {
    from: (name: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{ data: HomeProfile | null; error: { message: string } | null }>
        }
      }
    }
  })
    .from("home_profile")
    .select("*")
    .eq("home_id", homeId)
    .maybeSingle()

  if (error) return { data: null, error: { message: error.message } }
  return { data: data ?? null, error: null }
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
  // Defense in depth: strip any unknown keys before they reach Postgres.
  // The DB CHECK constraint is the final guard, but cleaning here gives a
  // better error path (silent normalization vs a 500 from an RLS violation).
  const cleaned: HomeProfileUpsert = {
    ...patch,
    ...(patch.top_concerns !== undefined
      ? { top_concerns: sanitizeTopConcerns(patch.top_concerns) }
      : {}),
  }

  // ── CAS update path ────────────────────────────────────────────────────────
  // When the caller knows the current updated_at, use a conditional UPDATE so
  // a concurrent write from another tab/member doesn't silently win.
  if (knownUpdatedAt !== undefined) {
    const updatePayload = {
      ...cleaned,
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await (supabase as unknown as {
      from: (name: string) => {
        update: (row: Record<string, unknown>) => {
          eq: (col: string, val: string) => {
            eq: (col: string, val: string) => {
              select: (cols: string) => {
                maybeSingle: () => Promise<{
                  data: HomeProfile | null
                  error: { message: string } | null
                }>
              }
            }
          }
        }
      }
    })
      .from("home_profile")
      .update(updatePayload as Record<string, unknown>)
      .eq("home_id", homeId)
      .eq("updated_at", knownUpdatedAt)
      .select("*")
      .maybeSingle()

    if (error) return { data: null, error: { message: error.message } }
    if (!data) {
      // 0 rows matched — another write landed between our fetch and this save.
      return {
        data: null,
        error: {
          message:
            "Your home profile was updated by another session. " +
            "Please refresh and try again.",
        },
      }
    }
    return { data, error: null }
  }

  // ── Upsert path (initial creation / onboarding) ────────────────────────────
  const payload = { home_id: homeId, ...cleaned }
  const { data, error } = await (supabase as unknown as {
    from: (name: string) => {
      upsert: (
        row: Record<string, unknown>,
        opts: { onConflict: string },
      ) => {
        select: (cols: string) => {
          single: () => Promise<{ data: HomeProfile | null; error: { message: string } | null }>
        }
      }
    }
  })
    .from("home_profile")
    .upsert(payload as Record<string, unknown>, { onConflict: "home_id" })
    .select("*")
    .single()

  if (error || !data) {
    return { data: null, error: { message: error?.message ?? "Failed to save home profile" } }
  }
  return { data, error: null }
}
