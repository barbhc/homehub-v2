/**
 * Invite + member management callables (docs/firestore-model.md §Divergences:
 * "invite acceptance is trust-the-flow in rules, validated in a callable").
 *
 * Both run server-side with the Admin SDK because the security rules can't
 * express them: a new member can't write their own membership doc via a rule
 * that validates the invite token/expiry, and the last-owner guard needs a
 * doc COUNT that rules can't do. The rules delegate these guards here.
 *
 * `runAcceptInvite` / `runRemoveMember` are the plain, emulator-testable cores.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https"
import {
  getFirestore,
  FieldValue,
  Timestamp,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
} from "firebase-admin/firestore"
import { effectiveInviteRole } from "../../../../shared/home/roles.js"

const REGION = "us-central1"

export interface AcceptInviteResult {
  success: boolean
  home_id?: string
  home_name?: string
  role?: string
  error?: string
}

/** A uid usable as ONE path segment, or null. createdBy on invites written
 *  before the rules pinned it to the caller can hold anything, and a string
 *  with a slash would address a different document. */
function uidSegment(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && !value.includes("/") ? value : null
}

/** The role an invite confers, judged by its creator's role RIGHT NOW (see
 *  shared/home/roles.ts effectiveInviteRole). Reads through `read` so the
 *  accept path can run it inside its transaction. */
async function inviteRoleFor(
  db: Firestore,
  homeId: string,
  inv: DocumentData,
  read: (ref: DocumentReference) => Promise<DocumentSnapshot>
): Promise<string> {
  const creator = uidSegment(inv.createdBy)
  const creatorRole = creator ? (await read(db.doc(`homes/${homeId}/members/${creator}`))).get("role") : null
  return effectiveInviteRole(inv.role, creatorRole)
}

/** Accepts an invite by token: validates it, creates the caller's member doc,
 *  and marks the invite accepted — in one transaction. Returns a result object
 *  (expected validation failures come back as { success:false, error }). */
export async function runAcceptInvite(db: Firestore, uid: string, token: string): Promise<AcceptInviteResult> {
  const snap = await db.collectionGroup("invites").where("token", "==", token).limit(1).get()
  const inviteDoc = snap.docs[0]
  if (!inviteDoc) return { success: false, error: "This invite link is invalid or has been revoked." }

  const homeId = inviteDoc.ref.parent.parent?.id
  if (!homeId) return { success: false, error: "This invite link is invalid." }
  const memberRef = db.doc(`homes/${homeId}/members/${uid}`)

  // One transaction, so the checks and the writes see the same state: two
  // people cannot both spend one invite, and a member row cannot appear between
  // "not a member yet" and the create.
  const outcome = await db.runTransaction(async (tx): Promise<AcceptInviteResult> => {
    const [invite, existing] = await Promise.all([tx.get(inviteDoc.ref), tx.get(memberRef)])
    const inv = invite.data()
    if (!inv) return { success: false, error: "This invite link is invalid or has been revoked." }
    if (inv.acceptedBy) return { success: false, error: "This invite has already been used." }
    const expiresAt = inv.expiresAt as Timestamp | undefined
    if (expiresAt && expiresAt.toMillis() < Date.now()) {
      return { success: false, error: "This invite link has expired." }
    }

    // Already in this home: refuse, and write NOTHING. This used to set() the
    // member doc with merge:true, so accepting RE-ROLED an existing member. A
    // member who wrote themselves an owner invite could accept it with the same
    // account and come out owner; an owner who opened their own link came out
    // "admin" — and if they were the only owner, the home was left with none.
    if (existing.exists) return { success: false, error: "You're already a member of this home." }

    const role = await inviteRoleFor(db, homeId, inv, (ref) => tx.get(ref))
    // create(), not set(): if a row somehow exists by commit time, fail rather
    // than overwrite it.
    tx.create(memberRef, { uid, role, isPrimary: false, joinedAt: FieldValue.serverTimestamp() })
    tx.update(inviteDoc.ref, { acceptedBy: uid, acceptedAt: FieldValue.serverTimestamp() })
    return { success: true, home_id: homeId, role }
  })
  if (!outcome.success) return outcome

  const home = await db.doc(`homes/${homeId}`).get()
  return { ...outcome, home_name: (home.get("name") as string) ?? "" }
}

export interface InviteDetailsResult {
  found: boolean
  home_id?: string
  home_name?: string
  role?: string
  expires_at?: string
  accepted?: boolean
  creator_name?: string | null
  /** The caller is already a member of this home (accepting would be refused). */
  already_member?: boolean
}

