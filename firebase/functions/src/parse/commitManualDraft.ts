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
import { normalizeChunkRow, normalizeTaskRow } from "../../../../shared/parse/parseCore.js"
import { commitDraft } from "./commitDraft.js"
import { parseLastDone } from "../../../../shared/care/lastDone.js"
import { CommitManualDraftRequest } from "./draftSchemas.js"
import { parseCallableInput, storedText } from "../lib/validate.js"
import { storedDocId } from "../lib/storedTask.js"
import type { ParseItemFacts } from "./parseTypes.js"

const REGION = "us-central1"

export const commitManualDraft = onCall({ region: REGION, timeoutSeconds: 120 }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.")
  // Parsed, never cast (H3a): the rows' contract is in draftSchemas.ts.
  const { homeId, manualId, chunks, tasks } = parseCallableInput(
    "commitManualDraft",
    CommitManualDraftRequest,
    request.data,
    "This review couldn't be saved as sent. Reopen it and try again.",
  )

  const db = getFirestore()
  const member = await db.doc(`homes/${homeId}/members/${uid}`).get()
  if (!member.exists) throw new HttpsError("permission-denied", "Not a member of this home")

  const manualRef = db.doc(`homes/${homeId}/manuals/${manualId}`)
  const manualSnap = await manualRef.get()
  if (!manualSnap.exists) throw new HttpsError("not-found", "Manual not found")

  // The manual's item id is stored (member-writable) data that becomes a path
  // and is written onto every task: one segment, or the save stops here. A
  // missing one used to reach the commit as `undefined` and fail as "internal".
  const itemUnitId = storedDocId(manualSnap.get("itemUnitId"))
  if (!itemUnitId) throw new HttpsError("failed-precondition", "This manual isn't attached to an item.")
  const itemSnap = await db.doc(`homes/${homeId}/items/${itemUnitId}`).get()
  const accessories: unknown = itemSnap.get("accessories")
  const item: ParseItemFacts = {
    itemUnitId,
    item_category: storedText(itemSnap.get("itemCategory")),
    sub_type: storedText(itemSnap.get("subType")),
    display_name: storedText(itemSnap.get("displayName")),
    model: storedText(itemSnap.get("model")),
    accessories: Array.isArray(accessories) ? accessories.filter((a): a is string => typeof a === "string") : [],
  }

  const normChunks = chunks.map((c) => normalizeChunkRow(c, manualId))
  // normalizeTaskRow validates the MODEL's output and rebuilds the row from
  // known fields, so anything it doesn't know about is dropped. The reminder
  // switch is the user's decision rather than something the parser produces, so
  // it rides alongside the normalized row instead of being added to parseCore
  // (which stays a verbatim port of v1).
  const todayStr = new Date().toISOString().slice(0, 10)
  const normTasks = tasks.map((t) => ({
    ...normalizeTaskRow(t),
    remind_enabled: t.remind_enabled,
    // Parsed, not cast: this arrives from a form as `unknown`, and a bad anchor
    // would silently mis-schedule the task rather than fail loudly. Anything
    // unusable degrades to null, which is exactly the shipped behaviour
    // (anchor on today) — a malformed date must never cost the whole manual.
    last_done_on: parseLastDone(t.last_done_on, todayStr),
  }))

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
