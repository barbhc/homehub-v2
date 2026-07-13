/**
 * checkRecalls — port of v1 check-recalls. Queries the CPSC SaferProducts public
 * REST API for recalls matching an item's brand + model (no AI). Writes the
 * result back onto the item doc (recallStatus / recallNotes / recallCheckedAt).
 *
 * v2 reads homes/{homeId}/items/{itemUnitId} (Admin) after a member check.
 * `queryCpsc` + `buildRecallNotes` + `pickRecallStatus` are the fixture-testable
 * pure helpers; the onCall wrapper binds Firestore + the live CPSC fetch.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https"
import { getFirestore, FieldValue } from "firebase-admin/firestore"

const REGION = "us-central1"

export interface CpscRecall {
  RecallID: number
  RecallNumber: string | null
  RecallDate: string | null
  Title: string | null
  URL: string | null
  Hazards?: Array<{ Name?: string }>
  Remedies?: Array<{ Name?: string }>
}

export function buildRecallNotes(recall: CpscRecall): string {
  return JSON.stringify({
    title: recall.Title ?? null,
    recall_number: recall.RecallNumber ?? null,
    date: recall.RecallDate ?? null,
    url: recall.URL ?? null,
    hazard: recall.Hazards?.[0]?.Name ?? null,
    remedy: recall.Remedies?.[0]?.Name?.split(".")[0] ?? null,
  })
}

type Fetcher = (keywords: string) => Promise<CpscRecall[]>

async function queryCpscLive(keywords: string): Promise<CpscRecall[]> {
  const url = `https://www.saferproducts.gov/RestWebServices/Recall?format=json&Keywords=${encodeURIComponent(keywords)}&RecallDateBegin=2010-01-01`
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) })
  if (!res.ok) return []
  const data = await res.json().catch(() => [])
  if (!Array.isArray(data)) return []
  return (data as CpscRecall[]).filter((r) => r.RecallID > 0 && r.Title && !r.Title.startsWith("Error"))
}

/** Pure core: brand/model → recall status + notes, using the injected fetcher.
 *  Mirrors v1's model-first → brand+prefix → brand-alone fallback ladder. */
export async function runCheckRecalls(
  fetcher: Fetcher,
  brand: string,
  model: string,
): Promise<{ recall_status: "found" | "none_found" | "unknown"; recall_notes: string | null }> {
  const b = brand.trim()
  const m = model.trim()
  if (!b && !m) return { recall_status: "unknown", recall_notes: null }

  let recalls: CpscRecall[] = []
  if (m) recalls = await fetcher(m)
  if (recalls.length === 0 && b && m) recalls = await fetcher(`${b} ${m.slice(0, 7)}`)
  if (recalls.length === 0 && b && m.length <= 4) recalls = await fetcher(b)

  if (recalls.length > 0) return { recall_status: "found", recall_notes: buildRecallNotes(recalls[0]) }
  return { recall_status: "none_found", recall_notes: null }
}

export const checkRecalls = onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.")
  const { homeId, itemUnitId } = (request.data ?? {}) as { homeId?: string; itemUnitId?: string }
  if (!homeId || !itemUnitId) throw new HttpsError("invalid-argument", "homeId and itemUnitId required")

  const db = getFirestore()
  const member = await db.doc(`homes/${homeId}/members/${uid}`).get()
  if (!member.exists) throw new HttpsError("permission-denied", "Not a member of this home")

  const itemRef = db.doc(`homes/${homeId}/items/${itemUnitId}`)
  const item = await itemRef.get()
  if (!item.exists || item.get("deletedAt")) throw new HttpsError("not-found", "Item not found")

  const result = await runCheckRecalls(queryCpscLive, (item.get("brand") as string) ?? "", (item.get("model") as string) ?? "")
  await itemRef.set(
    {
      recallStatus: result.recall_status,
      recallNotes: result.recall_notes,
      recallCheckedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )
  return { ok: true, ...result }
})