/** Read-only, sanitized invite lookup for the accept page. The accepter is not a
 *  member yet, so the members-only invites read rule denies a client query — this
 *  runs server-side (Admin SDK) instead. Auth-gated, keyed on the unguessable
 *  token; returns only what the page shows (never the accepter uid or raw doc).
 *  `role` is what accepting would actually confer, not the stored field. */
export async function runGetInviteDetails(db: Firestore, token: string, uid?: string): Promise<InviteDetailsResult> {
  const snap = await db.collectionGroup("invites").where("token", "==", token).limit(1).get()
  const inviteDoc = snap.docs[0]
  if (!inviteDoc) return { found: false }
  const homeId = inviteDoc.ref.parent.parent?.id
  if (!homeId) return { found: false }
  const inv = inviteDoc.data()

  const creator = uidSegment(inv.createdBy)
  const [home, creatorProfile, role, self] = await Promise.all([
    db.doc(`homes/${homeId}`).get(),
    creator ? db.doc(`users/${creator}`).get() : Promise.resolve(null),
    inviteRoleFor(db, homeId, inv, (ref) => ref.get()),
    uid ? db.doc(`homes/${homeId}/members/${uid}`).get() : Promise.resolve(null),
  ])
  const expiresAt = inv.expiresAt as Timestamp | undefined
  return {
    found: true,
    home_id: homeId,
    home_name: (home.get("name") as string) ?? "",
    role,
    expires_at: expiresAt ? expiresAt.toDate().toISOString() : "",
    accepted: !!inv.acceptedBy,
    creator_name: creatorProfile && creatorProfile.exists ? ((creatorProfile.get("fullName") as string) ?? null) : null,
    already_member: !!self?.exists,
  }
}

export interface RemoveMemberResult {
  success: boolean
  error?: string
}

/** Removes a member. Caller must be the owner, or removing themselves. Enforces
 *  the last-owner guard (an owner can't be removed if they're the only one).
 *  The rules refuse client deletes of an owner's row, so this is the only path
 *  that can remove an owner — and it counts inside a transaction, because two
 *  owners removing each other at the same moment both read "2 owners" outside
 *  one, and the home ended with none. */
export async function runRemoveMember(
  db: Firestore,
  callerUid: string,
  homeId: string,
  userId: string
): Promise<RemoveMemberResult> {
  const callerRef = db.doc(`homes/${homeId}/members/${callerUid}`)
  const targetRef = db.doc(`homes/${homeId}/members/${userId}`)
  const isSelf = callerUid === userId
  return db.runTransaction(async (tx): Promise<RemoveMemberResult> => {
    const caller = await tx.get(callerRef)
    if (!caller.exists) return { success: false, error: "You are not a member of this home." }
    if (!isSelf && caller.get("role") !== "owner") {
      return { success: false, error: "Only the home owner can remove other members." }
    }
    // Self-removal: the caller's row IS the target — one read serves both.
    const target = isSelf ? caller : await tx.get(targetRef)
    if (!target.exists) return { success: true } // already gone — idempotent

    if (target.get("role") === "owner") {
      const owners = await tx.get(db.collection(`homes/${homeId}/members`).where("role", "==", "owner"))
      if (owners.size <= 1) return { success: false, error: "You can't remove the last owner of a home." }
    }

    tx.delete(targetRef)
    return { success: true }
  })
}

export const acceptInvite = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.")
  const { token } = (request.data ?? {}) as { token?: string }
  if (!token) throw new HttpsError("invalid-argument", "token is required.")
  try {
    return await runAcceptInvite(getFirestore(), uid, token)
  } catch (e) {
    throw new HttpsError("internal", e instanceof Error ? e.message : "acceptInvite failed")
  }
})

export const getInviteDetails = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.")
  const { token } = (request.data ?? {}) as { token?: string }
  if (!token) throw new HttpsError("invalid-argument", "token is required.")
  try {
    return await runGetInviteDetails(getFirestore(), token, uid)
  } catch (e) {
    throw new HttpsError("internal", e instanceof Error ? e.message : "getInviteDetails failed")
  }
})

export const removeMember = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.")
  const { homeId, userId } = (request.data ?? {}) as { homeId?: string; userId?: string }
  if (!homeId || !userId) throw new HttpsError("invalid-argument", "homeId and userId are required.")
  try {
    return await runRemoveMember(getFirestore(), uid, homeId, userId)
  } catch (e) {
    throw new HttpsError("internal", e instanceof Error ? e.message : "removeMember failed")
  }
})
