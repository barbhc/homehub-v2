import { callable, docRef } from "@/integrations/firebase"
import { onSnapshot, getDoc, type Unsubscribe } from "firebase/firestore"
import type { ParseProgressState } from "@/components/smart-add/ParseProgressStep"
import type { PreviewChunk, PreviewResult, PreviewTask } from "../types/previewTypes"

/**
 * Shape returned by the parse-manual edge function under `confidence`.
 * All values are optional because older runs (or future prompt versions)
 * may omit sections — callers must treat `undefined` as "unknown / low
 * confidence" and degrade gracefully, never silently assume 1.0.
 */
export interface ParsedConfidence {
  overall?: number
  safety?: number
  how_to?: number
  care?: number
  troubleshooting?: number
  /** Optional free-form note the parser emits when it hedges. */
  notes?: string
}

export type ParseManualResult =
  | { ok: true; chunks: number; tasks: number; committed?: boolean; draft?: boolean; processing?: boolean; confidence?: ParsedConfidence }
  | { ok: false; error: string; transient?: boolean }

function coerceConfidence(raw: unknown): ParsedConfidence | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const r = raw as Record<string, unknown>
  const pickNumber = (k: string): number | undefined => {
    const v = r[k]
    return typeof v === "number" && Number.isFinite(v) ? v : undefined
  }
  const notes = typeof r.notes === "string" ? r.notes : undefined
  const result: ParsedConfidence = {
    overall: pickNumber("overall"),
    safety: pickNumber("safety"),
    how_to: pickNumber("how_to"),
    care: pickNumber("care"),
    troubleshooting: pickNumber("troubleshooting"),
    notes,
  }
  // Return undefined if nothing usable came through, rather than an empty object.
  const hasAny = Object.values(result).some((v) => v !== undefined)
  return hasAny ? result : undefined
}

// ───────────────────────────────────────────────────────────────────────────
// Firebase-native trust arc (Phase 3.2, fix B). The worker owns the parse in
// Firestore; the client STARTS it (enqueueParse callable) then WATCHES
// `parse.stage` via onSnapshot, advancing the UI to review ONLY on `done` (the
// worker reaches done only after commit → an empty review is impossible). State
// lives in Firestore, so the wizard survives a tab refresh mid-parse.
//
// NOTE (migration state): the surrounding manual-creation + home-context
// services are still on the shim; this arc becomes end-to-end functional once
// Phase 5 lands those on Firebase. The service + mapping are correct now and
// unit-tested (toUiStage); the emulator e2e demonstration is gated on Phase 5.
// ───────────────────────────────────────────────────────────────────────────

/** The worker's Firestore parse.stage values (docs/firestore-model.md §8). */
export type ParseStage =
  | "queued"
  | "started"
  | "pdf_fetched"
  | "claude_call"
  | "claude_responded"
  | "committing"
  | "done"
  | "error"

/** Map a worker stage to the UI progress state (ParseProgressStep). */
export function toUiStage(stage: ParseStage): ParseProgressState {
  switch (stage) {
    case "queued":
      return "queued"
    case "started":
    case "pdf_fetched":
      return "reading"
    case "claude_call":
    case "claude_responded":
      return "extracting"
    case "committing":
      return "saving"
    case "done":
      return "done"
    case "error":
      return "error"
  }
}

export type ParseMode = "commit" | "preview" | "fill_gaps"
export interface StartParseOpts {
  homeId: string
  mode?: ParseMode
}

const enqueueParseCallable = callable<
  { homeId: string; manualId: string; mode: ParseMode },
  { ok: true; requestId: string }
>("enqueueParse")

/** Kick off a parse. Returns the requestId the worker claims; the manual's
 *  parse.stage becomes "queued" immediately. */
export async function startParse(
  manualId: string,
  opts: StartParseOpts
): Promise<{ ok: true; requestId: string } | { ok: false; error: string }> {
  try {
    const res = await enqueueParseCallable({ homeId: opts.homeId, manualId, mode: opts.mode ?? "commit" })
    return { ok: true, requestId: res.requestId }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not start parsing." }
  }
}

interface ManualParseSnapshot {
  stage?: ParseStage
  requestId?: string
  error?: { message?: string } | null
  summary?: { chunks?: number; tasks?: number; confidence?: unknown } | null
}

/** Subscribe to a manual's parse.stage. Returns an unsubscribe fn. */
export function watchParse(
  homeId: string,
  manualId: string,
  onStage: (stage: ParseStage, parse: ManualParseSnapshot) => void
): Unsubscribe {
  return onSnapshot(docRef(`homes/${homeId}/manuals/${manualId}`), (snap) => {
    const data = snap.data() as { parse?: ManualParseSnapshot } | undefined
    const parse = data?.parse
    if (parse?.stage) onStage(parse.stage, parse)
  })
}

/** Start + watch to a terminal state. Resolves on `done` (with real committed
 *  counts) or `error`. `onStage` streams UI progress the whole way. */
