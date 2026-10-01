/**
 * useItemManuals — the item page's ONE live account of its manuals (HH-161).
 *
 * Driven through a fake onSnapshot, one document write at a time, the way the
 * worker writes them: created → queued → claude_call (with its page count) →
 * done with a draft → saved. The page used to read the list once and patch it
 * by hand, so a manual added in-session stayed at stage null for as long as
 * the page was open; here every write arrives.
 *
 * `watched` is HH-48's "did this page see the read run?", keyed by requestId:
 * a run that finishes without ever being seen running is not watched.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { Timestamp } from "firebase/firestore"

type Doc = Record<string, unknown>
type Next = (snap: unknown) => void

const fake = vi.hoisted(() => ({
  next: null as null | ((snap: unknown) => void),
  error: null as null | ((e: Error) => void),
  unsubscribed: 0,
  queries: [] as unknown[],
}))

vi.mock("firebase/firestore", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  collection: (_db: unknown, path: string) => ({ path }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  query: (...parts: unknown[]) => { fake.queries.push(parts); return parts },
  onSnapshot: (_q: unknown, _opts: unknown, next: Next, error: (e: Error) => void) => {
    fake.next = next
    fake.error = error
    return () => { fake.unsubscribed += 1 }
  },
}))

import { useItemManuals, observeRuns } from "./useItemManuals"
import { itemManualState, isAwaitingReview } from "@/lib/manualReviewState"

const NOW = Timestamp.fromDate(new Date("2026-09-30T10:00:00Z"))

/** One manual document as the worker leaves it, and a snapshot of it. */
function snap(docs: Array<{ id: string; data: Doc }>, fromCache = false) {
  return {
    metadata: { fromCache, hasPendingWrites: false },
    docs: docs.map(({ id, data }) => ({ id, data: () => data, get: (f: string) => data[f] })),
  }
}
const base: Doc = {
  itemUnitId: "item-1", title: "Bosch owner's manual", label: null, sourceType: "upload",
  sourceRef: "homes/h1/manuals/uid/item-1/manual_1.pdf", role: "primary", version: null, language: "en",
  parsedAt: null, parse: null, draft: null, createdAt: NOW, updatedAt: NOW, deletedAt: null,
}
const withParse = (parse: Doc, extra: Doc = {}): Doc => ({ ...base, ...extra, parse: { stageAt: NOW, mode: "preview", ...parse } })

const push = (s: unknown) => act(() => { fake.next!(s) })

beforeEach(() => {
  fake.next = null
  fake.error = null
  fake.unsubscribed = 0
  fake.queries = []
})

