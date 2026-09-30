import { useState } from "react"
import {
  createManualDocument,
  deleteManualDocument,
  ingestReference,
  getChunksByItem,
  parseManualAndWait,
} from "@/modules/knowledge"
import { startParse } from "@/modules/knowledge/services/parseManualService"
import { markParsePending, clearParsePending } from "@/lib/parsePickup"
import { isAwaitingReview } from "@/lib/manualReviewState"
import { requestReview } from "@/lib/reviewRequest"
// updateManualLabel intentionally omitted here — ManualSection calls it directly
import { getTaskTemplatesWithSchedulesByItem } from "@/modules/care"
import type { TaskTemplateWithSchedule } from "@/modules/care"
import { uploadManualPdfWithUrl } from "@/modules/inventory/services/storageService"
import { resolveStorageUrl } from "@/integrations/firebase"
import useSWR from "swr"
import type { ManualSourceChoice } from "@/components/smart-add/ManualStep"
import type { KnowledgeChunk, ManualDocument } from "@/integrations/types"
// Belt for the worker's humanized errors: parse failures recorded BEFORE the
// worker started storing friendly copy still carry raw API JSON, and raw
// transport text can reach here from the callable layer. Never render it.
import { isRateLimitMessage, retryAfterFromMessage } from "../../shared/quota/refusal"
import { humanizeParseError, isParseInFlightMessage } from "../../shared/parse/parseErrors"

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

/**
 * Which door opened the add-manual dialog, which is which of ManualStep's panels
 * it opens on: "upload" leads (HH-109, HH-115), "url" is "Paste a link
 * instead", "search" is "Find it for me" (HH-89).
 */
export type AddManualMode = "upload" | "url" | "search"

