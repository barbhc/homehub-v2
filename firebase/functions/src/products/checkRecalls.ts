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
import { z } from "zod"
import { DocId, parseCallableInput, storedText } from "../lib/validate.js"

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

/** The recall database did not give an answer we can read — which is not "no recalls". */
export class RecallLookupError extends Error {}

const orNull = <T extends z.ZodType>(schema: T) => schema.nullish().transform((v) => v ?? null)
const named = z.array(z.object({ Name: z.string().optional().catch(undefined) })).optional().catch(undefined)
/** One CPSC record, as far as this module reads it. */
const CpscRecallSchema = z.object({
  RecallID: z.number(),
  RecallNumber: orNull(z.string()),
  RecallDate: orNull(z.string()),
  Title: orNull(z.string()),
  URL: orNull(z.string()),
  Hazards: named,
  Remedies: named,
}) satisfies z.ZodType<CpscRecall>

/**
 * The CPSC response body, parsed rather than cast (H3a: external responses
 * are validated at the point of entry). The body must be a JSON array, or the
 * lookup failed; a record without a numeric id is skipped, never guessed at.
 */
export function parseCpscResponse(raw: unknown): CpscRecall[] {
  if (!Array.isArray(raw)) throw new RecallLookupError("CPSC answered with something other than a list")
  const recalls: CpscRecall[] = []
  for (const entry of raw) {
    const r = CpscRecallSchema.safeParse(entry)
    if (r.success) recalls.push(r.data)
  }
  return recalls.filter((r) => r.RecallID > 0 && r.Title && !r.Title.startsWith("Error"))
}

async function queryCpscLive(keywords: string): Promise<CpscRecall[]> {
  const url = `https://www.saferproducts.gov/RestWebServices/Recall?format=json&Keywords=${encodeURIComponent(keywords)}&RecallDateBegin=2010-01-01`
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) })
  // A failed lookup used to read as an empty list, and the item was then
  // stamped "none_found" — a claim nobody had checked. It is a failure now.
  if (!res.ok) throw new RecallLookupError(`CPSC returned HTTP ${res.status}`)
  let body: unknown
  try {
    body = await res.json()
  } catch (e) {
    throw new RecallLookupError(`CPSC returned a body that isn't JSON: ${e instanceof Error ? e.message : String(e)}`)
  }
  return parseCpscResponse(body)
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

export const CheckRecallsRequest = z.object({ homeId: DocId, itemUnitId: DocId })

export const checkRecalls = onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.")
  const { homeId, itemUnitId } = parseCallableInput("checkRecalls", CheckRecallsRequest, request.data, "homeId and itemUnitId required")

  const db = getFirestore()
  const member = await db.doc(`homes/${homeId}/members/${uid}`).get()
  if (!member.exists) throw new HttpsError("permission-denied", "Not a member of this home")

  const itemRef = db.doc(`homes/${homeId}/items/${itemUnitId}`)
  const item = await itemRef.get()
  if (!item.exists || item.get("deletedAt")) throw new HttpsError("not-found", "Item not found")

  let result: Awaited<ReturnType<typeof runCheckRecalls>>
  try {
    // Brand and model are member-written text: anything else reads as blank.
    result = await runCheckRecalls(queryCpscLive, storedText(item.get("brand")) ?? "", storedText(item.get("model")) ?? "")
  } catch (e) {
    // Nothing is written: the item keeps whatever it last knew.
    console.warn(`[checkRecalls] lookup failed for ${homeId}/${itemUnitId}:`, e instanceof Error ? e.message : e)
    throw new HttpsError("unavailable", "The recall database didn't answer. Try again in a little while.")
  }
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
