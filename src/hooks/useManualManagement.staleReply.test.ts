/**
 * The item page's manual actions re-read the item when they finish — and land
 * that re-read only on the item they were for (H4).
 *
 * "Fill gaps" waits on a whole parse (minutes) and then re-reads the item's
 * tasks and chunks; a reference document re-reads its chunks after ingest. The
 * page stays mounted when it moves to another item, so either re-read
 * answering after that move used to hand item A's tasks and chunks to item B's
 * page.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"

const svc = vi.hoisted(() => ({
  parseManualAndWait: vi.fn(),
  getChunksByItem: vi.fn(),
  getTasks: vi.fn(),
  createManualDocument: vi.fn(),
  ingestReference: vi.fn(),
}))
vi.mock("@/modules/knowledge", () => ({
  createManualDocument: (...a: unknown[]) => svc.createManualDocument(...a),
  deleteManualDocument: vi.fn(),
  ingestReference: (...a: unknown[]) => svc.ingestReference(...a),
  getChunksByItem: (...a: unknown[]) => svc.getChunksByItem(...a),
  parseManualAndWait: (...a: unknown[]) => svc.parseManualAndWait(...a),
}))
vi.mock("@/modules/knowledge/services/parseManualService", () => ({
  startParse: vi.fn(),
  ACTIVE_PARSE_STAGES: ["awaiting_capacity", "queued", "started", "pdf_fetched", "claude_call", "claude_responded", "committing"],
}))
vi.mock("@/modules/care", () => ({ getTaskTemplatesWithSchedulesByItem: (...a: unknown[]) => svc.getTasks(...a) }))
vi.mock("@/modules/inventory/services/storageService", () => ({ uploadManualPdfWithUrl: vi.fn() }))
vi.mock("@/integrations/firebase", () => ({ resolveStorageUrl: vi.fn(), callable: () => vi.fn() }))
vi.mock("swr", () => ({ default: () => ({ data: undefined, error: undefined, mutate: vi.fn() }) }))

const { useManualManagement } = await import("./useManualManagement")

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

const setChunks = vi.fn()
const setTasks = vi.fn()
const mount = () =>
  renderHook(({ itemId }: { itemId: string }) =>
    useManualManagement({ itemId, homeId: "home-1", userId: "uid-1", setChunks, setTasks }), {
    initialProps: { itemId: "item-a" },
  })

beforeEach(() => {
  vi.clearAllMocks()
  svc.getChunksByItem.mockResolvedValue({ data: [{ chunk_id: "c-a" }], error: null })
  svc.getTasks.mockResolvedValue({ data: [{ task_template_id: "t-a" }], error: null })
})

describe("useManualManagement — a re-read for the last item lands nowhere", () => {
  it("Fill gaps on item A, finishing after the page moved to item B, hands B nothing of A's", async () => {
    const parse = deferred<{ ok: true; tasks: number; inserted: number }>()
    svc.parseManualAndWait.mockReturnValue(parse.promise)
    const { result, rerender } = mount()
    act(() => { void result.current.handleFillGaps("man-a") })

    rerender({ itemId: "item-b" })
    await act(async () => { parse.resolve({ ok: true, tasks: 2, inserted: 2 }) })

    expect(setTasks).not.toHaveBeenCalled()
    expect(setChunks).not.toHaveBeenCalled()
    // Its spinner still clears: a dropped re-read never leaves one behind.
    expect(result.current.parsingManualId).toBeNull()
  })

  it("on the same item, Fill gaps still re-reads it (control)", async () => {
    svc.parseManualAndWait.mockResolvedValue({ ok: true, tasks: 2, inserted: 2 })
    const { result } = mount()
    await act(async () => { await result.current.handleFillGaps("man-a") })
    expect(setTasks).toHaveBeenCalledWith([{ task_template_id: "t-a" }])
    expect(setChunks).toHaveBeenCalledWith([{ chunk_id: "c-a" }])
  })

  it("a reference document's chunk re-read for item A, after the move to B, hands B nothing", async () => {
    svc.createManualDocument.mockResolvedValue({
      data: { manual_id: "ref-a", title: "R", source_type: "url", source_ref: "https://x/r.pdf", parse_stage: null, parsed_at: null },
      error: null,
    })
    const ingest = deferred<{ data: unknown; error: null }>()
    svc.ingestReference.mockReturnValue(ingest.promise)
    const { result, rerender } = mount()
    act(() => { result.current.setAddRole("reference") })
    act(() => { void result.current.handleAddManual({ type: "url", url: "https://x/r.pdf" }) })
    await act(async () => {})

    rerender({ itemId: "item-b" })
    await act(async () => { ingest.resolve({ data: {}, error: null }) })

    expect(setChunks).not.toHaveBeenCalled()
  })
})