interface UseManualManagementParams {
  itemId: string
  homeId: string
  userId: string | undefined
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

/**
 * The item page's manual actions.
 *
 * HH-161: this hook no longer keeps a copy of the item's manuals. It used to
 * patch the page's one-time list by hand — prepend the new record, stamp
 * `parsed_at` on save, filter on delete — and every patch was a guess about a
 * document the worker was changing underneath it: a manual added here showed
 * `parse_stage: null` for as long as the page stayed open. The page now
 * listens to the documents themselves (useItemManuals), so an add, a read and
 * a delete arrive on their own, once, however often the same PDF is re-added.
 *
 * Every read this page starts is a PREVIEW that ends in the item's hand-off
 * card (ParsePickupCard) — the add, "Read the manual", and "Read again", which
 * used to commit in place with no review. ONE review element per page, by
 * construction (HH-120): this hook no longer opens a review of its own.
 */
export function useManualManagement({
  itemId,
  homeId,
  userId,
  setChunks,
  setTasks,
}: UseManualManagementParams) {
  // --- Add Manual dialog state ---
  const [addManualOpen, setAddManualOpen] = useState(false)
  const [addMode, setAddMode] = useState<AddManualMode>("upload")
  const [addRole, setAddRole] = useState<"primary" | "reference">("primary")
  const [titleInput, setTitleInput] = useState("")
  const [labelInput, setLabelInput] = useState("")
  const [addError, setAddError] = useState<string | null>(null)
  const [addLoading, setAddLoading] = useState(false)
  const [parsePhase, setParsePhase] = useState(false)

  // --- Read state ---
  const [parseError, setParseError] = useState<string | null>(null)
  /** A throttled read waiting to retry itself. Separate from parseError because
   *  it is calm news, not a failure, and must not render in the error style. */
  const [parseNotice, setParseNotice] = useState<string | null>(null)
  /** What a fill-gaps run actually changed. It is the last path that writes
   *  tasks without a review step — an explicit user action, so a confirmation
   *  is the right answer rather than a review sheet, but silence is not: "it
   *  just added new tasks to the list" was a bug report. */
  const [parseReceipt, setParseReceipt] = useState<string | null>(null)
  /** A manual whose read this page is starting (or whose fill-gaps run it is
   *  waiting on) — the live stage takes over once the worker writes one. */
  const [parsingManualId, setParsingManualId] = useState<string | null>(null)
  /** Reads this page started, by manual: the run's requestId and when. The
   *  enqueue writes "queued" before it answers, but the page's listener can
   *  hear of it a moment AFTER the answer — see `startedReadPending`. */
  const [startedReads, setStartedReads] = useState<ReadonlyMap<string, { requestId: string; at: number }>>(new Map())
  const [deletingManualId, setDeletingManualId] = useState<string | null>(null)

  // --- Handlers ---

  // HH-89: the entry lanes preset the mode — a drop-zone that opens on the
  // Link tab would be a small lie about what was just tapped.
  //
  // HH-159: this is the ONLY way the dialog opens, from every door on the page.
  // Radix calls the dialog's onOpenChange for a close, never for an open we
  // make ourselves, so a reset placed there never ran: a reopened dialog showed
  // the last attempt's error and kept a leftover "Reference doc" role, which
  // turned the Upkeep door into an upload that generates no upkeep. Upload is
  // the default because it is the lane that leads (HH-109).
  const handleOpenAddManual = (mode: AddManualMode = "upload") => {
    setAddManualOpen(true)
    setAddError(null)
    setParseError(null)
    setAddMode(mode)
    setAddRole("primary")
    setLabelInput("")
    setTitleInput("")
  }

  /**
   * A throttled request is not a failed one, and must never say it is.
   *
   * HH-145: a tester saw "The scan failed" printed directly above her manual
   * being read perfectly well. A second request inside the same 60-second
   * window had been throttled, and the client had no way to tell that refusal
   * apart from a real error, so it used the loudest wording it had.
   *
   * Returns true when it handled the refusal — the caller stops there. The wait
   * comes from the server's own sentence, and the retry is automatic and single:
   * one silent second attempt is the difference between a pause and a dead end,
   * while a retry loop would be the runaway the limiter exists to stop.
   */
  const handledAsRateLimit = (message: string | undefined, retry: () => void): boolean => {
    if (!isRateLimitMessage(message)) return false
    const wait = retryAfterFromMessage(message)
    setParseError(null)
    setParseNotice(`One moment — starting to read in ${wait} second${wait === 1 ? "" : "s"}.`)
    window.setTimeout(() => { setParseNotice(null); retry() }, wait * 1000)
    return true
  }

  /**
   * Start a PREVIEW read that ends in the item's review. Never awaited past the
   * enqueue: the worker reads server-side, the page watches the live document,
   * and the hand-off card offers (or, if the page watched it finish, opens) the
   * review. `failure` is how a refusal is worded for the door that asked.
   *
   * One read per manual at a time is the SERVER's rule (Package C): a second
   * ask is refused with "already being read". That is not a failure here — the
   * read the user wanted is running, and the page is already showing it, so
   * this FOLLOWS it and says nothing. It used to report "Manual saved, but the
   * scan could not start" beside the read that was plainly going.
   */
  const startReadForReview = async (manualId: string, failure: string): Promise<void> => {
    setParsingManualId(manualId)
    setParseError(null)
    const started = await startParse(manualId, { homeId, mode: "preview" })
    if (started.ok) {
      setStartedReads((prev) => new Map(prev).set(manualId, { requestId: started.requestId, at: Date.now() }))
    }
    setParsingManualId(null)
    if (started.ok) return
    if (started.inFlight || isParseInFlightMessage(started.error)) return
    if (handledAsRateLimit(started.error, () => void startReadForReview(manualId, failure))) return
    clearParsePending(manualId)
    setParseError(`${failure}: ${humanizeParseError(started.error)}`)
  }

  /**
   * HH-159: the source comes from the ARGUMENT — what ManualStep hands over
   * when "Scan the manual" is tapped. It used to be read from state the dialog
   * had set a microtask earlier, which this function's closure (the previous
   * render's) had never seen: every door failed its first attempt with "Enter a
   * URL" or "Select a PDF file", and a retry after swapping the file uploaded
   * the PREVIOUS one. The wizard has always worked this way (SmartAddItem's
   * handleManualConfirm), which is why only the item page broke.
   */
  const handleAddManual = async (choice: ManualSourceChoice) => {
    if (!itemId) return
    setAddError(null)
    setAddLoading(true)
    try {
      // 1. Create the manual_document record (URL or upload)
      let sourceRef: string
      let sourceType: "url" | "upload"
      let title: string
      let contentHash: string | null = null

      if (choice.type === "url") {
        const url = choice.url.trim()
        if (!url) { setAddError("Enter a URL"); return }
        sourceRef = url
        sourceType = "url"
        title = titleInput.trim() || "Manual from URL"
      } else {
        const file = choice.file
        const uploadRes = await uploadManualPdfWithUrl(homeId, itemId, file, userId ?? null)
        if (uploadRes.error) { setAddError(uploadRes.error.message); return }
        sourceRef = uploadRes.data.path
        // HH-154: the same PDF again is recognised by its bytes. Handing the
        // hash over saves createManualDocument reading it back from Storage.
        contentHash = uploadRes.data.contentHash
        sourceType = "upload"
        title = titleInput.trim() || file.name
      }

      // From here the manual is being handed to the reader. Said BEFORE the
      // record is written: the page's live list shows the record the moment it
      // exists, and until the read is queued it has no stage — so the page
      // reads this flag as "starting to read" rather than "no manual" (HH-161).
      setParsePhase(true)
      const res = await createManualDocument(homeId, {
        item_unit_id: itemId,
        title,
        source_type: sourceType,
        source_ref: sourceRef,
        role: addRole,
        label: labelInput.trim() || null,
        content_hash: contentHash,
      })
      if (res.error) { setAddError(res.error.message); return }

      // No local copy to update: the page's live manuals receive this record
      // (or, for a PDF this item already has, keep the one row it had).
      setTitleInput("")

      const manual = res.data
      const manualId = manual.manual_id

      // 2. Branch on role: reference docs get light ingestion, primary gets full parse
      if (addRole === "reference") {
        const ingestRes = await ingestReference(homeId, manualId)
        if (ingestRes.error) {
          setParseError(`Document saved, but it could not be read: ${humanizeParseError(ingestRes.error.message)}`)
        } else {
          // Refresh chunks (reference chunks now in DB)
          const chunksRes = await getChunksByItem(homeId, itemId)
          if (chunksRes.data) setChunks(chunksRes.data)
        }
      } else if (isAwaitingReview(manual)) {
        // The same PDF again, already read and waiting to be saved (HH-154
        // returns the record this item has). Reading it again would throw that
        // review away and bill a second read of identical bytes, so the review
        // it has is the answer — opened, the way Settings' Review does.
        requestReview(manualId)
      } else {
        // PREVIEW, then review — not commit. This path used to parse in
        // "commit" mode, so tasks appeared on the item with no review step at
        // all: "I thought there was supposed to be an option to go through
        // tasks... these items just appeared." Commit happens when the user
        // saves the review.
        //
        // Started, never awaited. Awaiting it held the dialog's spinner for the
        // couple of minutes the worker takes and then threw a review sheet over
        // the page. The page reports the read in its Upkeep card and the pill,
        // and hands over the review when it lands, so the user is free the
        // moment the manual is attached.
        markParsePending(manualId)
        await startReadForReview(manualId, "Manual saved, but the read could not start")
      }
      setAddManualOpen(false)
    } finally {
      setAddLoading(false)
      setParsePhase(false)
    }
  }

  // The worker owns parse state in Firestore; parseManualAndWait resolves only
  // on done/error (watched via onSnapshot).
  const refreshItem = async (opts?: { chunks?: boolean }) => {
    const [chunkRes, taskRes] = await Promise.all([
      opts?.chunks ? getChunksByItem(homeId, itemId) : Promise.resolve({ data: null }),
      getTaskTemplatesWithSchedulesByItem(homeId, itemId),
    ])
    if (chunkRes.data) setChunks(chunkRes.data)
    if (taskRes.data) setTasks(taskRes.data)
  }

  /**
   * "Read the manual" on one never read, and "Read again" on one already read
   * (it was "Rescan", and it COMMITTED in place with no review — the item
   * page's last path that did, after Settings' rescan was moved to preview).
   * Both are a preview read that ends in the hand-off card's review, so
   * nothing changes on the item until the owner saves.
   */
  const handleReadManual = async (manualId: string) => {
    if (!homeId) return
    await startReadForReview(manualId, "The read could not start")
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
    } else if (!handledAsRateLimit(result.error, () => void handleFillGaps(manualId))) {
      setParseError(`Fill gaps failed: ${humanizeParseError(result.error)}`)
    }
  }

