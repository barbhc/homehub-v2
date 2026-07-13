/**
 * commitManualDraft — commits a client-REVIEWED parse draft (the "re-review then
 * save" flow on ItemDetailPage). Replaces v1's save-parsed-manual edge function.
 *
 * The client sends the (possibly user-edited) chunks + tasks in the raw parsed
 * shape (PreviewChunk/PreviewTask ≈ ParsedChunk/ParsedTask). The server re-runs
 * them through the SAME normalizeChunkRow/normalizeTaskRow the worker uses (so
 * enum validation, step derivation, and the denorm set are identical to a fresh
 * parse) and commits via commitDraft — which already seeds recurring instances,
 * so the client never needs a follow-up generateTaskInstances.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https"
import { getFirestore, Timestamp } from "firebase-admin/firestore"
import { normalizeChunkRow, normalizeTaskRow, type ParsedChunk, type ParsedTask } from "../../../../shared/parse/parseCore.js"
import { commitDraft } from "./commitDraft.js"
import type { ParseItemFacts } from "./parseTypes.js"

const REGION = "us-central1"

export const commitManualDraft = onCall({ region: REGION, timeoutSeconds: 120 }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.")
  const { homeId, manualId, chunks, tasks } = (request.data ?? {}) as {
    homeId?: string
    manualId?: string
    chunks?: ParsedChunk[]
    tasks?: ParsedTask[]
  }
  if (!homeId || !manualId) throw new HttpsError("invalid-argument", "homeId and manualId required")
  if (!Array.isArray(chunks) || !Array.isArray(tasks)) {
    throw new HttpsError("invalid-argument", "chunks and tasks arrays required")
  }

  const db = getFirestore()
  const member = await db.doc(`homes/${homeId}/members/${uid}`).get()
  if (!member.exists) throw new HttpsError("permission-denied", "Not a member of this home")

  const manualRef = db.doc(`homes/${homeId}/manuals/${manualId}`)
  const manualSnap = await manualRef.get()
  if (!manualSnap.exists) throw new HttpsError("not-found", "Manual not found")

  const itemUnitId: string = manualSnap.get("itemUnitId")
  const itemSnap = await db.doc(`homes/${homeId}/items/${itemUnitId}`).get()
  const item: ParseItemFacts = {
    itemUnitId,
    item_category: itemSnap.get("itemCategory") ?? null,
    sub_type: itemSnap.get("subType") ?? null,
    display_name: itemSnap.get("displayName") ?? null,
    model: itemSnap.get("model") ?? null,
    accessories: itemSnap.get("accessories") ?? [],
  }

  const normChunks = chunks.map((c) => normalizeChunkRow(c, manualId))
  const normTasks = tasks.map((t) => normalizeTaskRow(t))

  // Fresh requestId per save — a distinct user intent (commitDraft is idempotent
  // per requestId, so a double-click still commits at most once).
  const requestId = `review-${uid}-${Date.now()}`
  const now = new Date()
  let res
  try {
    res = await commitDraft(db, { homeId, manualId, item, requestId, chunks: normChunks, tasks: normTasks, now })
  } catch (e) {
    throw new HttpsError("internal", e instanceof Error ? e.message : "Save failed")
  }

  // Stamp a terminal parse.stage (commitDraft sets committedRequestId/parsedAt but
  // not stage) and clear the consumed previewDraft.
  await manualRef.set(
    {
      previewDraft: null,
      parse: {
        stage: "done",
        stageAt: Timestamp.fromDate(now),
        summary: { chunks: res.chunks, tasks: res.tasks },
      },
      updatedAt: Timestamp.fromDate(now),
    },
    { merge: true },
  )

  return { ok: true, chunks: res.chunks, tasks: res.tasks }
})
