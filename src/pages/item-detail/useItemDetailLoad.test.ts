/**
 * HH-160: "The connection dropped before your item arrived" sat over an item
 * page that had loaded fine.
 *
 * The page kept one error string for everything. Its 10 s stall timer wrote
 * into it and dropped the skeleton; a response arriving after that never
 * cleared it; and a refetch (Try again, a task added) swapped the loaded page
 * for the skeleton and re-armed the timer. These pin the four states apart:
 * slow is not failed, a late success always wins, a failure is the dead end,
 * and a refetch keeps the item on screen.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import type { ItemUnit } from "@/integrations/types"

type ItemResult = { data: ItemUnit | null; error: { message: string } | null }

const getItemUnit = vi.fn<(homeId: string, itemId: string) => Promise<ItemResult>>()
const list = () => Promise.resolve({ data: [], error: null })
const track = vi.fn()

// vi.mock factories are hoisted above these consts, so every reference is
// wrapped in an arrow and only read when the hook calls it.
vi.mock("@/modules/items", () => ({ getItemUnit: (h: string, i: string) => getItemUnit(h, i) }))
vi.mock("@/modules/care", () => ({ getTaskTemplatesWithSchedulesByItem: () => list() }))
vi.mock("@/modules/knowledge", () => ({
  getChunksByItem: () => list(),
  getManualsByItem: () => list(),
  getFaqsByItem: () => list(),
}))
vi.mock("@/modules/home", () => ({ getRooms: () => list() }))
vi.mock("@/hooks/useManualManagement", () => ({ resolveManualUrl: () => Promise.resolve(null) }))
vi.mock("@/lib/analytics", () => ({ track: (...a: unknown[]) => track(...a) }))

import { LOAD_STALL_MS, useItemDetailLoad, type ManualsLoad } from "./useItemDetailLoad"

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const itemFor = (id: string) => ({ item_unit_id: id, display_name: "Bosch dishwasher" }) as unknown as ItemUnit
const found = (id: string): ItemResult => ({ data: itemFor(id), error: null })

beforeEach(() => {
  vi.useFakeTimers()
  getItemUnit.mockReset()
  track.mockReset()
})
afterEach(() => {
  vi.useRealTimers()
})

describe("useItemDetailLoad — the item page's own load (HH-160)", () => {
  it("still in flight after the stall → slow: skeleton kept, no error, no dead end", async () => {
    getItemUnit.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useItemDetailLoad("home-1", "item-1"))
    expect(result.current.status).toBe("loading")
    expect(result.current.showSkeleton).toBe(true)

    act(() => { vi.advanceTimersByTime(LOAD_STALL_MS - 1) })
    expect(result.current.status).toBe("loading")

    act(() => { vi.advanceTimersByTime(2) }) // 10,001 ms in all
    expect(result.current.status).toBe("slow")
    expect(result.current.loadError).toBeNull()
    expect(result.current.showSkeleton).toBe(true)
    expect(result.current.showDeadEnd).toBe(false)
  })

  it("resolves → ready, with no error to show", async () => {
    getItemUnit.mockResolvedValue(found("item-1"))
    const { result } = renderHook(() => useItemDetailLoad("home-1", "item-1"))
    await act(async () => {})

    expect(result.current.status).toBe("ready")
    expect(result.current.loadError).toBeNull()
    expect(result.current.item?.item_unit_id).toBe("item-1")
    expect(result.current.showSkeleton).toBe(false)
    expect(track).toHaveBeenCalledWith("item_content_viewed", expect.objectContaining({ item_id: "item-1" }))

    // The stall timer is gone with the request: nothing flips it later.
    act(() => { vi.advanceTimersByTime(LOAD_STALL_MS * 3) })
    expect(result.current.status).toBe("ready")
  })

  it("a success that lands AFTER the stall still wins — the old banner case", async () => {
    const req = deferred<ItemResult>()
    getItemUnit.mockReturnValue(req.promise)
    const { result } = renderHook(() => useItemDetailLoad("home-1", "item-1"))

    act(() => { vi.advanceTimersByTime(LOAD_STALL_MS + 1) })
    expect(result.current.status).toBe("slow")

    await act(async () => { req.resolve(found("item-1")) })
    expect(result.current.status).toBe("ready")
    expect(result.current.loadError).toBeNull()
    expect(result.current.showSkeleton).toBe(false)
    expect(result.current.item?.item_unit_id).toBe("item-1")
  })

  it("rejects → failed: the dead end, with the reason", async () => {
    getItemUnit.mockRejectedValue(new Error("QUIC connection dropped"))
    const { result } = renderHook(() => useItemDetailLoad("home-1", "item-1"))
    await act(async () => {})

    expect(result.current.status).toBe("failed")
    expect(result.current.loadError).toBe("QUIC connection dropped")
    expect(result.current.showDeadEnd).toBe(true)
    expect(result.current.showSkeleton).toBe(false)

    act(() => { vi.advanceTimersByTime(LOAD_STALL_MS * 2) })
    expect(result.current.status).toBe("failed")
  })

  it("an item read that REPORTS an error is a failed load, never 'Item not found'", async () => {
    // The services resolve { data: null, error } instead of rejecting. Taking
    // that as "no such item" told people a dropped connection had deleted it.
    getItemUnit.mockResolvedValue({ data: null, error: { message: "client is offline" } })
    const { result } = renderHook(() => useItemDetailLoad("home-1", "item-1"))
    await act(async () => {})

    expect(result.current.status).toBe("failed")
    expect(result.current.loadError).toBe("client is offline")
    expect(result.current.showDeadEnd).toBe(true)
  })

  it("an item that really is gone is ready-and-null — the not-found state, not the dead end", async () => {
    getItemUnit.mockResolvedValue({ data: null, error: null })
    const { result } = renderHook(() => useItemDetailLoad("home-1", "item-1"))
    await act(async () => {})

    expect(result.current.status).toBe("ready")
    expect(result.current.item).toBeNull()
    expect(result.current.showDeadEnd).toBe(false)
    expect(result.current.showSkeleton).toBe(false)
  })

  it("a refetch while the item is on screen never brings the skeleton back", async () => {
    getItemUnit.mockResolvedValueOnce(found("item-1"))
    const { result } = renderHook(() => useItemDetailLoad("home-1", "item-1"))
    await act(async () => {})
    expect(result.current.status).toBe("ready")

    const refetch = deferred<ItemResult>()
    getItemUnit.mockReturnValueOnce(refetch.promise)
    act(() => { result.current.reload() })
    expect(result.current.status).toBe("loading")
    expect(result.current.showSkeleton).toBe(false)
    expect(result.current.item?.item_unit_id).toBe("item-1")

    // Even a stalled refetch leaves the page up.
    act(() => { vi.advanceTimersByTime(LOAD_STALL_MS + 1) })
    expect(result.current.status).toBe("slow")
    expect(result.current.showSkeleton).toBe(false)

    await act(async () => { refetch.resolve(found("item-1")) })
    expect(result.current.status).toBe("ready")
    expect(getItemUnit).toHaveBeenCalledTimes(2)
  })

  it("a refetch that fails keeps the page — the dead end is only for an item never shown", async () => {
    getItemUnit.mockResolvedValueOnce(found("item-1"))
    const { result } = renderHook(() => useItemDetailLoad("home-1", "item-1"))
    await act(async () => {})

    getItemUnit.mockRejectedValueOnce(new Error("offline"))
    await act(async () => { result.current.reload() })
    expect(result.current.status).toBe("failed")
    expect(result.current.loadError).toBe("offline")
    expect(result.current.showDeadEnd).toBe(false)
    expect(result.current.showSkeleton).toBe(false)
    expect(result.current.item?.item_unit_id).toBe("item-1")
  })

  it("moving to another item shows the skeleton, never the previous item under the new id", async () => {
    getItemUnit.mockResolvedValueOnce(found("item-1"))
    const { result, rerender } = renderHook(({ id }) => useItemDetailLoad("home-1", id), {
      initialProps: { id: "item-1" },
    })
    await act(async () => {})
    expect(result.current.status).toBe("ready")

    getItemUnit.mockReturnValueOnce(new Promise(() => {}))
    rerender({ id: "item-2" })
    expect(result.current.status).toBe("loading")
    expect(result.current.showSkeleton).toBe(true)
  })

  it("an older request's answer never speaks for a newer one", async () => {
    const first = deferred<ItemResult>()
    const second = deferred<ItemResult>()
    getItemUnit.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { result } = renderHook(() => useItemDetailLoad("home-1", "item-1"))

    act(() => { vi.advanceTimersByTime(LOAD_STALL_MS + 1) })
    expect(result.current.status).toBe("slow")
    act(() => { result.current.reload() }) // "Try again" while slow
    expect(result.current.status).toBe("loading")

    // The abandoned request fails late — that must not fail the retry.
    await act(async () => { first.reject(new Error("stale")) })
    expect(result.current.status).toBe("loading")
    expect(result.current.loadError).toBeNull()

    await act(async () => { second.resolve(found("item-1")) })
    expect(result.current.status).toBe("ready")
  })

  // HH-161: the manuals are a live listener now, not one of the reads. The page
  // is not ready until it has answered — otherwise it would draw "No upkeep
  // yet — add the manual" for a moment over a manual being read.
  it("reads back but the live manuals not yet → still loading, skeleton kept; their answer makes it ready", async () => {
    getItemUnit.mockResolvedValue(found("item-1"))
    const { result, rerender } = renderHook(
      ({ manuals }: { manuals: ManualsLoad }) => useItemDetailLoad("home-1", "item-1", manuals),
      { initialProps: { manuals: { status: "loading", count: 0 } as ManualsLoad } },
    )
    await act(async () => {})
    expect(result.current.status).toBe("loading")
    expect(result.current.showSkeleton).toBe(true)
    expect(track).not.toHaveBeenCalled()

    rerender({ manuals: { status: "ready", count: 1 } })
    await act(async () => {})
    expect(result.current.status).toBe("ready")
    expect(result.current.showSkeleton).toBe(false)
    expect(track).toHaveBeenCalledWith("item_content_viewed", expect.objectContaining({ item_id: "item-1", manual_count: 1 }))
  })

  it("live manuals still silent after the stall → slow, not failed (HH-160 holds for them too)", async () => {
    getItemUnit.mockResolvedValue(found("item-1"))
    const { result } = renderHook(() => useItemDetailLoad("home-1", "item-1", { status: "loading", count: 0 }))
    await act(async () => {})
    act(() => { vi.advanceTimersByTime(LOAD_STALL_MS + 1) })
    expect(result.current.status).toBe("slow")
    expect(result.current.showDeadEnd).toBe(false)
  })

  it("a manuals listener that FAILED does not hold the item hostage — the page shows, and says so itself", async () => {
    getItemUnit.mockResolvedValue(found("item-1"))
    const { result } = renderHook(() => useItemDetailLoad("home-1", "item-1", { status: "failed", count: 0 }))
    await act(async () => {})
    expect(result.current.status).toBe("ready")
  })

  it("waits for a home before it reads anything", () => {
    const { result } = renderHook(() => useItemDetailLoad(undefined, "item-1"))
    expect(result.current.status).toBe("loading")
    expect(result.current.showSkeleton).toBe(true)
    expect(getItemUnit).not.toHaveBeenCalled()
  })
})
