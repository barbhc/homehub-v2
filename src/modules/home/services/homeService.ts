import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
  Timestamp,
  type DocumentData,
} from "firebase/firestore"
import { db, auth } from "@/integrations/firebase"
import type { Home, Room } from "@/integrations/types"

export type ServiceResult<T> =
  | { data: T; error: null }
  | { data: null; error: { message: string } }

const DEFAULT_ROOMS = [
  "Kitchen",
  "Bathroom",
  "Laundry Room",
  "Garage",
  "Living Room",
  "Bedroom",
  "Basement",
  "Outdoor/Yard",
  "Utility Room",
]

// ── Edge mappers: Firestore camelCase → the curated snake_case types the
//    components consume (firestore-model.md §0; instants → ISO strings). ──
function iso(v: unknown): string {
  if (v instanceof Timestamp) return v.toDate().toISOString()
  return typeof v === "string" ? v : ""
}
function isoOrNull(v: unknown): string | null {
  return v == null ? null : iso(v)
}
function toHome(id: string, d: DocumentData): Home {
  return {
    home_id: id,
    name: d.name ?? "",
    timezone: d.timezone ?? "America/Los_Angeles",
    created_at: iso(d.createdAt),
    updated_at: iso(d.updatedAt),
    deleted_at: isoOrNull(d.deletedAt),
  }
}
function toRoom(id: string, homeId: string, d: DocumentData): Room {
  return {
    room_id: id,
    home_id: homeId,
    name: d.name ?? "",
    created_at: iso(d.createdAt),
    updated_at: iso(d.updatedAt),
    deleted_at: isoOrNull(d.deletedAt),
  }
}

function err(e: unknown): { data: null; error: { message: string } } {
  return { data: null, error: { message: e instanceof Error ? e.message : "Request failed" } }
}

export type CreateHomeInput = {
  name: string
  timezone?: string
  userId: string
  /** Defaults to true (the first home). An ADDITIONAL home must pass false —
   *  two memberships both flagged primary make "which home is primary" depend on
   *  iteration order, which is how a switcher silently lands on the wrong one. */
  isPrimary?: boolean
}
export type CreateHomeResult =
  | { data: { homeId: string }; error: null }
  | { data: null; error: { message: string } }

/** Creates a home, adds the user as owner, and seeds default rooms. */
export async function createHome(input: CreateHomeInput): Promise<CreateHomeResult> {
  try {
    const homeRef = doc(collection(db, "homes"))
    // Batch 1: home + membership. Rooms must wait — the rules gate room writes on
    // isMember(homeId), which only becomes true once the member doc is committed.
    const b1 = writeBatch(db)
    b1.set(homeRef, {
      name: input.name,
      timezone: input.timezone ?? "America/Los_Angeles",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      deletedAt: null,
    })
    b1.set(doc(db, `homes/${homeRef.id}/members/${input.userId}`), {
      uid: input.userId,
      role: "owner",
      isPrimary: input.isPrimary ?? true,
      joinedAt: serverTimestamp(),
    })
    await b1.commit()

    // Batch 2: default rooms (now that membership exists).
    const b2 = writeBatch(db)
    for (const name of DEFAULT_ROOMS) {
      b2.set(doc(collection(db, `homes/${homeRef.id}/rooms`)), {
        name,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        deletedAt: null,
      })
    }
    await b2.commit()

    return { data: { homeId: homeRef.id }, error: null }
  } catch (e) {
    return err(e)
  }
}

/** The homeIds the current user belongs to (via their membership docs). */
async function myMemberships(): Promise<{
  rows: { homeId: string; isPrimary: boolean }[]
  /** True when Firestore answered from its LOCAL cache rather than the server. */
  fromCache: boolean
}> {
  const uid = auth.currentUser?.uid
  if (!uid) return { rows: [], fromCache: false }
  // collectionGroup queries need a fieldOverride in firestore.indexes.json
  // (members.uid, COLLECTION_GROUP scope). The EMULATOR does not enforce
  // indexes — a missing one fails only in prod; scripts/ops/prod-smoke.ts checks.
  const snap = await getDocs(query(collectionGroup(db, "members"), where("uid", "==", uid)))
  const rows = snap.docs
    .map((d) => {
      const homeId = d.ref.parent.parent?.id
      return homeId ? { homeId, isPrimary: !!d.get("isPrimary") } : null
    })
    .filter((m): m is { homeId: string; isPrimary: boolean } => m !== null)
  return { rows, fromCache: snap.metadata.fromCache }
}

export type MyHomes = { homes: Home[]; primaryHomeId: string | null }

/**
 * Every home the user belongs to, plus which one is flagged primary.
 *
 * This exists rather than reusing `getHomes()` for two reasons, both of which
 * have bitten before:
 *
 *  · `getHomes` has NO `fromCache` guard. Offline, a collectionGroup query
 *    resolves EMPTY from Firestore's local cache without throwing, so "we
 *    couldn't reach the server" and "you belong to no home" arrive looking
 *    identical — and the second one routes to onboarding and invites the user to
 *    create a home they already own. That is the duplicate-home incident. The
 *    guard below is the same one `getPrimaryHome` carries.
 *  · `getHomes` fetches the home docs SEQUENTIALLY. `getPrimaryHome` was once
 *    the slowest step of the whole boot (729ms, two round trips); fanning the
 *    doc reads out with Promise.all keeps this at the same two sequential
 *    stages no matter how many homes the user has.
 *
 * Order: primary first, then oldest — so the switcher reads in the order the
 * user created them.
 */
