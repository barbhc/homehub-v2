/**
 * Failure-path coverage for adding and parsing a manual.
 *
 * Two distinct failures with different consequences, and the hook must keep
 * them distinct:
 *
 *   · the DOCUMENT could not be created  -> nothing was saved; addError, and
 *     the manual must not appear in the list
 *   · the document saved but PARSING failed -> the manual DOES exist and must
 *     stay in the list, but the user has to be told the tasks/chunks are not
 *     coming ("Manual saved, but parsing failed: …")
 *
 * Reporting the second as a clean success is the bad outcome: the manual sits
 * there looking parsed and the item silently never gets its tasks.
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"

const createManualDocument = vi.fn()
const previewManualParse = vi.fn()
const getChunksByItem = vi.fn()
const getManualsByItem = vi.fn()
const ingestReference = vi.fn()

vi.mock("@/modules/knowledge", () => ({
  createManualDocument: (...a: unknown[]) => createManualDocument(...a),
  deleteManualDocument: vi.fn(),
  ingestReference: (...a: unknown[]) => ingestReference(...a),
  getChunksByItem: (...a: unknown[]) => getChunksByItem(...a),
  getManualsByItem: (...a: unknown[]) => getManualsByItem(...a),
  parseManualAndWait: vi.fn(),
  previewManualParse: (...a: unknown[]) => previewManualParse(...a),
  commitReviewedDraft: vi.fn(),
}))
vi.mock("@/modules/care", () => ({ getTaskTemplatesWithSchedulesByItem: vi.fn() }))
vi.mock("@/modules/inventory/services/storageService", () => ({ uploadManualPdfWithUrl: vi.fn() }))
// `callable` joined this module's surface when the item-page add-manual path
// stopped awaiting the parse and started enqueueing it instead.
vi.mock("@/integrations/firebase", () => ({ resolveStorageUrl: vi.fn(), callable: () => vi.fn() }))
vi.mock("@/modules/knowledge/services/parseFeedbackService", () => ({ recordParseFeedback: vi.fn() }))
vi.mock("swr", () => ({ default: () => ({ data: undefined, error: undefined, mutate: vi.fn() }) }))

import { useManualManagement } from "./useManualManagement"

const setManuals = vi.fn()
const setChunks = vi.fn()
const setTasks = vi.fn()

const mount = () =>
  renderHook(() =>
    useManualManagement({
      itemId: "item-1", homeId: "home-1", userId: "uid-1",
      setManuals, setChunks, setTasks,
    }),
  )

beforeEach(() => {
  vi.clearAllMocks()
  getChunksByItem.mockResolvedValue({ data: [], error: null })
  getManualsByItem.mockResolvedValue({ data: [], error: null })
})

describe("useManualManagement — add/parse failures are surfaced, not swallowed", () => {
  it("document create fails → addError set and nothing added to the list", async () => {
    createManualDocument.mockResolvedValue({ data: null, error: { message: "permission-denied" } })

    const { result } = mount()
    act(() => { result.current.setAddMode("url"); result.current.setUrlInput("https://example.com/m.pdf") })
    await act(async () => { await result.current.handleAddManual() })

    await waitFor(() => expect(result.current.addError).toMatch(/permission-denied/i))
    expect(setManuals).not.toHaveBeenCalled()
  })

  it("empty URL → addError, and no network call is attempted", async () => {
    const { result } = mount()
    act(() => { result.current.setAddMode("url"); result.current.setUrlInput("   ") })
    await act(async () => { await result.current.handleAddManual() })

    await waitFor(() => expect(result.current.addError).toMatch(/enter a url/i))
    expect(createManualDocument).not.toHaveBeenCalled()
  })

  it("document saves but PARSE fails → parseError set, and the manual is still added", async () => {
    createManualDocument.mockResolvedValue({
      data: { manual_id: "man-1", title: "M", source_type: "url", source_ref: "https://x/m.pdf" },
      error: null,
    })
    previewManualParse.mockResolvedValue({ data: null, error: "worker timed out" })

    const { result } = mount()
    act(() => { result.current.setAddMode("url"); result.current.setUrlInput("https://example.com/m.pdf") })
    await act(async () => { await result.current.handleAddManual() })

    await waitFor(() => expect(result.current.parseError).toBeTruthy())
    // The distinction that matters: saved, but not SCANNED. (Round 12 retired
    // "parse" from every user-facing string; the guarantee is the distinction,
    // not the word.)
    expect(result.current.parseError).toMatch(/saved/i)
    expect(result.current.parseError).toMatch(/scan/i)
    expect(setManuals).toHaveBeenCalled()
  })
})