describe("useItemManuals — every write the worker makes arrives", () => {
  it("steps created → queued → claude_call → done → saved, and the page's state follows each one", () => {
    const { result } = renderHook(() => useItemManuals("h1", "item-1"))
    expect(result.current.status).toBe("loading")

    // The fromCache trap: an EMPTY answer from the cache is not "no manuals".
    push(snap([], true))
    expect(result.current.status).toBe("loading")

    // Created on this page (HH-161's case): no stage yet.
    push(snap([{ id: "m1", data: base }]))
    expect(result.current.status).toBe("ready")
    expect(result.current.manuals.map((m) => m.parse_stage)).toEqual([null])
    expect(itemManualState(result.current.manuals)).toEqual({ hasManual: false, reading: null, awaitingReview: false })

    push(snap([{ id: "m1", data: withParse({ stage: "queued", requestId: "req-1" }) }]))
    expect(itemManualState(result.current.manuals).reading).toEqual({ stage: "queued", pages: null })

    // The page count, once this read has counted it — the worker's number.
    push(snap([{ id: "m1", data: withParse({ stage: "claude_call", requestId: "req-1", pdfPages: 42 }) }]))
    expect(itemManualState(result.current.manuals).reading).toEqual({ stage: "claude_call", pages: 42 })
    expect(result.current.watched.has("m1")).toBe(true)

    // Done, with a draft: read and waiting for its review — and watched.
    push(snap([{ id: "m1", data: withParse({ stage: "done", requestId: "req-1", pdfPages: 42, summary: { tasks: 12 } }, { previewDraft: { tasks: [], chunks: [] } }) }]))
    const done = result.current.manuals[0]
    expect(isAwaitingReview(done)).toBe(true)
    expect(done.parse_tasks).toBe(12)
    expect(itemManualState(result.current.manuals)).toEqual({ hasManual: false, reading: null, awaitingReview: true })
    expect(result.current.watched.has("m1")).toBe(true)

    // Saved: the review's commit stamps parsedAt and clears the draft.
    push(snap([{ id: "m1", data: withParse({ stage: "done", requestId: "req-1", pdfPages: 42 }, { parsedAt: NOW, previewDraft: null }) }]))
    expect(itemManualState(result.current.manuals)).toEqual({ hasManual: true, reading: null, awaitingReview: false })
  })

  it("a SECOND run's requestId, never seen running, is not a read this page watched", () => {
    const { result } = renderHook(() => useItemManuals("h1", "item-1"))
    push(snap([{ id: "m1", data: withParse({ stage: "claude_call", requestId: "req-1" }) }]))
    expect(result.current.watched.has("m1")).toBe(true)

    // Another device replaced the run and it finished between two snapshots:
    // the page never saw req-2 running, so its review waits for a tap.
    push(snap([{ id: "m1", data: withParse({ stage: "done", requestId: "req-2" }, { previewDraft: { tasks: [], chunks: [] } }) }]))
    expect(isAwaitingReview(result.current.manuals[0])).toBe(true)
    expect(result.current.watched.has("m1")).toBe(false)
  })

  it("a manual that was already done on arrival is not watched", () => {
    const { result } = renderHook(() => useItemManuals("h1", "item-1"))
    push(snap([{ id: "m1", data: withParse({ stage: "done", requestId: "req-1" }, { previewDraft: { tasks: [], chunks: [] } }) }]))
    expect(result.current.watched.size).toBe(0)
  })

  it("one row per document — re-adding the same PDF cannot list it twice — deleted ones out, newest first", () => {
    const { result } = renderHook(() => useItemManuals("h1", "item-1"))
    const older = { ...base, createdAt: Timestamp.fromDate(new Date("2026-09-01T00:00:00Z")) }
    push(snap([
      { id: "m-old", data: older },
      { id: "m-new", data: base },
      { id: "m-gone", data: { ...base, deletedAt: NOW } },
    ]))
    expect(result.current.manuals.map((m) => m.manual_id)).toEqual(["m-new", "m-old"])
  })

  it("listens on the item's own manuals, and stops listening when the page leaves", () => {
    const { unmount } = renderHook(() => useItemManuals("h1", "item-1"))
    expect(JSON.stringify(fake.queries[0])).toContain('"field":"itemUnitId","op":"==","value":"item-1"')
    expect(JSON.stringify(fake.queries[0])).toContain("homes/h1/manuals")
    unmount()
    expect(fake.unsubscribed).toBe(1)
  })

  it("a listener that fails says so — never a silent empty list", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {})
    const { result } = renderHook(() => useItemManuals("h1", "item-1"))
    act(() => { fake.error!(new Error("permission-denied")) })
    expect(result.current.status).toBe("failed")
    expect(result.current.error).toBe("permission-denied")
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })
})

describe("observeRuns — the watched rule on its own", () => {
  const m = (id: string, stage: string | null, requestId: string | null) =>
    ({ manual_id: id, parse_stage: stage, parse_request_id: requestId }) as never

  it("remembers the run it saw active, and only that run counts", () => {
    const seen = new Map<string, string>()
    expect([...observeRuns(seen, [m("a", "started", "r1")])]).toEqual(["a"])
    expect([...observeRuns(seen, [m("a", "done", "r1")])]).toEqual(["a"])
    expect([...observeRuns(seen, [m("a", "done", "r2")])]).toEqual([])
  })
})
