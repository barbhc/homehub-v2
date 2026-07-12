import { useState } from "react"
import {
  createManualDocument,
  deleteManualDocument,
  ingestReference,
  getChunksByItem,
  getManualsByItem,
  parseManual,
  previewManual,
  saveManualParse,
} from "@/modules/knowledge"
// updateManualLabel intentionally omitted here — ManualSection calls it directly
import {
  getTaskTemplatesWithSchedulesByItem,
  generateTaskInstances,
} from "@/modules/care"
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
        const parseRes = await parseManual(manualId)
        if (parseRes.ok && homeId) {
          const [chunksRes, tasksRes] = await Promise.all([
            getChunksByItem(homeId, itemId),
            getTaskTemplatesWithSchedulesByItem(homeId, itemId),
          ])
          if (chunksRes.data) setChunks(chunksRes.data)
          if (tasksRes.data) setTasks(tasksRes.data)
          setManuals((prev) =>
            prev.map((m) => (m.manual_id === manualId ? { ...m, parsed_at: new Date().toISOString() } : m)),
          )
        } else if (!parseRes.ok) {
          setParseError(`Manual saved, but parsing failed: ${parseRes.error}`)
        }
      }
      setAddManualOpen(false)
    } finally {
      setAddLoading(false)
      setParsePhase(false)
    }
  }

  // The parse-manual edge call can outlive the gateway's connection window on
  // big PDFs: the function finishes + commits server-side, but the client sees a
  // dropped connection. Rather than report a false failure, poll for the parse
  // to land (parsed_at advances) before giving up.
  const fetchManuals = async (): Promise<ManualDocument[]> =>
    (await getManualsByItem(homeId, itemId)).data ?? []
  const currentParsedAt = async (manualId: string): Promise<string | null> =>
    (await fetchManuals()).find((m) => m.manual_id === manualId)?.parsed_at ?? null
  // Poll up to ~3 min: the parse runs as a background task, so it can take well
  // over a minute. Resolves as soon as parsed_at advances.
  const waitForParse = async (manualId: string, before: string | null): Promise<ManualDocument[] | null> => {
    for (let i = 0; i < 36; i++) {
      await new Promise((r) => setTimeout(r, 5000))
      const ms = await fetchManuals()
      const m = ms.find((x) => x.manual_id === manualId)
      if (m?.parsed_at && m.parsed_at !== before) return ms
    }
    return null
  }

  const handleParseExistingManual = async (manualId: string) => {
    setParsedManualId(manualId)
    setParsingManualId(manualId)
    setParseError(null)
    const result = await previewManual(manualId)
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
    const before = await currentParsedAt(manualId)
    const result = await parseManual(manualId, { rescan: true })

    const refresh = async (manuals?: ManualDocument[]) => {
      const [taskRes, manualRes] = await Promise.all([
        getTaskTemplatesWithSchedulesByItem(homeId, itemId),
        manuals ? Promise.resolve({ data: manuals }) : getManualsByItem(homeId, itemId),
      ])
      if (taskRes.data) setTasks(taskRes.data)
      if (manualRes.data) setManuals(() => manualRes.data!)
    }

    // The parse now runs in the background (processing:true) and the request
    // returns immediately — OR the connection dropped (transient). Either way the
    // result lands via parsed_at; poll for it before reporting anything.
    const pollThenRefresh = async () => {
      const landed = await waitForParse(manualId, before)
      if (landed) {
        setParsingManualId(null)
        await refresh(landed)
        return
      }
      // The platform's isolate wall clock (~150s) can reap the background task
      // between extraction and commit; the extraction survives as a stored
      // draft. One follow-up call lands in the fast commit-only path (no
      // Claude call) and finishes in seconds — retry once, then poll again.
      const second = await parseManual(manualId, { rescan: true })
      if (second.ok || second.transient) {
        const landed2 = await waitForParse(manualId, before)
        setParsingManualId(null)
        if (landed2) {
          await refresh(landed2)
          return
        }
      } else {
        setParsingManualId(null)
      }
      setParseError("Rescan is still finishing in the background — refresh in a minute to see the result.")
    }
    if (result.ok) {
      if (!result.processing) {
        setParsingManualId(null)
        await refresh()
        return
      }
      await pollThenRefresh()
      return
    }
    if (result.transient) {
      await pollThenRefresh()
      return
    }
    setParsingManualId(null)
    setParseError(`Rescan failed: ${result.error}`)
  }

  const handleFillGaps = async (manualId: string) => {
    if (!homeId || !itemId) return
    setParsingManualId(manualId)
    setParseError(null)
    const before = await currentParsedAt(manualId)
    const result = await parseManual(manualId, { rescan: true, fillGaps: true })

    const refresh = async (manuals?: ManualDocument[]) => {
      const [chunkRes, taskRes, manualRes] = await Promise.all([
        getChunksByItem(homeId, itemId),
        getTaskTemplatesWithSchedulesByItem(homeId, itemId),
        manuals ? Promise.resolve({ data: manuals }) : getManualsByItem(homeId, itemId),
      ])
      if (chunkRes.data) setChunks(chunkRes.data)
      if (taskRes.data) setTasks(taskRes.data)
      if (manualRes.data) setManuals(() => manualRes.data!)
    }

    const pollThenRefresh = async () => {
      const landed = await waitForParse(manualId, before)
      if (landed) {
        setParsingManualId(null)
        await refresh(landed)
        return
      }
      // Same isolate-wall-clock recovery as handleRescanManual: the stored
      // draft commits via the fast commit-only path on a single retry.
      const second = await parseManual(manualId, { rescan: true, fillGaps: true })
      if (second.ok || second.transient) {
        const landed2 = await waitForParse(manualId, before)
        setParsingManualId(null)
        if (landed2) {
          await refresh(landed2)
          return
        }
      } else {
        setParsingManualId(null)
      }
      setParseError("Fill gaps is still finishing in the background — refresh in a minute to see the result.")
    }
    if (result.ok) {
      if (!result.processing) {
        setParsingManualId(null)
        await refresh()
        return
      }
      await pollThenRefresh()
      return
    }
    if (result.transient) {
      await pollThenRefresh()
      return
    }
    setParsingManualId(null)
    setParseError(`Fill gaps failed: ${result.error}`)
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
    setSaving(true)
    const res = await saveManualParse(parsedManualId, chunksToSave, tasksToSave)
    setSaving(false)
    if (!res.ok) return `Save failed: ${res.error}`
    const templateIds = res.taskTemplateIds ?? []
    if (homeId && templateIds.length > 0) {
      await Promise.all(
        templateIds.map((tid) =>
          generateTaskInstances({ task_template_id: tid, home_id: homeId })
        )
      )
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