export async function getMyHomes(): Promise<ServiceResult<MyHomes>> {
  try {
    const { rows: memberships, fromCache } = await myMemberships()
    if (memberships.length === 0) {
      if (fromCache) {
        return { data: null, error: { message: "Couldn't reach the server to find your homes." } }
      }
      return { data: { homes: [], primaryHomeId: null }, error: null }
    }

    const snaps = await Promise.all(memberships.map((m) => getDoc(doc(db, `homes/${m.homeId}`))))
    const primaryIds = new Set(memberships.filter((m) => m.isPrimary).map((m) => m.homeId))

    const homes = snaps.flatMap((snap) => {
      const data = snap.data()
      if (!snap.exists() || !data || snap.get("deletedAt") != null) return []
      return [toHome(snap.id, data)]
    })

    // Oldest first, then float the primary to the top. Sorting by createdAt
    // BEFORE picking the primary makes the tie-break deterministic when two
    // memberships are both flagged primary (data created before isPrimary was
    // passed correctly): the older home wins.
    homes.sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))
    const primaryHomeId = homes.find((h) => primaryIds.has(h.home_id))?.home_id ?? null
    homes.sort((a, b) => Number(b.home_id === primaryHomeId) - Number(a.home_id === primaryHomeId))

    return { data: { homes, primaryHomeId }, error: null }
  } catch (e) {
    return err(e)
  }
}

/** Fetches homes the user belongs to. */
export async function getHomes(): Promise<ServiceResult<Home[]>> {
  try {
    const { rows: memberships } = await myMemberships()
    const homes: Home[] = []
    for (const m of memberships) {
      const snap = await getDoc(doc(db, `homes/${m.homeId}`))
      if (snap.exists() && snap.get("deletedAt") == null) homes.push(toHome(snap.id, snap.data()))
    }
    homes.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    return { data: homes, error: null }
  } catch (e) {
    return err(e)
  }
}

/** Fetches the user's primary (or first) home. */
export async function getPrimaryHome(): Promise<ServiceResult<Home | null>> {
  try {
    const { rows: memberships, fromCache } = await myMemberships()
    if (memberships.length === 0) {
      // An EMPTY answer that came from Firestore's local cache is not evidence
      // of anything. Offline, getDocs resolves from cache without throwing, so
      // "we couldn't reach the server" and "you have no home" arrive looking
      // identical — and the second one routes to onboarding and invites the
      // user to create a home they already own. That is the duplicate-home
      // incident's exact shape, reached by a different road. Report it as the
      // failure it is; only a SERVER-confirmed empty list means "no home".
      if (fromCache) {
        return { data: null, error: { message: "Couldn't reach the server to find your home." } }
      }
      return { data: null, error: null }
    }
    const chosen = memberships.find((m) => m.isPrimary) ?? memberships[0]
    const snap = await getDoc(doc(db, `homes/${chosen.homeId}`))
    if (!snap.exists() || snap.get("deletedAt") != null) return { data: null, error: null }
    return { data: toHome(snap.id, snap.data()), error: null }
  } catch (e) {
    return err(e)
  }
}

/** Fetches a single home by id. */
export async function getHome(homeId: string): Promise<ServiceResult<Home | null>> {
  try {
    const snap = await getDoc(doc(db, `homes/${homeId}`))
    if (!snap.exists() || snap.get("deletedAt") != null) return { data: null, error: null }
    return { data: toHome(snap.id, snap.data()), error: null }
  } catch (e) {
    return err(e)
  }
}

/** Fetches rooms for a home. */
export async function getRooms(homeId: string): Promise<ServiceResult<Room[]>> {
  try {
    const snap = await getDocs(
      query(collection(db, `homes/${homeId}/rooms`), where("deletedAt", "==", null), orderBy("name"))
    )
    return { data: snap.docs.map((d) => toRoom(d.id, homeId, d.data())), error: null }
  } catch (e) {
    return err(e)
  }
}

export type CreateRoomInput = { home_id: string; name: string }

/** Creates a room. */
export async function createRoom(input: CreateRoomInput): Promise<ServiceResult<Room>> {
  try {
    const ref = doc(collection(db, `homes/${input.home_id}/rooms`))
    await writeBatch(db)
      .set(ref, { name: input.name, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), deletedAt: null })
      .commit()
    const snap = await getDoc(ref)
    return { data: toRoom(ref.id, input.home_id, snap.data() ?? {}), error: null }
  } catch (e) {
    return err(e)
  }
}

/** Renames a room. */
export async function renameRoom(homeId: string, roomId: string, name: string): Promise<ServiceResult<Room>> {
  try {
    const ref = doc(db, `homes/${homeId}/rooms/${roomId}`)
    await writeBatch(db).set(ref, { name, updatedAt: serverTimestamp() }, { merge: true }).commit()
    const snap = await getDoc(ref)
    return { data: toRoom(ref.id, homeId, snap.data() ?? {}), error: null }
  } catch (e) {
    return err(e)
  }
}

/** Soft-deletes a room and nullifies roomId on related records. */
export async function deleteRoom(homeId: string, roomId: string): Promise<ServiceResult<true>> {
  try {
    const now = serverTimestamp()
    const batch = writeBatch(db)
    batch.set(doc(db, `homes/${homeId}/rooms/${roomId}`), { deletedAt: now, updatedAt: now }, { merge: true })

    // Nullify roomId on related subcollections within the home.
    for (const col of ["items", "taskTemplates", "cleaningSessions", "careNotes"]) {
      const rel = await getDocs(query(collection(db, `homes/${homeId}/${col}`), where("roomId", "==", roomId)))
      for (const d of rel.docs) batch.set(d.ref, { roomId: null, updatedAt: now }, { merge: true })
    }
    await batch.commit()
    return { data: true, error: null }
  } catch (e) {
    return err(e)
  }
}
