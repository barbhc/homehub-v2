import useSWR from "swr"
import { collection, collectionGroup, doc, getDoc, getDocs, query, where } from "firebase/firestore"
import { db } from "@/integrations/firebase"
import { useCurrentHome } from "@/modules/home"
import { useAuth } from "@/modules/auth"
import { useInterfaceOverride, type InterfaceOverride } from "@/lib/interfaceLevel"

/**
 * Progressive-complexity level (Phase A — derived only, no override yet).
 *
 * Drives staged feature reveal so a basic user isn't overwhelmed while the app
 * unlocks depth as their home grows. This is the "relevant/useful/timely"
 * principle applied to *features*. Distinct from paid entitlement (a future
 * Free/Pro axis) — level is always free.
 *
 *  - essentials: brand-new / minimal — calm, reduced surface
 *  - engaged: actively using it — full tasks, filters, Fix, Deep Clean
 *  - power: enthusiast / landlord / multi-home — bulk ops, admin tools
 */
export type UserLevel = "essentials" | "engaged" | "power"

export interface LevelSignals {
  itemCount: number
  homeCount: number
  profileCompleted: boolean
}

/** Pure level derivation (unit-tested). Thresholds are intentionally conservative. */
export function deriveUserLevel(s: LevelSignals): UserLevel {
  if (s.homeCount > 1 || s.itemCount >= 15) return "power"
  if (s.itemCount >= 3 && s.profileCompleted) return "engaged"
  return "essentials"
}

/** Apply the user's interface override on top of the derived level. */
export function applyOverride(derived: UserLevel, override: InterfaceOverride): UserLevel {
  if (override === "simple") return "essentials"
  if (override === "advanced") return "power"
  return derived
}

async function fetchSignals(homeId: string, userId: string): Promise<LevelSignals> {
  const [itemsSnap, membersSnap, homeSnap] = await Promise.all([
    getDocs(query(collection(db, `homes/${homeId}/items`), where("deletedAt", "==", null))),
    // Needs the members.uid COLLECTION_GROUP fieldOverride (firestore.indexes.json);
    // the emulator does not enforce indexes — prod-smoke.ts is the check.
    getDocs(query(collectionGroup(db, "members"), where("uid", "==", userId))),
    getDoc(doc(db, `homes/${homeId}`)),
  ])
  return {
    itemCount: itemsSnap.size,
    homeCount: membersSnap.size,
    // home_profile.completed_at is folded onto the home doc as profileCompletedAt.
    profileCompleted: homeSnap.get("profileCompletedAt") != null,
  }
}

/**
 * Returns the current user's progressive-complexity level.
 *
 * Defaults to "engaged" while loading so existing/power users never flash the
 * reduced (Essentials) surface; a brand-new user may briefly see the fuller UI
 * before it collapses, which is harmless (they haven't navigated yet).
 */
export function useUserLevel(): {
  /** Effective level for gating (derived + override). */
  level: UserLevel
  /** Auto-derived level, ignoring the override; null until signals load. Used
   *  for the unlock banner so forcing "simple" doesn't suppress real progress. */
  derivedLevel: UserLevel | null
  isLoading: boolean
} {
  const { home } = useCurrentHome()
  const { user } = useAuth()
  const homeId = home?.home_id
  const userId = user?.id
  const override = useInterfaceOverride()

  const { data, isLoading } = useSWR(
    homeId && userId ? `user-level:${homeId}:${userId}` : null,
    () => fetchSignals(homeId!, userId!),
    { revalidateOnFocus: false, dedupingInterval: 30_000 }
  )

  const derivedLevel = data ? deriveUserLevel(data) : null
  // Default to "engaged" while loading so existing/power users never flash the
  // reduced surface; the override always wins once set.
  return { level: applyOverride(derivedLevel ?? "engaged", override), derivedLevel, isLoading }
}
