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
import { getFirestore, FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore"

const REGION = "us-central1"

export interface AcceptInviteResult {
  success: boolean
  home_id?: string
  home_name?: string
  role?: string
  error?: string
}

/** Accepts an invite by token: validates it, creates the caller's member doc,
 *  and marks the invite accepted — in one batch. Returns a result object
 *  (expected validation failures come back as { success:false, error }). */
export async function runAcceptInvite(db: Firestore, uid: string, token: string): Promise<AcceptInviteResult> {
  const snap = await db.collectionGroup("invites").where("token", "==", token).limit(1).get()
  const inviteDoc = snap.docs[0]
  if (!inviteDoc) return { success: false, error: "This invite link is invalid or has been revoked." }

  const homeId = inviteDoc.ref.parent.parent?.id
  if (!homeId) return { success: false, error: "This invite link is invalid." }
  const inv = inviteDoc.data()

  if (inv.acceptedBy) return { success: false, error: "This invite has already been used." }
  const expiresAt = inv.expiresAt as Timestamp | undefined
  if (expiresAt && expiresAt.toMillis() < Date.now()) {
    return { success: false, error: "This invite link has expired." }
  }

  const role: string = inv.role ?? "member"
  const batch = db.batch()
  // uid field is REQUIRED for the collection-group members read rule.
  batch.set(
    db.doc(`homes/${homeId}/members/${uid}`),
    { uid, role, isPrimary: false, joinedAt: FieldValue.serverTimestamp() },
    { merge: true }
  )
  batch.update(inviteDoc.ref, { acceptedBy: uid, acceptedAt: FieldValue.serverTimestamp() })
  await batch.commit()

  const home = await db.doc(`homes/${homeId}`).get()
  return { success: true, home_id: homeId, home_name: (home.get("name") as string) ?? "", role }
}

export interface RemoveMemberResult {
  success: boolean
  error?: string
}

/** Removes a member. Caller must be the owner, or removing themselves. Enforces
 *  the last-owner guard (an owner can't be removed if they're the only one). */
export async function runRemoveMember(
  db: Firestore,
  callerUid: string,
  homeId: string,
  userId: string
): Promise<RemoveMemberResult> {
  const caller = await db.doc(`homes/${homeId}/members/${callerUid}`).get()
  if (!caller.exists) return { success: false, error: "You are not a member of this home." }
  const isSelf = callerUid === userId
  if (!isSelf && caller.get("role") !== "owner") {
    return { success: false, error: "Only the home owner can remove other members." }
  }

  const targetRef = db.doc(`homes/${homeId}/members/${userId}`)
  const target = await targetRef.get()
  if (!target.exists) return { success: true } // already gone — idempotent

  if (target.get("role") === "owner") {
    const owners = await db.collection(`homes/${homeId}/members`).where("role", "==", "owner").get()
    if (owners.size <= 1) return { success: false, error: "You can't remove the last owner of a home." }
  }

  await targetRef.delete()
  return { success: true }
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
