import { useState } from "react"
import {
  createManualDocument,
  deleteManualDocument,
  ingestReference,
  getChunksByItem,
  getManualsByItem,
  parseManualAndWait,
  previewManualParse,
  commitReviewedDraft,
} from "@/modules/knowledge"
import { startParse } from "@/modules/knowledge/services/parseManualService"
import { markParsePending, clearParsePending } from "@/lib/parsePickup"
// updateManualLabel intentionally omitted here — ManualSection calls it directly
import { getTaskTemplatesWithSchedulesByItem } from "@/modules/care"
import type { TaskTemplateWithSchedule } from "@/modules/care"
import { uploadManualPdfWithUrl } from "@/modules/inventory/services/storageService"
import { resolveStorageUrl } from "@/integrations/firebase"
import useSWR from "swr"
import type { PreviewChunk, PreviewResult, PreviewTask } from "@/modules/knowledge/types/previewTypes"
import { recordParseFeedback } from "@/modules/knowledge/services/parseFeedbackService"
import type { ReviewEditSummary } from "@/components/manuals/TaskReviewFeedback"
import type { KnowledgeChunk, ManualDocument } from "@/integrations/types"
// Belt for the worker's humanized errors: parse failures recorded BEFORE the
// worker started storing friendly copy still carry raw API JSON, and raw
// transport text can reach here from the callable layer. Never render it.
import { humanizeParseError } from "../../shared/parse/parseErrors"

/**
 * True when a manual points at a file lost in the v1→v2 migration. v1 stored
 * manual PDFs in Supabase Storage; that project is deleted, so any supabase.co
 * URL a manual still carries is dead (ERR_NAME_NOT_RESOLVED — the exact Safari
 * error dogfooding hit). v2 stores everything in Firebase Storage and never
 * mints a supabase.co URL, so that host is an unambiguous "the file is gone"
 * signal. The parsed chunks survived the migration, so chat/care keep working —
 * only the original PDF is unrecoverable, and the UI offers a re-upload.
 */
export function isDeadLegacyManualUrl(sourceType: string, sourceRef: string): boolean {
  if (sourceType !== "url" || !sourceRef) return false
  try {
    const host = new URL(sourceRef).hostname.toLowerCase()
    return host === "supabase.co" || host.endsWith(".supabase.co")
  } catch {
    return false
  }
}

/**
 * Resolve a manual's viewable URL. Dead v1 Supabase uploads resolve to null so
 * the UI shows an "unavailable" state instead of a link that dead-ends in the
 * browser. External URLs pass through; uploads resolve their Storage path to a
 * token-bearing download URL (the no-public-read rules mean a tokenless URL is
 * no longer fetchable by the PDF viewer/proxy).
 */
export async function resolveManualUrl(sourceType: string, sourceRef: string): Promise<string | null> {
  if (isDeadLegacyManualUrl(sourceType, sourceRef)) return null
  if (sourceType === "url") return sourceRef
  if (sourceType === "upload" && sourceRef) return resolveStorageUrl(sourceRef)
  return null
}

/** Resolved viewable URL per manual_id (null while resolving / on failure). */
export function useManualUrls(manuals: ManualDocument[]): Record<string, string | null> {
  const key = manuals.length > 0 ? ["manual-urls", manuals.map((m) => `${m.manual_id}:${m.source_ref}`).join("|")] : null
  const { data } = useSWR(
    key,
    async () => {
      const entries = await Promise.all(
        manuals.map(async (m) => [m.manual_id, await resolveManualUrl(m.source_type, m.source_ref).catch(() => null)] as const),
      )
      return Object.fromEntries(entries) as Record<string, string | null>
    },
    { revalidateOnFocus: false, revalidateIfStale: false, revalidateOnReconnect: false },
  )
  return data ?? {}
}

interface UseManualManagementParams {
  itemId: string
  homeId: string
  userId: string | undefined
  setManuals: (fn: (prev: ManualDocument[]) => ManualDocument[]) => void
  setChunks: (chunks: KnowledgeChunk[]) => void
  setTasks: (tasks: TaskTemplateWithSchedule[]) => void
}

/** Plain-language summary of what a commit-mode run changed. */
function describeCommit(action: string, r: { inserted?: number; duplicatesSkipped?: number; tasks: number }): string {
  const added = r.inserted ?? 0
  const skipped = r.duplicatesSkipped ?? 0
  const parts: string[] = []
  parts.push(added === 0 ? "no new tasks" : `${added} new task${added === 1 ? "" : "s"}`)
  if (skipped > 0) parts.push(`${skipped} skipped as duplicate${skipped === 1 ? "" : "s"}`)
  return `${action} finished — ${parts.join(", ")}.`
}

