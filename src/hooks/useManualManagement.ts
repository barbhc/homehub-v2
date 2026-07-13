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
// updateManualLabel intentionally omitted here — ManualSection calls it directly
import { getTaskTemplatesWithSchedulesByItem } from "@/modules/care"
import type { TaskTemplateWithSchedule } from "@/modules/care"
import { uploadManualPdfWithUrl } from "@/modules/inventory/services/storageService"
import { storageDownloadUrl } from "@/integrations/firebase"
import type { PreviewChunk, PreviewResult, PreviewTask } from "@/modules/knowledge/types/previewTypes"
import type { KnowledgeChunk, ManualDocument } from "@/integrations/types"

export function getManualUrl(sourceType: string, sourceRef: string): string | null {
  if (sourceType === "url") return sourceRef
  if (sourceType === "upload" && sourceRef) return storageDownloadUrl(sourceRef)
  return null
}

interface UseManualManagementParams {
  itemId: string
  homeId: string
  userId: string | undefined
  setManuals: (fn: (prev: ManualDocument[]) => ManualDocument[]) => void
  setChunks: (chunks: KnowledgeChunk[]) => void
  setTasks: (tasks: TaskTemplateWithSchedule[]) => void
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
  const [parsingManualId, setParsingManualId] = useState<string | null>(null)
  const [deletingManualId, setDeletingManualId] = useState<string | null>(null)
  const [parsedManualId, setParsedManualId] = useState<string | null>(null)
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // --- Handlers ---

  const handleOpenAddManual = () => {
    setAddManualOpen(true)
    setAddError(null)
    setAddMode("url")
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
        const uploadRes = await uploadManualPdfWithUrl(itemId, file, userId ?? null)
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
          setParseError(`Document saved, but ingestion failed: ${ingestRes.error.message}`)
        } else {
          // Refresh chunks (reference chunks now in DB)
          const chunksRes = await getChunksByItem(homeId, itemId)
          if (chunksRes.data) setChunks(chunksRes.data)
          setManuals((prev) =>
            prev.map((m) => (m.manual_id === manualId ? { ...m, parsed_at: new Date().toISOString() } : m)),
          )
        }
      } else {
        const parseRes = await parseManualAndWait(manualId, { homeId, mode: "commit" })
        if (parseRes.ok) {
          const [chunksRes, tasksRes] = await Promise.all([
            getChunksByItem(homeId, itemId),
            getTaskTemplatesWithSchedulesByItem(homeId, itemId),
          ])
          if (chunksRes.data) setChunks(chunksRes.data)
          if (tasksRes.data) setTasks(tasksRes.data)
          setManuals((prev) =>
            prev.map((m) => (m.manual_id === manualId ? { ...m, parsed_at: new Date().toISOString() } : m)),
          )
        } else {
          setParseError(`Manual saved, but parsing failed: ${parseRes.error}`)
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
      setParseError(`Parsing failed: ${result.error}`)
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
    if (result.ok) await refreshItem()
    else setParseError(`Rescan failed: ${result.error}`)
  }

  const handleFillGaps = async (manualId: string) => {
    if (!homeId || !itemId) return
    setParsingManualId(manualId)
    setParseError(null)
    const result = await parseManualAndWait(manualId, { homeId, mode: "fill_gaps" })
    setParsingManualId(null)
    if (result.ok) await refreshItem({ chunks: true })
    else setParseError(`Fill gaps failed: ${result.error}`)
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
    chunksToSave: PreviewChunk[]
  ): Promise<string | null> => {
    if (!parsedManualId) return "No manual selected — please try parsing again."
    if (!homeId) return "No home context — please reload and try again."
    setSaving(true)
    // commitReviewedDraft re-normalizes + commits server-side, and commitDraft
    // already seeds recurring instances — no client-side generateTaskInstances.
    const res = await commitReviewedDraft(homeId, parsedManualId, chunksToSave, tasksToSave)
    setSaving(false)
    if (!res.ok) return `Save failed: ${res.error}`
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
