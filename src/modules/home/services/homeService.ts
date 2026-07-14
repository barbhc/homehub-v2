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

export type CreateHomeInput = { name: string; timezone?: string; userId: string }
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
      isPrimary: true,
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
async function myMemberships(): Promise<{ homeId: string; isPrimary: boolean }[]> {
  const uid = auth.currentUser?.uid
  if (!uid) return []
  // collectionGroup queries need a fieldOverride in firestore.indexes.json
  // (members.uid, COLLECTION_GROUP scope). The EMULATOR does not enforce
  // indexes — a missing one fails only in prod; scripts/ops/prod-smoke.ts checks.
  const snap = await getDocs(query(collectionGroup(db, "members"), where("uid", "==", uid)))
  return snap.docs
    .map((d) => {
      const homeId = d.ref.parent.parent?.id
      return homeId ? { homeId, isPrimary: !!d.get("isPrimary") } : null
    })
    .filter((m): m is { homeId: string; isPrimary: boolean } => m !== null)
}

/** Fetches homes the user belongs to. */
export async function getHomes(): Promise<ServiceResult<Home[]>> {
  try {
    const memberships = await myMemberships()
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
    const memberships = await myMemberships()
    if (memberships.length === 0) return { data: null, error: null }
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
