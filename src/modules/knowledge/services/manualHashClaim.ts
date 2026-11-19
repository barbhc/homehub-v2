import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  type DocumentData,
  type Firestore,
} from "firebase/firestore"

/**
 * One claim per (item, file content): `homes/{homeId}/manualHashes/{claimId}`.
 *
 * Codex review 2026-10-29, finding 4. createManualDocument deduped an upload by
 * QUERYING for a live manual with the same content hash, then creating one in
 * an independent write. Two adds of the same PDF to the same item close
 * together — two tabs, two household members — both read "no twin" and both
 * created, so the item showed the manual twice and both copies started a paid
 * read. A transaction cannot run that query, but it can read one document whose
 * id IS the question: this claim. Read-then-write inside one transaction, so
 * exactly one of two simultaneous adds creates the manual; the other is retried
 * by Firestore, sees the claim, and gets the manual the first one made.
 *
 * Removing a manual stays a soft delete: a claim whose manual is gone or
 * removed is stale, and the next add of that file takes it over with a new
 * manual. The removed one keeps its chunks, exactly as before — every reader
 * of chunks (Ask, the item page, the knowledge views) already skips a removed
 * manual's.
 *
 * Imports nothing app-specific so the rules suite can drive it against the
 * emulator with a real concurrent pair (firebase/rules.test.ts).
 */
export function manualHashClaimId(itemUnitId: string, contentHash: string): string {
  return `${itemUnitId}_${contentHash}`
}

export type HashClaimOutcome =
  | { kind: "twin"; manualId: string; data: DocumentData }
  | { kind: "created"; manualId: string }

/**
 * Creates the manual described by `fields` and claims (item, hash) for it — or,
 * if a live manual already holds the claim, returns that one and writes
 * nothing. Throws whatever the transaction throws; the caller decides what a
 * failed claim means.
 */
export async function createManualUnderHashClaim(
  db: Firestore,
  homeId: string,
  itemUnitId: string,
  contentHash: string,
  fields: DocumentData,
): Promise<HashClaimOutcome> {
  const claimRef = doc(db, `homes/${homeId}/manualHashes/${manualHashClaimId(itemUnitId, contentHash)}`)
  return runTransaction(db, async (tx): Promise<HashClaimOutcome> => {
    const claim = await tx.get(claimRef)
    const heldBy: unknown = claim.exists() ? claim.get("manualId") : null
    if (typeof heldBy === "string" && heldBy) {
      const held = await tx.get(doc(db, `homes/${homeId}/manuals/${heldBy}`))
      if (held.exists() && held.get("deletedAt") == null && held.get("itemUnitId") === itemUnitId) {
        return { kind: "twin", manualId: held.id, data: held.data() }
      }
    }
    const ref = doc(collection(db, `homes/${homeId}/manuals`))
    tx.set(ref, fields)
    tx.set(claimRef, { manualId: ref.id, itemUnitId, contentHash, claimedAt: serverTimestamp() })
    return { kind: "created", manualId: ref.id }
  })
}
