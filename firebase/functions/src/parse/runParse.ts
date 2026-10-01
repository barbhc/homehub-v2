/**
 * runParse — the worker CORE, a plain async function with injected dependencies
 * (Claude call + PDF fetch). This is what the integration test drives directly
 * (Cloud Tasks emulator has gaps; the core does not need it). It writes
 * `parse.stage` on every transition and reaches `done` ONLY after the commit —
 * so the client, which advances to review on `done`, can never land on an empty
 * review (the v1 fire-and-forget bug, killed by construction).
 *
 * ── One run, one result (C2, 2026-09-30) ─────────────────────────────────────
 *
 * A run is identified by its requestId, and it OWNS the manual's `parse` field
 * only while `parse.requestId` is still its own and the stage has not ended.
 * Before this, only the claim checked that — once — and every later stage
 * write was a blind merge without the requestId. So when a second enqueue
 * replaced the requestId mid-run, run 1 kept writing stages under run 2's id:
 * run 1's `done` satisfied run 2's watcher, the review opened on run 1's draft,
 * and run 2 then rewrote `previewDraft` underneath it.
 *
 * Now:
 *   - the claim is a transaction (requestId matches, stage not ended);
 *   - EVERY write after it is a transaction that re-checks ownership and
 *     stamps the requestId (and the real write time in `stageAt`), so a
 *     watcher can always tell whose stage it is reading, and a superseded run
 *     stops at its next write instead of scribbling over the new one;
 *   - the `claude_call` write is that check RIGHT BEFORE the paid call;
 *   - a run that stops before Claude answered is refunded through the
 *     server-only parseCharges ledger (lib/parseCharges.ts);
 *   - a transient failure with a Cloud Tasks attempt left does NOT write
 *     `error` — it parks the run at `queued` for the retry — and anything else
 *     is written once as `error` and never retried (parseWorker).
 */
import { Timestamp, type DocumentSnapshot, type Firestore } from "firebase-admin/firestore"
import { buildPrompt, extractParsedResult } from "../../../../shared/parse/parsePrompt.js"
import { humanizeParseError } from "../../../../shared/parse/parseErrors.js"
import { countPdfPages } from "../../../../shared/parse/pdfShape.js"
import { normalizeChunkRow, normalizeTaskRow, type ParsedChunk, type ParsedTask } from "../../../../shared/parse/parseCore.js"
import { pickParseModel } from "../../../../shared/parse/pickParseModel.js"
import { applyTaskTaxonomy, usageTipToChunk } from "../../../../shared/tasks/taxonomy.js"
import { markParseChargeBilled, markParseChargeVendor, refundParseCharge } from "../lib/parseCharges.js"
import { commitDraft } from "./commitDraft.js"
import { manualSource, MANUAL_SOURCE_UNAVAILABLE } from "./manualSource.js"
import { isTransientParseError } from "./errorClass.js"
import type { CallClaude, FetchPdf, ParseMode, ParseStage, ExtractionResult, ParseItemFacts } from "./parseTypes.js"

export interface RunParseDeps {
  callClaude: CallClaude
  fetchPdf: FetchPdf
}

export interface RunParseInput {
  homeId: string
  manualId: string
  requestId: string
  mode: ParseMode
  /** "today" anchor — injectable for deterministic tests. */
  now?: Date
  existingTitles?: string[]
  /**
   * False only when Cloud Tasks will deliver this run again (parseWorker works
   * it out from the retry count). A transient failure on a non-final attempt
   * waits for that retry; on the final attempt it is written as an error.
   * Defaults to true: a caller that does not say gets the error written.
   */
  finalAttempt?: boolean
}

export interface RunParseOutcome {
  stage: ParseStage
  /** This run no longer owns the manual — a newer request, or the
   *  stalled-parse sweep, took it over — so it stopped without writing. */
  stale?: boolean
  /** A transient failure with an attempt left: the worker must rethrow so
   *  Cloud Tasks retries. */
  retry?: boolean
  /** The run's charge went back to the user (it never got a Claude answer). */
  refunded?: boolean
  summary?: { chunks: number; tasks: number }
  error?: string
}

/** A newer run, or the sweep, owns the manual now. */
class SupersededError extends Error {
  constructor() {
    super("superseded")
    this.name = "SupersededError"
  }
}

/** Does run `requestId` still own this manual's parse state? */
function ownsRun(snap: DocumentSnapshot, requestId: string): boolean {
  if (!snap.exists) return false
  const stage = snap.get("parse.stage")
  return snap.get("parse.requestId") === requestId && stage !== "done" && stage !== "error"
}

