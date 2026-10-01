/**
 * Failure-path coverage for adding and reading a manual.
 *
 * Two distinct failures with different consequences, and the hook must keep
 * them distinct:
 *
 *   · the DOCUMENT could not be created  -> nothing was saved; addError, and
 *     no read is started
 *   · the document saved but the READ could not start -> the manual DOES exist
 *     (the page's live list shows it), but the user has to be told the tasks
 *     are not coming ("Manual saved, but the read could not start: …")
 *
 * Reporting the second as a clean success is the bad outcome: the manual sits
 * there looking read and the item silently never gets its tasks.
 *
 * And one refusal that is NOT a failure (HH-161, Package C): the server allows
 * one read per manual at a time, so asking again while one runs is refused as
 * "already being read" — the read the user wanted IS running, and the hook
 * follows it instead of saying it "could not start".
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"

const createManualDocument = vi.fn()
const getChunksByItem = vi.fn()
const ingestReference = vi.fn()
const startParse = vi.fn()
const uploadManualPdfWithUrl = vi.fn()

vi.mock("@/modules/knowledge", () => ({
  createManualDocument: (...a: unknown[]) => createManualDocument(...a),
  deleteManualDocument: vi.fn(),
  ingestReference: (...a: unknown[]) => ingestReference(...a),
  getChunksByItem: (...a: unknown[]) => getChunksByItem(...a),
  parseManualAndWait: vi.fn(),
}))
vi.mock("@/modules/knowledge/services/parseManualService", () => ({
  startParse: (...a: unknown[]) => startParse(...a),
  ACTIVE_PARSE_STAGES: ["awaiting_capacity", "queued", "started", "pdf_fetched", "claude_call", "claude_responded", "committing"],
}))
vi.mock("@/modules/care", () => ({ getTaskTemplatesWithSchedulesByItem: vi.fn() }))
vi.mock("@/modules/inventory/services/storageService", () => ({
  uploadManualPdfWithUrl: (...a: unknown[]) => uploadManualPdfWithUrl(...a),
}))
vi.mock("@/integrations/firebase", () => ({ resolveStorageUrl: vi.fn(), callable: () => vi.fn() }))
vi.mock("swr", () => ({ default: () => ({ data: undefined, error: undefined, mutate: vi.fn() }) }))

import { useManualManagement } from "./useManualManagement"
import { onReviewRequest } from "@/lib/reviewRequest"

const setChunks = vi.fn()
const setTasks = vi.fn()

const mount = () =>
  renderHook(() =>
    useManualManagement({
      itemId: "item-1", homeId: "home-1", userId: "uid-1",
      setChunks, setTasks,
    }),
  )

const saved = (over: Record<string, unknown> = {}) => ({
  data: {
    manual_id: "man-1", title: "M", source_type: "url", source_ref: "https://x/m.pdf",
    parse_stage: null, parsed_at: null, has_preview_draft: false, parse_mode: null, ...over,
  },
  error: null,
})

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  getChunksByItem.mockResolvedValue({ data: [], error: null })
})

describe("useManualManagement — add/read failures are surfaced, not swallowed", () => {
  it("document create fails → addError set, and no read is started", async () => {
    createManualDocument.mockResolvedValue({ data: null, error: { message: "permission-denied" } })

    const { result } = mount()
    // HH-159: the source is the argument — what ManualStep handed over — not
    // state set a render earlier.
    await act(async () => { await result.current.handleAddManual({ type: "url", url: "https://example.com/m.pdf" }) })

    await waitFor(() => expect(result.current.addError).toMatch(/permission-denied/i))
    expect(startParse).not.toHaveBeenCalled()
  })

  it("empty URL → addError, and no network call is attempted", async () => {
    const { result } = mount()
    await act(async () => { await result.current.handleAddManual({ type: "url", url: "   " }) })

    await waitFor(() => expect(result.current.addError).toMatch(/enter a url/i))
    expect(createManualDocument).not.toHaveBeenCalled()
  })

  it("document saves but the READ cannot start → parseError says saved-but-not-read", async () => {
    createManualDocument.mockResolvedValue(saved())
    startParse.mockResolvedValue({ ok: false, error: "worker timed out" })

    const { result } = mount()
    await act(async () => { await result.current.handleAddManual({ type: "url", url: "https://example.com/m.pdf" }) })

    await waitFor(() => expect(result.current.parseError).toBeTruthy())
    // The distinction that matters: saved, but not READ. ("Reading" is the
    // word the app uses for this everywhere since HH-161.)
    expect(result.current.parseError).toMatch(/saved/i)
    expect(result.current.parseError).toMatch(/read/i)
    expect(startParse).toHaveBeenCalledWith("man-1", { homeId: "home-1", mode: "preview" })
  })

  it("the upload's content hash goes to createManualDocument, so the same PDF again is one manual (HH-154)", async () => {
    uploadManualPdfWithUrl.mockResolvedValue({ data: { path: "homes/home-1/manuals/uid-1/item-1/manual_1.pdf", url: "https://x", contentHash: "abc123" }, error: null })
    createManualDocument.mockResolvedValue(saved({ source_type: "upload" }))
    startParse.mockResolvedValue({ ok: true, requestId: "req-1" })

    const { result } = mount()
    const file = new File(["%PDF-1.4"], "manual.pdf", { type: "application/pdf" })
    await act(async () => { await result.current.handleAddManual({ type: "upload", file }) })

    expect(createManualDocument).toHaveBeenCalledWith("home-1", expect.objectContaining({ content_hash: "abc123" }))
  })
})

describe("a re-upload while that manual is being read FOLLOWS the read (HH-161)", () => {
  it("'already being read' is not a failure: no 'could not start', and the dialog closes", async () => {
    createManualDocument.mockResolvedValue(saved({ parse_stage: "claude_call" }))
    startParse.mockResolvedValue({
      ok: false,
      error: "This manual is already being read — it'll be ready in a few minutes.",
      inFlight: { requestId: "req-running", mode: "preview" },
    })

    const { result } = mount()
    act(() => { result.current.handleOpenAddManual("upload") })
    await act(async () => { await result.current.handleAddManual({ type: "url", url: "https://example.com/m.pdf" }) })

    expect(result.current.parseError).toBeNull()
    expect(result.current.addManualOpen).toBe(false)
  })

  it("the refusal's sentence alone (details lost in transport) is followed the same way", async () => {
    createManualDocument.mockResolvedValue(saved())
    startParse.mockResolvedValue({ ok: false, error: "This manual is already being read — it'll be ready in a few minutes." })

    const { result } = mount()
    await act(async () => { await result.current.handleAddManual({ type: "url", url: "https://example.com/m.pdf" }) })
    expect(result.current.parseError).toBeNull()
  })

  it("the same PDF, already read and waiting for review: no second read — its review is opened", async () => {
    createManualDocument.mockResolvedValue(saved({ parse_stage: "done", has_preview_draft: true, parse_mode: "preview" }))
    const heard: string[] = []
    const stop = onReviewRequest((id) => heard.push(id))

    const { result } = mount()
    await act(async () => { await result.current.handleAddManual({ type: "url", url: "https://example.com/m.pdf" }) })
    stop()

    expect(startParse).not.toHaveBeenCalled()
    expect(heard).toEqual(["man-1"])
  })
})

describe("Read again — the item page's own rescan — is a PREVIEW that ends in the review", () => {
  it("starts a preview read, never a commit", async () => {
    startParse.mockResolvedValue({ ok: true, requestId: "req-2" })
    const { result } = mount()
    await act(async () => { await result.current.handleReadManual("man-1") })
    expect(startParse).toHaveBeenCalledWith("man-1", { homeId: "home-1", mode: "preview" })
    expect(result.current.parseError).toBeNull()
  })

  it("a refusal that is a real failure is said", async () => {
    startParse.mockResolvedValue({ ok: false, error: "worker timed out" })
    const { result } = mount()
    await act(async () => { await result.current.handleReadManual("man-1") })
    expect(result.current.parseError).toMatch(/^The read could not start/)
  })
})
