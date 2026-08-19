/**
 * redeemInviteCode — the only thing that may write an admission.
 *
 * The gate itself lives in firestore.rules (creating a home requires an
 * admissions/{uid} doc while config/growth.inviteGateEnabled is true). This is
 * the one path that can produce that doc, and it runs on the Admin SDK so a
 * client cannot mint its own.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https"
import { getFirestore, FieldValue } from "firebase-admin/firestore"
import { decideRedeem, messageFor, normalizeCode, type InviteCodeDoc } from "../../../../shared/growth/inviteCode.js"

const REGION = "us-central1"

export const redeemInviteCode = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.")

  const raw = (request.data as { code?: unknown } | null)?.code
  if (typeof raw !== "string") throw new HttpsError("invalid-argument", "A code is required.")
  const code = normalizeCode(raw)

  const db = getFirestore()
  const admissionRef = db.doc(`admissions/${uid}`)

  // Already in? Say so and consume nothing. Without this, a user who taps twice
  // — or reinstalls — burns a second use of a code that may only have one, and
  // then cannot get in with the code they were legitimately given.
  const existing = await admissionRef.get()
  if (existing.exists) return { ok: true as const, alreadyAdmitted: true as const }

  const codeRef = db.doc(`inviteCodes/${code}`)

  const verdict = await db.runTransaction(async (tx) => {
    const snap = await tx.get(codeRef)
    const doc = snap.exists ? (snap.data() as InviteCodeDoc) : null
    const v = decideRedeem(code, doc, Date.now())
    if (!v.ok) return v

    // Both writes in one transaction: a crash between them either hands out a
    // free admission or silently eats a use, and the second is the one that
    // generates a support email nobody can reproduce.
    tx.set(codeRef, { uses: FieldValue.increment(1), lastUsedAt: FieldValue.serverTimestamp() }, { merge: true })
    tx.set(admissionRef, { code, admittedAt: FieldValue.serverTimestamp() })
    return v
  })

  if (!verdict.ok) {
    // resource-exhausted for a used-up code, so a client can tell "ask for
    // another" apart from "you typed it wrong"; permission-denied otherwise.
    throw new HttpsError(
      verdict.reason === "exhausted" ? "resource-exhausted" : "permission-denied",
      messageFor(verdict.reason),
      { reason: verdict.reason },
    )
  }
  return { ok: true as const, alreadyAdmitted: false as const }
})