export async function runParse(db: Firestore, deps: RunParseDeps, input: RunParseInput): Promise<RunParseOutcome> {
  const { homeId, manualId, requestId, mode } = input
  const now = input.now ?? new Date()
  const finalAttempt = input.finalAttempt ?? true
  const manualRef = db.doc(`homes/${homeId}/manuals/${manualId}`)

  let stage: ParseStage = "queued"
  /** Claude answered: the call was billed, and nothing about this run is
   *  refundable any more. */
  let claudeAnswered = false

  const refundIfUnbilled = async (reason: string): Promise<boolean> =>
    claudeAnswered ? false : refundParseCharge(db, requestId, { from: ["held", "vendor"], reason })

  /** Write only while this run owns the manual. Every write carries the
   *  requestId and the real time of the write. */
  const writeOwned = async (parseFields: Record<string, unknown>, top: Record<string, unknown> = {}) => {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(manualRef)
      if (!ownsRun(snap, requestId)) throw new SupersededError()
      const at = Timestamp.now()
      tx.set(manualRef, { ...top, parse: { ...parseFields, requestId, stageAt: at }, updatedAt: at }, { merge: true })
    })
  }
  const setStage = (s: ParseStage, extra?: Record<string, unknown>) => writeOwned({ stage: s, ...extra })

  try {
    // ── Claim ──────────────────────────────────────────────────────────────
    // Exclusive: the requestId must be ours and the stage not ended. The item
    // is read in the same transaction so the model is known at the claim.
    const claim = await db.runTransaction(async (tx) => {
      const snap = await tx.get(manualRef)
      if (!snap.exists) return { kind: "missing" as const }
      if (snap.get("parse.requestId") !== requestId) return { kind: "stale" as const }
      const current = snap.get("parse.stage") as ParseStage | undefined
      // Ended already: a duplicate delivery, or the stalled-parse sweep wrote
      // this run off — either way it must not run (and flip a shown error back
      // to "reading").
      if (current === "done" || current === "error") return { kind: "finished" as const, stage: current }

      const itemUnitId: string = snap.get("itemUnitId")
      const itemSnap = await tx.get(db.doc(`homes/${homeId}/items/${itemUnitId}`))
      const item: ParseItemFacts = {
        itemUnitId,
        item_category: itemSnap.get("itemCategory") ?? null,
        sub_type: itemSnap.get("subType") ?? null,
        display_name: itemSnap.get("displayName") ?? null,
        model: itemSnap.get("model") ?? null,
        accessories: itemSnap.get("accessories") ?? [],
      }
      const model = pickParseModel(item)
      const at = Timestamp.now()
      tx.set(
        manualRef,
        {
          parse: {
            stage: "started",
            stageAt: at,
            requestId,
            mode,
            model,
            attempt: (snap.get("parse.attempt") ?? 0) + 1,
            error: null,
            retry: null,
          },
          updatedAt: at,
        },
        { merge: true },
      )
      return {
        kind: "claimed" as const,
        item,
        model,
        // Checked, not cast (H3a §3): the manual doc is member-written, and a
        // ref into another home's Storage folder must not be read for this one.
        source: manualSource(homeId, snap.get("sourceType"), snap.get("sourceRef")),
      }
    })

    if (claim.kind === "missing") {
      // Nothing to write to — and writing would CREATE a ghost manual doc,
      // which the old blind merge did.
      const refunded = await refundIfUnbilled("manual deleted")
      return { stage: "error", error: `manual ${manualId} not found`, refunded }
    }
    if (claim.kind === "stale") {
      // A newer request replaced this one before it started: it did nothing,
      // so its charge goes back. (Idempotent — the ledger allows one refund.)
      return { stage: "queued", stale: true, refunded: await refundIfUnbilled("superseded before start") }
    }
    if (claim.kind === "finished") return { stage: claim.stage, stale: true }

    const { item, model, source } = claim
    stage = "started"

    // ── Fetch PDF ──
    // No usable source: a plain (non-transient) error, unbilled and refunded
    // like any failure before the Claude call; the sentence is what the person sees.
    if (!source) throw new Error(MANUAL_SOURCE_UNAVAILABLE)
    const pdfBase64 = await deps.fetchPdf(source.sourceType, source.sourceRef)
    // How much document we actually got. A cover-page-only upload otherwise
    // produces confident, generic tasks with nothing to distinguish them from
    // manual-derived ones — the review sheet warns off this number. Null when
    // the page tree is compressed and we genuinely cannot tell.
    const pdfPages = countPdfPages(Buffer.from(pdfBase64, "base64"))
    stage = "pdf_fetched"
    await setStage("pdf_fetched", { pdfPages })

    // ── Claude extraction (forced tool + sampling params inside callClaude) ──
    // This write is the ownership check RIGHT BEFORE the paid call: a run
    // superseded while it was downloading stops here, unbilled.
    stage = "claude_call"
    await setStage("claude_call")
    // From here only this worker may refund the charge (the sweep refunds
    // `held` only). If the sweep has already written this run off, stop.
    if ((await markParseChargeVendor(db, requestId)) === "refunded") throw new SupersededError()
    const prompt = buildPrompt(item.accessories, undefined, mode === "fill_gaps" ? input.existingTitles : undefined)
    const claudeData = await deps.callClaude({ model, pdfBase64, prompt, existingTitles: input.existingTitles })
    claudeAnswered = true
    await markParseChargeBilled(db, requestId)
    stage = "claude_responded"
    await setStage("claude_responded")

    const result = extractParsedResult(claudeData) as ExtractionResult
    // Commitable-draft guard (invariant 5): real extraction arrays required.
    if (!result || !Array.isArray(result.chunks) || !Array.isArray(result.tasks)) {
      throw new Error("malformed extraction: chunks/tasks not arrays")
    }
    const rawChunks = (result.chunks as ParsedChunk[]).map((c) => normalizeChunkRow(c, manualId))
    const rawTasks = (result.tasks as ParsedTask[]).map((t) => normalizeTaskRow(t))

    // ── Taxonomy (deterministic curation) ───────────────────────────────────
    // Runs HERE, at normalization, not in commitDraft: the preview draft must
    // show the user the same curated list that would be committed, and rows the
    // user then edits in the review sheet must NOT be re-classified behind their
    // back (commitManualDraft commits reviewed rows as-is). Operational steps
    // ("Add Detergent", "Replace Water in the Tank") leave the task set and come
    // back as usage-tip chunks, so the advice survives without a reminder.
    // House rules still apply after this, inside commitDraft — a user's learned
    // rule outranks the taxonomy's default.
    const taxonomy = applyTaskTaxonomy(rawTasks)
    const normTasks = taxonomy.tasks
    const normChunks = [
      ...rawChunks,
      ...taxonomy.tips.map((tip) => normalizeChunkRow(usageTipToChunk(tip) as ParsedChunk, manualId)),
    ]
    const confidence = result.confidence ?? null

    if (mode === "preview") {
      // Preview NEVER commits — it writes previewDraft only, and only if this
      // run still owns the manual (a superseded run must not replace the
      // newer run's draft).
      await writeOwned(
        { stage: "done", summary: { chunks: normChunks.length, tasks: normTasks.length, confidence } },
        { previewDraft: { chunks: normChunks, tasks: normTasks, confidence } },
      )
      return { stage: "done", summary: { chunks: normChunks.length, tasks: normTasks.length } }
    }

    // ── Commit (commit | fill_gaps) ──
    stage = "committing"
    await setStage("committing")
    const res = await commitDraft(db, {
      homeId,
      manualId,
      item,
      requestId,
      chunks: normChunks,
      tasks: normTasks,
      now,
    })

    await writeOwned({
      stage: "done",
      // `inserted` and `duplicatesSkipped` ride along so the client can tell
      // the user what a rescan actually DID. A commit that changes the
      // user's home and reports nothing is the silent-write problem in a
      // smaller costume.
      summary: {
        chunks: res.chunks,
        tasks: res.tasks,
        inserted: res.inserted,
        duplicatesSkipped: res.duplicatesSkipped ?? 0,
        confidence,
      },
    })
    return { stage: "done", summary: { chunks: res.chunks, tasks: res.tasks } }
  } catch (e) {
    if (e instanceof SupersededError) {
      console.info(`[runParse] ${homeId}/${manualId}: run ${requestId} was superseded at ${stage}; stopping`)
      return { stage, stale: true, refunded: await refundIfUnbilled(`superseded at ${stage}`) }
    }

    const raw = e instanceof Error ? e.message : String(e)
    // `message` is what the person sees (the client renders it verbatim), so it
    // must be a sentence, never SDK output — a tester once got the Anthropic
    // 400 JSON, request_id included, in a banner. `raw` survives separately as
    // the diagnostic breadcrumb.
    const message = humanizeParseError(raw)

    if (!finalAttempt && isTransientParseError(e)) {
      // Worth another attempt, and Cloud Tasks has one. Do NOT write `error`:
      // the client would show a failure that the retry then contradicts. The
      // run goes back to `queued` — honest: it is waiting for its retry.
      try {
        await writeOwned({ stage: "queued", retry: { afterStage: stage, reason: raw.slice(0, 300), at: Timestamp.now() } })
      } catch (w) {
        if (w instanceof SupersededError) return { stage, stale: true, refunded: await refundIfUnbilled(`superseded at ${stage}`) }
        console.error(`[runParse] ${homeId}/${manualId}: could not record the retry for ${requestId}:`, w)
      }
      console.warn(`[runParse] ${homeId}/${manualId}: transient failure at ${stage} (${raw.slice(0, 200)}); Cloud Tasks will retry`)
      return { stage: "queued", retry: true, error: message }
    }

    try {
      await writeOwned({ stage: "error", error: { message, raw: raw.slice(0, 500), stage, at: Timestamp.now() } })
    } catch (w) {
      if (w instanceof SupersededError) return { stage, stale: true, refunded: await refundIfUnbilled(`superseded at ${stage}`) }
      // The failure could not even be recorded. Logged; the stalled-parse
      // sweep turns the stuck stage into an error within the hour.
      console.error(`[runParse] ${homeId}/${manualId}: could not record the error for ${requestId}:`, w)
    }
    return { stage: "error", error: message, refunded: await refundIfUnbilled(`failed at ${stage}`) }
  }
}
