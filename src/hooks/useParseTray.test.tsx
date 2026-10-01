/**
 * useParseTray — the live "being read / ready to review" tray.
 *
 * Losing the home used to clear the tray with setState inside the effect; H5
 * (the whole-app lint) clears it in the render that loses the home. Pinned: a
 * snapshot fills the tray; no home empties it at once and unsubscribes; a home
 * coming back subscribes again.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { act, renderHook } from "@testing-library/react"

const fs = vi.hoisted(() => ({
  onNext: null as null | ((snap: { docs: unknown[] }) => void),
  unsub: vi.fn(),
  subscribed: [] as string[],
}))
vi.mock("@/integrations/firebase", () => ({ db: {}, callable: () => vi.fn() }))
vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, path: string) => path,
  where: () => null,
  query: (path: string) => path,
  onSnapshot: (path: string, next: (snap: { docs: unknown[] }) => void) => {
    fs.subscribed.push(path)
    fs.onNext = next
    return fs.unsub
  },
}))

const { useParseTray } = await import("./useParseTray")

/** A manual doc as the listener delivers it. */
const manual = (id: string, fields: Record<string, unknown>) => ({ id, get: (k: string) => fields[k] })
const READING = manual("m1", { itemUnitId: "i1", title: "Dryer manual", parse: { stage: "claude_call", pdfPages: 40 } })
const READY = manual("m2", { itemUnitId: "i2", title: "Washer manual", parse: { stage: "done" }, previewDraft: { tasks: [] } })

describe("useParseTray", () => {
  beforeEach(() => {
    fs.onNext = null
    fs.unsub.mockClear()
    fs.subscribed = []
  })

  it("fills from a snapshot, empties at once without a home, and subscribes again when one returns", () => {
    const { result, rerender } = renderHook(({ homeId }: { homeId: string | null }) => useParseTray(homeId), {
      initialProps: { homeId: "home-1" as string | null },
    })
    expect(fs.subscribed).toEqual(["homes/home-1/manuals"])
    act(() => fs.onNext!({ docs: [READING, READY] }))
    expect(result.current.parsing.map((e) => e.manualId)).toEqual(["m1"])
    expect(result.current.ready.map((e) => e.manualId)).toEqual(["m2"])

    rerender({ homeId: null })
    expect(result.current).toEqual({ parsing: [], ready: [] })
    expect(fs.unsub).toHaveBeenCalledTimes(1)

    rerender({ homeId: "home-2" })
    expect(fs.subscribed).toEqual(["homes/home-1/manuals", "homes/home-2/manuals"])
  })
})