export function useManualManagement({
  itemId,
  homeId,
  userId,
  setManuals,
  setChunks,
  setTasks,
}: UseManualManagementParams) {
  // --- Add Manual dialog state ---
  const [addManualOpen, setAddManualOpen] = useState(false)
  const [addMode, setAddMode] = useState<"url" | "upload">("url")
  const [addRole, setAddRole] = useState<"primary" | "reference">("primary")
  const [urlInput, setUrlInput] = useState("")
  const [titleInput, setTitleInput] = useState("")
  const [labelInput, setLabelInput] = useState("")
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [addError, setAddError] = useState<string | null>(null)
  const [addLoading, setAddLoading] = useState(false)
  const [parsePhase, setParsePhase] = useState(false)

  // --- Parse / review state ---
  const [parseError, setParseError] = useState<string | null>(null)
  /** What a rescan/fill-gaps actually changed. These are the last two paths
   *  that write tasks without a review step — they are explicit user actions,
   *  so a confirmation is the right answer rather than a review sheet, but
   *  silence is not: "it just added new tasks to the list" was a bug report. */
  const [parseReceipt, setParseReceipt] = useState<string | null>(null)
  const [parsingManualId, setParsingManualId] = useState<string | null>(null)
  const [deletingManualId, setDeletingManualId] = useState<string | null>(null)
  const [parsedManualId, setParsedManualId] = useState<string | null>(null)
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // --- Handlers ---

  // HH-89: the entry lanes preset the mode — a drop-zone that opens on the
  // Link tab would be a small lie about what was just tapped.
  const handleOpenAddManual = (mode: "url" | "upload" = "url") => {
    setAddManualOpen(true)
    setAddError(null)
    setAddMode(mode)
    setAddRole("primary")
    setLabelInput("")
    setTitleInput("")
    setUrlInput("")
  }

  const handleAddManual = async () => {
    if (!itemId) return
    setAddError(null)
    setAddLoading(true)
    try {
      // 1. Create the manual_document record (URL or upload)
      let sourceRef: string
      let sourceType: "url" | "upload"
      let title: string

      if (addMode === "url") {
        const url = urlInput.trim()
        if (!url) { setAddError("Enter a URL"); return }
        sourceRef = url
        sourceType = "url"
        title = titleInput.trim() || "Manual from URL"
      } else {
        const file = uploadFile
        if (!file) { setAddError("Select a PDF file"); return }
        const uploadRes = await uploadManualPdfWithUrl(homeId, itemId, file, userId ?? null)
        if (uploadRes.error) { setAddError(uploadRes.error.message); return }
        sourceRef = uploadRes.data!.path
        sourceType = "upload"
        title = titleInput.trim() || file.name
      }

      const res = await createManualDocument(homeId, {
        item_unit_id: itemId,
        title,
        source_type: sourceType,
        source_ref: sourceRef,
        role: addRole,
        label: labelInput.trim() || null,
      })
      if (res.error) { setAddError(res.error.message); return }

      setManuals((prev) => [res.data!, ...prev])
      setUrlInput("")
      setTitleInput("")
      setUploadFile(null)
      setParsePhase(true)

      const manualId = res.data!.manual_id

      // 2. Branch on role: reference docs get light ingestion, primary gets full parse
      if (addRole === "reference") {
        const ingestRes = await ingestReference(homeId, manualId)
        if (ingestRes.error) {
          setParseError(`Document saved, but ingestion failed: ${humanizeParseError(ingestRes.error.message)}`)
        } else {
          // Refresh chunks (reference chunks now in DB)
          const chunksRes = await getChunksByItem(homeId, itemId)
          if (chunksRes.data) setChunks(chunksRes.data)
          setManuals((prev) =>
            prev.map((m) => (m.manual_id === manualId ? { ...m, parsed_at: new Date().toISOString() } : m)),
          )
        }
      } else {
        // PREVIEW, then review — not commit. This path used to parse in
        // "commit" mode, so tasks appeared on the item with no review step at
        // all: "I thought there was supposed to be an option to go through
        // tasks... these items just appeared." Commit happens when the user
        // saves the review sheet.
        //
        // Started, never awaited. Awaiting it held the dialog's spinner for the
        // couple of minutes the worker takes and then threw a review sheet over
        // the page — on the one screen where the user is most likely adding a
        // manual to an appliance they already own. The page itself now reports
        // the read (LiveParseBand) and asks for the review when it lands, so
        // the user is free the moment the manual is attached.
        setParsedManualId(manualId)
        markParsePending(manualId)
        const started = await startParse(manualId, { homeId, mode: "preview" })
        if (!started.ok) {
          clearParsePending(manualId)
          setParseError(`Manual saved, but parsing could not start: ${humanizeParseError(started.error)}`)
        }
      }
      setAddManualOpen(false)
    } finally {
      setAddLoading(false)
      setParsePhase(false)
    }
  }

  // The worker owns parse state in Firestore; parseManualAndWait resolves only
  // on done/error (watched via onSnapshot), so the old dropped-connection polling
  // + retry machinery is gone.
  const refreshItem = async (opts?: { chunks?: boolean }) => {
    const [chunkRes, taskRes, manualRes] = await Promise.all([
      opts?.chunks ? getChunksByItem(homeId, itemId) : Promise.resolve({ data: null }),
      getTaskTemplatesWithSchedulesByItem(homeId, itemId),
      getManualsByItem(homeId, itemId),
    ])
    if (chunkRes.data) setChunks(chunkRes.data)
    if (taskRes.data) setTasks(taskRes.data)
    if (manualRes.data) setManuals(() => manualRes.data!)
  }

  const handleParseExistingManual = async (manualId: string) => {
    if (!homeId) return
    setParsedManualId(manualId)
    setParsingManualId(manualId)
    setParseError(null)
    const result = await previewManualParse(homeId, manualId)
    setParsingManualId(null)
    if (!result.ok) {
      setParseError(`Parsing failed: ${humanizeParseError(result.error)}`)
      return
    }
    setPreviewResult(result)
    setReviewOpen(true)
  }

  const handleRescanManual = async (manualId: string) => {
    if (!homeId || !itemId) return
    setParsingManualId(manualId)
    setParseError(null)
    // commit mode reconciles in place (fuzzy match; no delete/insert churn) — this
    // IS the rescan behavior. The worker seeds instances; no follow-up needed.
    const result = await parseManualAndWait(manualId, { homeId, mode: "commit" })
    setParsingManualId(null)
    if (result.ok) {
      await refreshItem()
      setParseReceipt(describeCommit("Rescan", result))
    } else setParseError(`Rescan failed: ${humanizeParseError(result.error)}`)
  }

  const handleFillGaps = async (manualId: string) => {
    if (!homeId || !itemId) return
    setParsingManualId(manualId)
    setParseError(null)
    const result = await parseManualAndWait(manualId, { homeId, mode: "fill_gaps" })
    setParsingManualId(null)
    if (result.ok) {
      await refreshItem({ chunks: true })
      setParseReceipt(describeCommit("Fill gaps", result))
    } else setParseError(`Fill gaps failed: ${humanizeParseError(result.error)}`)
  }

  const handleDeleteManual = async (manualId: string) => {
    setDeletingManualId(manualId)
    const result = await deleteManualDocument(homeId, manualId)
    setDeletingManualId(null)
    if (result.error) {
      setParseError(`Could not delete manual: ${result.error.message}`)
    } else {
      setManuals((prev) => prev.filter((m) => m.manual_id !== manualId))
    }
  }

  const handleSave = async (
    tasksToSave: PreviewTask[],
    chunksToSave: PreviewChunk[],
    edits?: ReviewEditSummary
  ): Promise<string | null> => {
    if (!parsedManualId) return "No manual selected — please try parsing again."
    if (!homeId) return "No home context — please reload and try again."
    setSaving(true)
    // commitReviewedDraft re-normalizes + commits server-side, and commitDraft
    // already seeds recurring instances — no client-side generateTaskInstances.
    const res = await commitReviewedDraft(homeId, parsedManualId, chunksToSave, tasksToSave)
    setSaving(false)
    if (!res.ok) return `Save failed: ${res.error}`
    // Corrections made during a fresh-parse review are parser feedback too —
    // recorded on save, not only when the user files a complaint.
    if (edits && edits.total > 0) {
      void recordParseFeedback(homeId, {
        manualId: parsedManualId,
        itemUnitId: itemId ?? null,
        source: "review_save",
        reasons: [],
        note: "",
        edits,
        rescanRequested: false,
      })
    }
    const savedManualId = parsedManualId
    setReviewOpen(false)
    setPreviewResult(null)
    setParsedManualId(null)
    if (homeId && itemId) {
      const [chunksRes, tasksRes] = await Promise.all([
        getChunksByItem(homeId, itemId),
        getTaskTemplatesWithSchedulesByItem(homeId, itemId),
      ])
      if (chunksRes.data) setChunks(chunksRes.data)
      if (tasksRes.data) setTasks(tasksRes.data)
    }
    setManuals((prev) =>
      prev.map((m) =>
        m.manual_id === savedManualId
          ? { ...m, parsed_at: new Date().toISOString() }
          : m
      )
    )
    return null
  }

  return {
    // Add Manual dialog state
    addManualOpen,
    setAddManualOpen,
    addMode,
    setAddMode,
    addRole,
    setAddRole,
    urlInput,
    setUrlInput,
    titleInput,
    setTitleInput,
    labelInput,
    setLabelInput,
    uploadFile,
    setUploadFile,
    addError,
    setAddError,
    addLoading,
    parsePhase,

    // Parse / review state
    parseError,
    parseReceipt,
    setParseReceipt,
    setParseError,
    parsingManualId,
    setParsingManualId,
    deletingManualId,
    parsedManualId,
    setParsedManualId,
    previewResult,
    setPreviewResult,
    reviewOpen,
    setReviewOpen,
    saving,

    // Handlers
    handleOpenAddManual,
    handleAddManual,
    handleParseExistingManual,
    handleRescanManual,
    handleFillGaps,
    handleDeleteManual,
    handleSave,
  }
}
