/**
 * Membership gate for functions that take no homeId (the AI/product helpers).
 * Blocks tokens that belong to NO home — in particular anonymous sign-ins
 * (provider temporarily enabled) minting throwaway uids to burn paid APIs.
 * Functions that DO receive a homeId keep the stricter per-home check
 * (db.doc(`homes/{homeId}/members/{uid}`) — see detectDocType/chatQuery).
 *
 * Requires the members.uid COLLECTION_GROUP fieldOverride in
 * firestore.indexes.json. NOTE: the Firestore EMULATOR does not enforce
 * indexes — a missing index only fails in prod (scripts/ops/prod-smoke.ts is
 * the compensating check).
 */
import { HttpsError } from "firebase-functions/v2/https"
import type { Firestore } from "firebase-admin/firestore"

/** True iff uid has at least one member doc across all homes. */
export async function hasAnyMembership(db: Firestore, uid: string): Promise<boolean> {
  const snap = await db.collectionGroup("members").where("uid", "==", uid).limit(1).get()
  return !snap.empty
}

/** Throws permission-denied unless uid belongs to at least one home. */
export async function requireAnyMembership(db: Firestore, uid: string): Promise<void> {
  if (!(await hasAnyMembership(db, uid))) {
    throw new HttpsError("permission-denied", "Your account isn't a member of any home yet.")
  }
}
