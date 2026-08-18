/**
 * runParse — the worker CORE, a plain async function with injected dependencies
 * (Claude call + PDF fetch). This is what the integration test drives directly
 * (Cloud Tasks emulator has gaps; the core does not need it). It writes
 * `parse.stage` on every transition and reaches `done` ONLY after the commit —
 * so the client, which advances to review on `done`, can never land on an empty
 * review (the v1 fire-and-forget bug, killed by construction).
 */
import { Timestamp, type Firestore } from "firebase-admin/firestore"
import { buildPrompt, extractParsedResult } from "../../../../shared/parse/parsePrompt.js"
import { humanizeParseError } from "../../../../shared/parse/parseErrors.js"
import { countPdfPages } from "../../../../shared/parse/pdfShape.js"
import { normalizeChunkRow, normalizeTaskRow, type ParsedChunk, type ParsedTask } from "../../../../shared/parse/parseCore.js"
import { pickParseModel } from "../../../../shared/parse/pickParseModel.js"
import { applyTaskTaxonomy, usageTipToChunk } from "../../../../shared/tasks/taxonomy.js"
import { commitDraft } from "./commitDraft.js"
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
}

export interface RunParseOutcome {
  stage: ParseStage
  stale?: boolean
  summary?: { chunks: number; tasks: number }
  error?: string
}

export async function runParse(db: Firestore, deps: RunParseDeps, input: RunParseInput): Promise<RunParseOutcome> {
  const { homeId, manualId, requestId, mode } = input
  const now = input.now ?? new Date()
  const manualRef = db.doc(`homes/${homeId}/manuals/${manualId}`)

  const setStage = async (stage: ParseStage, extra?: Record<string, unknown>) => {
    await manualRef.set(
      { parse: { stage, stageAt: Timestamp.fromDate(now), ...extra }, updatedAt: Timestamp.fromDate(now) },
      { merge: true }
    )
  }

  let stage: ParseStage = "queued"
  try {
    // ── Claim: ignore stale deliveries (a newer enqueue superseded this one) ──
    const manualSnap = await manualRef.get()
    if (!manualSnap.exists) throw new Error(`manual ${manualId} not found`)
    const claimedRequestId = manualSnap.get("parse.requestId")
    if (claimedRequestId && claimedRequestId !== requestId) {
      return { stage: "queued", stale: true }
    }
    const itemUnitId: string = manualSnap.get("itemUnitId")
    const sourceType: string = manualSnap.get("sourceType")
    const sourceRef: string = manualSnap.get("sourceRef")

    const itemSnap = await db.doc(`homes/${homeId}/items/${itemUnitId}`).get()
    const item: ParseItemFacts = {
      itemUnitId,
      item_category: itemSnap.get("itemCategory") ?? null,
      sub_type: itemSnap.get("subType") ?? null,
      display_name: itemSnap.get("displayName") ?? null,
      model: itemSnap.get("model") ?? null,
      accessories: itemSnap.get("accessories") ?? [],
    }
    const model = pickParseModel(item)

    stage = "started"
    await setStage("started", { requestId, mode, model, attempt: (manualSnap.get("parse.attempt") ?? 0) + 1, error: null })

    // ── Fetch PDF ──
    const pdfBase64 = await deps.fetchPdf(sourceType, sourceRef)
    // How much document we actually got. A cover-page-only upload otherwise
    // produces confident, generic tasks with nothing to distinguish them from
    // manual-derived ones — the review sheet warns off this number. Null when
    // the page tree is compressed and we genuinely cannot tell.
    const pdfPages = countPdfPages(Buffer.from(pdfBase64, "base64"))
    stage = "pdf_fetched"
    await setStage("pdf_fetched", { pdfPages })

    // ── Claude extraction (forced tool + sampling params inside callClaude) ──
    stage = "claude_call"
    await setStage("claude_call")
    const prompt = buildPrompt(item.accessories, undefined, mode === "fill_gaps" ? input.existingTitles : undefined)
    const claudeData = await deps.callClaude({ model, pdfBase64, prompt, existingTitles: input.existingTitles })
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
      // Preview NEVER commits — it writes previewDraft only.
      await manualRef.set(
        {
          previewDraft: { chunks: normChunks, tasks: normTasks, confidence },
          parse: {
            stage: "done",
            stageAt: Timestamp.fromDate(now),
            summary: { chunks: normChunks.length, tasks: normTasks.length, confidence },
          },
          updatedAt: Timestamp.fromDate(now),
        },
        { merge: true }
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

    await manualRef.set(
      {
        parse: {
          stage: "done",
          stageAt: Timestamp.fromDate(now),
          summary: { chunks: res.chunks, tasks: res.tasks, confidence },
        },
        updatedAt: Timestamp.fromDate(now),
      },
      { merge: true }
    )
    return { stage: "done", summary: { chunks: res.chunks, tasks: res.tasks } }
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e)
    // `message` is what the person sees (the client renders it verbatim), so it
    // must be a sentence, never SDK output — a tester once got the Anthropic
    // 400 JSON, request_id included, in a banner. `raw` survives separately as
    // the diagnostic breadcrumb.
    const message = humanizeParseError(raw)
    await manualRef.set(
      {
        parse: {
          stage: "error",
          stageAt: Timestamp.fromDate(now),
          error: { message, raw: raw.slice(0, 500), stage, at: Timestamp.fromDate(now) },
        },
        updatedAt: Timestamp.fromDate(now),
      },
      { merge: true }
    )
    return { stage: "error", error: message }
  }
}