export async function parseManualAndWait(
  manualId: string,
  opts: StartParseOpts,
  onStage?: (ui: ParseProgressState) => void
): Promise<ParseManualResult> {
  onStage?.("uploading")
  const started = await startParse(manualId, opts)
  if (!started.ok) {
    onStage?.("error")
    return { ok: false, error: started.error }
  }
  return new Promise<ParseManualResult>((resolve) => {
    let settled = false
    const unsub = watchParse(opts.homeId, manualId, (stage, parse) => {
      // Only react to OUR run — ignore a superseding requestId's transitions.
      if (parse.requestId && parse.requestId !== started.requestId) return
      onStage?.(toUiStage(stage))
      if (settled) return
      if (stage === "done") {
        settled = true
        unsub()
        resolve({
          ok: true,
          chunks: parse.summary?.chunks ?? 0,
          tasks: parse.summary?.tasks ?? 0,
          committed: opts.mode !== "preview",
          confidence: coerceConfidence(parse.summary?.confidence),
        })
      } else if (stage === "error") {
        settled = true
        unsub()
        resolve({ ok: false, error: parse.error?.message ?? "Parse failed" })
      }
    })
  })
}

// ───────────────────────────────────────────────────────────────────────────
// Re-review flow (replaces the v1 preview-manual + save-parsed-manual edge fns).
// previewManualParse runs the worker in PREVIEW mode (writes previewDraft, never
// commits), then reads that draft back as the snake_case PreviewResult the review
// UI edits. commitReviewedDraft sends the user-edited chunks/tasks to the
// commitManualDraft callable, which re-normalizes + commits (seeding instances).
// ───────────────────────────────────────────────────────────────────────────

export type PreviewManualResult = PreviewResult | { ok: false; error: string }

/** The worker's normalized previewDraft is snake_case already; the only rename
 *  the review UI needs is instructions_override → instructions_text. */
function draftToPreview(draft: { chunks?: unknown[]; tasks?: unknown[] }, pdfPages?: number | null): PreviewResult {
  const chunks = (Array.isArray(draft.chunks) ? draft.chunks : []).map((raw) => {
    const c = (raw ?? {}) as Record<string, unknown>
    return {
      chunk_type: c.chunk_type,
      title: (c.title ?? null) as string | null,
      content: String(c.content ?? ""),
      tags: Array.isArray(c.tags) ? (c.tags as string[]) : [],
      source_pages: Array.isArray(c.source_pages) ? (c.source_pages as number[]) : null,
      applies_to: Array.isArray(c.applies_to) ? (c.applies_to as string[]) : [],
    } as PreviewChunk
  })
  const tasks = (Array.isArray(draft.tasks) ? draft.tasks : []).map((raw) => {
    const t = (raw ?? {}) as Record<string, unknown>
    return {
      ...t,
      instructions_text: (t.instructions_override ?? t.instructions_text ?? null) as string | null,
    } as unknown as PreviewTask
  })
  return { ok: true, chunks, tasks, pdfPages: pdfPages ?? null }
}

/** Parse an existing manual to an editable preview (no commit). */
export async function previewManualParse(homeId: string, manualId: string): Promise<PreviewManualResult> {
  const res = await parseManualAndWait(manualId, { homeId, mode: "preview" })
  if (!res.ok) return { ok: false, error: res.error }
  const snap = await getDoc(docRef(`homes/${homeId}/manuals/${manualId}`))
  const data = snap.data()
  const draft = data?.previewDraft as { chunks?: unknown[]; tasks?: unknown[] } | undefined
  if (!draft) return { ok: false, error: "Preview produced no draft" }
  // Written by the worker at the pdf_fetched stage — the same snapshot, so no
  // extra read.
  const pdfPages = (data?.parse as { pdfPages?: number | null } | undefined)?.pdfPages ?? null
  return draftToPreview(draft, pdfPages)
}

export type CommitReviewedResult =
  | { ok: true; chunks: number; tasks: number }
  | { ok: false; error: string }

const commitManualDraftCallable = callable<
  { homeId: string; manualId: string; chunks: PreviewChunk[]; tasks: PreviewTask[] },
  { ok: boolean; chunks?: number; tasks?: number; error?: string }
>("commitManualDraft")

/** Commit the user-reviewed (possibly edited) chunks + tasks. commitDraft seeds
 *  recurring instances server-side — no follow-up generateTaskInstances needed. */
export async function commitReviewedDraft(
  homeId: string,
  manualId: string,
  chunks: PreviewChunk[],
  tasks: PreviewTask[]
): Promise<CommitReviewedResult> {
  try {
    const data = await commitManualDraftCallable({ homeId, manualId, chunks, tasks })
    if (!data?.ok) return { ok: false, error: data?.error ?? "Save failed" }
    return { ok: true, chunks: data.chunks ?? 0, tasks: data.tasks ?? 0 }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" }
  }
}