  /**
   * Is a read this page started still on its way to the live list? True from
   * the enqueue's answer until the manual's document carries that run (by
   * requestId) — at most a minute, so a run replaced from another device can
   * never pin the page to "starting". Without it, a manual added here showed,
   * for that moment, as a record with no stage: "No upkeep yet — add the
   * manual", right after the dialog closed.
   */
  const startedReadPending = (manuals: ManualDocument[], now: number = Date.now()): boolean =>
    manuals.some((m) => {
      const run = startedReads.get(m.manual_id)
      return !!run && now - run.at < 60_000 && m.parse_request_id !== run.requestId
    })

  const handleDeleteManual = async (manualId: string) => {
    setDeletingManualId(manualId)
    const result = await deleteManualDocument(homeId, manualId)
    setDeletingManualId(null)
    // Nothing to remove locally on success — the live list drops it.
    if (result.error) setParseError(`Could not delete manual: ${result.error.message}`)
  }

  return {
    // Add Manual dialog state
    addManualOpen,
    setAddManualOpen,
    addMode,
    addRole,
    setAddRole,
    titleInput,
    setTitleInput,
    labelInput,
    setLabelInput,
    addError,
    setAddError,
    addLoading,
    parsePhase,

    // Read state
    parseError,
    parseNotice,
    parseReceipt,
    setParseReceipt,
    setParseError,
    parsingManualId,
    deletingManualId,
    startedReadPending,

    // Handlers
    handleOpenAddManual,
    handleAddManual,
    handleReadManual,
    handleFillGaps,
    handleDeleteManual,
  }
}
